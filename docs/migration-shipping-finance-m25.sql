-- 1.4.0 / M25：寄件管理 + 财务结算 迁移
-- 请在 Supabase SQL Editor 手动执行（全部 IF NOT EXISTS，可安全重复执行）
-- 依赖：update_updated_at_column() 触发器函数（database-init.sql 顶部已定义）


-- ==============================================
-- v1.4.0: 寄件管理 + 财务结算（M25）
--   新建库执行本段即可；已部署库同样可直接执行（全部 IF NOT EXISTS）。
-- ==============================================

-- 地址簿：常用发件人/收件人
CREATE TABLE IF NOT EXISTS ss_address_book (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id    UUID NOT NULL REFERENCES ss_stations(id),
  role          VARCHAR(10) NOT NULL DEFAULT 'sender'
                CHECK (role IN ('sender', 'receiver')),
  name          VARCHAR(50) NOT NULL,
  phone         VARCHAR(20) NOT NULL,
  address       TEXT NOT NULL,
  tag           VARCHAR(10)
                CHECK (tag IS NULL OR tag IN ('home', 'company', 'school', 'other')),
  created_by    UUID REFERENCES ss_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ss_address_book_station_role
  ON ss_address_book(station_id, role);
CREATE INDEX IF NOT EXISTS idx_ss_address_book_phone
  ON ss_address_book(station_id, phone);

COMMENT ON TABLE ss_address_book IS '地址簿 - 常用发件人/收件人';
COMMENT ON COLUMN ss_address_book.role IS 'sender 发件人 / receiver 收件人';
COMMENT ON COLUMN ss_address_book.tag IS 'home 家 / company 公司 / school 学校 / other 其他';

DROP TRIGGER IF EXISTS update_ss_address_book_updated_at ON ss_address_book;
CREATE TRIGGER update_ss_address_book_updated_at BEFORE UPDATE ON ss_address_book
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 快递公司费率（按月可调，用于运费试算与财务结算）
CREATE TABLE IF NOT EXISTS ss_courier_rates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id          UUID NOT NULL REFERENCES ss_stations(id),
  courier_company_id  UUID NOT NULL REFERENCES ss_courier_companies(id),
  effective_month     CHAR(7) NOT NULL,  -- 生效月份 YYYY-MM
  first_weight_price  NUMERIC(10,2) NOT NULL DEFAULT 0,  -- 首重价格（元/首重）
  additional_price    NUMERIC(10,2) NOT NULL DEFAULT 0,  -- 续重单价（元/kg）
  first_weight_kg     NUMERIC(6,2)  NOT NULL DEFAULT 1,   -- 首重重量（kg）
  collect_rate        NUMERIC(10,2) NOT NULL DEFAULT 0,  -- 代收费率（元/件）
  deliver_rate        NUMERIC(10,2) NOT NULL DEFAULT 0,  -- 代派费率（元/件）
  insure_rate         NUMERIC(6,4)  NOT NULL DEFAULT 0,   -- 保价费率（占保价金额比例）
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (station_id, courier_company_id, effective_month)
);

CREATE INDEX IF NOT EXISTS idx_ss_courier_rates_lookup
  ON ss_courier_rates(station_id, courier_company_id, effective_month DESC);

COMMENT ON TABLE ss_courier_rates IS '快递公司费率表 - 按月生效，用于运费试算与财务结算';
COMMENT ON COLUMN ss_courier_rates.effective_month IS '生效月份 YYYY-MM，同公司同月唯一';
COMMENT ON COLUMN ss_courier_rates.insure_rate IS '保价费率，保价费 = 保价金额 × 该比例';

DROP TRIGGER IF EXISTS update_ss_courier_rates_updated_at ON ss_courier_rates;
CREATE TRIGGER update_ss_courier_rates_updated_at BEFORE UPDATE ON ss_courier_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 寄件单
CREATE TABLE IF NOT EXISTS ss_shippings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id          UUID NOT NULL REFERENCES ss_stations(id),
  shipping_no         VARCHAR(40) NOT NULL,  -- 寄件运单号（系统生成）
  courier_company_id  UUID REFERENCES ss_courier_companies(id) ON DELETE SET NULL,
  pickup_type         VARCHAR(16) NOT NULL DEFAULT 'in_store'
                      CHECK (pickup_type IN ('in_store', 'door')),
  pickup_time         TIMESTAMPTZ,       -- 上门取件预约时间
  pickup_address      TEXT,              -- 上门取件地址
  sender_name         VARCHAR(50) NOT NULL,
  sender_phone        VARCHAR(20) NOT NULL,
  sender_address      TEXT NOT NULL,
  receiver_name       VARCHAR(50) NOT NULL,
  receiver_phone      VARCHAR(20) NOT NULL,
  receiver_address    TEXT NOT NULL,
  item_type           VARCHAR(50),        -- 物品类型
  weight              NUMERIC(6,2) NOT NULL DEFAULT 1,  -- 重量 kg
  insured_amount      NUMERIC(10,2) NOT NULL DEFAULT 0, -- 保价金额
  freight             NUMERIC(10,2) NOT NULL DEFAULT 0, -- 运费（含保价费）
  status              VARCHAR(16) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'picked', 'shipped', 'cancelled')),
  note                TEXT,
  created_by          UUID REFERENCES ss_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (station_id, shipping_no)
);

CREATE INDEX IF NOT EXISTS idx_ss_shippings_station_status
  ON ss_shippings(station_id, status);
CREATE INDEX IF NOT EXISTS idx_ss_shippings_station_created
  ON ss_shippings(station_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ss_shippings_courier
  ON ss_shippings(courier_company_id);

COMMENT ON TABLE ss_shippings IS '寄件单 - 上门取件/到店寄件下单';
COMMENT ON COLUMN ss_shippings.pickup_type IS 'in_store 到店寄件 / door 上门取件';
COMMENT ON COLUMN ss_shippings.status IS 'pending 待处理 → picked 已取件 → shipped 已发出；cancelled 已取消';
COMMENT ON COLUMN ss_shippings.freight IS '运费总额，含续重与保价费';

DROP TRIGGER IF EXISTS update_ss_shippings_updated_at ON ss_shippings;
CREATE TRIGGER update_ss_shippings_updated_at BEFORE UPDATE ON ss_shippings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 月结账单（按驿站 + 快递公司 + 月份汇总）
CREATE TABLE IF NOT EXISTS ss_finance_bills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id          UUID NOT NULL REFERENCES ss_stations(id),
  courier_company_id  UUID NOT NULL REFERENCES ss_courier_companies(id),
  bill_month          CHAR(7) NOT NULL,  -- 账单月份 YYYY-MM
  collect_count       INTEGER NOT NULL DEFAULT 0,  -- 代收件数（入库）
  deliver_count       INTEGER NOT NULL DEFAULT 0,  -- 代派件数（出库）
  shipping_count      INTEGER NOT NULL DEFAULT 0,  -- 寄件数
  receivable          NUMERIC(12,2) NOT NULL DEFAULT 0,  -- 应收
  payable             NUMERIC(12,2) NOT NULL DEFAULT 0,  -- 应付
  net_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,  -- 净额（应收 - 应付）
  status              VARCHAR(16) NOT NULL DEFAULT 'unreconciled'
                      CHECK (status IN ('unreconciled', 'reconciled', 'discrepancy')),
  reconciled_amount   NUMERIC(12,2),   -- 对账单录入金额（快递公司口径）
  reconciled_note     TEXT,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (station_id, courier_company_id, bill_month)
);

CREATE INDEX IF NOT EXISTS idx_ss_finance_bills_station_month
  ON ss_finance_bills(station_id, bill_month DESC);
CREATE INDEX IF NOT EXISTS idx_ss_finance_bills_status
  ON ss_finance_bills(station_id, status);

COMMENT ON TABLE ss_finance_bills IS '月结账单 - 按驿站+快递公司+月份汇总';
COMMENT ON COLUMN ss_finance_bills.status IS 'unreconciled 未对账 / reconciled 已对账 / discrepancy 有差异';
COMMENT ON COLUMN ss_finance_bills.net_amount IS '净额 = 应收 - 应付';

DROP TRIGGER IF EXISTS update_ss_finance_bills_updated_at ON ss_finance_bills;
CREATE TRIGGER update_ss_finance_bills_updated_at BEFORE UPDATE ON ss_finance_bills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 账单明细（每张账单的分项，可溯源到包裹/寄件单）
CREATE TABLE IF NOT EXISTS ss_finance_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id             UUID NOT NULL REFERENCES ss_finance_bills(id) ON DELETE CASCADE,
  station_id          UUID NOT NULL REFERENCES ss_stations(id),
  item_type           VARCHAR(16) NOT NULL
                      CHECK (item_type IN ('collect', 'deliver', 'shipping', 'insure')),
  parcel_id           UUID REFERENCES ss_parcels(id) ON DELETE SET NULL,
  shipping_id         UUID REFERENCES ss_shippings(id) ON DELETE SET NULL,
  quantity            INTEGER NOT NULL DEFAULT 1,
  amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
  direction           VARCHAR(10) NOT NULL DEFAULT 'receivable'
                      CHECK (direction IN ('receivable', 'payable')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ss_finance_items_bill
  ON ss_finance_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_ss_finance_items_station_type
  ON ss_finance_items(station_id, item_type);

COMMENT ON TABLE ss_finance_items IS '账单明细 - 账单分项，溯源到包裹/寄件单';
COMMENT ON COLUMN ss_finance_items.item_type IS 'collect 代收 / deliver 代派 / shipping 寄件 / insure 保价';
COMMENT ON COLUMN ss_finance_items.direction IS 'receivable 应收 / payable 应付';

-- ==============================================
