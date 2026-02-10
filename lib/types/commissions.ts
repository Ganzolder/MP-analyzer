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
  categoryPath?: string | null;
  fulfillment: FulfillmentType | string;
  commissionPercent: number;
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
  fulfillment: FulfillmentType | string;
}

