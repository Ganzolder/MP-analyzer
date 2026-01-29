/**
 * Утилита для конвертации XLSX -> XLS через Python скрипт
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import { logger } from "@/lib/utils/logger";

const execAsync = promisify(exec);

/**
 * Конвертирует XLSX файл в XLS с декодированием KOI-7 через Python скрипт
 * @param buffer - Буфер с содержимым XLSX файла
 * @returns Буфер с содержимым XLS файла
 */
export async function convertXlsxToXls(buffer: Buffer): Promise<Buffer> {
  const pythonScript = path.join(
    process.cwd(),
    "python-service",
    "convert_and_decode.py"
  );

  if (!fs.existsSync(pythonScript)) {
    logger.warn("Converter", "Python скрипт не найден, пропускаем конвертацию");
    return buffer; // Возвращаем оригинал, если скрипт не найден
  }

  try {
    // Создаем временный файл для ввода
    const tempInput = path.join(
      process.cwd(),
      "temp",
      `input_${Date.now()}.xlsx`
    );
    const tempOutput = path.join(
      process.cwd(),
      "temp",
      `output_${Date.now()}.xls`
    );

    // Создаем папку temp если её нет
    const tempDir = path.dirname(tempInput);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Записываем входной файл
    fs.writeFileSync(tempInput, buffer);

    // Выполняем Python скрипт
    const pythonCmd = `python "${pythonScript}" "${tempInput}" "${tempOutput}"`;
    logger.debug("Converter", "Запуск Python скрипта", { cmd: pythonCmd });

    const { stdout, stderr } = await execAsync(pythonCmd, {
      maxBuffer: 10 * 1024 * 1024, // 10MB буфер
      encoding: "utf8",
    });

    if (stderr && !stderr.includes("warning")) {
      logger.warn("Converter", "Python скрипт вернул предупреждения", { stderr });
    }

    // Читаем результат
    if (!fs.existsSync(tempOutput)) {
      throw new Error("Output file was not created");
    }

    const outputBuffer = fs.readFileSync(tempOutput);

    // Удаляем временные файлы
    try {
      fs.unlinkSync(tempInput);
      fs.unlinkSync(tempOutput);
    } catch (cleanupError) {
      console.warn("[Converter] Failed to cleanup temp files:", cleanupError);
    }

    logger.success("Converter", "Конвертация завершена", {
      original: `${(buffer.length / 1024).toFixed(2)} KB`,
      converted: `${(outputBuffer.length / 1024).toFixed(2)} KB`,
    });
    return outputBuffer;
  } catch (error: any) {
    logger.error("Converter", "Ошибка конвертации", error);
    // В случае ошибки возвращаем оригинальный буфер
    return buffer;
  }
}
