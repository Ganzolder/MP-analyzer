import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * POST /api/shipping-tariffs/clear
 * Очистка тарифов логистики (всех или по фильтрам)
 */
export async function POST(request: NextRequest) {
  try {
    // Опциональные фильтры: marketplace, deliveryMethod, priceBand
    let body: any = null;
    try {
      body = await request.json();
    } catch {
      body = null; // body может отсутствовать
    }

    const where: any = {};
    if (body?.marketplace) where.marketplace = String(body.marketplace).toLowerCase();
    if (body?.deliveryMethod) where.deliveryMethod = String(body.deliveryMethod).toLowerCase();
    if (body?.priceBand) where.priceBand = String(body.priceBand).toLowerCase();

    const result = await prisma.shippingTariff.deleteMany({
      where: Object.keys(where).length > 0 ? where : undefined,
    });

    return NextResponse.json({
      success: true,
      message: `Удалено тарифов: ${result.count}`,
      deleted: result.count,
      clearedWhere: Object.keys(where).length > 0 ? where : "all",
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
