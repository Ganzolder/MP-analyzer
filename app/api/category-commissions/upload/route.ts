import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/db/prisma";

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

    if (idxCategoryName === -1) {
      return NextResponse.json(
        {
          error:
            "Не найдена колонка с названием категории. Ожидается что-то вроде 'Категория', 'Наименование категории' или 'Категория товара'.",
        },
        { status: 400 }
      );
    }

    // Колонки ставок для разных типов размещения.
    // Здесь мы предполагаем, что в вашем файле есть отдельные колонки для FBO/FBS и т.п.
    // Ищем их по фрагментам названий.
    type FulfillmentColumn = {
      type: string;
      index: number;
    };

    const fulfillmentColumns: FulfillmentColumn[] = [];

    const pushIfFound = (type: string, names: string[]) => {
      const idx = findColumnIndex(names);
      if (idx !== -1) {
        fulfillmentColumns.push({ type, index: idx });
      }
    };

    // Примеры заголовков из типовых файлов Ozon:
    // "FBO", "FBO (центральный склад)", "FBS", "RFBS", "Комиссия FBO", "Комиссия FBS" и т.п.
    pushIfFound("fbo", ["fbo", "фbo", "комиссия fbo", "центральный склад"]);
    pushIfFound("fbs", ["fbs", "фbs", "комиссия fbs"]);
    pushIfFound("rfbs", ["rfbs", "r fbs", "комиссия rfbs"]);

    if (fulfillmentColumns.length === 0) {
      return NextResponse.json(
        {
          error:
            "Не найдены колонки со ставками комиссии для типов размещения (FBO/FBS/RFBS). Проверьте заголовки файла.",
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

      const categoryName = parseString(row[idxCategoryName]);
      if (!categoryName) {
        errors.push(`Строка ${rowNum}: пустое название категории`);
        continue;
      }

      const categoryPath = idxCategoryPath !== -1
        ? parseString(row[idxCategoryPath])
        : null;
      const categoryId = idxCategoryId !== -1
        ? parseString(row[idxCategoryId])
        : null;

      // Для каждой колонки со ставкой создаём отдельную запись CategoryCommission
      for (const col of fulfillmentColumns) {
        const rawValue = row[col.index];
        const percent = parseNumber(rawValue);

        if (percent === null) {
          continue;
        }

        if (percent <= 0) {
          // Нулевые или отрицательные значения считаем невалидными ставками
          continue;
        }

        records.push({
          marketplace: "ozon",
          categoryId,
          categoryName,
          categoryPath,
          fulfillment: col.type,
          commissionPercent: percent,
          minCommissionAmount: null,
          fixedFeeAmount: null,
          isActive: true,
        });
      }
    }

    console.log(
      `📊 [API] Подготовлено записей комиссий: ${records.length}, ошибок: ${errors.length}`
    );

    if (records.length === 0) {
      return NextResponse.json(
        {
          error:
            "Не удалось извлечь ни одной валидной ставки комиссии из файла. Проверьте, что в колонках FBO/FBS/RFBS есть числовые значения.",
          errors: errors.slice(0, 50),
        },
        { status: 400 }
      );
    }

    // На всякий случай можно очистить старые записи по Ozon перед заливкой,
    // если таблица полностью заменяется.
    await prisma.categoryCommission.deleteMany({
      where: {
        marketplace: "ozon",
      },
    });

    const BATCH_SIZE = 1000;
    let inserted = 0;
    let failed = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      try {
        await prisma.categoryCommission.createMany({
          data: batch,
        });
        inserted += batch.length;
        console.log(
          `✅ [API] Вставлено ${inserted}/${records.length} записей CategoryCommission`
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
      message: `Загружено ${inserted} ставок комиссии (из ${records.length})`,
      stats: {
        total: records.length,
        inserted,
        failed,
        parseErrors: errors.length,
        parseErrorsSample: errors.slice(0, 50),
      },
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при загрузке категорий и комиссий:", error);
    return NextResponse.json(
      {
        error: "Ошибка при загрузке категорий и комиссий",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

