/**
 * API endpoint для AI анализа отчётов
 */

import { NextRequest, NextResponse } from "next/server";
import { AIService } from "@/lib/ai/ai-service";
import type { AnalysisResult } from "@/lib/analysis/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { analysisData, customPrompt, provider } = body;

    if (!analysisData) {
      return NextResponse.json(
        { error: "Данные анализа не предоставлены" },
        { status: 400 }
      );
    }

    const aiService = new AIService();
    const result = await aiService.analyzeReport({
      analysisData,
      customPrompt,
      provider,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Ошибка AI анализа:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Неизвестная ошибка",
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
