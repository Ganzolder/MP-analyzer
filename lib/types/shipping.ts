/**
 * Типы для тарифов перевозки
 */

export type Marketplace = "ozon" | "wildberries" | "yandex-market";

export type DeliveryType = "standard" | "express" | "economy" | "pickup";

export type DeliveryMethod = "fbo" | "fbs" | "dbs";

/**
 * Параметры для поиска тарифа
 */
export interface ShippingTariffSearchParams {
  marketplace: Marketplace;
  fromRegion?: string;
  toRegion?: string;
  fromCity?: string;
  toCity?: string;
  weight?: number; // граммы
  length?: number; // мм
  width?: number;  // мм
  height?: number; // мм
  volume?: number; // см³
  deliveryType?: DeliveryType;
  deliveryMethod?: DeliveryMethod;
  category?: string;
}

/**
 * Тариф перевозки
 */
export interface ShippingTariff {
  id: string;
  marketplace: Marketplace;
  fromRegion?: string;
  toRegion?: string;
  fromCity?: string;
  toCity?: string;
  deliveryType?: string;
  deliveryMethod?: string;
  weightMin?: number;
  weightMax?: number;
  weightStep?: number;
  lengthMin?: number;
  lengthMax?: number;
  widthMin?: number;
  widthMax?: number;
  heightMin?: number;
  heightMax?: number;
  volumeMin?: number;
  volumeMax?: number;
  basePrice: number;
  pricePerKg?: number;
  pricePerVolume?: number;
  pricePerKm?: number;
  minPrice?: number;
  maxPrice?: number;
  category?: string;
  isActive: boolean;
  priority: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Результат расчёта стоимости доставки
 */
export interface ShippingCostResult {
  tariff: ShippingTariff;
  basePrice: number;
  weightCost?: number;
  volumeCost?: number;
  distanceCost?: number;
  totalCost: number;
  calculationDetails: {
    weight?: number;
    volume?: number;
    distance?: number;
  };
}
