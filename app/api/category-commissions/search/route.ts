import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/category-commissions/search
 * Поиск типов товаров по названию (только по столбцу productType)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    const marketplace = (searchParams.get("marketplace") || "ozon").toLowerCase();
    const limit = parseInt(searchParams.get("limit") || "50"); // Увеличиваем лимит

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "Минимум 2 символа для поиска",
      });
    }

    const queryLower = query.toLowerCase().trim();
    const words = queryLower.split(/\s+/).filter((w) => w.length > 0);

    console.log(`🔍 [SEARCH] Поиск по запросу: "${query}" (слова: ${words.join(", ")})`);

    // Получаем все активные типы товаров из базы
    // Используем простой запрос без фильтрации по словам на уровне SQL
    // Фильтрацию делаем в JavaScript для большей гибкости
    const allRecords = await prisma.categoryCommission.findMany({
      where: {
        marketplace,
        isActive: true,
        productType: {
          not: null,
        },
      },
      select: {
        productType: true,
        categoryName: true,
        categoryId: true,
      },
      take: 1000, // Берем больше записей для фильтрации
    });

    console.log(`📊 [SEARCH] Всего записей в БД: ${allRecords.length}`);

    // Фильтруем в JavaScript: ищем записи, где productType содержит все слова запроса
    const filteredResults = allRecords.filter((item) => {
      if (!item.productType) return false;
      const typeLower = item.productType.toLowerCase().trim();
      // Проверяем, что все слова запроса присутствуют в типе товара
      const hasAllWords = words.every((word) => typeLower.includes(word));
      if (hasAllWords) {
        console.log(`✅ [SEARCH] Совпадение: "${item.productType}"`);
      }
      return hasAllWords;
    });

    console.log(`📊 [SEARCH] Найдено записей после фильтрации: ${filteredResults.length}`);

    // Формируем уникальный список типов товаров
    const productTypes = new Set<string>();
    const productTypeMap = new Map<string, { categoryName: string | null; categoryId: string | null }>();

    filteredResults.forEach((item) => {
      if (item.productType && item.productType.trim()) {
        const type = item.productType.trim();
        productTypes.add(type);
        // Сохраняем первую встретившуюся категорию для этого типа товара
        if (!productTypeMap.has(type)) {
          productTypeMap.set(type, {
            categoryName: item.categoryName,
            categoryId: item.categoryId,
          });
        }
      }
    });

    // Преобразуем в массив результатов
    const allResults = Array.from(productTypes).map((type) => {
      const meta = productTypeMap.get(type);
      return {
        value: `productType:${type}`,
        label: type,
        type: "productType" as const,
        categoryName: meta?.categoryName || null,
        categoryId: meta?.categoryId || null,
      };
    });

    // Улучшенная сортировка: приоритет точным совпадениям и совпадениям в начале
    allResults.sort((a, b) => {
      const aLower = a.label.toLowerCase();
      const bLower = b.label.toLowerCase();
      const queryLower = query.toLowerCase();

      // Точное совпадение
      if (aLower === queryLower && bLower !== queryLower) return -1;
      if (bLower === queryLower && aLower !== queryLower) return 1;

      // Начинается с запроса
      const aStarts = aLower.startsWith(queryLower);
      const bStarts = bLower.startsWith(queryLower);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      // Содержит все слова запроса
      const aHasAllWords = words.every((word) => aLower.includes(word));
      const bHasAllWords = words.every((word) => bLower.includes(word));
      if (aHasAllWords && !bHasAllWords) return -1;
      if (!aHasAllWords && bHasAllWords) return 1;

      // По длине (короче = лучше)
      if (aLower.length !== bLower.length) {
        return aLower.length - bLower.length;
      }

      // Лексикографическая сортировка
      return a.label.localeCompare(b.label, "ru");
    });

    return NextResponse.json({
      success: true,
      data: allResults.slice(0, limit),
      count: allResults.length,
      query: query,
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при поиске типов товаров:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при поиске типов товаров",
        data: [],
      },
      { status: 500 }
    );
  }
}
