import { describe, it, expect } from "vitest";
import { buildOrderAccrualDetail, mergeOrderAccrualDetails } from "./order-accrual-detail";
import type { ChargeLine } from "../domain";
import { classifyChargeType } from "../charge-types";

function line(partial: Partial<ChargeLine> & Pick<ChargeLine, "orderKey" | "chargeType" | "totalAmount">): ChargeLine {
  return {
    sourceFile: "f.xlsx",
    sourceRow: 1,
    chargeId: partial.chargeId ?? "id-1",
    orderKey: partial.orderKey,
    shipmentSuffix: null,
    chargeDate: new Date(2025, 0, 1),
    serviceGroup: partial.serviceGroup ?? "",
    chargeType: partial.chargeType,
    category: partial.category ?? classifyChargeType(partial.chargeType),
    article: "",
    sku: "",
    productName: "",
    quantity: 1,
    sellerPrice: 0,
    orderDate: null,
    platform: "",
    workScheme: "FBO",
    ozonCommissionPercent: 0,
    localizationIndex: 0,
    avgDeliveryHours: 0,
    totalAmount: partial.totalAmount,
    isPoints: partial.isPoints ?? false,
  };
}

describe("buildOrderAccrualDetail", () => {
  it("null если нет строк с таким orderKey", () => {
    const charges: ChargeLine[] = [line({ orderKey: "11", chargeType: "Выручка", totalAmount: 100 })];
    expect(buildOrderAccrualDetail(charges, "99")).toBeNull();
  });

  it("группа из serviceGroup, два типа сливаются по chargeType", () => {
    const charges: ChargeLine[] = [
      line({ orderKey: "11", serviceGroup: "Логистика", chargeType: "Последняя миля", totalAmount: -50 }),
      line({ orderKey: "11", serviceGroup: "Логистика", chargeType: "Последняя миля", totalAmount: -30 }),
      line({ orderKey: "11", serviceGroup: "Логистика", chargeType: "Магистраль", totalAmount: -20 }),
    ];
    const d = buildOrderAccrualDetail(charges, "11")!;
    const log = d.rub.groups.find((g) => g.groupName === "Логистика");
    expect(log).toBeDefined();
    const pm = log!.types.find((t) => t.chargeType === "Последняя миля");
    expect(pm?.amount).toBe(-80);
    expect(pm?.lineCount).toBe(2);
    expect(d.points).toBeNull();
  });

  it("выручка и баллы за скидки в одной группе «Продажи»", () => {
    const charges: ChargeLine[] = [
      line({ orderKey: "12", chargeType: "Выручка", totalAmount: 1000, isPoints: false }),
      line({ orderKey: "12", chargeType: "Баллы за скидки", totalAmount: 5, isPoints: true }),
    ];
    const d = buildOrderAccrualDetail(charges, "12")!;
    expect(d.points).toBeNull();
    const sales = d.rub.groups.find((g) => g.groupName === "Продажи");
    expect(sales).toBeDefined();
    expect(sales!.subtotal).toBe(1005);
    expect(sales!.hasMixedUnits).toBeFalsy();
    expect(sales!.types.find((t) => t.chargeType === "Выручка")?.isPoints).toBe(false);
    expect(sales!.types.find((t) => t.chargeType === "Баллы за скидки")?.isPoints).toBe(true);
  });
});

describe("mergeOrderAccrualDetails", () => {
  it("складывает суммы по тому же типу из двух фрагментов одного заказа", () => {
    const a = buildOrderAccrualDetail(
      [line({ orderKey: "11", chargeType: "Выручка", totalAmount: 100 })],
      "11"
    )!;
    const b = buildOrderAccrualDetail(
      [line({ orderKey: "11", chargeType: "Выручка", totalAmount: 50 })],
      "11"
    )!;
    const m = mergeOrderAccrualDetails([a, b])!;
    const rev = m.rub.groups.flatMap((g) => g.types).find((t) => t.chargeType === "Выручка");
    expect(rev?.amount).toBe(150);
    expect(rev?.lineCount).toBe(2);
  });
});
