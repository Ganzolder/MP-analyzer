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

// Знаки препинания, которые НЕ должны декодироваться
const PUNCTUATION_TO_PRESERVE = new Set([
  ",",  // запятая
  ".",  // точка
  "'",  // одинарная кавычка
  '"',  // двойная кавычка
  ":",  // двоеточие
  ";",  // точка с запятой
  "!",  // восклицательный знак
  "?",  // вопросительный знак
  "-",  // дефис (обрабатывается отдельно)
  "_",  // подчеркивание
  "/",  // слэш
  "(",  // открывающая скобка
  ")",  // закрывающая скобка
  "[",  // открывающая квадратная скобка
  "]",  // закрывающая квадратная скобка
  "{",  // открывающая фигурная скобка
  "}",  // закрывающая фигурная скобка
  "=",  // знак равенства
  "+",  // плюс
  "*",  // звездочка
  "&",  // амперсанд
  "%",  // процент
  "$",  // доллар
  "#",  // решетка
  "@",  // собака
  "x",  // латинская буква x (строчная)
  "X",  // латинская буква X (заглавная)
]);

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
  
  let result = "";
  // Если строка явно содержит KOI-7 маркеры (управляющие символы / типичный набор @:;<>? и т.п.),
  // то цифры внутри "слов" — это тоже буквы (0-9 -> а-й). Но реальные числа (например "87-70", "2025")
  // надо сохранить как числа.
  const hasKoi7Markers =
    /[\x10-\x1F]/.test(fixedStr) || /[@A-OG-Z:<=>?]/.test(fixedStr);

  const isNumericTokenChar = (ch: string) => /[0-9.,-]/.test(ch);
  const isWordBoundary = (ch: string) => ch === "" || ch === " " || ch === "\n" || ch === "\t";

  const isProbablyRealNumberAt = (s: string, idx: number) => {
    // Определяем "токен" вокруг idx (цифры/разделители)
    let l = idx;
    while (l > 0 && isNumericTokenChar(s[l - 1])) l--;
    let r = idx;
    while (r + 1 < s.length && isNumericTokenChar(s[r + 1])) r++;
    const token = s.slice(l, r + 1);

    // Если токен окружен границами слова — скорее всего это реальное число
    const left = l > 0 ? s[l - 1] : "";
    const right = r + 1 < s.length ? s[r + 1] : "";
    const bounded = isWordBoundary(left) && isWordBoundary(right);
    if (!bounded) return false;

    // Типичные числовые формы
    if (/^\d+([.,]\d+)?$/.test(token)) return true;          // 123 или 123.45
    if (/^\d{1,6}(-\d{1,6})+$/.test(token)) return true;     // 87-70, 2025-01
    if (/^\d{2,4}$/.test(token)) return true;                // 25, 2025
    return false;
  };

  for (let i = 0; i < fixedStr.length; i++) {
    const char = fixedStr[i];
    const prevChar = i > 0 ? fixedStr[i - 1] : " ";
    const nextChar = i + 1 < fixedStr.length ? fixedStr[i + 1] : " ";
    
    // ЦИФРЫ и ЛАТИНСКИЕ БУКВЫ НЕ декодируем - они уже в правильной кодировке
    // Но проверяем, не является ли это частью кириллического слова
    if (/[0-9]/.test(char)) {
      // В KOI-7 цифры 0-9 = а-й. Декодируем только если:
      // - строка похожа на KOI-7 (есть маркеры)
      // - и эта цифра не является частью "реального" числового токена (например "87-70")
      if (hasKoi7Markers && !isProbablyRealNumberAt(fixedStr, i)) {
        const decoded = ASCII_TO_CYRILLIC[char];
        result += decoded !== undefined ? decoded : char;
      } else {
        result += char;
      }
    } else if (/[a-zA-Z]/.test(char) && char.charCodeAt(0) < 128) {
      // Латиница - оставляем как есть
      result += char;
    } 
    // ЗНАКИ ПРЕПИНАНИЯ НЕ декодируем - они уже в правильной кодировке
    else if (PUNCTUATION_TO_PRESERVE.has(char)) {
      result += char;
    } 
    else if (char === "-") {
      // Специальная логика для "-":
      // Если в начале слова - это "Э", иначе дефис
      const isWordStart = prevChar === " " || prevChar === "\n" || i === 0;
      const nextIsLatin = /[a-zA-Z]/.test(nextChar);
      
      if (isWordStart && !nextIsLatin) {
        result += "Э";
      } else {
        result += "-";
      }
    } else {
      // Декодируем символ через таблицу или оставляем как есть
      const decoded = ASCII_TO_CYRILLIC[char];
      result += decoded !== undefined ? decoded : char;
    }
  }
  return result;
}
