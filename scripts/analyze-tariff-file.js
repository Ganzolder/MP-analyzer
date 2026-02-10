/**
 * Скрипт для анализа структуры файла с тарифами
 * Помогает понять, какие колонки есть в файле
 */

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

/**
 * Анализирует файл с тарифами и выводит структуру
 */
async function analyzeTariffFile(filePath) {
  try {
    console.log("📊 Анализ файла:", filePath);
    console.log("=".repeat(60));

    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      console.error("❌ Файл не найден:", filePath);
      return;
    }

    // Читаем файл
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    console.log("📄 Лист:", firstSheetName);
    console.log("📋 Всего листов:", workbook.SheetNames.length);

    // Конвертируем в массив
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

    if (data.length === 0) {
      console.error("❌ Файл пуст");
      return;
    }

    // Первая строка - заголовки
    const headers = data[0].map((h) => String(h || "").trim());
    
    console.log("\n📌 Заголовки колонок:");
    headers.forEach((header, index) => {
      console.log(`   ${index + 1}. "${header}"`);
    });

    console.log(`\n📊 Всего строк данных: ${data.length - 1}`);
    console.log(`📊 Всего колонок: ${headers.length}`);

    // Анализируем первые 5 строк данных
    console.log("\n📝 Примеры данных (первые 5 строк):");
    for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
      const row = data[i];
      console.log(`\n   Строка ${i + 1}:`);
      headers.forEach((header, colIndex) => {
        const value = row[colIndex];
        const displayValue = value !== null && value !== undefined 
          ? String(value).substring(0, 50) 
          : "(пусто)";
        console.log(`     ${header}: ${displayValue}`);
      });
    }

    // Анализируем типы данных
    console.log("\n🔍 Анализ типов данных:");
    const columnTypes = {};
    
    for (let i = 1; i < Math.min(100, data.length); i++) {
      const row = data[i];
      headers.forEach((header, colIndex) => {
        if (!columnTypes[colIndex]) {
          columnTypes[colIndex] = new Set();
        }
        const value = row[colIndex];
        if (value !== null && value !== undefined) {
          const type = typeof value === "number" ? "number" : "string";
          columnTypes[colIndex].add(type);
        }
      });
    }

    headers.forEach((header, colIndex) => {
      const types = Array.from(columnTypes[colIndex] || []);
      console.log(`   ${header}: ${types.join(", ") || "пусто"}`);
    });

    // Статистика по заполненности
    console.log("\n📈 Статистика заполненности (первые 100 строк):");
    headers.forEach((header, colIndex) => {
      let filled = 0;
      for (let i = 1; i < Math.min(101, data.length); i++) {
        const value = data[i][colIndex];
        if (value !== null && value !== undefined && String(value).trim() !== "") {
          filled++;
        }
      }
      const percent = ((filled / Math.min(100, data.length - 1)) * 100).toFixed(1);
      console.log(`   ${header}: ${filled}/${Math.min(100, data.length - 1)} (${percent}%)`);
    });

    // Сохраняем результат в файл
    const result = {
      fileName: path.basename(filePath),
      sheetName: firstSheetName,
      totalRows: data.length - 1,
      totalColumns: headers.length,
      headers,
      sampleRows: data.slice(1, 6).map((row) => {
        const obj = {};
        headers.forEach((header, colIndex) => {
          obj[header] = row[colIndex];
        });
        return obj;
      }),
    };

    const outputPath = path.join(process.cwd(), "tariff-file-analysis.json");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\n✅ Результат сохранён в: ${outputPath}`);

  } catch (error) {
    console.error("❌ Ошибка при анализе файла:", error.message);
    console.error(error.stack);
  }
}

// Запуск
const filePath = process.argv[2];

if (!filePath) {
  console.log("Использование: node scripts/analyze-tariff-file.js <путь-к-файлу>");
  console.log("Пример: node scripts/analyze-tariff-file.js \"База/тарифы.xlsx\"");
  process.exit(1);
}

analyzeTariffFile(filePath);
