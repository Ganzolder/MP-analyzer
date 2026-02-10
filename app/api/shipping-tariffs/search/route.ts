import { NextRequest, NextResponse } from "next/server";
import { getShippingCost } from "@/lib/calculator/services/shipping-calculator";

/**
 * POST /api/shipping-tariffs/search
 * Поиск тарифа и расчёт стоимости доставки
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      marketplace,
      fromRegion,
      toRegion,
      fromCity,
      toCity,
      weight,
      length,
      width,
      height,
      volume,
      deliveryType,
      deliveryMethod,
      category,
      distance,
    } = body;

    if (!marketplace) {
      return NextResponse.json(
        { error: "Параметр marketplace обязателен" },
        { status: 400 }
      );
    }

    const result = await getShippingCost({
      marketplace,
      fromRegion,
      toRegion,
      fromCity,
      toCity,
      weight,
      length,
      width,
      height,
      volume,
      deliveryType,
      deliveryMethod,
      category,
      distance,
    });

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          message: "Тариф не найден для указанных параметров",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при поиске тарифа:", error);
    return NextResponse.json(
      {
        error: "Ошибка при поиске тарифа",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
