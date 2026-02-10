/**
 * Сервис для расчёта стоимости доставки на основе тарифов
 */

import prisma from "@/lib/db/prisma";
import type {
  ShippingTariffSearchParams,
  ShippingCostResult,
  ShippingTariff,
} from "@/lib/types/shipping";

/**
 * Поиск подходящего тарифа по параметрам
 */
export async function findShippingTariff(
  params: ShippingTariffSearchParams
): Promise<ShippingTariff | null> {
  const {
    marketplace,
    fromRegion,
    toRegion,
    fromCity,
    toCity,
    weight,
    length,
    width,
    height,
    volume,
    deliveryType,
    deliveryMethod,
    category,
  } = params;

  // Строим запрос с фильтрами
  const where: any = {
    marketplace,
    isActive: true,
  };

  // Фильтры по регионам
  if (fromRegion) {
    where.fromRegion = fromRegion;
  }
  if (toRegion) {
    where.toRegion = toRegion;
  }
  if (fromCity) {
    where.fromCity = fromCity;
  }
  if (toCity) {
    where.toCity = toCity;
  }

  // Фильтры по типу доставки
  if (deliveryType) {
    where.deliveryType = deliveryType;
  }
  if (deliveryMethod) {
    where.deliveryMethod = deliveryMethod;
  }

  // Фильтр по категории (если указана)
  if (category) {
    where.category = category;
  }

  // Фильтры по весу
  if (weight !== undefined) {
    where.OR = [
      {
        weightMin: null,
        weightMax: null,
      },
      {
        AND: [
          {
            OR: [
              { weightMin: null },
              { weightMin: { lte: weight } },
            ],
          },
          {
            OR: [
              { weightMax: null },
              { weightMax: { gte: weight } },
            ],
          },
        ],
      },
    ];
  }

  // Фильтры по габаритам
  if (length !== undefined || width !== undefined || height !== undefined) {
    const dimensionFilters: any[] = [];

    if (length !== undefined) {
      dimensionFilters.push({
        OR: [
          { lengthMin: null, lengthMax: null },
          {
            AND: [
              { OR: [{ lengthMin: null }, { lengthMin: { lte: length } }] },
              { OR: [{ lengthMax: null }, { lengthMax: { gte: length } }] },
            ],
          },
        ],
      });
    }

    if (width !== undefined) {
      dimensionFilters.push({
        OR: [
          { widthMin: null, widthMax: null },
          {
            AND: [
              { OR: [{ widthMin: null }, { widthMin: { lte: width } }] },
              { OR: [{ widthMax: null }, { widthMax: { gte: width } }] },
            ],
          },
        ],
      });
    }

    if (height !== undefined) {
      dimensionFilters.push({
        OR: [
          { heightMin: null, heightMax: null },
          {
            AND: [
              { OR: [{ heightMin: null }, { heightMin: { lte: height } }] },
              { OR: [{ heightMax: null }, { heightMax: { gte: height } }] },
            ],
          },
        ],
      });
    }

    if (dimensionFilters.length > 0) {
      where.AND = where.AND || [];
      where.AND.push(...dimensionFilters);
    }
  }

  // Фильтры по объёму
  if (volume !== undefined) {
    const volumeFilter = {
      OR: [
        { volumeMin: null, volumeMax: null },
        {
          AND: [
            { OR: [{ volumeMin: null }, { volumeMin: { lte: volume } }] },
            { OR: [{ volumeMax: null }, { volumeMax: { gte: volume } }] },
          ],
        },
      ],
    };

    where.AND = where.AND || [];
    where.AND.push(volumeFilter);
  }

  // Ищем тарифы, сортируем по приоритету (высший приоритет = выше)
  const tariffs = await prisma.shippingTariff.findMany({
    where,
    orderBy: [
      { priority: "desc" },
      { createdAt: "desc" },
    ],
    take: 1,
  });

  return tariffs.length > 0 ? (tariffs[0] as any as ShippingTariff) : null;
}

/**
 * Расчёт стоимости доставки на основе тарифа
 */
export function calculateShippingCost(
  tariff: ShippingTariff,
  params: {
    weight?: number;
    volume?: number;
    distance?: number; // км
  }
): ShippingCostResult {
  const { weight, volume, distance } = params;

  let totalCost = tariff.basePrice;
  const details: ShippingCostResult["calculationDetails"] = {};

  // Стоимость за вес
  if (tariff.pricePerKg && weight) {
    const weightKg = weight / 1000; // граммы → кг
    const weightCost = weightKg * tariff.pricePerKg;
    totalCost += weightCost;
    details.weight = weight;
  }

  // Стоимость за объём
  if (tariff.pricePerVolume && volume) {
    const volumeCost = volume * tariff.pricePerVolume;
    totalCost += volumeCost;
    details.volume = volume;
  }

  // Стоимость за расстояние
  if (tariff.pricePerKm && distance) {
    const distanceCost = distance * tariff.pricePerKm;
    totalCost += distanceCost;
    details.distance = distance;
  }

  // Применяем минимальную и максимальную стоимость
  if (tariff.minPrice && totalCost < tariff.minPrice) {
    totalCost = tariff.minPrice;
  }
  if (tariff.maxPrice && totalCost > tariff.maxPrice) {
    totalCost = tariff.maxPrice;
  }

  return {
    tariff,
    basePrice: tariff.basePrice,
    weightCost: tariff.pricePerKg && weight ? (weight / 1000) * tariff.pricePerKg : undefined,
    volumeCost: tariff.pricePerVolume && volume ? volume * tariff.pricePerVolume : undefined,
    distanceCost: tariff.pricePerKm && distance ? distance * tariff.pricePerKm : undefined,
    totalCost: Math.round(totalCost * 100) / 100, // Округляем до 2 знаков
    calculationDetails: details,
  };
}

/**
 * Поиск и расчёт стоимости доставки (комбинированная функция)
 */
export async function getShippingCost(
  params: ShippingTariffSearchParams & {
    weight?: number;
    volume?: number;
    distance?: number;
  }
): Promise<ShippingCostResult | null> {
  const tariff = await findShippingTariff(params);

  if (!tariff) {
    return null;
  }

  // Вычисляем объём, если не указан, но есть габариты
  let volume = params.volume;
  if (!volume && params.length && params.width && params.height) {
    volume = (params.length * params.width * params.height) / 1000; // мм³ → см³
  }

  return calculateShippingCost(tariff, {
    weight: params.weight,
    volume,
    distance: params.distance,
  });
}
