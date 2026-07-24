-- M36: PushPlus 客户第二通道（请在 Supabase SQL Editor 执行）
-- 扩展 ss_notify_bindings.channel 允许 pushplus

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
  DROP CONSTRAINT IF EXISTS ss_notify_bindings_channel_check;

ALTER TABLE ss_notify_bindings
  ADD CONSTRAINT ss_notify_bindings_channel_check
  CHECK (channel IN ('wxpusher', 'pushplus', 'serverchan'));

COMMENT ON TABLE ss_notify_bindings IS
  '客户通知绑定 - wxpusher UID / pushplus token / serverchan SendKey';
COMMENT ON COLUMN ss_notify_bindings.target IS
  '通道目标：wxpusher=UID_xxx；pushplus=token；serverchan=SendKey';

COMMENT ON COLUMN ss_stations.notify_config IS
  '通知公示 JSON：title/content/wecomQrUrl/wecomJoinTip/wxpusherGuide/pushplusGuide/pushplusGuideUrl/bindEnabled';
