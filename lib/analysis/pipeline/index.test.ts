import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { consolidateAndAnalyze } from "./index";

/**
 * Строит минимальный .xlsx-буфер для теста оркестратора.
 */
function makeXlsxBuffer(): Buffer {
  const aoa: any[][] = [
    ["За период: 01.10.2025 - 31.10.2025"],
    [
      "ID начисления",
      "Дата начисления",
      "Группа услуг",
      "Тип начисления",
      "Артикул",
      "SKU",
      "Название товара",
      "Количество",
      "Цена продавца",
      "Дата принятия заказа в обработку или оказания услуги",
      "Платформа продажи",
      "Схема работы",
      "Вознаграждение Ozon, %",
      "Индекс локализации, %",
      "Среднее время доставки, часы",
      "Сумма итого, руб.",
    ],
    [
      "1001-1",
      "05.10.2025",
      "Продажи",
      "Выручка",
      "ART-1",
      "SKU-1",
      "Товар A",
      1,
      1000,
      "04.10.2025",
      "Ozon",
      "FBO",
      15,
      0,
      0,
      1000,
    ],
    [
      "1001-1",
      "05.10.2025",
      "Услуги",
      "Вознаграждение за продажу",
      "ART-1",
      "SKU-1",
      "Товар A",
      1,
      1000,
      "04.10.2025",
      "Ozon",
      "FBO",
      15,
      0,
      0,
      -150,
    ],
    [
      "1001-1",
      "05.10.2025",
      "Услуги",
      "Логистика",
      "ART-1",
      "SKU-1",
      "Товар A",
      1,
      1000,
      "04.10.2025",
      "Ozon",
      "FBO",
      15,
      0,
      0,
      -60,
    ],
    [
      "1001-1",
      "05.10.2025",
      "Услуги",
      "Эквайринг",
      "ART-1",
      "SKU-1",
      "Товар A",
      1,
      1000,
      "04.10.2025",
      "Ozon",
      "FBO",
      15,
      0,
      0,
      -20,
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("consolidateAndAnalyze (smoke)", () => {
  it("консолидирует минимальный файл и строит метрики", async () => {
    const buffer = makeXlsxBuffer();
    const costMap = new Map<string, number>([["ART-1", 400]]);

    const { report, analytics, costMatch } = await consolidateAndAnalyze({
      files: [{ name: "sample.xlsx", buffer }],
      costMap,
    });

    expect(report.orders).toHaveLength(1);
    const order = report.orders[0];
    expect(order.orderKey).toBe("1001");
    expect(order.classification).toBe("success");
    expect(order.hasCost).toBe(true);
    expect(order.totalCost).toBe(400);
    expect(order.totalAmountRub).toBe(770); // 1000 - 150 - 60 - 20

    expect(analytics.summary.successOrders).toBe(1);
    expect(analytics.summary.totalOrders).toBe(1);
    expect(analytics.productAggregates).toHaveLength(1);
    expect(analytics.productAggregates[0].hasCost).toBe(true);

    expect(costMatch.matchedArticles.has("ART-1")).toBe(true);
    expect(costMatch.unmatchedArticles.size).toBe(0);
  });
});
