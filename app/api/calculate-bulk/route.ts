import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import type { BulkCalcResult, BulkCalcFulfillment } from "@/lib/types/calculator";

/**
 * POST /api/calculate-bulk
 * Массовый расчёт товаров — все запросы к БД выполняются один раз,
 * далее расчёт для каждого товара идёт полностью в памяти.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      products,
      globalMargin = 30,
      categoryMargins = {},
      pickupPointType = "pvz-ppz",
      acceptanceType = "employee",
      deliveryToPickupPoint = 25,
    } = body;

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { success: false, error: "Не переданы товары для расчёта" },
        { status: 400 }
      );
    }

    if (products.length > 5000) {
      return NextResponse.json(
        { success: false, error: "Максимум 5000 товаров за один расчёт" },
        { status: 400 }
      );
    }

    const mkt = "ozon";

    // ═══════════════════════════════════════════════════════════════
    // 1. ПРЕДЗАГРУЗКА ВСЕХ ДАННЫХ (один раз для всей партии)
    // ═══════════════════════════════════════════════════════════════

    // 1a. Все комиссии по категориям
    const allCommissions = await prisma.categoryCommission.findMany({
      where: { marketplace: mkt, isActive: true },
      select: {
        categoryName: true,
        productType: true,
        fboUpTo100: true,
        fbo100To300: true,
        fbo300To500: true,
        fbo500To1500: true,
        fboOver1500: true,
        fbsUpTo100: true,
        fbs100To300: true,
        fbsOver300: true,
        rfbs: true,
      },
    });

    // Создаём Map для быстрого поиска по категории и типу товара
    const commissionByCategoryName = new Map<string, typeof allCommissions[0]>();
    const commissionByProductType = new Map<string, typeof allCommissions[0]>();
    for (const c of allCommissions) {
      if (c.categoryName) commissionByCategoryName.set(c.categoryName.toLowerCase(), c);
      if (c.productType) commissionByProductType.set(c.productType.toLowerCase(), c);
    }

    // 1b. Эквайринг
    let acquiringPct = 0;
    try {
      const acquiringSettings = await prisma.acquiringSettings.findUnique({
        where: { marketplace: mkt },
      });
      acquiringPct = acquiringSettings?.acquiringPercent || 0;
    } catch (e) {
      // Таблица может не существовать
    }

    // 1c. Тарифы за отправление
    let allDispatchTariffs: any[] = [];
    try {
      allDispatchTariffs = await prisma.dispatchTariff.findMany({
        where: { marketplace: mkt, isActive: true },
      });
    } catch (e) {
      // Таблица может не существовать
    }

    const DEFAULT_DISPATCH_FEES: Record<string, number> = {
      "ПВЗ/ППЗ:standard": 30, "ПВЗ/ППЗ:self": 30, "ПВЗ/ППЗ:trust": 30,
      "СЦ:standard": 20, "СЦ:self": 10, "СЦ:trust": 10,
    };

    // Определяем тариф за отправление (один раз, одинаковый для всех товаров)
    let shipmentMethodKey = "standard";
    if (acceptanceType === "self") shipmentMethodKey = "self";
    else if (acceptanceType === "trust") shipmentMethodKey = "trust";
    const groupName = pickupPointType === "sc" ? "СЦ" : "ПВЗ/ППЗ";

    const dispatchTariff = allDispatchTariffs.find(
      (t: any) => t.shipmentPointGroup === groupName && t.shipmentMethod === shipmentMethodKey
    ) || allDispatchTariffs.find(
      (t: any) => t.shipmentPointGroup === groupName && t.shipmentMethod === null
    ) || allDispatchTariffs.find(
      (t: any) => t.shipmentPointGroup === groupName
    );

    const fbsDispatchFee = dispatchTariff?.dispatchFee
      ?? DEFAULT_DISPATCH_FEES[`${groupName}:${shipmentMethodKey}`]
      ?? 0;

    // 1d. Все тарифы логистики
    const allShippingTariffs = await prisma.shippingTariff.findMany({
      where: { marketplace: mkt, isActive: true },
      orderBy: [{ deliveryMethod: "asc" }, { priceBand: "asc" }, { volumeMin: "asc" }],
    });

    // ═══════════════════════════════════════════════════════════════
    // 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (работают с кэшированными данными)
    // ═══════════════════════════════════════════════════════════════

    // Поиск тарифа логистики в кэше
    function findShippingTariff(
      method: string,
      band: string,
      targetVolumeCm3: number
    ): any | null {
      // Ищем тарифы для данного метода и ценового диапазона
      // volumeMin <= targetVolumeCm3 AND (volumeMax >= targetVolumeCm3 OR volumeMax IS NULL)
      // Сортируем по volumeMin desc чтобы найти наиболее специфичный
      const candidates = allShippingTariffs.filter(
        (t: any) =>
          t.deliveryMethod === method &&
          t.priceBand === band &&
          t.volumeMin <= targetVolumeCm3 &&
          (t.volumeMax === null || t.volumeMax >= targetVolumeCm3)
      );
      // Берём с наибольшим volumeMin (более специфичный)
      if (candidates.length === 0) return null;
      return candidates.reduce((best: any, curr: any) =>
        curr.volumeMin > best.volumeMin ? curr : best
      );
    }

    // Расчёт стоимости логистики
    function calculateShipping(
      method: string,
      volumeLiters: number,
      priceBand: string
    ): number {
      const volumeCm3 = volumeLiters * 1000;

      if (priceBand === "up_to_300") {
        const tariff = findShippingTariff(method, "up_to_300", volumeCm3);
        return tariff?.basePrice ?? 0;
      }

      // over_300: тарифная сетка по объёму
      const roundedLiters = Math.ceil(volumeLiters);
      const roundedCm3 = roundedLiters * 1000;

      if (roundedLiters <= 1) {
        const t = findShippingTariff(method, "over_300", roundedCm3 || 500);
        return t?.basePrice ?? 0;
      }
      if (roundedLiters <= 2) {
        const t = findShippingTariff(method, "over_300", roundedCm3 || 1500);
        return t?.basePrice ?? 0;
      }
      if (roundedLiters <= 3) {
        const t = findShippingTariff(method, "over_300", roundedCm3 || 2500);
        return t?.basePrice ?? 0;
      }

      // Для >3л: фикс(2-3) + (объём - 3) × тариф за литр
      const tariff2To3 = findShippingTariff(method, "over_300", 2500);
      const fixedCost = tariff2To3?.basePrice ?? 0;

      if (roundedLiters <= 190) {
        const tariffPerLiter = findShippingTariff(method, "over_300", 50000);
        const perLiter = tariffPerLiter?.basePrice ?? 0;
        return Math.round((fixedCost + (roundedLiters - 3) * perLiter) * 100) / 100;
      }

      if (roundedLiters <= 1000) {
        const tariff3To190 = findShippingTariff(method, "over_300", 50000);
        const tariff190Plus = findShippingTariff(method, "over_300", 500000);
        const perLiter3To190 = tariff3To190?.basePrice ?? 0;
        const perLiter190Plus = tariff190Plus?.basePrice ?? 0;
        const cost3To190 = 187 * perLiter3To190;
        const costOver190 = (roundedLiters - 190) * perLiter190Plus;
        return Math.round((fixedCost + cost3To190 + costOver190) * 100) / 100;
      }

      // >1000л
      const tariffOver1000 = findShippingTariff(method, "over_300", 1500000);
      return tariffOver1000?.basePrice ?? 0;
    }

    // Поиск комиссии по категории
    function findCommission(categoryName: string): typeof allCommissions[0] | null {
      const lower = categoryName.toLowerCase();
      // Сначала ищем как productType, потом как categoryName
      return commissionByProductType.get(lower) || commissionByCategoryName.get(lower) || null;
    }

    // % комиссии по ценовому диапазону
    function getCommissionPct(
      record: typeof allCommissions[0] | null,
      fulfillment: "fbo" | "fbs" | "rfbs",
      price: number
    ): number {
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
    }

    // Алгебраический расчёт рекомендуемой цены
    function computeRecommendedPrice(
      commission: typeof allCommissions[0] | null,
      fulfillment: "fbo" | "fbs" | "rfbs",
      totalCost: number,
      targetMargin: number,
      fixedFees: number
    ): number {
      const desiredProfit = totalCost * targetMargin / 100;

      // Ценовые диапазоны комиссий
      type Bracket = { maxPrice: number; pct: number };
      const brackets: Bracket[] = [];

      if (fulfillment === "rfbs") {
        brackets.push({ maxPrice: Infinity, pct: commission?.rfbs || 0 });
      } else if (fulfillment === "fbo") {
        brackets.push(
          { maxPrice: 100, pct: commission?.fboUpTo100 || 0 },
          { maxPrice: 300, pct: commission?.fbo100To300 || 0 },
          { maxPrice: 500, pct: commission?.fbo300To500 || 0 },
          { maxPrice: 1500, pct: commission?.fbo500To1500 || 0 },
          { maxPrice: Infinity, pct: commission?.fboOver1500 || 0 },
        );
      } else {
        brackets.push(
          { maxPrice: 100, pct: commission?.fbsUpTo100 || 0 },
          { maxPrice: 300, pct: commission?.fbs100To300 || 0 },
          { maxPrice: Infinity, pct: commission?.fbsOver300 || 0 },
        );
      }

      for (const bracket of brackets) {
        const pctRate = (bracket.pct + acquiringPct) / 100;
        if (pctRate >= 1) continue;
        const requiredPrice = (totalCost + desiredProfit + fixedFees) / (1 - pctRate);
        if (requiredPrice <= bracket.maxPrice) {
          return Math.round(requiredPrice * 100) / 100;
        }
      }

      // Fallback — последний диапазон
      const last = brackets[brackets.length - 1];
      const pctRate = (last.pct + acquiringPct) / 100;
      if (pctRate >= 1) return 0;
      return Math.round((totalCost + desiredProfit + fixedFees) / (1 - pctRate) * 100) / 100;
    }

    // Полный расчёт для одного типа отгрузки при заданной цене
    function calculateFulfillment(
      commission: typeof allCommissions[0] | null,
      fulfillment: "fbo" | "fbs" | "rfbs",
      price: number,
      shippingCost: number,
      dispatchFee: number,
      deliveryFee: number,
      totalCost: number,
    ): BulkCalcFulfillment {
      const commPct = getCommissionPct(commission, fulfillment, price);
      const commAmount = Math.round(price * commPct / 100 * 100) / 100;
      const acqFee = Math.round(price * acquiringPct / 100 * 100) / 100;
      const totalFees = commAmount + shippingCost + dispatchFee + deliveryFee + acqFee;
      const profit = Math.round((price - totalFees - totalCost) * 100) / 100;
      const marginPct = price > 0 ? Math.round(profit / price * 10000) / 100 : 0;

      return {
        recommendedPrice: price,
        commissionPct: Math.round(commPct),
        commissionAmount: commAmount,
        shippingCost,
        dispatchFee,
        deliveryToPickup: deliveryFee,
        acquiringFee: acqFee,
        totalFees: Math.round(totalFees * 100) / 100,
        profit,
        marginPct,
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. РАСЧЁТ ДЛЯ КАЖДОГО ТОВАРА (без обращений к БД)
    // ═══════════════════════════════════════════════════════════════

    const results: BulkCalcResult[] = [];

    for (const product of products) {
      try {
        const {
          article = "",
          name = "",
          category = "",
          cost = 0,
          volumeLiters = 0,
          marginPercent,
        } = product;

        if (volumeLiters <= 0 || cost <= 0) {
          results.push({
            article, name, category, cost, volumeLiters,
            targetMargin: 0,
            fbo: emptyFulfillment(),
            fbs: emptyFulfillment(),
            rfbs: emptyFulfillment(),
            error: volumeLiters <= 0 ? "Нет объёма" : "Нет себестоимости",
          });
          continue;
        }

        // Определяем маржу: из товара → из категории → глобальная
        const targetMargin = marginPercent ?? (categoryMargins[category] as number) ?? globalMargin;
        const totalCost = cost; // Для массового расчёта прочие расходы = 0
        const commission = findCommission(category);

        // Рассчитываем рекомендуемую цену для каждого типа отгрузки

        // --- FBO ---
        // Сначала оцениваем цену, чтобы определить price band для логистики
        const fboEstimate = computeRecommendedPrice(commission, "fbo", totalCost, targetMargin, 0);
        const fboPriceBand = fboEstimate <= 300 ? "up_to_300" : "over_300";
        const fboShipping = calculateShipping("fbo", volumeLiters, fboPriceBand);
        // Пересчитываем с учётом логистики
        const fboPrice = computeRecommendedPrice(commission, "fbo", totalCost, targetMargin, fboShipping);
        // Проверяем, не изменился ли price band
        const fboFinalBand = fboPrice <= 300 ? "up_to_300" : "over_300";
        const fboFinalShipping = fboFinalBand !== fboPriceBand
          ? calculateShipping("fbo", volumeLiters, fboFinalBand)
          : fboShipping;
        const fboFinalPrice = fboFinalBand !== fboPriceBand
          ? computeRecommendedPrice(commission, "fbo", totalCost, targetMargin, fboFinalShipping)
          : fboPrice;

        const fbo = calculateFulfillment(commission, "fbo", fboFinalPrice, fboFinalShipping, 0, 0, totalCost);

        // --- FBS ---
        const fbsFixedBase = fbsDispatchFee + deliveryToPickupPoint;
        const fbsEstimate = computeRecommendedPrice(commission, "fbs", totalCost, targetMargin, fbsFixedBase);
        const fbsPriceBand = fbsEstimate <= 300 ? "up_to_300" : "over_300";
        const fbsShipping = calculateShipping("fbs", volumeLiters, fbsPriceBand);
        const fbsPrice = computeRecommendedPrice(commission, "fbs", totalCost, targetMargin, fbsShipping + fbsFixedBase);
        const fbsFinalBand = fbsPrice <= 300 ? "up_to_300" : "over_300";
        const fbsFinalShipping = fbsFinalBand !== fbsPriceBand
          ? calculateShipping("fbs", volumeLiters, fbsFinalBand)
          : fbsShipping;
        const fbsFinalPrice = fbsFinalBand !== fbsPriceBand
          ? computeRecommendedPrice(commission, "fbs", totalCost, targetMargin, fbsFinalShipping + fbsFixedBase)
          : fbsPrice;

        const fbs = calculateFulfillment(commission, "fbs", fbsFinalPrice, fbsFinalShipping, fbsDispatchFee, deliveryToPickupPoint, totalCost);

        // --- RFBS ---
        const rfbsPrice = computeRecommendedPrice(commission, "rfbs", totalCost, targetMargin, 0);
        const rfbs = calculateFulfillment(commission, "rfbs", rfbsPrice, 0, 0, 0, totalCost);

        results.push({
          article, name, category, cost, volumeLiters, targetMargin,
          fbo, fbs, rfbs,
        });
      } catch (err: any) {
        results.push({
          article: product.article || "",
          name: product.name || "",
          category: product.category || "",
          cost: product.cost || 0,
          volumeLiters: product.volumeLiters || 0,
          targetMargin: 0,
          fbo: emptyFulfillment(),
          fbs: emptyFulfillment(),
          rfbs: emptyFulfillment(),
          error: err.message || "Ошибка расчёта",
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        meta: {
          totalProducts: products.length,
          calculatedProducts: results.filter((r) => !r.error).length,
          errorProducts: results.filter((r) => r.error).length,
          acquiringPct,
          dispatchFee: fbsDispatchFee,
          pickupPointType,
          acceptanceType,
          deliveryToPickupPoint,
        },
      },
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка массового расчёта:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Ошибка расчёта" },
      { status: 500 }
    );
  }
}

function emptyFulfillment(): BulkCalcFulfillment {
  return {
    recommendedPrice: 0,
    commissionPct: 0,
    commissionAmount: 0,
    shippingCost: 0,
    dispatchFee: 0,
    deliveryToPickup: 0,
    acquiringFee: 0,
    totalFees: 0,
    profit: 0,
    marginPct: 0,
  };
}
