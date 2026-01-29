/**
 * Константы и утилиты для работы с типами начислений
 */

/**
 * Маппинг типов начислений на категории
 * Ключи - реальные значения из файла (могут быть кракозябрами)
 * Поиск по подстроке (includes)
 */
const CHARGE_TYPE_CATEGORIES: Record<string, string[]> = {
  // Выручка (положительные)
  revenue: [
    "Выручка", "K@CG:0", "Выручка от реализации",
  ],
  // Баллы за скидки
  points: [
    "Баллы за скидки", "0;;K 70 A:84:8", "Баллы",
  ],
  // Комиссия Ozon
  commission: [
    "Вознаграждение за продажу", ">7=03@0645=85 70 ?@>406C",
    "Вознаграждение Ozon", "Комиссия",
  ],
  // Логистика
  logistics: [
    "Логистика", ">38AB8:0", "Ло38AB8:0", "Доставка", "Магистраль", "Последняя миля",
    "Обработка отправления", "Drop-off",
  ],
  // Обратная логистика (возвраты)
  returnLogistics: [
    "Обратная логистика", "1@0B=0O ;>38AB8:0", "О1@0B=0O ;о38AB8:0",
  ],
  // Возврат выручки
  returnRevenue: [
    "Возврат выручки", ">72@0B 2K@CG:8",
  ],
  // Возврат вознаграждения (комиссии)
  returnCommission: [
    "Возврат вознаграждения", ">72@0B 2>7=03@0645=8O",
  ],
  // Обработка возвратов
  returnProcessing: [
    "Обработка возвратов", "Обработка отменённых",
    "Обработка возвратов Ozon", "Обработка возвратов, отмен и невыкупов партнёрами",
    "1@01>B:0 2>72@0B>2", "1@01>B:0 >B<5=Q==KE",
  ],
  // Частичный невыкуп
  partialReturn: [
    "Обработка частичного невыкупа", "1@01>B:0 G0AB8G=>3> =52K:C?0",
  ],
  // Эквайринг
  acquiring: [
    "Эквайринг", "-:209@8=3",
  ],
  // Подписка
  subscription: [
    "Подписка Premium", ">4?8A:0 Premium",
  ],
  // Реклама и продвижение
  advertising: [
    "Продвижение", "Реклама", "@>42865=85", "Бонусы продавца", ">=CAK ?@>402F0",
  ],
  // Хранение
  storage: [
    "Хранение", "Размещение",
  ],
  // Штрафы
  penalties: [
    "Штраф", "Удержание",
  ],
  // Компенсации
  compensation: [
    "Компенсация", "><?5=A0F8", "Потеря по вине", ">B5@O ?> 28=5",
  ],
};

/** Типы начислений, означающие возврат */
const RETURN_CHARGE_CATEGORIES = [
  "returnLogistics",
  "returnRevenue", 
  "returnCommission",
  "returnProcessing",
];

/** Категория для частичного возврата */
const PARTIAL_RETURN_CATEGORY = "partialReturn";

/** Паттерн для определения подписки (дата в ID) */
export const SUBSCRIPTION_PATTERN = /^\d{2}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}$/;

/** Паттерн номера заказа: цифры-дефис-цифры */
export const ORDER_NUMBER_PATTERN = /^(\d+-\d+)(?:-\d+)?$/;

/**
 * Определяет категорию типа начисления
 */
export function getChargeCategory(chargeType: string): string {
  if (!chargeType) return "other";
  
  const lowerType = chargeType.toLowerCase();
  
  for (const [category, patterns] of Object.entries(CHARGE_TYPE_CATEGORIES)) {
    for (const pattern of patterns) {
      if (chargeType.includes(pattern) || lowerType.includes(pattern.toLowerCase())) {
        return category;
      }
    }
  }
  
  return "other";
}

/**
 * Проверяет, является ли тип начисления возвратным
 */
export function isReturnChargeType(chargeType: string): boolean {
  const category = getChargeCategory(chargeType);
  return RETURN_CHARGE_CATEGORIES.includes(category);
}

/**
 * Проверяет, является ли тип начисления частичным возвратом
 */
export function isPartialReturnChargeType(chargeType: string): boolean {
  return getChargeCategory(chargeType) === PARTIAL_RETURN_CATEGORY;
}

/**
 * Извлекает номер заказа из ID начисления
 * "0101288328-0079-1" → "0101288328-0079"
 * "0101288328-0079" → "0101288328-0079"
 * "07.10.25-07.11.25" → null (подписка)
 * "" → null
 */
export function extractOrderNumber(chargeId: string): string | null {
  if (!chargeId) return null;
  
  // Проверяем, это подписка (дата)
  if (SUBSCRIPTION_PATTERN.test(chargeId)) {
    return null;
  }
  
  // Извлекаем номер заказа (убираем всё после второго дефиса)
  const match = chargeId.match(ORDER_NUMBER_PATTERN);
  if (match) {
    return match[1]; // Возвращаем первую группу (номер без -1, -2 и т.д.)
  }
  
  // Если формат не совпадает, возвращаем как есть (если есть хотя бы один дефис)
  if (chargeId.includes("-") && /^\d+-\d+/.test(chargeId)) {
    const parts = chargeId.split("-");
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1]}`;
    }
  }
  
  return null;
}
