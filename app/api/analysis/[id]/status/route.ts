import { NextRequest, NextResponse } from "next/server";

// В реальной версии:
// import prisma from "@/lib/db/prisma";

/**
 * GET /api/analysis/[id]/status
 * Получение статуса обработки анализа
 * Используется для polling или SSE
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
    
    // TODO: В реальной версии получать из БД
    /*
    const report = await prisma.report.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        progress: true,
        currentStep: true,
        errorMessage: true,
      },
    });
    
    if (!report) {
      return NextResponse.json(
        { error: "Анализ не найден" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: report,
    });
    */
    
    // Mock: всегда возвращаем "completed"
    return NextResponse.json({
      success: true,
      data: {
        id,
        status: "completed",
        progress: 100,
        currentStep: "Завершено",
        error: null,
      },
    });
  } catch (error) {
    console.error("Get status error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении статуса" },
      { status: 500 }
    );
  }
}
