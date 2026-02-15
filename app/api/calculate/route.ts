import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * POST /api/calculate
 * Полный расчёт стоимости товара для FBO, FBS и RFBS
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      marketplace = "ozon",
      // Параметры товара
      categoryType, // "productType" | "category"
      categoryValue, // значение (например "Шины для легковых автомобилей")
      price, // Цена товара, ₽
      volumeLiters, // Объём товара в литрах
      // Параметры отгрузки FBS
      pickupPointType, // "pvz-ppz" | "sc"
      acceptanceType, // "employee" | "self" | "trust"
      deliveryToPickupPoint = 25, // Доставка до места выдачи, ₽ (по умолчанию 25)
      // Себестоимость
      productCost = 0, // Себестоимость товара, ₽
      otherExpenses = 0, // Прочие затраты, ₽
    } = body;

    if (!price || price <= 0) {
      return NextResponse.json(
        { success: false, error: "Укажите цену товара" },
        { status: 400 }
      );
    }

    if (volumeLiters === undefined || volumeLiters === null || volumeLiters < 0) {
      return NextResponse.json(
        { success: false, error: "Укажите объём товара" },
        { status: 400 }
      );
    }

    const mkt = marketplace.toLowerCase();
    const volumeCm3 = volumeLiters * 1000; // Конвертируем литры в см³

    // ─── 1. КОМИССИЯ ─────────────────────────────────────────────
    let commissionRecord = null;
    if (categoryType && categoryValue) {
      const where: any = { marketplace: mkt, isActive: true };
      if (categoryType === "productType") {
        where.productType = categoryValue;
      } else {
        where.categoryName = categoryValue;
      }
      commissionRecord = await prisma.categoryCommission.findFirst({
        where,
        select: {
          categoryName: true,
          productType: true,
          fboUpTo100: true,
          fbo100To300: true,
          fbo300To500: true,
          fbo500To1500: true,
          fboOver1500: true,
          fboFreshUpTo100: true,
          fboFresh100To300: true,
          fboFreshOver300: true,
          fbsUpTo100: true,
          fbs100To300: true,
          fbsOver300: true,
          rfbs: true,
        },
      });
    }

    // Определяем % комиссии по ценовому диапазону
    const getCommissionPercent = (
      record: typeof commissionRecord,
      fulfillment: "fbo" | "fbs" | "rfbs"
    ): number => {
      if (!record) return 0;
      if (fulfillment === "rfbs") return record.rfbs || 0;
      if (fulfillment === "fbo") {
        if (price <= 100) return record.fboUpTo100 || 0;
        if (price <= 300) return record.fbo100To300 || 0;
        if (price <= 500) return record.fbo300To500 || 0;
        if (price <= 1500) return record.fbo500To1500 || 0;
        return record.fboOver1500 || 0;
      }
      // fbs
      if (price <= 100) return record.fbsUpTo100 || 0;
      if (price <= 300) return record.fbs100To300 || 0;
      return record.fbsOver300 || 0;
    };

    const fboCommissionPct = getCommissionPercent(commissionRecord, "fbo");
    const fbsCommissionPct = getCommissionPercent(commissionRecord, "fbs");
    const rfbsCommissionPct = getCommissionPercent(commissionRecord, "rfbs");

    const fboCommission = Math.round(price * fboCommissionPct / 100 * 100) / 100;
    const fbsCommission = Math.round(price * fbsCommissionPct / 100 * 100) / 100;
    const rfbsCommission = Math.round(price * rfbsCommissionPct / 100 * 100) / 100;

    // ─── 2. ЛОГИСТИКА (ДОСТАВКА) ─────────────────────────────────
    // Определяем priceBand
    const priceBand = price <= 300 ? "up_to_300" : "over_300";

    // Функция поиска тарифа логистики
    const findShippingCost = async (deliveryMethod: string): Promise<{ cost: number; tariffDetails: string }> => {
      // Для товаров до 300₽ — старая логика
      if (priceBand === "up_to_300") {
        const tariff = await prisma.shippingTariff.findFirst({
          where: {
            marketplace: mkt,
            deliveryMethod: deliveryMethod.toLowerCase(),
            priceBand: priceBand,
            isActive: true,
            volumeMin: { lte: volumeCm3 },
            OR: [
              { volumeMax: { gte: volumeCm3 } },
              { volumeMax: null },
            ],
          },
          orderBy: { volumeMin: "asc" },
        });

        if (!tariff) {
          return { cost: 0, tariffDetails: "Тариф не найден" };
        }

        return {
          cost: tariff.basePrice,
          tariffDetails: `Фикс. ${tariff.basePrice} ₽ (объём ${volumeLiters.toFixed(3)} л)`,
        };
      }

      // Для товаров от 301₽ — новая логика
      // Округляем объём в большую сторону до литра перед расчётом
      const roundedVolumeLiters = Math.ceil(volumeLiters);
      const roundedVolumeCm3 = roundedVolumeLiters * 1000;
      
      // Ищем тарифы для разных диапазонов объёма
      const findTariffForVolume = async (targetVolumeCm3: number) => {
        // Ищем тариф, который покрывает конкретный объём
        // volumeMin <= targetVolumeCm3 <= volumeMax (или volumeMax = null)
        return await prisma.shippingTariff.findFirst({
          where: {
            marketplace: mkt,
            deliveryMethod: deliveryMethod.toLowerCase(),
            priceBand: "over_300",
            isActive: true,
            volumeMin: { lte: targetVolumeCm3 },
            OR: [
              { volumeMax: { gte: targetVolumeCm3 } },
              { volumeMax: null },
            ],
          },
          orderBy: { volumeMin: "desc" }, // Более специфичный тариф (с большим volumeMin)
        });
      };

      // Тарифы для разных диапазонов
      // Ищем тарифы, которые покрывают объёмы в соответствующих диапазонах (используем округлённый объём)
      const tariffUpTo1L = await findTariffForVolume(roundedVolumeLiters <= 1 ? roundedVolumeCm3 : 500); // до 1л
      const tariff1To2L = await findTariffForVolume(roundedVolumeLiters > 1 && roundedVolumeLiters <= 2 ? roundedVolumeCm3 : 1500); // 1-2л
      const tariff2To3L = await findTariffForVolume(roundedVolumeLiters > 2 && roundedVolumeLiters <= 3 ? roundedVolumeCm3 : 2500); // 2-3л (фикс для расчётов)
      // Для диапазонов 3-190л и 190-1000л используем округлённый объём товара, если он попадает в диапазон, иначе примерный объём
      const tariff3To190L = await findTariffForVolume(roundedVolumeLiters > 3 && roundedVolumeLiters <= 190 ? roundedVolumeCm3 : 50000); // 3-190л (тариф за литр)
      const tariff190To1000L = await findTariffForVolume(roundedVolumeLiters > 190 && roundedVolumeLiters <= 1000 ? roundedVolumeCm3 : 500000); // 190-1000л (тариф за литр)
      const tariffOver1000L = await findTariffForVolume(roundedVolumeLiters > 1000 ? roundedVolumeCm3 : 1500000); // от 1000л

      let cost = 0;
      let details: string[] = [];

      if (roundedVolumeLiters <= 1) {
        // до 1л - фикс по таблице
        if (!tariffUpTo1L) {
          return { cost: 0, tariffDetails: "Тариф не найден (до 1л)" };
        }
        cost = tariffUpTo1L.basePrice;
        details.push(`Фикс. ${cost} ₽ (до 1л, объём округлён: ${volumeLiters.toFixed(3)} → ${roundedVolumeLiters} л)`);
      } else if (roundedVolumeLiters <= 2) {
        // от 1 до 2л - фикс по таблице
        if (!tariff1To2L) {
          return { cost: 0, tariffDetails: "Тариф не найден (1-2л)" };
        }
        cost = tariff1To2L.basePrice;
        details.push(`Фикс. ${cost} ₽ (1-2л, объём округлён: ${volumeLiters.toFixed(3)} → ${roundedVolumeLiters} л)`);
      } else if (roundedVolumeLiters <= 3) {
        // от 2 до 3л - фикс по таблице
        if (!tariff2To3L) {
          return { cost: 0, tariffDetails: "Тариф не найден (2-3л)" };
        }
        cost = tariff2To3L.basePrice;
        details.push(`Фикс. ${cost} ₽ (2-3л, объём округлён: ${volumeLiters.toFixed(3)} → ${roundedVolumeLiters} л)`);
      } else if (roundedVolumeLiters <= 190) {
        // от 3 до 190л - фикс по тарифу от 2 до 3л плюс объем свыше 3л умноженный на тариф по таблице
        if (!tariff2To3L || !tariff3To190L) {
          return { cost: 0, tariffDetails: "Тариф не найден (3-190л)" };
        }
        const fixedCost = tariff2To3L.basePrice;
        const volumeOver3L = roundedVolumeLiters - 3; // Используем округлённый объём
        const volumeCost = volumeOver3L * tariff3To190L.basePrice;
        cost = fixedCost + volumeCost;
        details.push(`Фикс. ${fixedCost} ₽ (2-3л)`);
        details.push(`+ ${volumeOver3L} л × ${tariff3To190L.basePrice} ₽/л = ${volumeCost.toFixed(2)} ₽ (объём округлён: ${volumeLiters.toFixed(3)} → ${roundedVolumeLiters} л)`);
      } else if (roundedVolumeLiters <= 1000) {
        // от 190 до 1000л - фикс по тарифу от 2 до 3л плюс объем свыше 3л умноженный на тариф по таблице но до 190л и далее плюс весь объем свыше 190л умноженный на тариф по таблице
        if (!tariff2To3L || !tariff3To190L || !tariff190To1000L) {
          return { cost: 0, tariffDetails: "Тариф не найден (190-1000л)" };
        }
        const fixedCost = tariff2To3L.basePrice;
        const volume3To190L = 190 - 3; // 187л
        const volumeCost3To190 = volume3To190L * tariff3To190L.basePrice;
        const volumeOver190L = roundedVolumeLiters - 190; // Используем округлённый объём
        const volumeCostOver190 = volumeOver190L * tariff190To1000L.basePrice;
        cost = fixedCost + volumeCost3To190 + volumeCostOver190;
        details.push(`Фикс. ${fixedCost} ₽ (2-3л)`);
        details.push(`+ ${volume3To190L} л × ${tariff3To190L.basePrice} ₽/л = ${volumeCost3To190.toFixed(2)} ₽ (3-190л)`);
        details.push(`+ ${volumeOver190L} л × ${tariff190To1000L.basePrice} ₽/л = ${volumeCostOver190.toFixed(2)} ₽ (свыше 190л, объём округлён: ${volumeLiters.toFixed(3)} → ${roundedVolumeLiters} л)`);
      } else {
        // от 1000л - фикс по таблице
        if (!tariffOver1000L) {
          return { cost: 0, tariffDetails: "Тариф не найден (от 1000л)" };
        }
        cost = tariffOver1000L.basePrice;
        details.push(`Фикс. ${cost} ₽ (от 1000л)`);
      }

      cost = Math.round(cost * 100) / 100;
      return {
        cost,
        tariffDetails: details.join(" | "),
      };
    };

    const fboShipping = await findShippingCost("fbo");
    const fbsShipping = await findShippingCost("fbs");

    // ─── 3. ТАРИФ ЗА ОТПРАВЛЕНИЕ FBS ────────────────────────────
    // Дефолтные тарифы за отправление (если в БД нет данных)
    const DEFAULT_DISPATCH_FEES: Record<string, number> = {
      "ПВЗ/ППЗ": 30,
      "СЦ": 20,
    };

    let fbsDispatchFee = 0;
    let fbsDispatchDetails = "";

    if (pickupPointType) {
      // Определяем способ отгрузки на основе типа приёмки
      let shipmentMethod: string | null = null;
      if (pickupPointType === "pvz-ppz") {
        // Для ПВЗ/ППЗ всегда стандартная отгрузка
        shipmentMethod = "standard";
      } else if (pickupPointType === "sc" && acceptanceType) {
        // Для СЦ зависит от типа приёмки (только если указан)
        if (acceptanceType === "self") {
          shipmentMethod = "self"; // Самоприёмка
        } else if (acceptanceType === "trust") {
          shipmentMethod = "trust"; // Доверительная приёмка
        } else if (acceptanceType === "employee") {
          shipmentMethod = "standard"; // Стандартная отгрузка
        }
      }

      // Ищем тариф за отправление
      const groupName = pickupPointType === "pvz-ppz" ? "ПВЗ/ППЗ" : "СЦ";
      
      // Сначала ищем с конкретным shipmentMethod (если указан)
      let dispatchTariff = null;
      try {
        if (shipmentMethod) {
          dispatchTariff = await prisma.dispatchTariff.findFirst({
            where: {
              marketplace: mkt,
              shipmentPointGroup: groupName,
              shipmentMethod: shipmentMethod,
              isActive: true,
            },
          });
        }
        
        // Если не найден, ищем с null (для обратной совместимости или общих тарифов)
        if (!dispatchTariff) {
          dispatchTariff = await prisma.dispatchTariff.findFirst({
            where: {
              marketplace: mkt,
              shipmentPointGroup: groupName,
              shipmentMethod: null,
              isActive: true,
            },
          });
        }
        
        // Если всё ещё не найден, ищем любой тариф для группы
        if (!dispatchTariff) {
          dispatchTariff = await prisma.dispatchTariff.findFirst({
            where: {
              marketplace: mkt,
              shipmentPointGroup: groupName,
              isActive: true,
            },
          });
        }
      } catch (e) {
        // Таблица может не существовать — используем дефолты
        console.log("⚠️ Таблица DispatchTariff не найдена, используем дефолты");
      }

      if (dispatchTariff) {
        fbsDispatchFee = dispatchTariff.dispatchFee;
      } else {
        // Используем дефолтные значения, если в БД нет данных
        fbsDispatchFee = DEFAULT_DISPATCH_FEES[groupName] || 0;
      }
      
      const methodName = shipmentMethod === "self" ? "Самоприёмка" 
        : shipmentMethod === "trust" ? "Доверительная приёмка"
        : "Стандартная отгрузка";
      fbsDispatchDetails = `Отправление (${groupName}${shipmentMethod ? `, ${methodName}` : ""}): ${fbsDispatchFee} ₽`;
    }

    // ─── 4. ОБРАБОТКА FBS ────────────────────────────────────────
    let fbsProcessingFee = 0;
    let fbsProcessingDetails = "";

    if (pickupPointType && acceptanceType) {
      // Тарифы обработки отправлений исключены из расчёта
      // Используем только тарифы обработки из таблицы ProcessingTariff
      
      // Ищем тарифы обработки в базе данных
      const processingTariffs = await prisma.processingTariff.findMany({
        where: { marketplace: mkt, isActive: true },
      });

      let processingFee = 0;

      if (pickupPointType === "pvz-ppz") {
        // ПВЗ/ППЗ - берём тариф из таблицы (независимо от типа приёмки)
        const relevant = processingTariffs.filter((t) => {
          const pl = t.shipmentPointType.toLowerCase();
          return pl.includes("пвз") || pl.includes("ппз");
        });
        const first = relevant.length > 0 ? relevant[0] : null;
        // Берём ozonProcessingFee (не важно какой тип приёмки для ПВЗ/ППЗ)
        processingFee = first?.ozonProcessingFee || 0;
      } else if (pickupPointType === "sc") {
        // СЦ - зависит от типа приёмки, но всегда берём из таблицы
        const relevant = processingTariffs.filter((t) => {
          const pl = t.shipmentPointType.toLowerCase();
          return pl.includes("сц");
        });
        const first = relevant.length > 0 ? relevant[0] : null;
        
        if (first) {
          // По умолчанию берём полное значение из таблицы (как для employee)
          if (acceptanceType === "self" || acceptanceType === "trust") {
            // СЦ + самоприёмка или доверительная - берём тариф из таблицы и делим на 2
            processingFee = first.ozonProcessingFee / 2;
          } else {
            // СЦ + сотрудник или не указан тип - берём тариф из таблицы (ozonProcessingFee)
            processingFee = first.ozonProcessingFee;
          }
        }
      }

      fbsProcessingFee = processingFee;
      fbsProcessingDetails = `Обработка: ${processingFee.toFixed(2)} ₽`;
    }

    // ─── 5. ЭКВАЙРИНГ ───────────────────────────────────────────
    let acquiringPct = 0;
    try {
      const acquiringSettings = await prisma.acquiringSettings.findUnique({
        where: { marketplace: mkt },
      });
      acquiringPct = acquiringSettings?.acquiringPercent || 0;
    } catch (e) {
      // Таблица может не существовать — не критично
    }
    const acquiringFee = Math.round(price * acquiringPct / 100 * 100) / 100;

    // ─── 6. ИТОГОВЫЕ РАСЧЁТЫ ────────────────────────────────────
    const totalCost = productCost + otherExpenses;

    // FBO
    const fboTotalFees = fboCommission + fboShipping.cost + acquiringFee;
    const fboProfit = price - fboTotalFees - totalCost;
    const fboMargin = price > 0 ? Math.round(fboProfit / price * 10000) / 100 : 0;

    // FBS
    // Всегда прибавляем доставку до места выдачи и тариф за отправление к расчёту FBS
    const fbsTotalFees = fbsCommission + fbsShipping.cost + fbsProcessingFee + fbsDispatchFee + deliveryToPickupPoint + acquiringFee;
    const fbsProfit = price - fbsTotalFees - totalCost;
    const fbsMargin = price > 0 ? Math.round(fbsProfit / price * 10000) / 100 : 0;

    // RFBS (без логистики маркетплейса, без обработки)
    const rfbsTotalFees = rfbsCommission + acquiringFee;
    const rfbsProfit = price - rfbsTotalFees - totalCost;
    const rfbsMargin = price > 0 ? Math.round(rfbsProfit / price * 10000) / 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        price,
        volumeLiters,
        volumeCm3,
        priceBand,
        productCost,
        otherExpenses,
        totalCost,
        acquiringPct,
        acquiringFee,
        commission: {
          categoryName: commissionRecord?.categoryName || null,
          productType: commissionRecord?.productType || null,
        },
        fbo: {
          commissionPct: Math.round(fboCommissionPct),
          commissionAmount: fboCommission,
          shippingCost: fboShipping.cost,
          shippingDetails: fboShipping.tariffDetails,
          processingFee: 0,
          processingDetails: "FBO — обработка включена",
          acquiringFee,
          totalFees: Math.round(fboTotalFees * 100) / 100,
          profit: Math.round(fboProfit * 100) / 100,
          margin: fboMargin,
        },
        fbs: {
          commissionPct: Math.round(fbsCommissionPct),
          commissionAmount: fbsCommission,
          shippingCost: fbsShipping.cost,
          shippingDetails: fbsShipping.tariffDetails,
          processingFee: fbsProcessingFee,
          processingDetails: fbsProcessingDetails || "Не выбран тип отгрузки",
          dispatchFee: fbsDispatchFee,
          dispatchDetails: fbsDispatchDetails || "Не выбран тип отгрузки",
          deliveryToPickupPoint: deliveryToPickupPoint,
          acquiringFee,
          totalFees: Math.round(fbsTotalFees * 100) / 100,
          profit: Math.round(fbsProfit * 100) / 100,
          margin: fbsMargin,
        },
        rfbs: {
          commissionPct: Math.round(rfbsCommissionPct),
          commissionAmount: rfbsCommission,
          shippingCost: 0,
          shippingDetails: "RFBS — доставка продавцом",
          processingFee: 0,
          processingDetails: "RFBS — без обработки",
          acquiringFee,
          totalFees: Math.round(rfbsTotalFees * 100) / 100,
          profit: Math.round(rfbsProfit * 100) / 100,
          margin: rfbsMargin,
        },
      },
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка расчёта:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Ошибка расчёта" },
      { status: 500 }
    );
  }
}
