import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/acquiring-settings
 * Получение настроек эквайринга
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const marketplace = (searchParams.get("marketplace") || "ozon").toLowerCase();

    // Гарантируем существование таблицы и колонок
    await ensureAcquiringSettingsTable();

    const settings = await prisma.acquiringSettings.findUnique({
      where: { marketplace },
    });

    return NextResponse.json({
      success: true,
      data: settings || { marketplace, acquiringPercent: 0, lastMileFee: 25, deliveryToPickupFee: 25, isActive: true },
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при получении настроек эквайринга:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при получении настроек эквайринга",
        data: null,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/acquiring-settings
 * Сохранение настроек эквайринга
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const marketplace = (body.marketplace || "ozon").toLowerCase();
    const { acquiringPercent, lastMileFee, deliveryToPickupFee, notes } = body;

    if (typeof acquiringPercent !== "number" || acquiringPercent < 0) {
      return NextResponse.json(
        { success: false, error: "Неверное значение процента эквайринга" },
        { status: 400 }
      );
    }

    // Гарантируем существование таблицы
    await ensureAcquiringSettingsTable();

    const updateData: any = {
      acquiringPercent,
      notes: notes || null,
      updatedAt: new Date(),
    };
    const createData: any = {
      marketplace,
      acquiringPercent,
      notes: notes || null,
      isActive: true,
    };

    if (typeof lastMileFee === "number") {
      updateData.lastMileFee = lastMileFee;
      createData.lastMileFee = lastMileFee;
    }
    if (typeof deliveryToPickupFee === "number") {
      updateData.deliveryToPickupFee = deliveryToPickupFee;
      createData.deliveryToPickupFee = deliveryToPickupFee;
    }

    const settings = await prisma.acquiringSettings.upsert({
      where: { marketplace },
      update: updateData,
      create: createData,
    });

    return NextResponse.json({
      success: true,
      message: "Настройки эквайринга успешно сохранены",
      data: settings,
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при сохранении настроек эквайринга:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при сохранении настроек эквайринга",
      },
      { status: 500 }
    );
  }
}

async function ensureAcquiringSettingsTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "AcquiringSettings" (
      "id" TEXT NOT NULL,
      "marketplace" TEXT NOT NULL DEFAULT 'ozon',
      "acquiringPercent" DOUBLE PRECISION NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AcquiringSettings_pkey" PRIMARY KEY ("id")
    )
  `;

  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "AcquiringSettings_marketplace_key"
    ON "AcquiringSettings"("marketplace")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "AcquiringSettings_marketplace_idx"
    ON "AcquiringSettings"("marketplace")
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "AcquiringSettings_isActive_idx"
    ON "AcquiringSettings"("isActive")
  `;

  // Soft migrations: добавляем новые колонки если их нет
  await prisma.$executeRaw`ALTER TABLE "AcquiringSettings" ADD COLUMN IF NOT EXISTS "lastMileFee" DOUBLE PRECISION NOT NULL DEFAULT 25`;
  await prisma.$executeRaw`ALTER TABLE "AcquiringSettings" ADD COLUMN IF NOT EXISTS "deliveryToPickupFee" DOUBLE PRECISION NOT NULL DEFAULT 25`;
}
