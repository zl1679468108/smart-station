-- M48: 交接班班次表（B5）
-- 在 Supabase SQL Editor 执行

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
  -- 交班快照
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

-- 同一驿站同一店员仅允许一个进行中班次
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
