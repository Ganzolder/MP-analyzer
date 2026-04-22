-- ============================================================================
-- Схема нормализованного импорта OZON-отчётов в Supabase.
-- Работает параллельно с существующей Prisma-схемой (table "Report" и т.д.).
-- Все новые таблицы живут в схеме public с префиксом mp_ чтобы не конфликтовать.
-- ============================================================================
--
-- История: хранится до 3 последних импортов на пользователя (iao_user_id из cookie
-- в MVP, позже — users.id из NextAuth). Удаление каскадное по import_id.
--
-- Row Level Security (RLS): включён, политика — match по iao_user_id.
-- При работе с service-role-ключом RLS обходится, поэтому сервер пишет/читает
-- всё напрямую, а в браузер данные ходят через API-роуты.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Импорты (1 строка = 1 запуск анализа)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mp_imports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iao_user_id      text NOT NULL,

  file_names       text[]      NOT NULL DEFAULT '{}',
  file_sizes       bigint[]    NOT NULL DEFAULT '{}',
  period_start     timestamptz,
  period_end       timestamptz,
  period_label     text,

  status           text        NOT NULL DEFAULT 'ready',  -- processing/ready/failed
  error_message    text,

  -- Снимок метрик (для быстрой выдачи списка без join-ов)
  summary          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  cost_breakdown   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  scheme_stats     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  charge_type_breakdown jsonb  NOT NULL DEFAULT '[]'::jsonb,
  daily_metrics    jsonb       NOT NULL DEFAULT '[]'::jsonb,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mp_imports_user_created_idx
  ON public.mp_imports (iao_user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 2. Заказы (консолидированные по orderKey)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mp_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id        uuid NOT NULL REFERENCES public.mp_imports(id) ON DELETE CASCADE,
  iao_user_id      text NOT NULL,

  order_key        text NOT NULL,
  classification   text NOT NULL, -- success|partial_return|full_return|incomplete

  first_charge_date timestamptz,
  last_charge_date  timestamptz,
  order_date        timestamptz,

  work_scheme       text,
  platform          text,

  totals            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- OrderCategoryTotals
  total_amount_rub  numeric(18, 2) NOT NULL DEFAULT 0,
  points_amount     numeric(18, 2) NOT NULL DEFAULT 0,

  has_acquiring     boolean NOT NULL DEFAULT false,
  has_logistics     boolean NOT NULL DEFAULT false,
  has_revenue       boolean NOT NULL DEFAULT false,
  has_commission    boolean NOT NULL DEFAULT false,
  has_return        boolean NOT NULL DEFAULT false,

  total_cost        numeric(18, 2) NOT NULL DEFAULT 0,
  has_cost          boolean NOT NULL DEFAULT false,

  charge_types      text[] NOT NULL DEFAULT '{}',

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mp_orders_import_idx    ON public.mp_orders (import_id);
CREATE INDEX IF NOT EXISTS mp_orders_user_idx      ON public.mp_orders (iao_user_id);
CREATE INDEX IF NOT EXISTS mp_orders_order_key_idx ON public.mp_orders (order_key);

-- ─────────────────────────────────────────────────────────────
-- 3. Отправления
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mp_shipments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.mp_orders(id) ON DELETE CASCADE,
  import_id        uuid NOT NULL REFERENCES public.mp_imports(id) ON DELETE CASCADE,
  iao_user_id      text NOT NULL,

  shipment_key     text NOT NULL,
  status           text NOT NULL, -- delivered|returned|partially_returned|unknown
  charge_types     text[] NOT NULL DEFAULT '{}',

  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mp_shipments_order_idx  ON public.mp_shipments (order_id);
CREATE INDEX IF NOT EXISTS mp_shipments_import_idx ON public.mp_shipments (import_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Товары в отправлении
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mp_order_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id      uuid NOT NULL REFERENCES public.mp_shipments(id) ON DELETE CASCADE,
  order_id         uuid NOT NULL REFERENCES public.mp_orders(id) ON DELETE CASCADE,
  import_id        uuid NOT NULL REFERENCES public.mp_imports(id) ON DELETE CASCADE,
  iao_user_id      text NOT NULL,

  article          text,
  sku              text,
  product_name     text,

  quantity_sold     integer NOT NULL DEFAULT 0,
  quantity_returned integer NOT NULL DEFAULT 0,
  seller_price      numeric(18, 2) NOT NULL DEFAULT 0,
  cost_per_unit     numeric(18, 2),
  cogs              numeric(18, 2) NOT NULL DEFAULT 0,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mp_items_shipment_idx ON public.mp_order_items (shipment_id);
CREATE INDEX IF NOT EXISTS mp_items_import_idx   ON public.mp_order_items (import_id);
CREATE INDEX IF NOT EXISTS mp_items_article_idx  ON public.mp_order_items (iao_user_id, article);

-- ─────────────────────────────────────────────────────────────
-- 5. Сырые строки начислений по заказам — для пересчёта и drill-down
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mp_order_charges (
  id               bigserial PRIMARY KEY,
  import_id        uuid NOT NULL REFERENCES public.mp_imports(id) ON DELETE CASCADE,
  order_id         uuid REFERENCES public.mp_orders(id) ON DELETE CASCADE,
  iao_user_id      text NOT NULL,

  source_file      text,
  source_row       integer,

  charge_id        text,
  order_key        text,
  shipment_suffix  text,
  charge_date      timestamptz,
  service_group    text,
  charge_type      text,
  category         text,

  article          text,
  sku              text,
  product_name     text,
  quantity         integer NOT NULL DEFAULT 0,
  seller_price     numeric(18, 2) NOT NULL DEFAULT 0,

  order_date                 timestamptz,
  platform                   text,
  work_scheme                text,
  ozon_commission_percent    numeric(6, 2) NOT NULL DEFAULT 0,
  localization_index         numeric(6, 2) NOT NULL DEFAULT 0,
  avg_delivery_hours         numeric(10, 2) NOT NULL DEFAULT 0,

  total_amount     numeric(18, 2) NOT NULL DEFAULT 0,
  is_points        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS mp_charges_import_idx   ON public.mp_order_charges (import_id);
CREATE INDEX IF NOT EXISTS mp_charges_order_idx    ON public.mp_order_charges (order_id);
CREATE INDEX IF NOT EXISTS mp_charges_category_idx ON public.mp_order_charges (import_id, category);

-- ─────────────────────────────────────────────────────────────
-- 6. Неотрицаемые начисления (не привязаны к заказу) и подписки
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mp_non_order_charges (
  id               bigserial PRIMARY KEY,
  import_id        uuid NOT NULL REFERENCES public.mp_imports(id) ON DELETE CASCADE,
  iao_user_id      text NOT NULL,

  charge_id        text,
  charge_date      timestamptz,
  service_group    text,
  charge_type      text,
  category         text,
  total_amount     numeric(18, 2) NOT NULL DEFAULT 0,
  is_points        boolean NOT NULL DEFAULT false,
  source_file      text
);

CREATE INDEX IF NOT EXISTS mp_non_order_import_idx ON public.mp_non_order_charges (import_id);

CREATE TABLE IF NOT EXISTS public.mp_subscriptions (
  id               bigserial PRIMARY KEY,
  import_id        uuid NOT NULL REFERENCES public.mp_imports(id) ON DELETE CASCADE,
  iao_user_id      text NOT NULL,

  period_label     text,
  charge_date      timestamptz,
  charge_type      text,
  total_amount     numeric(18, 2) NOT NULL DEFAULT 0,
  source_file      text
);

CREATE INDEX IF NOT EXISTS mp_subs_import_idx ON public.mp_subscriptions (import_id);

-- ─────────────────────────────────────────────────────────────
-- 7. Агрегаты по товарам (для быстрого списка/экспорта)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mp_products_agg (
  id               bigserial PRIMARY KEY,
  import_id        uuid NOT NULL REFERENCES public.mp_imports(id) ON DELETE CASCADE,
  iao_user_id      text NOT NULL,

  article          text,
  sku              text,
  product_name     text,

  units_sold        integer NOT NULL DEFAULT 0,
  units_returned    integer NOT NULL DEFAULT 0,
  orders_count      integer NOT NULL DEFAULT 0,
  returns_count     integer NOT NULL DEFAULT 0,

  revenue           numeric(18, 2) NOT NULL DEFAULT 0,
  commission        numeric(18, 2) NOT NULL DEFAULT 0,
  logistics         numeric(18, 2) NOT NULL DEFAULT 0,
  returns_amount    numeric(18, 2) NOT NULL DEFAULT 0,
  net_amount        numeric(18, 2) NOT NULL DEFAULT 0,

  cost_per_unit     numeric(18, 2),
  total_cost        numeric(18, 2) NOT NULL DEFAULT 0,
  net_profit        numeric(18, 2),
  has_cost          boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS mp_products_agg_import_idx  ON public.mp_products_agg (import_id);
CREATE INDEX IF NOT EXISTS mp_products_agg_article_idx ON public.mp_products_agg (iao_user_id, article);

-- ─────────────────────────────────────────────────────────────
-- 8. Пользовательские файлы себестоимости (1 актуальный на пользователя)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mp_user_cost_uploads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iao_user_id      text NOT NULL,
  file_name        text,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  -- JSON вида { "ART-1": 400, ... }
  cost_map         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS mp_user_cost_uploads_user_uniq
  ON public.mp_user_cost_uploads (iao_user_id);

-- ─────────────────────────────────────────────────────────────
-- 9. RLS — включаем, политики match по iao_user_id
-- ─────────────────────────────────────────────────────────────
-- Ожидается, что JWT содержит claim "iao_user_id" (или anon-пользователь шлёт его
-- через заголовок и service-role-ключ). Для service-role-ключа RLS игнорируется.

ALTER TABLE public.mp_imports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_shipments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_order_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_order_charges       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_non_order_charges   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_products_agg        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_user_cost_uploads   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'mp_imports','mp_orders','mp_shipments','mp_order_items',
    'mp_order_charges','mp_non_order_charges','mp_subscriptions',
    'mp_products_agg','mp_user_cost_uploads'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', tbl||'_user_isolation', tbl);
    EXECUTE format($pol$
      CREATE POLICY %I ON public.%I
      USING (iao_user_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'iao_user_id', ''))
      WITH CHECK (iao_user_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'iao_user_id', ''));
    $pol$, tbl||'_user_isolation', tbl);
  END LOOP;
END $$;
