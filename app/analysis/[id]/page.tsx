"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { 
  ArrowLeft,
  Calendar,
  FileSpreadsheet,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Percent,
  RotateCcw,
  AlertTriangle,
  XCircle,
  ChevronRight,
  Package,
  CheckCircle2,
  Clock3,
  PackageMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MetricCard } from "@/components/report/MetricCard";
import {
  ProfitChart,
  CostPieChart,
  CancellationChart,
} from "@/components/report/ChartSection";
import { RecommendationsList } from "@/components/report/RecommendationsList";
import { ExportButtons } from "@/components/report/ExportButtons";
import { CostBreakdownDetails } from "@/components/report/CostBreakdownDetails";
import { ArticlesComparison } from "@/components/report/ArticlesComparison";
import { RevenueCostCharts } from "@/components/report/RevenueCostCharts";
import { AllProductsTable } from "@/components/report/AllProductsTable";
import { ProductsWithCostTable } from "@/components/report/ProductsWithCostTable";
import { ProductsWithoutCostTable } from "@/components/report/ProductsWithoutCostTable";
import { OrdersProfitabilityTable } from "@/components/report/OrdersProfitabilityTable";
import { AIAnalysisButton } from "@/components/analysis/AIAnalysisButton";
import { ExportSectionButton } from "@/components/report/ExportSectionButton";
import { prepareAnalysisContext } from "@/lib/ai/context-preparer";
import { useAnalysisStore } from "@/lib/store/analysis-store";
import { formatDate, formatCurrency, cn } from "@/lib/utils";
import {
  exportOverviewData,
  exportAccrualsData,
  exportProductsData,
  exportOrdersData,
  exportCostReportsData,
  exportProblemsData,
} from "@/lib/utils/export-xlsx";
import type { FrontendAnalysisResult, ProductData } from "../../../lib/types/analysis";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function AnalysisPage() {
  const params = useParams();
  const id = params.id as string;
  const { analysisResult: storedResult, setAnalysisResult } = useAnalysisStore();
  const [data, setData] = useState<FrontendAnalysisResult | null>(null);
  // Сохраняем исходные данные для пересчёта
  const [originalData, setOriginalData] = useState<FrontendAnalysisResult | null>(null);
  
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (storedResult && storedResult.id === id) {
        setData(storedResult);
        setOriginalData(storedResult);
        return;
      }
      try {
        const res = await fetch(`/api/analysis/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Ошибка ${res.status}`);
        const json = await res.json();
        const payload = (json?.data ?? json) as FrontendAnalysisResult;
        if (cancelled) return;
        setData(payload);
        setOriginalData(payload);
        setAnalysisResult(payload);
      } catch (err) {
        console.error("[AnalysisPage] fetch error:", err);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, storedResult, setAnalysisResult]);
  
  
  if (!data) {
    return (
      <div className="container py-12">
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-pulse text-muted-foreground">Загрузка...</div>
        </div>
      </div>
    );
  }
  
  const { summary, profitTrends, costBreakdown, topProducts, cancellationReasons, returnReasons, recommendations, dailyMetrics } = data;
  
  return (
    <div className="container py-8 md:py-12">
      <motion.div
        initial="initial"
        animate="animate"
        className="space-y-8"
      >
        {/* Хедер отчёта */}
        <motion.div variants={fadeInUp} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <Link
              href="/"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Назад к загрузке
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold">Анализ отчёта Ozon</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileSpreadsheet className="h-4 w-4" />
                {data.fileName}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {data.period?.start && data.period?.end
                  ? `${formatDate(data.period.start)} — ${formatDate(data.period.end)}`
                  : "Период не указан"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/">
                <RotateCcw className="mr-2 h-4 w-4" />
                Новый анализ
              </Link>
            </Button>
          </div>
        </motion.div>
        
        <Separator />
        
        {/* KPI метрики */}
        <motion.section variants={fadeInUp}>
          <h2 className="text-lg font-semibold mb-4">Ключевые метрики</h2>
          
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Заказы по статусам</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard
                title="Всего заказов"
                value={summary.totalOrders || 0}
                format="number"
                icon={<ShoppingCart className="h-4 w-4" />}
                delay={0}
              />
              <MetricCard
                title="Завершено"
                value={summary.completedOrders || 0}
                format="number"
                icon={<CheckCircle2 className="h-4 w-4" />}
                className="border-success/20"
                delay={0.01}
              />
              <MetricCard
                title="В работе"
                value={summary.incompleteOrders ?? 0}
                format="number"
                icon={<Clock3 className="h-4 w-4" />}
                className={(summary.incompleteOrders || 0) > 0 ? "border-amber-500/30" : ""}
                subtitle="неполный набор начислений в отчёте"
                delay={0.02}
              />
              <MetricCard
                title="Отменено"
                value={summary.cancelledOrders || 0}
                format="number"
                icon={<XCircle className="h-4 w-4" />}
                delay={0.03}
              />
              <MetricCard
                title="Возвраты"
                value={summary.returnedOrders || 0}
                format="number"
                icon={<RotateCcw className="h-4 w-4" />}
                subtitle="полный возврат"
                delay={0.04}
              />
              <MetricCard
                title="Частичные возвраты"
                value={summary.partialReturns || 0}
                format="number"
                icon={<PackageMinus className="h-4 w-4" />}
                delay={0.05}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard
              title="Валовая по цене продавца"
              value={(summary as any).grossBySellerPrice || 0}
              format="currency"
              icon={<DollarSign className="h-4 w-4" />}
              subtitle="по доставленным единицам (без возвратов)"
              delay={0}
            />
            <MetricCard
              title="Проданных единиц"
              value={summary.soldUnits ?? 0}
              format="number"
              icon={<Package className="h-4 w-4" />}
              subtitle="доставлено по позициям, за вычетом возвратов"
              delay={0.02}
            />
            <MetricCard
              title="Валовая выручка"
              value={summary.grossRevenue || 0}
              format="currency"
              icon={<DollarSign className="h-4 w-4" />}
              subtitle="Выручка + Баллы + Программы партнёров"
              delay={0.03}
            />
            <MetricCard
              title="Удержания Ozon"
              value={summary.ozonFees || 0}
              format="currency"
              delay={0.05}
            />
            <MetricCard
              title="Итого начислено"
              value={summary.netPayout || 0}
              format="currency"
              subtitle="Валовая по цене продавца − Удержания Ozon"
              className={(summary.netPayout || 0) >= 0 ? "border-success/30" : "border-destructive/30"}
              delay={0.1}
            />
            <MetricCard
              title="% удержаний"
              value={summary.feesPercent || 0}
              format="percent"
              icon={<Percent className="h-4 w-4" />}
              delay={0.2}
            />
            <MetricCard
              title="% возвратов"
              value={summary.returnRate || 0}
              format="percent"
              className={(summary.returnRate || 0) > 5 ? "border-warning/30" : ""}
              delay={0.25}
            />
            {summary.totalCostSold && summary.totalCostSold > 0 && (
              <MetricCard
                title="Себестоимость проданных"
                value={summary.totalCostSold || 0}
                format="currency"
                delay={0.3}
              />
            )}
            {summary.totalNetProfit !== undefined && (
              <MetricCard
                title="Чистая прибыль"
                value={summary.totalNetProfit}
                format="currency"
                className={(summary.totalNetProfit || 0) >= 0 ? "border-success/30" : "border-destructive/30"}
                delay={0.35}
              />
            )}
          </div>
          
          {/* Детализация валовой выручки */}
          {(summary.revenueAmount || summary.pointsAmount || (summary as any).partnerProgramsAmount) && (
            <div className="mt-4 p-4 rounded-lg bg-muted/30 text-sm text-muted-foreground">
              <div className="font-medium text-foreground mb-2">Валовая выручка складывается из:</div>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>Выручка: {formatCurrency(summary.revenueAmount || 0)}</span>
                <span>Баллы за скидки: {formatCurrency(summary.pointsAmount || 0)}</span>
                <span>Программы партнёров: {formatCurrency((summary as any).partnerProgramsAmount || 0)}</span>
              </div>
            </div>
          )}
          
          {/* Информация о себестоимости (дополнительная) */}
          {summary.totalCostSold && summary.totalCostSold > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-primary/10 text-sm space-y-2">
              <div className="font-semibold text-foreground">Дополнительная информация</div>
              <div className="flex flex-wrap gap-4 text-muted-foreground">
                {summary.productsWithCost && (
                  <span>Товаров с себестоимостью: {summary.productsWithCost}</span>
                )}
                {summary.ordersWithCost && (
                  <span>Заказов с себестоимостью: {summary.ordersWithCost}</span>
                )}
              </div>
            </div>
          )}
        </motion.section>
        
        {/* Основные графики */}
        <motion.section variants={fadeInUp}>
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="w-full md:w-auto grid grid-cols-6 md:inline-flex">
              <TabsTrigger value="overview">Обзор</TabsTrigger>
              <TabsTrigger value="costs">Начисления</TabsTrigger>
              <TabsTrigger value="products">Товары</TabsTrigger>
              <TabsTrigger value="orders">Рентабельность заказов</TabsTrigger>
              <TabsTrigger value="cost-reports">Себестоимость</TabsTrigger>
              <TabsTrigger value="problems">Проблемы</TabsTrigger>
            </TabsList>
            
            {/* Обзор */}
            <TabsContent value="overview" className="space-y-6">
              {/* Уведомление о неполном расчете */}
              {data.costReports && data.costReports.productsWithoutCost && data.costReports.productsWithoutCost.length > 0 && (
                <Card className="glass border-warning/50 bg-warning/10">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-semibold text-warning mb-1">Расчёт не полный</div>
                        <p className="text-sm text-muted-foreground">
                          У {data.costReports.productsWithoutCost.length} товаров не указана себестоимость. 
                          Для полного расчета прибыльности загрузите файл себестоимости или укажите себестоимость вручную.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <div className="flex justify-end gap-2 mb-4">
                <ExportSectionButton
                  onExport={() => {
                    exportOverviewData(
                      summary,
                      data.chargeTypeBreakdown || [],
                      profitTrends || [],
                      dailyMetrics || []
                    );
                  }}
                  label="Экспорт в XLSX"
                />
                <AIAnalysisButton
                  analysisId={id}
                  analysisType="overview"
                  analysisData={prepareAnalysisContext("overview", data)}
                  label="AI Анализ: Обзор"
                />
              </div>
              
              {/* Сводка: положительные и отрицательные поступления */}
              <RevenueCostCharts
                chargeTypeBreakdown={data.chargeTypeBreakdown || []}
              />
              
              {/* График динамики */}
              <ProfitChart 
                data={profitTrends || []} 
                dailyMetrics={dailyMetrics}
                periodStart={data.period?.start ? new Date(data.period.start) : undefined}
                periodEnd={data.period?.end ? new Date(data.period.end) : undefined}
              />
            </TabsContent>
            
            {/* Начисления */}
            <TabsContent value="costs" className="space-y-6">
              <div className="flex justify-end mb-4">
                <ExportSectionButton
                  onExport={() => {
                    exportAccrualsData(data.chargeTypeBreakdown || []);
                  }}
                  label="Экспорт в XLSX"
                />
              </div>
              
              {/* Детальный разбор по типам */}
              <CostBreakdownDetails
                chargeTypeBreakdown={data.chargeTypeBreakdown || []}
                orders={data.orders || []}
              />
            </TabsContent>
            
            {/* Товары */}
            <TabsContent value="products" className="space-y-6">
              <div className="flex justify-end gap-2 mb-4">
                <ExportSectionButton
                  onExport={() => {
                    // Экспортируем "сырые" метрики товаров (productMetrics), чтобы в XLSX были заполнены
                    // комиссии/логистика/возвраты/количество/к выплате и т.д.
                    // Если их нет (например, в mock), делаем fallback на topProducts.
                    const pm = (data as any).productMetrics;
                    const source = Array.isArray(pm) && pm.length > 0 ? pm : (data.topProducts || []);
                    exportProductsData(source);
                  }}
                  label="Экспорт в XLSX"
                />
                <AIAnalysisButton
                  analysisId={id}
                  analysisType="products"
                  analysisData={prepareAnalysisContext("products", data)}
                  label="AI Анализ: Товары"
                />
              </div>
              
              {/* Все товары по прибыльности */}
              <AllProductsTable 
                products={data.topProducts || []} 
                orders={data.orders || []} 
                analysisId={id}
                summary={data.summary}
                onRecalculate={async (excludedSkus) => {
                  void originalData;
                  const res = await fetch(`/api/analysis/${id}/recalculate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ excludedArticles: excludedSkus }),
                  });
                  if (!res.ok) return;
                  const recalculated = (await res.json()) as FrontendAnalysisResult;
                  setData(recalculated);
                  setAnalysisResult(recalculated);
                }}
              />
            </TabsContent>
            
            {/* Рентабельность заказов */}
            <TabsContent value="orders" className="space-y-6">
              <div className="flex justify-end gap-2 mb-4">
                <ExportSectionButton
                  onExport={() => {
                    exportOrdersData(data.orders || []);
                  }}
                  label="Экспорт в XLSX"
                />
                <AIAnalysisButton
                  analysisId={id}
                  analysisType="orders"
                  analysisData={prepareAnalysisContext("orders", data)}
                  label="AI Анализ: Заказы"
                />
              </div>
              
              <OrdersProfitabilityTable orders={data.orders || []} />
            </TabsContent>
            
            {/* Отчёты по себестоимости */}
            <TabsContent value="cost-reports" className="space-y-6">
              <div className="flex justify-end gap-2 mb-4">
                {data.costReports && (
                  <ExportSectionButton
                    onExport={() => {
                      exportCostReportsData(data.costReports!);
                    }}
                    label="Экспорт в XLSX"
                  />
                )}
                <AIAnalysisButton
                  analysisId={id}
                  analysisType="cost-reports"
                  analysisData={prepareAnalysisContext("cost-reports", data)}
                  label="AI Анализ: Себестоимость"
                />
              </div>
              
              {data.costReports ? (
                <>
                  {/* Сравнение артикулов - всегда показываем, если есть costReports */}
                  <Card className="glass border-primary/30">
                    <CardHeader>
                      <CardTitle>Сравнение артикулов</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Сравните артикулы из файла себестоимости и файла начислений для диагностики проблем сопоставления
                      </p>
                    </CardHeader>
                    <CardContent>
                      {data.costReports.articlesComparison ? (
                        <ArticlesComparison
                          costArticles={data.costReports.articlesComparison.costArticles || []}
                          orderArticles={data.costReports.articlesComparison.orderArticles || []}
                        />
                      ) : (
                        <div className="py-12 text-center text-muted-foreground">
                          <p className="mb-2">Данные для сравнения артикулов не найдены</p>
                          <p className="text-xs">
                            Загрузите файл себестоимости и перезапустите анализ для просмотра сравнения артикулов
                          </p>
                          <p className="text-xs mt-2 font-mono text-muted-foreground/70">
                            Debug: articlesComparison = {JSON.stringify(!!data.costReports?.articlesComparison)}
                            <br />
                            costReports exists: {JSON.stringify(!!data.costReports)}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  {/* Разделитель */}
                  <Separator />
                  
                  {/* Сводка по себестоимости */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="glass">
                      <CardHeader>
                        <CardTitle className="text-sm">Товары с себестоимостью</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{data.costReports.productsWithCost.length}</div>
                        <div className="text-sm text-muted-foreground mt-2">
                          Себестоимость: {formatCurrency(data.costReports.totalCostSold || 0)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="glass">
                      <CardHeader>
                        <CardTitle className="text-sm">Товары без себестоимости</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{data.costReports.productsWithoutCost.length}</div>
                      </CardContent>
                    </Card>
                    <Card className="glass border-success/30">
                      <CardHeader>
                        <CardTitle className="text-sm">Чистая прибыль</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className={cn(
                          "text-2xl font-bold",
                          (data.costReports.totalNetProfit || 0) >= 0 ? "text-success" : "text-destructive"
                        )}>
                          {formatCurrency(data.costReports.totalNetProfit || 0)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Товары с себестоимостью */}
                  <ProductsWithCostTable
                    products={Array.isArray(data.costReports?.productsWithCost) ? data.costReports.productsWithCost.map((p: any) => ({
                      article: p.article,
                      sku: p.sku,
                      name: p.name || p.productName || `Товар ${p.sku || p.article || "N/A"}`,
                      sold: p.sold ?? p.totalSold,
                      costPerUnit: p.costPerUnit,
                      totalCost: p.totalCost,
                      revenue: p.revenue ?? p.totalRevenue,
                      netProfit: p.netProfit,
                      profitMargin: p.profitMargin ?? p.profitMarginPercent ?? p.marginPercent,
                    })) : []}
                    title="Товары с себестоимостью"
                  />
                  
                  {/* Товары без себестоимости */}
                  {data.costReports?.productsWithoutCost && Array.isArray(data.costReports.productsWithoutCost) && data.costReports.productsWithoutCost.length > 0 && (
                    <ProductsWithoutCostTable
                      products={data.costReports.productsWithoutCost.map((p: any) => ({
                        article: p.article,
                        sku: p.sku,
                        name: p.name || p.productName || `Товар ${p.sku || p.article || "N/A"}`,
                        revenue: p.revenue ?? p.totalRevenue,
                        profit: p.profit ?? p.netAmount ?? 0,
                        orders: p.orders ?? p.ordersCount ?? 0,
                      }))}
                      title="Товары без себестоимости"
                      onRecalculate={async (excludedSkus) => {
                        const res = await fetch(`/api/analysis/${id}/recalculate`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ excludedArticles: excludedSkus }),
                        });
                        if (!res.ok) return;
                        const recalculated = (await res.json()) as FrontendAnalysisResult;
                        setData(recalculated);
                        setAnalysisResult(recalculated);
                      }}
                    />
                  )}
                  
                  {/* Заказы с себестоимостью */}
                  <Collapsible defaultOpen={false} className="space-y-2">
                    <CollapsibleTrigger asChild>
                      <Card className="glass cursor-pointer hover:bg-muted/50 transition-colors group">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle>Заказы с себестоимостью ({data.costReports.ordersWithCost.length})</CardTitle>
                            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                          </div>
                        </CardHeader>
                      </Card>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Card className="glass">
                        <CardContent className="pt-6">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-3 px-2 font-medium">Номер заказа</th>
                                  <th className="text-left py-3 px-2 font-medium">Товар</th>
                                  <th className="text-right py-3 px-2 font-medium">Кол-во</th>
                                  <th className="text-right py-3 px-2 font-medium">Себестоимость ед.</th>
                                  <th className="text-right py-3 px-2 font-medium">Себестоимость общая</th>
                                  <th className="text-right py-3 px-2 font-medium">Выручка</th>
                                  <th className="text-right py-3 px-2 font-medium">К выплате</th>
                                  <th className="text-right py-3 px-2 font-medium">Чистая прибыль</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.costReports.ordersWithCost.length === 0 ? (
                                  <tr>
                                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                                      Нет заказов с себестоимостью
                                    </td>
                                  </tr>
                                ) : (
                                  (Array.isArray(data.costReports?.ordersWithCost) ? data.costReports.ordersWithCost : []).slice(0, 100).map((order: any, index: number) => (
                                    <tr key={index} className="border-b last:border-0 hover:bg-muted/30">
                                      <td className="py-3 px-2 font-mono text-xs">{order.orderNumber}</td>
                                      <td className="py-3 px-2 max-w-[200px] truncate">{order.productName}</td>
                                      <td className="py-3 px-2 text-right">{order.quantity || 0}</td>
                                      <td className="py-3 px-2 text-right text-muted-foreground">
                                        {formatCurrency(order.costPerUnit || 0)}
                                      </td>
                                      <td className="py-3 px-2 text-right text-muted-foreground">
                                        {formatCurrency(order.totalCost || 0)}
                                      </td>
                                      <td className="py-3 px-2 text-right">{formatCurrency(order.revenue || 0)}</td>
                                      <td className="py-3 px-2 text-right">{formatCurrency(order.profit || 0)}</td>
                                      <td className={cn(
                                        "py-3 px-2 text-right font-semibold",
                                        (order.netProfit || 0) >= 0 ? "text-success" : "text-destructive"
                                      )}>
                                        {order.netProfit !== undefined ? formatCurrency(order.netProfit) : "-"}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    </CollapsibleContent>
                  </Collapsible>
                  
                  {/* Заказы без себестоимости */}
                  {data.costReports.ordersWithoutCost.length > 0 && (
                    <Card className="glass border-warning/30">
                      <CardHeader>
                        <CardTitle>Заказы без себестоимости ({data.costReports.ordersWithoutCost.length})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-3 px-2 font-medium">Номер заказа</th>
                                <th className="text-left py-3 px-2 font-medium">Артикул</th>
                                <th className="text-left py-3 px-2 font-medium">Товар</th>
                                <th className="text-right py-3 px-2 font-medium">Выручка</th>
                                <th className="text-right py-3 px-2 font-medium">К выплате</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(Array.isArray(data.costReports?.ordersWithoutCost) ? data.costReports.ordersWithoutCost : []).slice(0, 100).map((order: any, index: number) => (
                                <tr key={index} className="border-b last:border-0 hover:bg-muted/30">
                                  <td className="py-3 px-2 font-mono text-xs">{order.orderNumber}</td>
                                  <td className="py-3 px-2 font-mono text-xs">{order.article || order.sku || "-"}</td>
                                  <td className="py-3 px-2 max-w-[200px] truncate">{order.productName}</td>
                                  <td className="py-3 px-2 text-right">{formatCurrency(order.revenue || 0)}</td>
                                  <td className="py-3 px-2 text-right">{formatCurrency(order.profit || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card className="glass">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Файл себестоимости не загружен. Загрузите файл себестоимости для просмотра отчётов.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            
            {/* Проблемы */}
            <TabsContent value="problems" className="space-y-6">
              <div className="flex justify-end gap-2 mb-4">
                <ExportSectionButton
                  onExport={() => {
                    exportProblemsData(
                      cancellationReasons || [],
                      returnReasons || []
                    );
                  }}
                  label="Экспорт в XLSX"
                />
                <AIAnalysisButton
                  analysisId={id}
                  analysisType="problems"
                  analysisData={prepareAnalysisContext("problems", data)}
                  label="AI Анализ: Проблемы"
                />
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CancellationChart data={cancellationReasons || []} title="Причины отмен" />
                <CancellationChart data={returnReasons || []} title="Причины возвратов" />
              </div>

              {Array.isArray((data as any).incompleteOrders) && (data as any).incompleteOrders.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-warning">
                      <AlertTriangle className="h-4 w-4" />
                      Неполные заказы (на границе периода)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Заказы, у которых в отчётном периоде отсутствуют некоторые начисления
                      (например, только эквайринг или только логистика). Возможно, часть начислений
                      ушла в соседний период.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-2 pr-4">ID заказа</th>
                            <th className="py-2 pr-4">Дата</th>
                            <th className="py-2 pr-4">Отсутствуют</th>
                            <th className="py-2 pr-4 text-right">Сумма, ₽</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data as any).incompleteOrders.slice(0, 200).map((o: any) => (
                            <tr key={o.orderKey} className="border-b">
                              <td className="py-2 pr-4 font-mono">{o.orderKey}</td>
                              <td className="py-2 pr-4">{o.orderDate ? formatDate(o.orderDate) : "—"}</td>
                              <td className="py-2 pr-4">{Array.isArray(o.missing) ? o.missing.join(", ") : "—"}</td>
                              <td className="py-2 pr-4 text-right">{formatCurrency(o.totalAmount || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </motion.section>
        
        {/* Рекомендации */}
        <motion.section variants={fadeInUp}>
          <RecommendationsList 
            recommendations={recommendations} 
            analysisId={id}
            analysisData={data}
          />
        </motion.section>
        
        {/* Экспорт */}
        <motion.section variants={fadeInUp}>
          <Separator className="mb-8" />
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">Скачать отчёт</h3>
              <p className="text-sm text-muted-foreground">
                Экспортируйте данные для дальнейшего использования
              </p>
            </div>
            <ExportButtons analysisId={id} />
          </div>
        </motion.section>
      </motion.div>
    </div>
  );
}

interface ProductRowProps {
  product: ProductData;
  isLoss?: boolean;
}

function ProductRow({ product, isLoss }: ProductRowProps) {
  return (
    <div className={cn(
      "p-4 rounded-lg",
      isLoss ? "bg-destructive/10" : "bg-muted/50"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{product.name}</p>
          <p className="text-sm text-muted-foreground">{product.sku}</p>
        </div>
        <div className="text-right">
          <p className={cn(
            "font-semibold",
            isLoss ? "text-destructive" : "text-success"
          )}>
            {formatCurrency(product.profit)}
          </p>
          <p className="text-xs text-muted-foreground">
            маржа {product.margin.toFixed(1)}%
          </p>
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
        <span>Заказов: {product.orders}</span>
        <span>Возвратов: {product.returnRate.toFixed(1)}%</span>
        <span>Отмен: {product.cancellationRate ? product.cancellationRate.toFixed(1) : "0"}%</span>
      </div>
    </div>
  );
}
