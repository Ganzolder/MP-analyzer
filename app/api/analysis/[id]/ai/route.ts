/**
 * API endpoint для AI-анализа готовых результатов
 */

import { NextRequest, NextResponse } from "next/server";
import { AIService } from "@/lib/ai/ai-service";
import type { AnalysisResult } from "@/lib/analysis/types";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { analysisData, customPrompt, analysisType } = body;

    if (!analysisData) {
      return NextResponse.json(
        { error: "Данные анализа не предоставлены" },
        { status: 400 }
      );
    }

    // Проверяем наличие API ключа перед вызовом AI
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!googleApiKey) {
      return NextResponse.json(
        { 
          error: "API ключ Google Gemini не настроен",
          message: "Добавьте GOOGLE_GENERATIVE_AI_API_KEY в файл .env.local и перезапустите сервер"
        },
        { status: 503 }
      );
    }

    const aiService = new AIService();
    const result = await aiService.analyzeReport({
      analysisData,
      customPrompt,
      analysisType, // Передаём тип анализа
      provider: "google",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Ошибка AI анализа:", error);
    
    // Более понятное сообщение об ошибке
    let errorMessage = "Неизвестная ошибка";
    if (error instanceof Error) {
      if (error.message.includes("API ключ")) {
        errorMessage = "API ключ Google Gemini не настроен. Проверьте файл .env.local и перезапустите сервер.";
      } else if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        errorMessage = "API ключ Google Gemini неверный или истёк. Проверьте GOOGLE_GENERATIVE_AI_API_KEY в .env.local";
      } else if (error.message.includes("403") || error.message.includes("Forbidden")) {
        errorMessage = "API ключ Google Gemini не имеет доступа к Gemini API. Проверьте разрешения ключа.";
      } else if (error.message.includes("429") || error.message.includes("rate limit")) {
        errorMessage = "Превышен лимит запросов к Google Gemini API. Подождите немного и попробуйте снова.";
      } else if (error.message.includes("network") || error.message.includes("fetch")) {
        errorMessage = "Ошибка подключения к Google Gemini API. Проверьте интернет-соединение.";
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error && process.env.NODE_ENV === "development" ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
