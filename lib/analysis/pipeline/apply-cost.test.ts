import { describe, it, expect } from "vitest";
import { consolidate } from "./consolidate";
import { classifyOrders } from "./classify";
import { applyCost } from "./apply-cost";
import type { ChargeLine } from "../domain";
import { classifyChargeType } from "../charge-types";

function line(partial: Partial<ChargeLine> & { chargeType: string }): ChargeLine {
  const category = classifyChargeType(partial.chargeType);
  return {
    sourceFile: "t.xlsx",
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
    isPoints: false,
    ...partial,
    category,
  };
}

function success(orderKey: string, article: string, qty: number) {
  return [
    line({ chargeId: `${orderKey}-1`, orderKey, shipmentSuffix: "1", chargeType: "Выручка", article, productName: "Товар", quantity: qty, totalAmount: qty * 1000 }),
    line({ chargeId: `${orderKey}-1`, orderKey, shipmentSuffix: "1", chargeType: "Эквайринг", article, productName: "Товар", quantity: qty, totalAmount: -qty * 20 }),
    line({ chargeId: `${orderKey}-1`, orderKey, shipmentSuffix: "1", chargeType: "Логистика", article, productName: "Товар", quantity: qty, totalAmount: -qty * 100 }),
    line({ chargeId: `${orderKey}-1`, orderKey, shipmentSuffix: "1", chargeType: "Вознаграждение за продажу", article, productName: "Товар", quantity: qty, totalAmount: -qty * 150 }),
  ];
}

describe("applyCost", () => {
  it("подтягивает себестоимость по артикулу и считает COGS по проданным единицам", () => {
    const charges = success("1", "A1", 2);
    const { orders } = consolidate(charges);
    classifyOrders(orders);

    const costMap = new Map<string, number>([["A1", 300]]);
    const res = applyCost(orders, costMap);

    const item = orders[0].shipments[0].items[0];
    expect(item.costPerUnit).toBe(300);
    expect(item.cogs).toBe(600);
    expect(orders[0].totalCost).toBe(600);
    expect(orders[0].hasCost).toBe(true);
    expect(res.matchedArticles.has("A1")).toBe(true);
  });

  it("при полном возврате COGS = 0", () => {
    const charges = [
      ...success("2", "A1", 2),
      line({ chargeId: "2-1", orderKey: "2", shipmentSuffix: "1", chargeType: "Обратная логистика", article: "A1", productName: "Товар", quantity: 2, totalAmount: -200 }),
      line({ chargeId: "2-1", orderKey: "2", shipmentSuffix: "1", chargeType: "Обработка возвратов, отмен и невыкупов партнёрами", article: "A1", productName: "Товар", quantity: 2, totalAmount: -50 }),
    ];
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    applyCost(orders, new Map([["A1", 300]]));

    expect(orders[0].classification).toBe("full_return");
    expect(orders[0].totalCost).toBe(0);
    expect(orders[0].shipments[0].items[0].cogs).toBe(0);
  });

  it("при частичном возврате COGS только за проданные единицы", () => {
    const charges = [
      ...success("3", "A1", 4),
      line({ chargeId: "3-1", orderKey: "3", shipmentSuffix: "1", chargeType: "Обратная логистика", article: "A1", productName: "Товар", quantity: 1, totalAmount: -100 }),
    ];
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    applyCost(orders, new Map([["A1", 300]]));

    expect(orders[0].classification).toBe("partial_return");
    expect(orders[0].totalCost).toBe(900); // 3 * 300
  });

  it("без cost-мапы или артикула — нулевая себестоимость и hasCost=false", () => {
    const charges = success("4", "A1", 2);
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    applyCost(orders, undefined);
    expect(orders[0].totalCost).toBe(0);
    expect(orders[0].hasCost).toBe(false);
  });

  it("фиксирует артикулы без себестоимости в unmatched", () => {
    const charges = success("5", "X-404", 1);
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    const res = applyCost(orders, new Map([["Y-1", 100]]));
    expect(res.unmatchedArticles.has("X-404")).toBe(true);
  });
});
