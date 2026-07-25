-- Smart Station · 已部署库紧急补齐（幂等）
-- 用途：修复 /api/shifts /api/finance/cash-day /api/inventory /api/appointments
--       因缺表/缺列导致的 PostgREST schema cache 错误
-- 执行：Supabase SQL Editor 整段执行
-- 说明：内容与 docs/database-init.sql 终态一致；可安全重复执行
-- =====================================================

-- 1) 对用户收款字段（库存/收银日结依赖）
ALTER TABLE ss_parcels
  ADD COLUMN IF NOT EXISTS freight_collect_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cod_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collect_status VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS collect_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collect_paid_method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS collect_paid_operator_id UUID REFERENCES ss_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS collect_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ss_parcels_collect_status_check'
  ) THEN
    ALTER TABLE ss_parcels
      ADD CONSTRAINT ss_parcels_collect_status_check
      CHECK (collect_status IN ('none', 'unpaid', 'paid', 'waived'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ss_parcels_collect_paid_method_check'
  ) THEN
    ALTER TABLE ss_parcels
      ADD CONSTRAINT ss_parcels_collect_paid_method_check
      CHECK (
        collect_paid_method IS NULL
        OR collect_paid_method IN ('cash', 'wechat', 'alipay', 'other')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ss_parcels_station_collect
  ON ss_parcels(station_id, collect_status);

COMMENT ON COLUMN ss_parcels.freight_collect_amount IS '到付运费金额（元），取件时向用户收取';
COMMENT ON COLUMN ss_parcels.cod_amount IS '代收货款金额（元），取件时向用户收取';
COMMENT ON COLUMN ss_parcels.collect_status IS '对用户收款状态：none无 / unpaid待收 / paid已收 / waived免收';
COMMENT ON COLUMN ss_parcels.collect_paid_method IS '收款方式：cash现金 / wechat微信 / alipay支付宝 / other其他';

-- 2) 交接班
CREATE TABLE IF NOT EXISTS ss_shifts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id            UUID NOT NULL REFERENCES ss_stations(id) ON DELETE RESTRICT,
  operator_id           UUID NOT NULL REFERENCES ss_users(id) ON DELETE RESTRICT,
  status                VARCHAR(20) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'closed')),
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at              TIMESTAMPTZ,
  opening_note          TEXT,
  closing_note          TEXT,
  handover_to_user_id   UUID REFERENCES ss_users(id) ON DELETE SET NULL,
  inbound_count         INTEGER NOT NULL DEFAULT 0,
  outbound_count        INTEGER NOT NULL DEFAULT 0,
  collect_paid_count    INTEGER NOT NULL DEFAULT 0,
  collect_paid_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
  collect_cash          NUMERIC(12,2) NOT NULL DEFAULT 0,
  collect_wechat        NUMERIC(12,2) NOT NULL DEFAULT 0,
  collect_alipay        NUMERIC(12,2) NOT NULL DEFAULT 0,
  collect_other         NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_count           INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ss_shifts_open_operator
  ON ss_shifts(station_id, operator_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_ss_shifts_station_started
  ON ss_shifts(station_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ss_shifts_station_status
  ON ss_shifts(station_id, status);

DROP TRIGGER IF EXISTS update_ss_shifts_updated_at ON ss_shifts;
CREATE TRIGGER update_ss_shifts_updated_at BEFORE UPDATE ON ss_shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ss_shifts IS '交接班班次：开班/交班快照 + 本班入库出库收款汇总';
COMMENT ON COLUMN ss_shifts.stock_count IS '交班时在库件数盘点（可选手填）';


-- ==============================================
-- 轻量预约取件（B6）
-- ==============================================

-- 3) 预约取件
CREATE TABLE IF NOT EXISTS ss_pickup_appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id       UUID NOT NULL REFERENCES ss_stations(id) ON DELETE CASCADE,
  recipient_phone  VARCHAR(20) NOT NULL,
  recipient_name   VARCHAR(50),
  slot_date        DATE NOT NULL,
  slot_start       TIME NOT NULL,
  slot_end         TIME NOT NULL,
  note             TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  source           VARCHAR(20) NOT NULL DEFAULT 'query'
                   CHECK (source IN ('query', 'admin')),
  cancel_reason    TEXT,
  handled_by       UUID REFERENCES ss_users(id) ON DELETE SET NULL,
  handled_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_pickup_appointments_station_date
  ON ss_pickup_appointments(station_id, slot_date DESC);

CREATE INDEX IF NOT EXISTS idx_ss_pickup_appointments_station_status
  ON ss_pickup_appointments(station_id, status);

CREATE INDEX IF NOT EXISTS idx_ss_pickup_appointments_phone
  ON ss_pickup_appointments(station_id, recipient_phone);

CREATE INDEX IF NOT EXISTS idx_ss_pickup_appointments_slot
  ON ss_pickup_appointments(station_id, slot_date, slot_start);

DROP TRIGGER IF EXISTS update_ss_pickup_appointments_updated_at ON ss_pickup_appointments;
CREATE TRIGGER update_ss_pickup_appointments_updated_at BEFORE UPDATE ON ss_pickup_appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ss_pickup_appointments IS '轻量预约取件：客户选时段到店，店员确认/完成';
COMMENT ON COLUMN ss_pickup_appointments.source IS '来源：query 门户 / admin 后台代录';
COMMENT ON COLUMN ss_pickup_appointments.status IS 'pending 待确认 / confirmed 已确认 / completed 已到店 / cancelled 已取消 / no_show 爽约';

-- 4) 提醒 PostgREST 刷新 schema cache（Supabase 通常几秒内自动；若仍报错可 Dashboard → Settings → API → Reload）
NOTIFY pgrst, 'reload schema';
