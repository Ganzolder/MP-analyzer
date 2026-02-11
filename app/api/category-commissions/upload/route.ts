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
      "categoryPath" TEXT,
      "productType" TEXT,
      "fulfillment" TEXT NOT NULL,
      "priceMin" DOUBLE PRECISION,
      "priceMax" DOUBLE PRECISION,
      "tierLabel" TEXT,
      "commissionPercent" DOUBLE PRECISION NOT NULL,
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
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "priceMin" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "priceMax" DOUBLE PRECISION`;
  await prisma.$executeRaw`ALTER TABLE "CategoryCommission" ADD COLUMN IF NOT EXISTS "tierLabel" TEXT`;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "CategoryCommission_marketplace_categoryName_fulfillment_idx"
    ON "CategoryCommission"("marketplace", "categoryName", "fulfillment")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "CategoryCommission_marketplace_categoryId_fulfillment_idx"
    ON "CategoryCommission"("marketplace", "categoryId", "fulfillment")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "CategoryCommission_marketplace_categoryPath_fulfillment_idx"
    ON "CategoryCommission"("marketplace", "categoryPath", "fulfillment")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "CategoryCommission_marketplace_fulfillment_priceMin_priceMax_idx"
    ON "CategoryCommission"("marketplace", "fulfillment", "priceMin", "priceMax")
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

    const headers = data[0].map((h: any) =>
      String(h || "").toLowerCase().trim()
    );

    console.log("📋 [API] Заголовки файла категорий:", headers);

    // Поиск индекса колонки по возможным названиям
    const findColumnIndex = (possibleNames: string[]): number => {
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        for (const possible of possibleNames) {
          if (header.includes(possible) || possible.includes(header)) {
            return i;
          }
        }
      }
      return -1;
    };

    // Основные колонки
    const idxCategoryName = findColumnIndex([
      "категория",
      "наименование категории",
      "категория товара",
    ]);
    const idxCategoryPath = findColumnIndex([
      "путь категории",
      "полная категория",
      "иерархия категорий",
    ]);
    const idxCategoryId = findColumnIndex([
      "id категории",
      "идентификатор категории",
      "код категории",
      "category id",
    ]);
    const idxProductType = findColumnIndex([
      "тип товара",
      "подкатегория",
      "вид товара",
      "тип",
    ]);

    if (idxCategoryName === -1) {
      return NextResponse.json(
        {
          error:
            "Не найдена колонка с названием категории. Ожидается что-то вроде 'Категория', 'Наименование категории' или 'Категория товара'.",
        },
        { status: 400 }
      );
    }

    // Колонки ставок: в файлах Ozon часто есть много колонок FBO/FBS с диапазонами цен.
    // Собираем ВСЕ подходящие колонки, а не только одну.
    type CommissionColumn = {
      fulfillment: string; // fbo, fbo_fresh, fbs, rfbs
      index: number;
      priceMin: number | null;
      priceMax: number | null;
      tierLabel: string;
    };

    const normalizeHeader = (h: string) =>
      h
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const parseRubRange = (
      header: string
    ): { priceMin: number | null; priceMax: number | null } => {
      const h = normalizeHeader(header);

      const toNum = (s: string) => parseFloat(s.replace(",", "."));

      // "до 100 руб."
      let m = h.match(/до\s*(\d+(?:[.,]\d+)?)\s*руб/);
      if (m) {
        return { priceMin: 0, priceMax: toNum(m[1]) };
      }

      // "свыше 100 до 300 руб."
      m = h.match(/свыше\s*(\d+(?:[.,]\d+)?)\s*(?:руб\.?)?\s*до\s*(\d+(?:[.,]\d+)?)\s*руб/);
      if (m) {
        return { priceMin: toNum(m[1]), priceMax: toNum(m[2]) };
      }

      // "свыше 1500 руб."
      m = h.match(/свыше\s*(\d+(?:[.,]\d+)?)\s*руб/);
      if (m) {
        return { priceMin: toNum(m[1]), priceMax: null };
      }

      return { priceMin: null, priceMax: null };
    };

    const commissionColumns: CommissionColumn[] = [];

    for (let i = 0; i < headers.length; i++) {
      const raw = String(data[0][i] ?? "");
      const h = normalizeHeader(raw);
      if (!h) continue;

      // пропускаем не-колонки комиссий
      if (
        h.includes("категор") ||
        h.includes("наименование") ||
        h.includes("путь") ||
        h.includes("иерарх") ||
        h.includes("код") ||
        h.includes("id ") ||
        h === "id" ||
        h.includes("тип товара")
      ) {
        continue;
      }

      let fulfillment: string | null = null;
      if (h.includes("rfbs")) fulfillment = "rfbs";
      else if (h.includes("fbo fresh")) fulfillment = "fbo_fresh";
      else if (h.startsWith("fbo") || h.includes(" fbo")) fulfillment = "fbo";
      else if (h.startsWith("fbs") || h.includes(" fbs")) fulfillment = "fbs";

      if (!fulfillment) continue;

      const { priceMin, priceMax } = parseRubRange(raw);
      commissionColumns.push({
        fulfillment,
        index: i,
        priceMin,
        priceMax,
        tierLabel: normalizeHeader(raw),
      });
    }

    if (commissionColumns.length === 0) {
      return NextResponse.json(
        {
          error:
            "Не найдены колонки со ставками комиссии (FBO/FBS/RFBS). Проверьте заголовки файла.",
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

    const records: any[] = [];
    const errors: string[] = [];

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

      const categoryGroup = parseString(row[idxCategoryName]);
      if (!categoryGroup) {
        errors.push(`Строка ${rowNum}: пустое название категории`);
        continue;
      }

      const fileCategoryPath = idxCategoryPath !== -1
        ? parseString(row[idxCategoryPath])
        : null;
      const categoryId = idxCategoryId !== -1
        ? parseString(row[idxCategoryId])
        : null;
      const productType = idxProductType !== -1
        ? parseString(row[idxProductType])
        : null;

      // Нормализуем на "самый конкретный" путь:
      // categoryPath = "Категория / Тип товара" (если есть)
      const fullPath = productType
        ? `${categoryGroup} / ${productType}`
        : (fileCategoryPath || categoryGroup);
      const categoryName = productType || categoryGroup;

      // Для каждой колонки со ставкой создаём отдельную запись CategoryCommission
      for (const col of commissionColumns) {
        const rawValue = row[col.index];
        let percent = parseNumber(rawValue);

        if (percent === null) {
          continue;
        }

        if (percent <= 0) {
          // Нулевые или отрицательные значения считаем невалидными ставками
          continue;
        }

        // Если процент записан как десятичная дробь (например, 0.14 вместо 14),
        // умножаем на 100 для преобразования в проценты
        if (percent < 1 && percent > 0) {
          percent = percent * 100;
          console.log(`[API] Преобразовано ${rawValue} → ${percent}% (строка ${rowNum}, ${col.type})`);
        }

        records.push({
          marketplace: "ozon",
          categoryId,
          categoryName,
          categoryPath: fullPath,
          productType,
          fulfillment: col.fulfillment,
          priceMin: col.priceMin,
          priceMax: col.priceMax,
          tierLabel: col.tierLabel,
          commissionPercent: percent,
          minCommissionAmount: null,
          fixedFeeAmount: null,
          isActive: true,
        });
      }
    }

    const dedupMap = new Map<string, (typeof records)[number]>();
    for (const record of records) {
      const key = [
        record.marketplace,
        (record.categoryId || "").toLowerCase(),
        record.categoryName.toLowerCase(),
        (record.categoryPath || "").toLowerCase(),
        record.fulfillment.toLowerCase(),
        String(record.priceMin ?? ""),
        String(record.priceMax ?? ""),
      ].join("|");
      dedupMap.set(key, record);
    }
    const normalizedRecords = Array.from(dedupMap.values());

    console.log(
      `📊 [API] Подготовлено записей комиссий: ${records.length} (после дедупликации: ${normalizedRecords.length}), ошибок: ${errors.length}`
    );

    if (normalizedRecords.length === 0) {
      return NextResponse.json(
        {
          error:
            "Не удалось извлечь ни одной валидной ставки комиссии из файла. Проверьте, что в колонках FBO/FBS/RFBS есть числовые значения.",
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
      message: `Загружено ${inserted} ставок комиссии (из ${normalizedRecords.length})`,
      stats: {
        total: normalizedRecords.length,
        inserted,
        failed,
        parseErrors: errors.length,
        parseErrorsSample: errors.slice(0, 50),
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

