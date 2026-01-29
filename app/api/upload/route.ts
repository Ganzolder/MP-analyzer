import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { generateId } from "@/lib/utils";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "52428800"); // 50MB

/**
 * POST /api/upload
 * Загрузка и валидация XLS/XLSX файла
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: "Файл не предоставлен" },
        { status: 400 }
      );
    }
    
    // Валидация размера
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Файл слишком большой. Максимальный размер: 50MB" },
        { status: 400 }
      );
    }
    
    // Валидация типа файла
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    const allowedExtensions = [".xlsx", ".xls"];
    const fileExtension = path.extname(file.name).toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { error: "Неподдерживаемый формат файла. Разрешены только .xls и .xlsx" },
        { status: 400 }
      );
    }
    
    // Создание директории если не существует
    const uploadPath = path.resolve(UPLOAD_DIR);
    if (!existsSync(uploadPath)) {
      await mkdir(uploadPath, { recursive: true });
    }
    
    // Генерация уникального ID и имени файла
    const fileId = generateId();
    const safeFileName = `${fileId}${fileExtension}`;
    const filePath = path.join(uploadPath, safeFileName);
    
    // Сохранение файла
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);
    
    // Возврат метаданных
    return NextResponse.json({
      success: true,
      data: {
        fileId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        filePath: safeFileName,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке файла" },
      { status: 500 }
    );
  }
}

