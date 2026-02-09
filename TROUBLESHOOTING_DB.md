# 🔧 Диагностика проблемы с сохранением в БД

## Проблема
После загрузки файлов на анализ данные не появляются в таблице `Report` в Supabase.

## Возможные причины

### 1. ❌ DATABASE_URL не настроен

**Проверка:**
- Откройте Vercel Dashboard → Your Project → Settings → Environment Variables
- Убедитесь, что есть переменная `DATABASE_URL`
- Значение должно быть: `postgresql://postgres:[PASSWORD]@db.vkazxfjimigdixvphori.supabase.co:5432/postgres`

**Решение:**
1. Скопируйте Connection String из Supabase Dashboard → Settings → Database
2. Вставьте в Vercel Environment Variables
3. Передеплойте проект

---

### 2. ❌ RLS блокирует запись

**Проверка:**
- Откройте Supabase Dashboard → Authentication → Policies
- Проверьте, что для таблицы `Report` есть политика на INSERT

**Решение:**
1. Откройте Supabase Dashboard → SQL Editor
2. Выполните скрипт из `prisma/migrations/setup-rls.sql`
3. Или создайте политику вручную:

```sql
-- Разрешить вставку для всех (для MVP)
CREATE POLICY "Allow insert for all" ON "Report"
FOR INSERT
TO authenticated, anon
WITH CHECK (true);
```

**Примечание:** Prisma использует `service_role`, который обходит RLS, но если DATABASE_URL использует `anon` роль, RLS будет блокировать.

---

### 3. ❌ Ошибка подключения

**Проверка:**
1. Откройте в браузере: `https://your-app.vercel.app/api/health/db`
2. Должен вернуть `"success": true`

**Если ошибка:**
- Проверьте DATABASE_URL
- Проверьте, что пароль правильный
- Проверьте, что Supabase проект не заблокирован

---

### 4. ❌ Ошибка при сохранении (тихая)

**Проверка:**
1. Откройте Vercel Dashboard → Deployments → [ваш деплой] → Functions → `/api/analyze`
2. Посмотрите логи на наличие ошибок
3. Ищите строки с `❌ [API] ОШИБКА при сохранении в БД`

**Решение:**
- Исправьте ошибку согласно сообщению в логах

---

## 🔍 Диагностика

### Шаг 1: Проверка подключения

Откройте в браузере:
```
https://your-app.vercel.app/api/health/db
```

**Ожидаемый результат:**
```json
{
  "success": true,
  "checks": {
    "connection": true,
    "tables": { "Report": true },
    "write": true,
    "read": true
  }
}
```

---

### Шаг 2: Тест сохранения

Откройте в браузере:
```
https://your-app.vercel.app/api/analyze/test-db
```

**Ожидаемый результат:**
```json
{
  "success": true,
  "message": "✅ База данных работает! Сохранение и удаление прошли успешно."
}
```

**Если ошибка:**
- Скопируйте сообщение об ошибке
- Проверьте DATABASE_URL
- Проверьте RLS политики

---

### Шаг 3: Проверка логов

1. Загрузите файл на анализ
2. Откройте Vercel Dashboard → Functions → `/api/analyze` → Logs
3. Ищите строки:
   - `💾 [API] Попытка сохранения в БД...`
   - `✅ [API] Результат сохранён в БД:`
   - `❌ [API] ОШИБКА при сохранении в БД:`

---

## ✅ Быстрое решение

### Если используете Supabase:

1. **Проверьте Connection String:**
   - Supabase Dashboard → Settings → Database
   - Скопируйте "Connection string" → "URI"
   - Убедитесь, что используете правильный пароль

2. **Примените RLS политики:**
   ```sql
   -- В Supabase SQL Editor выполните:
   -- Скрипт из prisma/migrations/setup-rls.sql
   ```

3. **Проверьте переменные окружения в Vercel:**
   - Vercel Dashboard → Settings → Environment Variables
   - Убедитесь, что `DATABASE_URL` есть и правильный
   - Передеплойте проект

4. **Проверьте логи:**
   - Vercel Dashboard → Functions → Logs
   - Ищите ошибки при сохранении

---

## 🐛 Частые ошибки

### Ошибка: "P1001: Can't reach database server"
**Причина:** Неправильный DATABASE_URL или сетевые проблемы
**Решение:** Проверьте Connection String

### Ошибка: "P2002: Unique constraint failed"
**Причина:** Попытка создать запись с существующим ID
**Решение:** Это нормально, если анализ запускается повторно

### Ошибка: "new row violates row-level security policy"
**Причина:** RLS блокирует запись
**Решение:** Примените политики из `setup-rls.sql` или используйте `service_role` в DATABASE_URL

### Ошибка: "relation 'Report' does not exist"
**Причина:** Таблица не создана
**Решение:** Выполните миграции: `npx prisma migrate deploy`

---

## 📝 Проверка после исправления

1. Загрузите файл на анализ
2. Подождите завершения анализа
3. Откройте Supabase Dashboard → Table Editor → Report
4. Должна появиться новая запись

---

## 💡 Примечание

Если данные не сохраняются, но анализ работает (результаты отображаются на странице), это означает:
- Анализ выполняется успешно
- Проблема только в сохранении в БД
- Результаты всё равно доступны через store (но не сохраняются между сессиями)

Для постоянного хранения результатов нужно исправить проблему с БД.
