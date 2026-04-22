import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { getIaoUserId } from "@/lib/auth/iao-user";
import { loadImport } from "@/lib/supabase/import-repository";
import {
  buildChargeTypeBreakdown,
  buildCostBreakdown,
  buildDaily,
  buildProductAggregates,
  buildSchemeStats,
  buildSummary,
  type ConsolidationAnalytics,
} from "@/lib/analysis/pipeline/metrics";
import { toFrontendAnalysis } from "@/lib/analysis/pipeline/to-frontend";
import type { ConsolidatedReport } from "@/lib/analysis/domain";

export const dynamic = "force-dynamic";

/**
 * POST /api/analysis/[id]/recalculate
 *
 * Пересчитывает импорт, исключая заказы с артикулами из `excludedSkus`
 * (поле называется `excludedArticles` для ясности, но старое имя тоже принимается).
 *
 * Источник данных — mp_* таблицы в Supabase: мы загружаем сохранённые заказы,
 * строки начислений и подписки, фильтруем и прогоняем через metrics ещё раз.
 * Пересохранения в БД не происходит.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const iaoUserId = getIaoUserId();
  const analysisId = params.id;

  try {
    const body = await request.json().catch(() => ({} as any));
    const rawList: unknown = body.excludedArticles ?? body.excludedSkus ?? [];
    if (!Array.isArray(rawList)) {
      return NextResponse.json(
        { error: "excludedArticles должен быть массивом строк" },
        { status: 400 }
      );
    }
    const excluded = new Set<string>(rawList.map((s) => String(s).trim()).filter(Boolean));

    const imp = await loadImport(iaoUserId, analysisId);
    if (!imp) {
      return NextResponse.json({ error: "Импорт не найден" }, { status: 404 });
    }

    logger.info("API", "Recalculate", { analysisId, excluded: excluded.size });

    const isOrderExcluded = (articles: Iterable<string>): boolean => {
      for (const a of articles) {
        if (!a) continue;
        if (excluded.has(a)) return true;
      }
      return false;
    };

    const keptOrders = imp.orders.filter((o) => {
      const articles: string[] = [];
      for (const s of o.shipments) {
        for (const it of s.items) {
          if (it.article) articles.push(it.article);
        }
      }
      return !isOrderExcluded(articles);
    });

    const keptOrderKeys = new Set(keptOrders.map((o) => o.orderKey));
    const keptCharges = imp.charges.filter(
      (c) =>
        !c.orderKey ||
        keptOrderKeys.has(c.orderKey) ||
        (!c.article || !excluded.has(c.article))
    );

    const products = buildProductAggregates(keptOrders);
    const summary = buildSummary(keptOrders, imp.nonOrderCharges, imp.subscriptions, products);
    const costBreakdown = buildCostBreakdown(
      keptOrders,
      imp.nonOrderCharges,
      imp.subscriptions
    );
    const schemeStats = buildSchemeStats(keptOrders);
    const chargeTypeBreakdown = buildChargeTypeBreakdown(keptCharges);
    const daily = buildDaily(keptOrders);

    const report: ConsolidatedReport = {
      periodStart: imp.periodStart ?? new Date(),
      periodEnd: imp.periodEnd ?? new Date(),
      periodLabel: imp.periodLabel ?? "",
      sourceFiles: imp.fileNames.map((name, i) => ({
        fileName: name,
        size: imp.fileSizes[i] ?? 0,
      })),
      orders: keptOrders,
      nonOrderCharges: imp.nonOrderCharges,
      subscriptions: imp.subscriptions,
      charges: keptCharges,
    };
    const analytics: ConsolidationAnalytics = {
      summary,
      costBreakdown,
      schemeStats,
      chargeTypeBreakdown,
      daily,
      productAggregates: products,
    };

    const frontend = toFrontendAnalysis(
      { report, analytics, costMatch: { matchedArticles: new Set(), unmatchedArticles: new Set() } },
      {
        id: imp.id,
        fileName: imp.fileNames.join(", "),
        fileSize: imp.fileSizes.reduce((s, v) => s + v, 0),
      }
    );

    return NextResponse.json({
      ...frontend,
      recalculated: true,
      excludedCount: excluded.size,
      removedOrders: imp.orders.length - keptOrders.length,
    });
  } catch (error: any) {
    logger.error("API", "Ошибка при пересчёте анализа", error);
    return NextResponse.json(
      { error: "Ошибка при пересчёте", message: error?.message },
      { status: 500 }
    );
  }
}
