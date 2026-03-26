import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import type { BulkCalcResult, BulkCalcFulfillment } from "@/lib/types/calculator";

/**
 * Плановая маржа по строке: из файла → по категории → глобальная.
 * Если в файле явно 0 при globalMargin > 0, считаем это «не задано» (частый случай с колонкой «Маржа» в ₽ или нулями)
 * и наследуем категорию/глобальную. Явный 0% при глобальной 0 остаётся 0.
 */
function resolveBulkTargetMargin(
  marginPercent: number | undefined | null,
  category: string,
  categoryMargins: Record<string, number>,
  globalMargin: number
): number {
  const gm = Number(globalMargin);
  const catRaw = categoryMargins[category];
  const catNum = catRaw != null ? Number(catRaw) : NaN;

  if (marginPercent == null) {
    if (Number.isFinite(catNum)) return catNum;
    return Number.isFinite(gm) ? gm : 0;
  }

  const mp = Number(marginPercent);
  if (!Number.isFinite(mp)) {
    if (Number.isFinite(catNum)) return catNum;
    return Number.isFinite(gm) ? gm : 0;
  }

  if (mp === 0 && gm > 0) {
    if (Number.isFinite(catNum) && catNum > 0) return catNum;
    return gm;
  }

  return mp;
}

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
      deliveryToPickupPoint, // из БД если не передан
      lastMileFee, // из БД если не передан
      otherExpenses = 0, // прочие затраты на единицу товара
      taxRegime = "none", // "none" | "usn6" | "usn15" | "nds22"
      targetNetProfitRub, // опционально: целевая чистая прибыль ₽/шт (глобально на партию)
      targetNetProfitMinMarginPct, // опционально: не ниже этой чистой маржи, %
      targetNetProfitMaxMarginPct, // опционально: не выше этой чистой маржи, %
    } = body;

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { success: false, error: "Не переданы товары для расчёта" },
        { status: 400 }
      );
    }

    if (products.length > 10000) {
      return NextResponse.json(
        { success: false, error: "Максимум 10 000 товаров за один расчёт" },
        { status: 400 }
      );
    }

    const hasGlobalProfitTarget =
      targetNetProfitRub !== undefined &&
      targetNetProfitRub !== null &&
      !isNaN(Number(targetNetProfitRub)) &&
      Number(targetNetProfitRub) >= 0;
    const globalProfitP = hasGlobalProfitTarget ? Number(targetNetProfitRub) : 0;

    const parsePctBound = (v: unknown): number | undefined => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = Number(v);
      if (isNaN(n)) return undefined;
      return n;
    };

    let profitMarginMin: number | undefined;
    let profitMarginMax: number | undefined;
    if (hasGlobalProfitTarget) {
      const rmin = parsePctBound(targetNetProfitMinMarginPct);
      const rmax = parsePctBound(targetNetProfitMaxMarginPct);
      if (rmin !== undefined && (rmin < 0 || rmin > 100)) {
        return NextResponse.json(
          { success: false, error: "«Не менее»: процент должен быть от 0 до 100" },
          { status: 400 }
        );
      }
      if (rmax !== undefined && (rmax < 0 || rmax > 100)) {
        return NextResponse.json(
          { success: false, error: "«Не более»: процент должен быть от 0 до 100" },
          { status: 400 }
        );
      }
      if (rmin !== undefined && rmax !== undefined && rmin > rmax) {
        return NextResponse.json(
          { success: false, error: "Минимальная маржа не может быть больше максимальной" },
          { status: 400 }
        );
      }
      profitMarginMin = rmin;
      profitMarginMax = rmax;
    }

    const hasProfitMarginBounds =
      hasGlobalProfitTarget && (profitMarginMin !== undefined || profitMarginMax !== undefined);

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

    // 1b. Эквайринг и тарифы из настроек
    let acquiringPct = 0;
    let resolvedLastMileFee = lastMileFee ?? 25;
    let resolvedDeliveryToPickupPoint = deliveryToPickupPoint ?? 25;
    try {
      const acquiringSettings = await prisma.acquiringSettings.findUnique({
        where: { marketplace: mkt },
      });
      acquiringPct = acquiringSettings?.acquiringPercent || 0;
      if (lastMileFee === undefined || lastMileFee === null) {
        resolvedLastMileFee = (acquiringSettings as any)?.lastMileFee ?? 25;
      }
      if (deliveryToPickupPoint === undefined || deliveryToPickupPoint === null) {
        resolvedDeliveryToPickupPoint = (acquiringSettings as any)?.deliveryToPickupFee ?? 25;
      }
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
        const fboC = cascadeFill([
          record.fboUpTo100, record.fbo100To300,
          record.fbo300To500, record.fbo500To1500,
          record.fboOver1500,
        ]);
        if (price <= 100) return fboC[0];
        if (price <= 300) return fboC[1];
        if (price <= 500) return fboC[2];
        if (price <= 1500) return fboC[3];
        return fboC[4];
      }
      // fbs: 3 уровня → расширяем до 5 с каскадом
      const fbsC = cascadeFill([
        record.fbsUpTo100, record.fbs100To300,
        record.fbsOver300, null, null,
      ]);
      if (price <= 100) return fbsC[0];
      if (price <= 300) return fbsC[1];
      if (price <= 500) return fbsC[2];
      if (price <= 1500) return fbsC[3];
      return fbsC[4];
    }

    // Каскадное заполнение: null → предыдущее ненулевое значение
    function cascadeFill(arr: (number | null | undefined)[]): number[] {
      const result: number[] = [];
      let last = 0;
      for (const v of arr) {
        if (v !== null && v !== undefined && v > 0) last = v;
        result.push(last);
      }
      return result;
    }

    // Формула цены при целевой доле чистой прибыли к цене (используется для рамок min/max % и clamp)
    // Маржинальность m = netProfit / price, где netProfit зависит от налогового режима
    const priceFormula = (
      pctRate: number,
      fixedFees: number,
      m: number,
      totalCost: number,
      regime: string
    ): { numerator: number; denominator: number } => {
      const oneMinusPct = 1 - pctRate;
      if (regime === "usn6") {
        return { numerator: 0.94 * fixedFees + totalCost, denominator: 0.94 * oneMinusPct - m };
      }
      if (regime === "usn15") {
        return { numerator: 0.85 * (fixedFees + totalCost), denominator: 0.85 * oneMinusPct - m };
      }
      // nds22: при profit>0 netProfit = profit*75/122 (НДС и НП от полного totalCost в 22/122-модели).
      // При отрицательной прибыли до налогов линейная формула не совпадает с пошаговым max(VAT,0)+НП.
      if (regime === "nds22") {
        const k = 75 / 122;
        return { numerator: (fixedFees + totalCost) * k, denominator: k * oneMinusPct - m };
      }
      return { numerator: totalCost + fixedFees, denominator: oneMinusPct - m };
    };

    // Расчёт цены по доле чистой прибыли к цене (для рамок «не менее / не более %» к выручке)
    function computeRecommendedPrice(
      commission: typeof allCommissions[0] | null,
      fulfillment: "fbo" | "fbs" | "rfbs",
      totalCost: number,
      targetMargin: number,
      fixedFees: number
    ): number {
      const marginFraction = targetMargin / 100;
      const regime = String(taxRegime || "none");

      // Ценовые диапазоны комиссий
      type Bracket = { maxPrice: number; pct: number };
      const brackets: Bracket[] = [];

      if (fulfillment === "rfbs") {
        brackets.push({ maxPrice: Infinity, pct: commission?.rfbs || 0 });
      } else if (fulfillment === "fbo") {
        const fboC = cascadeFill([
          commission?.fboUpTo100, commission?.fbo100To300,
          commission?.fbo300To500, commission?.fbo500To1500,
          commission?.fboOver1500,
        ]);
        brackets.push(
          { maxPrice: 100, pct: fboC[0] },
          { maxPrice: 300, pct: fboC[1] },
          { maxPrice: 500, pct: fboC[2] },
          { maxPrice: 1500, pct: fboC[3] },
          { maxPrice: Infinity, pct: fboC[4] },
        );
      } else {
        const fbsC = cascadeFill([
          commission?.fbsUpTo100, commission?.fbs100To300,
          commission?.fbsOver300, null, null,
        ]);
        brackets.push(
          { maxPrice: 100, pct: fbsC[0] },
          { maxPrice: 300, pct: fbsC[1] },
          { maxPrice: 500, pct: fbsC[2] },
          { maxPrice: 1500, pct: fbsC[3] },
          { maxPrice: Infinity, pct: fbsC[4] },
        );
      }

      for (const bracket of brackets) {
        const pctRate = (bracket.pct + acquiringPct) / 100;
        const { numerator, denominator } = priceFormula(pctRate, fixedFees, marginFraction, totalCost, regime);
        if (denominator <= 0) continue;
        const requiredPrice = numerator / denominator;

        if (requiredPrice <= bracket.maxPrice) {
          return Math.round(requiredPrice * 100) / 100;
        }
      }

      // Fallback — последний диапазон
      const last = brackets[brackets.length - 1];
      const pctRate = (last.pct + acquiringPct) / 100;
      const { numerator, denominator } = priceFormula(pctRate, fixedFees, marginFraction, totalCost, regime);
      if (denominator <= 0) return 0;
      return Math.round((numerator / denominator) * 100) / 100;
    }

    function computeRecommendedPriceByNetProfit(
      commission: typeof allCommissions[0] | null,
      fulfillment: "fbo" | "fbs" | "rfbs",
      totalCost: number,
      fixedFees: number,
      P: number
    ): number {
      const regime = String(taxRegime || "none");
      const priceForNet = (pctRate: number, ff: number): number => {
        const oneMinusPct = 1 - pctRate;
        if (oneMinusPct <= 0) return 0;
        if (regime === "usn6") return (P + totalCost + 0.94 * ff) / (0.94 * oneMinusPct);
        if (regime === "usn15") return (P / 0.85 + ff + totalCost) / oneMinusPct;
        if (regime === "nds22") {
          const k = 75 / 122;
          return (P / k + ff + totalCost) / oneMinusPct;
        }
        return (P + ff + totalCost) / oneMinusPct;
      };

      type Bracket = { maxPrice: number; pct: number };
      const brackets: Bracket[] = [];

      if (fulfillment === "rfbs") {
        brackets.push({ maxPrice: Infinity, pct: commission?.rfbs || 0 });
      } else if (fulfillment === "fbo") {
        const fboC = cascadeFill([
          commission?.fboUpTo100, commission?.fbo100To300,
          commission?.fbo300To500, commission?.fbo500To1500,
          commission?.fboOver1500,
        ]);
        brackets.push(
          { maxPrice: 100, pct: fboC[0] },
          { maxPrice: 300, pct: fboC[1] },
          { maxPrice: 500, pct: fboC[2] },
          { maxPrice: 1500, pct: fboC[3] },
          { maxPrice: Infinity, pct: fboC[4] },
        );
      } else {
        const fbsC = cascadeFill([
          commission?.fbsUpTo100, commission?.fbs100To300,
          commission?.fbsOver300, null, null,
        ]);
        brackets.push(
          { maxPrice: 100, pct: fbsC[0] },
          { maxPrice: 300, pct: fbsC[1] },
          { maxPrice: 500, pct: fbsC[2] },
          { maxPrice: 1500, pct: fbsC[3] },
          { maxPrice: Infinity, pct: fbsC[4] },
        );
      }

      for (const bracket of brackets) {
        const pctRate = (bracket.pct + acquiringPct) / 100;
        const requiredPrice = priceForNet(pctRate, fixedFees);
        if (requiredPrice > 0 && requiredPrice <= bracket.maxPrice) {
          return Math.round(requiredPrice * 100) / 100;
        }
      }

      const last = brackets[brackets.length - 1];
      const pctRate = (last.pct + acquiringPct) / 100;
      const p = priceForNet(pctRate, fixedFees);
      return Math.round(p * 100) / 100;
    }

    // Расчёт налога для одного типа отгрузки
    function calculateTax(
      price: number,
      totalFees: number,
      totalCost: number,
      otherExp: number,
      regime: string
    ): number {
      const accrual = price - totalFees; // сумма к начислению
      const profit = accrual - totalCost;
      if (regime === "usn6") {
        return Math.round(accrual * 6 / 100 * 100) / 100;
      }
      if (regime === "usn15") {
        const base = accrual - totalCost; // totalCost уже включает otherExp
        return base > 0 ? Math.round(base * 15 / 100 * 100) / 100 : 0;
      }
      if (regime === "nds22") {
        // НДС и база НП: полная сумма затрат (себестоимость + прочие) в методе 22/122 / 100/122.
        const vatPayable = Math.round((accrual * 22 / 122 - totalCost * 22 / 122) * 100) / 100;
        const incomeNoVat = accrual * 100 / 122;
        const expensesNoVat = totalCost * 100 / 122;
        const profitTaxBase = incomeNoVat - expensesNoVat;
        const profitTax = profitTaxBase > 0 ? Math.round(profitTaxBase * 25 / 100 * 100) / 100 : 0;
        return (vatPayable > 0 ? vatPayable : 0) + profitTax;
      }
      return 0; // "none"
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
      otherExp: number,
      regime: string,
    ): BulkCalcFulfillment {
      const commPct = getCommissionPct(commission, fulfillment, price);
      const commAmount = Math.round(price * commPct / 100 * 100) / 100;
      const acqFee = Math.round(price * acquiringPct / 100 * 100) / 100;
      const totalFees = commAmount + shippingCost + dispatchFee + deliveryFee + acqFee;
      const profit = Math.round((price - totalFees - totalCost) * 100) / 100;
      const marginPct = price > 0 ? Math.round(profit / price * 10000) / 100 : 0; // маржинальность
      const markupPct = totalCost > 0 ? Math.round(profit / totalCost * 10000) / 100 : 0; // наценка

      // Налог
      const taxAmount = calculateTax(price, totalFees, totalCost, otherExp, regime);
      const netProfit = Math.round((profit - taxAmount) * 100) / 100;
      const netMarginPct = price > 0 ? Math.round(netProfit / price * 10000) / 100 : 0;

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
        markupPct,
        taxAmount,
        netProfit,
        netMarginPct,
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
            article, name, category, cost, otherExpenses: parseFloat(otherExpenses) || 0, volumeLiters,
            targetMargin: 0,
            fbo: emptyFulfillment(),
            fbs: emptyFulfillment(),
            rfbs: emptyFulfillment(),
            error: volumeLiters <= 0 ? "Нет объёма" : "Нет себестоимости",
          });
          continue;
        }

        const targetMargin = resolveBulkTargetMargin(
          marginPercent,
          category,
          categoryMargins as Record<string, number>,
          Number(globalMargin)
        );
        const otherExp = parseFloat(otherExpenses) || 0;
        const totalCost = cost + otherExp;
        const commission = findCommission(category);
        const regimeStr = String(taxRegime || "none");

        function comparableMarginAtProfitPrice(
          fulfillment: "fbo" | "fbs" | "rfbs",
          P: number
        ): number {
          if (fulfillment === "rfbs") {
            const f = calculateFulfillment(commission, "rfbs", P, 0, 0, 0, totalCost, otherExp, regimeStr);
            return regimeStr !== "none" ? f.netMarginPct : f.marginPct;
          }
          const band = P <= 300 ? "up_to_300" : "over_300";
          if (fulfillment === "fbo") {
            const ship = calculateShipping("fbo", volumeLiters, band);
            const f = calculateFulfillment(
              commission,
              "fbo",
              P,
              ship,
              0,
              resolvedLastMileFee,
              totalCost,
              otherExp,
              regimeStr
            );
            return regimeStr !== "none" ? f.netMarginPct : f.marginPct;
          }
          const ship = calculateShipping("fbs", volumeLiters, band);
          const f = calculateFulfillment(
            commission,
            "fbs",
            P,
            ship,
            fbsDispatchFee,
            resolvedDeliveryToPickupPoint,
            totalCost,
            otherExp,
            regimeStr
          );
          return regimeStr !== "none" ? f.netMarginPct : f.marginPct;
        }

        function iterateFboFinalPriceForMargin(marginPct: number): number {
          const fboFixedBase = resolvedLastMileFee;
          const fboEstimate = computeRecommendedPrice(commission, "fbo", totalCost, marginPct, fboFixedBase);
          const fboPriceBand = fboEstimate <= 300 ? "up_to_300" : "over_300";
          const fboShipping = calculateShipping("fbo", volumeLiters, fboPriceBand);
          const fboPrice = computeRecommendedPrice(
            commission,
            "fbo",
            totalCost,
            marginPct,
            fboShipping + fboFixedBase
          );
          const fboFinalBand = fboPrice <= 300 ? "up_to_300" : "over_300";
          const fboFinalShipping =
            fboFinalBand !== fboPriceBand
              ? calculateShipping("fbo", volumeLiters, fboFinalBand)
              : fboShipping;
          return fboFinalBand !== fboPriceBand
            ? computeRecommendedPrice(
                commission,
                "fbo",
                totalCost,
                marginPct,
                fboFinalShipping + fboFixedBase
              )
            : fboPrice;
        }

        function iterateFbsFinalPriceForMargin(marginPct: number): number {
          const fbsFixedBase = fbsDispatchFee + resolvedDeliveryToPickupPoint;
          const fbsEstimate = computeRecommendedPrice(commission, "fbs", totalCost, marginPct, fbsFixedBase);
          const fbsPriceBand = fbsEstimate <= 300 ? "up_to_300" : "over_300";
          const fbsShipping = calculateShipping("fbs", volumeLiters, fbsPriceBand);
          const fbsPrice = computeRecommendedPrice(
            commission,
            "fbs",
            totalCost,
            marginPct,
            fbsShipping + fbsFixedBase
          );
          const fbsFinalBand = fbsPrice <= 300 ? "up_to_300" : "over_300";
          const fbsFinalShipping =
            fbsFinalBand !== fbsPriceBand
              ? calculateShipping("fbs", volumeLiters, fbsFinalBand)
              : fbsShipping;
          return fbsFinalBand !== fbsPriceBand
            ? computeRecommendedPrice(
                commission,
                "fbs",
                totalCost,
                marginPct,
                fbsFinalShipping + fbsFixedBase
              )
            : fbsPrice;
        }

        function clampProfitPriceByMarginBounds(
          P: number,
          fulfillment: "fbo" | "fbs" | "rfbs"
        ): number {
          const m = comparableMarginAtProfitPrice(fulfillment, P);
          if (profitMarginMax !== undefined && m > profitMarginMax) {
            if (fulfillment === "fbo") return iterateFboFinalPriceForMargin(profitMarginMax);
            if (fulfillment === "fbs") return iterateFbsFinalPriceForMargin(profitMarginMax);
            return computeRecommendedPrice(commission, "rfbs", totalCost, profitMarginMax, 0);
          }
          if (profitMarginMin !== undefined && m < profitMarginMin) {
            if (fulfillment === "fbo") return iterateFboFinalPriceForMargin(profitMarginMin);
            if (fulfillment === "fbs") return iterateFbsFinalPriceForMargin(profitMarginMin);
            return computeRecommendedPrice(commission, "rfbs", totalCost, profitMarginMin, 0);
          }
          return P;
        }

        // Рассчитываем рекомендуемую цену для каждого типа отгрузки
        // Планируемая маржа % трактуется как целевая чистая прибыль = (маржа%/100) * totalCost
        const P_marginRow = (targetMargin / 100) * totalCost;

        // --- FBO ---
        // Сначала оцениваем цену, чтобы определить price band для логистики
        const fboFixedBase = resolvedLastMileFee; // Последняя миля FBO
        const fboEstimate = computeRecommendedPriceByNetProfit(commission, "fbo", totalCost, fboFixedBase, P_marginRow);
        const fboPriceBand = fboEstimate <= 300 ? "up_to_300" : "over_300";
        const fboShipping = calculateShipping("fbo", volumeLiters, fboPriceBand);
        // Пересчитываем с учётом логистики + последняя миля
        const fboPrice = computeRecommendedPriceByNetProfit(
          commission,
          "fbo",
          totalCost,
          fboShipping + fboFixedBase,
          P_marginRow
        );
        // Проверяем, не изменился ли price band
        const fboFinalBand = fboPrice <= 300 ? "up_to_300" : "over_300";
        const fboFinalShipping = fboFinalBand !== fboPriceBand
          ? calculateShipping("fbo", volumeLiters, fboFinalBand)
          : fboShipping;
        const fboFinalPrice = fboFinalBand !== fboPriceBand
          ? computeRecommendedPriceByNetProfit(
              commission,
              "fbo",
              totalCost,
              fboFinalShipping + fboFixedBase,
              P_marginRow
            )
          : fboPrice;

        let fboPriceByProfit: number | undefined;
        if (hasGlobalProfitTarget) {
          const est = computeRecommendedPriceByNetProfit(commission, "fbo", totalCost, fboFixedBase, globalProfitP);
          const band = est <= 300 ? "up_to_300" : "over_300";
          const ship = calculateShipping("fbo", volumeLiters, band);
          const p1 = computeRecommendedPriceByNetProfit(commission, "fbo", totalCost, ship + fboFixedBase, globalProfitP);
          const band2 = p1 <= 300 ? "up_to_300" : "over_300";
          const ship2 = band2 !== band ? calculateShipping("fbo", volumeLiters, band2) : ship;
          fboPriceByProfit =
            band2 !== band
              ? computeRecommendedPriceByNetProfit(commission, "fbo", totalCost, ship2 + fboFixedBase, globalProfitP)
              : p1;
          if (hasProfitMarginBounds) {
            fboPriceByProfit = clampProfitPriceByMarginBounds(fboPriceByProfit, "fbo");
          }
        }

        const fbo = {
          ...calculateFulfillment(commission, "fbo", fboFinalPrice, fboFinalShipping, 0, resolvedLastMileFee, totalCost, otherExp, taxRegime),
          ...(fboPriceByProfit !== undefined ? { recommendedPriceByNetProfit: fboPriceByProfit } : {}),
        };

        // --- FBS ---
        const fbsFixedBase = fbsDispatchFee + resolvedDeliveryToPickupPoint;
        const fbsEstimate = computeRecommendedPriceByNetProfit(commission, "fbs", totalCost, fbsFixedBase, P_marginRow);
        const fbsPriceBand = fbsEstimate <= 300 ? "up_to_300" : "over_300";
        const fbsShipping = calculateShipping("fbs", volumeLiters, fbsPriceBand);
        const fbsPrice = computeRecommendedPriceByNetProfit(
          commission,
          "fbs",
          totalCost,
          fbsShipping + fbsFixedBase,
          P_marginRow
        );
        const fbsFinalBand = fbsPrice <= 300 ? "up_to_300" : "over_300";
        const fbsFinalShipping = fbsFinalBand !== fbsPriceBand
          ? calculateShipping("fbs", volumeLiters, fbsFinalBand)
          : fbsShipping;
        const fbsFinalPrice = fbsFinalBand !== fbsPriceBand
          ? computeRecommendedPriceByNetProfit(
              commission,
              "fbs",
              totalCost,
              fbsFinalShipping + fbsFixedBase,
              P_marginRow
            )
          : fbsPrice;

        let fbsPriceByProfit: number | undefined;
        if (hasGlobalProfitTarget) {
          const est = computeRecommendedPriceByNetProfit(commission, "fbs", totalCost, fbsFixedBase, globalProfitP);
          const band = est <= 300 ? "up_to_300" : "over_300";
          const ship = calculateShipping("fbs", volumeLiters, band);
          const p1 = computeRecommendedPriceByNetProfit(commission, "fbs", totalCost, ship + fbsFixedBase, globalProfitP);
          const band2 = p1 <= 300 ? "up_to_300" : "over_300";
          const ship2 = band2 !== band ? calculateShipping("fbs", volumeLiters, band2) : ship;
          fbsPriceByProfit =
            band2 !== band
              ? computeRecommendedPriceByNetProfit(commission, "fbs", totalCost, ship2 + fbsFixedBase, globalProfitP)
              : p1;
          if (hasProfitMarginBounds) {
            fbsPriceByProfit = clampProfitPriceByMarginBounds(fbsPriceByProfit, "fbs");
          }
        }

        const fbs = {
          ...calculateFulfillment(commission, "fbs", fbsFinalPrice, fbsFinalShipping, fbsDispatchFee, resolvedDeliveryToPickupPoint, totalCost, otherExp, taxRegime),
          ...(fbsPriceByProfit !== undefined ? { recommendedPriceByNetProfit: fbsPriceByProfit } : {}),
        };

        // --- RFBS ---
        const rfbsPrice = computeRecommendedPriceByNetProfit(commission, "rfbs", totalCost, 0, P_marginRow);
        let rfbsPriceByProfit: number | undefined;
        if (hasGlobalProfitTarget) {
          rfbsPriceByProfit = computeRecommendedPriceByNetProfit(commission, "rfbs", totalCost, 0, globalProfitP);
          if (hasProfitMarginBounds && rfbsPriceByProfit !== undefined) {
            rfbsPriceByProfit = clampProfitPriceByMarginBounds(rfbsPriceByProfit, "rfbs");
          }
        }

        const rfbs = {
          ...calculateFulfillment(commission, "rfbs", rfbsPrice, 0, 0, 0, totalCost, otherExp, taxRegime),
          ...(rfbsPriceByProfit !== undefined ? { recommendedPriceByNetProfit: rfbsPriceByProfit } : {}),
        };

        results.push({
          article, name, category, cost, otherExpenses: otherExp, volumeLiters, targetMargin,
          fbo, fbs, rfbs,
        });
      } catch (err: any) {
        results.push({
          article: product.article || "",
          name: product.name || "",
          category: product.category || "",
          cost: product.cost || 0,
          otherExpenses: parseFloat(otherExpenses) || 0,
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
          lastMileFee: resolvedLastMileFee,
          pickupPointType,
          acceptanceType,
          deliveryToPickupPoint: resolvedDeliveryToPickupPoint,
          otherExpenses: parseFloat(otherExpenses) || 0,
          taxRegime: taxRegime || "none",
          ...(hasGlobalProfitTarget ? { targetNetProfitRub: globalProfitP } : {}),
          ...(profitMarginMin !== undefined ? { targetNetProfitMinMarginPct: profitMarginMin } : {}),
          ...(profitMarginMax !== undefined ? { targetNetProfitMaxMarginPct: profitMarginMax } : {}),
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
    markupPct: 0,
    taxAmount: 0,
    netProfit: 0,
    netMarginPct: 0,
  };
}
