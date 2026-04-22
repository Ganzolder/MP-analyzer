# Ozon Analyzer — Project Context

## Назначение

Веб-приложение для анализа финансовых отчётов Ozon-селлеров. Загрузка XLS/XLSX → парсинг → агрегация → метрики → визуализация + AI-рекомендации. Дополнительно — калькулятор юнит-экономики по тарифам Ozon.

## Стек

| Слой | Технологии |
|------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5.3 |
| UI | React 18, Tailwind CSS 3.4, Radix UI (shadcn/ui), Framer Motion |
| Графики | Recharts |
| State | Zustand |
| БД | Prisma → PostgreSQL (prod) / SQLite (dev) |
| AI | Vercel AI SDK (`ai`), провайдеры: OpenAI, Anthropic, Google |
| Парсинг | xlsx, exceljs, iconv-lite, codepage, sax, yauzl |
| Экспорт | jspdf, html2canvas, exceljs |
| Auth | NextAuth 5 beta (GitHub OAuth, заготовка) |
| Деплой | Vercel |

## Структура

```
app/                 # Next.js App Router (страницы + API routes)
  page.tsx           # Главная — загрузка файлов
  analysis/[id]/     # Результаты анализа
  calculator/        # Калькулятор юнит-экономики
  admin/             # Управление тарифами, комиссиями, эквайрингом
  settings/          # Настройки (заготовка)
  reports/           # История отчётов (заготовка)
  api/               # API Routes (~20 эндпоинтов)

components/          # React компоненты
  ui/                # shadcn/ui базовые (button, card, dialog…)
  upload/            # Загрузка файлов (drag-and-drop)
  analysis/          # AI-анализ, прогресс
  report/            # Отчёт: метрики, таблицы, графики, экспорт
  calculator/        # Калькулятор Ozon
  layout/            # Header
  settings/          # Форма настроек
  common/            # LoadingSpinner

lib/
  analysis/          # Ядро анализа данных
    parsers/         # Парсеры Excel (file-parser, xlsx-raw, buyout-report)
    aggregators/     # Агрегация заказов / не-заказных начислений
    calculators/     # Метрики: summary, product, cost, daily, scheme, charge-type
    analyzers/       # Проблемы + рекомендации
    utils/           # top-products, recalculate-with-exclusions
  calculator/        # Калькулятор юнит-экономики (parsers, services)
  ai/                # AI-интеграция (context-preparer, ai-service)
  store/             # Zustand stores (analysis, upload, settings, calculator, excluded-products)
  config/            # Константы, ai-providers, plans, charge-type-mapping
  types/             # TypeScript типы (analysis, calculator, commissions, shipping)
  db/                # Prisma client singleton
  api/               # file-processor
  utils/             # logger, date-grouping, export-xlsx, python-decoder, remove-markdown
  mock/              # Мок-данные анализа

prisma/              # Схема БД + миграции
scripts/             # Отладочные скрипты
docs/                # Документация проекта
```

## Точки входа

- **Приложение**: `app/page.tsx` → `/api/analyze` → `lib/analysis/analyzer.ts`
- **Калькулятор**: `app/calculator/page.tsx` → `/api/calculate` / `/api/calculate-bulk`
- **Админка тарифов**: `app/admin/*` → `/api/shipping-tariffs`, `/api/processing-tariffs`, `/api/dispatch-tariffs`, `/api/category-commissions`, `/api/acquiring-settings`
- **AI**: `/api/ai/analyze` и `/api/analysis/[id]/ai` → `lib/ai/ai-service.ts`
- **Экспорт**: `/api/export/pdf/[id]`, `/api/export/xlsx/[id]`

## БД (Prisma models)

`User`, `Account`, `Session`, `VerificationToken` — NextAuth.
`Report` — сохранённые отчёты анализа.
`CostData` — себестоимость по SKU.
`Subscription` — подписки (заготовка).
`AIUsageLog` — логи AI.
`ShippingTariff` — тарифы перевозки.
`ProcessingTariff` — тарифы обработки отправлений.
`DispatchTariff` — тарифы за отправление.
`AcquiringSettings` — эквайринг.
`CategoryCommission` — комиссии по категориям (матрица FBO/FBS).

## Конвенции

- **Язык кода**: TypeScript, именование — camelCase (переменные/функции), PascalCase (компоненты, типы).
- **Стили**: Tailwind utility classes, `cn()` helper из `lib/utils.ts`.
- **State**: Zustand stores в `lib/store/`, каждый store — отдельный файл.
- **API Routes**: Next.js route handlers (`route.ts`), стандартные `NextRequest`/`NextResponse`.
- **Парсинг**: специфичная логика для кодировок Ozon (KOI-7, UTF-16LE) в `lib/analysis/encoding.ts`.
- **Коммиты**: conventional commits, описание на русском.

## Ограничения / особенности

- Python-сервис (`python-service/`) не используется активно, возвращает моки. Весь анализ — в TypeScript.
- NextAuth интеграция — заготовка, не полностью подключена.
- Система подписок (Stripe) — только модель в БД.
- `test/` — тестовые файлы Excel, автоматических тестов нет.
