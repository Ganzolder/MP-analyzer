import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/db/prisma";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/shipping-tariffs/upload
 * Загрузка файла с тарифами перевозки в БД
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

    // Проверка формата
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls") && !lowerName.endsWith(".csv")) {
      return NextResponse.json(
        { error: "Неподдерживаемый формат. Поддерживаются .xlsx, .xls, .csv" },
        { status: 400 }
      );
    }

    console.log("📦 [API] Начало загрузки тарифов из файла:", file.name);

    // Читаем файл
    const arrayBuffer = await file.arrayBuffer();
    let data: any[][];

    if (lowerName.endsWith(".csv")) {
      // Парсинг CSV (нужно будет добавить библиотеку для CSV)
      return NextResponse.json(
        { error: "CSV формат пока не поддерживается. Используйте .xlsx или .xls" },
        { status: 400 }
      );
    } else {
      // Парсинг Excel
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
    }

    if (data.length < 2) {
      return NextResponse.json(
        { error: "Файл пуст или содержит только заголовки" },
        { status: 400 }
      );
    }

    // Первая строка - заголовки
    const headers = data[0].map((h: any) => String(h || "").toLowerCase().trim());

    console.log("📋 [API] Заголовки файла:", headers);

    // Функция для поиска индекса колонки
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

    // Находим индексы колонок (гибкий поиск по возможным названиям)
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
      basePrice: findColumnIndex(["базовая стоимость", "baseprice", "стоимость", "цена", "price", "тариф", "тариф с ндс", "тариф сндс", "ндс"]),
      volumeRange: findColumnIndex(["объём товара", "объем товара", "объём", "объем", "volume", "объём упаковки", "объем упаковки"]),
      pricePerKg: findColumnIndex(["цена за кг", "priceperkg", "за кг", "руб/кг"]),
      pricePerVolume: findColumnIndex(["цена за объём", "pricepervolume", "за объём", "руб/см³", "цена за объем"]),
      volumeMin: findColumnIndex(["объём мин", "объем мин", "объём от", "объем от", "volumemin", "volume min"]),
      volumeMax: findColumnIndex(["объём макс", "объем макс", "объём до", "объем до", "volumemax", "volume max"]),
      category: findColumnIndex(["категория", "category"]),
      priority: findColumnIndex(["приоритет", "priority"]),
    };

    // Проверяем обязательные колонки
    if (indices.basePrice === -1) {
      return NextResponse.json(
        { error: "Не найдена колонка с базовой стоимостью. Проверьте заголовки файла." },
        { status: 400 }
      );
    }

    // Парсим данные
    const tariffs = [];
    const errors: string[] = [];
    const BATCH_SIZE = 1000; // Вставляем по 1000 записей за раз

    for (let i = 1; i < data.length; i++) {
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

      // Функция для парсинга диапазона объёма (например "0 - 0.200 л" или "от 190.001 л")
      const parseVolumeRange = (value: any): { volumeMin: number | null; volumeMax: number | null } => {
        if (value === null || value === undefined || value === "") {
          return { volumeMin: null, volumeMax: null };
        }
        const str = String(value).trim().toLowerCase();
        
        // Убираем "л" и другие единицы измерения
        const cleaned = str.replace(/[лl]/g, "").replace(/\s+/g, " ");
        
        // Парсим "от X.XXX" (например "от 190.001")
        const fromMatch = cleaned.match(/от\s*(\d+(?:[.,]\d+)?)/);
        if (fromMatch) {
          const min = parseFloat(fromMatch[1].replace(",", "."));
          return { volumeMin: min * 1000, volumeMax: null }; // Конвертируем литры в см³
        }
        
        // Парсим диапазон "X - Y" или "X.XXX - Y.YYY"
        const rangeMatch = cleaned.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/);
        if (rangeMatch) {
          const min = parseFloat(rangeMatch[1].replace(",", "."));
          const max = parseFloat(rangeMatch[2].replace(",", "."));
          return { volumeMin: min * 1000, volumeMax: max * 1000 }; // Конвертируем литры в см³
        }
        
        // Если просто число
        const numMatch = cleaned.match(/(\d+(?:[.,]\d+)?)/);
        if (numMatch) {
          const num = parseFloat(numMatch[1].replace(",", "."));
          return { volumeMin: num * 1000, volumeMax: num * 1000 }; // Конвертируем литры в см³
        }
        
        return { volumeMin: null, volumeMax: null };
      };

      try {
        // Парсим базовую стоимость (тариф)
        let basePrice = parseNumber(row[indices.basePrice]);
        
        // Если не нашли через parseNumber, пробуем убрать "Р" и другие символы
        if (basePrice === null && indices.basePrice !== -1) {
          const rawValue = row[indices.basePrice];
          if (rawValue !== null && rawValue !== undefined) {
            const cleaned = String(rawValue).replace(/[Рр₽]/g, "").replace(/,/g, ".").replace(/\s/g, "");
            basePrice = parseFloat(cleaned);
            if (isNaN(basePrice)) basePrice = null;
          }
        }
        
        if (basePrice === null || basePrice < 0) {
          errors.push(`Строка ${rowNum}: неверная базовая стоимость (значение: ${row[indices.basePrice]})`);
          continue;
        }

        // Парсим объём из диапазона (если есть колонка с диапазоном)
        let volumeMin: number | null = null;
        let volumeMax: number | null = null;
        
        if (indices.volumeRange !== -1) {
          const volumeRange = parseVolumeRange(row[indices.volumeRange]);
          volumeMin = volumeRange.volumeMin;
          volumeMax = volumeRange.volumeMax;
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
          deliveryMethod: parseString(row[indices.deliveryMethod]) || null,
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
        { error: "Не удалось распарсить ни одного тарифа из файла" },
        { status: 400 }
      );
    }

    // Вставляем в БД батчами
    let inserted = 0;
    let failed = 0;

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
        failed += batch.length;
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
      errors: errors.slice(0, 100), // Первые 100 ошибок
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
