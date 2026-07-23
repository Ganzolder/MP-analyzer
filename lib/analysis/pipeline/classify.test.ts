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

  it("full_return — возврат выручки на полную сумму и эквайринг схлопнут (нетто 0)", () => {
    const charges = [
      ...makeOrder("3", [
        ["Выручка", 2, 2000],
        ["Эквайринг", 2, -40],
        ["Логистика", 2, -200],
        ["Вознаграждение за продажу", 2, -200],
      ]),
      ...makeOrder("3", [
        ["Возврат выручки", 2, -2000],
        ["Эквайринг", 2, 40],
        ["Обратная логистика", 2, -150],
        ["Обработка возвратов, отмен и невыкупов партнёрами", 2, -50],
      ]),
    ];
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("full_return");
    expect(orders[0].shipments[0].status).toBe("returned");
  });

  it("partial_return — часть выручки и часть эквайринга (есть «Возврат выручки»)", () => {
    const charges = [
      ...makeOrder("4", [
        ["Выручка", 4, 4000],
        ["Эквайринг", 4, -80],
        ["Логистика", 4, -400],
        ["Вознаграждение за продажу", 4, -400],
      ]),
      ...makeOrder("4", [
        ["Возврат выручки", 1, -1000],
        ["Эквайринг", 1, 20],
        ["Обратная логистика", 1, -100],
      ]),
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

  it("incomplete — три обязательных типа без «Выручка» (заказ в работе)", () => {
    const charges = makeOrder("6", [
      ["Эквайринг", 1, -20],
      ["Логистика", 1, -100],
      ["Вознаграждение за продажу", 1, -150],
    ]);
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("incomplete");
    expect(orders[0].shipments[0].status).toBe("unknown");
    expect(orders[0].hasRevenue).toBe(false);
  });

  it("full_return — есть обратная логистика, но нет выручки в отчёте (возврат по строкам)", () => {
    const charges = makeOrder("7", [
      ["Обратная логистика", 2, -150],
      ["Обработка возвратов, отмен и невыкупов партнёрами", 2, -50],
    ]);
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("full_return");
    expect(orders[0].shipments[0].status).toBe("returned");
  });

  it("cancelled — строка с отменой по индексу ошибок", () => {
    const charges = makeOrder("8", [
      ["Выручка", 1, 1000],
      ["Эквайринг", 1, -20],
      ["Логистика", 1, -100],
      ["Вознаграждение за продажу", 1, -150],
      ["Превышение индекса ошибок: отмена", 1, -50],
    ]);
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("cancelled");
  });

  it("завершён + прошлый период — выручка, нет возврата выручки, нет эквайринга (остаток по прошлому отчёту)", () => {
    const charges = makeOrder("9", [
      ["Выручка", 1, 1000],
      ["Логистика", 1, -100],
      ["Вознаграждение за продажу", 1, -150],
    ]);
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("success");
    expect(orders[0].isFromPreviousPeriod).toBe(true);
  });

  it("только выручка — тоже прошлый период (без эквайринга, без «Возврат выручки» в totals)", () => {
    const charges = makeOrder("10", [["Выручка", 1, 1000]]);
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("success");
    expect(orders[0].isFromPreviousPeriod).toBe(true);
  });

  it("не partial_return, если только обратная логистика без «Возврат выручки» (есть выручка в отчёте)", () => {
    const charges = [
      ...makeOrder("12", [
        ["Выручка", 2, 2000],
        ["Эквайринг", 2, -20],
        ["Логистика", 2, -100],
        ["Вознаграждение за продажу", 2, -150],
      ]),
      ...makeOrder("12", [["Обратная логистика", 1, -50]]),
    ];
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("incomplete");
  });

  it("full_return: выручка схлопнута, но эквайринг нет — partial_return", () => {
    const charges = [
      ...makeOrder("13", [
        ["Выручка", 1, 500],
        ["Эквайринг", 1, -20],
        ["Логистика", 1, -50],
        ["Вознаграждение за продажу", 1, -30],
      ]),
      ...makeOrder("13", [["Возврат выручки", 1, -500]]),
    ];
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].classification).toBe("partial_return");
  });

  it("full_return: сумма единиц «Обработка…» = логистика + обратная (без положительной выручки)", () => {
    const charges = makeOrder("14", [
      ["Логистика", 2, -100],
      ["Обратная логистика", 2, -100],
      ["Обработка возвратов, отмен и невыкупов партнёрами", 4, -50],
    ]);
    const { orders } = consolidate(charges);
    classifyOrders(orders);
    expect(orders[0].qtySumLogistics).toBe(2);
    expect(orders[0].qtySumReturnLogistics).toBe(2);
    expect(orders[0].qtySumReturnProcessing).toBe(4);
    expect(orders[0].classification).toBe("full_return");
  });

  it("без выручки: только прямая логистика (нет return-категорий) — incomplete", () => {
    const charges = makeOrder("15", [["Логистика", 2, -100]]);
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

  it("«невостребован…» → returnProcessing", () => {
    expect(classifyChargeType("Обработка отменённых и невостребованных товаров")).toBe("returnProcessing");
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
