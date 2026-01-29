import { NextRequest, NextResponse } from "next/server";

// TODO: В реальной версии:
// import prisma from "@/lib/db/prisma";
// import { getServerSession } from "next-auth";

/**
 * GET /api/reports
 * Получение списка отчётов пользователя
 * ЗАГОТОВКА для будущей реализации
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: Проверка авторизации
    /*
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Требуется авторизация" },
        { status: 401 }
      );
    }
    
    const reports = await prisma.report.findMany({
      where: { userId: session.user.id },
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
    */
    
    // Mock: пустой список
    return NextResponse.json({
      success: true,
      data: [],
      message: "Функция истории отчётов будет доступна после авторизации",
    });
  } catch (error) {
    console.error("Get reports error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении отчётов" },
      { status: 500 }
    );
  }
}
