/**
 * Детализация по типам начислений (группировка)
 */

import { getChargeGroup } from "../charge-type-groups";
import type { ChargeRow } from "../types";

export class ChargeTypeBreakdownCalculator {
  /**
   * Рассчитывает детализацию по типам начислений с группировкой
   */
  calculateChargeTypeBreakdown(chargeRows: ChargeRow[]): Array<{
    groupName: string;
    amount: number;
    count: number;
    chargeTypes: Array<{ name: string; amount: number; count: number }>;
  }> {
    const groupMap = new Map<string, {
      amount: number;
      count: number;
      chargeTypes: Map<string, { amount: number; count: number }>;
    }>();

    for (const row of chargeRows) {
      const chargeType = row.chargeType || row.serviceGroup || "Прочее";
      const amount = row.totalAmount;
      const group = getChargeGroup(chargeType);

      if (!groupMap.has(group)) {
        groupMap.set(group, { amount: 0, count: 0, chargeTypes: new Map() });
      }

      const groupData = groupMap.get(group)!;
      groupData.amount += amount;
      groupData.count++;

      if (!groupData.chargeTypes.has(chargeType)) {
        groupData.chargeTypes.set(chargeType, { amount: 0, count: 0 });
      }

      const chargeTypeData = groupData.chargeTypes.get(chargeType)!;
      chargeTypeData.amount += amount;
      chargeTypeData.count++;
    }

    const result = Array.from(groupMap.entries())
      .map(([groupName, data]) => ({
        groupName,
        amount: data.amount,
        count: data.count,
        chargeTypes: Array.from(data.chargeTypes.entries())
          .map(([name, typeData]) => ({
            name,
            amount: typeData.amount,
            count: typeData.count,
          }))
          .sort((a, b) => b.amount - a.amount),
      }))
      .sort((a, b) => b.amount - a.amount);

    return result;
  }
}
