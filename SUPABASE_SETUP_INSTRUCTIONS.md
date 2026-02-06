# 🚀 Инструкция по настройке Supabase

## Текущий статус

✅ **База данных создана** - проект `supabase-mp-analyzer`  
✅ **S3 Storage настроен** - endpoint доступен  
✅ **Структура таблиц** - создана через Prisma  
⚠️ **RLS не настроен** - нужно применить политики безопасности

## Что нужно сделать

### Шаг 1: Применить настройки RLS

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard)
2. Выберите проект `supabase-mp-analyzer`
3. Перейдите в **SQL Editor** (в левом меню)
4. Скопируйте содержимое файла `prisma/migrations/setup-rls.sql`
5. Вставьте в SQL Editor и нажмите **Run**

Это включит Row Level Security и создаст политики для всех таблиц.

### Шаг 2: Настроить переменные окружения на Vercel

Настройте переменную `DATABASE_URL` в Vercel:

1. Откройте Vercel Dashboard → Ваш проект → Settings → Environment Variables
2. Добавьте переменную:
   - **Name:** `DATABASE_URL`
   - **Value:** `postgresql://postgres:[YOUR-PASSWORD]@db.vkazxfjimigdixvphori.supabase.co:5432/postgres?sslmode=require`
   - Замените `[YOUR-PASSWORD]` на реальный пароль из Supabase Dashboard
   - **Environment:** Production, Preview, Development (все)

**Где взять пароль:**
- Supabase Dashboard → Settings → Database → Database password
- Или сгенерируйте новый пароль, если забыли

**Важно:** После изменения переменных окружения нужно передеплоить проект на Vercel!

### Шаг 3: Проверить работу

После применения RLS:

1. Загрузите файл для анализа на сайте
2. Проверьте Supabase Dashboard → Table Editor → Report
3. Должна появиться новая запись с результатами анализа

## Важно

- **Для MVP** разрешён анонимный доступ к таблице `Report` (чтобы работало без авторизации)
- После добавления авторизации нужно будет обновить политики RLS
- Все серверные запросы (через API Routes) используют service_role и имеют полный доступ

## Структура таблиц

Все таблицы созданы и готовы к использованию:
- `Report` - результаты анализа
- `User`, `Account`, `Session` - для авторизации (NextAuth)
- `CostData` - данные о себестоимости
- `Subscription` - подписки
- `AIUsageLog` - логи AI

## Если что-то не работает

1. Проверьте логи в Vercel Dashboard
2. Проверьте Supabase Dashboard → Logs
3. Убедитесь, что `DATABASE_URL` правильный
4. Проверьте, что миграции применены (таблицы существуют)
