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

  // Экспорт в XLSX
  const handleExport = () => {
    const exportData = sortedResults.map((r) => ({
      "Артикул": r.article,
      "Наименование": r.name,
      "Категория": r.category,
      "Себестоимость, ₽": r.cost,
      "Объём, л": r.volumeLiters.toFixed(3),
      "Маржа, %": r.targetMargin,
      // FBO
      "FBO Цена, ₽": r.fbo.recommendedPrice.toFixed(2),
      "FBO Комиссия, %": r.fbo.commissionPct,
      "FBO Комиссия, ₽": r.fbo.commissionAmount.toFixed(2),
      "FBO Логистика, ₽": r.fbo.shippingCost.toFixed(2),
      "FBO Последняя миля, ₽": r.fbo.deliveryToPickup.toFixed(2),
      "FBO Эквайринг, ₽": r.fbo.acquiringFee.toFixed(2),
      "FBO Итого сборы, ₽": r.fbo.totalFees.toFixed(2),
      "FBO К начислению, ₽": (r.fbo.recommendedPrice - r.fbo.totalFees).toFixed(2),
      "FBO Прибыль, ₽": r.fbo.profit.toFixed(2),
      "FBO Маржа от цены, %": r.fbo.marginPct,
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
      "FBS Прибыль, ₽": r.fbs.profit.toFixed(2),
      "FBS Маржа от цены, %": r.fbs.marginPct,
      // RFBS
      "RFBS Цена, ₽": r.rfbs.recommendedPrice.toFixed(2),
      "RFBS Комиссия, %": r.rfbs.commissionPct,
      "RFBS Комиссия, ₽": r.rfbs.commissionAmount.toFixed(2),
      "RFBS Эквайринг, ₽": r.rfbs.acquiringFee.toFixed(2),
      "RFBS Итого сборы, ₽": r.rfbs.totalFees.toFixed(2),
      "RFBS К начислению, ₽": (r.rfbs.recommendedPrice - r.rfbs.totalFees).toFixed(2),
      "RFBS Прибыль, ₽": r.rfbs.profit.toFixed(2),
      "RFBS Маржа от цены, %": r.rfbs.marginPct,
      // Ошибки
      "Ошибка": r.error || "",
    }));

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
                <th colSpan={4} className="py-2 px-2 text-center font-semibold text-blue-600 border-r">
                  FBO
                </th>
                <th colSpan={5} className="py-2 px-2 text-center font-semibold text-green-600 border-r">
                  FBS
                </th>
                <th colSpan={3} className="py-2 px-2 text-center font-semibold text-orange-600">
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
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap border-r" onClick={() => handleSort("margin")}>
                  Маржа%{sortIndicator("margin")}
                </th>
                {/* FBO */}
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap text-blue-600" onClick={() => handleSort("fboPrice")}>
                  Цена{sortIndicator("fboPrice")}
                </th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-blue-500">Сборы</th>
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap text-blue-600" onClick={() => handleSort("fboProfit")}>
                  Прибыль{sortIndicator("fboProfit")}
                </th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-blue-500 border-r">М%</th>
                {/* FBS */}
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap text-green-600" onClick={() => handleSort("fbsPrice")}>
                  Цена{sortIndicator("fbsPrice")}
                </th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-green-500">Сборы</th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-green-500">Отпр.</th>
                <th className="py-2 px-2 text-right cursor-pointer hover:bg-muted/40 whitespace-nowrap text-green-600" onClick={() => handleSort("fbsProfit")}>
                  Прибыль{sortIndicator("fbsProfit")}
                </th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-green-500 border-r">М%</th>
                {/* RFBS */}
                <th className="py-2 px-2 text-right whitespace-nowrap text-orange-600">Цена</th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-orange-500">Прибыль</th>
                <th className="py-2 px-2 text-right whitespace-nowrap text-orange-500">М%</th>
              </tr>
            </thead>
            <tbody>
              {paginatedResults.map((r, idx) => (
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
                    <td colSpan={12} className="py-2 px-3 text-red-600">
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
                      <td className="py-2 px-2 text-right text-muted-foreground border-r">{r.fbo.marginPct}%</td>

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
                      <td className="py-2 px-2 text-right text-muted-foreground border-r">{r.fbs.marginPct}%</td>

                      {/* RFBS */}
                      <td className="py-2 px-2 text-right font-bold text-orange-700 dark:text-orange-400">{fmtMoney(r.rfbs.recommendedPrice)}</td>
                      <td className={`py-2 px-2 text-right font-medium ${r.rfbs.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmtMoney(r.rfbs.profit)}
                      </td>
                      <td className="py-2 px-2 text-right text-muted-foreground">{r.rfbs.marginPct}%</td>
                    </>
                  )}
                </tr>
              ))}

              {paginatedResults.length === 0 && (
                <tr>
                  <td colSpan={18} className="py-8 text-center text-muted-foreground">
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
