/**
 * Единая таблица типов начислений Ozon.
 *
 * Каждый "Тип начисления" из отчёта относится к одной категории
 * (для формирования сумм) и к одной группе (для UI/drill-down).
 *
 * Поиск — по нормализованной строке (trim + lower + fixEncoding к этому моменту
 * уже применён к заголовкам/строкам на уровне normalize.ts).
 */

export type ChargeCategory =
  | "revenue" // Выручка
  | "points" // Баллы за скидки
  | "partnerPrograms" // Программы партнёров (часть валовой выручки)
  | "commission" // Вознаграждение за продажу
  | "logistics" // Прямая логистика
  | "acquiring" // Эквайринг
  | "returnLogistics" // Обратная логистика
  | "returnRevenue" // Возврат выручки (сторнирование)
  | "returnCommission" // Возврат вознаграждения
  | "returnProcessing" // Обработка возвратов, отмен и невыкупов партнёрами
  | "partialReturn" // Обработка частичного невыкупа
  | "advertising" // Продвижение/реклама
  | "storage" // Хранение/размещение
  | "subscription" // Подписки
  | "penalties" // Штрафы/удержания
  | "compensation" // Компенсации от Ozon
  | "other";

export type ChargeTypeName = string;

/**
 * Список паттернов в нижнем регистре.
 * Совпадение — по "includes".
 */
const CATEGORY_PATTERNS: Array<{ category: ChargeCategory; patterns: string[] }> = [
  {
    category: "points",
    patterns: ["баллы за скидки", "баллы скидк"],
  },
  {
    // Важно: проверяется до advertising, чтобы "программы партнёров"
    // не перехватывались паттерном "продвижение"/"реклама".
    category: "partnerPrograms",
    patterns: ["программы партнёров", "программы партнеров"],
  },
  {
    category: "revenue",
    patterns: ["выручка"],
  },
  {
    category: "returnRevenue",
    patterns: ["возврат выручки"],
  },
  {
    category: "returnCommission",
    patterns: ["возврат вознагражден"],
  },
  {
    category: "returnProcessing",
    patterns: [
      "обработка возвратов",
      "обработка отменённых",
      "обработка отмененных",
      "невыкупов партнёрами",
      "невыкупов партнерами",
      "невостребован",
    ],
  },
  {
    category: "partialReturn",
    patterns: ["обработка частичного невыкупа", "частичного невыкупа"],
  },
  {
    category: "returnLogistics",
    patterns: ["обратная логистика"],
  },
  {
    category: "commission",
    patterns: ["вознаграждение за продажу", "вознаграждение ozon", "комиссия за продажу"],
  },
  {
    category: "acquiring",
    patterns: ["эквайринг"],
  },
  {
    category: "logistics",
    patterns: [
      "логистика",
      "магистраль",
      "последняя миля",
      "обработка отправления",
      "drop-off",
      "доставка",
    ],
  },
  {
    category: "subscription",
    patterns: ["подписка"],
  },
  {
    category: "advertising",
    patterns: ["продвижение", "реклама", "бонусы продавца"],
  },
  {
    category: "storage",
    patterns: ["хранение", "размещение"],
  },
  {
    category: "penalties",
    patterns: [
      "штраф",
      "удержание",
      "операционных ошибок",
      "превышение индекса ошибок",
      "нерекомендованный слот",
      "просроченная отгрузка",
      "декомпенсац",
      "возвращение товаров на склад",
      "досрочная выплата",
      "гибкий график выплат",
    ],
  },
  {
    category: "compensation",
    patterns: ["компенсация", "потеря по вине"],
  },
];

/** Определяет категорию по "Тип начисления". */
export function classifyChargeType(chargeType: string | null | undefined): ChargeCategory {
  if (!chargeType) return "other";
  const lower = String(chargeType).toLowerCase().trim();
  if (!lower) return "other";

  for (const entry of CATEGORY_PATTERNS) {
    for (const p of entry.patterns) {
      if (lower.includes(p)) return entry.category;
    }
  }
  return "other";
}

/** Те категории, которые означают наличие возвратной операции у заказа. */
const RETURN_CATEGORIES: ReadonlyArray<ChargeCategory> = [
  "returnLogistics",
  "returnProcessing",
  "partialReturn",
  "returnRevenue",
  "returnCommission",
];

export function isReturnCategory(cat: ChargeCategory): boolean {
  return RETURN_CATEGORIES.includes(cat);
}

/**
 * Тип начисления означает отмену заказа (Озон): штрафы/удержания за отмену, индекс ошибок+отмена и т.п.
 * Не путать с «отмена начисления» в логистике.
 */
export function isOrderCancelledChargeType(chargeType: string | null | undefined): boolean {
  if (!chargeType) return false;
  const t = chargeType.toLowerCase();
  if (t.includes("превышение") && t.includes("индекс") && t.includes("ошиб") && t.includes("отмен")) {
    return true;
  }
  if (t.includes("операционных ошибок") && t.includes("отмена")) {
    return true;
  }
  if (t.includes("отмена заказа")) {
    return true;
  }
  if (t.includes("отмена отправления")) {
    return true;
  }
  return false;
}

/**
 * Требования для статуса "success":
 *   1) хотя бы один товар с артикулом и названием;
 *   2) есть Эквайринг, Логистика, Выручка, Вознаграждение за продажу;
 *   3) нет Обратной логистики и/или Обработки возвратов (+ частичного невыкупа).
 */
export const REQUIRED_SUCCESS_CATEGORIES = [
  "acquiring",
  "logistics",
  "revenue",
  "commission",
] as const;

/**
 * Группы для UI (drill-down по типам начислений).
 * В новом пайплайне — по category.
 */
export const CATEGORY_GROUP_LABEL: Record<ChargeCategory, string> = {
  revenue: "Продажи",
  points: "Баллы за скидки",
  partnerPrograms: "Программы партнёров",
  commission: "Комиссии Ozon",
  logistics: "Логистика",
  acquiring: "Эквайринг",
  returnLogistics: "Обратная логистика",
  returnRevenue: "Возврат выручки",
  returnCommission: "Возврат комиссии",
  returnProcessing: "Обработка возвратов",
  partialReturn: "Частичный невыкуп",
  advertising: "Реклама и продвижение",
  storage: "Хранение",
  subscription: "Подписки",
  penalties: "Штрафы и удержания",
  compensation: "Компенсации",
  other: "Прочее",
};

/** Категории, которые учитываются как "удержания Ozon" (общая сумма fees). */
export const FEE_CATEGORIES: ReadonlyArray<ChargeCategory> = [
  "commission",
  "logistics",
  "acquiring",
  "returnLogistics",
  "returnProcessing",
  "partialReturn",
  "advertising",
  "storage",
  "penalties",
  "subscription",
];
