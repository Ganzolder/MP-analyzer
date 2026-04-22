/**
 * Оркестратор нового пайплайна: 1..N Excel-файлов + (опц.) cost-map → ConsolidatedReport + Analytics.
 *
 * Это замена для старого analyzeReport + mergeAnalysisResults. Слияние нескольких файлов
 * теперь происходит на уровне ChargeLine[] — до консолидации, это устраняет двойной подсчёт
 * и даёт единый источник правды для Supabase-хранения.
 */

import type { ConsolidatedReport } from "../domain";
import { readReportFiles, type SourceFile } from "./read-files";
import { normalizeSheet } from "./normalize";
import { consolidate } from "./consolidate";
import { classifyOrders } from "./classify";
import { applyCost, type CostApplyResult } from "./apply-cost";
import {
  buildChargeTypeBreakdown,
  buildCostBreakdown,
  buildDaily,
  buildProductAggregates,
  buildSchemeStats,
  buildSummary,
  type ConsolidationAnalytics,
} from "./metrics";

export interface ConsolidateInput {
  files: SourceFile[];
  costMap?: Map<string, number>;
}

export interface ConsolidationResult {
  report: ConsolidatedReport;
  analytics: ConsolidationAnalytics;
  costMatch: CostApplyResult;
}

export async function consolidateAndAnalyze(
  input: ConsolidateInput
): Promise<ConsolidationResult> {
  if (!input.files.length) {
    throw new Error("Необходимо передать хотя бы один файл");
  }

  const sheets = await readReportFiles(input.files);
  const normalized = sheets.map(normalizeSheet);

  const allCharges = normalized.flatMap((n) => n.charges);
  const periodStarts = normalized.map((n) => n.periodStart).filter(Boolean) as Date[];
  const periodEnds = normalized.map((n) => n.periodEnd).filter(Boolean) as Date[];
  const labels = normalized.map((n) => n.periodLabel).filter((l) => l && l.length > 0);

  const chargeDates = allCharges.map((c) => c.chargeDate).filter((d) => !isNaN(d.getTime()));
  const fallbackStart = chargeDates.length ? new Date(Math.min(...chargeDates.map((d) => d.getTime()))) : new Date();
  const fallbackEnd = chargeDates.length ? new Date(Math.max(...chargeDates.map((d) => d.getTime()))) : new Date();

  const periodStart = periodStarts.length
    ? new Date(Math.min(...periodStarts.map((d) => d.getTime())))
    : fallbackStart;
  const periodEnd = periodEnds.length
    ? new Date(Math.max(...periodEnds.map((d) => d.getTime())))
    : fallbackEnd;
  const periodLabel = labels.length ? labels.join(" / ") : "";

  const { orders, nonOrderCharges, subscriptions } = consolidate(allCharges);
  classifyOrders(orders);
  const costMatch = applyCost(orders, input.costMap);

  const products = buildProductAggregates(orders);
  const summary = buildSummary(orders, nonOrderCharges, subscriptions, products);
  const costBreakdown = buildCostBreakdown(orders, nonOrderCharges, subscriptions);
  const schemeStats = buildSchemeStats(orders);
  const chargeTypeBreakdown = buildChargeTypeBreakdown(allCharges);
  const daily = buildDaily(orders);

  const report: ConsolidatedReport = {
    periodStart,
    periodEnd,
    periodLabel,
    sourceFiles: input.files.map((f) => ({ fileName: f.name, size: f.buffer.length })),
    orders,
    nonOrderCharges,
    subscriptions,
    charges: allCharges,
  };

  const analytics: ConsolidationAnalytics = {
    summary,
    costBreakdown,
    schemeStats,
    chargeTypeBreakdown,
    daily,
    productAggregates: products,
  };

  return { report, analytics, costMatch };
}

export type { SourceFile } from "./read-files";
export type { ConsolidationAnalytics } from "./metrics";
