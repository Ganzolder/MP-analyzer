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
      orderBy: [
        { shipmentPointGroup: "asc" },
        { shipmentMethod: "asc" },
      ],
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
      shipmentMethod?: string | null; // self, trust, standard, или null
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

        const shipmentMethodValue: string | null = t.shipmentMethod ?? null;
        
        const res = await prisma.dispatchTariff.upsert({
          where: {
            marketplace_shipmentPointGroup_shipmentMethod: {
              marketplace,
              shipmentPointGroup: t.shipmentPointGroup,
              shipmentMethod: shipmentMethodValue,
            },
          },
          update: {
            dispatchFee: t.dispatchFee,
            notes: t.notes ?? null,
          },
          create: {
            marketplace,
            shipmentPointGroup: t.shipmentPointGroup,
            shipmentMethod: shipmentMethodValue,
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
  // Добавляем колонку shipmentMethod, если её нет
  await prisma.$executeRaw`
    ALTER TABLE "DispatchTariff" 
    ADD COLUMN IF NOT EXISTS "shipmentMethod" TEXT
  `.catch(() => {
    // Игнорируем ошибку, если колонка уже существует
  });

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "DispatchTariff" (
      "id" TEXT NOT NULL,
      "marketplace" TEXT NOT NULL DEFAULT 'ozon',
      "shipmentPointGroup" TEXT NOT NULL,
      "shipmentMethod" TEXT,
      "dispatchFee" DOUBLE PRECISION NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DispatchTariff_pkey" PRIMARY KEY ("id")
    )
  `;

  // Удаляем старый уникальный индекс, если существует
  await prisma.$executeRaw`
    DROP INDEX IF EXISTS "DispatchTariff_marketplace_shipmentPointGroup_key"
  `.catch(() => {});

  // Создаём новый уникальный индекс с shipmentMethod
  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "DispatchTariff_marketplace_shipmentPointGroup_shipmentMethod_key"
    ON "DispatchTariff"("marketplace", "shipmentPointGroup", "shipmentMethod")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "DispatchTariff_marketplace_shipmentPointGroup_idx"
    ON "DispatchTariff"("marketplace", "shipmentPointGroup")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "DispatchTariff_marketplace_shipmentPointGroup_shipmentMethod_idx"
    ON "DispatchTariff"("marketplace", "shipmentPointGroup", "shipmentMethod")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "DispatchTariff_isActive_idx"
    ON "DispatchTariff"("isActive")
  `;
}
