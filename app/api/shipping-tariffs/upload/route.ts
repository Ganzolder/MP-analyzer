import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/db/prisma";
import { logger } from "@/lib/utils/logger";

async function ensureShippingTariffTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "ShippingTariff" (
      "id" TEXT NOT NULL,
      "marketplace" TEXT NOT NULL DEFAULT 'ozon',
      "fromRegion" TEXT,
      "toRegion" TEXT,
      "fromCity" TEXT,
      "toCity" TEXT,
      "deliveryType" TEXT,
      "deliveryMethod" TEXT,
      "weightMin" DOUBLE PRECISION,
      "weightMax" DOUBLE PRECISION,
      "weightStep" DOUBLE PRECISION,
      "lengthMin" DOUBLE PRECISION,
      "lengthMax" DOUBLE PRECISION,
      "widthMin" DOUBLE PRECISION,
      "widthMax" DOUBLE PRECISION,
      "heightMin" DOUBLE PRECISION,
      "heightMax" DOUBLE PRECISION,
      "volumeMin" DOUBLE PRECISION,
      "volumeMax" DOUBLE PRECISION,
      "basePrice" DOUBLE PRECISION NOT NULL,
      "pricePerKg" DOUBLE PRECISION,
      "pricePerVolume" DOUBLE PRECISION,
      "pricePerKm" DOUBLE PRECISION,
      "minPrice" DOUBLE PRECISION,
      "maxPrice" DOUBLE PRECISION,
      "category" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "priority" INTEGER NOT NULL DEFAULT 0,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ShippingTariff_pkey" PRIMARY KEY ("id")
    )
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "ShippingTariff_marketplace_fromRegion_toRegion_idx"
    ON "ShippingTariff"("marketplace", "fromRegion", "toRegion")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "ShippingTariff_marketplace_deliveryType_idx"
    ON "ShippingTariff"("marketplace", "deliveryType")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "ShippingTariff_weightMin_weightMax_idx"
    ON "ShippingTariff"("weightMin", "weightMax")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "ShippingTariff_isActive_idx"
    ON "ShippingTariff"("isActive")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "ShippingTariff_priority_idx"
    ON "ShippingTariff"("priority")
  `;
}

/**
 * POST /api/shipping-tariffs/upload
 * Загрузка файла с тарифами перевозки в БД
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const deliveryMethodInput = String(formData.get("deliveryMethod") || "")
      .trim()
      .toLowerCase();

    if (!file) {
      return NextResponse.json(
        { error: "Файл не загружен" },
        { status: 400 }
      );
    }

    // Проверка формата
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls") && !lowerName.endsWith(".csv")) {
      return NextResponse.json(
        { error: "Неподдерживаемый формат. Поддерживаются .xlsx, .xls, .csv" },
        { status: 400 }
      );
    }

    console.log("📦 [API] Начало загрузки тарифов из файла:", file.name);

    // Определяем метод доставки: сначала из формы, затем по имени файла
    const fileNameLower = file.name.toLowerCase();
    let detectedDeliveryMethod: string | null =
      deliveryMethodInput === "fbo" || deliveryMethodInput === "fbs"
        ? deliveryMethodInput
        : null;
    if (!detectedDeliveryMethod && fileNameLower.includes("fbo")) {
      detectedDeliveryMethod = "fbo";
    } else if (!detectedDeliveryMethod && fileNameLower.includes("fbs")) {
      detectedDeliveryMethod = "fbs";
    }

    if (!detectedDeliveryMethod) {
      return NextResponse.json(
        {
          error:
            "Не удалось определить метод доставки. Выберите FBO или FBS в форме загрузки.",
        },
        { status: 400 }
      );
    }

    // Читаем файл
    const arrayBuffer = await file.arrayBuffer();
    let data: any[][];
    let detectedSheetName: string | null = null;
    let detectedHeaderRows: number[] = [1];

    if (lowerName.endsWith(".csv")) {
      // Парсинг CSV (нужно будет добавить библиотеку для CSV)
      return NextResponse.json(
        { error: "CSV формат пока не поддерживается. Используйте .xlsx или .xls" },
        { status: 400 }
      );
    } else {
      // Парсинг Excel
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      // Ищем подходящий лист и строку(и) заголовков:
      // - либо в одной строке есть и "объ", и "тариф/ндс"
      // - либо заголовок разнесён на 2 строки (например "Тариф с" / "НДС")
      const findHeaderRows = (rows: any[][]): { headerStart: number; headerRows: number[] } | null => {
        const maxScan = Math.min(200, rows.length);
        const getVolumeCols = (row: any[]) => {
          const cells = (row || []).map((c) => String(c ?? "").toLowerCase().trim());
          const cols: number[] = [];
          for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            if (c.includes("объ") || c.includes("обем") || c.includes("объем") || c.includes("volume")) cols.push(i);
          }
          return cols;
        };
        const getTariffCols = (row: any[]) => {
          const cells = (row || []).map((c) => String(c ?? "").toLowerCase().trim());
          const cols: number[] = [];
          for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            // Важно: не используем "стоим", чтобы не спутать с информационной строкой ("стоимость доставки ...")
            if (c.includes("тариф") || c.includes("ндс") || c.includes("price")) cols.push(i);
          }
          return cols;
        };
        const nonEmptyCount = (row: any[]) =>
          (row || []).map((c) => String(c ?? "").trim()).filter((c) => c.length > 0).length;
        const isStrongHeaderRow = (row: any[]) => {
          if (nonEmptyCount(row) < 2) return false;
          const v = getVolumeCols(row);
          const t = getTariffCols(row);
          if (v.length === 0 || t.length === 0) return false;
          // Сильный признак: объём и тариф находятся в разных ячейках
          return v.some((vi) => t.some((ti) => ti !== vi));
        };

        // Вариант 1: оба признака в одной строке
        for (let i = 0; i < maxScan; i++) {
          const row = rows[i] || [];
          if (isStrongHeaderRow(row)) {
            return { headerStart: i, headerRows: [i] };
          }
        }

        // Вариант 2: 2 строки заголовка рядом (в пределах 3 строк)
        let volIdx = -1;
        let tariffIdx = -1;
        for (let i = 0; i < maxScan; i++) {
          if (volIdx === -1 && getVolumeCols(rows[i] || []).length > 0) volIdx = i;
          if (tariffIdx === -1 && getTariffCols(rows[i] || []).length > 0) tariffIdx = i;
          if (volIdx !== -1 && tariffIdx !== -1) break;
        }
        if (volIdx !== -1 && tariffIdx !== -1 && Math.abs(volIdx - tariffIdx) <= 3) {
          const start = Math.min(volIdx, tariffIdx);
          const end = Math.max(volIdx, tariffIdx);
          return { headerStart: start, headerRows: start === end ? [start] : [start, end] };
        }

        return null;
      };

      let best: { sheetName: string; headerRowIndex: number; score: number; rows: any[][] } | null = null;

      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
        if (!rows || rows.length < 2) continue;

        const found = findHeaderRows(rows);
        if (!found) continue;
        const headerRowIndex = found.headerStart;

        const headerCells = (rows[headerRowIndex] || []).map((c) => String(c ?? "").toLowerCase());
        const score =
          (headerCells.some((c) => c.includes("объ") || c.includes("обем") || c.includes("объем") || c.includes("volume")) ? 1 : 0) +
          (headerCells.some((c) => c.includes("тариф") || c.includes("ндс")) ? 2 : 0);

        if (!best || score > best.score) {
          best = { sheetName, headerRowIndex, score, rows };
        }
      }

      if (best) {
        detectedSheetName = best.sheetName;
        data = best.rows;
        // Уточняем список строк заголовка для выбранного листа (для двухстрочных заголовков)
        const found = findHeaderRows(data);
        detectedHeaderRows = found ? found.headerRows.map((x) => x + 1) : [best.headerRowIndex + 1];
        console.log("📋 [API] Выбран лист:", detectedSheetName);
        console.log("📋 [API] Строки заголовков (предположительно):", detectedHeaderRows);
      } else {
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        detectedSheetName = firstSheetName;
        data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
        console.log("📋 [API] Не удалось подобрать лист автоматически. Используем первый:", firstSheetName);
      }
    }

    if (data.length < 2) {
      return NextResponse.json(
        { error: "Файл пуст или содержит только заголовки" },
        { status: 400 }
      );
    }

    // Ищем строку(и) заголовков (может быть не первая; может быть 2 строки)
    // Стратегия: найти ближайшие строки с объёмом и тарифом (в пределах 3 строк).
    const maxScan = Math.min(200, data.length);
    const rowHasVolume = (row: any[]) =>
      (row || []).map((c) => String(c ?? "").toLowerCase()).reduce<number[]>((acc, c, idx) => {
        if (c.includes("объ") || c.includes("обем") || c.includes("объем") || c.includes("volume")) acc.push(idx);
        return acc;
      }, []);
    const rowHasTariff = (row: any[]) =>
      (row || []).map((c) => String(c ?? "").toLowerCase()).reduce<number[]>((acc, c, idx) => {
        // Важно: не используем "стоим", чтобы не спутать с информационной строкой
        if (c.includes("тариф") || c.includes("ндс") || c.includes("price")) acc.push(idx);
        return acc;
      }, []);

    let headerRowIndex = 0;
    let headerRowIndex2: number | null = null;
    let volIdx = -1;
    let tariffIdx = -1;
    for (let i = 0; i < maxScan; i++) {
      const row = data[i] || [];
      const vCols = rowHasVolume(row);
      const tCols = rowHasTariff(row);
      const nonEmpty = row.map((c: any) => String(c ?? "").trim()).filter((c: string) => c.length > 0).length;
      if (nonEmpty >= 2 && vCols.length > 0 && tCols.length > 0 && vCols.some((v) => tCols.some((t) => t !== v))) {
        headerRowIndex = i;
        headerRowIndex2 = null;
        break;
      }
      if (volIdx === -1 && vCols.length > 0) volIdx = i;
      if (tariffIdx === -1 && tCols.length > 0) tariffIdx = i;
      if (volIdx !== -1 && tariffIdx !== -1 && Math.abs(volIdx - tariffIdx) <= 3) {
        headerRowIndex = Math.min(volIdx, tariffIdx);
        headerRowIndex2 = Math.max(volIdx, tariffIdx);
        break;
      }
    }

    // Собираем заголовки: если 2 строки — объединяем ячейки по колонкам
    const headerRow = data[headerRowIndex] || [];
    const headerRow2 = headerRowIndex2 != null ? (data[headerRowIndex2] || []) : null;
    const maxCols = Math.max(headerRow.length, headerRow2?.length || 0);
    const headers = Array.from({ length: maxCols }, (_, col) => {
      const a = String(headerRow[col] ?? "").trim();
      const b = headerRow2 ? String(headerRow2[col] ?? "").trim() : "";
      return `${a} ${b}`.trim();
    });
    const headersLower = headers.map((h: string) => h.toLowerCase().replace(/\s+/g, " ").trim());

    console.log("📋 [API] Лист:", detectedSheetName);
    console.log(
      "📋 [API] Строки заголовков:",
      headerRowIndex2 != null ? [headerRowIndex + 1, headerRowIndex2 + 1] : [headerRowIndex + 1]
    );
    console.log("📋 [API] Заголовки файла:", headers);

    // Функция для поиска индекса колонки (точное совпадение или includes)
    const findColumnIndex = (possibleNames: string[]): number => {
      for (let i = 0; i < headersLower.length; i++) {
        const header = headersLower[i];
        if (!header || header.trim().length === 0) continue; // не матчим пустые заголовки
        for (const possible of possibleNames) {
          const possibleLower = possible.toLowerCase();
          // Сначала проверяем точное совпадение (без учета регистра)
          if (header === possibleLower) {
            return i;
          }
          // Потом проверяем includes
          if (header.includes(possibleLower)) {
            return i;
          }
        }
      }
      return -1;
    };

    // Находим индексы колонок
    // В файле всего 2 колонки: "Объём товара" и "Тариф с НДС"
    // Ищем их точно по названиям
    const volumeRangeIndex = findColumnIndex(["объём товара", "объем товара"]);
    const basePriceIndex = findColumnIndex(["тариф с ндс", "тариф сндс"]);
    
    // Если не нашли точные совпадения, пробуем более широкий поиск
    const volumeRangeIndexFallback = volumeRangeIndex === -1 
      ? findColumnIndex(["объём", "объем", "volume", "объём упаковки", "объем упаковки"])
      : volumeRangeIndex;
    
    const basePriceIndexFallback = basePriceIndex === -1
      ? findColumnIndex(["тариф", "стоимость", "цена", "price", "базовая стоимость", "baseprice"])
      : basePriceIndex;

    // Функция для поиска колонки с исключением определённого индекса
    const findColumnIndexExcluding = (possibleNames: string[], excludeIndex: number): number => {
      for (let i = 0; i < headersLower.length; i++) {
        if (i === excludeIndex) continue; // Пропускаем исключённую колонку
        const header = headersLower[i];
        if (!header || header.trim().length === 0) continue; // не матчим пустые заголовки
        for (const possible of possibleNames) {
          const possibleLower = possible.toLowerCase();
          if (header === possibleLower) {
            return i;
          }
          if (header.includes(possibleLower)) {
            return i;
          }
        }
      }
      return -1;
    };

    const indices = {
      marketplace: findColumnIndex(["маркетплейс", "marketplace", "площадка"]),
      fromRegion: findColumnIndex(["регион отправления", "откуда", "from", "fromregion", "регион от"]),
      toRegion: findColumnIndex(["регион назначения", "куда", "to", "toregion", "регион до"]),
      fromCity: findColumnIndex(["город отправления", "город от", "fromcity"]),
      toCity: findColumnIndex(["город назначения", "город до", "tocity"]),
      deliveryType: findColumnIndex(["тип доставки", "deliverytype", "доставка"]),
      deliveryMethod: findColumnIndex(["метод доставки", "deliverymethod", "fbo", "fbs"]),
      weightMin: findColumnIndex(["вес мин", "вес от", "weightmin", "минимальный вес"]),
      weightMax: findColumnIndex(["вес макс", "вес до", "weightmax", "максимальный вес"]),
      lengthMin: findColumnIndex(["длина мин", "длина от", "lengthmin"]),
      lengthMax: findColumnIndex(["длина макс", "длина до", "lengthmax"]),
      widthMin: findColumnIndex(["ширина мин", "ширина от", "widthmin"]),
      widthMax: findColumnIndex(["ширина макс", "ширина до", "widthmax"]),
      heightMin: findColumnIndex(["высота мин", "высота от", "heightmin"]),
      heightMax: findColumnIndex(["высота макс", "высота до", "heightmax"]),
      volumeRange: volumeRangeIndexFallback,
      // Ищем стоимость, исключая колонку объёма
      basePrice: volumeRangeIndexFallback !== -1 
        ? findColumnIndexExcluding(["тариф с ндс", "тариф сндс", "базовая стоимость", "baseprice", "стоимость", "цена", "price", "тариф"], volumeRangeIndexFallback)
        : basePriceIndexFallback,
      pricePerKg: findColumnIndex(["цена за кг", "priceperkg", "за кг", "руб/кг"]),
      pricePerVolume: findColumnIndex(["цена за объём", "pricepervolume", "за объём", "руб/см³", "цена за объем"]),
      volumeMin: findColumnIndex(["объём мин", "объем мин", "объём от", "объем от", "volumemin", "volume min"]),
      volumeMax: findColumnIndex(["объём макс", "объем макс", "объём до", "объем до", "volumemax", "volume max"]),
      category: findColumnIndex(["категория", "category"]),
      priority: findColumnIndex(["приоритет", "priority"]),
    };

    // Логируем найденные индексы для отладки
    console.log("📋 [API] Найденные индексы колонок:", {
      volumeRange: indices.volumeRange !== -1 ? `${indices.volumeRange}: "${headers[indices.volumeRange]}"` : "не найдена",
      basePrice: indices.basePrice !== -1 ? `${indices.basePrice}: "${headers[indices.basePrice]}"` : "не найдена",
    });

    // Проверяем обязательные колонки
    if (indices.basePrice === -1) {
      return NextResponse.json(
        { 
          error: "Не найдена колонка с базовой стоимостью. Проверьте заголовки файла.",
          headers: headers,
          foundIndices: indices
        },
        { status: 400 }
      );
    }
    
    // Проверяем, что не перепутали колонки (объём не должен быть стоимостью)
    if (indices.volumeRange === indices.basePrice && indices.volumeRange !== -1) {
      // Если всё равно совпали, пробуем найти стоимость по более точным критериям
      const precisePriceIndex = findColumnIndexExcluding(["тариф с ндс", "тариф сндс"], indices.volumeRange);
      if (precisePriceIndex !== -1) {
        indices.basePrice = precisePriceIndex;
        console.log("📋 [API] Исправлен индекс стоимости на более точный:", precisePriceIndex);
      } else {
        return NextResponse.json(
          { 
            error: "Колонки объёма и стоимости совпадают. Проверьте структуру файла.",
            headers: headers,
            foundIndices: {
              volumeRange: indices.volumeRange !== -1 ? `${indices.volumeRange}: "${headers[indices.volumeRange]}"` : "не найдена",
              basePrice: indices.basePrice !== -1 ? `${indices.basePrice}: "${headers[indices.basePrice]}"` : "не найдена",
            }
          },
          { status: 400 }
        );
      }
    }

    // Парсим данные (начинаем со строки после заголовков)
    const tariffs = [];
    const errors: string[] = [];
    const BATCH_SIZE = 1000; // Вставляем по 1000 записей за раз

    // Если заголовок в 2 строки — начинаем после второй строки
    const dataStartIndex = headerRowIndex2 != null ? headerRowIndex2 + 1 : headerRowIndex + 1;

    for (let i = dataStartIndex; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1;

      // Пропускаем пустые строки
      if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === "")) {
        continue;
      }

      // Функция для парсинга числа
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

      // Функция для парсинга строки
      const parseString = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        return String(value).trim() || null;
      };

      // Функция для парсинга диапазона объёма
      // Поддерживает форматы:
      // - "До Xл" → min: 0, max: X
      // - "от Xл до Yл" → min: X, max: Y
      // - "от Xл - Yл" → min: X, max: Y (дефис вместо "до")
      // - "Более Xл" → min: X, max: null
      // - "X - Y л" → min: X, max: Y
      // - "от X.XXX л" → min: X, max: null
      const parseVolumeRange = (value: any): { volumeMin: number | null; volumeMax: number | null } => {
        if (value === null || value === undefined || value === "") {
          return { volumeMin: null, volumeMax: null };
        }
        const str = String(value).trim();
        const normalized = str
          .replace(/\u00a0/g, " ")
          .replace(/[–—−]/g, "-")
          .replace(/\s+/g, " ")
          .replace(/,/g, ".");
        
        // Парсим "До Xл" (например "До 1л")
        const upToMatch = normalized.match(/до\s*(\d+(?:\.\d+)?)\s*л?/i);
        if (upToMatch) {
          const max = parseFloat(upToMatch[1]);
          return { volumeMin: 0, volumeMax: max * 1000 }; // Конвертируем литры в см³
        }
        
        // Парсим "Более Xл" (например "Более 1000л")
        const moreThanMatch = normalized.match(/более\s*(\d+(?:\.\d+)?)\s*л?/i);
        if (moreThanMatch) {
          const min = parseFloat(moreThanMatch[1]);
          return { volumeMin: min * 1000, volumeMax: null }; // Конвертируем литры в см³
        }
        
        // Парсим "от Xл до Yл" (например "от 1л до 2л", "от 3л до 190л")
        const fromToMatch = normalized.match(/от\s*(\d+(?:\.\d+)?)\s*л?\s*до\s*(\d+(?:\.\d+)?)\s*л?/i);
        if (fromToMatch) {
          const min = parseFloat(fromToMatch[1]);
          const max = parseFloat(fromToMatch[2]);
          return { volumeMin: min * 1000, volumeMax: max * 1000 }; // Конвертируем литры в см³
        }
        
        // Парсим "от Xл - Yл" (например "от 190л - 1000л") - дефис вместо "до"
        const fromDashMatch = normalized.match(/от\s*(\d+(?:\.\d+)?)\s*л?\s*-\s*(\d+(?:\.\d+)?)\s*л?/i);
        if (fromDashMatch) {
          const min = parseFloat(fromDashMatch[1]);
          const max = parseFloat(fromDashMatch[2]);
          return { volumeMin: min * 1000, volumeMax: max * 1000 }; // Конвертируем литры в см³
        }
        
        // Парсим "от X.XXX л" (например "от 190.001 л") - без верхней границы
        const fromMatch = normalized.match(/от\s*(\d+(?:\.\d+)?)\s*л?/i);
        if (fromMatch) {
          const min = parseFloat(fromMatch[1]);
          return { volumeMin: min * 1000, volumeMax: null }; // Конвертируем литры в см³
        }

        // Парсим диапазон "X - Y л" / "X–Y л"
        const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*л?/i);
        if (rangeMatch) {
          const min = parseFloat(rangeMatch[1]);
          const max = parseFloat(rangeMatch[2]);
          return { volumeMin: min * 1000, volumeMax: max * 1000 }; // Конвертируем литры в см³
        }

        // Фолбэк: если есть хотя бы 2 числа, считаем их min/max
        const allNumbers = normalized.match(/\d+(?:\.\d+)?/g);
        if (allNumbers && allNumbers.length >= 2) {
          const min = parseFloat(allNumbers[0]);
          const max = parseFloat(allNumbers[1]);
          return { volumeMin: min * 1000, volumeMax: max * 1000 };
        }

        // Если просто число с "л" в конце
        const numMatch = normalized.match(/(\d+(?:\.\d+)?)\s*л?/i);
        if (numMatch) {
          const num = parseFloat(numMatch[1]);
          return { volumeMin: num * 1000, volumeMax: num * 1000 }; // Конвертируем литры в см³
        }
        
        return { volumeMin: null, volumeMax: null };
      };

      try {
        // Проверяем, что не пытаемся парсить объём как стоимость
        if (indices.volumeRange !== -1 && indices.basePrice === indices.volumeRange) {
          errors.push(`Строка ${rowNum}: колонки объёма и стоимости совпадают`);
          continue;
        }
        
        // Парсим базовую стоимость (тариф)
        // Поддерживаем форматы: "81,34 ₽", "4 417,00 ₽", "9432,87"
        let basePrice = parseNumber(row[indices.basePrice]);
        
        // Если не нашли через parseNumber, пробуем убрать "Р", "₽" и другие символы
        if (basePrice === null && indices.basePrice !== -1) {
          const rawValue = row[indices.basePrice];
          if (rawValue !== null && rawValue !== undefined) {
            const strValue = String(rawValue).trim();
            // Пропускаем, если это явно диапазон объёма (содержит "л", "от", "-")
            if (strValue.toLowerCase().includes("л") || strValue.toLowerCase().includes("от") || strValue.includes("-")) {
              errors.push(`Строка ${rowNum}: значение в колонке стоимости похоже на объём: "${strValue}"`);
              continue;
            }
            // Убираем валютные символы, пробелы (разделители тысяч), заменяем запятую на точку
            const cleaned = strValue
              .replace(/[Рр₽]/g, "") // Убираем символы валюты
              .replace(/\s/g, "") // Убираем все пробелы (разделители тысяч)
              .replace(/,/g, "."); // Заменяем запятую на точку для десятичных
            basePrice = parseFloat(cleaned);
            if (isNaN(basePrice)) basePrice = null;
          }
        }
        
        if (basePrice === null || basePrice < 0) {
          const rawValue = row[indices.basePrice];
          errors.push(`Строка ${rowNum}: неверная базовая стоимость (значение: "${rawValue}", тип: ${typeof rawValue})`);
          continue;
        }

        // Парсим объём из диапазона (если есть колонка с диапазоном)
        let volumeMin: number | null = null;
        let volumeMax: number | null = null;
        
        if (indices.volumeRange !== -1) {
          const rawVolumeValue = row[indices.volumeRange];
          const volumeRange = parseVolumeRange(rawVolumeValue);
          volumeMin = volumeRange.volumeMin;
          volumeMax = volumeRange.volumeMax;
          
          // Логируем для отладки первых нескольких строк
          if (rowNum <= 3) {
            console.log(`📋 [API] Строка ${rowNum}: объём "${rawVolumeValue}" → min: ${volumeMin}, max: ${volumeMax}`);
          }
        } else {
          // Если нет колонки с диапазоном, используем отдельные колонки
          volumeMin = parseNumber(row[indices.volumeMin]);
          volumeMax = parseNumber(row[indices.volumeMax]);
        }

        const tariff: any = {
          marketplace: parseString(row[indices.marketplace]) || "ozon",
          fromRegion: parseString(row[indices.fromRegion]) || null,
          toRegion: parseString(row[indices.toRegion]) || null,
          fromCity: parseString(row[indices.fromCity]) || null,
          toCity: parseString(row[indices.toCity]) || null,
          deliveryType: parseString(row[indices.deliveryType]) || null,
          deliveryMethod: parseString(row[indices.deliveryMethod]) || detectedDeliveryMethod,
          weightMin: parseNumber(row[indices.weightMin]),
          weightMax: parseNumber(row[indices.weightMax]),
          lengthMin: parseNumber(row[indices.lengthMin]),
          lengthMax: parseNumber(row[indices.lengthMax]),
          widthMin: parseNumber(row[indices.widthMin]),
          widthMax: parseNumber(row[indices.widthMax]),
          heightMin: parseNumber(row[indices.heightMin]),
          heightMax: parseNumber(row[indices.heightMax]),
          volumeMin,
          volumeMax,
          basePrice,
          pricePerKg: parseNumber(row[indices.pricePerKg]),
          pricePerVolume: parseNumber(row[indices.pricePerVolume]),
          category: parseString(row[indices.category]) || null,
          priority: parseNumber(row[indices.priority]) || 0,
          isActive: true,
        };

        tariffs.push(tariff);
      } catch (error: any) {
        errors.push(`Строка ${rowNum}: ${error.message}`);
      }
    }

    console.log(`📊 [API] Распарсено тарифов: ${tariffs.length}, ошибок: ${errors.length}`);

    if (tariffs.length === 0) {
      return NextResponse.json(
        {
          error: "Не удалось распарсить ни одного тарифа из файла",
          sheet: detectedSheetName,
          headerRow: headerRowIndex2 != null ? [headerRowIndex + 1, headerRowIndex2 + 1] : [headerRowIndex + 1],
          headers,
          foundIndices: {
            volumeRange: indices.volumeRange,
            basePrice: indices.basePrice,
          },
          sampleRows: data.slice(dataStartIndex, Math.min(dataStartIndex + 10, data.length)),
        },
        { status: 400 }
      );
    }

    // Гарантируем существование таблицы и индексов перед загрузкой
    await ensureShippingTariffTable();

    // Перезаливаем тарифы для выбранного метода, чтобы не копились старые/ошибочные записи
    await prisma.shippingTariff.deleteMany({
      where: {
        marketplace: "ozon",
        deliveryMethod: detectedDeliveryMethod,
      },
    });

    // Вставляем в БД батчами
    let inserted = 0;
    let failed = 0;
    const insertErrors: string[] = [];

    // Логируем пример первого тарифа для отладки
    if (tariffs.length > 0) {
      console.log("📋 [API] Пример первого тарифа:", JSON.stringify(tariffs[0], null, 2));
    }

    for (let i = 0; i < tariffs.length; i += BATCH_SIZE) {
      const batch = tariffs.slice(i, i + BATCH_SIZE);
      
      try {
        await prisma.shippingTariff.createMany({
          data: batch,
          skipDuplicates: true, // Пропускаем дубликаты
        });
        inserted += batch.length;
        console.log(`✅ [API] Вставлено ${inserted}/${tariffs.length} тарифов`);
      } catch (error: any) {
        console.error(`❌ [API] Ошибка при вставке батча ${i}-${i + batch.length}:`, error.message);
        console.error(`❌ [API] Детали ошибки:`, error);
        console.error(`❌ [API] Пример данных батча:`, JSON.stringify(batch[0], null, 2));
        
        // Пробуем вставить по одному, чтобы найти проблемную запись
        if (batch.length > 1) {
          for (const tariff of batch) {
            try {
              await prisma.shippingTariff.create({
                data: tariff,
              });
              inserted += 1;
            } catch (singleError: any) {
              failed += 1;
              insertErrors.push(`Ошибка вставки: ${singleError.message}. Данные: ${JSON.stringify(tariff)}`);
              console.error(`❌ [API] Ошибка вставки одного тарифа:`, singleError.message);
            }
          }
        } else {
          failed += batch.length;
          insertErrors.push(`Батч ${i}: ${error.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Загружено ${inserted} тарифов из ${tariffs.length}`,
      stats: {
        total: tariffs.length,
        inserted,
        failed,
        errors: errors.length,
      },
      errors: errors.slice(0, 100), // Первые 100 ошибок парсинга
      insertErrors: insertErrors.slice(0, 50), // Первые 50 ошибок вставки
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при загрузке тарифов:", error);
    return NextResponse.json(
      {
        error: "Ошибка при загрузке тарифов",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
