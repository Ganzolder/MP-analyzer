import { NextRequest, NextResponse } from "next/server";
import { getMockAnalysisResult } from "@/lib/mock/analysis-mock";

// TODO: В реальной версии использовать xlsx библиотеку для генерации
// import * as XLSX from "xlsx";

/**
 * GET /api/export/xlsx/[id]
 * Генерация и скачивание XLSX файла
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
    
    // Получаем данные анализа
    const analysisResult = getMockAnalysisResult(id);
    
    // TODO: В реальной версии генерировать XLSX
    /*
    // Создание workbook
    const wb = XLSX.utils.book_new();
    
    // Лист с метриками
    const summaryData = [
      ["Метрика", "Значение"],
      ["Выручка", analysisResult.summary.totalRevenue],
      ["Чистая прибыль", analysisResult.summary.netProfit],
      ["Маржинальность %", analysisResult.summary.marginPercent],
      ["Количество заказов", analysisResult.summary.totalOrders],
      // ... остальные метрики
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Сводка");
    
    // Лист с товарами
    const productsData = analysisResult.topProducts.map(p => ({
      SKU: p.sku,
      "Название": p.name,
      "Выручка": p.revenue,
      "Прибыль": p.profit,
      "Маржа %": p.margin,
      "Заказов": p.orders,
      "% возврата": p.returnRate,
    }));
    const wsProducts = XLSX.utils.json_to_sheet(productsData);
    XLSX.utils.book_append_sheet(wb, wsProducts, "Товары");
    
    // Генерация буфера
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    
    // Возврат файла
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ozon-report-${id}.xlsx"`,
      },
    });
    */
    
    // Mock: возвращаем пустой ответ (в UI показывается toast)
    return NextResponse.json({
      success: true,
      message: "XLSX генерация пока в разработке",
    });
  } catch (error) {
    console.error("Export XLSX error:", error);
    return NextResponse.json(
      { error: "Ошибка при генерации XLSX" },
      { status: 500 }
    );
  }
}
