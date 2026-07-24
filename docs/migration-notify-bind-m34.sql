-- M34: 客户通知绑定 + 驿站通知公示（请在 Supabase SQL Editor 执行）
-- 执行后客户可在 /query 绑定个人 Server酱；企微群仅脱敏公告。

ALTER TABLE ss_stations
  ADD COLUMN IF NOT EXISTS notify_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN ss_stations.notify_config IS '通知公示与引导 JSON：title/content/wecomQrUrl/wecomJoinTip/serverchanGuide/serverchanGuideUrl/bindEnabled';

CREATE TABLE IF NOT EXISTS ss_notify_bindings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  UUID NOT NULL REFERENCES ss_stations(id) ON DELETE CASCADE,
  phone       VARCHAR(20) NOT NULL,
  channel     VARCHAR(20) NOT NULL DEFAULT 'serverchan'
              CHECK (channel IN ('serverchan')),
  target      TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'disabled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, phone, channel)
);

CREATE INDEX IF NOT EXISTS idx_ss_notify_bindings_phone ON ss_notify_bindings(phone);
CREATE INDEX IF NOT EXISTS idx_ss_notify_bindings_station ON ss_notify_bindings(station_id);

COMMENT ON TABLE ss_notify_bindings IS '客户通知绑定 - 手机号一对一免费推送通道（如个人 Server酱 SendKey）';

DROP TRIGGER IF EXISTS update_ss_notify_bindings_updated_at ON ss_notify_bindings;
CREATE TRIGGER update_ss_notify_bindings_updated_at BEFORE UPDATE ON ss_notify_bindings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
