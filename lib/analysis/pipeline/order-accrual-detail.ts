/**
 * Детализация начислений по одному заказу: группы услуг → агрегат по типу начисления.
 */

import { CATEGORY_GROUP_LABEL, type ChargeCategory } from "../charge-types";
import type { ChargeLine } from "../domain";
import { getGroupForChargeType } from "@/lib/config/charge-type-mapping";
import { round } from "../data-utils";

/** Выручка, баллы за скидки и программы партнёров — единая группа в UI. */
const SALES_GROUP = "Продажи";
const SALES_CATEGORIES: ReadonlySet<ChargeCategory> = new Set([
  "revenue",
  "points",
  "partnerPrograms",
]);

/** Одна строка: сумма по всем физическим строкам с этим «Тип начисления». */
export interface OrderAccrualTypeRow {
  chargeType: string;
  amount: number;
  lineCount: number;
  /** true — строка в баллах, не в рублях (см. одну группу «Продажи» с рублями) */
  isPoints: boolean;
}

export interface OrderAccrualGroup {
  groupName: string;
  subtotal: number;
  types: OrderAccrualTypeRow[];
  /** true — в группе и рубли, и баллы; итог в шапке группы не показываем */
  hasMixedUnits?: boolean;
}

export interface OrderAccrualBlock {
  groups: OrderAccrualGroup[];
  /** Всегда false: единицы (₽/балл) задаются на уровне строки `OrderAccrualTypeRow.isPoints` */
  isPoints: false;
}

export interface OrderAccrualDetail {
  rub: OrderAccrualBlock;
  /** Резерв; сейчас не используется (баллы за скидки — в `rub` в группе «Продажи») */
  points: null;
}

const GROUP_NAME_OTHER = "Прочее";

function resolveGroupName(line: ChargeLine): string {
  if (SALES_CATEGORIES.has(line.category as ChargeCategory)) {
    return SALES_GROUP;
  }
  const sg = line.serviceGroup?.trim();
  if (sg) return sg;
  const fromMapping = getGroupForChargeType(line.chargeType);
  if (fromMapping) return fromMapping;
  const cat = line.category as ChargeCategory;
  return CATEGORY_GROUP_LABEL[cat] ?? GROUP_NAME_OTHER;
}

type AccRow = { amount: number; lineCount: number; isPoints: boolean };

/**
 * Собирает детализацию по orderKey. Возвращает null, если для ключа нет ни одной строки.
 */
export function buildOrderAccrualDetail(
  allCharges: ChargeLine[],
  orderKey: string
): OrderAccrualDetail | null {
  const lines = allCharges.filter((c) => c.orderKey === orderKey);
  if (lines.length === 0) return null;

  const rub = buildBlock(lines);
  return { rub, points: null };
}

function buildBlock(source: ChargeLine[]): OrderAccrualBlock {
  // (groupName + \0 + chargeType) -> acc
  const cell = new Map<string, AccRow>();
  for (const line of source) {
    const g = resolveGroupName(line);
    const t = line.chargeType?.trim() || "—";
    const key = `${g}\0${t}`;
    let row = cell.get(key);
    if (!row) {
      row = { amount: 0, lineCount: 0, isPoints: line.isPoints };
      cell.set(key, row);
    } else if (row.isPoints !== line.isPoints) {
      row.isPoints = row.isPoints || line.isPoints;
    }
    row.amount += line.totalAmount;
    row.lineCount += 1;
  }

  const byGroup = new Map<string, Map<string, AccRow>>();
  for (const [k, v] of cell) {
    const [g, t] = k.split("\0");
    let m = byGroup.get(g);
    if (!m) {
      m = new Map();
      byGroup.set(g, m);
    }
    m.set(t, v);
  }

  const groups: OrderAccrualGroup[] = [];
  for (const [groupName, typeMap] of byGroup) {
    const types: OrderAccrualTypeRow[] = [];
    let hasRub = false;
    let hasPts = false;
    let subtotal = 0;
    for (const [chargeType, acc] of typeMap) {
      const inPoints = acc.isPoints;
      const amount = inPoints ? round(acc.amount, 0) : round(acc.amount, 2);
      if (inPoints) hasPts = true;
      else hasRub = true;
      if (!inPoints) subtotal += amount;
      types.push({
        chargeType,
        amount,
        lineCount: acc.lineCount,
        isPoints: inPoints,
      });
    }
    const mixed = hasRub && hasPts;
    let hasMixedUnits: boolean;
    if (!mixed) {
      hasMixedUnits = false;
      subtotal = hasPts
        ? round(
            types.reduce((s, t) => s + t.amount, 0),
            0
          )
        : round(
            types.reduce((s, t) => s + t.amount, 0),
            2
          );
    } else if (groupName === SALES_GROUP) {
      // 1 бонус = 1 ₽: общий эквивалент в «рублевом» итоге в шапке
      hasMixedUnits = false;
      subtotal = round(types.reduce((s, t) => s + t.amount, 0), 2);
    } else {
      hasMixedUnits = true;
      subtotal = 0;
    }
    types.sort((a, b) => a.chargeType.localeCompare(b.chargeType, "ru"));
    groups.push({
      groupName,
      subtotal,
      types,
      hasMixedUnits: hasMixedUnits || undefined,
    });
  }

  sortGroupsInPlace(groups);

  return { groups, isPoints: false };
}

function groupSortMagnitude(g: OrderAccrualGroup): number {
  if (g.hasMixedUnits) {
    return Math.max(...g.types.map((t) => Math.abs(t.amount)), 0);
  }
  return Math.abs(g.subtotal);
}

/** Устойчивый порядок групп: сначала крупные по |суммам| (как в отчёте), затем по имени. */
function sortGroupsInPlace(groups: OrderAccrualGroup[]): void {
  groups.sort((a, b) => {
    const diff = groupSortMagnitude(b) - groupSortMagnitude(a);
    if (diff !== 0) return diff;
    return a.groupName.localeCompare(b.groupName, "ru");
  });
  for (const g of groups) {
    g.types.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }
}

/**
 * Сливает детализации (например, несколько записей `AggregatedOrder` с одним orderNumber):
 * складывает суммы и lineCount по одной и той же паре (group, chargeType).
 */
export function mergeOrderAccrualDetails(details: (OrderAccrualDetail | null | undefined)[]): OrderAccrualDetail | null {
  const list = details.filter((d): d is OrderAccrualDetail => d != null);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0]!;

  const rub = mergeBlocks(list.map((d) => d.rub).filter(Boolean) as OrderAccrualBlock[]);

  return { rub, points: null };
}

function mergeBlocks(blocks: OrderAccrualBlock[]): OrderAccrualBlock {
  const acc = new Map<string, Map<string, AccRow>>();

  for (const b of blocks) {
    for (const g of b.groups) {
      let tmap = acc.get(g.groupName);
      if (!tmap) {
        tmap = new Map();
        acc.set(g.groupName, tmap);
      }
      for (const t of g.types) {
        const k = t.chargeType;
        const row = tmap.get(k) ?? { amount: 0, lineCount: 0, isPoints: t.isPoints };
        row.isPoints = row.isPoints || t.isPoints;
        row.amount += t.amount;
        row.lineCount += t.lineCount;
        tmap.set(k, row);
      }
    }
  }

  return buildBlockFromMergedMaps(acc);
}

/** Собрать `OrderAccrualBlock` из смерженных map (тот же расчёт subtotal/ mixed, что и `buildBlock`). */
function buildBlockFromMergedMaps(byGroup: Map<string, Map<string, AccRow>>): OrderAccrualBlock {
  const groups: OrderAccrualGroup[] = [];
  for (const [groupName, typeMap] of byGroup) {
    const types: OrderAccrualTypeRow[] = [];
    let hasRub = false;
    let hasPts = false;
    let subtotal = 0;
    for (const [chargeType, acc] of typeMap) {
      const inPoints = acc.isPoints;
      const amount = inPoints ? round(acc.amount, 0) : round(acc.amount, 2);
      if (inPoints) hasPts = true;
      else hasRub = true;
      if (!inPoints) subtotal += amount;
      types.push({
        chargeType,
        amount,
        lineCount: acc.lineCount,
        isPoints: inPoints,
      });
    }
    const mixed = hasRub && hasPts;
    let hasMixedUnits: boolean;
    if (!mixed) {
      hasMixedUnits = false;
      subtotal = hasPts
        ? round(
            types.reduce((s, t) => s + t.amount, 0),
            0
          )
        : round(
            types.reduce((s, t) => s + t.amount, 0),
            2
          );
    } else if (groupName === SALES_GROUP) {
      hasMixedUnits = false;
      subtotal = round(types.reduce((s, t) => s + t.amount, 0), 2);
    } else {
      hasMixedUnits = true;
      subtotal = 0;
    }
    types.sort((a, b) => a.chargeType.localeCompare(b.chargeType, "ru"));
    groups.push({
      groupName,
      subtotal,
      types,
      hasMixedUnits: hasMixedUnits || undefined,
    });
  }
  sortGroupsInPlace(groups);
  return { groups, isPoints: false };
}
