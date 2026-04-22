/**
 * Единый ключ для агрегации метрик по товару.
 * Приоритет артикула продавца над SKU: в отчёте Ozon у одного артикула могут быть разные SKU,
 * их нужно объединять в одну строку метрик.
 */

export function getProductAggregateKey(input: {
  sku?: string;
  article?: string;
} | null | undefined): string | null {
  if (!input) return null;
  const article = (input.article ?? "").trim();
  if (article.length > 0) return article;
  const sku = (input.sku ?? "").trim();
  if (sku.length > 0) return sku;
  return null;
}
