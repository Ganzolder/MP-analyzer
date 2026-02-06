# 📁 Структура файловой системы

## Корневая директория

```
C:\IAO\MP analyzer\
├── app/                    # Next.js App Router
├── components/             # React компоненты
├── lib/                    # Библиотеки и утилиты
├── prisma/                 # Prisma схема и миграции
├── python-service/         # Python микросервис (опционально)
├── docs/                   # Документация проекта
├── test/                   # Тестовые файлы
├── temp/                   # Временные файлы
├── scripts/                # Вспомогательные скрипты
├── public/                 # Статические файлы
├── .env                    # Переменные окружения (не в git)
├── .gitignore             # Git ignore правила
├── next.config.js         # Конфигурация Next.js
├── package.json           # Зависимости Node.js
├── tsconfig.json          # Конфигурация TypeScript
├── tailwind.config.ts     # Конфигурация Tailwind
├── vercel.json            # Конфигурация Vercel
└── README.md              # Основной README
```

## app/ - Next.js App Router

### Страницы

```
app/
├── page.tsx                    # Главная страница (загрузка файлов)
├── layout.tsx                  # Корневой layout
├── globals.css                 # Глобальные стили
├── analysis/
│   └── [id]/
│       └── page.tsx            # Страница результатов анализа
├── reports/
│   └── page.tsx                # История отчётов (заготовка)
└── settings/
    └── page.tsx                # Настройки (заготовка)
```

### API Routes

```
app/api/
├── analyze/
│   └── route.ts               # POST - запуск анализа файла(ов)
├── analysis/
│   └── [id]/
│       ├── route.ts           # GET - получение результата анализа
│       └── recalculate/
│           └── route.ts       # POST - пересчёт с исключениями
├── upload/
│   └── route.ts               # POST - загрузка файла (не используется)
├── export/
│   ├── pdf/
│   │   └── [id]/
│   │       └── route.ts       # GET - экспорт в PDF
│   └── xlsx/
│       └── [id]/
│           └── route.ts       # GET - экспорт в XLSX
├── ai/
│   └── route.ts               # POST - AI анализ
└── reports/
    └── route.ts               # GET - список отчётов (заготовка)
```

## components/ - React компоненты

```
components/
├── ui/                        # shadcn/ui компоненты (Button, Card, Dialog и т.д.)
├── upload/                     # Компоненты загрузки файлов
│   ├── FileUpload.tsx
│   └── FileUploadZone.tsx
├── analysis/                  # Компоненты анализа
│   ├── AIAnalysisButton.tsx
│   ├── AIToggle.tsx
│   ├── AnalysisProgress.tsx
│   └── CustomPromptInput.tsx
├── report/                    # Компоненты отчёта
│   ├── MetricCard.tsx
│   ├── ChartSection.tsx
│   ├── RecommendationsList.tsx
│   ├── ExportButtons.tsx
│   ├── CostBreakdownDetails.tsx
│   ├── ArticlesComparison.tsx
│   ├── RevenueCostCharts.tsx
│   ├── AllProductsTable.tsx
│   ├── ProductsWithCostTable.tsx
│   ├── ProductsWithoutCostTable.tsx
│   ├── OrdersProfitabilityTable.tsx
│   └── ... (другие компоненты отчёта)
├── layout/
│   └── Header.tsx
├── settings/
│   └── BusinessSettingsForm.tsx
└── common/
    └── LoadingSpinner.tsx
```

## lib/ - Библиотеки и утилиты

### lib/analysis/ - Ядро анализа

```
lib/analysis/
├── index.ts                   # Публичный API модуля
├── analyzer.ts                # Главный класс OzonReportAnalyzer
├── types.ts                   # TypeScript типы
├── constants.ts               # Константы (паттерны, категории)
├── data-utils.ts              # Утилиты для работы с данными
├── encoding.ts                # Декодирование кодировок (KOI-7, UTF-16LE)
├── converter.ts               # Конвертер XLSX → XLS
├── cost-parser.ts             # Парсер файла себестоимости
├── merge-results.ts           # Объединение результатов анализа
├── charge-type-groups.ts      # Группировка типов начислений
├── utils.ts                   # Вспомогательные функции
│
├── parsers/                   # Парсеры файлов
│   ├── file-parser.ts         # Основной парсер Excel
│   └── xlsx-raw-parser.ts     # Парсер сырых данных XLSX
│
├── aggregators/               # Агрегаторы данных
│   ├── order-aggregator.ts    # Агрегация заказов
│   └── non-order-aggregator.ts # Агрегация начислений без заказов
│
├── calculators/               # Калькуляторы метрик
│   ├── summary-calculator.ts  # Сводные метрики
│   ├── product-metrics-calculator.ts # Метрики по товарам
│   ├── cost-calculator.ts     # Расчёт себестоимости
│   ├── daily-metrics-calculator.ts # Метрики по дням
│   ├── scheme-stats-calculator.ts # Статистика по схемам
│   ├── charge-type-breakdown-calculator.ts # Детализация по типам
│   └── cost-reports-calculator.ts # Отчёты по себестоимости
│
├── analyzers/                 # Анализаторы
│   ├── problem-identifier.ts  # Выявление проблемных зон
│   └── recommendation-generator.ts # Генерация рекомендаций
│
└── utils/                     # Утилиты анализа
    ├── top-products.ts        # Топ товаров
    └── recalculate-with-exclusions.ts # Пересчёт с исключениями
```

### lib/ - Другие модули

```
lib/
├── ai/                        # AI интеграция
│   ├── context-preparer.ts   # Подготовка контекста для AI
│   └── providers.ts          # Провайдеры AI (OpenAI, Anthropic, Google)
├── store/                     # Zustand stores
│   ├── analysis-store.ts     # Store анализа
│   ├── upload-store.ts       # Store загрузки
│   └── settings-store.ts    # Store настроек
├── config/                    # Конфигурация
│   ├── ai-providers.ts       # Настройки AI провайдеров
│   └── ...                   # Другие конфиги
├── db/                        # База данных
│   └── prisma.ts             # Prisma client
├── types/                     # Общие типы
│   └── index.ts
├── utils/                     # Утилиты
│   ├── logger.ts             # Логирование
│   └── ...                   # Другие утилиты
├── mock/                      # Mock данные
│   └── analysis-mock.ts      # Mock результаты анализа
└── utils.ts                  # Общие утилиты
```

## prisma/ - База данных

```
prisma/
├── schema.prisma             # Схема базы данных
├── migrations/               # Миграции
│   └── init.sql
└── dev.db                   # SQLite база (dev, не в git)
```

### Модели БД

- **User** - пользователи (NextAuth)
- **Account** - аккаунты OAuth
- **Session** - сессии
- **Report** - отчёты анализа
- **CostData** - данные о себестоимости
- **Subscription** - подписки пользователей
- **AIUsageLog** - логи использования AI

## python-service/ - Python микросервис

```
python-service/
├── main.py                   # FastAPI приложение
├── analyzers/                # Анализаторы (mock данные)
│   ├── order_analyzer.py
│   ├── profit_analyzer.py
│   ├── cost_analyzer.py
│   └── trend_analyzer.py
├── utils/
│   ├── data_processor.py    # Обработка данных
│   └── koi7_decoder.py      # Декодер KOI-7
├── models/
│   └── analysis_result.py   # Pydantic модели
├── requirements.txt          # Python зависимости
└── ...                      # Тестовые скрипты
```

**Примечание:** Python сервис в настоящее время не используется активно. Все анализаторы возвращают mock данные. Реальный анализ выполняется в TypeScript модулях.

## test/ - Тестовые файлы

```
test/
├── *.xlsx                    # Тестовые Excel файлы
├── *.zip                    # Архивы с тестовыми файлами
└── analysis-result.json     # Пример результата анализа
```

## docs/ - Документация

```
docs/
├── 00-PROJECT-OVERVIEW.md   # Обзор проекта
├── 01-FILE-STRUCTURE.md     # Структура файлов (этот файл)
├── 02-ARCHITECTURE.md        # Архитектура и принципы работы
├── 03-API.md                # API документация
└── 04-DEVELOPMENT.md        # Инструкции по разработке
```

## Временные и служебные файлы

- **temp/** - временные файлы (не в git)
- **scripts/** - отладочные скрипты
- **.next/** - скомпилированные файлы Next.js (не в git)
- **node_modules/** - зависимости Node.js (не в git)

## Важные файлы конфигурации

- **package.json** - зависимости и скрипты
- **tsconfig.json** - настройки TypeScript
- **next.config.js** - конфигурация Next.js
- **tailwind.config.ts** - настройки Tailwind CSS
- **vercel.json** - конфигурация деплоя на Vercel
- **.env** - переменные окружения (не в git)
- **.gitignore** - правила игнорирования файлов
