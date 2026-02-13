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
      // Ищем тариф по объёму (volumeMin <= volumeCm3 < volumeMax)
      const tariff = await prisma.shippingTariff.findFirst({
        where: {
          marketplace: mkt,
          deliveryMethod: deliveryMethod.toLowerCase(),
          priceBand: priceBand,
          isActive: true,
          volumeMin: { lte: volumeCm3 },
          OR: [
            { volumeMax: { gte: volumeCm3 } },
            { volumeMax: null }, // Для "Более X л" — без верхней границы
          ],
        },
        orderBy: { volumeMin: "asc" },
      });

      if (!tariff) {
        return { cost: 0, tariffDetails: "Тариф не найден" };
      }

      // Для товаров >300₽ и объёмом >3л — тариф за литр
      if (priceBand === "over_300" && volumeLiters > 3) {
        const cost = Math.round(volumeLiters * tariff.basePrice * 100) / 100;
        return {
          cost,
          tariffDetails: `${volumeLiters.toFixed(3)} л × ${tariff.basePrice} ₽/л = ${cost} ₽`,
        };
      }

      // Фиксированный тариф
      return {
        cost: tariff.basePrice,
        tariffDetails: `Фикс. ${tariff.basePrice} ₽ (объём ${volumeLiters.toFixed(3)} л)`,
      };
    };

    const fboShipping = await findShippingCost("fbo");
    const fbsShipping = await findShippingCost("fbs");

    // ─── 3. ОБРАБОТКА FBS ────────────────────────────────────────
    let fbsProcessingFee = 0;
    let fbsProcessingDetails = "";

    if (pickupPointType) {
      // Тариф за отправление (dispatch)
      const groupName = pickupPointType === "pvz-ppz" ? "ПВЗ/ППЗ" : "СЦ";
      const dispatchTariff = await prisma.dispatchTariff.findFirst({
        where: { marketplace: mkt, shipmentPointGroup: groupName, isActive: true },
      });
      const dispatchFee = dispatchTariff?.dispatchFee || 0;

      // Тариф за обработку (processing)
      let processingFee = 0;
      if (acceptanceType) {
        const isPvz = pickupPointType === "pvz-ppz";
        const processingTariffs = await prisma.processingTariff.findMany({
          where: { marketplace: mkt, isActive: true },
        });
        const relevant = processingTariffs.filter((t) => {
          const pl = t.shipmentPointType.toLowerCase();
          return isPvz ? (pl.includes("пвз") || pl.includes("ппз")) : pl.includes("сц");
        });
        const first = relevant.length > 0 ? relevant[0] : null;
        processingFee = first
          ? acceptanceType === "employee"
            ? first.ozonProcessingFee
            : first.partnerProcessingFee
          : 0;
      }

      fbsProcessingFee = dispatchFee + processingFee;
      fbsProcessingDetails = `Отправление: ${dispatchFee} ₽ + Обработка: ${processingFee} ₽ = ${fbsProcessingFee} ₽`;
    }

    // ─── 4. ЭКВАЙРИНГ ───────────────────────────────────────────
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

    // ─── 5. ИТОГОВЫЕ РАСЧЁТЫ ────────────────────────────────────
    const totalCost = productCost + otherExpenses;

    // FBO
    const fboTotalFees = fboCommission + fboShipping.cost + acquiringFee;
    const fboProfit = price - fboTotalFees - totalCost;
    const fboMargin = price > 0 ? Math.round(fboProfit / price * 10000) / 100 : 0;

    // FBS
    const fbsTotalFees = fbsCommission + fbsShipping.cost + fbsProcessingFee + acquiringFee;
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
