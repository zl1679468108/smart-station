-- 1.3.0 / M24：异常件表
-- 请在 Supabase SQL Editor 手动执行（可安全重复执行）

-- 异常件表（1.3.0 / M24）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ss_exceptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id            UUID NOT NULL REFERENCES ss_stations(id),
  parcel_id             UUID NOT NULL REFERENCES ss_parcels(id),
  type                  VARCHAR(32) NOT NULL
                        CHECK (type IN ('lost', 'damaged', 'wrong_address', 'refused', 'other')),
  description           TEXT NOT NULL DEFAULT '',
  responsible_user_id   UUID REFERENCES ss_users(id),
  status                VARCHAR(20) NOT NULL DEFAULT 'registered'
                        CHECK (status IN ('registered', 'processing', 'resolved', 'compensated')),
  resolution            VARCHAR(20)
                        CHECK (resolution IS NULL OR resolution IN ('compensate', 'return', 'destroy', 'redeliver')),
  resolution_note       TEXT,
  attachments           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by            UUID REFERENCES ss_users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ss_exceptions_station_status
  ON ss_exceptions(station_id, status);
CREATE INDEX IF NOT EXISTS idx_ss_exceptions_station_created
  ON ss_exceptions(station_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ss_exceptions_parcel
  ON ss_exceptions(parcel_id);

COMMENT ON TABLE ss_exceptions IS '异常件登记与处理记录';
COMMENT ON COLUMN ss_exceptions.type IS 'lost/damaged/wrong_address/refused/other';
COMMENT ON COLUMN ss_exceptions.status IS 'registered → processing → resolved|compensated';
COMMENT ON COLUMN ss_exceptions.resolution IS 'compensate/return/destroy/redeliver';
COMMENT ON COLUMN ss_exceptions.attachments IS '图片 URL 数组，最多 5 个';
