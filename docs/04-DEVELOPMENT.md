# 🛠️ Инструкции по разработке

## Начало работы

### Требования

- **Node.js:** 18+ 
- **npm** или **yarn**
- **Python 3.11+** (опционально, для Python сервиса)
- **Git**

### Установка

1. **Клонирование репозитория:**
```bash
cd "C:\IAO\MP analyzer"
```

2. **Установка зависимостей:**
```bash
npm install
```

3. **Настройка переменных окружения:**
```bash
# Скопировать пример
copy env.example.txt .env.local

# Отредактировать .env.local
# Минимально необходимые переменные:
DATABASE_URL="file:./prisma/dev.db"
```

4. **Инициализация базы данных:**
```bash
# Генерация Prisma клиента
npm run db:generate

# Создание БД (SQLite для dev)
npm run db:push
```

5. **Запуск приложения:**
```bash
npm run dev
```

Приложение будет доступно на `http://localhost:3000`

## Структура разработки

### Добавление нового калькулятора метрик

1. Создать файл в `lib/analysis/calculators/`
2. Реализовать класс с методом `calculate()`
3. Добавить в `OzonReportAnalyzer` в `lib/analysis/analyzer.ts`
4. Добавить результат в `AnalysisResult` тип

**Пример:**
```typescript
// lib/analysis/calculators/my-calculator.ts
export class MyCalculator {
  calculate(data: any): MyResult {
    // Логика расчёта
    return result;
  }
}

// lib/analysis/analyzer.ts
private myCalculator = new MyCalculator();

// В методе analyze():
const myResult = this.myCalculator.calculate(orders);
```

### Добавление нового компонента отчёта

1. Создать файл в `components/report/`
2. Использовать типы из `lib/analysis/types.ts`
3. Добавить на страницу `app/analysis/[id]/page.tsx`

**Пример:**
```typescript
// components/report/MyComponent.tsx
import type { AnalysisResult } from "@/lib/analysis/types";

interface MyComponentProps {
  data: AnalysisResult;
}

export function MyComponent({ data }: MyComponentProps) {
  // Рендер компонента
}
```

### Добавление нового API endpoint

1. Создать файл `app/api/my-endpoint/route.ts`
2. Экспортировать функции `GET`, `POST`, и т.д.
3. Использовать `NextRequest` и `NextResponse`

**Пример:**
```typescript
// app/api/my-endpoint/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Логика
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    return NextResponse.json(
      { error: "Ошибка" },
      { status: 500 }
    );
  }
}
```

## Работа с данными

### Парсинг Excel файлов

Основной парсер находится в `lib/analysis/parsers/file-parser.ts`.

**Использование:**
```typescript
import { FileParser } from "@/lib/analysis/parsers/file-parser";

const parser = new FileParser();
const result = await parser.parseFile(file, fileName);
// result.chargeRows - массив строк начислений
```

### Агрегация заказов

```typescript
import { OrderAggregator } from "@/lib/analysis/aggregators/order-aggregator";

const aggregator = new OrderAggregator();
const orders = aggregator.aggregateOrders(chargeRows, periodEnd, periodStart);
```

### Расчёт метрик

```typescript
import { SummaryCalculator } from "@/lib/analysis/calculators/summary-calculator";

const calculator = new SummaryCalculator();
const summary = calculator.calculateSummary(orders, nonOrderCharges, subscriptions, productMetrics);
```

## Тестирование

### Запуск линтера

```bash
npm run lint
```

### Тестовые файлы

Тестовые Excel файлы находятся в папке `test/`. Для тестирования можно использовать:

```typescript
// В app/api/analyze/route.ts
const DEMO_FILE_PATH = path.join(process.cwd(), "test", "your-test-file.xlsx");
```

### Демо-режим

Для тестирования без загрузки файла используйте демо-режим:

```typescript
const response = await fetch("/api/analyze?demo=true", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ analysisId: "demo-123" }),
});
```

## Отладка

### Логирование

Используйте встроенный logger:

```typescript
import { logger } from "@/lib/utils/logger";

logger.info("Module", "Сообщение", { data });
logger.warn("Module", "Предупреждение", { data });
logger.error("Module", "Ошибка", error);
```

### Console логи

В коде используются console.log с эмодзи для удобства:
- 📊 Анализ
- 📄 Парсинг
- 📦 Заказы
- 📈 Метрики
- ✅ Успех
- ❌ Ошибка

### Prisma Studio

Для просмотра данных в БД:

```bash
npm run db:studio
```

Откроется веб-интерфейс на `http://localhost:5555`

## Оптимизация производительности

### 1. Мемоизация вычислений

Используйте `useMemo` для тяжёлых вычислений:

```typescript
const expensiveValue = useMemo(() => {
  return heavyCalculation(data);
}, [data]);
```

### 2. Ленивая загрузка компонентов

```typescript
import dynamic from "next/dynamic";

const HeavyComponent = dynamic(() => import("@/components/HeavyComponent"));
```

### 3. Оптимизация циклов

Избегайте вложенных циклов, используйте Map для быстрого поиска:

```typescript
// Плохо
for (const order of orders) {
  for (const product of products) {
    if (order.sku === product.sku) { ... }
  }
}

// Хорошо
const productMap = new Map(products.map(p => [p.sku, p]));
for (const order of orders) {
  const product = productMap.get(order.sku);
  if (product) { ... }
}
```

## Git workflow

### Структура коммитов

```
feat: добавление новой функции
fix: исправление бага
docs: изменения в документации
style: форматирование кода
refactor: рефакторинг
perf: оптимизация производительности
test: добавление тестов
chore: обновление зависимостей, конфигурации
```

### Ветки

- `main` - основная ветка (production-ready код)
- `develop` - ветка разработки (если используется)
- `feature/*` - новые функции
- `fix/*` - исправления багов

## Деплой

### Vercel

1. Подключить репозиторий к Vercel
2. Настроить переменные окружения
3. Деплой автоматический при push в `main`

### Переменные окружения для production

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="https://your-domain.vercel.app"
NEXTAUTH_SECRET="your-secret"
OPENAI_API_KEY="..." # опционально
ANTHROPIC_API_KEY="..." # опционально
```

## Известные проблемы и решения

### Проблема: Неправильная кодировка в файлах

**Решение:** Используется модуль `lib/analysis/encoding.ts` для декодирования KOI-7 и UTF-16LE.

### Проблема: Большие файлы не обрабатываются

**Решение:** Файлы разбиваются на чанки по 4.5 МБ.

### Проблема: Медленный анализ

**Решение:** 
- Оптимизировать циклы
- Использовать Map вместо массивов для поиска
- Кэшировать результаты

## Полезные ресурсы

- [Next.js документация](https://nextjs.org/docs)
- [TypeScript документация](https://www.typescriptlang.org/docs/)
- [Prisma документация](https://www.prisma.io/docs)
- [Tailwind CSS документация](https://tailwindcss.com/docs)
- [Recharts документация](https://recharts.org/)

## Контакты и поддержка

Для вопросов и предложений создавайте issues в репозитории.
