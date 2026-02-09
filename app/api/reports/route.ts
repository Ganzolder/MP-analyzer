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
      console.log("📋 [API] Запрос списка отчётов из БД...");
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
      
      console.log(`✅ [API] Найдено отчётов: ${reports.length}`);
      if (reports.length > 0) {
        console.log("   Первый отчёт:", {
          id: reports[0].id,
          fileName: reports[0].fileName,
          createdAt: reports[0].createdAt,
        });
      }
      
      return NextResponse.json({
        success: true,
        data: reports,
        count: reports.length,
      });
    } catch (dbError: any) {
      console.error("❌ [API] Ошибка при получении отчётов из БД:");
      console.error("   Сообщение:", dbError.message);
      console.error("   Код:", dbError.code);
      console.error("   Детали:", dbError.toString());
      if (dbError.meta) {
        console.error("   Meta:", JSON.stringify(dbError.meta, null, 2));
      }
      if (process.env.NODE_ENV === "development") {
        console.error("   Stack:", dbError.stack);
      }
      return NextResponse.json({
        success: false,
        data: [],
        error: dbError.message,
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
