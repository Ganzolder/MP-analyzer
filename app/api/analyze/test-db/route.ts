import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/analyze/test-db
 * Тестовый endpoint для проверки сохранения в БД
 */
export async function GET(request: NextRequest) {
  try {
    // Проверка подключения
    await prisma.$connect();
    
    // Попытка создать тестовую запись
    const testId = `test-${Date.now()}`;
    const testReport = await prisma.report.create({
      data: {
        id: testId,
        fileName: "test-file.xlsx",
        fileSize: 0,
        filePath: "test",
        status: "completed",
        progress: 100,
        currentStep: "Test",
        analysisResults: JSON.stringify({ test: true }),
      },
    });
    
    // Удаляем тестовую запись
    await prisma.report.delete({
      where: { id: testId },
    });
    
    return NextResponse.json({
      success: true,
      message: "✅ База данных работает! Сохранение и удаление прошли успешно.",
      testId,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: error.toString(),
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
