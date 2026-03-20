import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/category-commissions/rates
 * Получение ставок комиссии по productType или categoryName.
 * Параметры:
 *   - type: "productType" | "category"
 *   - value: значение (например "Шины для легковых автомобилей")
 *   - marketplace: маркетплейс (по умолчанию "ozon")
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "productType";
    const value = searchParams.get("value") || "";
    const marketplace = (searchParams.get("marketplace") || "ozon").toLowerCase();

    if (!value) {
      return NextResponse.json({
        success: false,
        error: "Параметр value обязателен",
        data: null,
      }, { status: 400 });
    }

    // Ищем запись в базе
    let record;

    if (type === "productType") {
      record = await prisma.categoryCommission.findFirst({
        where: {
          marketplace,
          isActive: true,
          productType: value,
        },
        select: {
          categoryName: true,
          productType: true,
          categoryPath: true,
          fboUpTo100: true,
          fbo100To300: true,
          fbo300To500: true,
          fbo500To1500: true,
          fboOver1500: true,
          fboFreshUpTo100: true,
          fboFresh100To300: true,
          fboFreshOver300: true,
          fbsUpTo100: true,
          fbs100To300: true,
          fbsOver300: true,
          rfbs: true,
        },
      });
    } else {
      // Поиск по categoryName
      record = await prisma.categoryCommission.findFirst({
        where: {
          marketplace,
          isActive: true,
          categoryName: value,
        },
        select: {
          categoryName: true,
          productType: true,
          categoryPath: true,
          fboUpTo100: true,
          fbo100To300: true,
          fbo300To500: true,
          fbo500To1500: true,
          fboOver1500: true,
          fboFreshUpTo100: true,
          fboFresh100To300: true,
          fboFreshOver300: true,
          fbsUpTo100: true,
          fbs100To300: true,
          fbsOver300: true,
          rfbs: true,
        },
      });
    }

    if (!record) {
      return NextResponse.json({
        success: false,
        error: `Комиссия не найдена для ${type}: "${value}"`,
        data: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        categoryName: record.categoryName,
        productType: record.productType,
        categoryPath: record.categoryPath,
        rates: {
          fbo: {
            upTo100: record.fboUpTo100,
            from100to300: record.fbo100To300,
            from300to500: record.fbo300To500,
            from500to1500: record.fbo500To1500,
            over1500: record.fboOver1500,
          },
          fboFresh: {
            upTo100: record.fboFreshUpTo100,
            from100to300: record.fboFresh100To300,
            over300: record.fboFreshOver300,
          },
          fbs: {
            upTo100: record.fbsUpTo100,
            from100to300: record.fbs100To300,
            over300: record.fbsOver300,
          },
          rfbs: record.rfbs,
        },
      },
    });
  } catch (error: any) {
    console.error("❌ [API] Ошибка при получении ставок комиссии:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Ошибка при получении ставок комиссии",
        data: null,
      },
      { status: 500 }
    );
  }
}
