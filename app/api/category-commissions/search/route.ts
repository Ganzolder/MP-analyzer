import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/category-commissions/search
 * Смысловой поиск по столбцам productType и categoryName из таблицы CategoryCommission.
 * Поддерживает морфологию русского языка:
 * "легковые шины" → найдёт "Шины для легковых автомобилей"
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    const marketplace = (searchParams.get("marketplace") || "ozon").toLowerCase();
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "Минимум 2 символа для поиска",
      });
    }

    const queryLower = query.toLowerCase().trim();
    const words = queryLower.split(/\s+/).filter((w) => w.length > 0);

    // Создаём основы слов (стемминг) для морфологического поиска
    const stems = words.map((word) => russianStem(word));

    console.log(`🔍 [SEARCH] Запрос: "${query}", слова: [${words.join(", ")}], стемы: [${stems.join(", ")}]`);

    // Получаем уникальные пары categoryName + productType из БД
    const allRecords = await prisma.$queryRawUnsafe<Array<{
      categoryName: string | null;
      productType: string | null;
    }>>(
      `SELECT DISTINCT "categoryName", "productType"
       FROM "CategoryCommission"
       WHERE "marketplace" = $1
         AND "isActive" = true
       ORDER BY "categoryName" ASC, "productType" ASC`,
      marketplace
    );

    // Собираем уникальные значения productType и categoryName
    const uniqueProductTypes = new Set<string>();
    const uniqueCategories = new Set<string>();
    const ptToCategoryMap = new Map<string, string>();

    allRecords.forEach((r) => {
      if (r.productType && r.productType.trim()) {
        const pt = r.productType.trim();
        uniqueProductTypes.add(pt);
        if (r.categoryName && !ptToCategoryMap.has(pt)) {
          ptToCategoryMap.set(pt, r.categoryName.trim());
        }
      }
      if (r.categoryName && r.categoryName.trim()) {
        uniqueCategories.add(r.categoryName.trim());
      }
    });

    // Функция подсчёта релевантности: чем больше стемов совпало, тем лучше
    const scoreMatch = (text: string): number => {
      const textLower = text.toLowerCase();
      const textWords = textLower.split(/[\s,./\-()]+/).filter((w) => w.length > 0);
      const textStems = textWords.map((w) => russianStem(w));

      let score = 0;
      let exactMatches = 0;
      let stemMatches = 0;

      for (const stem of stems) {
        // Проверяем точное вхождение слова
        const originalWord = words[stems.indexOf(stem)];
        if (textLower.includes(originalWord)) {
          exactMatches++;
          score += 10;
          continue;
        }

        // Проверяем совпадение по стему
        const hasStemMatch = textStems.some((ts) => ts.startsWith(stem) || stem.startsWith(ts));
        if (hasStemMatch) {
          stemMatches++;
          score += 5;
          continue;
        }

        // Проверяем частичное вхождение стема в текст
        if (textLower.includes(stem)) {
          stemMatches++;
          score += 3;
        }
      }

      // Бонус, если все слова/стемы нашли хоть какое-то совпадение
      if (exactMatches + stemMatches >= stems.length) {
        score += 20;
      }

      return score;
    };

    // Ищем совпадения по productType
    const scoredProductTypes = Array.from(uniqueProductTypes)
      .map((pt) => ({ text: pt, score: scoreMatch(pt) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    // Ищем совпадения по categoryName
    const scoredCategories = Array.from(uniqueCategories)
      .map((cat) => ({ text: cat, score: scoreMatch(cat) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    console.log(`📊 [SEARCH] Совпадений productType: ${scoredProductTypes.length}, categoryName: ${scoredCategories.length}`);

    // Объединяем результаты
    const allResults: Array<{
      value: string;
      label: string;
      type: "productType" | "category";
      categoryName: string | null;
      score: number;
    }> = [];

    scoredProductTypes.forEach((item) => {
      allResults.push({
        value: `productType:${item.text}`,
        label: item.text,
        type: "productType",
        categoryName: ptToCategoryMap.get(item.text) || null,
        score: item.score + 1, // +1 бонус за productType
      });
    });

    const ptLabels = new Set(scoredProductTypes.map((item) => item.text.toLowerCase()));
    scoredCategories.forEach((item) => {
      if (!ptLabels.has(item.text.toLowerCase())) {
        allResults.push({
          value: `category:${item.text}`,
          label: item.text,
          type: "category",
          categoryName: item.text,
          score: item.score,
        });
      }
    });

    // Сортировка по релевантности
    allResults.sort((a, b) => {
      // По score (убывание)
      if (a.score !== b.score) return b.score - a.score;
      // По длине (короче = точнее)
      if (a.label.length !== b.label.length) return a.label.length - b.label.length;
      // Алфавит
      return a.label.localeCompare(b.label, "ru");
    });

    return NextResponse.json({
      success: true,
      data: allResults.slice(0, limit).map(({ score, ...rest }) => rest),
      count: allResults.length,
      query: query,
      debug: {
        stems,
        totalRecordsInDb: allRecords.length,
        uniqueProductTypes: uniqueProductTypes.size,
        uniqueCategories: uniqueCategories.size,
        topMatches: allResults.slice(0, 5).map((r) => ({ label: r.label, score: r.score, type: r.type })),
      },
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при поиске:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при поиске",
        data: [],
      },
      { status: 500 }
    );
  }
}

/**
 * Простой стеммер для русского языка.
 * Обрезает типичные окончания существительных, прилагательных,
 * чтобы "легковые" и "легковых" давали одну основу "легков".
 */
function russianStem(word: string): string {
  if (word.length <= 3) return word;

  let stem = word;

  // Типичные окончания прилагательных (длинные сначала)
  const adjEndings = [
    "ными", "ного", "ному", "ными", "ской", "ском", "скую", "ских", "ским",
    "ные", "ных", "ным", "ной", "ную", "ного", "ному",
    "ого", "ому", "ыми", "ими",
    "ые", "ых", "ым", "ой", "ую", "ое", "ая", "ий", "ом", "ей", "их", "им",
  ];

  // Типичные окончания существительных
  const nounEndings = [
    "ость", "ение", "ание", "ства", "ство",
    "ями", "ами", "ией", "иям", "ией",
    "ов", "ев", "ей", "ям", "ах", "ях", "ом", "ем", "ам",
    "ии", "ия", "ие", "ей",
    "ы", "и", "а", "о", "у", "е", "я",
  ];

  // Пробуем обрезать окончание прилагательного
  for (const ending of adjEndings) {
    if (stem.length > ending.length + 2 && stem.endsWith(ending)) {
      return stem.slice(0, -ending.length);
    }
  }

  // Пробуем обрезать окончание существительного
  for (const ending of nounEndings) {
    if (stem.length > ending.length + 2 && stem.endsWith(ending)) {
      return stem.slice(0, -ending.length);
    }
  }

  // Если ничего не подошло, обрезаем последние 2 символа (для слов > 5 букв)
  if (stem.length > 5) {
    return stem.slice(0, -2);
  }

  // Для коротких слов обрезаем 1 символ
  if (stem.length > 3) {
    return stem.slice(0, -1);
  }

  return stem;
}
