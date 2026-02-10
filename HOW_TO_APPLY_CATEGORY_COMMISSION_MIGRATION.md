# Как применить миграцию для таблицы CategoryCommission

## Проблема
Если при загрузке файла категорий возникает ошибка 500, скорее всего таблица `CategoryCommission` не создана в базе данных.

## Решение

### Вариант 1: Автоматическое применение (рекомендуется)
Миграция должна применяться автоматически при деплое на Vercel через команду:
```bash
npx prisma migrate deploy
```

Но если это не сработало, используйте Вариант 2.

### Вариант 2: Ручное применение через Supabase Dashboard

1. Откройте Supabase Dashboard → SQL Editor
2. Скопируйте и выполните SQL из файла `prisma/migrations/add_category_commission.sql`:

```sql
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
```

3. Нажмите "Run" (или Ctrl+Enter)
4. Проверьте, что таблица создана: Table Editor → должна появиться таблица `CategoryCommission`

### Вариант 3: Через Prisma CLI (если есть доступ к DATABASE_URL)

```bash
# Применить все миграции
npx prisma migrate deploy

# Или применить конкретную миграцию
npx prisma db push
```

## Проверка

После применения миграции:
1. Откройте `/admin/category-commissions`
2. Загрузите файл с категориями
3. Должно работать без ошибки 500

## Если всё ещё не работает

Проверьте логи Vercel:
1. Vercel Dashboard → Deployments → последний деплой → Logs
2. Ищите ошибки, связанные с `CategoryCommission` или `prisma`
