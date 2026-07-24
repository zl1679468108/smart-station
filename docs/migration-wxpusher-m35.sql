-- M35: WxPusher 扫码绑定（请在 Supabase SQL Editor 执行）
-- 包含 M34 对象兜底 + channel 扩展 + pending 表

-- 1) 驿站公示配置（M34 兜底）
ALTER TABLE ss_stations
  ADD COLUMN IF NOT EXISTS notify_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN ss_stations.notify_config IS
  '通知公示与引导 JSON：title/content/wecomQrUrl/wecomJoinTip/wxpusherGuide/serverchanGuide/serverchanGuideUrl/bindEnabled';

-- 2) 客户绑定表（M34 兜底）
CREATE TABLE IF NOT EXISTS ss_notify_bindings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  UUID NOT NULL REFERENCES ss_stations(id) ON DELETE CASCADE,
  phone       VARCHAR(20) NOT NULL,
  channel     VARCHAR(20) NOT NULL DEFAULT 'wxpusher',
  target      TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'disabled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, phone, channel)
);

CREATE INDEX IF NOT EXISTS idx_ss_notify_bindings_phone ON ss_notify_bindings(phone);
CREATE INDEX IF NOT EXISTS idx_ss_notify_bindings_station ON ss_notify_bindings(station_id);

-- 扩展 channel 允许值：wxpusher + 兼容 serverchan
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'ss_notify_bindings'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%channel%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ss_notify_bindings DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE ss_notify_bindings
  ALTER COLUMN channel SET DEFAULT 'wxpusher';

ALTER TABLE ss_notify_bindings
  ADD CONSTRAINT ss_notify_bindings_channel_check
  CHECK (channel IN ('wxpusher', 'serverchan'));

COMMENT ON TABLE ss_notify_bindings IS '客户通知绑定 - 手机号一对一免费推送（主通道 WxPusher UID，兼容 Server酱 SendKey）';
COMMENT ON COLUMN ss_notify_bindings.target IS '通道目标：wxpusher 为 UID_xxx；serverchan 为 SendKey';

DROP TRIGGER IF EXISTS update_ss_notify_bindings_updated_at ON ss_notify_bindings;
CREATE TRIGGER update_ss_notify_bindings_updated_at BEFORE UPDATE ON ss_notify_bindings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3) 扫码绑定会话（二维码 code → 手机号）
CREATE TABLE IF NOT EXISTS ss_notify_bind_pending (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  UUID NOT NULL REFERENCES ss_stations(id) ON DELETE CASCADE,
  phone       VARCHAR(20) NOT NULL,
  qr_code     VARCHAR(100) NOT NULL UNIQUE,
  extra       VARCHAR(64),
  expires_at  TIMESTAMPTZ NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'done', 'expired')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_notify_bind_pending_phone
  ON ss_notify_bind_pending(phone);
CREATE INDEX IF NOT EXISTS idx_ss_notify_bind_pending_expires
  ON ss_notify_bind_pending(expires_at);

COMMENT ON TABLE ss_notify_bind_pending IS 'WxPusher 扫码绑定会话：create/qrcode 后轮询 UID 前的暂存';

DROP TRIGGER IF EXISTS update_ss_notify_bind_pending_updated_at ON ss_notify_bind_pending;
CREATE TRIGGER update_ss_notify_bind_pending_updated_at BEFORE UPDATE ON ss_notify_bind_pending
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
