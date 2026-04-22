import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

import { logger } from "@/lib/utils/logger";
import { parseCostFile } from "@/lib/analysis/cost-parser";
import { parseBuyoutReport } from "@/lib/analysis/parsers/buyout-report-parser";
import {
  consolidateAndAnalyze,
  type ConsolidateInput,
  type SourceFile,
} from "@/lib/analysis/pipeline";
import { toFrontendAnalysis } from "@/lib/analysis/pipeline/to-frontend";
import { saveImport } from "@/lib/supabase/import-repository";
import { enforceHistoryLimit, HISTORY_LIMIT } from "@/lib/supabase/history";
import { getIaoUserId } from "@/lib/auth/iao-user";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEMO_FILE_PATH = path.join(
  process.cwd(),
  "test",
  "Отчет по начислениям_01.10.2025-31.10.2025 (2).xlsx"
);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * POST /api/analyze
 *
 * Полностью перестроенный эндпоинт:
 *   1. Читает 1..N отчётных файлов (XLSX/XLS) и опциональный файл себестоимости.
 *   2. Прогоняет их через единый pipeline `consolidateAndAnalyze`.
 *   3. Применяет (опционально) обогащение выручкой из отчётов о выкупах.
 *   4. Сохраняет результат в Supabase (нормализованные таблицы mp_*).
 *   5. Поддерживает лимит истории импортов = 3 на пользователя.
 *   6. Возвращает результат в формате FrontendAnalysisResult для UI.
 */
export async function POST(request: NextRequest) {
  const iaoUserId = getIaoUserId();

  try {
    const url = new URL(request.url);
    const isDemo = url.searchParams.get("demo") === "true";

    const collected = await collectInputs(request, isDemo);
    if ("error" in collected) {
      return NextResponse.json(collected.error, { status: collected.status });
    }

    const { files, costMap, buyoutByOrder, displayFileName, totalSize } = collected;

    console.log("=".repeat(60));
    console.log("🔵 [API] /api/analyze");
    console.log("   Files:", files.map((f) => f.name).join(", "));
    console.log("   Cost entries:", costMap?.size ?? 0);
    console.log("   Buyout orders:", buyoutByOrder?.size ?? 0);
    console.log("   User:", iaoUserId);
    console.log("=".repeat(60));

    const pipelineInput: ConsolidateInput = { files, costMap };
    const result = await consolidateAndAnalyze(pipelineInput);

    if (buyoutByOrder && buyoutByOrder.size > 0) {
      applyBuyoutEnrichment(result.report.orders, buyoutByOrder);
    }

    const { importId } = await saveImport({
      iaoUserId,
      report: result.report,
      analytics: result.analytics,
    });

    try {
      const { removed } = await enforceHistoryLimit(iaoUserId, HISTORY_LIMIT);
      if (removed.length) {
        console.log(`   История: удалено ${removed.length} старых импортов`);
      }
    } catch (err: any) {
      logger.warn("API", "Не удалось применить лимит истории", err);
    }

    const frontend = toFrontendAnalysis(result, {
      id: importId,
      fileName: displayFileName,
      fileSize: totalSize,
    });

    console.log("✅ [API] analyze done", {
      importId,
      orders: result.report.orders.length,
      success: result.analytics.summary.successOrders,
      returns:
        result.analytics.summary.fullReturnOrders + result.analytics.summary.partialReturnOrders,
      incomplete: result.analytics.summary.incompleteOrders,
    });

    return NextResponse.json(frontend);
  } catch (error: any) {
    logger.error("API", "Ошибка при анализе файла", error);
    return NextResponse.json(
      {
        error: "Ошибка анализа",
        message: error?.message || "Произошла ошибка при анализе файла",
      },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
//  Сбор входных данных
// ─────────────────────────────────────────────────────────────

interface CollectedInputs {
  files: SourceFile[];
  costMap?: Map<string, number>;
  buyoutByOrder?: Map<string, number>;
  displayFileName: string;
  totalSize: number;
}

async function collectInputs(
  request: NextRequest,
  isDemo: boolean
): Promise<CollectedInputs | { error: any; status: number }> {
  if (isDemo) {
    if (!fs.existsSync(DEMO_FILE_PATH)) {
      return {
        error: { error: "Демо-файл не найден", message: "Тестовый файл не найден в папке test/" },
        status: 404,
      };
    }
    const buffer = fs.readFileSync(DEMO_FILE_PATH);
    return {
      files: [{ name: path.basename(DEMO_FILE_PATH), buffer }],
      displayFileName: "Отчет по начислениям (demo)",
      totalSize: buffer.length,
    };
  }

  const formData = await request.formData();

  const files = formData.getAll("files") as File[];
  const singleFile = formData.get("file") as File | null;
  const toProcess: File[] = files.length > 0 ? files : singleFile ? [singleFile] : [];

  if (toProcess.length === 0) {
    return {
      error: { error: "Файл не загружен", message: "Необходимо загрузить хотя бы один файл" },
      status: 400,
    };
  }

  let totalSize = 0;
  const sources: SourceFile[] = [];
  for (const file of toProcess) {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
      return {
        error: {
          error: "Неверный формат",
          message: `Файл "${file.name}" не поддерживается (ожидаются .xlsx/.xls)`,
        },
        status: 400,
      };
    }
    if (file.size > MAX_FILE_SIZE) {
      return {
        error: {
          error: "Файл слишком большой",
          message: `Файл "${file.name}" превышает 20 MB`,
        },
        status: 400,
      };
    }
    totalSize += file.size;
    const ab = await file.arrayBuffer();
    sources.push({ name: file.name, buffer: Buffer.from(ab) });
  }

  const costFile = formData.get("costFile") as File | null;
  let costMap: Map<string, number> | undefined;
  if (costFile) {
    if (costFile.size > MAX_FILE_SIZE) {
      return {
        error: {
          error: "Файл себестоимости слишком большой",
          message: `Файл "${costFile.name}" превышает 20 MB`,
        },
        status: 400,
      };
    }
    totalSize += costFile.size;
    try {
      costMap = await parseCostFile(costFile);
    } catch (err: any) {
      logger.warn("API", "Ошибка парсинга файла себестоимости", err);
      costMap = undefined;
    }
  }

  if (totalSize > MAX_FILE_SIZE) {
    return {
      error: {
        error: "Общий размер файлов слишком большой",
        message: `Итого ${(totalSize / 1024 / 1024).toFixed(2)} MB > 20 MB`,
      },
      status: 400,
    };
  }

  const buyoutFiles = formData.getAll("buyoutFiles") as File[];
  let buyoutByOrder: Map<string, number> | undefined;
  if (buyoutFiles.length > 0) {
    buyoutByOrder = new Map<string, number>();
    for (const bf of buyoutFiles) {
      try {
        const result = await parseBuyoutReport(bf, bf.name);
        for (const [shipment, amount] of result.byShipment) {
          buyoutByOrder.set(shipment, (buyoutByOrder.get(shipment) || 0) + amount);
        }
      } catch (err: any) {
        logger.warn("API", `Ошибка парсинга выкупов ${bf.name}`, err);
      }
    }
  }

  const displayFileName =
    toProcess.length === 1 ? toProcess[0].name : `Объединённый отчёт (${toProcess.length} файлов)`;

  return {
    files: sources,
    costMap,
    buyoutByOrder,
    displayFileName,
    totalSize,
  };
}

// ─────────────────────────────────────────────────────────────
//  Обогащение выкупами (существующий поток, оставляем как есть)
// ─────────────────────────────────────────────────────────────

function applyBuyoutEnrichment(
  orders: any[],
  buyoutByOrder: Map<string, number>
): void {
  let enriched = 0;
  let addedRevenue = 0;
  for (const order of orders) {
    const key = order.orderKey;
    if (!key) continue;
    const amount = buyoutByOrder.get(key);
    if (amount == null || amount <= 0) continue;
    order.totals.revenue = (order.totals.revenue || 0) + amount;
    order.totalAmountRub = (order.totalAmountRub || 0) + amount;
    order.hasRevenue = true;
    if (!order.chargeTypes) order.chargeTypes = new Set<string>();
    order.chargeTypes.add("Выкуп (отчёт о выкупленных товарах)");
    if (order.classification === "incomplete") order.classification = "success";
    enriched += 1;
    addedRevenue += amount;
  }
  if (enriched) {
    console.log(
      `📦 [API] Обогащение выкупами: ${enriched} заказов, +${addedRevenue.toFixed(2)} ₽`
    );
  }
}
