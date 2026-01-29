/**
 * Обработка файлов для анализа
 */

import * as fs from "fs";
import * as path from "path";
import { parseCostFile } from "@/lib/analysis/cost-parser";
import { logger } from "@/lib/utils/logger";

const DEMO_FILE_PATH = path.join(process.cwd(), "test", "Отчет по начислениям_01.10.2025-31.10.2025 (2).xlsx");

export interface ProcessedFiles {
  filesToProcess: File[];
  costData?: Map<string, number>;
  fileName: string;
  analysisId: string;
}

export class FileProcessor {
  /**
   * Обрабатывает файлы из запроса (демо или обычный режим)
   */
  async processRequestFiles(
    request: Request,
    isDemo: boolean
  ): Promise<ProcessedFiles> {
    if (isDemo) {
      return this.processDemoFile(request);
    } else {
      return this.processRegularFiles(request);
    }
  }

  private async processDemoFile(request: Request): Promise<ProcessedFiles> {
    if (!fs.existsSync(DEMO_FILE_PATH)) {
      throw new Error("Демо-файл не найден");
    }

    const body = await request.json().catch(() => ({}));
    const analysisId = body.analysisId || this.generateId();
    const fileName = "Отчет по начислениям_01.10.2025-31.10.2025 (demo).xlsx";

    // В демо-режиме создаем File объект из буфера
    const buffer = fs.readFileSync(DEMO_FILE_PATH);
    const file = new File([buffer], fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    return {
      filesToProcess: [file],
      costData: undefined,
      fileName,
      analysisId,
    };
  }

  private async processRegularFiles(request: Request): Promise<ProcessedFiles> {
    const formData = await request.formData();

    const files = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;
    const filesToProcess = files.length > 0 ? files : (singleFile ? [singleFile] : []);

    const costFile = formData.get("costFile") as File | null;
    const analysisId = formData.get("analysisId") as string || this.generateId();

    if (filesToProcess.length === 0) {
      throw new Error("Файл не загружен");
    }

    // Проверяем типы файлов
    for (const file of filesToProcess) {
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
        throw new Error(`Файл "${file.name}" имеет неподдерживаемый формат. Поддерживаются только .xlsx и .xls файлы`);
      }
    }

    const fileName = filesToProcess.length === 1
      ? filesToProcess[0].name
      : `Объединённый отчёт (${filesToProcess.length} файлов)`;

    // Парсим файл себестоимости
    let costData: Map<string, number> | undefined;
    if (costFile) {
      try {
        costData = await parseCostFile(costFile);
        logger.info("API", `Файл себестоимости обработан: ${costData.size} записей`);
      } catch (error: any) {
        logger.warn("API", "Ошибка при парсинге файла себестоимости", error);
        costData = undefined;
      }
    }

    return {
      filesToProcess,
      costData,
      fileName,
      analysisId,
    };
  }

  private generateId(): string {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
