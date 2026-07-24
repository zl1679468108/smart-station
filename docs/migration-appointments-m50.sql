-- M50: 轻量预约取件（B6 第一刀）
-- 在 Supabase SQL Editor 执行

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
