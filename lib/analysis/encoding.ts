/**
 * Модуль декодирования кириллицы из специфичной кодировки Ozon (KOI-7)
 */

/** Таблица соответствия: ASCII → кириллица (KOI-7 кодировка) */
const ASCII_TO_CYRILLIC: Record<string, string> = {
  // Строчные буквы (0x60-0x7F)
  "0": "а", "1": "б", "2": "в", "3": "г", "4": "д", "5": "е", "6": "ж", "7": "з",
  "8": "и", "9": "й", ":": "к", ";": "л", "<": "м", "=": "н", ">": "о", "?": "п",
  "@": "р", "A": "с", "B": "т", "C": "у", "D": "ф", "E": "х", "F": "ц", "G": "ч",
  "H": "ш", "I": "щ", "J": "ъ", "K": "ы", "L": "ь", "M": "э", "N": "ю", "O": "я",
  
  // Заглавные буквы через управляющие символы (0x10-0x1F)
  "\x10": "А", "\x11": "Б", "\x12": "В", "\x13": "Г", "\x14": "Д", "\x15": "Е", 
  "\x16": "Ж", "\x17": "З", "\x18": "И", "\x19": "Й", "\x1a": "К", "\x1b": "Л",
  "\x1c": "М", "\x1d": "Н", "\x1e": "О", "\x1f": "П",
  
  // Заглавные в printable range (0x20-0x5F)
  "!": "Р", "\"": "С", "#": "Т", "$": "У", "%": "Ф", "&": "Х", "'": "Ц",
  "(": "Ч", ")": "Ш", "*": "Щ", "+": "Ъ", ",": "Ы", "-": "Ь", ".": "Э", "/": "Ю",
  
  // ё (строчная)
  "Q": "ё",
};

/**
 * Декодирует строку из специфичной кодировки Ozon (KOI-7) в читаемый русский текст
 * 
 * ВАЖНО: В файлах Ozon цифры, латинские буквы и знаки препинания уже в правильной кодировке (UTF-8),
 * только кириллица закодирована в KOI-7. Поэтому цифры, латинские буквы и знаки препинания НЕ декодируются.
 */

// Пробелы/разделители между токенами
const TOKEN_SEPARATORS = new Set([" ", "\n", "\t", "\r"]);

const looksLikeRealNumberToken = (token: string) => {
  // 123, 123.45, 123,45
  if (/^\d+([.,]\d+)?$/.test(token)) return true;
  // 87-70, 2025-01, 01-12-2025
  if (/^\d{1,6}(-\d{1,6})+$/.test(token)) return true;
  // короткие годы/месяцы
  if (/^\d{2,4}$/.test(token)) return true;
  return false;
};

const isKoi7Char = (ch: string) => {
  // KOI-7 “алфавит”: управляющие \x10-\x1F, цифры 0-9, @, A-O, :;<=>?, Q(ё), а также !\"#$%&'()*+,-./ для заглавных Р-Ю
  const code = ch.charCodeAt(0);
  if (code >= 0x10 && code <= 0x1f) return true;
  if (/[0-9@A-OQ:;<=>?!"#$%&'()*+,\-./]/.test(ch)) return true;
  return false;
};

const decodeKoi7Token = (token: string) => {
  // Декодируем посимвольно через таблицу, если символ известен; иначе оставляем как есть
  let out = "";
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    const mapped = ASCII_TO_CYRILLIC[ch];
    out += mapped !== undefined ? mapped : ch;
  }
  return out;
};

export function fixEncoding(str: string): string {
  if (!str || typeof str !== "string") return str;
  
  // Исправляем известные случаи неправильного чтения
  // "щD начисления" → "ID начисления", "SыU" → "SKU", "яzon" → "Ozon"
  let fixedStr = str;
  if (fixedStr.startsWith("щD")) {
    fixedStr = fixedStr.replace("щD", "ID");
  }
  if (fixedStr.includes("SыU")) {
    fixedStr = fixedStr.replace(/SыU/g, "SKU");
  }
  if (fixedStr.startsWith("яzon")) {
    fixedStr = fixedStr.replace("яzon", "Ozon");
  }
  
  // Исправляем известные паттерны KOI-7, где управляющие символы теряются
  // "K@CG:0" → "Выручка" (K должен быть заглавной В, но управляющий символ \x12 теряется)
  if (fixedStr === "K@CG:0" || fixedStr.startsWith("K@CG:0")) {
    fixedStr = fixedStr.replace(/^K@CG:0/, "Выручка");
  }
  // Также проверяем случаи, когда может быть "K@CG:0" в середине или конце
  if (fixedStr.includes("K@CG:0") && !fixedStr.includes("Выручка")) {
    fixedStr = fixedStr.replace(/K@CG:0/g, "Выручка");
  }
  
  // Исправляем ">72@0B 2K@CG:8" → "Возврат выручки"
  if (fixedStr.includes(">72@0B 2K@CG:8")) {
    fixedStr = fixedStr.replace(/>72@0B 2K@CG:8/g, "Возврат выручки");
  }
  
  // Декодируем “по токенам”: если токен похож на KOI-7 слово — декодируем,
  // если это реальное число/ID — оставляем как есть.
  let out = "";
  let token = "";

  const flushToken = () => {
    if (!token) return;
    const hasKoi = token.split("").some(isKoi7Char) || /[\x10-\x1F]/.test(token);
    if (hasKoi && !looksLikeRealNumberToken(token)) {
      out += decodeKoi7Token(token);
    } else {
      out += token;
    }
    token = "";
  };

  for (let i = 0; i < fixedStr.length; i++) {
    const ch = fixedStr[i];
    if (TOKEN_SEPARATORS.has(ch)) {
      flushToken();
      out += ch;
      continue;
    }
    token += ch;
  }
  flushToken();
  return out;
}
