"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UploadStats {
  total: number;
  inserted: number;
  failed: number;
  errors: number;
}

interface UploadResponse {
  success?: boolean;
  message?: string;
  stats?: UploadStats;
  error?: string;
  errors?: string[];
}

interface ShippingTariff {
  id: string;
  marketplace: string;
  fromRegion: string | null;
  toRegion: string | null;
  fromCity: string | null;
  toCity: string | null;
  deliveryType: string | null;
  deliveryMethod: string | null;
  weightMin: number | null;
  weightMax: number | null;
  volumeMin: number | null;
  volumeMax: number | null;
  basePrice: number;
  pricePerKg: number | null;
  pricePerVolume: number | null;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TariffsListResponse {
  success: boolean;
  data: ShippingTariff[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: Array<{
    marketplace: string;
    deliveryMethod: string | null;
    count: number;
  }>;
}

export default function ShippingTariffsUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Состояние для просмотра данных
  const [tariffs, setTariffs] = useState<ShippingTariff[]>([]);
  const [isLoadingTariffs, setIsLoadingTariffs] = useState(false);
  const [tariffsError, setTariffsError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<Array<{ marketplace: string; deliveryMethod: string | null; count: number }>>([]);
  const [filters, setFilters] = useState({ marketplace: "all", deliveryMethod: "all", search: "" });

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

      const response = await fetch("/api/shipping-tariffs/upload", {
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
        // После успешной загрузки обновляем список
        if (data.success) {
          loadTariffs();
        }
      }

      setUploadProgress(100);
    } catch (err: any) {
      console.error("Ошибка при загрузке файла тарифов:", err);
      setError(err.message || "Неизвестная ошибка при загрузке файла.");
      setResult(null);
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1500);
    }
  };

  // Загрузка списка тарифов
  const loadTariffs = async (page = 1) => {
    setIsLoadingTariffs(true);
    setTariffsError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
      });
      if (filters.marketplace && filters.marketplace !== "all") params.append("marketplace", filters.marketplace);
      if (filters.deliveryMethod && filters.deliveryMethod !== "all") params.append("deliveryMethod", filters.deliveryMethod);
      if (filters.search) params.append("search", filters.search);

      const response = await fetch(`/api/shipping-tariffs/list?${params}`);
      const data = (await response.json()) as TariffsListResponse;

      if (data.success) {
        setTariffs(data.data);
        setPagination(data.pagination);
        setStats(data.stats);
      } else {
        setTariffsError("Не удалось загрузить данные");
      }
    } catch (err: any) {
      console.error("Ошибка при загрузке списка тарифов:", err);
      setTariffsError(err.message || "Ошибка при загрузке данных");
    } finally {
      setIsLoadingTariffs(false);
    }
  };

  // Загружаем данные при монтировании
  useEffect(() => {
    loadTariffs();
  }, []);

  // Обновляем при изменении фильтров
  useEffect(() => {
    loadTariffs(1);
  }, [filters.marketplace, filters.deliveryMethod, filters.search]);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">Загрузка тарифов логистики</CardTitle>
            <CardDescription>
              Загрузите Excel-файл с тарифами доставки. Тарифы зависят от объёма упаковки при отправке.
              Поддерживаются файлы: "Тарифы до 300.xlsx" и "Тарифы от 300.xlsx".
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="file">Файл Excel с тарифами логистики</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
                <p className="text-xs text-muted-foreground">
                  Ожидается файл вроде: <span className="font-mono">Тарифы до 300.xlsx</span> или{" "}
                  <span className="font-mono">Тарифы от 300.xlsx</span>.
                  В файле должны быть колонки с объёмом упаковки и стоимостью доставки.
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
                            Всего тарифов: <strong>{result.stats.total}</strong>
                          </p>
                          <p>
                            Сохранено в БД: <strong>{result.stats.inserted}</strong>
                            {result.stats.failed > 0 && (
                              <span className="ml-1 text-muted-foreground">
                                (не удалось сохранить: {result.stats.failed})
                              </span>
                            )}
                          </p>
                          {result.stats.errors > 0 && (
                            <p className="text-xs text-muted-foreground">
                              При разборе возникло ошибок: {result.stats.errors}.
                            </p>
                          )}
                          {result.errors && result.errors.length > 0 && (
                            <ul className="mt-2 list-disc list-inside text-xs text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto border-t pt-2">
                              {result.errors.slice(0, 20).map((msg, idx) => (
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
              После загрузки тарифы будут использоваться калькулятором для расчёта стоимости доставки
              в зависимости от объёма упаковки товара.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Просмотр загруженных данных */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Загруженные тарифы</CardTitle>
                <CardDescription>
                  Просмотр тарифов логистики, сохранённых в базе данных
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => loadTariffs(pagination.page)}
                disabled={isLoadingTariffs}
              >
                {isLoadingTariffs ? "Загрузка..." : "Обновить"}
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
                <Label>Метод доставки</Label>
                <Select
                  value={filters.deliveryMethod}
                  onValueChange={(value) => setFilters({ ...filters, deliveryMethod: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Все методы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все методы</SelectItem>
                    <SelectItem value="fbo">FBO</SelectItem>
                    <SelectItem value="fbs">FBS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Поиск</Label>
                <Input
                  placeholder="Регион, категория..."
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
                    {stat.marketplace.toUpperCase()} / {stat.deliveryMethod?.toUpperCase() || "ALL"}: {stat.count}
                  </Badge>
                ))}
              </div>
            )}

            {/* Ошибка */}
            {tariffsError && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Ошибка</AlertTitle>
                <AlertDescription>{tariffsError}</AlertDescription>
              </Alert>
            )}

            {/* Таблица */}
            {isLoadingTariffs ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка данных...</div>
            ) : tariffs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {tariffsError ? "Ошибка загрузки" : "Нет данных в базе. Загрузите файл выше."}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium">Маркетплейс</th>
                        <th className="text-left py-3 px-2 font-medium">Объём (см³)</th>
                        <th className="text-left py-3 px-2 font-medium">Метод</th>
                        <th className="text-right py-3 px-2 font-medium">Стоимость (₽)</th>
                        <th className="text-left py-3 px-2 font-medium">Регион от</th>
                        <th className="text-left py-3 px-2 font-medium">Регион до</th>
                        <th className="text-center py-3 px-2 font-medium">Активен</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tariffs.map((tariff) => (
                        <tr key={tariff.id} className="border-b hover:bg-muted/30">
                          <td className="py-3 px-2">
                            <Badge variant="outline">{tariff.marketplace.toUpperCase()}</Badge>
                          </td>
                          <td className="py-3 px-2">
                            {tariff.volumeMin != null && tariff.volumeMax != null
                              ? `${(tariff.volumeMin / 1000).toFixed(3)} - ${(tariff.volumeMax / 1000).toFixed(3)} л`
                              : tariff.volumeMin != null && tariff.volumeMax == null
                              ? `от ${(tariff.volumeMin / 1000).toFixed(3)} л`
                              : "-"}
                          </td>
                          <td className="py-3 px-2">
                            {tariff.deliveryMethod ? (
                              <Badge>{tariff.deliveryMethod.toUpperCase()}</Badge>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="py-3 px-2 text-right font-medium">
                            {tariff.basePrice.toFixed(2)} ₽
                          </td>
                          <td className="py-3 px-2 text-muted-foreground text-xs">
                            {tariff.fromRegion || "-"}
                          </td>
                          <td className="py-3 px-2 text-muted-foreground text-xs">
                            {tariff.toRegion || "-"}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {tariff.isActive ? (
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
                        onClick={() => loadTariffs(pagination.page - 1)}
                        disabled={pagination.page === 1 || isLoadingTariffs}
                      >
                        Назад
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadTariffs(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages || isLoadingTariffs}
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
