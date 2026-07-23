import { describe, it, expect } from "vitest";
import { consolidate } from "./consolidate";
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

describe("consolidate", () => {
  it("quantitySold только из «Выручка» при полном наборе начислений", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "79224088-0238",
        orderKey: "79224088",
        shipmentSuffix: "0238",
        chargeType: "Выручка",
        article: "A1",
        productName: "Шина A",
        quantity: 2,
        totalAmount: 1000,
      }),
      line({
        chargeId: "79224088-0238",
        orderKey: "79224088",
        shipmentSuffix: "0238",
        chargeType: "Эквайринг",
        article: "A1",
        productName: "Шина A",
        quantity: 2,
        totalAmount: -20,
      }),
      line({
        chargeId: "79224088-0238",
        orderKey: "79224088",
        shipmentSuffix: "0238",
        chargeType: "Логистика",
        article: "A1",
        productName: "Шина A",
        quantity: 2,
        totalAmount: -100,
      }),
      line({
        chargeId: "79224088-0238",
        orderKey: "79224088",
        shipmentSuffix: "0238",
        chargeType: "Вознаграждение за продажу",
        article: "A1",
        productName: "Шина A",
        quantity: 2,
        totalAmount: -120,
      }),
    ];

    const { orders } = consolidate(charges);
    expect(orders).toHaveLength(1);
    const o = orders[0];
    expect(o.orderKey).toBe("79224088");
    expect(o.shipments).toHaveLength(1);
    const s = o.shipments[0];
    expect(s.items).toHaveLength(1);
    expect(s.items[0].article).toBe("A1");
    expect(s.items[0].quantitySold).toBe(2);
    expect(s.items[0].quantityReturned).toBe(0);
    expect(o.hasRevenue).toBe(true);
    expect(o.hasAcquiring).toBe(true);
    expect(o.hasLogistics).toBe(true);
    expect(o.hasCommission).toBe(true);
  });

  it("разные отправления одного заказа с разными товарами", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "10-1",
        orderKey: "10",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A1",
        productName: "Товар 1",
        quantity: 1,
        totalAmount: 500,
      }),
      line({
        chargeId: "10-2",
        orderKey: "10",
        shipmentSuffix: "2",
        chargeType: "Выручка",
        article: "A2",
        productName: "Товар 2",
        quantity: 3,
        totalAmount: 1500,
      }),
    ];
    const { orders } = consolidate(charges);
    expect(orders).toHaveLength(1);
    expect(orders[0].shipments).toHaveLength(2);
    const keys = orders[0].shipments.map((s) => s.shipmentKey).sort();
    expect(keys).toEqual(["1", "2"]);
  });

  it("считает quantityReturned из строк обратной логистики", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "20-1",
        orderKey: "20",
        shipmentSuffix: "1",
        chargeType: "Выручка",
        article: "A1",
        productName: "Товар",
        quantity: 4,
        totalAmount: 4000,
      }),
      line({
        chargeId: "20-1",
        orderKey: "20",
        shipmentSuffix: "1",
        chargeType: "Обратная логистика",
        article: "A1",
        productName: "Товар",
        quantity: 2,
        totalAmount: -100,
      }),
    ];
    const { orders } = consolidate(charges);
    const item = orders[0].shipments[0].items[0];
    expect(item.quantitySold).toBe(4);
    expect(item.quantityReturned).toBe(2);
    expect(orders[0].hasReturnLogisticsOrProcessing).toBe(true);
  });

  it("подписки кладёт в subscriptions, строки без orderKey — в nonOrderCharges", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "07.10.25-07.11.25",
        chargeType: "Подписка Premium Pro",
        totalAmount: -990,
      }),
      line({
        chargeId: "",
        chargeType: "Хранение",
        totalAmount: -50,
      }),
    ];
    const { orders, subscriptions, nonOrderCharges } = consolidate(charges);
    expect(orders).toHaveLength(0);
    expect(subscriptions).toHaveLength(1);
    expect(nonOrderCharges).toHaveLength(1);
    expect(nonOrderCharges[0].category).toBe("storage");
  });

  it("баллы за скидки попадают в pointsAmount, не в totalAmountRub", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "30",
        orderKey: "30",
        chargeType: "Выручка",
        article: "A",
        productName: "Товар",
        quantity: 1,
        totalAmount: 1000,
      }),
      line({
        chargeId: "30",
        orderKey: "30",
        chargeType: "Баллы за скидки",
        totalAmount: 50,
      }),
    ];
    const { orders } = consolidate(charges);
    expect(orders[0].totalAmountRub).toBe(1000);
    expect(orders[0].pointsAmount).toBe(50);
  });

  it("без строки «Выручка» quantitySold = 0, hasRevenue = false (даже если в других строках есть qty)", () => {
    const charges: ChargeLine[] = [
      line({
        chargeId: "99-1",
        orderKey: "99",
        shipmentSuffix: "1",
        chargeType: "Эквайринг",
        article: "A1",
        productName: "Товар",
        quantity: 2,
        totalAmount: -20,
      }),
      line({
        chargeId: "99-1",
        orderKey: "99",
        shipmentSuffix: "1",
        chargeType: "Логистика",
        article: "A1",
        productName: "Товар",
        quantity: 2,
        totalAmount: -100,
      }),
      line({
        chargeId: "99-1",
        orderKey: "99",
        shipmentSuffix: "1",
        chargeType: "Вознаграждение за продажу",
        article: "A1",
        productName: "Товар",
        quantity: 2,
        totalAmount: -120,
      }),
    ];
    const { orders } = consolidate(charges);
    expect(orders[0].hasRevenue).toBe(false);
    expect(orders[0].shipments[0].items[0].quantitySold).toBe(0);
    expect(orders[0].shipments[0].items[0].quantityReturned).toBe(0);
  });
});
