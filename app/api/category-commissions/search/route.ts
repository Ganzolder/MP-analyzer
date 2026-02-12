import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/category-commissions/search
 * Поиск по столбцам productType и categoryName из таблицы CategoryCommission
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

    console.log(`🔍 [SEARCH] Поиск: "${query}", слова: [${words.join(", ")}], marketplace: ${marketplace}`);

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

    console.log(`📊 [SEARCH] Уникальных пар categoryName+productType в БД: ${allRecords.length}`);

    // Собираем уникальные значения productType и categoryName
    const uniqueProductTypes = new Set<string>();
    const uniqueCategories = new Set<string>();
    // Маппинг productType -> categoryName
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

    console.log(`📊 [SEARCH] Уникальных productType: ${uniqueProductTypes.size}, categoryName: ${uniqueCategories.size}`);

    // Ищем совпадения по productType (приоритет)
    const matchingProductTypes = Array.from(uniqueProductTypes).filter((pt) => {
      const ptLower = pt.toLowerCase();
      return words.every((word) => ptLower.includes(word));
    });

    // Ищем совпадения по categoryName (если в productType не нашли)
    const matchingCategories = Array.from(uniqueCategories).filter((cat) => {
      const catLower = cat.toLowerCase();
      return words.every((word) => catLower.includes(word));
    });

    console.log(`📊 [SEARCH] Совпадений productType: ${matchingProductTypes.length}, categoryName: ${matchingCategories.length}`);

    // Объединяем результаты: сначала productType, потом categoryName
    const allResults: Array<{
      value: string;
      label: string;
      type: "productType" | "category";
      categoryName: string | null;
    }> = [];

    matchingProductTypes.forEach((pt) => {
      allResults.push({
        value: `productType:${pt}`,
        label: pt,
        type: "productType",
        categoryName: ptToCategoryMap.get(pt) || null,
      });
    });

    // Добавляем categoryName только если они ещё не представлены как productType
    const ptLabels = new Set(matchingProductTypes.map((pt) => pt.toLowerCase()));
    matchingCategories.forEach((cat) => {
      if (!ptLabels.has(cat.toLowerCase())) {
        allResults.push({
          value: `category:${cat}`,
          label: cat,
          type: "category",
          categoryName: cat,
        });
      }
    });

    // Сортировка: точные → начинаются с запроса → содержат все слова → короче → алфавит
    allResults.sort((a, b) => {
      const aLower = a.label.toLowerCase();
      const bLower = b.label.toLowerCase();

      // productType приоритетнее category
      if (a.type === "productType" && b.type === "category") return -1;
      if (a.type === "category" && b.type === "productType") return 1;

      // Точное совпадение
      if (aLower === queryLower && bLower !== queryLower) return -1;
      if (bLower === queryLower && aLower !== queryLower) return 1;

      // Начинается с запроса
      const aStarts = aLower.startsWith(queryLower);
      const bStarts = bLower.startsWith(queryLower);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      // По длине (короче = лучше)
      if (aLower.length !== bLower.length) return aLower.length - bLower.length;

      return a.label.localeCompare(b.label, "ru");
    });

    return NextResponse.json({
      success: true,
      data: allResults.slice(0, limit),
      count: allResults.length,
      query: query,
      debug: {
        totalRecordsInDb: allRecords.length,
        uniqueProductTypes: uniqueProductTypes.size,
        uniqueCategories: uniqueCategories.size,
        matchingProductTypes: matchingProductTypes.length,
        matchingCategories: matchingCategories.length,
        sampleProductTypes: Array.from(uniqueProductTypes).slice(0, 5),
        sampleCategories: Array.from(uniqueCategories).slice(0, 5),
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
