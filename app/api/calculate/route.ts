import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * POST /api/calculate
 * Полный расчёт стоимости товара для FBO, FBS и RFBS
 * + опциональный обратный расчёт (рекомендуемая цена по заданной маржинальности)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      marketplace = "ozon",
      categoryType,
      categoryValue,
      price,
      volumeLiters,
      pickupPointType,
      acceptanceType,
      deliveryToPickupPoint, // будет прочитан из БД если не передан
      lastMileFee, // будет прочитан из БД если не передан
      rfbsLogisticsCost = 0, // стоимость логистики RFBS
      productCost = 0,
      otherExpenses = 0,
      targetMargin, // Опциональная планируемая маржинальность (%)
      taxRegime = "none", // none | usn6 | usn15 | nds22 — для обратного расчёта цены по марже
    } = body;

    // Цена обязательна
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
    const volumeCm3 = volumeLiters * 1000;

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
    // Каскадная логика: если значение null — берём предыдущий ненулевой диапазон
    const getCommissionPercent = (
      record: typeof commissionRecord,
      fulfillment: "fbo" | "fbs" | "rfbs",
      priceForCalc: number
    ): number => {
      if (!record) return 0;
      if (fulfillment === "rfbs") return record.rfbs || 0;

      if (fulfillment === "fbo") {
        // FBO: 5 диапазонов, каскадное заполнение null
        const vals = [
          record.fboUpTo100,
          record.fbo100To300,
          record.fbo300To500,
          record.fbo500To1500,
          record.fboOver1500,
        ];
        const cascaded = cascadeFill(vals);
        if (priceForCalc <= 100) return cascaded[0];
        if (priceForCalc <= 300) return cascaded[1];
        if (priceForCalc <= 500) return cascaded[2];
        if (priceForCalc <= 1500) return cascaded[3];
        return cascaded[4];
      }

      // FBS: 3 диапазона из БД → расширяем до 5 с каскадом
      const fbsVals = [
        record.fbsUpTo100,
        record.fbs100To300,
        record.fbsOver300,
        null, // 500-1500: каскад от over300
        null, // over1500: каскад от over300
      ];
      const fbsCascaded = cascadeFill(fbsVals);
      if (priceForCalc <= 100) return fbsCascaded[0];
      if (priceForCalc <= 300) return fbsCascaded[1];
      if (priceForCalc <= 500) return fbsCascaded[2];
      if (priceForCalc <= 1500) return fbsCascaded[3];
      return fbsCascaded[4];
    };

    // Вспомогательная: каскадное заполнение null → берём предыдущее ненулевое
    function cascadeFill(arr: (number | null | undefined)[]): number[] {
      const result: number[] = [];
      let last = 0;
      for (const v of arr) {
        if (v !== null && v !== undefined && v > 0) last = v;
        result.push(last);
      }
      return result;
    }

    const fboCommissionPct = getCommissionPercent(commissionRecord, "fbo", price);
    const fbsCommissionPct = getCommissionPercent(commissionRecord, "fbs", price);
    const rfbsCommissionPct = getCommissionPercent(commissionRecord, "rfbs", price);

    const fboCommission = Math.round(price * fboCommissionPct / 100 * 100) / 100;
    const fbsCommission = Math.round(price * fbsCommissionPct / 100 * 100) / 100;
    const rfbsCommission = Math.round(price * rfbsCommissionPct / 100 * 100) / 100;

    // ─── 2. ЛОГИСТИКА (ДОСТАВКА) ─────────────────────────────────
    const priceBand = price <= 300 ? "up_to_300" : "over_300";

    const findShippingCost = async (deliveryMethod: string): Promise<{ cost: number; tariffDetails: string }> => {
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

      const roundedVolumeLiters = Math.ceil(volumeLiters);
      const roundedVolumeCm3 = roundedVolumeLiters * 1000;
      
      const findTariffForVolume = async (targetVolumeCm3: number) => {
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
          orderBy: { volumeMin: "desc" },
        });
      };

      const tariffUpTo1L = await findTariffForVolume(roundedVolumeLiters <= 1 ? roundedVolumeCm3 : 500);
      const tariff1To2L = await findTariffForVolume(roundedVolumeLiters > 1 && roundedVolumeLiters <= 2 ? roundedVolumeCm3 : 1500);
      const tariff2To3L = await findTariffForVolume(roundedVolumeLiters > 2 && roundedVolumeLiters <= 3 ? roundedVolumeCm3 : 2500);
      const tariff3To190L = await findTariffForVolume(roundedVolumeLiters > 3 && roundedVolumeLiters <= 190 ? roundedVolumeCm3 : 50000);
      const tariff190To1000L = await findTariffForVolume(roundedVolumeLiters > 190 && roundedVolumeLiters <= 1000 ? roundedVolumeCm3 : 500000);
      const tariffOver1000L = await findTariffForVolume(roundedVolumeLiters > 1000 ? roundedVolumeCm3 : 1500000);

      let cost = 0;
      let details: string[] = [];

      if (roundedVolumeLiters <= 1) {
        if (!tariffUpTo1L) return { cost: 0, tariffDetails: "Тариф не найден (до 1л)" };
        cost = tariffUpTo1L.basePrice;
        details.push(`Фикс. ${cost} ₽ (до 1л, объём округлён: ${volumeLiters.toFixed(3)} → ${roundedVolumeLiters} л)`);
      } else if (roundedVolumeLiters <= 2) {
        if (!tariff1To2L) return { cost: 0, tariffDetails: "Тариф не найден (1-2л)" };
        cost = tariff1To2L.basePrice;
        details.push(`Фикс. ${cost} ₽ (1-2л, объём округлён: ${volumeLiters.toFixed(3)} → ${roundedVolumeLiters} л)`);
      } else if (roundedVolumeLiters <= 3) {
        if (!tariff2To3L) return { cost: 0, tariffDetails: "Тариф не найден (2-3л)" };
        cost = tariff2To3L.basePrice;
        details.push(`Фикс. ${cost} ₽ (2-3л, объём округлён: ${volumeLiters.toFixed(3)} → ${roundedVolumeLiters} л)`);
      } else if (roundedVolumeLiters <= 190) {
        if (!tariff2To3L || !tariff3To190L) return { cost: 0, tariffDetails: "Тариф не найден (3-190л)" };
        const fixedCost = tariff2To3L.basePrice;
        const volumeOver3L = roundedVolumeLiters - 3;
        const volumeCost = volumeOver3L * tariff3To190L.basePrice;
        cost = fixedCost + volumeCost;
        details.push(`Фикс. ${fixedCost} ₽ (2-3л)`);
        details.push(`+ ${volumeOver3L} л × ${tariff3To190L.basePrice} ₽/л = ${volumeCost.toFixed(2)} ₽ (объём округлён: ${volumeLiters.toFixed(3)} → ${roundedVolumeLiters} л)`);
      } else if (roundedVolumeLiters <= 1000) {
        if (!tariff2To3L || !tariff3To190L || !tariff190To1000L) return { cost: 0, tariffDetails: "Тариф не найден (190-1000л)" };
        const fixedCost = tariff2To3L.basePrice;
        const volume3To190L = 190 - 3;
        const volumeCost3To190 = volume3To190L * tariff3To190L.basePrice;
        const volumeOver190L = roundedVolumeLiters - 190;
        const volumeCostOver190 = volumeOver190L * tariff190To1000L.basePrice;
        cost = fixedCost + volumeCost3To190 + volumeCostOver190;
        details.push(`Фикс. ${fixedCost} ₽ (2-3л)`);
        details.push(`+ ${volume3To190L} л × ${tariff3To190L.basePrice} ₽/л = ${volumeCost3To190.toFixed(2)} ₽ (3-190л)`);
        details.push(`+ ${volumeOver190L} л × ${tariff190To1000L.basePrice} ₽/л = ${volumeCostOver190.toFixed(2)} ₽ (свыше 190л, объём округлён: ${volumeLiters.toFixed(3)} → ${roundedVolumeLiters} л)`);
      } else {
        if (!tariffOver1000L) return { cost: 0, tariffDetails: "Тариф не найден (от 1000л)" };
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
    const DEFAULT_DISPATCH_FEES: Record<string, number> = {
      "ПВЗ/ППЗ:standard": 30, "ПВЗ/ППЗ:self": 30, "ПВЗ/ППЗ:trust": 30,
      "СЦ:standard": 20, "СЦ:self": 10, "СЦ:trust": 10,
    };

    let fbsDispatchFee = 0;
    let fbsDispatchDetails = "";

    if (pickupPointType) {
      let shipmentMethod = "standard";
      if (acceptanceType === "self") {
        shipmentMethod = "self";
      } else if (acceptanceType === "trust") {
        shipmentMethod = "trust";
      }

      const groupName = pickupPointType === "pvz-ppz" ? "ПВЗ/ППЗ" : "СЦ";
      
      let dispatchTariff = null;
      try {
        dispatchTariff = await prisma.dispatchTariff.findFirst({
          where: {
            marketplace: mkt,
            shipmentPointGroup: groupName,
            shipmentMethod: shipmentMethod,
            isActive: true,
          },
        });
        
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
        console.log("⚠️ Таблица DispatchTariff не найдена, используем дефолты");
      }

      if (dispatchTariff) {
        fbsDispatchFee = dispatchTariff.dispatchFee;
      } else {
        fbsDispatchFee = DEFAULT_DISPATCH_FEES[`${groupName}:${shipmentMethod}`] || 0;
      }
      
      const methodName = shipmentMethod === "self" ? "Самоприёмка" 
        : shipmentMethod === "trust" ? "Доверительная приёмка"
        : "Сотрудник (стандартная отгрузка)";
      fbsDispatchDetails = `Отправление (${groupName}, ${methodName}): ${fbsDispatchFee} ₽`;
    }

    const fbsProcessingFee = 0;
    const fbsProcessingDetails = "Включено в тариф за отправление";

    // ─── 5. ЭКВАЙРИНГ И ТАРИФЫ ИЗ НАСТРОЕК ─────────────────────
    let acquiringPct = 0;
    let resolvedLastMileFee = lastMileFee ?? 25;
    let resolvedDeliveryToPickupPoint = deliveryToPickupPoint ?? 25;
    try {
      const acquiringSettings = await prisma.acquiringSettings.findUnique({
        where: { marketplace: mkt },
      });
      acquiringPct = acquiringSettings?.acquiringPercent || 0;
      // Берём из БД, если не переданы в запросе
      if (lastMileFee === undefined || lastMileFee === null) {
        resolvedLastMileFee = (acquiringSettings as any)?.lastMileFee ?? 25;
      }
      if (deliveryToPickupPoint === undefined || deliveryToPickupPoint === null) {
        resolvedDeliveryToPickupPoint = (acquiringSettings as any)?.deliveryToPickupFee ?? 25;
      }
    } catch (e) {
      // Таблица может не существовать — не критично
    }
    const acquiringFee = Math.round(price * acquiringPct / 100 * 100) / 100;

    // ─── 6. ИТОГОВЫЕ РАСЧЁТЫ ────────────────────────────────────
    const totalCost = productCost + otherExpenses;

    // FBO (включая Последнюю милю)
    const fboTotalFees = fboCommission + fboShipping.cost + resolvedLastMileFee + acquiringFee;
    const fboProfit = price - fboTotalFees - totalCost;
    const fboMargin = price > 0 ? Math.round(fboProfit / price * 10000) / 100 : 0; // маржинальность
    const fboMarkup = totalCost > 0 ? Math.round(fboProfit / totalCost * 10000) / 100 : 0; // наценка

    // FBS
    const fbsTotalFees = fbsCommission + fbsShipping.cost + fbsDispatchFee + resolvedDeliveryToPickupPoint + acquiringFee;
    const fbsProfit = price - fbsTotalFees - totalCost;
    const fbsMargin = price > 0 ? Math.round(fbsProfit / price * 10000) / 100 : 0; // маржинальность
    const fbsMarkup = totalCost > 0 ? Math.round(fbsProfit / totalCost * 10000) / 100 : 0; // наценка

    // RFBS (+ логистика RFBS если указана)
    const rfbsTotalFees = rfbsCommission + rfbsLogisticsCost + acquiringFee;
    const rfbsProfit = price - rfbsTotalFees - totalCost;
    const rfbsMargin = price > 0 ? Math.round(rfbsProfit / price * 10000) / 100 : 0; // маржинальность
    const rfbsMarkup = totalCost > 0 ? Math.round(rfbsProfit / totalCost * 10000) / 100 : 0; // наценка

    // ─── 7. ОБРАТНЫЙ РАСЧЁТ (АЛГЕБРАИЧЕСКИЙ) ─────────────────────
    // Если указана целевая маржинальность И себестоимость > 0,
    // рассчитываем рекомендуемую цену для каждого типа отгрузки
    let reverseCalculation: any = null;
    
    if (targetMargin !== undefined && targetMargin !== null && totalCost > 0) {
      // Целевая маржинальность = netProfit/price. netProfit учитывает налог по выбранному режиму.
      const marginFraction = targetMargin / 100;
      const regime = String(taxRegime || "none");

      // Цена из условия: netProfit/price = targetMargin/100, netProfit с учётом налога.
      // none: netProfit = price*(1-pctRate) - fixedFees - totalCost  => price = (totalCost+fixedFees)/(1-pctRate-m)
      // usn6: netProfit = 0.94*(price*(1-pctRate)-fixedFees)-totalCost  => price = (0.94*fixedFees+totalCost)/(0.94*(1-pctRate)-m)
      // usn15: netProfit = 0.85*(price*(1-pctRate)-fixedFees-totalCost)  => price = 0.85*(fixedFees+totalCost)/(0.85*(1-pctRate)-m)
      // nds22: netProfit = (price*(1-pctRate)-fixedFees-totalCost)*75/122  => price = (fixedFees+totalCost)*75/122 / ((1-pctRate)*75/122-m)
      const priceFormula = (
        pctRate: number,
        fixedFees: number,
        m: number
      ): { numerator: number; denominator: number } => {
        const oneMinusPct = 1 - pctRate;
        if (regime === "usn6") {
          return { numerator: 0.94 * fixedFees + totalCost, denominator: 0.94 * oneMinusPct - m };
        }
        if (regime === "usn15") {
          return { numerator: 0.85 * (fixedFees + totalCost), denominator: 0.85 * oneMinusPct - m };
        }
        if (regime === "nds22") {
          const k = 75 / 122;
          return { numerator: (fixedFees + totalCost) * k, denominator: k * oneMinusPct - m };
        }
        return { numerator: totalCost + fixedFees, denominator: oneMinusPct - m };
      };

      const computeRequiredPrice = (
        fulfillment: "fbo" | "fbs" | "rfbs",
        fixedFees: number
      ): number => {
        const brackets: { maxPrice: number; pct: number }[] = [];

        if (fulfillment === "rfbs") {
          brackets.push({ maxPrice: Infinity, pct: commissionRecord?.rfbs || 0 });
        } else if (fulfillment === "fbo") {
          const fboC = cascadeFill([
            commissionRecord?.fboUpTo100, commissionRecord?.fbo100To300,
            commissionRecord?.fbo300To500, commissionRecord?.fbo500To1500,
            commissionRecord?.fboOver1500,
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
            commissionRecord?.fbsUpTo100, commissionRecord?.fbs100To300,
            commissionRecord?.fbsOver300, null, null,
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
          const { numerator, denominator } = priceFormula(pctRate, fixedFees, marginFraction);
          if (denominator <= 0) continue;
          const requiredPrice = numerator / denominator;
          if (requiredPrice <= bracket.maxPrice) {
            return Math.round(requiredPrice * 100) / 100;
          }
        }

        const lastBracket = brackets[brackets.length - 1];
        const pctRate = (lastBracket.pct + acquiringPct) / 100;
        const { numerator, denominator } = priceFormula(pctRate, fixedFees, marginFraction);
        if (denominator <= 0) return 0;
        return Math.round((numerator / denominator) * 100) / 100;
      };
      
      // Фиксированные сборы для каждого типа
      const fboFixedFees = fboShipping.cost + resolvedLastMileFee;
      const fbsFixedFees = fbsShipping.cost + fbsDispatchFee + resolvedDeliveryToPickupPoint;
      const rfbsFixedFees = rfbsLogisticsCost;
      
      const fboRequiredPrice = computeRequiredPrice("fbo", fboFixedFees);
      const fbsRequiredPrice = computeRequiredPrice("fbs", fbsFixedFees);
      const rfbsRequiredPrice = computeRequiredPrice("rfbs", rfbsFixedFees);
      
      // Наценка от себестоимости для текущей цены
      const fboMarkupFromCost = totalCost > 0 ? Math.round(fboProfit / totalCost * 10000) / 100 : 0;
      const fbsMarkupFromCost = totalCost > 0 ? Math.round(fbsProfit / totalCost * 10000) / 100 : 0;
      const rfbsMarkupFromCost = totalCost > 0 ? Math.round(rfbsProfit / totalCost * 10000) / 100 : 0;
      
      reverseCalculation = {
        targetMargin,
        marginMode: "margin",
        taxRegime: regime,
        fbo: { requiredPrice: fboRequiredPrice, currentMarkupFromCost: fboMarkupFromCost },
        fbs: { requiredPrice: fbsRequiredPrice, currentMarkupFromCost: fbsMarkupFromCost },
        rfbs: { requiredPrice: rfbsRequiredPrice, currentMarkupFromCost: rfbsMarkupFromCost },
      };
    }

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
          lastMileFee: resolvedLastMileFee,
          processingFee: 0,
          processingDetails: "FBO — обработка включена",
          acquiringFee,
          totalFees: Math.round(fboTotalFees * 100) / 100,
          profit: Math.round(fboProfit * 100) / 100,
          margin: fboMargin, // маржинальность (от цены)
          markup: fboMarkup, // наценка (от себестоимости)
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
          deliveryToPickupPoint: resolvedDeliveryToPickupPoint,
          acquiringFee,
          totalFees: Math.round(fbsTotalFees * 100) / 100,
          profit: Math.round(fbsProfit * 100) / 100,
          margin: fbsMargin, // маржинальность (от цены)
          markup: fbsMarkup, // наценка (от себестоимости)
        },
        rfbs: {
          commissionPct: Math.round(rfbsCommissionPct),
          commissionAmount: rfbsCommission,
          shippingCost: rfbsLogisticsCost,
          shippingDetails: rfbsLogisticsCost > 0 ? `Логистика RFBS: ${rfbsLogisticsCost} ₽` : "RFBS — доставка продавцом",
          processingFee: 0,
          processingDetails: "RFBS — без обработки",
          acquiringFee,
          totalFees: Math.round(rfbsTotalFees * 100) / 100,
          profit: Math.round(rfbsProfit * 100) / 100,
          margin: rfbsMargin, // маржинальность (от цены)
          markup: rfbsMarkup, // наценка (от себестоимости)
        },
        reverseCalculation,
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
