import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/shipping-tariffs/list
 * Получение списка загруженных тарифов логистики
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const marketplace = searchParams.get("marketplace") || undefined;
    const deliveryMethod = searchParams.get("deliveryMethod") || undefined;
    const search = searchParams.get("search") || undefined;

    const skip = (page - 1) * limit;

    // Формируем условия фильтрации
    const where: any = {};
    if (marketplace) {
      where.marketplace = marketplace;
    }
    if (deliveryMethod) {
      where.deliveryMethod = deliveryMethod;
    }
    if (search) {
      where.OR = [
        { fromRegion: { contains: search, mode: "insensitive" } },
        { toRegion: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
      ];
    }

    // Получаем данные с пагинацией
    const [tariffs, total] = await Promise.all([
      prisma.shippingTariff.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { marketplace: "asc" },
          { volumeMin: "asc" },
          { volumeMax: "asc" },
        ],
      }),
      prisma.shippingTariff.count({ where }),
    ]);

    // Получаем статистику
    const stats = await prisma.shippingTariff.groupBy({
      by: ["marketplace", "deliveryMethod"],
      _count: true,
    });

    return NextResponse.json({
      success: true,
      data: tariffs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: stats.map((s) => ({
        marketplace: s.marketplace,
        deliveryMethod: s.deliveryMethod || "all",
        count: s._count,
      })),
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при получении списка тарифов:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при получении списка тарифов",
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
        stats: [],
      },
      { status: 500 }
    );
  }
}
