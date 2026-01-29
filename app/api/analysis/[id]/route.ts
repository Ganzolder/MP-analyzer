import { NextRequest, NextResponse } from "next/server";
import { getMockAnalysisResult } from "@/lib/mock/analysis-mock";

// В реальной версии:
// import prisma from "@/lib/db/prisma";

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
    
    // TODO: В реальной версии получать из БД
    /*
    const report = await prisma.report.findUnique({
      where: { id },
    });
    
    if (!report) {
      return NextResponse.json(
        { error: "Анализ не найден" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...report,
        analysisResults: JSON.parse(report.analysisResults || "{}"),
        aiInsights: JSON.parse(report.aiInsights || "{}"),
      },
    });
    */
    
    // Mock данные
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
    
    // TODO: В реальной версии удалять из БД
    /*
    await prisma.report.delete({
      where: { id },
    });
    */
    
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
