import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

/**
 * GET /api/reports/check
 * Проверка сохранённых отчётов (для диагностики)
 */
export async function GET(request: NextRequest) {
  try {
    // Проверка подключения
    await prisma.$connect();
    
    // Подсчёт всех отчётов
    const totalCount = await prisma.report.count();
    
    // Получение последних 5 отчётов
    const lastReports = await prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        status: true,
        createdAt: true,
        totalOrders: true,
        totalRevenue: true,
        netProfit: true,
      },
    });
    
    // Проверка структуры таблицы
    const sampleReport = await prisma.report.findFirst({
      select: {
        id: true,
        fileName: true,
        status: true,
        createdAt: true,
      },
    });
    
    return NextResponse.json({
      success: true,
      totalCount,
      lastReports,
      sampleReport,
      message: totalCount > 0 
        ? `✅ Найдено ${totalCount} отчётов в БД`
        : "⚠️ В БД пока нет отчётов",
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
