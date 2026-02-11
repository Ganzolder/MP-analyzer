/**
 * Типы для таблицы категорий и комиссий маркетплейса
 */

export type Marketplace = "ozon" | "wildberries" | "yandex-market";

export type FulfillmentType =
  | "fbo"
  | "fbs"
  | "rfbs"
  | "express"
  | "pickup"
  | "other";

export interface CategoryCommissionRecord {
  id: string;
  marketplace: Marketplace;
  categoryId?: string | null;
  categoryName: string;
  productType?: string | null;
  categoryPath?: string | null;
  fboUpTo100?: number | null;
  fbo100To300?: number | null;
  fbo300To500?: number | null;
  fbo500To1500?: number | null;
  fboOver1500?: number | null;
  fboFreshUpTo100?: number | null;
  fboFresh100To300?: number | null;
  fboFreshOver300?: number | null;
  fbsUpTo100?: number | null;
  fbs100To300?: number | null;
  fbsOver300?: number | null;
  rfbs?: number | null;
  minCommissionAmount?: number | null;
  fixedFeeAmount?: number | null;
  isActive: boolean;
  validFrom?: Date | null;
  validTo?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryCommissionSearchParams {
  marketplace: Marketplace;
  categoryId?: string;
  categoryName?: string;
  productType?: string;
}

