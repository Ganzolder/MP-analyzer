/**
 * Удаляет markdown-разметку из текста
 */

/**
 * Удаляет markdown-разметку из текста
 * Убирает: **жирный**, *курсив*, `код`, # заголовки, - списки, [ссылки](url), и т.д.
 */
export function removeMarkdown(text: string): string {
  if (!text) return "";

  let result = text;

  // Удаляем заголовки (# ## ### и т.д.)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "$1");

  // Удаляем жирный текст (**текст** или __текст__)
  result = result.replace(/\*\*(.+?)\*\*/g, "$1");
  result = result.replace(/__(.+?)__/g, "$1");

  // Удаляем курсив (*текст* или _текст_)
  result = result.replace(/\*(.+?)\*/g, "$1");
  result = result.replace(/_(.+?)_/g, "$1");

  // Удаляем зачёркнутый текст (~~текст~~)
  result = result.replace(/~~(.+?)~~/g, "$1");

  // Удаляем инлайн-код (`код`)
  result = result.replace(/`([^`]+)`/g, "$1");

  // Удаляем блоки кода (```код```)
  result = result.replace(/```[\s\S]*?```/g, "");

  // Удаляем ссылки [текст](url) -> оставляем только текст
  result = result.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");

  // Удаляем ссылки [текст][ref] -> оставляем только текст
  result = result.replace(/\[([^\]]+)\]\[[^\]]+\]/g, "$1");

  // Удаляем изображения ![alt](url) -> удаляем полностью
  result = result.replace(/!\[([^\]]*)\]\([^\)]+\)/g, "");

  // Удаляем горизонтальные линии (---, ***, ___)
  result = result.replace(/^[-*_]{3,}$/gm, "");

  // Удаляем маркеры списков (-, *, +, 1.)
  result = result.replace(/^[\s]*[-*+]\s+/gm, "");
  result = result.replace(/^\d+\.\s+/gm, "");

  // Удаляем отступы списков (уровень 2 и глубже)
  result = result.replace(/^[\s]{2,}[-*+]\s+/gm, "");
  result = result.replace(/^[\s]{2,}\d+\.\s+/gm, "");

  // Удаляем пустые строки (более 2 подряд)
  result = result.replace(/\n{3,}/g, "\n\n");

  // Удаляем начальные и конечные пробелы в строках
  result = result
    .split("\n")
    .map(line => line.trim())
    .join("\n");

  // Удаляем начальные и конечные пустые строки
  result = result.replace(/^\n+/, "").replace(/\n+$/, "");

  return result;
}
