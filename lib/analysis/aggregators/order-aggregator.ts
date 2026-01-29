/**
 * Агрегация заказов из строк начислений
 */

import { getChargeCategory } from "../constants";
import { round } from "../data-utils";
import type { ChargeRow, AggregatedOrder, OrderStatus } from "../types";

export class OrderAggregator {
  /**
   * Агрегирует строки начислений в заказы
   * Если в заказе несколько товаров, создает отдельные записи для каждого товара
   */
  aggregateOrders(
    chargeRows: ChargeRow[],
    periodEnd?: Date,
    periodStart?: Date
  ): AggregatedOrder[] {
    const orderMap = new Map<string, ChargeRow[]>();

    // Группируем строки по номеру заказа
    for (const row of chargeRows) {
      if (row.orderNumber) {
        if (!orderMap.has(row.orderNumber)) {
          orderMap.set(row.orderNumber, []);
        }
        orderMap.get(row.orderNumber)!.push(row);
      }
    }

    // Агрегируем каждый заказ
    const orders: AggregatedOrder[] = [];

    Array.from(orderMap.entries()).forEach(([orderNumber, rows]) => {
      // Проверяем, сколько уникальных товаров в заказе
      const products = new Map<string, ChargeRow[]>();
      
      for (const row of rows) {
        const productKey = (row.sku || row.article || "").trim();
        if (productKey) {
          if (!products.has(productKey)) {
            products.set(productKey, []);
          }
          products.get(productKey)!.push(row);
        } else {
          // Строки без SKU/артикула - это общие расходы, они не попадут в анализ по товарам
          // но будут учитываться в анализе по заказам
        }
      }
      
      // Если в заказе один товар, создаем один заказ
      // ВАЖНО: Для заказов с одним товаром учитываем ВСЕ строки, включая общие расходы
      // (общие расходы относятся к заказу в целом, а не к конкретному товару)
      if (products.size <= 1) {
        // Берем строки товара
        const productRows = Array.from(products.values())[0] || [];
        // И строки без товара (общие расходы) - они относятся к заказу в целом
        const commonExpenseRows = rows.filter(row => {
          const productKey = (row.sku || row.article || "").trim();
          return !productKey;
        });
        // Объединяем все строки для заказа с одним товаром
        const allRows = [...productRows, ...commonExpenseRows];
        const order = this.aggregateOrderRows(orderNumber, allRows, periodEnd, periodStart);
        orders.push(order);
      } else {
        // Если в заказе несколько товаров:
        // 1. Создаем отдельные записи заказов для каждого товара (без общих расходов)
        //    Это нужно для анализа по товарам - рентабельность без общих расходов заказа
        // 2. Общие расходы (строки с базовым ID без суффикса) НЕ учитываются в анализе по товарам
        
        // Проверяем, есть ли у товаров строки с суффиксом
        const productHasSuffix = new Map<string, boolean>();
        
        Array.from(products.entries()).forEach(([productKey, productRows]) => {
          if (productKey) {
            // Проверяем, есть ли хотя бы одна строка с суффиксом (содержит "-" после номера заказа)
            const hasSuffix = productRows.some(row => {
              const chargeId = row.chargeId || "";
              // ID с суффиксом: например, "24404639-0200-2", "24404639-0200-1"
              // Базовый ID: "24404639-0200" (без второго дефиса с числом)
              return /^\d+-\d+-\d+/.test(chargeId);
            });
            productHasSuffix.set(productKey, hasSuffix);
          }
        });
        
        // Создаем отдельные записи заказов для каждого товара (для анализа по товарам)
        // ВАЖНО: Учитываем ВСЕ строки товара, включая базовый ID (например, эквайринг 24404639-0200 для товара 1828949844)
        // Только строки БЕЗ SKU/артикула/наименования (общие расходы) не учитываются
        Array.from(products.entries()).forEach(([productKey, productRows]) => {
          if (!productKey) return; // Пропускаем строки без товара (общие расходы)
          
          // Проверяем, есть ли у этого товара строки с суффиксом
          const hasSuffix = productRows.some(row => {
            const chargeId = row.chargeId || "";
            return /^\d+-\d+-\d+/.test(chargeId); // ID содержит суффикс
          });
          
          let filteredRows: ChargeRow[];
          
          if (hasSuffix) {
            // Если у товара есть строки с суффиксом (-1, -2 и т.д.), то:
            // 1. Берем все строки с суффиксом для этого товара
            // 2. Берем строки с базовым ID (без суффикса), если у них есть SKU/артикул этого товара
            const rowsWithSuffix = productRows.filter(row => {
              const chargeId = row.chargeId || "";
              return /^\d+-\d+-\d+/.test(chargeId); // ID содержит суффикс
            });
            
            // Строки с базовым ID, которые имеют SKU/артикул этого товара (например, эквайринг)
            const rowsWithBaseId = rows.filter(row => {
              const chargeId = row.chargeId || "";
              const hasNoSuffix = /^\d+-\d+$/.test(chargeId); // Базовый ID без суффикса (только 2 части через дефис)
              const matchesProduct = (row.sku || row.article || "").trim() === productKey;
              return hasNoSuffix && matchesProduct;
            });
            
            filteredRows = [...rowsWithSuffix, ...rowsWithBaseId];
          } else {
            // Если суффиксов нет, берем все строки товара (включая базовый ID)
            filteredRows = [...productRows];
          }
          
          // Создаем запись заказа для товара (с его начислениями, но без общих расходов заказа)
          const order = this.aggregateOrderRows(orderNumber, filteredRows, periodEnd, periodStart);
          orders.push(order);
        });
      }
    });

    // Сортируем по дате
    orders.sort((a, b) => b.chargeDate.getTime() - a.chargeDate.getTime());

    return orders;
  }

  private aggregateOrderRows(
    orderNumber: string,
    rows: ChargeRow[],
    periodEnd?: Date,
    periodStart?: Date
  ): AggregatedOrder {
    let article = "";
    let sku = "";
    let productName = "";
    let quantity = 0;
    let sellerPrice = 0;
    let platform = "";
    let workScheme = "";
    let orderDate: Date | null = null;
    let chargeDate = new Date();

    let totalAmountRub = 0;
    let revenueAmount = 0;
    let pointsAmount = 0;
    let commissionAmount = 0;
    let logisticsAmount = 0;
    let returnLogisticsAmount = 0;
    let acquiringAmount = 0;
    let otherAmount = 0;

    // Количество товара: суммируем из строк "Выручка" и вычитаем из строк "Возврат выручки"
    let revenueQuantity = 0;      // Количество из строк с типом "Выручка"
    let returnRevenueQuantity = 0; // Количество из строк с типом "Возврат выручки"

    const chargeTypes: string[] = [];
    let hasReturnType = false;
    let hasPartialReturnType = false;

    for (const row of rows) {
      // Заполняем пустые поля
      if (!article && row.article && row.article.trim().length > 0) {
        article = row.article.trim();
      }
      if (!sku && row.sku && row.sku.trim().length > 0) {
        sku = row.sku.trim();
      }
      if (!productName && row.productName && row.productName.trim().length > 0) {
        productName = row.productName.trim();
      }
      // Количество теперь считается по типам начислений (см. ниже в switch)
      if (row.sellerPrice > 0) sellerPrice = Math.max(sellerPrice, row.sellerPrice);
      if (!platform && row.platform) platform = row.platform;
      if (!workScheme && row.workScheme) workScheme = row.workScheme;
      if (!orderDate && row.orderDate) orderDate = row.orderDate;
      if (row.chargeDate) chargeDate = row.chargeDate;

      const amount = row.totalAmount;
      const category = getChargeCategory(row.chargeType);

      totalAmountRub += amount;

      switch (category) {
        case "revenue":
          revenueAmount += amount;
          // Суммируем количество из строк с типом "Выручка"
          if (row.quantity > 0) {
            revenueQuantity += row.quantity;
          }
          break;
        case "points":
          pointsAmount += amount;
          break;
        case "commission":
          commissionAmount += amount;
          break;
        case "logistics":
          logisticsAmount += amount;
          break;
        case "returnLogistics":
          returnLogisticsAmount += amount;
          hasReturnType = true;
          break;
        case "returnRevenue":
          // Возврат выручки должен уменьшать выручку (иначе невозможно корректно определить partial_return)
          hasReturnType = true;
          revenueAmount += amount; // amount обычно отрицательный
          // Суммируем количество из строк с типом "Возврат выручки" (для вычитания из итогового количества)
          if (row.quantity > 0) {
            returnRevenueQuantity += row.quantity;
          }
          break;
        case "returnCommission":
        case "returnProcessing":
          // Возврат комиссии/обработка возвратов относим к прочим удержаниям
          // (в этом модуле комиссии/логистика хранятся как абсолютные значения, поэтому сюда не кладем,
          // чтобы не исказить детализацию)
          hasReturnType = true;
          otherAmount += amount;
          break;
        case "partialReturn":
          hasPartialReturnType = true;
          otherAmount += amount;
          break;
        case "acquiring":
          acquiringAmount += amount;
          break;
        default:
          otherAmount += amount;
      }

      if (row.chargeType && !chargeTypes.includes(row.chargeType)) {
        chargeTypes.push(row.chargeType);
      }
    }

    // Итоговое количество = количество из "Выручка" минус количество из "Возврат выручки"
    // Если есть строки с типом "Выручка" или "Возврат выручки", используем их для расчета
    // ВАЖНО: Если в файле только возврат (нет строк "Выручка"), то quantity может быть отрицательным
    // Это нормально - при мердже с файлом продажи оно правильно вычтется
    if (revenueQuantity > 0 || returnRevenueQuantity > 0) {
      quantity = revenueQuantity - returnRevenueQuantity;
      // НЕ обнуляем отрицательное количество - оно нужно для правильного мерджа
      // (если в одном файле продажа, а в другом только возврат)
    } else {
      // Если нет строк с типом "Выручка" или "Возврат выручки", 
      // используем максимальное количество из всех строк (старая логика для обратной совместимости)
      quantity = 0;
      for (const row of rows) {
        if (row.quantity > 0) {
          quantity = Math.max(quantity, row.quantity);
        }
      }
    }

    const grossRevenue = revenueAmount + pointsAmount;
    
    // Определяем отмененные заказы: выручка = 0 и есть эквайринг (клиент оплатил и отменил)
    // Проверяем, есть ли строки с эквайрингом (положительные и отрицательные)
    const hasAcquiringCharges = rows.some(row => {
      const category = getChargeCategory(row.chargeType);
      return category === "acquiring";
    });
    
    // Проверяем, есть ли эквайринг с разными знаками (положительный и отрицательный)
    let hasPositiveAcquiring = false;
    let hasNegativeAcquiring = false;
    for (const row of rows) {
      const category = getChargeCategory(row.chargeType);
      if (category === "acquiring") {
        if (row.totalAmount > 0) {
          hasPositiveAcquiring = true;
        } else if (row.totalAmount < 0) {
          hasNegativeAcquiring = true;
        }
      }
    }
    
    // Двойной эквайринг (положительный и отрицательный) - признак отмены заказа
    // ВАЖНО: Если есть и положительный, и отрицательный эквайринг, это отмененный заказ
    const hasDoubleAcquiring = hasPositiveAcquiring && hasNegativeAcquiring;
    
    // Улучшенная логика определения возврата:
    // Если есть типы начислений возврата (Обратная логистика, Обработка возвратов Ozon и т.д.)
    // И двойной эквайринг (положительный и отрицательный) - это явный признак полного возврата
    // То заказ считается возвращенным
    const isFullReturn = hasReturnType && hasDoubleAcquiring;
    
    // Если есть только типы возврата без двойного эквайринга, тоже считаем возвратом
    // (двойной эквайринг - дополнительный признак, но не обязательный)
    const isReturnByTypes = hasReturnType && !hasDoubleAcquiring;
    
    // Определяем отмененные заказы: двойной эквайринг (положительный и отрицательный),
    // выручка = 0, totalAmountRub = 0 (или близок к 0), и нет возвратов
    // ВАЖНО: Если есть возвраты, это не отмена, а возврат
    // Если только двойной эквайринг и totalAmountRub = 0 - это отмененный заказ
    const isCancelled = grossRevenue === 0 &&
      hasAcquiringCharges &&
      hasDoubleAcquiring &&
      !hasReturnType &&
      !hasPartialReturnType &&
      (Math.abs(totalAmountRub) < 0.01); // totalAmountRub близок к 0
    
    // Определяем заказы "в работе": только эквайринг, выручка = 0, дата близка к концу периода
    // Это заказы, где клиент оплатил, но отгрузка/дальнейшие действия уходят в следующий период
    const hasOnlyAcquiring = rows.every(row => {
      const category = getChargeCategory(row.chargeType);
      return category === "acquiring";
    });
    
    // Проверяем, близка ли дата заказа к концу периода (последние 3 дня)
    let isNearPeriodEnd = false;
    if (periodEnd && chargeDate) {
      const daysDiff = Math.floor((periodEnd.getTime() - chargeDate.getTime()) / (1000 * 60 * 60 * 24));
      isNearPeriodEnd = daysDiff >= 0 && daysDiff <= 3;
    }
    
    // Заказ "в работе": только эквайринг, выручка = 0, дата близка к концу периода
    // ВАЖНО: НЕ должен быть двойной эквайринг (положительный и отрицательный) - это отмененный заказ
    const isInProgress = grossRevenue === 0 &&
      hasOnlyAcquiring &&
      !hasDoubleAcquiring && // Исключаем двойной эквайринг (отмененные заказы)
      !hasReturnType &&
      !hasPartialReturnType &&
      isNearPeriodEnd;
    
    let status: OrderStatus = "completed";
    // Проверяем статусы в правильном порядке: сначала отмененные, потом "в работе", потом возвраты
    // ВАЖНО: Заказы с двойным эквайрингом (положительный и отрицательный) - это отмененные заказы,
    // даже если дата близка к концу периода
    if (isCancelled) {
      status = "cancelled";
    } else if (isInProgress) {
      status = "in_progress";
    } else if (hasPartialReturnType) {
      // Частичный невыкуп: если количество товаров после возвратов = 0, то это полный возврат
      status = quantity === 0 ? "returned" : "partial_return";
    } else if (isFullReturn || isReturnByTypes) {
      // Возвраты:
      // - если количество товаров после всех возвратов = 0 => полный возврат
      // - если количество > 0 => частичный возврат
      // ВАЖНО: Проверяем quantity, а не revenueAmount, так как выручка может быть положительной,
      // но все товары возвращены (например, из-за баллов за скидки)
      if (quantity === 0) {
        status = "returned";
      } else if (revenueAmount > 0) {
        status = "partial_return";
      } else {
        status = "returned";
      }
    }
    const totalFees = Math.abs(commissionAmount) +
      Math.abs(logisticsAmount) +
      Math.abs(returnLogisticsAmount) +
      Math.abs(acquiringAmount) +
      Math.abs(otherAmount < 0 ? otherAmount : 0);

    // Определяем заказы из прошлого периода: заказ создан до начала текущего периода
    // и есть начисления кроме эквайринга (не все начисления в текущем периоде)
    const hasNonAcquiringCharges = rows.some(row => {
      const category = getChargeCategory(row.chargeType);
      return category !== "acquiring";
    });
    
    const isFromPreviousPeriod = periodStart && orderDate && 
      orderDate < periodStart &&
      hasNonAcquiringCharges;

    return {
      orderNumber,
      status,
      article,
      sku,
      productName: productName || "Неизвестный товар",
      quantity,
      sellerPrice,
      totalAmountRub: round(totalAmountRub),
      revenueAmount: round(revenueAmount),
      pointsAmount: round(pointsAmount),
      grossRevenue: round(grossRevenue),
      commissionAmount: round(Math.abs(commissionAmount)),
      logisticsAmount: round(Math.abs(logisticsAmount)),
      acquiringAmount: round(Math.abs(acquiringAmount)),
      returnAmount: round(Math.abs(returnLogisticsAmount)),
      otherFeesAmount: round(Math.abs(otherAmount < 0 ? otherAmount : 0)),
      totalFees: round(totalFees),
      platform,
      workScheme,
      orderDate,
      chargeDate,
      chargesCount: rows.length,
      chargeTypes,
      isFromPreviousPeriod: isFromPreviousPeriod || false,
    };
  }
}
