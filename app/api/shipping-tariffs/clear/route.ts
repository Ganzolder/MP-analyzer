import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * POST /api/shipping-tariffs/clear
 * Полная очистка таблицы тарифов логистики
 */
export async function POST(_request: NextRequest) {
  try {
    const result = await prisma.shippingTariff.deleteMany({});

    return NextResponse.json({
      success: true,
      message: `Удалено тарифов: ${result.count}`,
      deleted: result.count,
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при очистке тарифов:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при очистке тарифов",
      },
      { status: 500 }
    );
  }
}
