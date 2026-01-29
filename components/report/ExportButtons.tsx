"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { delay } from "@/lib/utils";

interface ExportButtonsProps {
  analysisId: string;
}

export function ExportButtons({ analysisId }: ExportButtonsProps) {
  const { toast } = useToast();
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      // Симуляция экспорта (в реальности - API вызов)
      await delay(2000);
      
      // В реальности здесь будет:
      // const response = await fetch(`/api/export/pdf/${analysisId}`);
      // const blob = await response.blob();
      // downloadFile(blob, `ozon-report-${analysisId}.pdf`);
      
      toast({
        title: "PDF отчёт готов",
        description: "Файл загружен на ваш компьютер",
        variant: "success",
      });
    } catch {
      toast({
        title: "Ошибка экспорта",
        description: "Не удалось создать PDF отчёт",
        variant: "destructive",
      });
    } finally {
      setIsExportingPdf(false);
    }
  };
  
  const handleExportXlsx = async () => {
    setIsExportingXlsx(true);
    try {
      // Симуляция экспорта
      await delay(1500);
      
      toast({
        title: "XLSX файл готов",
        description: "Файл загружен на ваш компьютер",
        variant: "success",
      });
    } catch {
      toast({
        title: "Ошибка экспорта",
        description: "Не удалось создать XLSX файл",
        variant: "destructive",
      });
    } finally {
      setIsExportingXlsx(false);
    }
  };
  
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Button
        onClick={handleExportPdf}
        disabled={isExportingPdf || isExportingXlsx}
        variant="gradient"
        size="lg"
        className="flex-1 sm:flex-none"
      >
        {isExportingPdf ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileText className="mr-2 h-4 w-4" />
        )}
        Скачать PDF отчёт
      </Button>
      
      <Button
        onClick={handleExportXlsx}
        disabled={isExportingPdf || isExportingXlsx}
        variant="outline"
        size="lg"
        className="flex-1 sm:flex-none"
      >
        {isExportingXlsx ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="mr-2 h-4 w-4" />
        )}
        Скачать XLSX данные
      </Button>
    </div>
  );
}
