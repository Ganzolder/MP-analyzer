import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/db/prisma";

export const maxDuration = 300;

async function ensureCategoryCommissionTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "CategoryCommission" (
      "id" TEXT NOT NULL,
      "marketplace" TEXT NOT NULL DEFAULT 'ozon',
      "categoryId" TEXT,
      "categoryName" TEXT NOT NULL,
      "productType" TEXT,
      "categoryPath" TEXT,
      "fboUpTo100" DOUBLE PRECISION,
      "fbo100To300" DOUBLE PRECISION,
      "fbo300To500" DOUBLE PRECISION,
      "fbo500To1500" DOUBLE PRECISION,
      "fboOver1500" DOUBLE PRECISION,
      "fboFreshUpTo100" DOUBLE PRECISION,
      "fboFresh100To300" DOUBLE PRECISION,
      "fboFreshOver300" DOUBLE PRECISION,
      "fbsUpTo100" DOUBLE PRECISION,
      "fbs100To300" DOUBLE PRECISION,
      "fbsOver300" DOUBLE PRECISION,
      "rfbs" DOUBLE PRECISION,
      "fulfillment" TEXT NOT NULL DEFAULT 'matrix',
      "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "minCommissionAmount" DOUBLE PRECISION,
      "fixedFeeAmount" DOUBLE PRECISION,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "validFrom" TIMESTAMP(3),
      "validTo" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CategoryCommission_pkey" PRIMARY KEY ("id")
    )
  `;

  // Мягкое обновление схемы (если таблица была создана старой версией)
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "productType" TEXT`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fboUpTo100" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fbo100To300" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fbo300To500" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fbo500To1500" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fboOver1500" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fboFreshUpTo100" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fboFresh100To300" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fboFreshOver300" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fbsUpTo100" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fbs100To300" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fbsOver300" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "rfbs" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "fulfillment" TEXT NOT NULL DEFAULT 'matrix'`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0`;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "CategoryCommission_marketplace_categoryName_idx"
    ON "CategoryCommission"("marketplace", "categoryName")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "CategoryCommission_marketplace_categoryId_idx"
    ON "CategoryCommission"("marketplace", "categoryId")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "CategoryCommission_marketplace_categoryPath_idx"
    ON "CategoryCommission"("marketplace", "categoryPath")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "CategoryCommission_marketplace_productType_idx"
    ON "CategoryCommission"("marketplace", "productType")
  `;
}

/**
 * POST /api/category-commissions/upload
 * Загрузка файла с категориями и комиссиями маркетплейса (например, Ozon)
 *
 * Ожидается Excel (.xlsx / .xls) с колонками примерно вида:
 * - Категория / Наименование категории
 * - Путь категории (опционально)
 * - Код категории (опционально)
 * - Ставка комиссии для разных типов размещения (FBO / FBS / RFBS и т.п.) в отдельных колонках
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Файл не загружен" },
        { status: 400 }
      );
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Неподдерживаемый формат. Поддерживаются .xlsx и .xls" },
        { status: 400 }
      );
    }

    console.log("📦 [API] Загрузка категорий и комиссий из файла:", file.name);

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
    }) as any[][];

    if (data.length < 2) {
      return NextResponse.json(
        { error: "Файл пуст или содержит только заголовки" },
        { status: 400 }
      );
    }

    const headers = data[0].map((h: any) => String(h || ""));

    console.log("📋 [API] Заголовки файла категорий:", headers.map((h) => h.toLowerCase().trim()));

    const normalizeHeader = (h: string) =>
      h.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const normalizedHeaders = headers.map(normalizeHeader);

    // Поиск индекса колонки по списку сигнатур.
    // Важно: НЕ используем обратную проверку p.includes(header),
    // иначе "подкатегория" ложно матчится как "категория".
    const findColumnIndex = (possibleNames: string[]): number => {
      for (let i = 0; i < headers.length; i++) {
        const header = normalizedHeaders[i];
        for (const possible of possibleNames) {
          const p = normalizeHeader(possible);
          if (header === p || header.includes(p)) {
            return i;
          }
        }
      }
      return -1;
    };

    // Основные колонки
    const idxCategory = findColumnIndex([
      "категория",
      "наименование категории",
      "категория товара",
    ]);
    const idxProductType = findColumnIndex([
      "тип товара",
      "подкатегория",
      "вид товара",
    ]);
    const idxFboUpTo100 = findColumnIndex(["fbo до 100 руб"]);
    const idxFbo100To300 = findColumnIndex(["fbo свыше 100 до 300 руб"]);
    const idxFbo300To500 = findColumnIndex(["fbo свыше 300 до 500 руб"]);
    const idxFbo500To1500 = findColumnIndex(["fbo свыше 500 до 1500 руб"]);
    const idxFboOver1500 = findColumnIndex(["fbo свыше 1500 руб"]);
    const idxFboFreshUpTo100 = findColumnIndex(["fbo fresh до 100 руб", "fbo freshдо 100 руб"]);
    const idxFboFresh100To300 = findColumnIndex(["fbo fresh свыше 100 до 300 руб"]);
    const idxFboFreshOver300 = findColumnIndex(["fbo fresh свыше 300 руб"]);
    const idxFbsUpTo100 = findColumnIndex(["fbs до 100 руб"]);
    const idxFbs100To300 = findColumnIndex(["fbs свыше 100 до 300 руб"]);
    const idxFbsOver300 = findColumnIndex(["fbs свыше 300 руб"]);
    const idxRfbs = findColumnIndex(["rfbs"]);

    if (idxCategory === -1) {
      return NextResponse.json(
        {
          error:
            "Не найдена колонка 'Категория'.",
        },
        { status: 400 }
      );
    }
    const requiredColumns = [
      ["Тип товара", idxProductType],
      ["FBO до 100 руб.", idxFboUpTo100],
      ["FBO свыше 100 до 300 руб.", idxFbo100To300],
      ["FBO свыше 300 до 500 руб.", idxFbo300To500],
      ["FBO свыше 500 до 1500 руб.", idxFbo500To1500],
      ["FBO свыше 1500 руб.", idxFboOver1500],
      ["FBO Fresh до 100 руб.", idxFboFreshUpTo100],
      ["FBO Fresh свыше 100 до 300 руб.", idxFboFresh100To300],
      ["FBO Fresh свыше 300 руб.", idxFboFreshOver300],
      ["FBS до 100 руб.", idxFbsUpTo100],
      ["FBS свыше 100 до 300 руб.", idxFbs100To300],
      ["FBS свыше 300 руб.", idxFbsOver300],
      ["RFBS", idxRfbs],
    ] as const;
    const missing = requiredColumns.filter(([, idx]) => idx === -1).map(([name]) => name);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `В файле не найдены обязательные колонки: ${missing.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Вспомогательные парсеры
    const parseNumber = (value: any): number | null => {
      if (value === null || value === undefined || value === "") return null;
      if (typeof value === "number") return isNaN(value) ? null : value;
      if (typeof value === "string") {
        const cleaned = value.trim().replace(/,/g, ".").replace(/\s/g, "");
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? null : parsed;
      }
      return null;
    };

    const parseString = (value: any): string | null => {
      if (value === null || value === undefined) return null;
      const s = String(value).trim();
      return s || null;
    };
    const parsePercent = (value: any): number | null => {
      const parsed = parseNumber(value);
      if (parsed === null) return null;
      if (parsed <= 0) return null;
      return parsed < 1 ? parsed * 100 : parsed;
    };

    const records: any[] = [];
    const errors: string[] = [];
    let lastCategoryGroup: string | null = null;
    let lastProductType: string | null = null;
    let rowsTotal = 0;
    let rowsProcessed = 0;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1;

      if (
        !row ||
        row.every(
          (cell: any) =>
            cell === null || cell === undefined || String(cell).trim() === ""
        )
      ) {
        continue;
      }

      rowsTotal += 1;

      const rawCategoryGroup = parseString(row[idxCategory]);
      const categoryGroup = rawCategoryGroup || lastCategoryGroup;
      if (!categoryGroup) {
        // В Excel часто "Категория" объединена (merged) и заполнена только в первой строке блока.
        // Если не нашли ни текущую, ни предыдущую — строка действительно невалидна.
        errors.push(`Строка ${rowNum}: пустая категория (и нет предыдущей для наследования)`);
        continue;
      }
      if (rawCategoryGroup) {
        lastCategoryGroup = rawCategoryGroup;
      }

      const rawProductType = parseString(row[idxProductType]);
      const productType = rawProductType || lastProductType;
      if (rawProductType) {
        lastProductType = rawProductType;
      }

      const fboUpTo100 = parsePercent(row[idxFboUpTo100]);
      const fbo100To300 = parsePercent(row[idxFbo100To300]);
      const fbo300To500 = parsePercent(row[idxFbo300To500]);
      const fbo500To1500 = parsePercent(row[idxFbo500To1500]);
      const fboOver1500 = parsePercent(row[idxFboOver1500]);
      const fboFreshUpTo100 = parsePercent(row[idxFboFreshUpTo100]);
      const fboFresh100To300 = parsePercent(row[idxFboFresh100To300]);
      const fboFreshOver300 = parsePercent(row[idxFboFreshOver300]);
      const fbsUpTo100 = parsePercent(row[idxFbsUpTo100]);
      const fbs100To300 = parsePercent(row[idxFbs100To300]);
      const fbsOver300 = parsePercent(row[idxFbsOver300]);
      const rfbs = parsePercent(row[idxRfbs]);

      const hasAnyRate = [
        fboUpTo100,
        fbo100To300,
        fbo300To500,
        fbo500To1500,
        fboOver1500,
        fboFreshUpTo100,
        fboFresh100To300,
        fboFreshOver300,
        fbsUpTo100,
        fbs100To300,
        fbsOver300,
        rfbs,
      ].some((v) => v !== null);

      if (!hasAnyRate) {
        continue;
      }

      rowsProcessed += 1;

      const fullPath = productType
        ? `${categoryGroup} / ${productType}`
        : categoryGroup;

      records.push({
        marketplace: "ozon",
        categoryId: null,
        categoryName: categoryGroup,
        productType: productType || null,
        categoryPath: fullPath,
        fboUpTo100,
        fbo100To300,
        fbo300To500,
        fbo500To1500,
        fboOver1500,
        fboFreshUpTo100,
        fboFresh100To300,
        fboFreshOver300,
        fbsUpTo100,
        fbs100To300,
        fbsOver300,
        rfbs,
        fulfillment: "matrix",
        commissionPercent: fboUpTo100 || fbsUpTo100 || rfbs || 0,
        minCommissionAmount: null,
        fixedFeeAmount: null,
        isActive: true,
      });
    }

    // По требованию: загружаем каждую строку Excel как отдельную запись (без дедупликации).
    const normalizedRecords = records;

    console.log(
      `📊 [API] Подготовлено записей комиссий: ${records.length} (после дедупликации: ${normalizedRecords.length}), ошибок: ${errors.length}`
    );

    if (normalizedRecords.length === 0) {
      return NextResponse.json(
        {
          error:
            "Не удалось извлечь ни одной валидной строки матрицы комиссии из файла.",
          errors: errors.slice(0, 50),
        },
        { status: 400 }
      );
    }

    // Гарантируем существование таблицы и индексов перед загрузкой
    await ensureCategoryCommissionTable();

    // Очищаем старые записи
    try {
      await prisma.categoryCommission.deleteMany({
        where: {
          marketplace: "ozon",
        },
      });
      console.log("✅ [API] Старые записи CategoryCommission для Ozon очищены");
    } catch (deleteError: any) {
      // Если таблица не существует, возвращаем понятную ошибку
      if (
        deleteError.message?.includes("does not exist") ||
        deleteError.message?.includes("CategoryCommission") ||
        deleteError.message?.includes("Unknown table") ||
        deleteError.code === "P2021"
      ) {
        return NextResponse.json(
          {
            error: "Таблица CategoryCommission не найдена в базе данных",
            message:
              "Таблица не была создана автоматически. Проверьте права пользователя БД на CREATE TABLE.",
            details:
              "Для production рекомендуется применить миграцию из prisma/migrations/add_category_commission.sql",
          },
          { status: 500 }
        );
      }
      throw deleteError;
    }

    const BATCH_SIZE = 3000;
    let inserted = 0;
    let failed = 0;

    for (let i = 0; i < normalizedRecords.length; i += BATCH_SIZE) {
      const batch = normalizedRecords.slice(i, i + BATCH_SIZE);

      try {
        await prisma.categoryCommission.createMany({
          data: batch,
        });
        inserted += batch.length;
        console.log(
          `✅ [API] Вставлено ${inserted}/${normalizedRecords.length} записей CategoryCommission`
        );
      } catch (error: any) {
        console.error(
          `❌ [API] Ошибка при вставке батча ${i}-${i + batch.length}:`,
          error.message
        );
        failed += batch.length;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Обработано строк: ${rowsProcessed}/${rowsTotal}. Загружено строк матрицы: ${inserted} (из ${normalizedRecords.length})`,
      stats: {
        total: normalizedRecords.length,
        inserted,
        failed,
        parseErrors: errors.length,
        parseErrorsSample: errors.slice(0, 50),
        rowsTotal,
        rowsProcessed,
      },
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при загрузке категорий и комиссий:", error);
    console.error("❌ [API] Stack trace:", error.stack);
    
    // Более детальная информация об ошибке
    let errorMessage = error.message || "Неизвестная ошибка";
    let errorDetails = "";
    
    // Проверяем, связана ли ошибка с БД
    if (error.message?.includes("CategoryCommission") || error.message?.includes("does not exist")) {
      errorDetails = "Таблица CategoryCommission не найдена в БД. Убедитесь, что миграция Prisma применена.";
    } else if (error.message?.includes("prisma")) {
      errorDetails = "Ошибка подключения к базе данных. Проверьте DATABASE_URL.";
    }
    
    return NextResponse.json(
      {
        error: "Ошибка при загрузке категорий и комиссий",
        message: errorMessage,
        details: errorDetails || undefined,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

