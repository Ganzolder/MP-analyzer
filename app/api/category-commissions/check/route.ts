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

    // Статистика по маркетплейсам
    const stats = await prisma.categoryCommission.groupBy({
      by: ["marketplace"],
      _count: true,
    });

    // Примеры строк матрицы
    const samples = await prisma.categoryCommission.findMany({
      take: 20,
      orderBy: [
        { categoryName: "asc" },
        { productType: "asc" },
      ],
      select: {
        id: true,
        categoryName: true,
        productType: true,
        fboUpTo100: true,
        fbo100To300: true,
        fbo300To500: true,
        fbo500To1500: true,
        fboOver1500: true,
        fboFreshUpTo100: true,
        fboFresh100To300: true,
        fboFreshOver300: true,
        fbsUpTo100: true,
        fbs100To300: true,
        fbsOver300: true,
        rfbs: true,
        marketplace: true,
      },
    });

    // Для новой схемы считаем значения по каждому полю тарифа
    const rateFields = [
      "fboUpTo100",
      "fbo100To300",
      "fbo300To500",
      "fbo500To1500",
      "fboOver1500",
      "fboFreshUpTo100",
      "fboFresh100To300",
      "fboFreshOver300",
      "fbsUpTo100",
      "fbs100To300",
      "fbsOver300",
      "rfbs",
    ] as const;

    const allRows = await prisma.categoryCommission.findMany({
      select: {
        categoryName: true,
        productType: true,
        fboUpTo100: true,
        fbo100To300: true,
        fbo300To500: true,
        fbo500To1500: true,
        fboOver1500: true,
        fboFreshUpTo100: true,
        fboFresh100To300: true,
        fboFreshOver300: true,
        fbsUpTo100: true,
        fbs100To300: true,
        fbsOver300: true,
        rfbs: true,
      },
      take: 5000,
    });

    const suspiciousLow: any[] = [];
    const suspiciousHigh: any[] = [];
    for (const row of allRows) {
      for (const field of rateFields) {
        const value = (row as any)[field];
        if (value == null) continue;
        if (value > 0 && value < 1 && suspiciousLow.length < 20) {
          suspiciousLow.push({
            categoryName: row.categoryName,
            productType: row.productType,
            field,
            value,
          });
        }
        if (value > 100 && suspiciousHigh.length < 20) {
          suspiciousHigh.push({
            categoryName: row.categoryName,
            productType: row.productType,
            field,
            value,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalCount,
      stats: stats.map((s) => ({
        marketplace: s.marketplace,
        count: s._count,
      })),
      samples,
      warnings: {
        suspiciousLow: suspiciousLow.length > 0 ? {
          count: suspiciousLow.length,
          examples: suspiciousLow,
          message: "⚠️ Найдены значения ставок < 1%. Возможно, дробные проценты не были умножены на 100.",
        } : null,
        suspiciousHigh: suspiciousHigh.length > 0 ? {
          count: suspiciousHigh.length,
          examples: suspiciousHigh,
          message: "⚠️ Найдены значения ставок > 100%. Возможно, ошибка данных.",
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
