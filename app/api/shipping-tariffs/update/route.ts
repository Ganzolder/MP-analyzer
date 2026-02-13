import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * PUT /api/shipping-tariffs/update
 * Обновление тарифа логистики по ID
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, basePrice, volumeMin, volumeMax, isActive } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID тарифа обязателен" },
        { status: 400 }
      );
    }

    if (basePrice !== undefined && (typeof basePrice !== "number" || basePrice < 0)) {
      return NextResponse.json(
        { success: false, error: "basePrice должен быть неотрицательным числом" },
        { status: 400 }
      );
    }

    // Проверяем существование тарифа
    const existing = await prisma.shippingTariff.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Тариф не найден" },
        { status: 404 }
      );
    }

    // Формируем объект обновления
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (basePrice !== undefined) {
      updateData.basePrice = basePrice;
    }

    if (volumeMin !== undefined) {
      updateData.volumeMin = volumeMin === null ? null : Number(volumeMin);
    }

    if (volumeMax !== undefined) {
      updateData.volumeMax = volumeMax === null ? null : Number(volumeMax);
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    // Обновляем тариф
    const updated = await prisma.shippingTariff.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "Тариф успешно обновлён",
      data: updated,
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при обновлении тарифа:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при обновлении тарифа",
      },
      { status: 500 }
    );
  }
}
