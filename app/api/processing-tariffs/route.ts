import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/processing-tariffs
 * Получение всех тарифов обработки отправлений
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const marketplace = searchParams.get("marketplace") || "ozon";

    const tariffs = await prisma.processingTariff.findMany({
      where: {
        marketplace: marketplace.toLowerCase(),
        isActive: true,
      },
      orderBy: {
        shipmentPointType: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      data: tariffs,
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при получении тарифов обработки:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при получении тарифов обработки",
        data: [],
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/processing-tariffs
 * Сохранение тарифов обработки отправлений
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { marketplace = "ozon", tariffs } = body;

    if (!Array.isArray(tariffs)) {
      return NextResponse.json(
        { error: "Неверный формат данных. Ожидается массив тарифов." },
        { status: 400 }
      );
    }

    // Гарантируем существование таблицы
    await ensureProcessingTariffTable();

    const results = [];
    const errors: string[] = [];

    for (const tariff of tariffs) {
      try {
        const { shipmentPointType, ozonProcessingFee, partnerProcessingFee, notes } = tariff;

        if (!shipmentPointType) {
          errors.push(`Пропущен тип точки отгрузки`);
          continue;
        }

        if (typeof ozonProcessingFee !== "number" || typeof partnerProcessingFee !== "number") {
          errors.push(`Неверные значения тарифов для ${shipmentPointType}`);
          continue;
        }

        // Используем upsert для обновления существующих или создания новых
        const result = await prisma.processingTariff.upsert({
          where: {
            marketplace_shipmentPointType: {
              marketplace: marketplace.toLowerCase(),
              shipmentPointType: String(shipmentPointType).trim(),
            },
          },
          update: {
            ozonProcessingFee,
            partnerProcessingFee,
            notes: notes || null,
            updatedAt: new Date(),
          },
          create: {
            marketplace: marketplace.toLowerCase(),
            shipmentPointType: String(shipmentPointType).trim(),
            ozonProcessingFee,
            partnerProcessingFee,
            notes: notes || null,
            isActive: true,
          },
        });

        results.push(result);
      } catch (error: any) {
        errors.push(`Ошибка при сохранении ${tariff.shipmentPointType}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      message: `Сохранено тарифов: ${results.length}${errors.length > 0 ? `. Ошибок: ${errors.length}` : ""}`,
      saved: results.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при сохранении тарифов обработки:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при сохранении тарифов обработки",
      },
      { status: 500 }
    );
  }
}

async function ensureProcessingTariffTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "ProcessingTariff" (
      "id" TEXT NOT NULL,
      "marketplace" TEXT NOT NULL DEFAULT 'ozon',
      "shipmentPointType" TEXT NOT NULL,
      "ozonProcessingFee" DOUBLE PRECISION NOT NULL,
      "partnerProcessingFee" DOUBLE PRECISION NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProcessingTariff_pkey" PRIMARY KEY ("id")
    )
  `;

  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "ProcessingTariff_marketplace_shipmentPointType_key"
    ON "ProcessingTariff"("marketplace", "shipmentPointType")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "ProcessingTariff_marketplace_shipmentPointType_idx"
    ON "ProcessingTariff"("marketplace", "shipmentPointType")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "ProcessingTariff_isActive_idx"
    ON "ProcessingTariff"("isActive")
  `;
}
