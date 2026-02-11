import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/category-commissions/list
 * Получение списка загруженных категорий и комиссий
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const marketplace = searchParams.get("marketplace") || undefined;
    const search = searchParams.get("search") || undefined;

    const skip = (page - 1) * limit;

    // Формируем условия фильтрации
    const where: any = {};
    if (marketplace) {
      where.marketplace = marketplace;
    }
    if (search) {
      where.OR = [
        { categoryName: { contains: search, mode: "insensitive" } },
        { productType: { contains: search, mode: "insensitive" } },
        { categoryPath: { contains: search, mode: "insensitive" } },
        { categoryId: { contains: search, mode: "insensitive" } },
      ];
    }

    // Получаем данные с пагинацией
    const [commissions, total] = await Promise.all([
      prisma.categoryCommission.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { marketplace: "asc" },
          { categoryPath: "asc" },
          { categoryName: "asc" },
        ],
      }),
      prisma.categoryCommission.count({ where }),
    ]);

    // Получаем статистику
    const stats = await prisma.categoryCommission.groupBy({
      by: ["marketplace"],
      _count: true,
    });

    return NextResponse.json({
      success: true,
      data: commissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: stats.map((s) => ({
        marketplace: s.marketplace,
        count: s._count,
      })),
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при получении списка комиссий:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при получении списка комиссий",
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
        stats: [],
      },
      { status: 500 }
    );
  }
}
