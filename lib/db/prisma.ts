import { PrismaClient } from "@prisma/client";

// Предотвращаем множественные инстансы Prisma в development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Функция для добавления параметра pgbouncer=true к DATABASE_URL
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || "";
  if (!url) return url;
  
  // Если уже есть параметры, добавляем pgbouncer=true
  if (url.includes("?")) {
    // Проверяем, есть ли уже pgbouncer=true
    if (!url.includes("pgbouncer=true")) {
      return `${url}&pgbouncer=true`;
    }
    return url;
  }
  
  // Если параметров нет, добавляем
  return `${url}?pgbouncer=true`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
