import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/category-commissions/check
 * Проверка загруженных данных: количество записей, примеры значений, статистика
 */
export async function GET(request: NextRequest) {
  try {
    // Общее количество записей
    const totalCount = await prisma.categoryCommission.count();

    // Статистика по маркетплейсам и типам размещения
    const stats = await prisma.categoryCommission.groupBy({
      by: ["marketplace", "fulfillment"],
      _count: true,
      _avg: {
        commissionPercent: true,
      },
      _min: {
        commissionPercent: true,
      },
      _max: {
        commissionPercent: true,
      },
    });

    // Примеры записей с разными процентами (для проверки корректности)
    const samples = await prisma.categoryCommission.findMany({
      take: 20,
      orderBy: [
        { commissionPercent: "asc" },
        { categoryName: "asc" },
      ],
      select: {
        id: true,
        categoryName: true,
        fulfillment: true,
        commissionPercent: true,
        marketplace: true,
      },
    });

    // Проверка на подозрительно малые проценты (< 1%)
    const suspiciousLow = await prisma.categoryCommission.findMany({
      where: {
        commissionPercent: {
          lt: 1,
        },
      },
      take: 10,
      select: {
        categoryName: true,
        fulfillment: true,
        commissionPercent: true,
      },
    });

    // Проверка на подозрительно большие проценты (> 100%)
    const suspiciousHigh = await prisma.categoryCommission.findMany({
      where: {
        commissionPercent: {
          gt: 100,
        },
      },
      take: 10,
      select: {
        categoryName: true,
        fulfillment: true,
        commissionPercent: true,
      },
    });

    return NextResponse.json({
      success: true,
      totalCount,
      stats: stats.map((s) => ({
        marketplace: s.marketplace,
        fulfillment: s.fulfillment,
        count: s._count,
        avgPercent: s._avg.commissionPercent,
        minPercent: s._min.commissionPercent,
        maxPercent: s._max.commissionPercent,
      })),
      samples,
      warnings: {
        suspiciousLow: suspiciousLow.length > 0 ? {
          count: await prisma.categoryCommission.count({
            where: { commissionPercent: { lt: 1 } },
          }),
          examples: suspiciousLow,
          message: "⚠️ Найдены записи с процентом < 1%. Возможно, они были неправильно преобразованы из десятичной дроби.",
        } : null,
        suspiciousHigh: suspiciousHigh.length > 0 ? {
          count: await prisma.categoryCommission.count({
            where: { commissionPercent: { gt: 100 } },
          }),
          examples: suspiciousHigh,
          message: "⚠️ Найдены записи с процентом > 100%. Возможно, ошибка в данных.",
        } : null,
      },
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при проверке данных:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при проверке данных",
        totalCount: 0,
        stats: [],
        samples: [],
      },
      { status: 500 }
    );
  }
}
