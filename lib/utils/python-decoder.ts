/**
 * Утилита для декодирования Excel файлов через Python-скрипт
 * Использует Python-скрипт для чтения Excel и декодирования KOI-7
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

interface DecodedExcelData {
  sheet_name: string;
  rows: any[][];
  error?: string;
}

/**
 * Декодирует Excel файл через Python-скрипт
 * 
 * @param filePath Путь к Excel файлу
 * @returns Декодированные данные
 */
export async function decodeExcelWithPython(filePath: string): Promise<DecodedExcelData> {
  const pythonScriptPath = path.join(
    process.cwd(),
    "python-service",
    "decode_excel.py"
  );

  try {
    // Вызываем Python-скрипт
    const { stdout, stderr } = await execAsync(
      `python "${pythonScriptPath}" "${filePath}"`,
      {
        maxBuffer: 10 * 1024 * 1024, // 10MB буфер для больших файлов
        encoding: "utf-8" as BufferEncoding,
      }
    );

    if (stderr) {
      console.warn("[PythonDecoder] stderr:", stderr);
    }

    // Парсим JSON из stdout
    const decodedData = JSON.parse(stdout) as DecodedExcelData;

    if (decodedData.error) {
      throw new Error(`Python script error: ${decodedData.error}`);
    }

    return decodedData;
  } catch (error: any) {
    // Если ошибка парсинга JSON, выводим stdout для отладки
    if (error.code === "ENOENT") {
      throw new Error(
        "Python не найден. Убедитесь, что Python установлен и доступен в PATH."
      );
    }
    throw new Error(`Ошибка при декодировании через Python: ${error.message}`);
  }
}

/**
 * Декодирует Excel файл из Buffer через Python-скрипт
 * Сохраняет Buffer во временный файл, вызывает Python, затем удаляет файл
 * 
 * @param fileBuffer Buffer с содержимым Excel файла
 * @returns Декодированные данные
 */
export async function decodeExcelBufferWithPython(
  fileBuffer: Buffer
): Promise<DecodedExcelData> {
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(
    tempDir,
    `ozon-excel-${Date.now()}-${Math.random().toString(36).substring(7)}.xlsx`
  );

  try {
    // Сохраняем Buffer во временный файл
    await fs.writeFile(tempFilePath, fileBuffer);

    // Декодируем через Python
    const result = await decodeExcelWithPython(tempFilePath);

    return result;
  } finally {
    // Удаляем временный файл
    try {
      await fs.unlink(tempFilePath);
    } catch (error) {
      console.warn(`[PythonDecoder] Не удалось удалить временный файл: ${tempFilePath}`, error);
    }
  }
}
