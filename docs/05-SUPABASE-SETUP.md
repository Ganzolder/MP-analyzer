# 🔐 Настройка Supabase для проекта

## Текущее состояние

Проект использует Supabase PostgreSQL базу данных, привязанную к Vercel.

### ✅ Что уже настроено:

1. **База данных создана** - проект `supabase-mp-analyzer` в AWS eu-central-1
2. **S3 Storage настроен** - endpoint доступен
3. **Структура БД** - таблицы созданы через Prisma
4. **Код сохранения** - активирован в API endpoints

### ⚠️ Что нужно настроить:

1. **Row Level Security (RLS)** - не включён для таблиц
2. **Политики безопасности** - отсутствуют
3. **Миграции** - нужно применить

## Шаги настройки

### 1. Применение миграций Prisma

Убедитесь, что структура БД соответствует схеме:

```bash
# На Vercel это делается автоматически через buildCommand
# Но можно проверить локально (если есть доступ к DATABASE_URL):
npx prisma migrate deploy
```

### 2. Настройка Row Level Security

Выполните SQL скрипт в Supabase SQL Editor:

1. Откройте Supabase Dashboard
2. Перейдите в **SQL Editor**
3. Скопируйте содержимое файла `prisma/migrations/setup-rls.sql`
4. Выполните скрипт

Это включит RLS и создаст политики безопасности для всех таблиц.

### 3. Настройка переменных окружения на Vercel

Настройте переменную `DATABASE_URL` в Vercel:

**Строка подключения:**
```
postgresql://postgres:[YOUR-PASSWORD]@db.vkazxfjimigdixvphori.supabase.co:5432/postgres?sslmode=require
```

**Где взять пароль:**
- Supabase Dashboard → Settings → Database → Database password
- Если пароль неизвестен, можно сгенерировать новый

**Настройка в Vercel:**
1. Vercel Dashboard → Ваш проект → Settings → Environment Variables
2. Добавьте переменную:
   - Name: `DATABASE_URL`
   - Value: строка подключения с реальным паролем
   - Environment: Production, Preview, Development
3. Передеплойте проект (или подождите автоматического деплоя)

### 4. Проверка работы

После настройки:

1. Загрузите файл для анализа
2. Проверьте, что результат сохранился в БД
3. Проверьте `/api/reports` - должен вернуть список отчётов
4. Проверьте Supabase Dashboard → Table Editor - должны появиться записи

## Структура таблиц

### Report
- Хранит результаты анализа
- Поля: id, fileName, fileSize, analysisResults (JSON), метаданные
- RLS: разрешён анонимный доступ (для MVP)

### User, Account, Session
- Для NextAuth авторизации (пока не используется активно)
- RLS: только свой профиль

### CostData
- Данные о себестоимости товаров
- RLS: только свои данные

### Subscription
- Подписки пользователей (заготовка)
- RLS: только своя подписка

### AIUsageLog
- Логи использования AI
- RLS: только свои логи

## Безопасность

### Текущие политики (MVP):

- **Анонимный доступ разрешён** для таблицы `Report` (для работы без авторизации)
- После добавления авторизации нужно:
  1. Удалить политики анонимного доступа
  2. Оставить только политики с проверкой `auth.uid()`

### Рекомендации:

1. После добавления авторизации обновите политики RLS
2. Используйте service_role для серверных запросов (через API Routes)
3. Не храните чувствительные данные в JSON полях без шифрования

## Troubleshooting

### Ошибка "relation does not exist"

Таблицы не созданы. Выполните:
```bash
npx prisma db push
# или
npx prisma migrate deploy
```

### Ошибка "permission denied"

RLS блокирует доступ. Проверьте:
1. Применён ли скрипт `setup-rls.sql`
2. Правильно ли настроены политики
3. Используется ли service_role для серверных запросов

### Медленные запросы

Видно в Supabase Dashboard → Performance:
- Проверьте индексы (должны быть созданы через Prisma)
- Оптимизируйте запросы
- Используйте connection pooling

## Полезные ссылки

- [Supabase Dashboard](https://supabase.com/dashboard)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Prisma + Supabase Guide](https://www.prisma.io/docs/guides/database/using-prisma-with-supabase)
