"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

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

export default function CategoryCommissionsUploadPage() {
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
    }
  };

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
      </div>
    </div>
  );
}

