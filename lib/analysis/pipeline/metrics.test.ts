import { describe, it, expect } from "vitest";
import { consolidate } from "./consolidate";
import { classifyOrders } from "./classify";
import { buildSummary, computeSellerPriceMetrics, sumOrderFees } from "./metrics";
import type { ChargeLine } from "../domain";
import { classifyChargeType } from "../charge-types";

function line(partial: Partial<ChargeLine> & { chargeType: string }): ChargeLine {
  const category = classifyChargeType(partial.chargeType);
  return {
    sourceFile: "test.xlsx",
    sourceRow: 1,
    chargeId: "",
    orderKey: null,
    shipmentSuffix: null,
    chargeDate: new Date("2025-10-01"),
    serviceGroup: "",
    article: "",
    sku: "",
    productName: "",
    quantity: 0,
    sellerPrice: 0,
    orderDate: null,
    platform: "",
    workScheme: "",
    ozonCommissionPercent: 0,
    localizationIndex: 0,
    avgDeliveryHours: 0,
    totalAmount: 0,
    isPoints: category === "points",
    ...partial,
    category,
  };
}

function buildAll(charges: ChargeLine[]) {
  const { orders, nonOrderCharges, subscriptions } = consolidate(charges);
  classifyOrders(orders);
  return { orders, nonOrderCharges, subscriptions };
}

describe("buildSummary — Валовая по цене продавца", () => {
  it("суммирует sellerPrice × delivered units по всем заказам", () => {
    const charges: ChargeLine[] = [
      // Заказ 1: 5 шт × 100 и 5 шт × 200 (два разных товара в одном отправлении).
      line({
        chargeId: "11-1",
        orderKey: "11",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A1",
        productName: "Товар 1",
        quantity: 5,
        sellerPrice: 100,
        totalAmount: 500,
      }),
      line({
        chargeId: "11-1",
        orderKey: "11",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A2",
        productName: "Товар 2",
        quantity: 5,
        sellerPrice: 200,
        totalAmount: 1000,
      }),
      line({
        chargeId: "11-1",
        orderKey: "11",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A1",
        productName: "Товар 1",
        quantity: 5,
        totalAmount: -20,
      }),
      line({
        chargeId: "11-1",
        orderKey: "11",
        shipmentSuffix: "1",
        chargeType: "Логистика",
        article: "A1",
        productName: "Товар 1",
        quantity: 5,
        totalAmount: -100,
      }),
      line({
        chargeId: "11-1",
        orderKey: "11",
        shipmentSuffix: "1",
        chargeType: "Вознаграждение за продажу",
        article: "A1",
        productName: "Товар 1",
        quantity: 5,
        totalAmount: -150,
      }),
    ];

    const { orders, nonOrderCharges, subscriptions } = buildAll(charges);
    const summary = buildSummary(orders, nonOrderCharges, subscriptions, []);
    expect(summary.grossBySellerPrice).toBe(5 * 100 + 5 * 200);
    expect(summary.soldUnits).toBe(10);
  });

  it("частичный возврат: в валовой учитываются только доставленные единицы", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "12-1",
        orderKey: "12",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A",
        productName: "Товар",
        quantity: 3,
        sellerPrice: 100,
        totalAmount: 300,
      }),
      line({
        chargeId: "12-1",
        orderKey: "12",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A",
        productName: "Товар",
        quantity: 3,
        totalAmount: -10,
      }),
      line({
        chargeId: "12-1",
        orderKey: "12",
        shipmentSuffix: "1",
        chargeType: "Логистика",
        article: "A",
        productName: "Товар",
        quantity: 3,
        totalAmount: -30,
      }),
      line({
        chargeId: "12-1",
        orderKey: "12",
        shipmentSuffix: "1",
        chargeType: "Вознаграждение за продажу",
        article: "A",
        productName: "Товар",
        quantity: 3,
        totalAmount: -30,
      }),
      // Возврат 1 шт из 3.
      line({
        chargeId: "12-1",
        orderKey: "12",
        shipmentSuffix: "1",
        chargeType: "Обратная логистика",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -20,
      }),
    ];

    const { orders, nonOrderCharges, subscriptions } = buildAll(charges);
    const summary = buildSummary(orders, nonOrderCharges, subscriptions, []);
    // 3 − 1 = 2 шт × 100
    expect(summary.grossBySellerPrice).toBe(200);
    expect(summary.soldUnits).toBe(2);
  });

  it("частичный возврат с несколькими return-категориями: возврат считается один раз (MAX, не SUM)", () => {
    // Ozon часто формирует на 1 физический возврат сразу 3 строки:
    // «Обратная логистика», «Возврат выручки», «Обработка возвратов». Раньше они
    // суммировались, и quantityReturned инфлейтился (regression: grossBySellerPrice = 0 вместо 200).
    const charges: ChargeLine[] = [
      line({
        chargeId: "14-1",
        orderKey: "14",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A",
        productName: "Товар",
        quantity: 3,
        sellerPrice: 100,
        totalAmount: 300,
      }),
      line({
        chargeId: "14-1",
        orderKey: "14",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A",
        productName: "Товар",
        quantity: 3,
        totalAmount: -10,
      }),
      line({
        chargeId: "14-1",
        orderKey: "14",
        shipmentSuffix: "1",
        chargeType: "Логистика",
        article: "A",
        productName: "Товар",
        quantity: 3,
        totalAmount: -30,
      }),
      line({
        chargeId: "14-1",
        orderKey: "14",
        shipmentSuffix: "1",
        chargeType: "Вознаграждение за продажу",
        article: "A",
        productName: "Товар",
        quantity: 3,
        totalAmount: -30,
      }),
      // Три строки на 1 физический возврат — все с qty=1.
      line({
        chargeId: "14-1",
        orderKey: "14",
        shipmentSuffix: "1",
        chargeType: "Обратная логистика",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -20,
      }),
      line({
        chargeId: "14-1",
        orderKey: "14",
        shipmentSuffix: "1",
        chargeType: "Обработка возвратов, отмен и невыкупов партнёрами",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -10,
      }),
      line({
        chargeId: "14-1",
        orderKey: "14",
        shipmentSuffix: "1",
        chargeType: "Возврат выручки",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -100,
      }),
    ];

    const { orders, nonOrderCharges, subscriptions } = buildAll(charges);
    const item = orders[0].shipments[0].items[0];
    expect(item.quantitySold).toBe(3);
    expect(item.quantityReturned).toBe(1); // MAX(1,1,1), не 3
    const summary = buildSummary(orders, nonOrderCharges, subscriptions, []);
    expect(summary.grossBySellerPrice).toBe(200); // 2 × 100
    expect(summary.soldUnits).toBe(2);
  });

  it("полный возврат отправления: в валовой 0", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "13-1",
        orderKey: "13",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A",
        productName: "Товар",
        quantity: 2,
        sellerPrice: 500,
        totalAmount: 1000,
      }),
      line({
        chargeId: "13-1",
        orderKey: "13",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A",
        productName: "Товар",
        quantity: 2,
        totalAmount: -20,
      }),
      line({
        chargeId: "13-1",
        orderKey: "13",
        shipmentSuffix: "1",
        chargeType: "Логистика",
        article: "A",
        productName: "Товар",
        quantity: 2,
        totalAmount: -100,
      }),
      line({
        chargeId: "13-1",
        orderKey: "13",
        shipmentSuffix: "1",
        chargeType: "Вознаграждение за продажу",
        article: "A",
        productName: "Товар",
        quantity: 2,
        totalAmount: -100,
      }),
      line({
        chargeId: "13-1",
        orderKey: "13",
        shipmentSuffix: "1",
        chargeType: "Обратная логистика",
        article: "A",
        productName: "Товар",
        quantity: 2,
        totalAmount: -150,
      }),
      line({
        chargeId: "13-1",
        orderKey: "13",
        shipmentSuffix: "1",
        chargeType: "Обработка возвратов, отмен и невыкупов партнёрами",
        article: "A",
        productName: "Товар",
        quantity: 2,
        totalAmount: -50,
      }),
    ];

    const { orders, nonOrderCharges, subscriptions } = buildAll(charges);
    const summary = buildSummary(orders, nonOrderCharges, subscriptions, []);
    expect(summary.grossBySellerPrice).toBe(0);
    expect(summary.soldUnits).toBe(0);
  });
});

describe("buildSummary — NET-эквайринг в Удержаниях Ozon", () => {
  it("положительный + отрицательный эквайринг в одном заказе схлапываются в 0", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "21-1",
        orderKey: "21",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A",
        productName: "Товар",
        quantity: 1,
        sellerPrice: 1000,
        totalAmount: 1000,
      }),
      line({
        chargeId: "21-1",
        orderKey: "21",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -20,
      }),
      // Возврат эквайринга при возврате заказа.
      line({
        chargeId: "21-1",
        orderKey: "21",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: 20,
      }),
      line({
        chargeId: "21-1",
        orderKey: "21",
        shipmentSuffix: "1",
        chargeType: "Логистика",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -100,
      }),
      line({
        chargeId: "21-1",
        orderKey: "21",
        shipmentSuffix: "1",
        chargeType: "Вознаграждение за продажу",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -150,
      }),
    ];

    const { orders, nonOrderCharges, subscriptions } = buildAll(charges);
    const summary = buildSummary(orders, nonOrderCharges, subscriptions, []);
    // В удержания должны попасть только logistics (100) и commission (150),
    // эквайринг net=0 → 0.
    expect(summary.ozonFees).toBe(250);
  });

  it("только отрицательный эквайринг учитывается полностью", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "22-1",
        orderKey: "22",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A",
        productName: "Товар",
        quantity: 1,
        sellerPrice: 1000,
        totalAmount: 1000,
      }),
      line({
        chargeId: "22-1",
        orderKey: "22",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -25,
      }),
      line({
        chargeId: "22-1",
        orderKey: "22",
        shipmentSuffix: "1",
        chargeType: "Логистика",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -100,
      }),
      line({
        chargeId: "22-1",
        orderKey: "22",
        shipmentSuffix: "1",
        chargeType: "Вознаграждение за продажу",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -150,
      }),
    ];

    const { orders, nonOrderCharges, subscriptions } = buildAll(charges);
    const summary = buildSummary(orders, nonOrderCharges, subscriptions, []);
    // 25 + 100 + 150 = 275
    expect(summary.ozonFees).toBe(275);
  });
});

describe("buildSummary — Программы партнёров в Валовой выручке", () => {
  it("отрицательная сумма Программ партнёров уменьшает grossRevenue", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "31-1",
        orderKey: "31",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A",
        productName: "Товар",
        quantity: 1,
        sellerPrice: 1000,
        totalAmount: 1000,
      }),
      line({
        chargeId: "31-1",
        orderKey: "31",
        shipmentSuffix: "1",
        chargeType: "Программы партнёров",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -500,
      }),
      line({
        chargeId: "31-1",
        orderKey: "31",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -20,
      }),
      line({
        chargeId: "31-1",
        orderKey: "31",
        shipmentSuffix: "1",
        chargeType: "Логистика",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -100,
      }),
      line({
        chargeId: "31-1",
        orderKey: "31",
        shipmentSuffix: "1",
        chargeType: "Вознаграждение за продажу",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: -150,
      }),
    ];

    const { orders, nonOrderCharges, subscriptions } = buildAll(charges);
    const summary = buildSummary(orders, nonOrderCharges, subscriptions, []);
    expect(summary.revenueAmount).toBe(1000);
    expect(summary.partnerProgramsAmount).toBe(-500);
    expect(summary.grossRevenue).toBe(500);
    // Программы партнёров НЕ уходят в удержания.
    expect(summary.ozonFees).toBe(20 + 100 + 150);
  });
});

describe("buildSummary — Итого начислено", () => {
  it("netPayout = Валовая по цене продавца − Удержания Ozon", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "41-1",
        orderKey: "41",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A",
        productName: "Товар",
        quantity: 2,
        sellerPrice: 500,
        totalAmount: 1000,
      }),
      line({
        chargeId: "41-1",
        orderKey: "41",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A",
        productName: "Товар",
        quantity: 2,
        totalAmount: -30,
      }),
      line({
        chargeId: "41-1",
        orderKey: "41",
        shipmentSuffix: "1",
        chargeType: "Логистика",
        article: "A",
        productName: "Товар",
        quantity: 2,
        totalAmount: -120,
      }),
      line({
        chargeId: "41-1",
        orderKey: "41",
        shipmentSuffix: "1",
        chargeType: "Вознаграждение за продажу",
        article: "A",
        productName: "Товар",
        quantity: 2,
        totalAmount: -150,
      }),
    ];

    const { orders, nonOrderCharges, subscriptions } = buildAll(charges);
    const summary = buildSummary(orders, nonOrderCharges, subscriptions, []);
    expect(summary.grossBySellerPrice).toBe(1000);
    expect(summary.soldUnits).toBe(2);
    expect(summary.ozonFees).toBe(30 + 120 + 150);
    expect(summary.netPayout).toBe(1000 - (30 + 120 + 150));
  });
});

describe("computeSellerPriceMetrics & sumOrderFees", () => {
  it("выровнены с buildSummary / удержаниями по одному заказу", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "11-1",
        orderKey: "11",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A1",
        productName: "Товар 1",
        quantity: 5,
        sellerPrice: 100,
        totalAmount: 500,
      }),
      line({
        chargeId: "11-1",
        orderKey: "11",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A2",
        productName: "Товар 2",
        quantity: 5,
        sellerPrice: 200,
        totalAmount: 1000,
      }),
      line({
        chargeId: "11-1",
        orderKey: "11",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A1",
        productName: "Товар 1",
        quantity: 5,
        totalAmount: -20,
      }),
      line({
        chargeId: "11-1",
        orderKey: "11",
        shipmentSuffix: "1",
        chargeType: "Логистика",
        article: "A1",
        productName: "Товар 1",
        quantity: 5,
        totalAmount: -100,
      }),
      line({
        chargeId: "11-1",
        orderKey: "11",
        shipmentSuffix: "1",
        chargeType: "Вознаграждение за продажу",
        article: "A1",
        productName: "Товар 1",
        quantity: 5,
        totalAmount: -150,
      }),
    ];
    const { orders, nonOrderCharges, subscriptions } = buildAll(charges);
    const o = orders[0];
    const m = computeSellerPriceMetrics(o);
    const summary = buildSummary(orders, nonOrderCharges, subscriptions, []);
    expect(m.grossBySellerPrice).toBe(summary.grossBySellerPrice);
    expect(m.soldUnits).toBe(summary.soldUnits);
    expect(sumOrderFees(o.totals)).toBe(20 + 100 + 150);
  });
});
