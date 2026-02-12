import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/category-commissions/search
 * Поиск категорий и типов товаров по названию
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    const marketplace = (searchParams.get("marketplace") || "ozon").toLowerCase();
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "Минимум 2 символа для поиска",
      });
    }

    const searchTerm = `%${query.toLowerCase()}%`;

    // Поиск по categoryName и productType (используем raw query для case-insensitive поиска)
    const results = await prisma.$queryRaw<Array<{
      categoryName: string | null;
      productType: string | null;
      categoryId: string | null;
      categoryPath: string | null;
    }>>`
      SELECT DISTINCT "categoryName", "productType", "categoryId", "categoryPath"
      FROM "CategoryCommission"
      WHERE "marketplace" = ${marketplace}
        AND "isActive" = true
        AND (
          LOWER("categoryName") LIKE ${searchTerm}
          OR LOWER("productType") LIKE ${searchTerm}
        )
      ORDER BY "categoryName" ASC, "productType" ASC
      LIMIT ${limit}
    `;

    // Формируем уникальный список категорий и типов товаров
    const categories = new Set<string>();
    const productTypes = new Set<string>();

    results.forEach((item) => {
      if (item.categoryName) {
        categories.add(item.categoryName);
      }
      if (item.productType) {
        productTypes.add(item.productType);
      }
    });

    // Объединяем результаты, приоритет - точное совпадение в начале
    const allResults = [
      ...Array.from(categories).map((name) => ({
        value: `category:${name}`,
        label: name,
        type: "category" as const,
      })),
      ...Array.from(productTypes).map((type) => ({
        value: `productType:${type}`,
        label: type,
        type: "productType" as const,
      })),
    ];

    // Сортируем: сначала те, что начинаются с запроса
    allResults.sort((a, b) => {
      const aStarts = a.label.toLowerCase().startsWith(query.toLowerCase());
      const bStarts = b.label.toLowerCase().startsWith(query.toLowerCase());
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.label.localeCompare(b.label, "ru");
    });

    return NextResponse.json({
      success: true,
      data: allResults.slice(0, limit),
      count: allResults.length,
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при поиске категорий:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при поиске категорий",
        data: [],
      },
      { status: 500 }
    );
  }
}
