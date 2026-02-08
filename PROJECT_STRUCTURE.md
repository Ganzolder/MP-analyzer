# 📚 Полная структура проекта и логика работы

## 🎯 Назначение проекта

**MP Analyzer** — веб-приложение для анализа финансовых отчётов маркетплейсов (Ozon, Wildberries, Yandex Market). Позволяет загружать Excel-файлы с отчётами, анализировать их и получать детальную аналитику с рекомендациями.

---

## 📁 Полная структура файлов и их функции

### 🗂️ Корневая директория

```
C:\IAO\MP analyzer\
├── app/                          # Next.js App Router (страницы и API)
├── components/                   # React компоненты UI
├── lib/                          # Бизнес-логика и утилиты
├── prisma/                       # Схема БД и миграции
├── public/                       # Статические файлы
├── docs/                         # Документация
├── scripts/                      # Вспомогательные скрипты
├── python-service/               # Python микросервис (не используется активно)
├── test/                         # Тестовые файлы
├── temp/                         # Временные файлы
├── package.json                  # Зависимости и скрипты
├── tsconfig.json                 # Конфигурация TypeScript
├── next.config.js                # Конфигурация Next.js
├── tailwind.config.ts            # Конфигурация Tailwind CSS
├── vercel.json                   # Конфигурация деплоя
└── .env.local                    # Переменные окружения (не в git)
```

---

## 📄 app/ — Next.js App Router

### Страницы (Pages)

#### `app/page.tsx` — Главная страница загрузки
**Назначение:** Интерфейс загрузки файлов и запуска анализа

**Основные функции:**
- `handleFileSelect(file: File)` — обработка выбора основного файла
- `handleCostFileSelect(file: File)` — обработка выбора файла себестоимости
- `handleAnalyze()` — запуск анализа
- `mergeFrontendResults()` — объединение результатов нескольких файлов

**Связи:**
- Использует `useUploadStore` для хранения файлов
- Использует `useAnalysisStore` для управления процессом анализа
- Отправляет запросы на `/api/analyze`
- Перенаправляет на `/analysis/[id]` после завершения

**Компоненты:**
- `FileUploader` / `MultiFileUploader` — загрузка файлов
- `AnalysisProgress` — модальное окно прогресса
- `CustomPromptInput` — ввод кастомного промпта для AI

---

#### `app/analysis/[id]/page.tsx` — Страница результатов анализа
**Назначение:** Отображение результатов анализа

**Основные функции:**
- Загрузка результатов из store или API
- Отображение метрик, графиков, таблиц
- Экспорт в PDF/XLSX
- Исключение товаров из анализа

**Связи:**
- Читает из `useAnalysisStore`
- Запрашивает `/api/analysis/[id]` если нет в store
- Использует компоненты из `components/report/`

**Компоненты:**
- `MetricCard` — карточки метрик
- `ChartSection` — графики
- `AllProductsTable` — таблица всех товаров
- `RecommendationsList` — рекомендации
- `ExportButtons` — кнопки экспорта

---

#### `app/calculator/page.tsx` — Калькулятор оптимальных цен
**Назначение:** Калькулятор для расчёта оптимальных цен на товары

**Связи:**
- Использует `OzonCalculator` компонент
- Использует `calculator-store` для состояния

---

#### `app/reports/page.tsx` — История отчётов
**Назначение:** Список всех сохранённых отчётов

**Связи:**
- Запрашивает `/api/reports`
- Использует Prisma для получения данных из БД

---

#### `app/settings/page.tsx` — Настройки
**Назначение:** Настройки приложения

---

#### `app/layout.tsx` — Корневой layout
**Назначение:** Общий layout для всех страниц

**Компоненты:**
- `Header` — навигация
- `Toaster` — уведомления

---

### API Routes

#### `app/api/analyze/route.ts` — Запуск анализа
**Назначение:** Главный endpoint для анализа файлов

**Функции:**
- `POST(request)` — обработка запроса на анализ

**Логика работы:**
1. Получение файлов из FormData
2. Валидация формата и размера
3. Парсинг файла себестоимости (если есть)
4. Вызов `analyzeReport()` для каждого файла
5. Объединение результатов (если несколько файлов)
6. Сохранение в БД через Prisma
7. Возврат результата

**Связи:**
- Импортирует `analyzeReport` из `lib/analysis`
- Импортирует `parseCostFile` из `lib/analysis/cost-parser`
- Использует `prisma` для сохранения в БД
- Сохраняет в таблицу `Report`

**Параметры запроса:**
- `files` — массив файлов (FormData)
- `costFile` — файл себестоимости (опционально)
- `analysisId` — ID анализа
- `?demo=true` — демо-режим (использует тестовый файл)

---

#### `app/api/analysis/[id]/route.ts` — Получение результата анализа
**Назначение:** Получение сохранённого результата анализа

**Функции:**
- `GET(request, { params })` — получение результата по ID

**Логика:**
1. Поиск в БД через Prisma
2. Если не найдено — возврат mock данных
3. Парсинг JSON из `analysisResults`

**Связи:**
- Использует `prisma.report.findUnique`
- Возвращает данные в формате `FrontendAnalysisResult`

---

#### `app/api/analysis/[id]/status/route.ts` — Статус анализа
**Назначение:** Получение статуса выполнения анализа

**Функции:**
- `GET(request, { params })` — получение статуса

**Связи:**
- Использует `prisma.report.findUnique`
- Возвращает `status`, `progress`, `currentStep`

---

#### `app/api/analysis/[id]/recalculate/route.ts` — Пересчёт с исключениями
**Назначение:** Пересчёт метрик с исключёнными товарами

**Функции:**
- `POST(request, { params })` — пересчёт

**Логика:**
1. Получение исходных данных анализа
2. Получение списка исключённых SKU из body
3. Вызов `recalculateWithExclusions()`
4. Возврат обновлённых метрик

**Связи:**
- Использует `recalculateWithExclusions` из `lib/analysis/utils/recalculate-with-exclusions`

---

#### `app/api/analysis/[id]/ai/route.ts` — AI анализ
**Назначение:** Запуск AI-анализа результатов

**Функции:**
- `POST(request, { params })` — запуск AI анализа

**Логика:**
1. Получение данных анализа
2. Подготовка контекста через `prepareContext()`
3. Выбор AI провайдера
4. Отправка запроса
5. Сохранение рекомендаций

**Связи:**
- Использует `AIService` из `lib/ai/ai-service`
- Использует `prepareContext` из `lib/ai/context-preparer`

---

#### `app/api/reports/route.ts` — Список отчётов
**Назначение:** Получение списка всех отчётов

**Функции:**
- `GET(request)` — получение списка

**Связи:**
- Использует `prisma.report.findMany`
- Сортирует по `createdAt DESC`

---

#### `app/api/export/pdf/[id]/route.ts` — Экспорт в PDF
**Назначение:** Генерация PDF отчёта

**Функции:**
- `GET(request, { params })` — генерация PDF

**Логика:**
1. Получение данных анализа
2. Рендеринг HTML через React
3. Конвертация в PDF через `html2canvas` + `jspdf`

---

#### `app/api/export/xlsx/[id]/route.ts` — Экспорт в XLSX
**Назначение:** Генерация Excel отчёта

**Функции:**
- `GET(request, { params })` — генерация XLSX

**Логика:**
1. Получение данных анализа
2. Создание Excel через `exceljs`
3. Заполнение листов данными
4. Возврат файла

**Связи:**
- Использует `exportToXLSX` из `lib/utils/export-xlsx`

---

#### `app/api/health/db/route.ts` — Проверка БД
**Назначение:** Health check для базы данных

**Функции:**
- `GET(request)` — проверка подключения и работы БД

**Проверяет:**
- Подключение к БД
- Существование таблиц
- Возможность записи
- Возможность чтения

---

#### `app/api/upload/route.ts` — Загрузка файла (не используется)
**Назначение:** Загрузка файла на сервер (устаревший endpoint)

**Примечание:** В текущей версии файлы отправляются напрямую в `/api/analyze`

---

## 🧩 components/ — React компоненты

### `components/ui/` — UI компоненты (shadcn/ui)
**Назначение:** Переиспользуемые UI компоненты

**Компоненты:**
- `button.tsx` — кнопки
- `card.tsx` — карточки
- `dialog.tsx` — модальные окна
- `input.tsx` — поля ввода
- `select.tsx` — выпадающие списки
- `tabs.tsx` — вкладки
- `toast.tsx` — уведомления
- `progress.tsx` — прогресс-бары
- `alert.tsx` — алерты
- И другие...

---

### `components/upload/` — Компоненты загрузки

#### `FileUploader.tsx`
**Назначение:** Компонент загрузки одного файла

**Функции:**
- Drag & drop интерфейс
- Валидация формата
- Отображение выбранного файла

**Связи:**
- Использует `react-dropzone`
- Вызывает callback при выборе файла

---

#### `MultiFileUploader.tsx`
**Назначение:** Компонент загрузки нескольких файлов

**Функции:**
- Загрузка множественных файлов
- Управление списком файлов
- Валидация

---

### `components/analysis/` — Компоненты анализа

#### `AnalysisProgress.tsx`
**Назначение:** Модальное окно прогресса анализа

**Функции:**
- Отображение шагов анализа
- Прогресс-бар
- Статусы шагов

**Связи:**
- Использует `useAnalysisStore` для получения статуса

---

#### `AIAnalysisButton.tsx`
**Назначение:** Кнопка запуска AI анализа

**Связи:**
- Отправляет запрос на `/api/analysis/[id]/ai`

---

#### `AIToggle.tsx`
**Назначение:** Переключатель AI анализа

---

#### `CustomPromptInput.tsx`
**Назначение:** Поле ввода кастомного промпта для AI

---

### `components/report/` — Компоненты отчёта

#### `MetricCard.tsx`
**Назначение:** Карточка с метрикой

**Параметры:**
- `title` — название метрики
- `value` — значение
- `change` — изменение (опционально)
- `icon` — иконка

---

#### `ChartSection.tsx`
**Назначение:** Секция с графиками

**Графики:**
- Выручка по дням
- Прибыль по дням
- Разбивка затрат
- Тренды

**Связи:**
- Использует `recharts` для графиков
- Получает данные из `analysisResult`

---

#### `AllProductsTable.tsx`
**Назначение:** Таблица всех товаров

**Функции:**
- Сортировка
- Фильтрация
- Пагинация
- Экспорт

**Отображает:**
- SKU
- Название
- Выручка
- Заказы
- Прибыль
- Маржа

---

#### `ProductsWithCostTable.tsx`
**Назначение:** Таблица товаров с себестоимостью

---

#### `ProductsWithoutCostTable.tsx`
**Назначение:** Таблица товаров без себестоимости

---

#### `OrdersProfitabilityTable.tsx`
**Назначение:** Таблица заказов с прибыльностью

---

#### `LossProductsTable.tsx`
**Назначение:** Таблица убыточных товаров

---

#### `CostSummary.tsx`
**Назначение:** Сводка по затратам

---

#### `CostBreakdownDetails.tsx`
**Назначение:** Детализация затрат по категориям

---

#### `CostDetails.tsx`
**Назначение:** Детальная информация о затратах

---

#### `RevenueCostCharts.tsx`
**Назначение:** Графики выручки и затрат

---

#### `ArticlesComparison.tsx`
**Назначение:** Сравнение артикулов

---

#### `ProductSalesAnalytics.tsx`
**Назначение:** Аналитика продаж товаров

---

#### `RecommendationsList.tsx`
**Назначение:** Список рекомендаций

**Отображает:**
- Рекомендации из анализа
- AI-рекомендации (если есть)

---

#### `ExportButtons.tsx`
**Назначение:** Кнопки экспорта

**Функции:**
- Экспорт в PDF
- Экспорт в XLSX

**Связи:**
- Отправляет запросы на `/api/export/pdf/[id]` и `/api/export/xlsx/[id]`

---

#### `ExportSectionButton.tsx`
**Назначение:** Кнопка экспорта секции

---

### `components/calculator/` — Компоненты калькулятора

#### `OzonCalculator.tsx`
**Назначение:** Калькулятор для Ozon

**Функции:**
- Загрузка Excel файла с товарами
- Настройка маржи (глобальная и по категориям)
- Парсинг файла
- Отображение результатов

**Связи:**
- Использует `ozon-file-parser` для парсинга
- Использует `calculator-store` для состояния
- Использует `OzonProductsTable` для отображения

---

#### `OzonProductsTable.tsx`
**Назначение:** Таблица товаров калькулятора

**Функции:**
- Пагинация (5, 10, 20, 50, 100)
- Отображение данных товаров
- Расчёт оптимальной цены

---

### `components/layout/` — Layout компоненты

#### `Header.tsx`
**Назначение:** Шапка сайта

**Функции:**
- Навигация
- Логотип
- Ссылки на страницы

---

### `components/settings/` — Компоненты настроек

#### `BusinessSettingsForm.tsx`
**Назначение:** Форма настроек бизнеса

---

### `components/common/` — Общие компоненты

#### `LoadingSpinner.tsx`
**Назначение:** Индикатор загрузки

---

## 📚 lib/ — Бизнес-логика и утилиты

### `lib/analysis/` — Ядро анализа

#### `lib/analysis/index.ts` — Публичный API модуля
**Назначение:** Экспорт всех функций анализа

**Экспорты:**
- `analyzeReport(file, fileName, costData?)` — главная функция анализа
- `OzonReportAnalyzer` — класс анализатора
- Все типы из `types.ts`

**Связи:**
- Импортирует все модули анализа
- Реэкспортирует типы

---

#### `lib/analysis/analyzer.ts` — Главный класс анализатора
**Назначение:** Координатор всего процесса анализа

**Класс:** `OzonReportAnalyzer`

**Методы:**
- `analyze(file, fileName, costData?)` — главный метод анализа

**Логика работы:**
1. Парсинг файла через `FileParser`
2. Агрегация заказов через `OrderAggregator`
3. Агрегация начислений без заказов через `NonOrderAggregator`
4. Расчёт метрик товаров через `ProductMetricsCalculator`
5. Добавление себестоимости через `CostCalculator`
6. Расчёт сводных метрик через `SummaryCalculator`
7. Расчёт метрик по дням через `DailyMetricsCalculator`
8. Статистика по схемам через `SchemeStatsCalculator`
9. Детализация по типам через `ChargeTypeBreakdownCalculator`
10. Отчёты по себестоимости через `CostReportsCalculator`
11. Выявление проблем через `ProblemIdentifier`
12. Генерация рекомендаций через `RecommendationGenerator`

**Связи:**
- Использует все модули анализа
- Возвращает `AnalysisResult`

---

#### `lib/analysis/types.ts` — TypeScript типы
**Назначение:** Все типы данных для анализа

**Основные типы:**
- `RawRow` — сырая строка из Excel
- `ChargeRow` — строка начисления
- `OrderStatus` — статус заказа
- `AggregatedOrder` — агрегированный заказ
- `NonOrderCharge` — начисление без заказа
- `ProductMetrics` — метрики товара
- `DailyMetrics` — метрики по дням
- `CostBreakdown` — разбивка затрат
- `ProblemArea` — проблемная зона
- `Recommendation` — рекомендация
- `AnalysisResult` — полный результат анализа

---

#### `lib/analysis/parsers/file-parser.ts` — Парсер файлов
**Назначение:** Парсинг Excel файлов

**Класс:** `FileParser`

**Методы:**
- `parse(file, fileName)` — парсинг файла

**Логика:**
1. Определение формата (XLS/XLSX)
2. Чтение сырых данных
3. Декодирование кодировок (KOI-7, UTF-16LE)
4. Извлечение строк
5. Парсинг данных

**Связи:**
- Использует `xlsx-raw-parser` для XLSX
- Использует `encoding.ts` для декодирования
- Возвращает `ChargeRow[]`

---

#### `lib/analysis/parsers/xlsx-raw-parser.ts` — Парсер сырых данных XLSX
**Назначение:** Чтение сырых данных из XLSX

**Функции:**
- `parseXLSX(buffer)` — парсинг XLSX файла

---

#### `lib/analysis/aggregators/order-aggregator.ts` — Агрегатор заказов
**Назначение:** Агрегация строк начислений в заказы

**Класс:** `OrderAggregator`

**Методы:**
- `aggregate(chargeRows)` — агрегация заказов

**Логика:**
1. Извлечение номера заказа из ID начисления
2. Группировка по номеру заказа
3. Объединение заказов с одинаковым `orderNumber+sku`
4. Расчёт итогов
5. Определение статуса

**Связи:**
- Принимает `ChargeRow[]`
- Возвращает `AggregatedOrder[]`

---

#### `lib/analysis/aggregators/non-order-aggregator.ts` — Агрегатор начислений без заказов
**Назначение:** Агрегация начислений, не связанных с заказами

**Класс:** `NonOrderAggregator`

**Методы:**
- `aggregate(chargeRows)` — агрегация

**Связи:**
- Возвращает `NonOrderCharge[]`

---

#### `lib/analysis/calculators/product-metrics-calculator.ts` — Калькулятор метрик товаров
**Назначение:** Расчёт метрик по каждому товару

**Класс:** `ProductMetricsCalculator`

**Методы:**
- `calculate(orders)` — расчёт метрик

**Метрики:**
- Выручка
- Количество заказов
- Средняя цена
- Процент возвратов
- Прибыль
- Маржа

**Связи:**
- Принимает `AggregatedOrder[]`
- Возвращает `ProductMetrics[]`

---

#### `lib/analysis/calculators/cost-calculator.ts` — Калькулятор себестоимости
**Назначение:** Добавление себестоимости к заказам

**Класс:** `CostCalculator`

**Методы:**
- `addCost(orders, costData)` — добавление себестоимости

**Логика:**
1. Сопоставление по SKU/артикулу
2. Добавление поля `cost`
3. Расчёт прибыли

**Связи:**
- Принимает `AggregatedOrder[]` и `Map<string, number>` (costData)
- Возвращает обновлённые заказы

---

#### `lib/analysis/calculators/summary-calculator.ts` — Калькулятор сводных метрик
**Назначение:** Расчёт общих метрик

**Класс:** `SummaryCalculator`

**Методы:**
- `calculate(orders, nonOrderCharges)` — расчёт сводки

**Метрики:**
- Gross Revenue (общая выручка)
- Net Revenue (чистая выручка)
- Net Profit (чистая прибыль)
- Количество заказов
- Средний чек
- Процент возвратов
- Процент отмен
- Комиссии
- Маржинальность

**Связи:**
- Принимает `AggregatedOrder[]` и `NonOrderCharge[]`
- Возвращает `Summary` и `CostBreakdown[]`

---

#### `lib/analysis/calculators/daily-metrics-calculator.ts` — Калькулятор метрик по дням
**Назначение:** Группировка метрик по дням

**Класс:** `DailyMetricsCalculator`

**Методы:**
- `calculate(orders)` — расчёт метрик по дням

**Связи:**
- Возвращает `DailyMetrics[]`

---

#### `lib/analysis/calculators/scheme-stats-calculator.ts` — Калькулятор статистики по схемам
**Назначение:** Статистика по схемам доставки (FBO/FBS)

**Класс:** `SchemeStatsCalculator`

**Методы:**
- `calculate(orders)` — расчёт статистики

---

#### `lib/analysis/calculators/charge-type-breakdown-calculator.ts` — Калькулятор детализации по типам
**Назначение:** Детализация всех начислений по типам

**Класс:** `ChargeTypeBreakdownCalculator`

**Методы:**
- `calculate(chargeRows)` — расчёт детализации

**Связи:**
- Возвращает `ChargeTypeBreakdown[]`

---

#### `lib/analysis/calculators/cost-reports-calculator.ts` — Калькулятор отчётов по себестоимости
**Назначение:** Отчёты по себестоимости товаров

**Класс:** `CostReportsCalculator`

**Методы:**
- `calculate(orders)` — расчёт отчётов

---

#### `lib/analysis/analyzers/problem-identifier.ts` — Выявление проблем
**Назначение:** Выявление проблемных зон в данных

**Класс:** `ProblemIdentifier`

**Методы:**
- `identify(analysisResult)` — выявление проблем

**Проблемы:**
- Высокий процент возвратов
- Убыточные товары
- Низкая маржинальность
- Высокие комиссии

**Связи:**
- Возвращает `ProblemArea[]`

---

#### `lib/analysis/analyzers/recommendation-generator.ts` — Генератор рекомендаций
**Назначение:** Генерация рекомендаций на основе анализа

**Класс:** `RecommendationGenerator`

**Методы:**
- `generate(analysisResult)` — генерация рекомендаций

**Связи:**
- Использует `ProblemIdentifier`
- Возвращает `Recommendation[]`

---

#### `lib/analysis/utils/recalculate-with-exclusions.ts` — Пересчёт с исключениями
**Назначение:** Пересчёт метрик с исключёнными товарами

**Функции:**
- `recalculateWithExclusions(analysisResult, excludedSkus)` — пересчёт

**Логика:**
1. Фильтрация заказов по SKU
2. Пересчёт всех метрик
3. Обновление результата

**Связи:**
- Использует все калькуляторы
- Возвращает обновлённый `AnalysisResult`

---

#### `lib/analysis/utils/top-products.ts` — Топ товаров
**Назначение:** Вычисление топ товаров

**Класс:** `TopProductsHelper`

**Методы:**
- `getTopByRevenue(products, limit)`
- `getTopByProfit(products, limit)`
- `getTopByOrders(products, limit)`

---

#### `lib/analysis/cost-parser.ts` — Парсер файла себестоимости
**Назначение:** Парсинг Excel файла с себестоимостью

**Функции:**
- `parseCostFile(file, fileName)` — парсинг файла

**Логика:**
1. Парсинг Excel
2. Поиск колонок (SKU/артикул, себестоимость)
3. Создание Map<SKU, cost>

**Связи:**
- Возвращает `Map<string, number>`

---

#### `lib/analysis/constants.ts` — Константы
**Назначение:** Константы для анализа

**Содержит:**
- Паттерны для парсинга
- Категории типов начислений
- `getChargeCategory(type)` — получение категории типа

---

#### `lib/analysis/encoding.ts` — Декодирование кодировок
**Назначение:** Декодирование специфичных кодировок Ozon

**Функции:**
- `decodeKOI7(buffer)` — декодирование KOI-7
- `decodeUTF16LE(buffer)` — декодирование UTF-16LE

---

#### `lib/analysis/converter.ts` — Конвертер XLSX → XLS
**Назначение:** Конвертация форматов (если нужно)

---

#### `lib/analysis/data-utils.ts` — Утилиты данных
**Назначение:** Вспомогательные функции для работы с данными

**Функции:**
- `generateId()` — генерация ID
- Другие утилиты

---

#### `lib/analysis/merge-results.ts` — Объединение результатов
**Назначение:** Объединение результатов нескольких файлов

**Функции:**
- `mergeAnalysisResults(results)` — объединение

---

#### `lib/analysis/charge-type-groups.ts` — Группировка типов начислений
**Назначение:** Группировка типов начислений по категориям

---

#### `lib/analysis/utils.ts` — Общие утилиты
**Назначение:** Общие вспомогательные функции

---

### `lib/calculator/` — Калькулятор цен

#### `lib/calculator/parsers/ozon-file-parser.ts` — Парсер файла калькулятора
**Назначение:** Парсинг Excel файла с товарами для калькулятора

**Функции:**
- `parseOzonFile(file)` — парсинг файла

**Ожидаемые колонки:**
- category (категория)
- article (артикул)
- name (название)
- cost (себестоимость)
- margin % (маржа %)
- width, height, length, weight (габариты)

**Связи:**
- Возвращает `ParsedFileResult`

---

### `lib/store/` — Zustand stores

#### `lib/store/analysis-store.ts` — Store анализа
**Назначение:** Управление состоянием процесса анализа

**Состояние:**
- `currentAnalysisId` — ID текущего анализа
- `analysisResult` — результат анализа
- `status` — статус (pending, uploading, parsing, analyzing, completed, failed)
- `progress` — прогресс (0-100)
- `steps` — шаги анализа
- `error` — ошибка

**Действия:**
- `startAnalysis(id)` — начало анализа
- `updateProgress(progress, stepIndex)` — обновление прогресса
- `completeAnalysis(result)` — завершение анализа
- `failAnalysis(error)` — ошибка анализа
- `resetAnalysis()` — сброс

**Связи:**
- Используется в `app/page.tsx` и `app/analysis/[id]/page.tsx`

---

#### `lib/store/upload-store.ts` — Store загрузки
**Назначение:** Управление загруженными файлами

**Состояние:**
- `mainFile` — основной файл (устаревшее)
- `mainFiles` — массив основных файлов
- `costFile` — файл себестоимости
- `customPrompt` — кастомный промпт для AI
- `uploadError` — ошибка загрузки

**Действия:**
- `setMainFile(file)`, `addMainFile(file)`, `removeMainFile(index)`
- `setCostFile(file)`
- `setCustomPrompt(prompt)`

---

#### `lib/store/calculator-store.ts` — Store калькулятора
**Назначение:** Управление состоянием калькулятора

**Состояние:**
- `ozon.parsedData` — распарсенные данные
- `ozon.marginSettings` — настройки маржи
- `ozon.file` — загруженный файл

**Действия:**
- `setFile(file)`
- `setParsedData(data)`
- `setMarginSettings(settings)`

---

#### `lib/store/excluded-products-store.ts` — Store исключённых товаров
**Назначение:** Управление исключёнными товарами

**Состояние:**
- `excludedSkus` — Set исключённых SKU

**Действия:**
- `toggleExclusion(sku)`
- `clearExclusions()`

---

#### `lib/store/settings-store.ts` — Store настроек
**Назначение:** Управление настройками приложения

---

### `lib/ai/` — AI интеграция

#### `lib/ai/ai-service.ts` — AI сервис
**Назначение:** Работа с AI провайдерами

**Класс:** `AIService`

**Методы:**
- `analyze(context, customPrompt?)` — анализ через AI

**Провайдеры:**
- OpenAI
- Anthropic Claude
- Google Gemini
- z.ai GLM-4.7

**Связи:**
- Использует `lib/config/ai-providers.ts`

---

#### `lib/ai/context-preparer.ts` — Подготовка контекста
**Назначение:** Подготовка контекста для AI запроса

**Функции:**
- `prepareContext(analysisResult)` — подготовка контекста

**Связи:**
- Используется в `app/api/analysis/[id]/ai/route.ts`

---

### `lib/config/` — Конфигурация

#### `lib/config/ai-providers.ts` — Настройки AI провайдеров
**Назначение:** Конфигурация AI провайдеров

**Содержит:**
- Список провайдеров
- Настройки API ключей
- Функции выбора провайдера

---

#### `lib/config/charge-type-mapping.ts` — Маппинг типов начислений
**Назначение:** Маппинг типов начислений на категории

---

#### `lib/config/constants.ts` — Константы приложения
**Назначение:** Общие константы

---

#### `lib/config/plans.ts` — Планы подписки
**Назначение:** Конфигурация планов подписки

---

### `lib/db/` — База данных

#### `lib/db/prisma.ts` — Prisma клиент
**Назначение:** Экспорт Prisma клиента

**Связи:**
- Используется во всех API routes для работы с БД

---

### `lib/types/` — TypeScript типы

#### `lib/types/analysis.ts` — Типы анализа
**Назначение:** Типы для фронтенда

**Типы:**
- `FrontendAnalysisResult` — результат анализа для фронтенда

---

#### `lib/types/calculator.ts` — Типы калькулятора
**Назначение:** Типы для калькулятора

**Типы:**
- `OzonProductData` — данные товара
- `OzonMarginSettings` — настройки маржи
- `ParsedFileResult` — результат парсинга

---

### `lib/utils/` — Утилиты

#### `lib/utils/logger.ts` — Логирование
**Назначение:** Логирование событий

**Функции:**
- `startAnalysis(fileName, size)`
- `completeAnalysis(duration)`
- `error(message, error)`

---

#### `lib/utils/export-xlsx.ts` — Экспорт в XLSX
**Назначение:** Утилиты для экспорта в Excel

**Функции:**
- `exportToXLSX(analysisResult)` — экспорт

---

#### `lib/utils/date-grouping.ts` — Группировка по датам
**Назначение:** Утилиты для группировки данных по датам

---

#### `lib/utils/python-decoder.ts` — Python декодер
**Назначение:** Декодирование данных из Python сервиса

---

#### `lib/utils/remove-markdown.ts` — Удаление Markdown
**Назначение:** Удаление Markdown из текста

---

#### `lib/utils.ts` — Общие утилиты
**Назначение:** Общие вспомогательные функции

**Функции:**
- `generateId()` — генерация ID
- `hapticFeedback(type)` — тактильная обратная связь
- `delay(ms)` — задержка
- `cn(...classes)` — объединение классов (tailwind)

---

### `lib/mock/` — Mock данные

#### `lib/mock/analysis-mock.ts` — Mock результаты анализа
**Назначение:** Mock данные для разработки

**Функции:**
- `getMockAnalysisResult()` — получение mock данных

---

### `lib/api/` — API утилиты

#### `lib/api/file-processor.ts` — Обработчик файлов
**Назначение:** Обработка файлов для API

---

## 🗄️ prisma/ — База данных

### `prisma/schema.prisma` — Схема БД
**Назначение:** Определение моделей базы данных

**Модели:**
- `User` — пользователи (NextAuth)
- `Account` — OAuth аккаунты
- `Session` — сессии
- `VerificationToken` — токены верификации
- `Report` — отчёты анализа
- `CostData` — данные о себестоимости
- `Subscription` — подписки
- `AIUsageLog` — логи использования AI

**Связи:**
- User → Report (один ко многим)
- User → CostData (один ко многим)
- User → Subscription (один к одному)

---

### `prisma/migrations/` — Миграции

#### `init.sql` — Инициализация БД
**Назначение:** SQL скрипт для создания таблиц

---

#### `setup-rls.sql` — Настройка RLS
**Назначение:** Настройка Row Level Security для Supabase

**Содержит:**
- Включение RLS для всех таблиц
- Политики доступа
- Комментарии о service_role

---

## 🔄 Полная логика работы приложения

### 1. Загрузка файла

**Поток:**
1. Пользователь открывает `app/page.tsx`
2. Выбирает файл(ы) через `FileUploader` / `MultiFileUploader`
3. Файлы сохраняются в `upload-store`
4. Опционально загружается файл себестоимости
5. Пользователь нажимает "Анализировать"

**Код:**
```typescript
// app/page.tsx
const handleAnalyze = async () => {
  const analysisId = generateId();
  startAnalysis(analysisId); // analysis-store
  
  const formData = new FormData();
  mainFiles.forEach(file => formData.append("files", file));
  if (costFile) formData.append("costFile", costFile);
  formData.append("analysisId", analysisId);
  
  const response = await fetch("/api/analyze", {
    method: "POST",
    body: formData,
  });
};
```

---

### 2. Обработка на сервере

**Поток:**
1. `app/api/analyze/route.ts` получает запрос
2. Валидация файлов (формат, размер)
3. Парсинг файла себестоимости (если есть) → `parseCostFile()`
4. Для каждого файла:
   - Вызов `analyzeReport(file, fileName, costData)`
5. Объединение результатов (если несколько файлов)
6. Сохранение в БД через Prisma
7. Возврат результата

**Код:**
```typescript
// app/api/analyze/route.ts
const results = [];
for (const file of filesToProcess) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await analyzeReport(buffer, file.name, costData);
  results.push(result);
}

const merged = mergeAnalysisResults(results);
await prisma.report.create({ data: { ... } });
```

---

### 3. Анализ файла

**Поток:**
1. `analyzeReport()` создаёт `OzonReportAnalyzer`
2. Вызов `analyzer.analyze(file, fileName, costData)`
3. Внутри `analyze()`:
   - **Парсинг:** `FileParser.parse()` → `ChargeRow[]`
   - **Агрегация заказов:** `OrderAggregator.aggregate()` → `AggregatedOrder[]`
   - **Агрегация начислений:** `NonOrderAggregator.aggregate()` → `NonOrderCharge[]`
   - **Метрики товаров:** `ProductMetricsCalculator.calculate()` → `ProductMetrics[]`
   - **Себестоимость:** `CostCalculator.addCost()` → обновлённые заказы
   - **Сводные метрики:** `SummaryCalculator.calculate()` → `Summary`, `CostBreakdown[]`
   - **Метрики по дням:** `DailyMetricsCalculator.calculate()` → `DailyMetrics[]`
   - **Статистика схем:** `SchemeStatsCalculator.calculate()`
   - **Детализация типов:** `ChargeTypeBreakdownCalculator.calculate()` → `ChargeTypeBreakdown[]`
   - **Отчёты себестоимости:** `CostReportsCalculator.calculate()`
   - **Проблемы:** `ProblemIdentifier.identify()` → `ProblemArea[]`
   - **Рекомендации:** `RecommendationGenerator.generate()` → `Recommendation[]`
4. Возврат `AnalysisResult`

**Код:**
```typescript
// lib/analysis/analyzer.ts
async analyze(file, fileName, costData?) {
  const chargeRows = await this.fileParser.parse(file, fileName);
  const orders = this.orderAggregator.aggregate(chargeRows);
  const nonOrderCharges = this.nonOrderAggregator.aggregate(chargeRows);
  const productMetrics = this.productMetricsCalculator.calculate(orders);
  const ordersWithCost = costData 
    ? this.costCalculator.addCost(orders, costData)
    : orders;
  const { summary, costBreakdown } = this.summaryCalculator.calculate(ordersWithCost, nonOrderCharges);
  // ... остальные расчёты
  return analysisResult;
}
```

---

### 4. Парсинг файла

**Поток:**
1. `FileParser.parse()` определяет формат (XLS/XLSX)
2. Чтение сырых данных через `xlsx-raw-parser`
3. Декодирование кодировок через `encoding.ts`
4. Извлечение строк из таблицы
5. Парсинг каждой строки:
   - ID начисления
   - Номер заказа (из ID)
   - SKU
   - Тип начисления
   - Суммы
   - Даты
6. Возврат `ChargeRow[]`

**Код:**
```typescript
// lib/analysis/parsers/file-parser.ts
parse(file, fileName) {
  const rawData = parseXLSX(buffer);
  const decoded = decodeKOI7(rawData);
  const rows = extractRows(decoded);
  return rows.map(row => parseChargeRow(row));
}
```

---

### 5. Агрегация заказов

**Поток:**
1. `OrderAggregator.aggregate()` получает `ChargeRow[]`
2. Для каждой строки:
   - Извлечение номера заказа из ID (паттерн: `ORDER-SKU-CHARGE`)
   - Группировка по `orderNumber + sku`
3. Объединение заказов с одинаковым `orderNumber+sku` (разбитые по периодам)
4. Расчёт итогов:
   - Сумма всех начислений
   - Статус (completed, returned, partial_return, cancelled)
   - Даты (принятия, отгрузки, доставки)
5. Определение типа заказа (обычный, возврат, частичный возврат)
6. Возврат `AggregatedOrder[]`

**Код:**
```typescript
// lib/analysis/aggregators/order-aggregator.ts
aggregate(chargeRows) {
  const grouped = groupByOrderNumber(chargeRows);
  const orders = [];
  for (const [key, rows] of grouped) {
    const order = {
      orderNumber: extractOrderNumber(key),
      sku: extractSku(key),
      totalAmount: sumAmounts(rows),
      status: determineStatus(rows),
      // ...
    };
    orders.push(order);
  }
  return mergeOrdersByPeriod(orders);
}
```

---

### 6. Расчёт метрик

**Поток:**
1. **Метрики товаров:**
   - Группировка заказов по SKU
   - Расчёт выручки, заказов, средней цены, возвратов, прибыли, маржи
2. **Сводные метрики:**
   - Gross Revenue = сумма всех начислений "Выручка"
   - Net Revenue = Gross - возвраты
   - Net Profit = Net Revenue - комиссии - себестоимость
   - Количество уникальных заказов
   - Средний чек = Net Revenue / количество заказов
   - Процент возвратов = (возвраты / Gross Revenue) * 100
3. **Разбивка затрат:**
   - Группировка по категориям (Комиссии, Логистика, Обработка и т.д.)
4. **Метрики по дням:**
   - Группировка заказов по дате
   - Расчёт выручки и прибыли по дням
5. **Детализация по типам:**
   - Группировка всех начислений по типам
   - Расчёт сумм и количества

---

### 7. Выявление проблем и рекомендаций

**Поток:**
1. `ProblemIdentifier.identify()` анализирует данные:
   - Товары с возвратами > 20%
   - Убыточные товары (прибыль < 0)
   - Низкая маржинальность (< 10%)
   - Высокие комиссии
2. `RecommendationGenerator.generate()` создаёт рекомендации:
   - На основе проблемных зон
   - На основе сводных метрик
   - На основе топ товаров

---

### 8. Сохранение и отображение

**Поток:**
1. Результат сохраняется в БД через Prisma
2. Результат сохраняется в `analysis-store`
3. Перенаправление на `/analysis/[id]`
4. `app/analysis/[id]/page.tsx` загружает результат:
   - Из store (если есть)
   - Или из API `/api/analysis/[id]`
5. Отображение компонентов:
   - `MetricCard` — метрики
   - `ChartSection` — графики
   - `AllProductsTable` — таблицы
   - `RecommendationsList` — рекомендации

---

### 9. Исключение товаров

**Поток:**
1. Пользователь выбирает товары для исключения (чекбоксы)
2. SKU сохраняются в `excluded-products-store`
3. При пересчёте:
   - Запрос на `/api/analysis/[id]/recalculate`
   - Передача списка исключённых SKU
   - `recalculateWithExclusions()` фильтрует заказы
   - Пересчёт всех метрик
   - Возврат обновлённого результата
4. Обновление UI

---

### 10. AI анализ

**Поток:**
1. Пользователь нажимает "AI Анализ"
2. Запрос на `/api/analysis/[id]/ai`
3. Подготовка контекста через `prepareContext()`
4. Выбор AI провайдера
5. Отправка запроса с данными анализа
6. Получение рекомендаций
7. Сохранение в БД
8. Отображение в UI

---

## 🔗 Связи между модулями

### Зависимости анализа

```
app/api/analyze/route.ts
  └─> lib/analysis/index.ts (analyzeReport)
      └─> lib/analysis/analyzer.ts (OzonReportAnalyzer)
          ├─> lib/analysis/parsers/file-parser.ts (FileParser)
          ├─> lib/analysis/aggregators/order-aggregator.ts (OrderAggregator)
          ├─> lib/analysis/aggregators/non-order-aggregator.ts (NonOrderAggregator)
          ├─> lib/analysis/calculators/product-metrics-calculator.ts (ProductMetricsCalculator)
          ├─> lib/analysis/calculators/cost-calculator.ts (CostCalculator)
          ├─> lib/analysis/calculators/summary-calculator.ts (SummaryCalculator)
          ├─> lib/analysis/calculators/daily-metrics-calculator.ts (DailyMetricsCalculator)
          ├─> lib/analysis/calculators/scheme-stats-calculator.ts (SchemeStatsCalculator)
          ├─> lib/analysis/calculators/charge-type-breakdown-calculator.ts (ChargeTypeBreakdownCalculator)
          ├─> lib/analysis/calculators/cost-reports-calculator.ts (CostReportsCalculator)
          ├─> lib/analysis/analyzers/problem-identifier.ts (ProblemIdentifier)
          └─> lib/analysis/analyzers/recommendation-generator.ts (RecommendationGenerator)
```

### Зависимости UI

```
app/page.tsx
  ├─> components/upload/FileUploader.tsx
  ├─> components/upload/MultiFileUploader.tsx
  ├─> components/analysis/AnalysisProgress.tsx
  ├─> lib/store/upload-store.ts
  └─> lib/store/analysis-store.ts

app/analysis/[id]/page.tsx
  ├─> components/report/MetricCard.tsx
  ├─> components/report/ChartSection.tsx
  ├─> components/report/AllProductsTable.tsx
  ├─> components/report/RecommendationsList.tsx
  ├─> lib/store/analysis-store.ts
  └─> lib/store/excluded-products-store.ts
```

### Зависимости БД

```
app/api/analyze/route.ts
  └─> lib/db/prisma.ts
      └─> prisma/schema.prisma

app/api/analysis/[id]/route.ts
  └─> lib/db/prisma.ts

app/api/reports/route.ts
  └─> lib/db/prisma.ts
```

---

## 📊 Типы данных

### Основные типы

```typescript
// lib/analysis/types.ts
interface ChargeRow {
  id: string;              // ID начисления
  orderNumber?: string;     // Номер заказа
  sku: string;             // SKU товара
  chargeType: string;      // Тип начисления
  amount: number;          // Сумма
  date: Date;             // Дата
  // ...
}

interface AggregatedOrder {
  orderNumber: string;
  sku: string;
  productName: string;
  totalAmount: number;
  status: OrderStatus;
  revenue: number;
  fees: number;
  cost?: number;
  profit?: number;
  // ...
}

interface ProductMetrics {
  sku: string;
  productName: string;
  revenue: number;
  orders: number;
  averagePrice: number;
  returnRate: number;
  profit?: number;
  margin?: number;
  // ...
}

interface AnalysisResult {
  summary: Summary;
  products: ProductMetrics[];
  orders: AggregatedOrder[];
  dailyMetrics: DailyMetrics[];
  costBreakdown: CostBreakdown[];
  problems: ProblemArea[];
  recommendations: Recommendation[];
  // ...
}
```

---

## 🎨 Стили и UI

### Tailwind CSS
- Конфигурация: `tailwind.config.ts`
- Глобальные стили: `app/globals.css`
- Компоненты используют классы Tailwind

### shadcn/ui
- Все UI компоненты в `components/ui/`
- Основаны на Radix UI
- Кастомизированы через Tailwind

---

## 🚀 Скрипты

### package.json scripts

```json
{
  "dev": "next dev",                    // Запуск dev сервера
  "build": "next build",                // Сборка production
  "start": "next start",                // Запуск production
  "lint": "next lint",                  // Линтинг
  "db:generate": "prisma generate",      // Генерация Prisma клиента
  "db:push": "prisma db push",          // Применение схемы к БД
  "db:migrate": "prisma migrate dev",   // Создание миграции
  "db:studio": "prisma studio",         // Открытие Prisma Studio
  "db:check": "node scripts/check-database.js" // Проверка БД
}
```

---

## 📝 Заключение

Этот документ описывает полную структуру проекта, функции каждого файла, связи между модулями и логику работы приложения. Используйте его как справочник при работе с проектом.

Для более детальной информации смотрите:
- `docs/00-PROJECT-OVERVIEW.md` — обзор проекта
- `docs/01-FILE-STRUCTURE.md` — структура файлов
- `docs/02-ARCHITECTURE.md` — архитектура
- `docs/03-API.md` — API документация
- `docs/04-DEVELOPMENT.md` — инструкции по разработке
