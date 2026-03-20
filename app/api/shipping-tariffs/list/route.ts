import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

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
    const priceBand = searchParams.get("priceBand") || undefined;
    const search = searchParams.get("search") || undefined;

    const skip = (page - 1) * limit;

    // Формируем условия фильтрации
    const where: any = {};
    if (marketplace && marketplace !== "all") {
      where.marketplace = marketplace.toLowerCase();
    }
    if (deliveryMethod && deliveryMethod !== "all") {
      // Приводим к lowercase, так как в БД сохраняем в lowercase
      where.deliveryMethod = deliveryMethod.toLowerCase();
    }
    if (priceBand && priceBand !== "all") {
      where.priceBand = priceBand.toLowerCase();
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

    // Получаем статистику - группируем по marketplace, deliveryMethod и сегменту
    const stats = await prisma.shippingTariff.groupBy({
      by: ["marketplace", "deliveryMethod", "priceBand"],
      _count: true,
      where: where, // Применяем те же фильтры
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
      stats: stats
        .filter((s) => s.marketplace && s.deliveryMethod) // deliveryMethod обязателен для наших тарифов
        .map((s) => ({
          marketplace: s.marketplace || "unknown",
          deliveryMethod: s.deliveryMethod || null,
          priceBand: (s as any).priceBand || null,
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
