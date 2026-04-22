import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware: проставляет cookie `iao_user_id` (UUID v4) для анонимных пользователей.
 * Этот cookie — MVP-замена NextAuth session до полной интеграции.
 *
 * Cookie httpOnly + SameSite=Lax + 1 год. В dev — без secure, в prod — с secure.
 */

const COOKIE_NAME = "iao_user_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function generateUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  const bytes = new Uint8Array(16);
  (crypto as any).getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function middleware(req: NextRequest) {
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  if (existing && existing.length >= 16) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const newId = generateUuid();
  response.cookies.set({
    name: COOKIE_NAME,
    value: newId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  return response;
}

export const config = {
  matcher: [
    // Пропускаем статику и служебные эндпоинты
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
