"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, Calendar, TrendingUp, DollarSign, ShoppingCart, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

interface Report {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  createdAt: string;
  totalOrders: number | null;
  totalRevenue: number | null;
  netProfit: number | null;
}

/**
 * Страница истории отчётов
 */
export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/reports");
      const data = await response.json();
      
      if (data.success) {
        setReports(data.data || []);
      } else {
        setError(data.error || "Ошибка при загрузке отчётов");
      }
    } catch (err: any) {
      setError(err.message || "Ошибка при загрузке отчётов");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    const confirmed = window.confirm("Вы уверены, что хотите удалить этот отчёт? Это действие необратимо.");
    if (!confirmed) return;

    try {
      setDeletingId(id);
      const response = await fetch(`/api/analysis/${id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || "Не удалось удалить отчёт");
      }

      setReports((prev) => prev.filter((report) => report.id !== id));

      toast({
        title: "Отчёт удалён",
        description: "Отчёт успешно удалён из истории.",
      });
    } catch (err: any) {
      toast({
        title: "Ошибка при удалении",
        description: err?.message || "Не удалось удалить отчёт. Попробуйте ещё раз.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  return (
    <div className="container py-8 md:py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto space-y-8"
      >
        {/* Заголовок */}
        <div className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold">История отчётов</h1>
          <p className="text-muted-foreground">
            Все ваши анализы в одном месте. Открывайте, сравнивайте и экспортируйте данные.
          </p>
        </div>

        {/* Загрузка */}
        {loading && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Загрузка отчётов...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ошибка */}
        {error && !loading && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <p className="text-destructive">{error}</p>
                <Button onClick={fetchReports} variant="outline">
                  Попробовать снова
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Список отчётов */}
        {!loading && !error && reports.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Найдено отчётов: {reports.length}
              </p>
            </div>
            
            <div className="grid gap-4">
              {reports.map((report) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-lg truncate">
                                {report.fileName}
                              </h3>
                              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span>{formatDate(new Date(report.createdAt))}</span>
                                </div>
                                <span>•</span>
                                <span>{formatFileSize(report.fileSize)}</span>
                                <span>•</span>
                                <Badge variant={report.status === "completed" ? "default" : "secondary"}>
                                  {report.status === "completed" ? "Завершён" : report.status}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          {/* Метрики */}
                          {report.totalOrders !== null && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                              {report.totalOrders !== null && (
                                <div className="flex items-center gap-2">
                                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <p className="text-xs text-muted-foreground">Заказов</p>
                                    <p className="font-semibold">{report.totalOrders.toLocaleString("ru-RU")}</p>
                                  </div>
                                </div>
                              )}
                              {report.totalRevenue !== null && (
                                <div className="flex items-center gap-2">
                                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <p className="text-xs text-muted-foreground">Выручка</p>
                                    <p className="font-semibold">{formatCurrency(report.totalRevenue)}</p>
                                  </div>
                                </div>
                              )}
                              {report.netProfit !== null && (
                                <div className="flex items-center gap-2">
                                  <TrendingUp className={`h-4 w-4 ${report.netProfit >= 0 ? "text-green-500" : "text-red-500"}`} />
                                  <div>
                                    <p className="text-xs text-muted-foreground">Прибыль</p>
                                    <p className={`font-semibold ${report.netProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
                                      {formatCurrency(report.netProfit)}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex-shrink-0 flex items-center gap-2">
                          <Button asChild>
                            <Link href={`/analysis/${report.id}`}>
                              Открыть
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={deletingId === report.id}
                            onClick={() => handleDeleteReport(report.id)}
                          >
                            {deletingId === report.id ? (
                              <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Удаление...
                              </span>
                            ) : (
                              "Удалить"
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Пустое состояние */}
        {!loading && !error && reports.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <div className="mx-auto w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                <FileText className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Отчётов пока нет</h3>
              <p className="text-muted-foreground mb-6">
                Загрузите файл для анализа, чтобы создать первый отчёт
              </p>
              <Button asChild>
                <Link href="/">Создать первый анализ</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
