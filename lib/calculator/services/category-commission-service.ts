/**
 * Сервис для работы с таблицей категорий и комиссий маркетплейса
 */

import prisma from "@/lib/db/prisma";
import type {
  CategoryCommissionRecord,
  CategoryCommissionSearchParams,
} from "@/lib/types/commissions";

/**
 * Нормализует строку категории (обрезка пробелов, приведение к одному регистру)
 */
function normalizeCategory(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim();
}

/**
 * Поиск записи комиссии по категории и типу размещения
 */
export async function findCategoryCommission(
  params: CategoryCommissionSearchParams
): Promise<CategoryCommissionRecord | null> {
  const { marketplace, categoryId, categoryName, fulfillment } = params;

  const normalizedName = normalizeCategory(categoryName);

  const whereOr: any[] = [];

  if (categoryId) {
    whereOr.push({
      categoryId,
    });
  }

  if (normalizedName) {
    whereOr.push(
      {
        categoryName: normalizedName,
      },
      {
        categoryPath: {
          contains: normalizedName,
        },
      }
    );
  }

  if (whereOr.length === 0) {
    return null;
  }

  const records = await prisma.categoryCommission.findMany({
    where: {
      marketplace,
      fulfillment,
      isActive: true,
      OR: whereOr,
    },
    orderBy: [
      { validFrom: "desc" },
      { createdAt: "desc" },
    ],
    take: 1,
  });

  if (!records.length) {
    return null;
  }

  return records[0] as any as CategoryCommissionRecord;
}

/**
 * Получить только процент комиссии (удобно для калькулятора)
 */
export async function getCategoryCommissionPercent(params: {
  marketplace: string;
  categoryId?: string;
  categoryName?: string;
  fulfillment: string;
}): Promise<number | null> {
  const record = await findCategoryCommission({
    marketplace: (params.marketplace as any) ?? "ozon",
    categoryId: params.categoryId,
    categoryName: params.categoryName,
    fulfillment: params.fulfillment,
  });

  return record ? record.commissionPercent : null;
}

