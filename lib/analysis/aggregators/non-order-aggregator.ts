/**
 * Агрегация начислений без заказов
 */

import { SUBSCRIPTION_PATTERN } from "../constants";
import { round } from "../data-utils";
import type { ChargeRow, NonOrderCharge, SubscriptionCharge } from "../types";

export class NonOrderAggregator {
  /**
   * Агрегирует начисления без заказов
   */
  aggregateNonOrderCharges(chargeRows: ChargeRow[]): NonOrderCharge[] {
    const chargeMap = new Map<string, { rows: ChargeRow[]; serviceGroup: string }>();

    for (const row of chargeRows) {
      if (row.orderNumber) continue;
      if (SUBSCRIPTION_PATTERN.test(row.chargeId)) continue;

      const key = row.chargeType || row.serviceGroup || "Прочее";

      if (!chargeMap.has(key)) {
        chargeMap.set(key, { rows: [], serviceGroup: row.serviceGroup });
      }
      chargeMap.get(key)!.rows.push(row);
    }

    const charges: NonOrderCharge[] = [];

    Array.from(chargeMap.entries()).forEach(([chargeType, data]) => {
      let totalRub = 0;
      let totalPoints = 0;

      for (const row of data.rows) {
        if (row.isPoints) {
          totalPoints += row.totalAmount;
        } else {
          totalRub += row.totalAmount;
        }
      }

      charges.push({
        serviceGroup: data.serviceGroup,
        chargeType,
        totalAmountRub: round(totalRub),
        totalAmountPoints: round(totalPoints),
        count: data.rows.length,
        description: this.getChargeDescription(chargeType, data.serviceGroup),
      });
    });

    charges.sort((a, b) => Math.abs(b.totalAmountRub) - Math.abs(a.totalAmountRub));

    return charges;
  }

  /**
   * Извлекает подписки
   */
  extractSubscriptions(chargeRows: ChargeRow[]): SubscriptionCharge[] {
    const subscriptions: SubscriptionCharge[] = [];

    for (const row of chargeRows) {
      if (SUBSCRIPTION_PATTERN.test(row.chargeId)) {
        subscriptions.push({
          period: row.chargeId,
          chargeType: row.chargeType || "Подписка",
          totalAmount: row.totalAmount,
          chargeDate: row.chargeDate,
        });
      }
    }

    return subscriptions;
  }

  private getChargeDescription(chargeType: string, serviceGroup: string): string {
    const type = chargeType.toLowerCase();

    if (type.includes("хранен")) return "Затраты на хранение товаров на складе";
    if (type.includes("реклам") || type.includes("продвиж")) return "Затраты на рекламу и продвижение";
    if (type.includes("штраф")) return "Штрафы от маркетплейса";
    if (type.includes("компенс")) return "Компенсации";
    if (type.includes("подписк")) return "Плата за подписку";

    return `${serviceGroup}: ${chargeType}`;
  }
}
