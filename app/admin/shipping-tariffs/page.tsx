"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

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

export default function ShippingTariffsUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      </div>
    </div>
  );
}
