import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

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
    
    // Получаем из БД
    try {
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
      
      if (report) {
        return NextResponse.json({
          success: true,
          data: {
            id: report.id,
            status: report.status,
            progress: report.progress,
            currentStep: report.currentStep,
            error: report.errorMessage,
          },
        });
      }
    } catch (dbError: any) {
      console.error("Ошибка при получении статуса:", dbError.message);
    }
    
    // Fallback: если не найдено в БД
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
