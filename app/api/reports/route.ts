import { NextRequest, NextResponse } from "next/server";
import { getIaoUserId } from "@/lib/auth/iao-user";
import { listImports } from "@/lib/supabase/import-repository";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports
 *
 * Возвращает историю импортов текущего пользователя (max 3 записей по
 * политике `enforceHistoryLimit`). Работает поверх Supabase-таблицы mp_imports.
 */
export async function GET(_request: NextRequest) {
  const iaoUserId = getIaoUserId();

  try {
    const imports = await listImports(iaoUserId);
    const data = imports.map((imp) => ({
      id: imp.id,
      fileName: imp.fileNames[0] ?? "(без имени)",
      fileNames: imp.fileNames,
      fileSize: imp.fileSizes.reduce((acc, v) => acc + v, 0),
      status: "completed",
      createdAt: imp.createdAt,
      periodStart: imp.periodStart,
      periodEnd: imp.periodEnd,
      periodLabel: imp.periodLabel,
      totalOrders: Number(imp.summary?.totalOrders ?? 0),
      totalRevenue: Number(imp.summary?.grossRevenue ?? 0),
      netProfit: Number(imp.summary?.netPayout ?? 0),
    }));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (err: any) {
    logger.error("API", "Ошибка при получении списка отчётов", err);
    return NextResponse.json(
      { success: false, data: [], error: err?.message ?? "db error" },
      { status: 500 }
    );
  }
}
