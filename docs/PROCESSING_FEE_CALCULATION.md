# Принцип расчёта стоимости обработки (Processing Fee)

## Обзор

Стоимость обработки (`processingFee`) рассчитывается **только для FBS** (Fulfillment by Seller). Для FBO и RFBS обработка не учитывается отдельно, так как включена в другие тарифы.

---

## 📊 Источник данных: таблица `ProcessingTariff`

### Структура таблицы

```prisma
model ProcessingTariff {
  id                    String   @id @default(cuid())
  marketplace            String   @default("ozon")
  shipmentPointType      String   // Тип точки отгрузки: "СЦ", "ПВЗ", "ППЗ", "АПВЗ", "АППЗ" и т.д.
  ozonProcessingFee      Float    // Тариф за обработку отправления Ozon (руб)
  partnerProcessingFee   Float    // Тариф за обработку отправления партнёрами (руб)
  isActive               Boolean  @default(true)
  notes                  String?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  @@unique([marketplace, shipmentPointType])
}
```

### Поля, используемые в расчёте

- **`shipmentPointType`** — тип точки отгрузки (используется для поиска нужного тарифа)
- **`ozonProcessingFee`** — тариф за обработку Ozon (используется в расчёте)
- **`partnerProcessingFee`** — тариф за обработку партнёрами (не используется в текущей версии)

---

## 🔍 Логика выбора тарифа

### Шаг 1: Определение типа точки отгрузки

В калькуляторе пользователь выбирает:
- **`pickupPointType`**: `"pvz-ppz"` или `"sc"` (ПВЗ/ППЗ или Сортировочный центр)
- **`acceptanceType`**: `"employee"`, `"self"` или `"trust"` (Сотрудник, Самоприёмка, Доверительная приёмка)

### Шаг 2: Поиск тарифа в базе данных

```typescript
// Ищем все активные тарифы обработки
const processingTariffs = await prisma.processingTariff.findMany({
  where: { 
    marketplace: "ozon", 
    isActive: true 
  },
});

// Фильтруем по типу точки отгрузки
if (pickupPointType === "pvz-ppz") {
  // Ищем тарифы для ПВЗ/ППЗ
  const relevant = processingTariffs.filter((t) => {
    const pl = t.shipmentPointType.toLowerCase();
    return pl.includes("пвз") || pl.includes("ппз");
  });
} else if (pickupPointType === "sc") {
  // Ищем тарифы для СЦ
  const relevant = processingTariffs.filter((t) => {
    const pl = t.shipmentPointType.toLowerCase();
    return pl.includes("сц");
  });
}
```

### Шаг 3: Расчёт стоимости обработки

#### Вариант 1: ПВЗ/ППЗ (любой тип приёмки)

```typescript
if (pickupPointType === "pvz-ppz") {
  const first = relevant[0]; // Берём первый найденный тариф
  processingFee = first?.ozonProcessingFee || 0;
}
```

**Правило:** Берётся значение `ozonProcessingFee` из таблицы, независимо от типа приёмки.

**Пример:**
- Тариф в БД: `ozonProcessingFee = 20 ₽`
- Результат: `processingFee = 20 ₽`

---

#### Вариант 2: СЦ + Сотрудник

```typescript
if (pickupPointType === "sc" && acceptanceType === "employee") {
  const first = relevant[0];
  processingFee = first.ozonProcessingFee;
}
```

**Правило:** Берётся полное значение `ozonProcessingFee` из таблицы.

**Пример:**
- Тариф в БД: `ozonProcessingFee = 20 ₽`
- Результат: `processingFee = 20 ₽`

---

#### Вариант 3: СЦ + Самоприёмка или Доверительная приёмка

```typescript
if (pickupPointType === "sc" && (acceptanceType === "self" || acceptanceType === "trust")) {
  const first = relevant[0];
  processingFee = first.ozonProcessingFee / 2; // Делим пополам!
}
```

**Правило:** Берётся значение `ozonProcessingFee` из таблицы и **делится на 2**.

**Пример:**
- Тариф в БД: `ozonProcessingFee = 20 ₽`
- Результат: `processingFee = 10 ₽` (20 / 2)

---

## 📝 Итоговая формула для FBS

Стоимость обработки добавляется к общей сумме расходов FBS:

```typescript
const fbsTotalFees = 
  fbsCommission +                    // Комиссия маркетплейса
  fbsShipping.cost +                 // Логистика (доставка)
  fbsProcessingFee +                 // ⬅️ Обработка (из ProcessingTariff)
  fbsDispatchFee +                   // Тариф за отправление
  deliveryToPickupPoint +            // Доставка до места выдачи (25₽)
  acquiringFee;                      // Эквайринг
```

---

## 📋 Примеры расчёта

### Пример 1: ПВЗ/ППЗ + Сотрудник

**Входные данные:**
- `pickupPointType = "pvz-ppz"`
- `acceptanceType = "employee"`
- Тариф в БД: `ozonProcessingFee = 18 ₽`

**Расчёт:**
```
processingFee = 18 ₽ (берётся как есть)
```

---

### Пример 2: СЦ + Сотрудник

**Входные данные:**
- `pickupPointType = "sc"`
- `acceptanceType = "employee"`
- Тариф в БД: `ozonProcessingFee = 20 ₽`

**Расчёт:**
```
processingFee = 20 ₽ (берётся как есть)
```

---

### Пример 3: СЦ + Самоприёмка

**Входные данные:**
- `pickupPointType = "sc"`
- `acceptanceType = "self"`
- Тариф в БД: `ozonProcessingFee = 20 ₽`

**Расчёт:**
```
processingFee = 20 ₽ / 2 = 10 ₽ (делится пополам)
```

---

### Пример 4: СЦ + Доверительная приёмка

**Входные данные:**
- `pickupPointType = "sc"`
- `acceptanceType = "trust"`
- Тариф в БД: `ozonProcessingFee = 20 ₽`

**Расчёт:**
```
processingFee = 20 ₽ / 2 = 10 ₽ (делится пополам)
```

---

## 🔗 Связанные компоненты

### API Route
- **Файл:** `app/api/calculate/route.ts`
- **Строки:** 288-333
- **Функция:** `POST /api/calculate`

### Компонент калькулятора
- **Файл:** `components/calculator/OzonSingleProductCalculator.tsx`
- **Строки:** 919-952
- **Отображение:** строка 1221

### Таблица в БД
- **Модель:** `ProcessingTariff` (Prisma)
- **Файл:** `prisma/schema.prisma`
- **Строки:** 245-259

### API управления тарифами
- **Файл:** `app/api/processing-tariffs/route.ts`
- **Эндпоинты:** `GET /api/processing-tariffs`, `POST /api/processing-tariffs`

---

## ⚠️ Важные замечания

1. **Только для FBS:** Обработка рассчитывается только для FBS. Для FBO и RFBS `processingFee = 0`.

2. **Используется только `ozonProcessingFee`:** Поле `partnerProcessingFee` не используется в текущей версии калькулятора.

3. **Поиск по подстроке:** Поиск тарифа происходит по подстроке в `shipmentPointType` (например, "пвз", "ппз", "сц"), поэтому важно правильно называть типы точек в БД.

4. **Первый найденный тариф:** Если найдено несколько тарифов, берётся первый из списка. Рекомендуется иметь только один активный тариф для каждого типа точки.

5. **Деление на 2:** Для СЦ с самоприёмкой или доверительной приёмкой тариф всегда делится на 2, независимо от значения в БД.

---

## 📊 Визуализация логики

```
┌─────────────────────────────────────────────────────────┐
│                    FBS Processing Fee                    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────┴───────────────────┐
        │                                       │
   ПВЗ/ППЗ                                  СЦ (Сортировочный центр)
        │                                       │
        ▼                                       ▼
   ozonProcessingFee                    ┌──────┴──────┐
   (как есть)                           │             │
                                        │             │
                                    Сотрудник    Самоприёмка/
                                    (employee)   Доверительная
                                                 (self/trust)
                                        │             │
                                        ▼             ▼
                                ozonProcessingFee  ozonProcessingFee / 2
                                (как есть)        (делится пополам)
```

---

## 🔄 Обновление тарифов

Тарифы обработки можно обновить через:
1. **Админ-панель:** `/admin/processing-tariffs`
2. **API:** `POST /api/processing-tariffs` с массивом тарифов

Формат данных:
```json
{
  "marketplace": "ozon",
  "tariffs": [
    {
      "shipmentPointType": "СЦ",
      "ozonProcessingFee": 20,
      "partnerProcessingFee": 10,
      "notes": "Сортировочные центры"
    },
    {
      "shipmentPointType": "ПВЗ",
      "ozonProcessingFee": 18,
      "partnerProcessingFee": 2,
      "notes": "Пункты выдачи заказов"
    }
  ]
}
```
