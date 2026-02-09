# 🔧 Исправление ошибки PgBouncer: "prepared statement already exists"

## ❌ Проблема

```
Error: prepared statement "s0" already exists
```

Это происходит потому, что:
- Prisma использует **prepared statements** для оптимизации
- **PgBouncer** (connection pooler) в режиме Session/Transaction не поддерживает prepared statements
- При повторных запросах возникает конфликт

---

## ✅ Решение 1: Обновить DATABASE_URL (рекомендуется)

Добавьте параметр `?pgbouncer=true` в конец Connection String.

### Шаг 1: Обновите DATABASE_URL в Vercel

1. Откройте **Vercel Dashboard** → ваш проект → **Settings** → **Environment Variables**
2. Найдите `DATABASE_URL`
3. Добавьте в конец строки: `?pgbouncer=true`

**Было:**
```
postgresql://postgres.vkazxfjimigdixvphori:password@aws-0-region.pooler.supabase.com:6543/postgres
```

**Стало:**
```
postgresql://postgres.vkazxfjimigdixvphori:password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true
```

4. Сохраните и передеплойте

---

## ✅ Решение 2: Использовать Session mode вместо Transaction mode

Если используете **Transaction mode** в Supabase Pooler:

1. Откройте **Supabase Dashboard** → Settings → Database
2. Connection string → измените **Method** на **"Session mode"**
3. Скопируйте новый Connection String
4. Обновите `DATABASE_URL` в Vercel

**Session mode** лучше работает с prepared statements.

---

## ✅ Решение 3: Отключить prepared statements в Prisma

Если первые два решения не помогли, можно отключить prepared statements программно.

### Обновите `lib/db/prisma.ts`:

```typescript
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes('?') ? '&' : '?') + 'pgbouncer=true',
      },
    },
  });
```

Но лучше добавить параметр прямо в `DATABASE_URL` (Решение 1).

---

## 🔍 Проверка

После применения решения:

1. Передеплойте проект
2. Откройте: `https://your-app.vercel.app/api/reports/check`
3. Должно вернуть список отчётов без ошибок

---

## 📋 Чеклист

- [ ] Добавил `?pgbouncer=true` в конец `DATABASE_URL`
- [ ] Или изменил Pooler mode на "Session mode" в Supabase
- [ ] Передеплоил проект
- [ ] Проверил `/api/reports/check` — работает без ошибок

---

## 💡 Почему это происходит

- **PgBouncer** — это connection pooler, который переиспользует подключения
- **Prepared statements** создаются на уровне соединения
- При переиспользовании соединения prepared statement уже существует → ошибка
- Параметр `pgbouncer=true` говорит Prisma не использовать prepared statements

---

## 🆘 Если всё равно не работает

1. Проверьте, что параметр `pgbouncer=true` добавлен в `DATABASE_URL`
2. Убедитесь, что используете **Session mode** (не Transaction mode)
3. Попробуйте пересоздать Prisma Client (перезапустите приложение)
