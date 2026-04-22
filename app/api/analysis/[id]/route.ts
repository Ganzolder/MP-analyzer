import { NextRequest, NextResponse } from "next/server";
import { getIaoUserId } from "@/lib/auth/iao-user";
import { deleteImport, loadImport } from "@/lib/supabase/import-repository";
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
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/analysis/[id]
 *
 * Возвращает сохранённый импорт в формате `FrontendAnalysisResult`.
 * Метрики пересчитываются из заказов/начислений — это гарантирует консистентность
 * с текущей реализацией pipeline даже если снапшот в mp_imports.summary устарел.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const iaoUserId = getIaoUserId();
  try {
    const imp = await loadImport(iaoUserId, params.id);
    if (!imp) {
      return NextResponse.json({ error: "Анализ не найден" }, { status: 404 });
    }

    const products = buildProductAggregates(imp.orders);
    const summary = buildSummary(imp.orders, imp.nonOrderCharges, imp.subscriptions, products);
    const costBreakdown = buildCostBreakdown(imp.orders, imp.nonOrderCharges, imp.subscriptions);
    const schemeStats = buildSchemeStats(imp.orders);
    const chargeTypeBreakdown = buildChargeTypeBreakdown(imp.charges);
    const daily = buildDaily(imp.orders);

    const report: ConsolidatedReport = {
      periodStart: imp.periodStart ?? new Date(),
      periodEnd: imp.periodEnd ?? new Date(),
      periodLabel: imp.periodLabel ?? "",
      sourceFiles: imp.fileNames.map((name, i) => ({ fileName: name, size: imp.fileSizes[i] ?? 0 })),
      orders: imp.orders,
      nonOrderCharges: imp.nonOrderCharges,
      subscriptions: imp.subscriptions,
      charges: imp.charges,
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
      success: true,
      data: {
        ...frontend,
        createdAt: imp.createdAt,
      },
    });
  } catch (err: any) {
    logger.error("API", "Ошибка при получении анализа", err);
    return NextResponse.json(
      { error: "Ошибка при получении анализа", message: err?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/analysis/[id]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const iaoUserId = getIaoUserId();
  try {
    const removed = await deleteImport(iaoUserId, params.id);
    if (!removed) {
      return NextResponse.json({ error: "Анализ не найден" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Анализ удалён" });
  } catch (err: any) {
    logger.error("API", "Ошибка при удалении анализа", err);
    return NextResponse.json(
      { error: "Ошибка при удалении анализа", message: err?.message },
      { status: 500 }
    );
  }
}
