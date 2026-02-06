-- Настройка Row Level Security (RLS) для Supabase
-- Этот скрипт нужно выполнить в Supabase SQL Editor

-- ============================================
-- 1. Включаем RLS для всех таблиц
-- ============================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AIUsageLog" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Политики для таблицы User
-- ============================================

-- Пользователи могут читать только свои данные
CREATE POLICY "Users can view own profile"
  ON "User" FOR SELECT
  USING (auth.uid()::text = id);

-- Пользователи могут обновлять только свой профиль
CREATE POLICY "Users can update own profile"
  ON "User" FOR UPDATE
  USING (auth.uid()::text = id);

-- ============================================
-- 3. Политики для таблицы Account (NextAuth)
-- ============================================

-- Пользователи могут читать только свои аккаунты
CREATE POLICY "Users can view own accounts"
  ON "Account" FOR SELECT
  USING (auth.uid()::text = "userId");

-- Пользователи могут управлять только своими аккаунтами
CREATE POLICY "Users can manage own accounts"
  ON "Account" FOR ALL
  USING (auth.uid()::text = "userId");

-- ============================================
-- 4. Политики для таблицы Session (NextAuth)
-- ============================================

-- Пользователи могут читать только свои сессии
CREATE POLICY "Users can view own sessions"
  ON "Session" FOR SELECT
  USING (auth.uid()::text = "userId");

-- Пользователи могут управлять только своими сессиями
CREATE POLICY "Users can manage own sessions"
  ON "Session" FOR ALL
  USING (auth.uid()::text = "userId");

-- ============================================
-- 5. Политики для таблицы VerificationToken (NextAuth)
-- ============================================

-- VerificationToken используется только сервером, ограничиваем доступ
CREATE POLICY "Service role can manage verification tokens"
  ON "VerificationToken" FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 6. Политики для таблицы Report
-- ============================================

-- Пользователи могут читать только свои отчёты
CREATE POLICY "Users can view own reports"
  ON "Report" FOR SELECT
  USING (
    "userId" IS NULL OR 
    auth.uid()::text = "userId"
  );

-- Пользователи могут создавать отчёты (включая анонимные)
CREATE POLICY "Users can create reports"
  ON "Report" FOR INSERT
  WITH CHECK (true);

-- Пользователи могут обновлять только свои отчёты
CREATE POLICY "Users can update own reports"
  ON "Report" FOR UPDATE
  USING (
    "userId" IS NULL OR 
    auth.uid()::text = "userId"
  );

-- Пользователи могут удалять только свои отчёты
CREATE POLICY "Users can delete own reports"
  ON "Report" FOR DELETE
  USING (
    "userId" IS NULL OR 
    auth.uid()::text = "userId"
  );

-- ============================================
-- 7. Политики для таблицы CostData
-- ============================================

-- Пользователи могут читать только свои данные о себестоимости
CREATE POLICY "Users can view own cost data"
  ON "CostData" FOR SELECT
  USING (
    "userId" IS NULL OR 
    auth.uid()::text = "userId"
  );

-- Пользователи могут создавать свои данные о себестоимости
CREATE POLICY "Users can create own cost data"
  ON "CostData" FOR INSERT
  WITH CHECK (
    "userId" IS NULL OR 
    auth.uid()::text = "userId"
  );

-- Пользователи могут обновлять только свои данные
CREATE POLICY "Users can update own cost data"
  ON "CostData" FOR UPDATE
  USING (
    "userId" IS NULL OR 
    auth.uid()::text = "userId"
  );

-- Пользователи могут удалять только свои данные
CREATE POLICY "Users can delete own cost data"
  ON "CostData" FOR DELETE
  USING (
    "userId" IS NULL OR 
    auth.uid()::text = "userId"
  );

-- ============================================
-- 8. Политики для таблицы Subscription
-- ============================================

-- Пользователи могут читать только свою подписку
CREATE POLICY "Users can view own subscription"
  ON "Subscription" FOR SELECT
  USING (auth.uid()::text = "userId");

-- Пользователи могут обновлять только свою подписку
CREATE POLICY "Users can update own subscription"
  ON "Subscription" FOR UPDATE
  USING (auth.uid()::text = "userId");

-- ============================================
-- 9. Политики для таблицы AIUsageLog
-- ============================================

-- Пользователи могут читать только свои логи
CREATE POLICY "Users can view own AI logs"
  ON "AIUsageLog" FOR SELECT
  USING (
    "userId" IS NULL OR 
    auth.uid()::text = "userId"
  );

-- Пользователи могут создавать свои логи
CREATE POLICY "Users can create own AI logs"
  ON "AIUsageLog" FOR INSERT
  WITH CHECK (
    "userId" IS NULL OR 
    auth.uid()::text = "userId"
  );

-- ============================================
-- 10. Временная политика для анонимного доступа (MVP)
-- ============================================
-- ВНИМАНИЕ: Для MVP разрешаем анонимный доступ к Report
-- Это нужно убрать после добавления авторизации!

-- Разрешаем анонимный доступ к чтению отчётов (только для MVP)
CREATE POLICY "Anonymous can read reports (MVP only)"
  ON "Report" FOR SELECT
  USING (true);

-- Разрешаем анонимный доступ к созданию отчётов (только для MVP)
CREATE POLICY "Anonymous can create reports (MVP only)"
  ON "Report" FOR INSERT
  WITH CHECK (true);

-- Разрешаем анонимный доступ к обновлению отчётов (только для MVP)
CREATE POLICY "Anonymous can update reports (MVP only)"
  ON "Report" FOR UPDATE
  USING (true);

-- Разрешаем анонимный доступ к удалению отчётов (только для MVP)
CREATE POLICY "Anonymous can delete reports (MVP only)"
  ON "Report" FOR DELETE
  USING (true);

-- ============================================
-- Примечания:
-- ============================================
-- 1. После добавления авторизации нужно удалить политики для анонимного доступа
-- 2. Политики используют auth.uid() для получения ID текущего пользователя
-- 3. service_role (используется Prisma через DATABASE_URL) обходит RLS автоматически
-- 4. Анонимные запросы (через Supabase Client) будут проверяться по политикам
-- 5. Серверные запросы через API Routes используют service_role и имеют полный доступ
-- 6. Проверьте, что Supabase Auth настроен правильно (если используется)
