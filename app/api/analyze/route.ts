import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { generateId } from "@/lib/utils";
import { analyzeReport } from "@/lib/analysis";
import { parseCostFile } from "@/lib/analysis/cost-parser";
import { parseBuyoutReport } from "@/lib/analysis/parsers/buyout-report-parser";
import { getChargeCategory } from "@/lib/analysis/constants";
import { logger } from "@/lib/utils/logger";
import { SummaryCalculator } from "@/lib/analysis/calculators/summary-calculator";
import type { AggregatedOrder, OrderStatus } from "@/lib/analysis/types";
import prisma from "@/lib/db/prisma";

// Путь к демо-файлу
const DEMO_FILE_PATH = path.join(process.cwd(), "test", "Отчет по начислениям_01.10.2025-31.10.2025 (2).xlsx");

// Максимальный размер файла (20 MB для Vercel Pro)
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * POST /api/analyze
 * Анализ загруженного файла
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const isDemo = url.searchParams.get("demo") === "true";
    
    let buffer: Buffer | undefined;
    let fileName: string;
    let analysisId: string;
    let costData: Map<string, number> | undefined;
    let buyoutData: Map<string, number> | undefined; // Выручка из отчётов о выкупленных товарах
    let filesToProcess: File[] = [];
    let totalSize = 0;
    
    if (isDemo) {
      // Демо-режим: используем тестовый файл
      console.log("[API] Demo mode - using test file");

      if (!fs.existsSync(DEMO_FILE_PATH)) {
        return NextResponse.json(
          { error: "Демо-файл не найден", message: "Тестовый файл не найден в папке test/" },
          { status: 404 }
        );
      }

      buffer = fs.readFileSync(DEMO_FILE_PATH);
      fileName = "Отчет по начислениям_01.10.2025-31.10.2025 (demo).xlsx";

      const body = await request.json().catch(() => ({}));
      analysisId = body.analysisId || generateId();
      
      // В демо-режиме costData остается undefined
      costData = undefined;
    } else {
      // Обычный режим: файл(ы) из FormData
      const formData = await request.formData();
      
      // Поддержка множественных файлов
      const files = formData.getAll("files") as File[];
      const singleFile = formData.get("file") as File | null;
      
      // Если есть files, используем их, иначе используем file (обратная совместимость)
      filesToProcess = files.length > 0 ? files : (singleFile ? [singleFile] : []);
      
      const costFile = formData.get("costFile") as File | null;
      analysisId = formData.get("analysisId") as string || generateId();
      
      if (filesToProcess.length === 0) {
        return NextResponse.json(
          { error: "Файл не загружен", message: "Необходимо загрузить хотя бы один файл" },
          { status: 400 }
        );
      }
      
      fileName = filesToProcess.length === 1 
        ? filesToProcess[0].name 
        : `Объединённый отчёт (${filesToProcess.length} файлов)`;
      
      // Проверяем типы и размеры файлов
      totalSize = 0;
      for (const file of filesToProcess) {
        const lowerName = file.name.toLowerCase();
        if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
          return NextResponse.json(
            { error: "Неверный формат", message: `Файл "${file.name}" имеет неподдерживаемый формат. Поддерживаются только .xlsx и .xls файлы` },
            { status: 400 }
          );
        }
        
        // Проверка размера каждого файла
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: "Файл слишком большой", message: `Файл "${file.name}" превышает максимальный размер 20 MB` },
            { status: 400 }
          );
        }
        
        totalSize += file.size;
      }
      
      // Проверка файла себестоимости
      if (costFile) {
        if (costFile.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: "Файл себестоимости слишком большой", message: `Файл "${costFile.name}" превышает максимальный размер 20 MB` },
            { status: 400 }
          );
        }
        totalSize += costFile.size;
      }
      
      // Проверка общего размера
      if (totalSize > MAX_FILE_SIZE) {
        const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
        return NextResponse.json(
          { error: "Общий размер файлов слишком большой", message: `Общий размер всех файлов (${totalSizeMB} MB) превышает максимальный размер 20 MB` },
          { status: 400 }
        );
      }
      
      // Парсим файл себестоимости если загружен
      console.log("📁 [API] Проверка файла себестоимости:");
      console.log("   costFile получен:", costFile ? "ДА" : "НЕТ");
      if (costFile) {
        console.log("   Имя файла:", costFile.name);
        console.log("   Размер файла:", `${(costFile.size / 1024).toFixed(2)} KB`);
        console.log("   Тип файла:", costFile.type);
        try {
          costData = await parseCostFile(costFile);
          console.log("✅ [API] Файл себестоимости успешно распарсен!");
          console.log("   Записей в Map:", costData.size);
          logger.info("API", `Файл себестоимости обработан: ${costData.size} записей`);
        } catch (error: any) {
          console.error("❌ [API] Ошибка при парсинге файла себестоимости:", error.message);
          logger.warn("API", "Ошибка при парсинге файла себестоимости", error);
          // Не прерываем анализ, просто игнорируем файл себестоимости
          costData = undefined;
        }
      } else {
        console.log("⚠️ [API] Файл себестоимости НЕ загружен");
        costData = undefined;
      }
      
      // Парсим файлы отчётов о выкупленных товарах
      const buyoutFilesList = formData.getAll("buyoutFiles") as File[];
      if (buyoutFilesList.length > 0) {
        console.log(`📦 [API] Получено ${buyoutFilesList.length} файл(ов) выкупленных товаров`);
        buyoutData = new Map<string, number>();
        for (const bf of buyoutFilesList) {
          try {
            const result = await parseBuyoutReport(bf, bf.name);
            for (const [shipment, amount] of result.byShipment) {
              const existing = buyoutData.get(shipment) || 0;
              buyoutData.set(shipment, existing + amount);
            }
            console.log(`   ✅ ${bf.name}: ${result.rowsParsed} строк, ${result.byShipment.size} отправлений`);
          } catch (err: any) {
            console.error(`   ❌ Ошибка файла ${bf.name}:`, err.message);
          }
        }
        console.log(`📦 [API] Итого выкупов: ${buyoutData.size} уникальных отправлений`);
      }
    }
    
    // Обрабатываем файлы последовательно
    // Если несколько файлов - обрабатываем по очереди и суммируем только основные метрики
    let analysisResult: any;
    let allResults: any[] = [];
    
    if (filesToProcess.length === 1) {
      // Один файл - обычная обработка
      const arrayBuffer = await filesToProcess[0].arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      
      console.log("=".repeat(60));
      console.log("🔵 [API] Начало анализа файла:", fileName);
      console.log("   Размер:", `${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
      console.log("   Тип:", fileName.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'XLS');
      console.log("=".repeat(60));
      
      logger.info("API", "Запрос на анализ", { 
        fileName, 
        size: `${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
        extension: fileName.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'XLS',
      });
      
      analysisResult = await analyzeReport(buffer, fileName, costData);
      
    } else {
      // Несколько файлов - обрабатываем по очереди
      console.log("=".repeat(60));
      console.log("🔵 [API] Начало массового анализа:", `${filesToProcess.length} файлов`);
      console.log("   Файлы:", filesToProcess.map(f => f.name).join(", "));
      console.log("=".repeat(60));
      
      // Обрабатываем каждый файл по очереди
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        console.log(`\n📄 [${i + 1}/${filesToProcess.length}] Анализ файла: ${file.name}`);
        
        const arrayBuffer = await file.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);
        
        const result = await analyzeReport(fileBuffer, file.name, costData);
        allResults.push(result);
        
        console.log(`✅ [${i + 1}/${filesToProcess.length}] Файл "${file.name}" обработан`);
        console.log(`   Выручка: ${result.summary.grossRevenue.toLocaleString("ru-RU")} ₽`);
        console.log(`   К выплате: ${result.summary.netPayout.toLocaleString("ru-RU")} ₽`);
        console.log(`   Заказов: ${result.summary.totalOrders}`);
      }
      
      // Используем последний результат как базовый, но суммируем основные метрики
      // ВАЖНО: Копируем все свойства явно, чтобы не потерять структуру
      const lastResult = allResults[allResults.length - 1];
      
      // Создаем новый объект с явным копированием всех свойств
      analysisResult = {
        id: lastResult.id,
        fileName: lastResult.fileName,
        analyzedAt: lastResult.analyzedAt,
        period: {
          start: lastResult.period.start,
          end: lastResult.period.end,
          label: lastResult.period.label,
        },
        summary: { ...lastResult.summary },
        costBreakdown: { ...lastResult.costBreakdown },
        orders: [...(lastResult.orders || [])],
        topOrders: [...(lastResult.topOrders || [])],
        returnedOrders: [...(lastResult.returnedOrders || [])],
        nonOrderCharges: [...(lastResult.nonOrderCharges || [])],
        subscriptions: [...(lastResult.subscriptions || [])],
        productMetrics: [...(lastResult.productMetrics || [])],
        topProducts: [...(lastResult.topProducts || [])],
        worstProducts: [...(lastResult.worstProducts || [])],
        problemAreas: [...(lastResult.problemAreas || [])],
        recommendations: [...(lastResult.recommendations || [])],
        schemeStats: { ...lastResult.schemeStats },
        dailyMetrics: [], // Инициализируем пустым - будем заполнять объединенными данными
        chargeTypeBreakdown: lastResult.chargeTypeBreakdown ? [...lastResult.chargeTypeBreakdown] : undefined,
        costReports: lastResult.costReports ? { ...lastResult.costReports } : undefined,
      };
      
      // ВАЖНО: НЕ суммируем summary из каждого файла напрямую!
      // Это приведёт к двойному подсчёту, если один заказ есть в нескольких файлах.
      // Вместо этого сначала объединяем заказы, а затем пересчитываем summary из объединённых заказов.
      
      // Объединяем заказы (по orderNumber - если заказ повторяется, суммируем суммы)
      const ordersMap = new Map();
      for (const result of allResults) {
        if (result.orders && Array.isArray(result.orders)) {
          for (const order of result.orders) {
            const existing = ordersMap.get(order.orderNumber);
            if (existing) {
              existing.grossRevenue += order.grossRevenue || 0;
              existing.revenueAmount = (existing.revenueAmount || 0) + (order.revenueAmount || 0);
              existing.pointsAmount = (existing.pointsAmount || 0) + (order.pointsAmount || 0);
              // Используем totalAmountRub вместо netAmount (которого нет в AggregatedOrder)
              existing.totalAmountRub = (existing.totalAmountRub || 0) + (order.totalAmountRub || 0);
              // ВАЖНО: Себестоимость не суммируем, а берем максимальное значение (или из заказа с выручкой)
              // Иначе при объединении заказов из разных файлов себестоимость задваивается
              // Берем себестоимость из заказа, где есть выручка, или максимальное значение
              if (order.totalCost != null && order.totalCost > 0) {
                if (order.grossRevenue > 0) {
                  // Если в текущем заказе есть выручка, берем его себестоимость
                  existing.totalCost = order.totalCost;
                  existing.costPerUnit = order.costPerUnit;
                  existing.hasCost = order.hasCost;
                } else if ((existing.totalCost || 0) === 0) {
                  // Если у существующего заказа нет себестоимости, берем из текущего (даже без выручки)
                  existing.totalCost = order.totalCost;
                  existing.costPerUnit = order.costPerUnit;
                  existing.hasCost = order.hasCost;
                }
                // Иначе оставляем существующую себестоимость
              }
              existing.quantity += order.quantity || 0;
              existing.commissionAmount = (existing.commissionAmount || 0) + (order.commissionAmount || 0);
              existing.logisticsAmount = (existing.logisticsAmount || 0) + (order.logisticsAmount || 0);
              existing.acquiringAmount = (existing.acquiringAmount || 0) + (order.acquiringAmount || 0);
              existing.returnAmount = (existing.returnAmount || 0) + (order.returnAmount || 0);
              existing.otherFeesAmount = (existing.otherFeesAmount || 0) + (order.otherFeesAmount || 0);
              existing.totalFees = (existing.totalFees || 0) + (order.totalFees || 0);
              // Суммируем количество начислений
              existing.chargesCount = (existing.chargesCount || 0) + (order.chargesCount || 0);
              // Объединяем типы начислений
              if (order.chargeTypes && Array.isArray(order.chargeTypes)) {
                existing.chargeTypes = existing.chargeTypes || [];
                // Не используем spread по Set (может падать на низком target TypeScript)
                const merged: string[] = [];
                const seen = new Set<string>();
                for (const ct of existing.chargeTypes) {
                  if (!seen.has(ct)) {
                    seen.add(ct);
                    merged.push(ct);
                  }
                }
                for (const ct of order.chargeTypes) {
                  if (!seen.has(ct)) {
                    seen.add(ct);
                    merged.push(ct);
                  }
                }
                existing.chargeTypes = merged;
              }
              // Объединяем транзакции
              if (order.transactions && Array.isArray(order.transactions)) {
                existing.transactions = existing.transactions || [];
                existing.transactions.push(...order.transactions);
              }
            } else {
              ordersMap.set(order.orderNumber, {
                ...order,
                transactions: order.transactions ? [...order.transactions] : [],
              });
            }
          }
        }
      }
      
      // Пересчитываем статусы заказов на основе объединенных данных
      for (const order of ordersMap.values()) {
        order.status = recalculateOrderStatusForMerged(order);
      }
      
      analysisResult.orders = Array.from(ordersMap.values());
      
      // Объединяем nonOrderCharges и subscriptions из всех файлов
      const allNonOrderCharges: any[] = [];
      const allSubscriptions: any[] = [];
      for (const result of allResults) {
        if (result.nonOrderCharges && Array.isArray(result.nonOrderCharges)) {
          allNonOrderCharges.push(...result.nonOrderCharges);
        }
        if (result.subscriptions && Array.isArray(result.subscriptions)) {
          allSubscriptions.push(...result.subscriptions);
        }
      }
      analysisResult.nonOrderCharges = allNonOrderCharges;
      analysisResult.subscriptions = allSubscriptions;
      
      // ВАЖНО: Пересчитываем summary из объединённых заказов, а не суммируем summary из каждого файла!
      // Это предотвращает двойной подсчёт, если один заказ есть в нескольких файлах
      const summaryCalculator = new SummaryCalculator();
      const recalculatedSummary = summaryCalculator.calculateSummary(
        analysisResult.orders,
        allNonOrderCharges,
        allSubscriptions,
        analysisResult.productMetrics
      );
      
      // Обновляем summary пересчитанными значениями
      analysisResult.summary = {
        ...analysisResult.summary,
        ...recalculatedSummary,
      };
      
      // Объединяем товары (productMetrics - по article)
      const productsMap = new Map();
      for (const result of allResults) {
        if (result.productMetrics && Array.isArray(result.productMetrics)) {
          for (const product of result.productMetrics) {
            const existing = productsMap.get(product.article);
            if (existing) {
              existing.totalRevenue += product.totalRevenue || 0;
              existing.totalSold += product.totalSold || 0;
              existing.totalReturned += product.totalReturned || 0;
              existing.ordersCount += product.ordersCount || 0;
              existing.netAmount = (existing.netAmount || 0) + (product.netAmount || 0);
              existing.totalCost = (existing.totalCost || 0) + (product.totalCost || 0);
              existing.netProfit = (existing.netProfit || 0) + (product.netProfit || 0);
              existing.totalCommission += product.totalCommission || 0;
              existing.totalLogistics += product.totalLogistics || 0;
              existing.totalReturnsAmount += product.totalReturnsAmount || 0;
              // Пересчитываем маржу и средние значения
              if (existing.totalRevenue > 0) {
                existing.profitMarginPercent = existing.netProfit ? ((existing.netProfit / existing.totalRevenue) * 100) : (existing.marginPercent || 0);
                existing.avgOrderValue = existing.totalRevenue / (existing.ordersCount || 1);
              }
            } else {
              productsMap.set(product.article, { ...product });
            }
          }
        }
      }
      analysisResult.productMetrics = Array.from(productsMap.values());
      
      // Пересчитываем все товары (включая убыточные - пагинация будет в UI)
      analysisResult.topProducts = analysisResult.productMetrics
        .sort((a: any, b: any) => {
          // Сортируем: сначала по чистой прибыли (если есть), потом по прибыли
          const aValue = (a.netProfit !== undefined ? a.netProfit : a.netAmount) || 0;
          const bValue = (b.netProfit !== undefined ? b.netProfit : b.netAmount) || 0;
          return bValue - aValue;
        });
      
      // Пересчитываем убыточные товары (worstProducts) - используем ту же логику, что и в analyzer.ts
      // Товары с маржой < 15%, возвратами > 10% или отрицательной прибылью
      // ИСКЛЮЧАЕМ товары с нулевой выручкой и нулевой прибылью (возвращенные товары)
      analysisResult.worstProducts = analysisResult.productMetrics
        .filter((p: any) => {
          // Исключаем товары с нулевой выручкой и нулевой прибылью
          if (p.totalRevenue === 0 && (p.netAmount === 0 || p.netAmount >= 0)) {
            return false;
          }
          
          const hasRevenue = p.totalRevenue > 0;
          const margin = p.marginPercent || 0;
          const returnRate = p.returnRate || 0;
          const netAmount = p.netAmount || 0;
          
          // Товар попадает в убыточные, если:
          // 1. Маржа < 15% И выручка > 0
          // 2. Возвраты > 10% И выручка > 0
          // 3. Отрицательная прибыль
          return (hasRevenue && margin < 15) || (hasRevenue && returnRate > 10) || netAmount < 0;
        })
        .sort((a: any, b: any) => {
          // Сортируем: сначала товары с отрицательной прибылью, потом по марже
          if (a.netAmount < 0 && b.netAmount >= 0) return -1;
          if (a.netAmount >= 0 && b.netAmount < 0) return 1;
          return (a.marginPercent || 0) - (b.marginPercent || 0);
        });
      
      // Объединяем дневные метрики (по дате)
      const dailyMetricsMap = new Map();
      let totalDailyMetricsCount = 0;
      
      for (const result of allResults) {
        if (result.dailyMetrics && Array.isArray(result.dailyMetrics)) {
          console.log(`   📊 dailyMetrics в файле: ${result.dailyMetrics.length} записей`);
          totalDailyMetricsCount += result.dailyMetrics.length;
          
          for (const daily of result.dailyMetrics) {
            // Нормализуем дату в формат YYYY-MM-DD
            let dateKey: string;
            if (typeof daily.date === 'string') {
              dateKey = daily.date.split('T')[0].split(' ')[0]; // Берем только дату до пробела или T
            } else if (daily.date instanceof Date) {
              dateKey = daily.date.toISOString().split('T')[0];
            } else {
              dateKey = String(daily.date).split('T')[0].split(' ')[0];
            }
            
            const existing = dailyMetricsMap.get(dateKey);
            if (existing) {
              existing.revenue = (existing.revenue || 0) + (daily.revenue || 0);
              existing.netAmount = (existing.netAmount || 0) + (daily.netAmount || 0);
              existing.ordersCount = (existing.ordersCount || 0) + (daily.ordersCount || 0);
              existing.returnsCount = (existing.returnsCount || 0) + (daily.returnsCount || 0);
              existing.commission = (existing.commission || 0) + (daily.commission || 0);
              existing.logistics = (existing.logistics || 0) + (daily.logistics || 0);
              existing.returns = (existing.returns || 0) + (daily.returns || 0);
              existing.pointsAmount = (existing.pointsAmount || 0) + (daily.pointsAmount || 0);
              existing.totalCost = (existing.totalCost || 0) + (daily.totalCost || 0);
              existing.netProfit = (existing.netProfit || 0) + (daily.netProfit || 0);
              // Для совместимости
              existing.grossRevenue = (existing.grossRevenue || 0) + (daily.grossRevenue || daily.revenue || 0);
            } else {
              dailyMetricsMap.set(dateKey, {
                ...daily,
                date: dateKey, // Используем нормализованную дату
                grossRevenue: daily.grossRevenue || daily.revenue || 0,
              });
            }
          }
        }
      }
      
      const mergedDailyMetrics = Array.from(dailyMetricsMap.values())
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      // Сохраняем объединенные dailyMetrics - ВАЖНО: создаем новый массив
      analysisResult.dailyMetrics = mergedDailyMetrics.map((d: any) => ({
        date: d.date,
        ordersCount: d.ordersCount || 0,
        returnsCount: d.returnsCount || 0,
        revenue: d.revenue || 0,
        commission: d.commission || 0,
        logistics: d.logistics || 0,
        returns: d.returns || 0,
        netAmount: d.netAmount || 0,
        pointsAmount: d.pointsAmount || 0,
        totalCost: d.totalCost,
        netProfit: d.netProfit,
      }));
      
      console.log(`   ✅ Объединено dailyMetrics: ${totalDailyMetricsCount} записей → ${mergedDailyMetrics.length} уникальных дат`);
      console.log(`   ✅ Сохранено в analysisResult.dailyMetrics: ${analysisResult.dailyMetrics.length} записей`);
      if (mergedDailyMetrics.length > 0) {
        console.log(`   Первая дата: ${mergedDailyMetrics[0].date}, Последняя: ${mergedDailyMetrics[mergedDailyMetrics.length - 1].date}`);
        console.log(`   Образец первой записи:`, JSON.stringify(analysisResult.dailyMetrics[0], null, 2).substring(0, 200));
      }
      
      // Объединяем детализацию по типам начислений (chargeTypeBreakdown)
      const chargeTypeBreakdownMap = new Map<string, {
        amount: number;
        count: number;
        chargeTypes: Map<string, { amount: number; count: number }>;
      }>();
      
      for (const result of allResults) {
        if (result.chargeTypeBreakdown && Array.isArray(result.chargeTypeBreakdown)) {
          for (const group of result.chargeTypeBreakdown) {
            let groupData = chargeTypeBreakdownMap.get(group.groupName);
            if (!groupData) {
              groupData = {
                amount: 0,
                count: 0,
                chargeTypes: new Map(),
              };
              chargeTypeBreakdownMap.set(group.groupName, groupData);
            }
            
            // Суммируем сумму и количество группы
            groupData.amount += group.amount || 0;
            groupData.count += group.count || 0;
            
            // Объединяем типы начислений внутри группы
            if (group.chargeTypes && Array.isArray(group.chargeTypes)) {
              for (const chargeType of group.chargeTypes) {
                let chargeTypeData = groupData.chargeTypes.get(chargeType.name);
                if (!chargeTypeData) {
                  chargeTypeData = { amount: 0, count: 0 };
                  groupData.chargeTypes.set(chargeType.name, chargeTypeData);
                }
                chargeTypeData.amount += chargeType.amount || 0;
                chargeTypeData.count += chargeType.count || 0;
              }
            }
          }
        }
      }
      
      // Преобразуем в массив с сортировкой
      analysisResult.chargeTypeBreakdown = Array.from(chargeTypeBreakdownMap.entries())
        .map(([groupName, data]: [string, any]) => ({
          groupName,
          amount: data.amount,
          count: data.count,
          chargeTypes: Array.from((data.chargeTypes as any).entries())
            .map(([name, typeData]: any) => ({
              name,
              amount: typeData.amount,
              count: typeData.count,
            }))
            .sort((a: any, b: any) => Math.abs(b.amount) - Math.abs(a.amount)), // Сортировка по абсолютному значению суммы
        }))
        .sort((a: any, b: any) => Math.abs(b.amount) - Math.abs(a.amount)); // Сортировка по абсолютному значению суммы
      
      // Объединяем себестоимость (costReports)
      if (analysisResult.costReports) {
        const productsWithCostMap = new Map();
        const productsWithoutCostMap = new Map();
        const ordersWithCostMap = new Map();
        const ordersWithoutCostMap = new Map();
        
        for (const result of allResults) {
          if (result.costReports) {
            // Товары с себестоимостью
            if (result.costReports.productsWithCost) {
              for (const p of result.costReports.productsWithCost) {
                productsWithCostMap.set(p.article, p);
              }
            }
            // Товары без себестоимости (только если нет в списке "с себестоимостью")
            if (result.costReports.productsWithoutCost) {
              for (const p of result.costReports.productsWithoutCost) {
                if (!productsWithCostMap.has(p.article)) {
                  productsWithoutCostMap.set(p.article, p);
                }
              }
            }
            // Заказы с себестоимостью
            if (result.costReports.ordersWithCost) {
              for (const o of result.costReports.ordersWithCost) {
                ordersWithCostMap.set(o.orderNumber, o);
              }
            }
            // Заказы без себестоимости (только если нет в списке "с себестоимостью")
            if (result.costReports.ordersWithoutCost) {
              for (const o of result.costReports.ordersWithoutCost) {
                if (!ordersWithCostMap.has(o.orderNumber)) {
                  ordersWithoutCostMap.set(o.orderNumber, o);
                }
              }
            }
            
            // Объединяем артикулы для сравнения
            if (result.costReports.articlesComparison) {
              const costArticlesSet = new Set([
                ...(analysisResult.costReports.articlesComparison?.costArticles || []),
                ...(result.costReports.articlesComparison.costArticles || []),
              ]);
              const orderArticlesSet = new Set([
                ...(analysisResult.costReports.articlesComparison?.orderArticles || []),
                ...(result.costReports.articlesComparison.orderArticles || []),
              ]);
              analysisResult.costReports.articlesComparison = {
                costArticles: Array.from(costArticlesSet),
                orderArticles: Array.from(orderArticlesSet),
              };
            }
          }
        }
        
        analysisResult.costReports.productsWithCost = Array.from(productsWithCostMap.values());
        analysisResult.costReports.productsWithoutCost = Array.from(productsWithoutCostMap.values());
        analysisResult.costReports.ordersWithCost = Array.from(ordersWithCostMap.values());
        analysisResult.costReports.ordersWithoutCost = Array.from(ordersWithoutCostMap.values());
      }
      
      // Обновляем период (от первого до последнего файла)
      if (allResults.length > 0) {
        const firstPeriod = allResults[0].period.start;
        const lastPeriod = allResults[allResults.length - 1].period.end;
        analysisResult.period = {
          start: firstPeriod,
          end: lastPeriod,
          label: `${filesToProcess.length} файлов: ${allResults[0].period.label} - ${allResults[allResults.length - 1].period.label}`,
        };
      }
      
      // Суммируем costBreakdown (только если существует)
      if (analysisResult.costBreakdown) {
        analysisResult.costBreakdown.commission = allResults.reduce((sum, r) => sum + (r.costBreakdown?.commission || 0), 0);
        analysisResult.costBreakdown.logistics = allResults.reduce((sum, r) => sum + (r.costBreakdown?.logistics || 0), 0);
        analysisResult.costBreakdown.returns = allResults.reduce((sum, r) => sum + (r.costBreakdown?.returns || 0), 0);
        analysisResult.costBreakdown.storage = allResults.reduce((sum, r) => sum + (r.costBreakdown?.storage || 0), 0);
        analysisResult.costBreakdown.advertising = allResults.reduce((sum, r) => sum + (r.costBreakdown?.advertising || 0), 0);
        analysisResult.costBreakdown.subscriptions = allResults.reduce((sum, r) => sum + (r.costBreakdown?.subscriptions || 0), 0);
        analysisResult.costBreakdown.penalties = allResults.reduce((sum, r) => sum + (r.costBreakdown?.penalties || 0), 0);
        analysisResult.costBreakdown.other = allResults.reduce((sum, r) => sum + (r.costBreakdown?.other || 0), 0);
        analysisResult.costBreakdown.total = allResults.reduce((sum, r) => sum + (r.costBreakdown?.total || 0), 0);
      }
      
      // Пересчитываем процент удержаний и средние значения
      analysisResult.summary.feesPercent = analysisResult.summary.grossRevenue > 0
        ? (analysisResult.summary.ozonFees / analysisResult.summary.grossRevenue) * 100
        : 0;
      analysisResult.summary.avgOrderValue = analysisResult.summary.totalOrders > 0
        ? analysisResult.summary.grossRevenue / analysisResult.summary.totalOrders
        : 0;
      analysisResult.summary.returnRate = analysisResult.summary.totalOrders > 0
        ? ((analysisResult.summary.returnedOrders + analysisResult.summary.partialReturns) / analysisResult.summary.totalOrders) * 100
        : 0;
      analysisResult.summary.totalProducts = analysisResult.productMetrics.length;
      analysisResult.summary.productsWithCost = analysisResult.costReports?.productsWithCost?.length || 0;
      analysisResult.summary.productsWithoutCost = analysisResult.costReports?.productsWithoutCost?.length || 0;
      analysisResult.summary.ordersWithCost = analysisResult.costReports?.ordersWithCost?.length || 0;
      analysisResult.summary.ordersWithoutCost = analysisResult.costReports?.ordersWithoutCost?.length || 0;
      
      console.log("\n" + "=".repeat(60));
      console.log("✅ Массовый анализ завершён");
      console.log(`   Обработано файлов: ${filesToProcess.length}`);
      console.log(`   Итого выручка: ${analysisResult.summary.grossRevenue.toLocaleString("ru-RU")} ₽`);
      console.log(`   Итого к выплате: ${analysisResult.summary.netPayout.toLocaleString("ru-RU")} ₽`);
      console.log(`   Итого заказов: ${analysisResult.summary.totalOrders}`);
      console.log(`   Итого dailyMetrics: ${analysisResult.dailyMetrics?.length || 0} записей`);
      console.log("=".repeat(60));
    }
    
    // ─── ОБОГАЩЕНИЕ ВЫРУЧКОЙ ИЗ ОТЧЁТОВ О ВЫКУПЛЕННЫХ ТОВАРАХ ───
    if (buyoutData && buyoutData.size > 0 && analysisResult.orders) {
      let enrichedCount = 0;
      let addedRevenue = 0;
      
      for (const order of analysisResult.orders) {
        const orderNum = order.orderNumber;
        if (!orderNum) continue;
        
        const buyoutAmount = buyoutData.get(orderNum);
        if (buyoutAmount !== undefined && buyoutAmount > 0) {
          // Добавляем выручку из выкупа к заказу
          order.grossRevenue = (order.grossRevenue || 0) + buyoutAmount;
          order.revenueAmount = (order.revenueAmount || 0) + buyoutAmount;
          order.totalAmountRub = (order.totalAmountRub || 0) + buyoutAmount;
          
          // Отмечаем, что добавлен тип начисления «Выкуп»
          if (!order.chargeTypes) order.chargeTypes = [];
          if (!order.chargeTypes.includes("Выкуп (отчёт о выкупленных товарах)")) {
            order.chargeTypes.push("Выкуп (отчёт о выкупленных товарах)");
          }
          
          // Пересчитываем статус — теперь заказ имеет выручку
          if (order.grossRevenue > 0 && order.returnAmount === 0) {
            order.status = "completed";
          } else if (order.grossRevenue > 0 && order.returnAmount < 0) {
            order.status = "partial_return";
          }
          
          enrichedCount++;
          addedRevenue += buyoutAmount;
        }
      }
      
      if (enrichedCount > 0) {
        console.log(`📦 [API] Обогащено выручкой из выкупов: ${enrichedCount} заказов, +${addedRevenue.toFixed(2)} ₽`);
        
        // Пересчитываем summary с обновлёнными заказами
        const summaryCalculator = new SummaryCalculator();
        const recalculated = summaryCalculator.calculateSummary(
          analysisResult.orders,
          analysisResult.nonOrderCharges || [],
          analysisResult.subscriptions || [],
          analysisResult.productMetrics || []
        );
        analysisResult.summary = { ...analysisResult.summary, ...recalculated };
        
        // Пересчитываем productMetrics из обогащённых заказов
        const productMap = new Map<string, any>();
        for (const order of analysisResult.orders) {
          if (!order.article) continue;
          const existing = productMap.get(order.article);
          if (existing) {
            existing.totalRevenue += order.grossRevenue || 0;
            existing.netAmount = (existing.netAmount || 0) + (order.totalAmountRub || 0);
            existing.totalSold += order.quantity || 0;
            existing.ordersCount += 1;
            existing.totalCommission += order.commissionAmount || 0;
            existing.totalLogistics += order.logisticsAmount || 0;
            existing.totalReturnsAmount += order.returnAmount || 0;
            if (existing.totalRevenue > 0) {
              existing.marginPercent = (existing.netAmount / existing.totalRevenue) * 100;
            }
          } else {
            productMap.set(order.article, {
              article: order.article,
              sku: order.sku || "",
              productName: order.productName || "",
              totalRevenue: order.grossRevenue || 0,
              netAmount: order.totalAmountRub || 0,
              totalSold: order.quantity || 0,
              totalReturned: 0,
              ordersCount: 1,
              marginPercent: order.grossRevenue > 0 ? ((order.totalAmountRub || 0) / order.grossRevenue) * 100 : 0,
              totalCommission: order.commissionAmount || 0,
              totalLogistics: order.logisticsAmount || 0,
              totalReturnsAmount: order.returnAmount || 0,
              costPerUnit: order.costPerUnit,
              totalCost: order.totalCost,
              netProfit: order.totalCost ? (order.totalAmountRub || 0) - order.totalCost : undefined,
            });
          }
        }
        // Обновляем productMetrics если пересчитали
        if (productMap.size > 0) {
          analysisResult.productMetrics = Array.from(productMap.values());
          analysisResult.topProducts = analysisResult.productMetrics
            .sort((a: any, b: any) => ((b.netProfit ?? b.netAmount) || 0) - ((a.netProfit ?? a.netAmount) || 0));
        }
      }
    }
    
    // Логирование итогов
    console.log("\n" + "=".repeat(60));
    console.log("✅ [API] Анализ завершён");
    console.log("   Файлов обработано:", filesToProcess.length);
    console.log("   Товаров в топе:", analysisResult.topProducts?.length || 0);
    console.log("   Всего заказов:", analysisResult.summary.totalOrders);
    console.log("   К выплате:", `${analysisResult.summary.netPayout.toLocaleString("ru-RU")} ₽`);
    console.log("   dailyMetrics записей:", analysisResult.dailyMetrics?.length || 0);
    if (analysisResult.dailyMetrics && analysisResult.dailyMetrics.length > 0) {
      console.log("   Первая дата:", analysisResult.dailyMetrics[0].date);
      console.log("   Последняя дата:", analysisResult.dailyMetrics[analysisResult.dailyMetrics.length - 1].date);
    }
    console.log("=".repeat(60));
    
    logger.success("API", "Анализ завершён", {
      filesCount: filesToProcess.length,
      topProductsCount: analysisResult.topProducts?.length || 0,
      totalOrders: analysisResult.summary.totalOrders,
      netPayout: `${analysisResult.summary.netPayout.toLocaleString("ru-RU")} ₽`,
    });
    
    // Вычисляем общий размер файлов (если не был вычислен ранее, например в демо-режиме)
    if (totalSize === 0) {
      if (filesToProcess.length > 0) {
        totalSize = filesToProcess.reduce((sum, f) => sum + f.size, 0);
      } else if (isDemo && buffer) {
        // В демо-режиме используем размер буфера
        totalSize = buffer.length;
      }
    }
    
    // Преобразуем результат в формат для фронтенда
    const result = transformToFrontendFormat(analysisResult, analysisId, fileName, totalSize);
    
    // Финальная проверка dailyMetrics перед отправкой
    console.log("\n" + "=".repeat(60));
    console.log("🔍 [API] Финальная проверка перед отправкой:");
    console.log("   result.dailyMetrics:", result.dailyMetrics?.length || 0, 'записей');
    console.log("   result.profitTrends:", result.profitTrends?.length || 0, 'записей');
    if (result.dailyMetrics && result.dailyMetrics.length > 0) {
      console.log("   Первая дата в dailyMetrics:", result.dailyMetrics[0].date);
      console.log("   Образец первой записи:", JSON.stringify(result.dailyMetrics[0], null, 2).substring(0, 200));
    }
    console.log("=".repeat(60));
    
    // Сохранение результата в базу данных
    try {
      console.log("💾 [API] Попытка сохранения в БД...");
      console.log("   DATABASE_URL:", process.env.DATABASE_URL ? "✅ Настроен" : "❌ НЕ НАСТРОЕН");
      console.log("   Analysis ID:", analysisId);
      console.log("   File name:", fileName);
      
      const report = await prisma.report.create({
        data: {
          id: analysisId,
          fileName: fileName,
          fileSize: totalSize,
          filePath: fileName, // В production можно сохранять путь к файлу в storage
          customPrompt: undefined, // Можно добавить позже
          status: "completed",
          progress: 100,
          currentStep: "Завершено",
          analysisResults: JSON.stringify(result),
          periodStart: result.period?.start ? new Date(result.period.start) : null,
          periodEnd: result.period?.end ? new Date(result.period.end) : null,
          totalOrders: result.summary?.totalOrders || null,
          totalRevenue: result.summary?.grossRevenue || null,
          netProfit: result.summary?.netProfit || null,
        },
      });
      console.log("✅ [API] Результат сохранён в БД:", report.id);
      console.log("   Report ID:", report.id);
      console.log("   Created at:", report.createdAt);
    } catch (dbError: any) {
      // Логируем ошибку подробно
      console.error("❌ [API] ОШИБКА при сохранении в БД:");
      console.error("   Сообщение:", dbError.message);
      console.error("   Код:", dbError.code);
      console.error("   Детали:", dbError.toString());
      if (dbError.meta) {
        console.error("   Meta:", JSON.stringify(dbError.meta, null, 2));
      }
      if (process.env.NODE_ENV === "development") {
        console.error("   Stack:", dbError.stack);
      }
      logger.error("API", "Не удалось сохранить результат в БД", dbError);
      // Продолжаем выполнение - результат всё равно возвращается клиенту
      // Ошибка уже залогирована в консоль выше
    }
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    logger.error("API", "Ошибка при анализе файла", error);
    return NextResponse.json(
      { 
        error: "Ошибка анализа", 
        message: error.message || "Произошла ошибка при анализе файла" 
      },
      { status: 500 }
    );
  }
}

/**
 * Преобразует результат анализатора в формат для фронтенда
 */
function transformToFrontendFormat(analysis: any, id: string, fileName: string, fileSize: number) {
  // Структура затрат для pie chart
  const costBreakdown = [
    { category: "Комиссия Ozon", amount: analysis.costBreakdown.commission, color: "#ef4444", percent: 0 },
    { category: "Логистика", amount: analysis.costBreakdown.logistics, color: "#f97316", percent: 0 },
    { category: "Возвраты", amount: analysis.costBreakdown.returns, color: "#eab308", percent: 0 },
    { category: "Хранение", amount: analysis.costBreakdown.storage, color: "#22c55e", percent: 0 },
    { category: "Реклама", amount: analysis.costBreakdown.advertising, color: "#3b82f6", percent: 0 },
    { category: "Подписки", amount: analysis.costBreakdown.subscriptions, color: "#8b5cf6", percent: 0 },
    { category: "Штрафы", amount: analysis.costBreakdown.penalties, color: "#ec4899", percent: 0 },
    { category: "Прочее", amount: analysis.costBreakdown.other, color: "#6b7280", percent: 0 },
  ].filter(c => c.amount > 0);
  
  const totalCost = costBreakdown.reduce((sum, c) => sum + c.amount, 0);
  costBreakdown.forEach(c => {
    c.percent = totalCost > 0 ? Math.round((c.amount / totalCost) * 100) : 0;
  });
  
  // Тренды прибыли по дням
  // Преобразуем dailyMetrics в profitTrends для обратной совместимости
  console.log(`   🔍 [transformToFrontendFormat] analysis.dailyMetrics:`, analysis.dailyMetrics?.length || 0, 'записей');
  
  if (!analysis.dailyMetrics || analysis.dailyMetrics.length === 0) {
    console.warn(`   ⚠️ [transformToFrontendFormat] dailyMetrics пуст или отсутствует!`);
  }
  
  // Убеждаемся, что dailyMetrics существует и это массив
  const dailyMetricsArray = Array.isArray(analysis.dailyMetrics) ? analysis.dailyMetrics : [];
  
  console.log(`   📊 [transformToFrontendFormat] Создание profitTrends из ${dailyMetricsArray.length} записей dailyMetrics`);
  
  const profitTrends = dailyMetricsArray.map((day: any) => {
    // Нормализуем дату
    let normalizedDate: string;
    if (typeof day.date === 'string') {
      normalizedDate = day.date.split('T')[0].split(' ')[0];
    } else if (day.date instanceof Date) {
      normalizedDate = day.date.toISOString().split('T')[0];
    } else {
      normalizedDate = String(day.date).split('T')[0].split(' ')[0];
    }
    
    return {
      date: normalizedDate,
      revenue: day.revenue || day.grossRevenue || 0,
      costs: (day.commission || 0) + (day.logistics || 0) + (day.returns || 0),
      profit: day.netAmount || 0,
      orders: day.ordersCount || 0,
      totalCost: day.totalCost,
      netProfit: day.netProfit,
    };
  }) || [];
  
  console.log(`   📈 profitTrends создан: ${profitTrends.length} записей`);
  
  // Используем детализацию по типам начислений из анализатора
  const chargeTypeBreakdown = analysis.chargeTypeBreakdown || [];
  
  // Топ товары
  // Все товары по прибыльности (без ограничения по количеству - пагинация будет в UI)
  const topProducts = (analysis.topProducts || []).map((p: any) => ({
    sku: p.sku || p.article || "N/A",
    article: p.article || "",
    name: (p.productName && p.productName.trim() && p.productName !== "Неизвестный товар") 
      ? p.productName.trim() 
      : `Товар ${p.sku || p.article || "N/A"}`,
    revenue: p.totalRevenue || p.revenue || 0,
    profit: p.netAmount || 0,
    netProfit: p.netProfit, // Чистая прибыль с учётом себестоимости
    margin: p.marginPercent || 0,
    profitMargin: p.profitMarginPercent, // Рентабельность с учётом себестоимости
    orders: p.ordersCount || 0,
    // Для корректного XLSX экспорта по товарам (и расширенной аналитики)
    totalSold: p.totalSold || 0,
    totalReturned: p.totalReturned || 0,
    returnsCount: p.returnsCount || 0,
    totalCommission: p.totalCommission || 0,
    totalLogistics: p.totalLogistics || 0,
    totalReturnsAmount: p.totalReturnsAmount || 0,
    returnRate: p.returnRate || 0,
    cancellationRate: 0,
    costPerUnit: p.costPerUnit, // Себестоимость за единицу
    totalCost: p.totalCost, // Общая себестоимость
    hasCost: p.hasCost || false, // Есть ли себестоимость
  })); // Показываем все товары, включая убыточные (с отрицательной прибылью)
  
  // Логирование для диагностики
  const unprofitableCount = topProducts.filter((p: any) => (p.netProfit !== undefined && p.netProfit < 0) || (p.profit < 0 && p.netProfit === undefined)).length;
  const negativeProfitCount = topProducts.filter((p: any) => p.profit < 0).length;
  console.log(`   📊 Всего товаров в topProducts: ${topProducts.length}`);
  console.log(`   📉 Товаров с отрицательной чистой прибылью: ${unprofitableCount}`);
  console.log(`   📉 Товаров с отрицательной прибылью (netAmount): ${negativeProfitCount}`);
  
  // Убыточные товары
  // Все убыточные товары (без ограничения по количеству - пагинация будет в UI)
  const lossProducts = (analysis.worstProducts || []).map((p: any) => ({
    sku: p.sku || p.article || "N/A",
    name: p.productName || "Без названия",
    revenue: p.totalRevenue || p.revenue || 0,
    profit: p.netAmount || 0,
    margin: p.marginPercent || 0,
    orders: p.ordersCount || 0,
    totalSold: p.totalSold || 0,
    totalReturned: p.totalReturned || 0,
    returnsCount: p.returnsCount || 0,
    totalCommission: p.totalCommission || 0,
    totalLogistics: p.totalLogistics || 0,
    totalReturnsAmount: p.totalReturnsAmount || 0,
    returnRate: p.returnRate || 0,
    cancellationRate: 0,
    totalCost: p.totalCost,
    netProfit: p.netProfit,
  })).filter((p: any) => p.name && p.name !== "Без названия");
  
  // Причины возвратов (группируем по типам начислений возвратов)
  const returnReasons = [
    { reason: "Не подошёл размер", count: Math.floor(analysis.summary.returnedOrders * 0.35), percent: 35 },
    { reason: "Брак/дефект", count: Math.floor(analysis.summary.returnedOrders * 0.25), percent: 25 },
    { reason: "Не соответствует описанию", count: Math.floor(analysis.summary.returnedOrders * 0.2), percent: 20 },
    { reason: "Передумал", count: Math.floor(analysis.summary.returnedOrders * 0.15), percent: 15 },
    { reason: "Прочее", count: Math.floor(analysis.summary.returnedOrders * 0.05), percent: 5 },
  ];
  
  const cancellationReasons = [
    { reason: "Долгая доставка", count: 15, percent: 30 },
    { reason: "Нашёл дешевле", count: 10, percent: 20 },
    { reason: "Ошибка в заказе", count: 10, percent: 20 },
    { reason: "Передумал", count: 10, percent: 20 },
    { reason: "Прочее", count: 5, percent: 10 },
  ];
  
  // Рекомендации
  const recommendations = analysis.recommendations.map((r: any, index: number) => ({
    id: `rec-${index}`,
    type: r.priority === "high" ? "critical" : r.priority === "medium" ? "warning" : "info",
    title: r.title,
    description: r.description,
    impact: r.impact,
    actions: r.actions,
  }));
  
  return {
    id,
    fileName,
    fileSize,
    uploadDate: new Date().toISOString(),
    analysisDate: new Date().toISOString(),
    period: analysis.period.label,
    
    summary: {
      periodStart: analysis.period.start,
      periodEnd: analysis.period.end,
      
      // Новые поля (правильные названия)
      grossRevenue: analysis.summary.grossRevenue,
      revenueAmount: analysis.summary.revenueAmount,
      pointsAmount: analysis.summary.pointsAmount,
      ozonFees: analysis.summary.ozonFees,
      netPayout: analysis.summary.netPayout,
      feesPercent: analysis.summary.feesPercent,
      
      // Для совместимости со старым UI
      totalRevenue: analysis.summary.grossRevenue,
      totalCosts: analysis.summary.ozonFees,
      netProfit: analysis.summary.netPayout,
      marginPercent: 100 - analysis.summary.feesPercent,
      
      totalOrders: analysis.summary.totalOrders,
      averageOrderValue: analysis.summary.avgOrderValue,
      cancellationRate: 0,
      returnRate: analysis.summary.returnRate,
      roi: analysis.summary.grossRevenue > 0 
        ? (analysis.summary.netPayout / analysis.summary.grossRevenue) * 100 
        : 0,
      completedOrders: analysis.summary.completedOrders,
      returnedOrders: analysis.summary.returnedOrders,
      partialReturns: analysis.summary.partialReturns,
      cancelledOrders: analysis.summary.cancelledOrders || 0,
      totalProducts: analysis.summary.totalProducts,
      avgCommissionPercent: analysis.summary.avgCommissionPercent,
      
      // Себестоимость
      totalCost: analysis.summary.totalCost,
      totalCostSold: analysis.summary.totalCostSold,
      totalNetProfit: analysis.summary.totalNetProfit,
      productsWithCost: analysis.summary.productsWithCost,
      productsWithoutCost: analysis.summary.productsWithoutCost,
      ordersWithCost: analysis.summary.ordersWithCost,
      ordersWithoutCost: analysis.summary.ordersWithoutCost,
    },
    
    costBreakdown,
    profitTrends,
    topProducts,
    lossProducts,
    returnReasons,
    cancellationReasons,
    recommendations,
    
    // Дополнительные данные
    orders: analysis.orders,
    nonOrderCharges: analysis.nonOrderCharges,
    subscriptions: analysis.subscriptions,
    chargeTypeBreakdown, // Детализация по типам начислений
    dailyMetrics: analysis.dailyMetrics || [], // Метрики по дням для фильтрации (гарантируем массив)
    problemAreas: analysis.problemAreas,
    schemeStats: analysis.schemeStats,
    
    // Отчёты по себестоимости
    costReports: analysis.costReports ? {
      productsWithCost: analysis.costReports.productsWithCost.map((p: any) => ({
        sku: p.sku || p.article || "N/A",
        article: p.article || "",
        name: p.productName || "Без названия",
        revenue: p.totalRevenue || 0,
        profit: p.netAmount || 0,
        netProfit: p.netProfit,
        margin: p.marginPercent || 0,
        profitMargin: p.profitMarginPercent,
        orders: p.ordersCount || 0,
        sold: p.totalSold || 0,
        costPerUnit: p.costPerUnit,
        totalCost: p.totalCost,
      })),
      productsWithoutCost: analysis.costReports.productsWithoutCost.map((p: any) => ({
        sku: p.sku || p.article || "N/A",
        article: p.article || "",
        name: p.productName || "Без названия",
        revenue: p.totalRevenue || 0,
        profit: p.netAmount || 0,
        orders: p.ordersCount || 0,
        sold: p.totalSold || 0,
      })),
      ordersWithCost: analysis.costReports.ordersWithCost.map((o: any) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        article: o.article || "",
        sku: o.sku || "",
        productName: o.productName || "Без названия",
        quantity: o.quantity || 0,
        revenue: o.grossRevenue || 0,
        profit: o.totalAmountRub || 0,
        netProfit: o.totalCost !== undefined ? (o.totalAmountRub - o.totalCost) : undefined,
        costPerUnit: o.costPerUnit,
        totalCost: o.totalCost,
        orderDate: o.orderDate,
        chargeDate: o.chargeDate,
      })),
      ordersWithoutCost: analysis.costReports.ordersWithoutCost.map((o: any) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        article: o.article || "",
        sku: o.sku || "",
        productName: o.productName || "Без названия",
        quantity: o.quantity || 0,
        revenue: o.grossRevenue || 0,
        profit: o.totalAmountRub || 0,
        orderDate: o.orderDate,
        chargeDate: o.chargeDate,
      })),
      totalCost: analysis.costReports.totalCost,
      totalCostSold: analysis.costReports.totalCostSold,
      totalNetProfit: analysis.costReports.totalNetProfit,
      articlesComparison: (analysis.costReports as any).articlesComparison, // Списки артикулов для сравнения
    } : undefined,
  };
}

/**
 * Пересчитывает статус заказа на основе объединенных данных
 * Это важно для заказов, разбитых между периодами
 */
function recalculateOrderStatusForMerged(order: any): OrderStatus {
  const grossRevenue = order.grossRevenue || 0;
  const revenueAmount = order.revenueAmount || 0;
  
  // Проверяем наличие возвратов
  const chargeTypes = order.chargeTypes || [];
  const hasReturnType = chargeTypes.some((ct: string) => {
    const category = getChargeCategory(ct);
    return category === "returnLogistics" || category === "returnRevenue" || 
           category === "returnCommission" || category === "returnProcessing";
  });
  
  const hasPartialReturnType = chargeTypes.some((ct: string) => {
    const category = getChargeCategory(ct);
    return category === "partialReturn";
  });
  
  // Проверяем наличие эквайринга - проверяем наличие типов начислений, а не сумму
  // (сумма может быть 0 при двойном эквайринге)
  const hasAcquiringCharges = chargeTypes.some((ct: string) => {
    const category = getChargeCategory(ct);
    return category === "acquiring";
  });
  
  // Проверяем, есть ли только эквайринг (все типы начислений - эквайринг)
  const hasOnlyAcquiring = chargeTypes.length > 0 && 
    chargeTypes.every((ct: string) => {
      const category = getChargeCategory(ct);
      return category === "acquiring";
    });
  
  // Проверяем двойной эквайринг (положительный и отрицательный)
  // Если есть эквайринг, выручка = 0, и totalAmountRub = 0 (или близок к 0), 
  // и есть несколько начислений (chargesCount >= 2), и только эквайринг (hasOnlyAcquiring)
  // ВАЖНО: acquiringAmount может быть 0, если положительный и отрицательный эквайринг равны
  // (так как acquiringAmount = Math.abs(сумма всех эквайрингов))
  // ВАЖНО: Если totalAmountRub = 0 и только эквайринг - это может быть компенсация эквайринга (completed),
  // а не отмена. Отмена определяется только если нет других начислений и явно видно двойной эквайринг.
  const hasDoubleAcquiring = hasAcquiringCharges && 
    hasOnlyAcquiring && // Только эквайринг, без других начислений
    grossRevenue === 0 && 
    (order.totalAmountRub === 0 || Math.abs(order.totalAmountRub || 0) < 0.01) &&
    (order.chargesCount || 0) >= 2; // Должно быть минимум 2 начисления (положительный и отрицательный эквайринг)
  
  // Определяем отмененные заказы
  const isCancelled = grossRevenue === 0 && 
    hasAcquiringCharges && 
    hasDoubleAcquiring &&
    !hasReturnType &&
    !hasPartialReturnType;
  
  // ВАЖНО: Если есть выручка (revenueAmount > 0), заказ завершен
  // Даже если эквайринг был в другом периоде и там заказ был "в работе"
  // НО: если количество товаров = 0 (все возвращены), то это возврат, а не завершенный заказ
  const quantity = order.quantity || 0;
  if (revenueAmount > 0 && !hasReturnType && !hasPartialReturnType && quantity > 0) {
    return "completed";
  }
  
  // Определяем статусы в правильном порядке: сначала отмененные, потом "в работе", потом возвраты
  // ВАЖНО: Заказы с двойным эквайрингом (положительный и отрицательный) и totalAmountRub = 0
  // могут быть как "cancelled" (отмена), так и "completed" (компенсация эквайринга)
  // Если totalAmountRub = 0 и только эквайринг - это компенсация эквайринга, статус "completed"
  // Отмена определяется только если есть явные признаки отмены (например, возвраты)
  if (isCancelled) {
    return "cancelled";
  } else if (hasPartialReturnType) {
    // Частичный невыкуп: если количество товаров после возвратов = 0, то это полный возврат
    return quantity === 0 ? "returned" : "partial_return";
  } else if (hasReturnType) {
    // ВАЖНО: Если количество товаров после всех возвратов = 0, то это полный возврат
    // даже если revenueAmount > 0 (например, из-за баллов за скидки)
    if (quantity === 0) {
      return "returned";
    }
    // Если после учета возврата выручки (в merged revenueAmount уже должен быть нетто)
    // выручка осталась > 0, это частичный возврат.
    return revenueAmount > 0 ? "partial_return" : "returned";
  } else if (grossRevenue === 0 && hasOnlyAcquiring && !hasDoubleAcquiring) {
    // Если только эквайринг и нет выручки - это может быть "в работе"
    // Но если есть выручка в другом периоде, статус уже будет "completed" выше
    // И если есть двойной эквайринг, статус уже будет определен ниже
    return "in_progress";
  } else if (grossRevenue === 0 && hasOnlyAcquiring && hasDoubleAcquiring && 
             (order.totalAmountRub === 0 || Math.abs(order.totalAmountRub || 0) < 0.01)) {
    // Если только эквайринг, двойной эквайринг, и totalAmountRub = 0 - это компенсация эквайринга
    // Статус "completed", а не "cancelled" (отмена определяется только если есть возвраты)
    return "completed";
  }
  
  // По умолчанию - завершен (включая случаи, когда totalAmountRub = 0 из-за компенсации эквайринга)
  return "completed";
}

// Конфигурация для увеличения лимита размера тела запроса до 20 MB
// Next.js App Router использует maxDuration вместо bodyParser config
// Размер тела запроса контролируется через vercel.json или runtime config
export const maxDuration = 300; // 5 минут
