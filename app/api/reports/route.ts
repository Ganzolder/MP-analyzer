import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
// import { getServerSession } from "next-auth";

/**
 * GET /api/reports
 * Получение списка отчётов пользователя
 * ЗАГОТОВКА для будущей реализации
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: Проверка авторизации (пока получаем все отчёты)
    /*
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Требуется авторизация" },
        { status: 401 }
      );
    }
    */
    
    try {
      const reports = await prisma.report.findMany({
        // where: { userId: session.user.id }, // Раскомментировать после добавления авторизации
        orderBy: { createdAt: "desc" },
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
      
      return NextResponse.json({
        success: true,
        data: reports,
      });
    } catch (dbError: any) {
      console.error("Ошибка при получении отчётов:", dbError.message);
      return NextResponse.json({
        success: true,
        data: [],
        message: "Ошибка при получении отчётов из БД",
      });
    }
  } catch (error) {
    console.error("Get reports error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении отчётов" },
      { status: 500 }
    );
  }
}
