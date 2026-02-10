-- Миграция: добавление таблицы CategoryCommission для хранения категорий и комиссий маркетплейсов

CREATE TABLE IF NOT EXISTS "CategoryCommission" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'ozon',
    "categoryId" TEXT,
    "categoryName" TEXT NOT NULL,
    "categoryPath" TEXT,
    "fulfillment" TEXT NOT NULL,
    "commissionPercent" DOUBLE PRECISION NOT NULL,
    "minCommissionAmount" DOUBLE PRECISION,
    "fixedFeeAmount" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryCommission_pkey" PRIMARY KEY ("id")
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS "CategoryCommission_marketplace_categoryName_fulfillment_idx" ON "CategoryCommission"("marketplace", "categoryName", "fulfillment");
CREATE INDEX IF NOT EXISTS "CategoryCommission_marketplace_categoryId_fulfillment_idx" ON "CategoryCommission"("marketplace", "categoryId", "fulfillment");
