import { describe, it, expect } from "vitest";
import { consolidate } from "./consolidate";
import { classifyOrders } from "./classify";
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

function makeOrder(orderKey: string, types: Array<[string, number, number]>, opts?: { shipment?: string }) {
  const ship = opts?.shipment ?? "1";
  return types.map(([t, qty, amount]) =>
    line({
      chargeId: `${orderKey}-${ship}`,
      orderKey,
      shipmentSuffix: ship,
      chargeType: t,
      article: "A",
      productName: "Товар",
      quantity: qty,
      totalAmount: amount,
    })
  );
}

describe("classifyOrders", () => {
  it("success — все 4 обязательных типа, без возвратов", () => {
    const charges = makeOrder("1", [
      ["Выручка", 1, 1000],
      ["Эквайринг", 1, -20],
      ["Логистика", 1, -100],
      ["Вознаграждение за продажу", 1, -150],
    ]);
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("success");
    expect(orders[0].shipments[0].status).toBe("delivered");
  });

  it("incomplete — нет одного из обязательных типов", () => {
    const charges = makeOrder("2", [
      ["Выручка", 1, 1000],
      ["Эквайринг", 1, -20],
      ["Логистика", 1, -100],
      // Нет вознаграждения
    ]);
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("incomplete");
  });

  it("full_return — всё отправление вернули", () => {
    const charges = [
      ...makeOrder("3", [
        ["Выручка", 2, 2000],
        ["Эквайринг", 2, -40],
        ["Логистика", 2, -200],
        ["Вознаграждение за продажу", 2, -200],
      ]),
      ...makeOrder("3", [
        ["Обратная логистика", 2, -150],
        ["Обработка возвратов, отмен и невыкупов партнёрами", 2, -50],
      ]),
    ];
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("full_return");
    expect(orders[0].shipments[0].status).toBe("returned");
  });

  it("partial_return — часть вернули", () => {
    const charges = [
      ...makeOrder("4", [
        ["Выручка", 4, 4000],
        ["Эквайринг", 4, -80],
        ["Логистика", 4, -400],
        ["Вознаграждение за продажу", 4, -400],
      ]),
      ...makeOrder("4", [["Обратная логистика", 1, -100]]),
    ];
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("partial_return");
    expect(orders[0].shipments[0].status).toBe("partially_returned");
  });

  it("incomplete — только эквайринг", () => {
    const charges = makeOrder("5", [["Эквайринг", 1, -20]]);
    // НО: у charges нет никаких товаров! Проверим, что incomplete даже если товаров нет.
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("incomplete");
  });
});

describe("classifyChargeType — расширенный классификатор", () => {
  it("«Программы партнёров» → partnerPrograms (не advertising)", () => {
    expect(classifyChargeType("Программы партнёров")).toBe("partnerPrograms");
    expect(classifyChargeType("программы партнеров")).toBe("partnerPrograms");
  });

  it("штрафные типы из ТЗ попадают в penalties", () => {
    expect(
      classifyChargeType("Обработка операционных ошибок продавца: отмена")
    ).toBe("penalties");
    expect(
      classifyChargeType(
        "Обработка операционных ошибок продавца: отгрузка в нерекомендованный слот"
      )
    ).toBe("penalties");
    expect(
      classifyChargeType(
        "Обработка операционных ошибок продавца: просроченная отгрузка"
      )
    ).toBe("penalties");
    expect(classifyChargeType("Досрочная выплата")).toBe("penalties");
    expect(classifyChargeType("Гибкий график выплат")).toBe("penalties");
    expect(
      classifyChargeType("Декомпенсации и возвращение товаров на склад")
    ).toBe("penalties");
  });

  it("хранение/логистика/обратка из ТЗ — по своим категориям", () => {
    expect(classifyChargeType("Временное размещение товара партнёрами")).toBe(
      "storage"
    );
    expect(classifyChargeType("Доставка до места выдачи")).toBe("logistics");
    expect(classifyChargeType("Обработка отправления Drop-off (СЦ)")).toBe(
      "logistics"
    );
    expect(classifyChargeType("Обратная логистика")).toBe("returnLogistics");
    expect(
      classifyChargeType("Обработка возвратов, отмен и невыкупов партнёрами")
    ).toBe("returnProcessing");
  });
});
