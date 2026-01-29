/**
 * Расчёт себестоимости для заказов и товаров
 */

import { round } from "../data-utils";
import type { AggregatedOrder } from "../types";

export class CostCalculator {
  /**
   * Добавляет себестоимость к заказам
   */
  addCostToOrders(
    orders: AggregatedOrder[],
    costData?: Map<string, number>
  ): {
    articlesComparison: {
      costArticles: string[];
      orderArticles: string[];
    };
  } {
    const orderArticles = new Set<string>();

    for (const order of orders) {
      const article = (order.article || "").trim();
      if (article) {
        orderArticles.add(article);
      }
    }

    const costArticles = costData && costData.size > 0
      ? Array.from(costData.keys())
      : [];

    if (!costData || costData.size === 0) {
      return {
        articlesComparison: {
          costArticles: costArticles.sort(),
          orderArticles: Array.from(orderArticles).sort(),
        },
      };
    }

    for (const order of orders) {
      const article = (order.article || "").trim();
      if (!article) {
        continue;
      }

      // Для возвращенных заказов себестоимость не учитывается
      if (order.status === "returned") {
        order.hasCost = false;
        order.costPerUnit = undefined;
        order.totalCost = undefined;
        continue;
      }

      // Прямое сопоставление
      if (costData.has(article)) {
        const costPerUnit = costData.get(article)!;
        order.costPerUnit = round(costPerUnit);
        order.totalCost = round(costPerUnit * (order.quantity || 1));
        order.hasCost = true;
      } else {
        order.hasCost = false;

        // Попытка сопоставления без учета регистра
        const lowerArticle = article.toLowerCase();
        let found = false;
        for (const costArt of costArticles) {
          if (costArt.toLowerCase() === lowerArticle) {
            const costPerUnit = costData.get(costArt)!;
            order.costPerUnit = round(costPerUnit);
            order.totalCost = round(costPerUnit * (order.quantity || 1));
            order.hasCost = true;
            found = true;
            break;
          }
        }

        if (!found) {
          // Попытка сопоставления с удалением пробелов
          const noSpacesArticle = article.replace(/\s/g, "");
          for (const costArt of costArticles) {
            const noSpacesCostArt = costArt.replace(/\s/g, "");
            if (noSpacesCostArt === noSpacesArticle || noSpacesCostArt.toLowerCase() === noSpacesArticle.toLowerCase()) {
              const costPerUnit = costData.get(costArt)!;
              order.costPerUnit = round(costPerUnit);
              order.totalCost = round(costPerUnit * (order.quantity || 1));
              order.hasCost = true;
              break;
            }
          }
        }
      }
    }

    return {
      articlesComparison: {
        costArticles: costArticles.sort(),
        orderArticles: Array.from(orderArticles).sort(),
      },
    };
  }
}
