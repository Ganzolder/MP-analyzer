/**
 * Скрипт для проверки подключения к Supabase и работы БД
 * Запуск: node scripts/check-database.js
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: ["query", "error", "warn"],
});

async function checkDatabase() {
  console.log("🔍 Проверка подключения к базе данных...\n");

  try {
    // 1. Проверка подключения
    console.log("1. Проверка подключения...");
    await prisma.$connect();
    console.log("   ✅ Подключение успешно\n");

    // 2. Проверка существования таблиц
    console.log("2. Проверка существования таблиц...");
    const tables = [
      "User",
      "Account",
      "Session",
      "VerificationToken",
      "Report",
      "CostData",
      "Subscription",
      "AIUsageLog",
    ];

    for (const table of tables) {
      try {
        // Пытаемся выполнить простой запрос к таблице
        const modelName = table.charAt(0).toLowerCase() + table.slice(1);
        const result = await prisma[modelName].findFirst({
          take: 1,
        });
        console.log(`   ✅ Таблица "${table}" существует`);
      } catch (error) {
        if (error.message?.includes("does not exist") || error.message?.includes("Unknown model")) {
          console.log(`   ❌ Таблица "${table}" не найдена`);
        } else {
          console.log(`   ⚠️  Таблица "${table}" - ошибка: ${error.message}`);
        }
      }
    }
    console.log();

    // 3. Проверка RLS (попытка создать тестовую запись)
    console.log("3. Проверка RLS и возможности записи...");
    try {
      const testReport = await prisma.report.create({
        data: {
          id: `test-${Date.now()}`,
          fileName: "test-check.db",
          fileSize: 0,
          filePath: "test",
          status: "completed",
          progress: 100,
          currentStep: "Проверка БД",
          analysisResults: JSON.stringify({ test: true }),
        },
      });
      console.log("   ✅ Запись в таблицу Report успешна");
      console.log(`   ID записи: ${testReport.id}`);

      // Удаляем тестовую запись
      await prisma.report.delete({
        where: { id: testReport.id },
      });
      console.log("   ✅ Тестовая запись удалена\n");
    } catch (error) {
      console.log(`   ❌ Ошибка записи: ${error.message}\n`);
    }

    // 4. Проверка чтения
    console.log("4. Проверка чтения данных...");
    const reportsCount = await prisma.report.count();
    console.log(`   ✅ Найдено отчётов в БД: ${reportsCount}\n`);

    // 5. Проверка структуры таблицы Report
    console.log("5. Проверка структуры таблицы Report...");
    try {
      const sample = await prisma.report.findFirst({
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          status: true,
          createdAt: true,
        },
      });
      if (sample) {
        console.log("   ✅ Структура таблицы корректна");
        console.log(`   Пример записи: ${JSON.stringify(sample, null, 2)}`);
      } else {
        console.log("   ✅ Таблица пуста (это нормально для нового проекта)");
      }
    } catch (error) {
      console.log(`   ❌ Ошибка: ${error.message}`);
    }

    console.log("\n✅ Проверка завершена успешно!");
  } catch (error) {
    console.error("\n❌ Критическая ошибка:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
