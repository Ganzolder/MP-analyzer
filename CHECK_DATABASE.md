# ✅ Проверка настройки Supabase

## Быстрая проверка

### 1. Проверка через API endpoint

Откройте в браузере или через curl:
```
https://your-vercel-app.vercel.app/api/health/db
```

Или локально (если сервер запущен):
```
http://localhost:3000/api/health/db
```

**Ожидаемый результат:**
```json
{
  "success": true,
  "checks": {
    "connection": true,
    "tables": {
      "User": true,
      "Account": true,
      "Session": true,
      "VerificationToken": true,
      "Report": true,
      "CostData": true,
      "Subscription": true,
      "AIUsageLog": true
    },
    "write": true,
    "read": true,
    "rlsEnabled": true
  },
  "message": "✅ База данных настроена правильно"
}
```

### 2. Проверка через скрипт (локально)

Если у вас настроен `.env.local` с `DATABASE_URL`:

```bash
npm run db:check
```

### 3. Проверка через Supabase Dashboard

1. Откройте Supabase Dashboard → Table Editor
2. Проверьте, что все таблицы существуют:
   - User
   - Account
   - Session
   - VerificationToken
   - Report
   - CostData
   - Subscription
   - AIUsageLog

3. Проверьте RLS:
   - Authentication → Policies
   - Должны быть политики для всех таблиц

### 4. Тестовая загрузка файла

1. Загрузите файл для анализа на сайте
2. Проверьте Supabase Dashboard → Table Editor → Report
3. Должна появиться новая запись

### 5. Проверка API /api/reports

Откройте:
```
https://your-vercel-app.vercel.app/api/reports
```

Должен вернуть список всех отчётов из БД.

## Возможные проблемы

### Ошибка подключения
- Проверьте `DATABASE_URL` в Vercel
- Убедитесь, что пароль правильный
- Проверьте, что проект не заблокирован в Supabase

### Таблицы не найдены
- Выполните миграции: `npx prisma migrate deploy`
- Или примените `prisma/migrations/init.sql` в Supabase SQL Editor

### Ошибка записи (RLS блокирует)
- Убедитесь, что скрипт `setup-rls.sql` выполнен
- Проверьте политики в Supabase Dashboard → Authentication → Policies

### Медленные запросы
- Проверьте индексы (должны быть созданы через Prisma)
- Используйте connection pooling в Supabase

## Статус проверки

После выполнения всех проверок вы должны увидеть:
- ✅ Все таблицы существуют
- ✅ Запись работает
- ✅ Чтение работает
- ✅ RLS настроен (политики созданы)
