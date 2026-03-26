"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Download,
  AlertCircle,
} from "lucide-react";
import { exportToXLSX } from "@/lib/utils/export-xlsx";
import type { BulkCalcResult } from "@/lib/types/calculator";

const TAX_LABELS: Record<string, string> = {
  none: "Без налога",
  usn6: "УСН 6%",
  usn15: "УСН 15%",
  nds22: "НДС 22% + НП 25%",
};

interface OzonBulkResultsProps {
  results: BulkCalcResult[];
  meta?: {
    totalProducts: number;
    calculatedProducts: number;
    errorProducts: number;
    acquiringPct: number;
    dispatchFee: number;
    lastMileFee: number;
    pickupPointType: string;
    acceptanceType: string;
    deliveryToPickupPoint: number;
    otherExpenses: number;
    taxRegime: string;
    targetNetProfitRub?: number;
    targetNetProfitMinMarginPct?: number;
    targetNetProfitMaxMarginPct?: number;
  };
}

export function OzonBulkResults({ results, meta }: OzonBulkResultsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<string>("article");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Фильтрация по поиску
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return results;
    const q = searchQuery.toLowerCase().trim();
    return results.filter(
      (r) =>
        r.article.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [results, searchQuery]);

  // Сортировка
  const sortedResults = useMemo(() => {
    const arr = [...filteredResults];
    arr.sort((a, b) => {
      let va: any, vb: any;
      switch (sortField) {
        case "article": va = a.article; vb = b.article; break;
        case "name": va = a.name; vb = b.name; break;
        case "category": va = a.category; vb = b.category; break;
        case "cost": va = a.cost; vb = b.cost; break;
        case "volume": va = a.volumeLiters; vb = b.volumeLiters; break;
        case "margin": va = a.targetMargin; vb = b.targetMargin; break;
        case "fboPrice": va = a.fbo.recommendedPrice; vb = b.fbo.recommendedPrice; break;
        case "fbsPrice": va = a.fbs.recommendedPrice; vb = b.fbs.recommendedPrice; break;
        case "fboProfit": va = a.fbo.profit; vb = b.fbo.profit; break;
        case "fbsProfit": va = a.fbs.profit; vb = b.fbs.profit; break;
        default: va = a.article; vb = b.article;
      }
      if (typeof va === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return arr;
  }, [filteredResults, sortField, sortDir]);

  // Пагинация
  const totalPages = Math.ceil(sortedResults.length / pageSize);
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedResults.slice(start, start + pageSize);
  }, [sortedResults, currentPage, pageSize]);

  // Сброс страницы при изменении фильтров
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (size: string) => {
    setPageSize(Number(size));
    setCurrentPage(1);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortIndicator = (field: string) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const hasTax = meta?.taxRegime && meta.taxRegime !== "none";
  const taxLabel = meta?.taxRegime ? TAX_LABELS[meta.taxRegime] || meta.taxRegime : "";
  const hasOtherExpenses = (meta?.otherExpenses || 0) > 0;
  const hasProfitTarget =
    meta?.targetNetProfitRub !== undefined &&
    meta?.targetNetProfitRub !== null &&
    !isNaN(Number(meta.targetNetProfitRub));
  const hasProfitMarginBounds =
    hasProfitTarget &&
    ((meta?.targetNetProfitMinMarginPct !== undefined &&
      meta?.targetNetProfitMinMarginPct !== null &&
      !isNaN(Number(meta.targetNetProfitMinMarginPct))) ||
      (meta?.targetNetProfitMaxMarginPct !== undefined &&
        meta?.targetNetProfitMaxMarginPct !== null &&
        !isNaN(Number(meta.targetNetProfitMaxMarginPct))));

  // Экспорт в XLSX
  const handleExport = () => {
    const exportData = sortedResults.map((r) => {
      const row: Record<string, string | number> = {
        "Артикул": r.article,
        "Наименование": r.name,
        "Категория": r.category,
        "Себестоимость, ₽": r.cost,
      };
      if (hasOtherExpenses) {
        row["Прочие затраты, ₽"] = r.otherExpenses;
        row["Общая себестоимость, ₽"] = (r.cost + r.otherExpenses).toFixed(2);
      }
      Object.assign(row, {
        "Объём, л": r.volumeLiters.toFixed(3),
        "План. маржа % от себестоимости": r.targetMargin,
        // FBO
        "FBO Цена, ₽": r.fbo.recommendedPrice.toFixed(2),
        "FBO Комиссия, %": r.fbo.commissionPct,
        "FBO Комиссия, ₽": r.fbo.commissionAmount.toFixed(2),
        "FBO Логистика, ₽": r.fbo.shippingCost.toFixed(2),
        "FBO Последняя миля, ₽": r.fbo.deliveryToPickup.toFixed(2),
        "FBO Эквайринг, ₽": r.fbo.acquiringFee.toFixed(2),
        "FBO Итого сборы, ₽": r.fbo.totalFees.toFixed(2),
        "FBO К начислению, ₽": (r.fbo.recommendedPrice - r.fbo.totalFees).toFixed(2),
        "FBO Прибыль (до налога), ₽": r.fbo.profit.toFixed(2),
      });
      if (hasTax) {
        row[`FBO Налог (${taxLabel}), ₽`] = r.fbo.taxAmount.toFixed(2);
        row["FBO Чистая прибыль, ₽"] = r.fbo.netProfit.toFixed(2);
        row["FBO Чистая маржа, %"] = r.fbo.netMarginPct;
      }
      Object.assign(row, {
        "FBO Маржинальность, %": r.fbo.marginPct,
        "FBO Наценка, %": r.fbo.markupPct,
        // FBS
        "FBS Цена, ₽": r.fbs.recommendedPrice.toFixed(2),
        "FBS Комиссия, %": r.fbs.commissionPct,
        "FBS Комиссия, ₽": r.fbs.commissionAmount.toFixed(2),
        "FBS Логистика, ₽": r.fbs.shippingCost.toFixed(2),
        "FBS Отправление, ₽": r.fbs.dispatchFee.toFixed(2),
        "FBS Доставка до ПВЗ, ₽": r.fbs.deliveryToPickup.toFixed(2),
        "FBS Эквайринг, ₽": r.fbs.acquiringFee.toFixed(2),
        "FBS Итого сборы, ₽": r.fbs.totalFees.toFixed(2),
        "FBS К начислению, ₽": (r.fbs.recommendedPrice - r.fbs.totalFees).toFixed(2),
        "FBS Прибыль (до налога), ₽": r.fbs.profit.toFixed(2),
      });
      if (hasTax) {
        row[`FBS Налог (${taxLabel}), ₽`] = r.fbs.taxAmount.toFixed(2);
        row["FBS Чистая прибыль, ₽"] = r.fbs.netProfit.toFixed(2);
        row["FBS Чистая маржа, %"] = r.fbs.netMarginPct;
      }
      Object.assign(row, {
        "FBS Маржинальность, %": r.fbs.marginPct,
        "FBS Наценка, %": r.fbs.markupPct,
        // RFBS
        "RFBS Цена, ₽": r.rfbs.recommendedPrice.toFixed(2),
        "RFBS Комиссия, %": r.rfbs.commissionPct,
        "RFBS Комиссия, ₽": r.rfbs.commissionAmount.toFixed(2),
        "RFBS Эквайринг, ₽": r.rfbs.acquiringFee.toFixed(2),
        "RFBS Итого сборы, ₽": r.rfbs.totalFees.toFixed(2),
        "RFBS К начислению, ₽": (r.rfbs.recommendedPrice - r.rfbs.totalFees).toFixed(2),
        "RFBS Прибыль (до налога), ₽": r.rfbs.profit.toFixed(2),
      });
      if (hasTax) {
        row[`RFBS Налог (${taxLabel}), ₽`] = r.rfbs.taxAmount.toFixed(2);
        row["RFBS Чистая прибыль, ₽"] = r.rfbs.netProfit.toFixed(2);
        row["RFBS Чистая маржа, %"] = r.rfbs.netMarginPct;
      }
      Object.assign(row, {
        "RFBS Маржинальность, %": r.rfbs.marginPct,
        "RFBS Наценка, %": r.rfbs.markupPct,
        "Ошибка": r.error || "",
      });
      if (hasProfitTarget && !r.error) {
        row["Цель чистой прибыли, ₽"] = meta!.targetNetProfitRub!;
        if (hasProfitMarginBounds) {
          if (
            meta!.targetNetProfitMinMarginPct !== undefined &&
            meta!.targetNetProfitMinMarginPct !== null &&
            !isNaN(Number(meta!.targetNetProfitMinMarginPct))
          ) {
            row["Цель ₽: не менее маржи, %"] = meta!.targetNetProfitMinMarginPct!;
          }
          if (
            meta!.targetNetProfitMaxMarginPct !== undefined &&
            meta!.targetNetProfitMaxMarginPct !== null &&
            !isNaN(Number(meta!.targetNetProfitMaxMarginPct))
          ) {
            row["Цель ₽: не более маржи, %"] = meta!.targetNetProfitMaxMarginPct!;
          }
        }
        row["FBO Цена (цель ₽), ₽"] =
          r.fbo.recommendedPriceByNetProfit != null ? r.fbo.recommendedPriceByNetProfit.toFixed(2) : "";
        row["FBS Цена (цель ₽), ₽"] =
          r.fbs.recommendedPriceByNetProfit != null ? r.fbs.recommendedPriceByNetProfit.toFixed(2) : "";
        row["RFBS Цена (цель ₽), ₽"] =
          r.rfbs.recommendedPriceByNetProfit != null ? r.rfbs.recommendedPriceByNetProfit.toFixed(2) : "";
      }
      return row;
    });

    const date = new Date().toISOString().split("T")[0];
    exportToXLSX(exportData, `Массовый_расчёт_${date}.xlsx`, "Расчёт");
  };

  const fmtMoney = (v: number) =>
    v.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  if (results.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle>Результаты массового расчёта</CardTitle>
            <CardDescription className="mt-1">
              {meta && (
                <span className="flex gap-3 flex-wrap">
                  <Badge variant="outline">Всего: {meta.totalProducts}</Badge>
                  <Badge variant="default" className="bg-green-600">Рассчитано: {meta.calculatedProducts}</Badge>
                  {meta.errorProducts > 0 && (
                    <Badge variant="destructive">Ошибки: {meta.errorProducts}</Badge>
                  )}
                  {hasTax && (
                    <Badge variant="secondary">{taxLabel}</Badge>
                  )}
                  {hasOtherExpenses && (
                    <Badge variant="secondary">Прочие: {meta.otherExpenses} ₽/шт</Badge>
                  )}
                  {hasProfitTarget && (
                    <Badge variant="secondary">Цель чистой прибыли: {meta.targetNetProfitRub} ₽/шт</Badge>
                  )}
                  {hasProfitMarginBounds && meta && (() => {
                    const parts: string[] = [];
                    if (
                      meta.targetNetProfitMinMarginPct != null &&
                      !isNaN(Number(meta.targetNetProfitMinMarginPct))
                    ) {
                      parts.push(`не ниже ${meta.targetNetProfitMinMarginPct}%`);
                    }
                    if (
                      meta.targetNetProfitMaxMarginPct != null &&
                      !isNaN(Number(meta.targetNetProfitMaxMarginPct))
                    ) {
                      parts.push(`не выше ${meta.targetNetProfitMaxMarginPct}%`);
                    }
                    return (
                      <Badge variant="outline">Рамки цели ₽: {parts.join("; ")}</Badge>
                    );
                  })()}
                </span>
              )}
            </CardDescription>
          </div>
          <Button onClick={handleExport} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Экспорт в XLSX
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Поиск и настройки */}
        <div className="flex gap-4 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Поиск по артикулу, названию, категории..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Показывать:</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Результаты: {filteredResults.length} из {results.length} */}
        {searchQuery && (
          <p className="text-sm text-muted-foreground">
            Найдено: {filteredResults.length} из {results.length}
          </p>
        )}

        {/* Таблица */}
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-xs border-collapse min-w-[1400px]">
            <thead>
              {/* Группировка колонок */}
              <tr className="border-b bg-muted/30">
                <th colSpan={6} className="py-2 px-2 text-left font-semibold text-muted-foreground border-r">
                  Товар
                </th>
                <th colSpan={(hasTax ? 7 : 5) + (hasProfitTarget ? 1 : 0)} className="py-2 px-2 text-center font-semibold text-blue-600 border-r">
                  FBO
                </th>
                <th colSpan={(hasTax ? 8 : 6) + (hasProfitTarget ? 1 : 0)} className="py-2 px-2 text-center font-semibold text-green-600 border-r">
                  FBS
                </th>
                <th colSpan={(hasTax ? 6 : 4) + (hasProfitTarget ? 1 : 0)} className="py-2 px-2 text-center font-semibold text-orange-600">
                  RFBS
                </th>
              </tr>
              <tr className="border-b bg-muted/20">
                {/* Товар */}
                <th className="py-2 px-2 text-left cursor-pointer hover:bg-muted/40 whitespace-nowrap" onClick={() => handleSort("article")}>
                  Артикул{sortIndicator("article")}
                </th>
                <th className="py-2 px-2 text-left cursor-pointer hover:bg-muted/40 whitespace-nowrap" onClick={() => handleSort("name")}>
                  Наименование{sortIndicator("name")}
                </th>
                <th className="py-2 px-2 text-left cursor-pointer hover:bg-muted/40 whitespace-nowrap" onClick={() => handleSort("category")}>
                  Категория{sortIndicator("category")}
                </th>
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap" onClick={() => handleSort("cost")}>
                  Себест.{sortIndicator("cost")}
                </th>
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap" onClick={() => handleSort("volume")}>
                  Объём{sortIndicator("volume")}
                </th>
                <th
                  className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap border-r"
                  title="Плановая маржа: процент от полной себестоимости (закуп + прочие)"
                  onClick={() => handleSort("margin")}
                >
                  План %{sortIndicator("margin")}
                </th>
                {/* FBO */}
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap text-blue-600" onClick={() => handleSort("fboPrice")}>
                  Цена{sortIndicator("fboPrice")}
                </th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-blue-500">Сборы</th>
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap text-blue-600" onClick={() => handleSort("fboProfit")}>
                  {hasTax ? "Приб." : "Прибыль"}{sortIndicator("fboProfit")}
                </th>
                {hasTax && (
                  <>
                    <th className="py-2 px-2 text-right whitespace-nowrap text-blue-500">Налог</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap text-blue-600 font-bold">Чист.</th>
                  </>
                )}
                <th className="py-2 px-2 text-right whitespace-nowrap text-blue-500">Марж%</th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-blue-500 border-r">Нац%</th>
                {hasProfitTarget && (
                  <th className="py-2 px-2 text-right whitespace-nowrap text-blue-600 border-r" title="Цена для целевой чистой прибыли, ₽">
                    Цена₽+
                  </th>
                )}
                {/* FBS */}
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap text-green-600" onClick={() => handleSort("fbsPrice")}>
                  Цена{sortIndicator("fbsPrice")}
                </th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-green-500">Сборы</th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-green-500">Отпр.</th>
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap text-green-600" onClick={() => handleSort("fbsProfit")}>
                  {hasTax ? "Приб." : "Прибыль"}{sortIndicator("fbsProfit")}
                </th>
                {hasTax && (
                  <>
                    <th className="py-2 px-2 text-right whitespace-nowrap text-green-500">Налог</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap text-green-600 font-bold">Чист.</th>
                  </>
                )}
                <th className="py-2 px-2 text-right whitespace-nowrap text-green-500">Марж%</th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-green-500 border-r">Нац%</th>
                {hasProfitTarget && (
                  <th className="py-2 px-2 text-right whitespace-nowrap text-green-600 border-r" title="Цена для целевой чистой прибыли, ₽">
                    Цена₽+
                  </th>
                )}
                {/* RFBS */}
                <th className="py-2 px-2 text-right whitespace-nowrap text-orange-600">Цена</th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-orange-500">{hasTax ? "Приб." : "Прибыль"}</th>
                {hasTax && (
                  <>
                    <th className="py-2 px-2 text-right whitespace-nowrap text-orange-500">Налог</th>
                    <th className="py-2 px-2 text-right whitespace-nowrap text-orange-600 font-bold">Чист.</th>
                  </>
                )}
                <th className="py-2 px-2 text-right whitespace-nowrap text-orange-500">Марж%</th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-orange-500">Нац%</th>
                {hasProfitTarget && (
                  <th className="py-2 px-2 text-right whitespace-nowrap text-orange-600" title="Цена для целевой чистой прибыли, ₽">
                    Цена₽+
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedResults.map((r, idx) => {
                const totalColSpan = (hasTax ? 21 : 15) + (hasProfitTarget ? 3 : 0);
                return (
                <tr
                  key={`${r.article}-${idx}`}
                  className={`border-b hover:bg-muted/20 transition-colors ${r.error ? "bg-red-50 dark:bg-red-950/10" : ""}`}
                >
                  {/* Товар */}
                  <td className="py-2 px-2 font-mono text-xs">{r.article}</td>
                  <td className="py-2 px-2 max-w-[200px] truncate" title={r.name}>{r.name}</td>
                  <td className="py-2 px-2 max-w-[120px] truncate text-muted-foreground" title={r.category}>{r.category}</td>
                  <td className="py-2 px-2 text-right font-medium">{fmtMoney(r.cost)}</td>
                  <td className="py-2 px-2 text-right text-muted-foreground">{r.volumeLiters.toFixed(2)}</td>
                  <td className="py-2 px-2 text-right font-medium border-r">{r.targetMargin}%</td>

                  {r.error ? (
                    <td colSpan={totalColSpan} className="py-2 px-3 text-red-600">
                      <span className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {r.error}
                      </span>
                    </td>
                  ) : (
                    <>
                      {/* FBO */}
                      <td className="py-2 px-2 text-right font-bold text-blue-700 dark:text-blue-400">{fmtMoney(r.fbo.recommendedPrice)}</td>
                      <td className="py-2 px-2 text-right text-red-500 text-[10px]">
                        {fmtMoney(r.fbo.totalFees)}
                      </td>
                      <td className={`py-2 px-2 text-right font-medium ${r.fbo.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmtMoney(r.fbo.profit)}
                      </td>
                      {hasTax && (
                        <>
                          <td className="py-2 px-2 text-right text-red-500 text-[10px]">
                            {fmtMoney(r.fbo.taxAmount)}
                          </td>
                          <td className={`py-2 px-2 text-right font-bold ${r.fbo.netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                            {fmtMoney(r.fbo.netProfit)}
                          </td>
                        </>
                      )}
                      <td className="py-2 px-2 text-right text-muted-foreground">{hasTax ? r.fbo.netMarginPct : r.fbo.marginPct}%</td>
                      <td className="py-2 px-2 text-right text-muted-foreground border-r">{r.fbo.markupPct}%</td>
                      {hasProfitTarget && (
                        <td className="py-2 px-2 text-right font-semibold text-blue-800 dark:text-blue-300 border-r">
                          {r.fbo.recommendedPriceByNetProfit != null ? fmtMoney(r.fbo.recommendedPriceByNetProfit) : "—"}
                        </td>
                      )}

                      {/* FBS */}
                      <td className="py-2 px-2 text-right font-bold text-green-700 dark:text-green-400">{fmtMoney(r.fbs.recommendedPrice)}</td>
                      <td className="py-2 px-2 text-right text-red-500 text-[10px]">
                        {fmtMoney(r.fbs.totalFees)}
                      </td>
                      <td className="py-2 px-2 text-right text-muted-foreground text-[10px]">
                        {fmtMoney(r.fbs.dispatchFee)}
                      </td>
                      <td className={`py-2 px-2 text-right font-medium ${r.fbs.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmtMoney(r.fbs.profit)}
                      </td>
                      {hasTax && (
                        <>
                          <td className="py-2 px-2 text-right text-red-500 text-[10px]">
                            {fmtMoney(r.fbs.taxAmount)}
                          </td>
                          <td className={`py-2 px-2 text-right font-bold ${r.fbs.netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                            {fmtMoney(r.fbs.netProfit)}
                          </td>
                        </>
                      )}
                      <td className="py-2 px-2 text-right text-muted-foreground">{hasTax ? r.fbs.netMarginPct : r.fbs.marginPct}%</td>
                      <td className="py-2 px-2 text-right text-muted-foreground border-r">{r.fbs.markupPct}%</td>
                      {hasProfitTarget && (
                        <td className="py-2 px-2 text-right font-semibold text-green-800 dark:text-green-300 border-r">
                          {r.fbs.recommendedPriceByNetProfit != null ? fmtMoney(r.fbs.recommendedPriceByNetProfit) : "—"}
                        </td>
                      )}

                      {/* RFBS */}
                      <td className="py-2 px-2 text-right font-bold text-orange-700 dark:text-orange-400">{fmtMoney(r.rfbs.recommendedPrice)}</td>
                      <td className={`py-2 px-2 text-right font-medium ${r.rfbs.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmtMoney(r.rfbs.profit)}
                      </td>
                      {hasTax && (
                        <>
                          <td className="py-2 px-2 text-right text-red-500 text-[10px]">
                            {fmtMoney(r.rfbs.taxAmount)}
                          </td>
                          <td className={`py-2 px-2 text-right font-bold ${r.rfbs.netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                            {fmtMoney(r.rfbs.netProfit)}
                          </td>
                        </>
                      )}
                      <td className="py-2 px-2 text-right text-muted-foreground">{hasTax ? r.rfbs.netMarginPct : r.rfbs.marginPct}%</td>
                      <td className="py-2 px-2 text-right text-muted-foreground">{r.rfbs.markupPct}%</td>
                      {hasProfitTarget && (
                        <td className="py-2 px-2 text-right font-semibold text-orange-800 dark:text-orange-300">
                          {r.rfbs.recommendedPriceByNetProfit != null ? fmtMoney(r.rfbs.recommendedPriceByNetProfit) : "—"}
                        </td>
                      )}
                    </>
                  )}
                </tr>
                );
              })}

              {paginatedResults.length === 0 && (
                <tr>
                  <td colSpan={(hasTax ? 27 : 21) + (hasProfitTarget ? 3 : 0)} className="py-8 text-center text-muted-foreground">
                    {searchQuery ? "Ничего не найдено" : "Нет данных"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Пагинация */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              Страница {currentPage} из {totalPages} ({filteredResults.length} записей)
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {/* Номера страниц */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={page}
                    variant={page === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className="w-8 h-8 p-0"
                  >
                    {page}
                  </Button>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
