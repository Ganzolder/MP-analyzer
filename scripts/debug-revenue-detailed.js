/**
 * Детальный анализ расчёта выручки и баллов
 */

const fs = require("fs");
const path = require("path");

// Импортируем через require, так как это CommonJS
const { analyzeReport } = require("../lib/analysis/analyzer");

const file1 = path.join(process.cwd(), "test", "BF", "DD", "Отчет по начислениям_01.02.2025-28.02.2025.xlsx");
const file2 = path.join(process.cwd(), "test", "BF", "DD", "Отчет по начислениям_01.01.2025-31.01.2025.xlsx");

async function main() {
  console.log("=".repeat(80));
  console.log("🔍 ДЕТАЛЬНЫЙ АНАЛИЗ РАСЧЁТА ВЫРУЧКИ И БАЛЛОВ");
  console.log("=".repeat(80));

  // Анализируем каждый файл отдельно
  console.log("\n📄 Файл 1:", path.basename(file1));
  const buffer1 = fs.readFileSync(file1);
  const result1 = await analyzeReport(buffer1, path.basename(file1));
  
  console.log("\n   Summary из файла 1:");
  console.log("   - revenueAmount:", result1.summary.revenueAmount.toLocaleString("ru-RU"), "₽");
  console.log("   - pointsAmount:", result1.summary.pointsAmount.toLocaleString("ru-RU"), "₽");
  console.log("   - grossRevenue:", result1.summary.grossRevenue.toLocaleString("ru-RU"), "₽");
  
  // Подсчитываем вручную из заказов
  let manualRevenue1 = 0;
  let manualPoints1 = 0;
  for (const order of result1.orders || []) {
    manualRevenue1 += order.revenueAmount || 0;
    manualPoints1 += order.pointsAmount || 0;
  }
  console.log("\n   Проверка (сумма из заказов):");
  console.log("   - revenueAmount:", manualRevenue1.toLocaleString("ru-RU"), "₽");
  console.log("   - pointsAmount:", manualPoints1.toLocaleString("ru-RU"), "₽");
  console.log("   - Разница с summary:", {
    revenue: (result1.summary.revenueAmount - manualRevenue1).toFixed(2),
    points: (result1.summary.pointsAmount - manualPoints1).toFixed(2)
  });

  console.log("\n📄 Файл 2:", path.basename(file2));
  const buffer2 = fs.readFileSync(file2);
  const result2 = await analyzeReport(buffer2, path.basename(file2));
  
  console.log("\n   Summary из файла 2:");
  console.log("   - revenueAmount:", result2.summary.revenueAmount.toLocaleString("ru-RU"), "₽");
  console.log("   - pointsAmount:", result2.summary.pointsAmount.toLocaleString("ru-RU"), "₽");
  console.log("   - grossRevenue:", result2.summary.grossRevenue.toLocaleString("ru-RU"), "₽");
  
  // Подсчитываем вручную из заказов
  let manualRevenue2 = 0;
  let manualPoints2 = 0;
  for (const order of result2.orders || []) {
    manualRevenue2 += order.revenueAmount || 0;
    manualPoints2 += order.pointsAmount || 0;
  }
  console.log("\n   Проверка (сумма из заказов):");
  console.log("   - revenueAmount:", manualRevenue2.toLocaleString("ru-RU"), "₽");
  console.log("   - pointsAmount:", manualPoints2.toLocaleString("ru-RU"), "₽");
  console.log("   - Разница с summary:", {
    revenue: (result2.summary.revenueAmount - manualRevenue2).toFixed(2),
    points: (result2.summary.pointsAmount - manualPoints2).toFixed(2)
  });

  // Проверяем дубликаты заказов
  const orderNumbers1 = new Set((result1.orders || []).map(o => o.orderNumber));
  const orderNumbers2 = new Set((result2.orders || []).map(o => o.orderNumber));
  const duplicates = [...orderNumbers1].filter(n => orderNumbers2.has(n));
  
  console.log("\n" + "=".repeat(80));
  console.log("📊 АНАЛИЗ ДУБЛИКАТОВ ЗАКАЗОВ");
  console.log("=".repeat(80));
  console.log("   Всего заказов в файле 1:", orderNumbers1.size);
  console.log("   Всего заказов в файле 2:", orderNumbers2.size);
  console.log("   Дубликатов (заказы в обоих файлах):", duplicates.length);
  
  if (duplicates.length > 0) {
    console.log("\n   Первые 10 дубликатов:", duplicates.slice(0, 10).join(", "));
    
    // Анализируем суммы по дубликатам
    let duplicateRevenue1 = 0;
    let duplicatePoints1 = 0;
    let duplicateRevenue2 = 0;
    let duplicatePoints2 = 0;
    
    for (const orderNum of duplicates) {
      const order1 = (result1.orders || []).find(o => o.orderNumber === orderNum);
      const order2 = (result2.orders || []).find(o => o.orderNumber === orderNum);
      if (order1) {
        duplicateRevenue1 += order1.revenueAmount || 0;
        duplicatePoints1 += order1.pointsAmount || 0;
      }
      if (order2) {
        duplicateRevenue2 += order2.revenueAmount || 0;
        duplicatePoints2 += order2.pointsAmount || 0;
      }
    }
    
    console.log("\n   Суммы по дубликатам:");
    console.log("   - Файл 1: revenue=", duplicateRevenue1.toLocaleString("ru-RU"), "₽, points=", duplicatePoints1.toLocaleString("ru-RU"), "₽");
    console.log("   - Файл 2: revenue=", duplicateRevenue2.toLocaleString("ru-RU"), "₽, points=", duplicatePoints2.toLocaleString("ru-RU"), "₽");
    console.log("   - При объединении (сумма): revenue=", (duplicateRevenue1 + duplicateRevenue2).toLocaleString("ru-RU"), "₽, points=", (duplicatePoints1 + duplicatePoints2).toLocaleString("ru-RU"), "₽");
  }
  
  // Итоговые суммы
  const totalRevenue = result1.summary.revenueAmount + result2.summary.revenueAmount;
  const totalPoints = result1.summary.pointsAmount + result2.summary.pointsAmount;
  
  console.log("\n" + "=".repeat(80));
  console.log("📊 ИТОГО (простое суммирование summary):");
  console.log("=".repeat(80));
  console.log("   Выручка:", totalRevenue.toLocaleString("ru-RU"), "₽");
  console.log("   Баллы:", totalPoints.toLocaleString("ru-RU"), "₽");
  
  console.log("\n📊 ОЖИДАЕМЫЕ ЗНАЧЕНИЯ (из Excel):");
  console.log("=".repeat(80));
  console.log("   Выручка: 483560,89 ₽");
  console.log("   Баллы: 112285,5 ₽");
  
  console.log("\n📊 РАЗНИЦА:");
  console.log("=".repeat(80));
  console.log("   Выручка: разница", (totalRevenue - 483560.89).toLocaleString("ru-RU"), "₽");
  console.log("   Баллы: разница", (totalPoints - 112285.5).toLocaleString("ru-RU"), "₽");
}

main().catch(console.error);
