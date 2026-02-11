"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface UploadStats {
  total: number;
  inserted: number;
  failed: number;
  parseErrors: number;
  parseErrorsSample?: string[];
}

interface UploadResponse {
  success?: boolean;
  message?: string;
  stats?: UploadStats;
  error?: string;
}

interface CategoryCommission {
  id: string;
  marketplace: string;
  categoryId: string | null;
  categoryName: string;
  categoryPath: string | null;
  productType?: string | null;
  fulfillment: string;
  priceMin?: number | null;
  priceMax?: number | null;
  tierLabel?: string | null;
  commissionPercent: number;
  minCommissionAmount: number | null;
  fixedFeeAmount: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CommissionsListResponse {
  success: boolean;
  data: CategoryCommission[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: Array<{
    marketplace: string;
    fulfillment: string;
    count: number;
  }>;
}

export default function CategoryCommissionsUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Состояние для просмотра данных
  const [commissions, setCommissions] = useState<CategoryCommission[]>([]);
  const [isLoadingCommissions, setIsLoadingCommissions] = useState(false);
  const [commissionsError, setCommissionsError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<Array<{ marketplace: string; fulfillment: string; count: number }>>([]);
  const [filters, setFilters] = useState({ marketplace: "all", fulfillment: "all", search: "" });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
    setError(null);
    setUploadProgress(0);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!file) {
      setError("Пожалуйста, выберите файл Excel (.xlsx или .xls).");
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
      setError("Поддерживаются только файлы Excel: .xlsx или .xls.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setResult(null);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/category-commissions/upload", {
        method: "POST",
        body: formData,
      });

      setUploadProgress(70);

      const data = (await response.json()) as UploadResponse;

      if (!response.ok) {
        setError(data.error || data.message || "Ошибка при загрузке файла.");
        setResult(null);
      } else {
        setResult(data);
        setError(null);
      }

      setUploadProgress(100);
    } catch (err: any) {
      console.error("Ошибка при загрузке файла категорий:", err);
      setError(err.message || "Неизвестная ошибка при загрузке файла.");
      setResult(null);
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
      // Немного подержим 100%, затем плавно скрыть индикатор
      setTimeout(() => setUploadProgress(0), 1500);
      
      // После успешной загрузки обновляем список
      if (result?.success) {
        loadCommissions();
      }
    }
  };

  // Загрузка списка комиссий
  const loadCommissions = async (page = 1) => {
    setIsLoadingCommissions(true);
    setCommissionsError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
      });
      if (filters.marketplace && filters.marketplace !== "all") params.append("marketplace", filters.marketplace);
      if (filters.fulfillment && filters.fulfillment !== "all") params.append("fulfillment", filters.fulfillment);
      if (filters.search) params.append("search", filters.search);

      const response = await fetch(`/api/category-commissions/list?${params}`);
      const data = (await response.json()) as CommissionsListResponse;

      if (data.success) {
        setCommissions(data.data);
        setPagination(data.pagination);
        setStats(data.stats);
      } else {
        setCommissionsError("Не удалось загрузить данные");
      }
    } catch (err: any) {
      console.error("Ошибка при загрузке списка комиссий:", err);
      setCommissionsError(err.message || "Ошибка при загрузке данных");
    } finally {
      setIsLoadingCommissions(false);
    }
  };

  // Загружаем данные при монтировании
  useEffect(() => {
    loadCommissions();
  }, []);

  // Обновляем при изменении фильтров
  useEffect(() => {
    loadCommissions(1);
  }, [filters.marketplace, filters.fulfillment, filters.search]);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">Загрузка таблицы категорий и комиссий (Ozon)</CardTitle>
            <CardDescription>
              Загрузите официальный Excel-файл Ozon с категориями и ставками вознаграждения. 
              Данные будут сохранены в базу и использованы калькулятором для автоматического подбора комиссии по категории.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="file">Файл Excel с категориями и комиссиями</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
                <p className="text-xs text-muted-foreground">
                  Ожидается файл вроде: <span className="font-mono">Таблица_категорий_для_расчёта_вознаграждения_01012026.xlsx</span>.
                  В файле должны быть колонки с названием категории и ставками для FBO/FBS/RFBS.
                </p>
              </div>

              {uploadProgress > 0 && (
                <div className="space-y-2">
                  <Label>Ход загрузки</Label>
                  <Progress value={uploadProgress} className="w-full" />
                </div>
              )}

              <div className="flex gap-3">
                <Button type="submit" disabled={!file || isUploading}>
                  {isUploading ? "Загрузка..." : "Загрузить в базу"}
                </Button>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Ошибка</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {result && result.success && (
                <Alert>
                  <AlertTitle>Успешная загрузка</AlertTitle>
                  <AlertDescription>
                    <div className="space-y-1 text-sm">
                      {result.message && <p>{result.message}</p>}
                      {result.stats && (
                        <>
                          <p>
                            Всего строк: <strong>{result.stats.total}</strong>
                          </p>
                          <p>
                            Сохранено в БД: <strong>{result.stats.inserted}</strong>
                            {result.stats.failed > 0 && (
                              <span className="ml-1 text-muted-foreground">
                                (не удалось сохранить: {result.stats.failed})
                              </span>
                            )}
                          </p>
                          {result.stats.parseErrors > 0 && (
                            <p className="text-xs text-muted-foreground">
                              При разборе возникло ошибок: {result.stats.parseErrors}. 
                              Показаны первые {result.stats.parseErrorsSample?.length ?? 0}.
                            </p>
                          )}
                          {result.stats.parseErrorsSample &&
                            result.stats.parseErrorsSample.length > 0 && (
                              <ul className="mt-2 list-disc list-inside text-xs text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto border-t pt-2">
                                {result.stats.parseErrorsSample.map((msg, idx) => (
                                  <li key={idx}>{msg}</li>
                                ))}
                              </ul>
                            )}
                        </>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Как это используется</CardTitle>
            <CardDescription>
              После загрузки файл преобразуется в таблицу категорий и комиссий. 
              Калькулятор цен Ozon будет автоматически подбирать процент комиссии по категории товара и типу размещения (FBO/FBS/RFBS).
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Просмотр загруженных данных */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Загруженные данные</CardTitle>
                <CardDescription>
                  Просмотр категорий и комиссий, сохранённых в базе данных
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => loadCommissions(pagination.page)}
                disabled={isLoadingCommissions}
              >
                {isLoadingCommissions ? "Загрузка..." : "Обновить"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Фильтры */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="space-y-2">
                <Label>Маркетплейс</Label>
                <Select
                  value={filters.marketplace}
                  onValueChange={(value) => setFilters({ ...filters, marketplace: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Все маркетплейсы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все маркетплейсы</SelectItem>
                    <SelectItem value="ozon">Ozon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Тип размещения</Label>
                <Select
                  value={filters.fulfillment}
                  onValueChange={(value) => setFilters({ ...filters, fulfillment: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Все типы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все типы</SelectItem>
                    <SelectItem value="fbo">FBO</SelectItem>
                    <SelectItem value="fbo_fresh">FBO Fresh</SelectItem>
                    <SelectItem value="fbs">FBS</SelectItem>
                    <SelectItem value="rfbs">RFBS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Поиск по категории</Label>
                <Input
                  placeholder="Название категории..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
            </div>

            {/* Статистика */}
            {stats.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {stats.map((stat, idx) => (
                  <Badge key={idx} variant="outline">
                    {stat.marketplace.toUpperCase()} / {stat.fulfillment.toUpperCase()}: {stat.count}
                  </Badge>
                ))}
              </div>
            )}

            {/* Ошибка */}
            {commissionsError && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Ошибка</AlertTitle>
                <AlertDescription>{commissionsError}</AlertDescription>
              </Alert>
            )}

            {/* Таблица */}
            {isLoadingCommissions ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка данных...</div>
            ) : commissions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {commissionsError ? "Ошибка загрузки" : "Нет данных в базе. Загрузите файл выше."}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium">Маркетплейс</th>
                        <th className="text-left py-3 px-2 font-medium">Категория</th>
                        <th className="text-left py-3 px-2 font-medium">Путь категории</th>
                        <th className="text-left py-3 px-2 font-medium">Тип размещения</th>
                        <th className="text-left py-3 px-2 font-medium">Диапазон цены</th>
                        <th className="text-right py-3 px-2 font-medium">Комиссия (%)</th>
                        <th className="text-right py-3 px-2 font-medium">Мин. сумма</th>
                        <th className="text-right py-3 px-2 font-medium">Фикс. платёж</th>
                        <th className="text-center py-3 px-2 font-medium">Активна</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map((comm) => (
                        <tr key={comm.id} className="border-b hover:bg-muted/30">
                          <td className="py-3 px-2">
                            <Badge variant="outline">{comm.marketplace.toUpperCase()}</Badge>
                          </td>
                          <td className="py-3 px-2 font-medium">{comm.categoryName}</td>
                          <td className="py-3 px-2 text-muted-foreground text-xs">
                            {comm.categoryPath || "-"}
                          </td>
                          <td className="py-3 px-2">
                            <Badge>{comm.fulfillment.toUpperCase()}</Badge>
                          </td>
                          <td className="py-3 px-2 text-muted-foreground text-xs">
                            {comm.priceMin == null && comm.priceMax == null
                              ? "-"
                              : `${comm.priceMin ?? 0}–${comm.priceMax ?? "∞"} ₽`}
                          </td>
                          <td className="py-3 px-2 text-right font-medium">
                            {comm.commissionPercent.toFixed(2)}%
                          </td>
                          <td className="py-3 px-2 text-right text-muted-foreground">
                            {comm.minCommissionAmount
                              ? `${comm.minCommissionAmount.toFixed(2)} ₽`
                              : "-"}
                          </td>
                          <td className="py-3 px-2 text-right text-muted-foreground">
                            {comm.fixedFeeAmount ? `${comm.fixedFeeAmount.toFixed(2)} ₽` : "-"}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {comm.isActive ? (
                              <Badge variant="default" className="bg-green-500">Да</Badge>
                            ) : (
                              <Badge variant="secondary">Нет</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Пагинация */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Показано {((pagination.page - 1) * pagination.limit) + 1} -{" "}
                      {Math.min(pagination.page * pagination.limit, pagination.total)} из{" "}
                      {pagination.total}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadCommissions(pagination.page - 1)}
                        disabled={pagination.page === 1 || isLoadingCommissions}
                      >
                        Назад
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadCommissions(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages || isLoadingCommissions}
                      >
                        Вперёд
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

