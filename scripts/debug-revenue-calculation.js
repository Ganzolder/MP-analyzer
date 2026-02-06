/**
 * Скрипт для отладки расчёта выручки и баллов
 * Анализирует два файла и сравнивает результаты
 */

const fs = require("fs");
const path = require("path");
const { analyzeReport } = require("../lib/analysis/analyzer");

const file1 = path.join(process.cwd(), "test", "BF", "DD", "Отчет по начислениям_01.02.2025-28.02.2025.xlsx");
const file2 = path.join(process.cwd(), "test", "BF", "DD", "Отчет по начислениям_01.01.2025-31.01.2025.xlsx");

async function main() {
  console.log("=".repeat(80));
  console.log("🔍 ОТЛАДКА РАСЧЁТА ВЫРУЧКИ И БАЛЛОВ");
  console.log("=".repeat(80));

  // Анализируем каждый файл отдельно
  console.log("\n📄 Файл 1:", path.basename(file1));
  const buffer1 = fs.readFileSync(file1);
  const result1 = await analyzeReport(buffer1, path.basename(file1));
  
  console.log("   Выручка (revenueAmount):", result1.summary.revenueAmount.toLocaleString("ru-RU"), "₽");
  console.log("   Баллы за скидки (pointsAmount):", result1.summary.pointsAmount.toLocaleString("ru-RU"), "₽");
  console.log("   Валовая выручка (grossRevenue):", result1.summary.grossRevenue.toLocaleString("ru-RU"), "₽");
  console.log("   Заказов:", result1.summary.totalOrders);
  
  // Подсчитываем вручную из заказов
  let manualRevenue1 = 0;
  let manualPoints1 = 0;
  for (const order of result1.orders || []) {
    manualRevenue1 += order.revenueAmount || 0;
    manualPoints1 += order.pointsAmount || 0;
  }
  console.log("   [Проверка] Сумма revenueAmount из заказов:", manualRevenue1.toLocaleString("ru-RU"), "₽");
  console.log("   [Проверка] Сумма pointsAmount из заказов:", manualPoints1.toLocaleString("ru-RU"), "₽");

  console.log("\n📄 Файл 2:", path.basename(file2));
  const buffer2 = fs.readFileSync(file2);
  const result2 = await analyzeReport(buffer2, path.basename(file2));
  
  console.log("   Выручка (revenueAmount):", result2.summary.revenueAmount.toLocaleString("ru-RU"), "₽");
  console.log("   Баллы за скидки (pointsAmount):", result2.summary.pointsAmount.toLocaleString("ru-RU"), "₽");
  console.log("   Валовая выручка (grossRevenue):", result2.summary.grossRevenue.toLocaleString("ru-RU"), "₽");
  console.log("   Заказов:", result2.summary.totalOrders);
  
  // Подсчитываем вручную из заказов
  let manualRevenue2 = 0;
  let manualPoints2 = 0;
  for (const order of result2.orders || []) {
    manualRevenue2 += order.revenueAmount || 0;
    manualPoints2 += order.pointsAmount || 0;
  }
  console.log("   [Проверка] Сумма revenueAmount из заказов:", manualRevenue2.toLocaleString("ru-RU"), "₽");
  console.log("   [Проверка] Сумма pointsAmount из заказов:", manualPoints2.toLocaleString("ru-RU"), "₽");

  // Суммируем
  const totalRevenue = result1.summary.revenueAmount + result2.summary.revenueAmount;
  const totalPoints = result1.summary.pointsAmount + result2.summary.pointsAmount;
  
  console.log("\n" + "=".repeat(80));
  console.log("📊 ИТОГО (сумма двух файлов):");
  console.log("=".repeat(80));
  console.log("   Выручка (revenueAmount):", totalRevenue.toLocaleString("ru-RU"), "₽");
  console.log("   Баллы за скидки (pointsAmount):", totalPoints.toLocaleString("ru-RU"), "₽");
  console.log("   Валовая выручка:", (totalRevenue + totalPoints).toLocaleString("ru-RU"), "₽");
  
  console.log("\n📊 ОЖИДАЕМЫЕ ЗНАЧЕНИЯ (из Excel):");
  console.log("=".repeat(80));
  console.log("   Выручка: 447620,93 ₽");
  console.log("   Баллы за скидки: 1112285,5 ₽");
  
  console.log("\n📊 РАЗНИЦА:");
  console.log("=".repeat(80));
  console.log("   Выручка: разница", (totalRevenue - 447620.93).toLocaleString("ru-RU"), "₽");
  console.log("   Баллы: разница", (totalPoints - 1112285.5).toLocaleString("ru-RU"), "₽");
  
  // Проверяем дубликаты заказов
  const orderNumbers1 = new Set((result1.orders || []).map(o => o.orderNumber));
  const orderNumbers2 = new Set((result2.orders || []).map(o => o.orderNumber));
  const duplicates = [...orderNumbers1].filter(n => orderNumbers2.has(n));
  
  if (duplicates.length > 0) {
    console.log("\n⚠️  ОБНАРУЖЕНЫ ДУБЛИКАТЫ ЗАКАЗОВ:", duplicates.length);
    console.log("   Первые 10:", duplicates.slice(0, 10).join(", "));
    
    // Проверяем суммы по дубликатам
    let duplicateRevenue = 0;
    let duplicatePoints = 0;
    for (const orderNum of duplicates.slice(0, 5)) {
      const order1 = (result1.orders || []).find(o => o.orderNumber === orderNum);
      const order2 = (result2.orders || []).find(o => o.orderNumber === orderNum);
      if (order1 && order2) {
        console.log(`\n   Заказ ${orderNum}:`);
        console.log(`     Файл 1: revenue=${order1.revenueAmount}, points=${order1.pointsAmount}`);
        console.log(`     Файл 2: revenue=${order2.revenueAmount}, points=${order2.pointsAmount}`);
        duplicateRevenue += order1.revenueAmount + order2.revenueAmount;
        duplicatePoints += order1.pointsAmount + order2.pointsAmount;
      }
    }
    console.log(`\n   Сумма по первым 5 дубликатам: revenue=${duplicateRevenue}, points=${duplicatePoints}`);
  }
}

main().catch(console.error);
