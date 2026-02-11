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
  const { marketplace, categoryId, categoryName, productType } = params;

  const normalizedName = normalizeCategory(categoryName);
  const normalizedProductType = normalizeCategory(productType);

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
  if (normalizedProductType) {
    whereOr.push({
      productType: normalizedProductType,
    });
  }

  if (whereOr.length === 0) {
    return null;
  }

  const records = await prisma.categoryCommission.findMany({
    where: {
      marketplace,
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
  productType?: string;
  fulfillment: "fbo" | "fbs" | "rfbs" | "fbo_fresh" | string;
  itemPrice?: number;
}): Promise<number | null> {
  const record = await findCategoryCommission({
    marketplace: (params.marketplace as any) ?? "ozon",
    categoryId: params.categoryId,
    categoryName: params.categoryName,
    productType: params.productType,
  });

  if (!record) return null;

  const price = params.itemPrice ?? 0;
  const fulfillment = params.fulfillment.toLowerCase();

  if (fulfillment === "rfbs") {
    return record.rfbs ?? null;
  }
  if (fulfillment === "fbo_fresh") {
    if (price <= 100) return record.fboFreshUpTo100 ?? null;
    if (price <= 300) return record.fboFresh100To300 ?? null;
    return record.fboFreshOver300 ?? null;
  }
  if (fulfillment === "fbo") {
    if (price <= 100) return record.fboUpTo100 ?? null;
    if (price <= 300) return record.fbo100To300 ?? null;
    if (price <= 500) return record.fbo300To500 ?? null;
    if (price <= 1500) return record.fbo500To1500 ?? null;
    return record.fboOver1500 ?? null;
  }
  if (fulfillment === "fbs") {
    if (price <= 100) return record.fbsUpTo100 ?? null;
    if (price <= 300) return record.fbs100To300 ?? null;
    return record.fbsOver300 ?? null;
  }

  return null;
}

