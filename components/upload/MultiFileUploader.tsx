"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import type { FileRejection } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface MultiFileUploaderProps {
  onFilesSelect: (files: File[]) => void;
  onFileRemove: (id: string) => void;
  selectedFiles: Array<{ id: string; name: string; size: number }>;
  accept?: Record<string, string[]>;
  maxSize?: number;
  disabled?: boolean;
  title: string;
  description: string;
  error?: string | null;
  className?: string;
}

export function MultiFileUploader({
  onFilesSelect,
  onFileRemove,
  selectedFiles,
  accept = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "application/vnd.ms-excel": [".xls"],
  },
  maxSize = 50 * 1024 * 1024, // 50MB
  disabled = false,
  title,
  description,
  error,
  className,
}: MultiFileUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[], _rejectedFiles: FileRejection[]) => {
      if (acceptedFiles.length > 0) {
        onFilesSelect(acceptedFiles);
      }
    },
    [onFilesSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: true,
    disabled,
  });

  return (
    <div className={cn("space-y-4", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "dropzone relative p-6 text-center transition-all duration-300 cursor-pointer group border-2 border-dashed rounded-xl",
          isDragActive && "dropzone-active border-primary bg-primary/5",
          disabled && "opacity-60 cursor-not-allowed",
          error && "border-destructive bg-destructive/5",
          !selectedFiles.length && !error && "border-muted hover:border-primary/50"
        )}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative p-3 bg-muted rounded-full group-hover:bg-primary/10 transition-colors">
              <Upload className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
          
          <div className="space-y-1">
            <p className="font-medium text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground max-w-[300px]">
              {description}
            </p>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Можно выбрать несколько файлов • XLS, XLSX до {formatFileSize(maxSize)}
          </p>
        </div>

        {error && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}
      </div>

      {/* Список выбранных файлов */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              Выбрано файлов: {selectedFiles.length}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                selectedFiles.forEach(f => onFileRemove(f.id));
              }}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Очистить все
            </Button>
          </div>
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <AnimatePresence>
              {selectedFiles.map((file) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="glass-card p-3 flex items-center gap-3 group"
                >
                  <div className="relative flex-shrink-0">
                    <div className="p-2 bg-success/10 rounded-lg">
                      <FileSpreadsheet className="h-5 w-5 text-success" />
                    </div>
                    <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-success bg-background rounded-full" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileRemove(file.id);
                    }}
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
