-- M46: 到付运费 + 代收货款（对用户收款线）
-- 在 Supabase SQL Editor 执行本文件（或等价 ALTER）

ALTER TABLE ss_parcels
  ADD COLUMN IF NOT EXISTS freight_collect_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cod_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collect_status VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS collect_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collect_paid_method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS collect_paid_operator_id UUID REFERENCES ss_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS collect_note TEXT;

-- 约束（幂等：若已存在则跳过）
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ss_parcels_freight_collect_amount_nonneg'
  ) THEN
    ALTER TABLE ss_parcels
      ADD CONSTRAINT ss_parcels_freight_collect_amount_nonneg
      CHECK (freight_collect_amount >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ss_parcels_cod_amount_nonneg'
  ) THEN
    ALTER TABLE ss_parcels
      ADD CONSTRAINT ss_parcels_cod_amount_nonneg
      CHECK (cod_amount >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ss_parcels_station_collect
  ON ss_parcels(station_id, collect_status);

COMMENT ON COLUMN ss_parcels.freight_collect_amount IS '到付运费金额（元），取件时向用户收取';
COMMENT ON COLUMN ss_parcels.cod_amount IS '代收货款金额（元），取件时向用户收取';
COMMENT ON COLUMN ss_parcels.collect_status IS '对用户收款状态：none无 / unpaid待收 / paid已收 / waived免收';
COMMENT ON COLUMN ss_parcels.collect_paid_method IS '收款方式：cash现金 / wechat微信 / alipay支付宝 / other其他';
