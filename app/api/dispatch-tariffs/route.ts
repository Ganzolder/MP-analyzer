import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/dispatch-tariffs
 * Получение тарифов за отправление (ПВЗ/ППЗ, СЦ)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const marketplace = (searchParams.get("marketplace") || "ozon").toLowerCase();

    const tariffs = await prisma.dispatchTariff.findMany({
      where: { marketplace, isActive: true },
      orderBy: { shipmentPointGroup: "asc" },
    });

    return NextResponse.json({ success: true, data: tariffs });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при получении dispatch-тарифов:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Ошибка при получении тарифов", data: [] },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dispatch-tariffs
 * Сохранение тарифов за отправление
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const marketplace = (body.marketplace || "ozon").toLowerCase();
    const tariffs = body.tariffs as Array<{
      shipmentPointGroup: string;
      dispatchFee: number;
      notes?: string | null;
    }>;

    if (!Array.isArray(tariffs)) {
      return NextResponse.json(
        { success: false, error: "Ожидается массив tariffs" },
        { status: 400 }
      );
    }

    // Гарантируем существование таблицы
    await ensureDispatchTariffTable();

    const results = [];
    const errors: string[] = [];

    for (const t of tariffs) {
      try {
        if (!t.shipmentPointGroup || typeof t.dispatchFee !== "number") {
          errors.push(`Неверные данные для строки: ${JSON.stringify(t)}`);
          continue;
        }

        const res = await prisma.dispatchTariff.upsert({
          where: {
            marketplace_shipmentPointGroup: {
              marketplace,
              shipmentPointGroup: t.shipmentPointGroup,
            },
          },
          update: {
            dispatchFee: t.dispatchFee,
            notes: t.notes ?? null,
          },
          create: {
            marketplace,
            shipmentPointGroup: t.shipmentPointGroup,
            dispatchFee: t.dispatchFee,
            notes: t.notes ?? null,
          },
        });

        results.push(res);
      } catch (e: any) {
        errors.push(`Ошибка при сохранении ${t.shipmentPointGroup}: ${e.message}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      saved: results.length,
      message: `Сохранено тарифов: ${results.length}`,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка POST /dispatch-tariffs:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Ошибка при сохранении тарифов" },
      { status: 500 }
    );
  }
}

async function ensureDispatchTariffTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "DispatchTariff" (
      "id" TEXT NOT NULL,
      "marketplace" TEXT NOT NULL DEFAULT 'ozon',
      "shipmentPointGroup" TEXT NOT NULL,
      "dispatchFee" DOUBLE PRECISION NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DispatchTariff_pkey" PRIMARY KEY ("id")
    )
  `;

  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "DispatchTariff_marketplace_shipmentPointGroup_key"
    ON "DispatchTariff"("marketplace", "shipmentPointGroup")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "DispatchTariff_marketplace_shipmentPointGroup_idx"
    ON "DispatchTariff"("marketplace", "shipmentPointGroup")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "DispatchTariff_isActive_idx"
    ON "DispatchTariff"("isActive")
  `;
}
