# 🔌 API Документация

## Базовый URL

- **Development:** `http://localhost:3000`
- **Production:** `https://your-domain.vercel.app`

## Endpoints

### 1. POST /api/analyze

Запуск анализа файла(ов) отчёта Ozon.

#### Запрос

**Content-Type:** `multipart/form-data`

**Параметры:**
- `files` (File[]) - один или несколько Excel файлов (.xls, .xlsx)
- `file` (File, опционально) - один файл (для обратной совместимости)
- `costFile` (File, опционально) - файл себестоимости
- `analysisId` (string, опционально) - ID анализа (генерируется автоматически)

**Демо-режим:**
- `?demo=true` - использовать тестовый файл из папки `test/`

#### Ответ

**Успех (200):**
```json
{
  "success": true,
  "data": {
    "analysisId": "abc123",
    "fileName": "Отчет по начислениям_01.10.2025-31.10.2025.xlsx",
    "result": {
      "id": "abc123",
      "fileName": "...",
      "analyzedAt": "2025-01-15T10:30:00Z",
      "period": {
        "start": "2025-01-01",
        "end": "2025-01-31",
        "label": "01.01.2025 - 31.01.2025"
      },
      "summary": { ... },
      "orders": [ ... ],
      "productMetrics": [ ... ],
      // ... другие данные
    }
  }
}
```

**Ошибка (400/500):**
```json
{
  "error": "Описание ошибки",
  "message": "Детальное сообщение"
}
```

#### Пример использования

```typescript
const formData = new FormData();
files.forEach(file => formData.append("files", file));
if (costFile) formData.append("costFile", costFile);
formData.append("analysisId", analysisId);

const response = await fetch("/api/analyze", {
  method: "POST",
  body: formData,
});

const data = await response.json();
```

---

### 2. GET /api/analysis/[id]

Получение результата анализа по ID.

#### Запрос

**Параметры:**
- `id` (string) - ID анализа

#### Ответ

**Успех (200):**
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "fileName": "...",
    "summary": { ... },
    // ... полный результат анализа
  }
}
```

**Ошибка (404):**
```json
{
  "error": "Анализ не найден"
}
```

---

### 3. POST /api/analysis/[id]/recalculate

Пересчёт анализа с учётом исключённых товаров.

#### Запрос

**Content-Type:** `application/json`

**Body:**
```json
{
  "excludedSkus": ["SKU1", "SKU2", ...]
}
```

#### Ответ

**Успех (200):**
```json
{
  "success": true,
  "data": {
    "summary": { ... },
    "costBreakdown": [ ... ],
    // ... пересчитанные данные
  }
}
```

---

### 4. POST /api/ai

AI анализ данных и генерация рекомендаций.

#### Запрос

**Content-Type:** `application/json`

**Body:**
```json
{
  "analysisId": "abc123",
  "provider": "openai" | "anthropic" | "google",
  "customPrompt": "Сфокусируйся на возвратах",
  "model": "gpt-4" // опционально
}
```

#### Ответ

**Успех (200):**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "type": "warning",
        "title": "Высокий процент возвратов",
        "description": "...",
        "action": "..."
      }
    ],
    "insights": "..."
  }
}
```

---

### 5. GET /api/export/pdf/[id]

Экспорт результата анализа в PDF.

#### Запрос

**Параметры:**
- `id` (string) - ID анализа

#### Ответ

**Успех (200):**
- **Content-Type:** `application/pdf`
- **Content-Disposition:** `attachment; filename="ozon-report-{id}.pdf"`

**Ошибка (404/500):**
```json
{
  "error": "Ошибка генерации PDF"
}
```

---

### 6. GET /api/export/xlsx/[id]

Экспорт результата анализа в XLSX.

#### Запрос

**Параметры:**
- `id` (string) - ID анализа

#### Ответ

**Успех (200):**
- **Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Content-Disposition:** `attachment; filename="ozon-report-{id}.xlsx"`

**Ошибка (404/500):**
```json
{
  "error": "Ошибка генерации XLSX"
}
```

---

### 7. GET /api/reports

Получение списка отчётов (заготовка, не реализовано).

---

## Типы данных

### Summary

```typescript
interface Summary {
  grossRevenue: number;        // Общая выручка
  netRevenue: number;          // Чистая выручка (после возвратов)
  returnRevenue: number;       // Выручка от возвратов
  netPayout: number;          // К выплате
  netProfit: number;          // Чистая прибыль
  totalOrders: number;        // Количество заказов
  returnedOrders: number;     // Количество возвратов
  partialReturns: number;     // Частичные возвраты
  cancelledOrders: number;     // Отменённые заказы
  avgOrderValue: number;      // Средний чек
  returnRate: number;         // Процент возвратов
  cancellationRate: number;   // Процент отмен
  ozonFees: number;           // Комиссии Ozon
  feesPercent: number;        // Процент комиссий
  marginPercent: number;      // Маржинальность
  periodStart: Date;          // Начало периода
  periodEnd: Date;            // Конец периода
}
```

### AggregatedOrder

```typescript
interface AggregatedOrder {
  orderNumber: string;        // Номер заказа
  sku: string;                 // SKU товара
  productName: string;        // Название товара
  status: OrderStatus;        // Статус заказа
  totalAmount: number;        // Сумма итого
  revenue: number;            // Выручка
  cost?: number;              // Себестоимость (если есть)
  profit?: number;            // Прибыль (если есть себестоимость)
  acceptedAt: Date;           // Дата принятия
  shippedAt?: Date;           // Дата отгрузки
  deliveredAt?: Date;         // Дата доставки
  // ... другие поля
}
```

### ProductMetrics

```typescript
interface ProductMetrics {
  sku: string;                // SKU товара
  productName: string;        // Название товара
  totalRevenue: number;       // Общая выручка
  totalOrders: number;        // Количество заказов
  avgPrice: number;           // Средняя цена
  returnRate: number;         // Процент возвратов
  cost?: number;              // Себестоимость
  profit?: number;            // Прибыль
  margin?: number;            // Маржа
}
```

## Обработка ошибок

Все ошибки возвращаются в формате:

```json
{
  "error": "Краткое описание",
  "message": "Детальное сообщение об ошибке"
}
```

### Коды статусов

- **200** - Успех
- **400** - Ошибка валидации (неверный формат файла, превышен размер)
- **404** - Ресурс не найден
- **500** - Внутренняя ошибка сервера

## Лимиты

- **Максимальный размер файла:** 20 MB (для Vercel Pro)
- **Максимальное количество файлов в одном запросе:** не ограничено (но рекомендуется не более 10)
- **Таймаут запроса:** 300 секунд (5 минут) для Vercel Pro

## Примеры использования

### Загрузка одного файла

```typescript
const file = // File object
const formData = new FormData();
formData.append("file", file);

const response = await fetch("/api/analyze", {
  method: "POST",
  body: formData,
});
```

### Загрузка нескольких файлов

```typescript
const files = [file1, file2, file3];
const formData = new FormData();
files.forEach(file => formData.append("files", file));

const response = await fetch("/api/analyze", {
  method: "POST",
  body: formData,
});
```

### Загрузка с файлом себестоимости

```typescript
const formData = new FormData();
formData.append("file", reportFile);
formData.append("costFile", costFile);

const response = await fetch("/api/analyze", {
  method: "POST",
  body: formData,
});
```

### AI анализ

```typescript
const response = await fetch("/api/ai", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    analysisId: "abc123",
    provider: "openai",
    customPrompt: "Проанализируй возвраты",
  }),
});
```
