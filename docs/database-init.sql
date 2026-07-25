-- Smart Station - 数据库初始化脚本
-- 用途：创建表结构、索引、触发器，提升查询性能
-- 在 Supabase SQL 编辑器中执行
-- 表前缀：ss_（smart-station）
-- 版本：v1.6（存取件闭环 + 货架 3D 布局 + 异常件 + 寄件/财务 + OCR 额度）
-- 维护规则：本文件是数据库 schema 的唯一真相源，DDL 变更必须同步更新本文件并手动在 SQL Editor 执行
--   已废弃独立 migration-*.sql，所有历史迁移的终态均已内联到本文件对应表定义中。
--   全脚本幂等（IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT），新建库与已部署库均可直接整体执行。

-- ==============================================
-- 触发器函数：自动更新 updated_at
-- ==============================================
-- 注意：CREATE OR REPLACE FUNCTION 不允许改变已有函数的返回类型，
-- 必须先 DROP，保证脚本可重复执行（幂等）
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ==============================================
-- 1. 用户表（工作人员）
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         VARCHAR(20) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE,
  username      VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url    TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  -- 登录失败锁定
  failed_login_count  INTEGER NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  current_station_id  UUID,  -- 当前活跃驿站（FK 在 ss_stations 建表后补）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_users_phone ON ss_users(phone);
CREATE INDEX IF NOT EXISTS idx_ss_users_email ON ss_users(email);
CREATE INDEX IF NOT EXISTS idx_ss_users_status ON ss_users(status);

COMMENT ON TABLE ss_users IS '用户表 - 工作人员账号（驿站老板/店员/查询员）';
COMMENT ON COLUMN ss_users.id IS '用户唯一标识符，UUID 自动生成';
COMMENT ON COLUMN ss_users.phone IS '手机号，用于登录，必须唯一';
COMMENT ON COLUMN ss_users.email IS '邮箱，可选登录方式';
COMMENT ON COLUMN ss_users.username IS '用户显示名称';
COMMENT ON COLUMN ss_users.password_hash IS '密码哈希，不存明文';
COMMENT ON COLUMN ss_users.avatar_url IS '头像 URL';
COMMENT ON COLUMN ss_users.status IS '账号状态：active(正常) / disabled(禁用) / deleted(已注销)';
COMMENT ON COLUMN ss_users.failed_login_count IS '连续登录失败次数，成功后清零';
COMMENT ON COLUMN ss_users.locked_until IS '锁定截止时间，超过后自动解锁（连续失败 5 次锁 15 分钟）';
COMMENT ON COLUMN ss_users.current_station_id IS '当前活跃驿站 ID，切换驿站时更新';

DROP TRIGGER IF EXISTS update_ss_users_updated_at ON ss_users;
CREATE TRIGGER update_ss_users_updated_at BEFORE UPDATE ON ss_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 2. 密码重置表
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES ss_users(id) ON DELETE CASCADE,
  token       VARCHAR(500) NOT NULL,
  code        VARCHAR(10),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_password_resets_token ON ss_password_resets(token);
CREATE INDEX IF NOT EXISTS idx_ss_password_resets_user_id ON ss_password_resets(user_id);

COMMENT ON TABLE ss_password_resets IS '密码重置表 - 找回密码的临时令牌与验证码';

DROP TRIGGER IF EXISTS update_ss_password_resets_updated_at ON ss_password_resets;
CREATE TRIGGER update_ss_password_resets_updated_at BEFORE UPDATE ON ss_password_resets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 3. 会话表（自定义 Token Session，非 JWT）
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_user_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES ss_users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(255) UNIQUE NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  -- 设备与审计
  user_agent    TEXT,
  ip_address    VARCHAR(45),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_user_sessions_token_hash ON ss_user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_ss_user_sessions_user_id ON ss_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ss_user_sessions_expires_at ON ss_user_sessions(expires_at);

COMMENT ON TABLE ss_user_sessions IS '用户会话表 - 自定义 Token Session（64 字符 hex，SHA-256 hash 存储，TTL 3 天）';
COMMENT ON COLUMN ss_user_sessions.token_hash IS '访问令牌的 SHA-256 哈希值，原始 token 发给客户端';
COMMENT ON COLUMN ss_user_sessions.expires_at IS '令牌过期时间，默认 3 天';
COMMENT ON COLUMN ss_user_sessions.user_agent IS '客户端 UA，用于审计';
COMMENT ON COLUMN ss_user_sessions.ip_address IS '登录 IP，用于审计';

-- ==============================================
-- 4. 驿站表
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_stations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  address         TEXT NOT NULL,
  contact_phone   VARCHAR(20),
  business_hours  VARCHAR(100),  -- 如 "08:00-22:00"
  -- 货架平面图（SVG 或图片 URL）
  floor_plan_url  TEXT,
  -- 仓库 3D 布局配置（户型 + 门口 + 障碍物）
  -- 结构示例：
  -- {
  --   "bounds": { "width": 20, "depth": 15, "height": 3.2 }, -- 仓库内部尺寸与层高（米）
  --   "doors": [                                         -- 门口列表
  --     { "x": 10, "y": 0, "width": 1.2, "label": "正门" }
  --   ],
  --   "obstacles": [                                     -- 障碍物（柱子/柜台，可选）
  --     { "x": 5, "y": 5, "width": 0.5, "depth": 0.5, "height": 3, "type": "pillar" }
  --   ]
  -- }
  layout_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 滞留规则阈值（天），可按驿站调整
  overdue_warn_days    INTEGER NOT NULL DEFAULT 3,
  overdue_remind_days  INTEGER NOT NULL DEFAULT 7,
  overdue_return_days  INTEGER NOT NULL DEFAULT 15,
  -- 通知开关
  sms_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  -- 通知公示配置（客户绑定引导 / 企微群二维码等）
  notify_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ss_stations IS '驿站表 - 驿站基本信息、营业时间、滞留规则阈值、仓库 3D 布局配置';
COMMENT ON COLUMN ss_stations.overdue_warn_days IS '滞留预警天数（默认 3 天）';
COMMENT ON COLUMN ss_stations.overdue_remind_days IS '滞留二次提醒天数（默认 7 天）';
COMMENT ON COLUMN ss_stations.overdue_return_days IS '滞留退回天数（默认 15 天）';
COMMENT ON COLUMN ss_stations.sms_enabled IS '是否启用短信通知';
COMMENT ON COLUMN ss_stations.layout_config IS '仓库 3D 布局配置 JSON：bounds（仓库尺寸与层高）+ doors（门口列表）+ obstacles（障碍物）';

DROP TRIGGER IF EXISTS update_ss_stations_updated_at ON ss_stations;
CREATE TRIGGER update_ss_stations_updated_at BEFORE UPDATE ON ss_stations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 补 ss_users.current_station_id 外键（驿站表已建）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ss_users_current_station'
      AND table_name = 'ss_users'
  ) THEN
    ALTER TABLE ss_users
      ADD CONSTRAINT fk_ss_users_current_station
      FOREIGN KEY (current_station_id) REFERENCES ss_stations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ==============================================
-- 5. 员工-驿站关系表（多租户）
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES ss_users(id) ON DELETE CASCADE,
  station_id  UUID NOT NULL REFERENCES ss_stations(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL DEFAULT 'clerk' CHECK (role IN ('admin', 'clerk', 'viewer')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  UNIQUE(user_id, station_id)
);

CREATE INDEX IF NOT EXISTS idx_ss_staff_user_id ON ss_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_ss_staff_station_id ON ss_staff(station_id);

COMMENT ON TABLE ss_staff IS '员工-驿站关系表 - 一个工作人员可关联多个驿站';
COMMENT ON COLUMN ss_staff.role IS '角色：admin(管理员) / clerk(店员) / viewer(查询员只读)';

-- ==============================================
-- 6. 货架表
-- 货架按大小分区：小件 / 中件 / 大件，入库时按包裹大小匹配货架
-- 取件码格式：{number}-{layer}-{position}，如 3-2-9903 = 第3号货架第2层第9903号
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_shelves (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id         UUID NOT NULL REFERENCES ss_stations(id) ON DELETE CASCADE,
  number             INTEGER NOT NULL,                  -- 货架号，同驿站唯一，无上限
  size_type          VARCHAR(20) NOT NULL DEFAULT 'small'
                     CHECK (size_type IN ('small', 'medium', 'large')),
  layers             INTEGER NOT NULL DEFAULT 4,        -- 层数
  capacity_per_layer INTEGER NOT NULL DEFAULT 50,       -- 每层容量
  description        TEXT,
  -- 仓库 3D 布局：货架真实物理位置（NULL 时按 size_type 自动布局 fallback）
  pos_x              DOUBLE PRECISION,                  -- 仓库内 X 坐标（米）
  pos_y              DOUBLE PRECISION,                  -- 仓库内 Y 坐标（米，对应 3D 的 Z 轴）
  rotation           SMALLINT NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),  -- 朝向角度
  zone               VARCHAR(4),                        -- 区域号 A/B/C...（NULL 时按 size_type 推断）
  status             VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(station_id, number)
);

CREATE INDEX IF NOT EXISTS idx_ss_shelves_station_id ON ss_shelves(station_id);
CREATE INDEX IF NOT EXISTS idx_ss_shelves_station_size ON ss_shelves(station_id, size_type);

COMMENT ON TABLE ss_shelves IS '货架表 - 每个货架独立标记 size_type，入库时按包裹 size 匹配货架；货架号无上限，归属类型可在后台随时调整（有在库包裹时除外）；取件码 {number}-{layer}-{position}';
COMMENT ON COLUMN ss_shelves.number IS '货架号，同驿站唯一，无上限，仓库扩容时直接新增';
COMMENT ON COLUMN ss_shelves.size_type IS '货架大小类型：small(小件) / medium(中件) / large(大件)，可随时调整';
COMMENT ON COLUMN ss_shelves.layers IS '货架层数';
COMMENT ON COLUMN ss_shelves.capacity_per_layer IS '每层容量，超限时入库提示';
COMMENT ON COLUMN ss_shelves.pos_x IS '货架在仓库内的 X 坐标（米），NULL 时按 size_type 自动布局';
COMMENT ON COLUMN ss_shelves.pos_y IS '货架在仓库内的 Y 坐标（米），NULL 时按 size_type 自动布局';
COMMENT ON COLUMN ss_shelves.rotation IS '货架朝向角度：0/90/180/270';
COMMENT ON COLUMN ss_shelves.zone IS '区域号（A/B/C...），NULL 时按 size_type 推断';

DROP TRIGGER IF EXISTS update_ss_shelves_updated_at ON ss_shelves;
CREATE TRIGGER update_ss_shelves_updated_at BEFORE UPDATE ON ss_shelves
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 7. 快递公司表
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_courier_companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(50) NOT NULL,
  code          VARCHAR(20) UNIQUE NOT NULL,  -- 如 "SF", "ZTO"
  service_phone VARCHAR(20),
  -- 运单号前缀（用于扫码自动识别快递公司）
  tracking_prefixes TEXT[],  -- 如 {"SF", "SF1"}
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_courier_companies_code ON ss_courier_companies(code);
CREATE INDEX IF NOT EXISTS idx_ss_courier_companies_status ON ss_courier_companies(status);

COMMENT ON TABLE ss_courier_companies IS '快递公司表 - 代收代派的快递公司配置';
COMMENT ON COLUMN ss_courier_companies.code IS '快递公司代码，唯一，如 SF/ZTO/YTO';
COMMENT ON COLUMN ss_courier_companies.tracking_prefixes IS '运单号前缀数组，扫码时自动识别快递公司';

DROP TRIGGER IF EXISTS update_ss_courier_companies_updated_at ON ss_courier_companies;
CREATE TRIGGER update_ss_courier_companies_updated_at BEFORE UPDATE ON ss_courier_companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 8. 包裹主表（核心表）
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_parcels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 运单信息
  tracking_number   VARCHAR(50) NOT NULL,
  courier_company_id UUID REFERENCES ss_courier_companies(id) ON DELETE SET NULL,
  -- 收件人信息
  recipient_name    VARCHAR(100) NOT NULL,
  recipient_phone   VARCHAR(20) NOT NULL,
  -- 归属驿站与货架
  station_id        UUID NOT NULL REFERENCES ss_stations(id) ON DELETE RESTRICT,
  shelf_id          UUID REFERENCES ss_shelves(id) ON DELETE SET NULL,
  size              VARCHAR(20) CHECK (size IN ('small', 'medium', 'large')),  -- 包裹大小，决定货架分区
  shelf_layer       INTEGER,      -- 所在层号 1..N（取件码第 2 段）
  shelf_position    INTEGER,      -- 件号 1-9999（随机生成，同货架同层在库不重复，取件码第 3 段）
  -- 取件码（格式：货架号-层号-件号，如 3-2-9903，即包裹位置）
  pickup_code       VARCHAR(30),
  -- 状态
  status            VARCHAR(20) NOT NULL DEFAULT 'in_stock'
                    CHECK (status IN ('in_stock', 'out_stock', 'overdue', 'exception', 'returned')),
  -- 入库
  inbound_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inbound_operator_id UUID REFERENCES ss_users(id) ON DELETE SET NULL,
  inbound_method    VARCHAR(20) NOT NULL DEFAULT 'scan' CHECK (inbound_method IN ('scan', 'manual', 'batch')),
  -- 出库
  outbound_at       TIMESTAMPTZ,
  outbound_operator_id UUID REFERENCES ss_users(id) ON DELETE SET NULL,
  outbound_method   VARCHAR(20) CHECK (outbound_method IN ('manual', 'self_service')),
  -- 退回
  returned_at       TIMESTAMPTZ,
  return_tracking_number VARCHAR(50),
  -- 对用户收款（到付运费 + 代收货款）
  freight_collect_amount NUMERIC(10,2) NOT NULL DEFAULT 0
                      CHECK (freight_collect_amount >= 0),
  cod_amount        NUMERIC(10,2) NOT NULL DEFAULT 0
                      CHECK (cod_amount >= 0),
  collect_status    VARCHAR(20) NOT NULL DEFAULT 'none'
                      CHECK (collect_status IN ('none', 'unpaid', 'paid', 'waived')),
  collect_paid_at   TIMESTAMPTZ,
  collect_paid_method VARCHAR(20)
                      CHECK (collect_paid_method IS NULL OR collect_paid_method IN ('cash', 'wechat', 'alipay', 'other')),
  collect_paid_operator_id UUID REFERENCES ss_users(id) ON DELETE SET NULL,
  collect_note      TEXT,
  -- 备注
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_parcels_tracking_number ON ss_parcels(tracking_number);
CREATE INDEX IF NOT EXISTS idx_ss_parcels_pickup_code ON ss_parcels(pickup_code);
CREATE INDEX IF NOT EXISTS idx_ss_parcels_station_id ON ss_parcels(station_id);
CREATE INDEX IF NOT EXISTS idx_ss_parcels_status ON ss_parcels(status);
CREATE INDEX IF NOT EXISTS idx_ss_parcels_recipient_phone ON ss_parcels(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_ss_parcels_station_status ON ss_parcels(station_id, status);
CREATE INDEX IF NOT EXISTS idx_ss_parcels_inbound_at ON ss_parcels(inbound_at DESC);
CREATE INDEX IF NOT EXISTS idx_ss_parcels_station_collect ON ss_parcels(station_id, collect_status);
-- 同驿站同日取件码唯一（防重，按北京时间日）
-- 注意：DATE(timestamptz) 是 STABLE 不可用于索引表达式，
-- 必须用 AT TIME ZONE '常量' 转为 IMMUTABLE 表达式
CREATE UNIQUE INDEX IF NOT EXISTS idx_ss_parcels_station_code_date
  ON ss_parcels(station_id, pickup_code, ((inbound_at AT TIME ZONE 'Asia/Shanghai')::date));

COMMENT ON TABLE ss_parcels IS '包裹主表 - 快递驿站核心表，记录每个包裹的完整生命周期';
COMMENT ON COLUMN ss_parcels.tracking_number IS '快递运单号';
COMMENT ON COLUMN ss_parcels.recipient_phone IS '收件人手机号（用于查询与通知）';
COMMENT ON COLUMN ss_parcels.pickup_code IS '取件码，格式 货架号-层号-件号（如 3-2-9903），即包裹位置，件号随机生成 1-9999，同货架同层在库不重复，同驿站同日唯一';
COMMENT ON COLUMN ss_parcels.shelf_position IS '件号 1-9999（随机生成，同货架同层在库不重复，取件码第 3 段）';
COMMENT ON COLUMN ss_parcels.size IS '包裹大小：small(小件) / medium(中件) / large(大件)，决定分配到哪类货架';
COMMENT ON COLUMN ss_parcels.shelf_layer IS '所在货架层号 1..N，取件码第 2 段';
COMMENT ON COLUMN ss_parcels.status IS '包裹状态：in_stock(在库) / out_stock(已出库) / overdue(滞留) / exception(异常) / returned(退回)';
COMMENT ON COLUMN ss_parcels.inbound_method IS '入库方式：scan(扫码) / manual(手动) / batch(批量)';
COMMENT ON COLUMN ss_parcels.outbound_method IS '出库方式：manual(人工辅助) / self_service(自助扫描)';
COMMENT ON COLUMN ss_parcels.freight_collect_amount IS '到付运费金额（元），取件时向用户收取';
COMMENT ON COLUMN ss_parcels.cod_amount IS '代收货款金额（元），取件时向用户收取';
COMMENT ON COLUMN ss_parcels.collect_status IS '对用户收款状态：none无 / unpaid待收 / paid已收 / waived免收';
COMMENT ON COLUMN ss_parcels.collect_paid_method IS '收款方式：cash现金 / wechat微信 / alipay支付宝 / other其他';

DROP TRIGGER IF EXISTS update_ss_parcels_updated_at ON ss_parcels;
CREATE TRIGGER update_ss_parcels_updated_at BEFORE UPDATE ON ss_parcels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 9. 包裹状态轨迹表
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_parcel_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id     UUID NOT NULL REFERENCES ss_parcels(id) ON DELETE CASCADE,
  event_type    VARCHAR(30) NOT NULL
                CHECK (event_type IN ('inbound', 'outbound', 'overdue_warn', 'overdue_remind', 'exception_register', 'exception_resolve', 'return_start', 'return_complete', 'note')),
  -- 事件详情
  operator_id   UUID REFERENCES ss_users(id) ON DELETE SET NULL,
  operator_type VARCHAR(20) CHECK (operator_type IN ('staff', 'self_service')),
  description   TEXT,
  metadata      JSONB,  -- 附加数据，如货架变更前后
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_parcel_events_parcel_id ON ss_parcel_events(parcel_id);
CREATE INDEX IF NOT EXISTS idx_ss_parcel_events_created_at ON ss_parcel_events(created_at DESC);

COMMENT ON TABLE ss_parcel_events IS '包裹状态轨迹表 - 每次状态变更记录一条，用于详情页时间线';
COMMENT ON COLUMN ss_parcel_events.event_type IS '事件类型：inbound(入库) / outbound(出库) / overdue_warn(预警) / overdue_remind(提醒) / exception_*(异常) / return_*(退回) / note(备注)';
COMMENT ON COLUMN ss_parcel_events.operator_type IS '操作者类型：staff(工作人员) / self_service(自助)';
COMMENT ON COLUMN ss_parcel_events.metadata IS '附加数据 JSON，如货架变更前后、异常类型等';

-- ==============================================
-- 10. 取件码锁定记录表（防爆破）
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_pickup_code_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_code   VARCHAR(10) NOT NULL,
  station_id    UUID NOT NULL REFERENCES ss_stations(id) ON DELETE CASCADE,
  -- 错误次数与锁定
  attempt_count INTEGER NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(station_id, pickup_code)
);

CREATE INDEX IF NOT EXISTS idx_ss_pickup_code_attempts_station_code ON ss_pickup_code_attempts(station_id, pickup_code);

COMMENT ON TABLE ss_pickup_code_attempts IS '取件码尝试记录表 - 防爆破，错误 3 次锁定 10 分钟';
COMMENT ON COLUMN ss_pickup_code_attempts.locked_until IS '锁定截止时间，超过后清零 attempt_count';

DROP TRIGGER IF EXISTS update_ss_pickup_code_attempts_updated_at ON ss_pickup_code_attempts;
CREATE TRIGGER update_ss_pickup_code_attempts_updated_at BEFORE UPDATE ON ss_pickup_code_attempts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 11. 短信模板表
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_sms_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(50) UNIQUE NOT NULL,  -- 如 "inbound_notice"
  name          VARCHAR(100) NOT NULL,
  content       TEXT NOT NULL,  -- 模板内容，占位符用 {{var}}
  -- 触发场景
  trigger_event VARCHAR(30) NOT NULL
                CHECK (trigger_event IN ('inbound', 'overdue_warn', 'overdue_remind', 'return', 'outbound', 'kiosk_code')),
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ss_sms_templates IS '短信模板表 - 预定义通知模板，占位符用 {{var}} 格式';
COMMENT ON COLUMN ss_sms_templates.code IS '模板代码，唯一，如 inbound_notice';
COMMENT ON COLUMN ss_sms_templates.content IS '模板内容，如：【{{station_name}}】您有包裹已到，取件码 {{pickup_code}}，请凭码到对应货架取件。';

DROP TRIGGER IF EXISTS update_ss_sms_templates_updated_at ON ss_sms_templates;
CREATE TRIGGER update_ss_sms_templates_updated_at BEFORE UPDATE ON ss_sms_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- 12. 短信发送记录表
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_sms_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID REFERENCES ss_sms_templates(id) ON DELETE SET NULL,
  template_code VARCHAR(50) NOT NULL,
  -- 收件人
  recipient_phone VARCHAR(20) NOT NULL,
  recipient_name  VARCHAR(100),
  -- 内容
  content       TEXT NOT NULL,
  params        JSONB,  -- 实际填充的参数
  -- 发送状态
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  -- 关联
  parcel_id     UUID REFERENCES ss_parcels(id) ON DELETE SET NULL,
  station_id    UUID REFERENCES ss_stations(id) ON DELETE SET NULL,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_sms_logs_recipient_phone ON ss_sms_logs(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_ss_sms_logs_status ON ss_sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_ss_sms_logs_created_at ON ss_sms_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ss_sms_logs_station_id ON ss_sms_logs(station_id);

COMMENT ON TABLE ss_sms_logs IS '通知发送记录表 - 免费多通道（console/wecom/serverchan）日志，表名历史遗留';
COMMENT ON COLUMN ss_sms_logs.status IS '发送状态：pending(待发) / sent(已发) / failed(失败)';

-- ==============================================
-- 13. Kiosk 验证码表（取件自助查询用）
-- ==============================================
CREATE TABLE IF NOT EXISTS ss_kiosk_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         VARCHAR(20) NOT NULL,
  code          VARCHAR(10) NOT NULL,  -- 6 位验证码
  station_id    UUID REFERENCES ss_stations(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  -- 限流用：发送审计
  ip_address    VARCHAR(45),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ss_kiosk_codes_phone ON ss_kiosk_codes(phone);
CREATE INDEX IF NOT EXISTS idx_ss_kiosk_codes_created_at ON ss_kiosk_codes(created_at DESC);

COMMENT ON TABLE ss_kiosk_codes IS 'Kiosk 验证码表 - 取件自助查询的手机验证码，限流：同手机号每小时 ≤5 次';
COMMENT ON COLUMN ss_kiosk_codes.expires_at IS '验证码过期时间，默认 5 分钟';

-- ==============================================
-- 清理函数：过期会话
-- ==============================================
-- 先 DROP 保证幂等（CREATE OR REPLACE 不允许改返回类型）
DROP FUNCTION IF EXISTS fn_cleanup_expired_sessions() CASCADE;
CREATE FUNCTION fn_cleanup_expired_sessions()
RETURNS VOID AS $$
BEGIN
  DELETE FROM ss_user_sessions WHERE expires_at < NOW();
END;
$$ language 'plpgsql';

-- ==============================================
-- 初始数据：默认短信模板
-- ==============================================
INSERT INTO ss_sms_templates (code, name, content, trigger_event, status)
VALUES
  ('inbound_notice', '入库通知', '【{{station_name}}】您有包裹已到，取件码 {{pickup_code}}，货架 {{shelf_code}}，请凭码到店取件。', 'inbound', 'active'),
  ('overdue_warn', '滞留预警', '【{{station_name}}】您的包裹已到 {{days}} 天，请尽快取件，超期将退回。', 'overdue_warn', 'active'),
  ('overdue_remind', '滞留二次提醒', '【{{station_name}}】您的包裹已到 {{days}} 天，即将退回，请立即取件。', 'overdue_remind', 'active'),
  ('return_notice', '退回通知', '【{{station_name}}】您的包裹已退回原快递公司，运单号 {{return_tracking}}。', 'return', 'active'),
  ('outbound_notice', '取件成功', '【{{station_name}}】您的包裹已取出，感谢使用。', 'outbound', 'active'),
  ('kiosk_code', 'Kiosk 验证码', '【{{station_name}}】您的取件查询验证码是 {{code}}，5 分钟内有效。', 'kiosk_code', 'active')
ON CONFLICT (code) DO NOTHING;

-- ==============================================
-- 初始数据：常见快递公司
-- ==============================================
INSERT INTO ss_courier_companies (name, code, service_phone, tracking_prefixes, sort_order, status)
VALUES
  ('顺丰速运', 'SF', '95338', ARRAY['SF', 'SF1', 'SF2'], 1, 'active'),
  ('中通快递', 'ZTO', '95311', ARRAY['768', '769', '770', '771'], 2, 'active'),
  ('圆通速递', 'YTO', '95543', ARRAY['10', '11', '12', '13'], 3, 'active'),
  ('韵达快递', 'YUNDA', '95546', ARRAY['31', '32', '33', '34'], 4, 'active'),
  ('申通快递', 'STO', '95543', ARRAY['26', '27', '28', '29'], 5, 'active'),
  ('京东物流', 'JD', '950616', ARRAY['JD'], 6, 'active'),
  ('极兔速递', 'JTS', '956080', ARRAY['JT', 'JT1'], 7, 'active'),
  ('邮政EMS', 'EMS', '11183', ARRAY['EA', 'EB', 'EC'], 8, 'active')
ON CONFLICT (code) DO NOTHING;

-- ==============================================
-- 14. 异常件表（1.3.0 / M24）
-- ==============================================
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

-- 未来版本预留（尚未实现，仅登记规划，勿在本文件建表）：
--   v1.x: ss_overdue_rules（独立滞留规则，当前仍用 ss_stations 阈值字段）
--   v1.x: ss_devices（设备管理，当前 PAD/扫描机不绑定记录）
--   v2.0: ss_station_group / ss_station_group_members（连锁多站点）

-- ==============================================
-- 15. 寄件管理 + 财务结算（1.4.0 / M25）
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
-- 已部署库兼容补丁（ALTER）
--   新建库执行上方 CREATE TABLE 即可，以下字段已内联；
--   仅早于对应版本部署、缺少这些列的旧库需要执行本段补列（全部 IF NOT EXISTS，可安全重复执行）。
-- ==============================================
-- 仓库 3D 布局：ss_stations 加 layout_config 字段
ALTER TABLE ss_stations
  ADD COLUMN IF NOT EXISTS layout_config JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN ss_stations.layout_config IS '仓库 3D 布局配置 JSON：bounds（仓库尺寸与层高）+ doors（门口列表）+ obstacles（障碍物）';

-- ss_shelves 加 4 个位置字段
ALTER TABLE ss_shelves
  ADD COLUMN IF NOT EXISTS pos_x    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pos_y    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS rotation SMALLINT NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),
  ADD COLUMN IF NOT EXISTS zone     VARCHAR(4);
COMMENT ON COLUMN ss_shelves.pos_x IS '货架在仓库内的 X 坐标（米），NULL 时按 size_type 自动布局';
COMMENT ON COLUMN ss_shelves.pos_y IS '货架在仓库内的 Y 坐标（米），NULL 时按 size_type 自动布局';
COMMENT ON COLUMN ss_shelves.rotation IS '货架朝向角度：0/90/180/270';
COMMENT ON COLUMN ss_shelves.zone IS '区域号（A/B/C...），NULL 时按 size_type 推断';


-- 对用户收款（到付/代收）：旧库 ss_parcels 缺列时补齐（新建库 CREATE 已含这些列）
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

-- ==============================================
-- 16. 面单 OCR 月度额度计数表（防止免费额度用完后自动转按量付费）
-- ==============================================
-- 说明：腾讯云 OCR 免费额度用完后会「自动转按量付费」，不会报错拦截，
-- 因此由后端维护「按月全局计数 + 硬上限」，调用腾讯云之前先原子占用一次额度，
-- 到达上限直接拒绝（不再发起腾讯云请求 → 杜绝按量付费）。
-- 计费按腾讯云「账号」全局计（所有驿站共享同一免费额度），故计数按月份全局，不按 station。
CREATE TABLE IF NOT EXISTS ss_ocr_usage (
  month       VARCHAR(7) PRIMARY KEY,          -- 计费月份，北京时间 YYYY-MM
  used        INTEGER NOT NULL DEFAULT 0,      -- 当月已调用次数
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ss_ocr_usage IS '面单 OCR 月度调用计数 - 按月全局限额，防止免费额度用完后产生按量付费';
COMMENT ON COLUMN ss_ocr_usage.month IS '计费月份（北京时间 YYYY-MM），与腾讯云免费额度按月重置对齐';
COMMENT ON COLUMN ss_ocr_usage.used IS '当月已成功占用的调用次数';

-- 原子占用一次额度：当月计数 +1，若超过 p_limit 则不自增并返回 allowed=false。
-- 返回单行 (allowed BOOLEAN, used INTEGER)。用 INSERT ... ON CONFLICT 保证并发安全。
DROP FUNCTION IF EXISTS ss_ocr_try_consume(VARCHAR, INTEGER);
CREATE FUNCTION ss_ocr_try_consume(p_month VARCHAR, p_limit INTEGER)
RETURNS TABLE(allowed BOOLEAN, used INTEGER) AS $$
DECLARE
  v_used INTEGER;
BEGIN
  -- 原子自增：首次插入为 1，冲突时在现有值上 +1，仅当未超上限时才自增
  INSERT INTO ss_ocr_usage (month, used, updated_at)
    VALUES (p_month, 1, now())
  ON CONFLICT (month) DO UPDATE
    SET used = ss_ocr_usage.used + 1, updated_at = now()
    WHERE ss_ocr_usage.used < p_limit
  RETURNING ss_ocr_usage.used INTO v_used;

  IF v_used IS NULL THEN
    -- 未发生自增（已达上限）：取当前值返回 allowed=false
    SELECT ss_ocr_usage.used INTO v_used FROM ss_ocr_usage WHERE month = p_month;
    RETURN QUERY SELECT false, COALESCE(v_used, p_limit);
  ELSE
    RETURN QUERY SELECT true, v_used;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION ss_ocr_try_consume(VARCHAR, INTEGER) IS '原子占用一次 OCR 额度：当月+1，超过上限返回 allowed=false（不自增）';


-- ==============================================
-- 17. 客户通知绑定 + 驿站通知公示配置（免费通道路线）
-- ==============================================
-- 角色说明：
-- - 企业微信群机器人 = 共享公告通道，仅脱敏摘要，永不发取件码
-- - Server酱个人 SendKey = 客户一对一私信（完整取件码）
-- - 环境变量 SERVERCHAN_SENDKEY = 管理员旁路（完整内容，仅管理员微信）

ALTER TABLE ss_stations
  ADD COLUMN IF NOT EXISTS notify_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN ss_stations.notify_config IS '通知公示与引导 JSON：title/content/wecomQrUrl/wecomJoinTip/wxpusherGuide/serverchanGuide/serverchanGuideUrl/bindEnabled';
COMMENT ON COLUMN ss_stations.sms_enabled IS '是否启用到件通知（历史字段名；实际走免费多通道而非商用短信）';

CREATE TABLE IF NOT EXISTS ss_notify_bindings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  UUID NOT NULL REFERENCES ss_stations(id) ON DELETE CASCADE,
  phone       VARCHAR(20) NOT NULL,
  -- 主通道 wxpusher；兼容 serverchan
  channel     VARCHAR(20) NOT NULL DEFAULT 'wxpusher'
              CHECK (channel IN ('wxpusher', 'pushplus', 'serverchan')),
  -- wxpusher 为 UID_xxx；serverchan 为 SendKey
  target      TEXT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'disabled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (station_id, phone, channel)
);

CREATE INDEX IF NOT EXISTS idx_ss_notify_bindings_phone
  ON ss_notify_bindings(phone);
CREATE INDEX IF NOT EXISTS idx_ss_notify_bindings_station
  ON ss_notify_bindings(station_id);

COMMENT ON TABLE ss_notify_bindings IS '客户通知绑定 - wxpusher UID / pushplus token / serverchan SendKey';
COMMENT ON COLUMN ss_notify_bindings.target IS '通道目标：wxpusher=UID；pushplus=token；serverchan=SendKey';

DROP TRIGGER IF EXISTS update_ss_notify_bindings_updated_at ON ss_notify_bindings;
CREATE TRIGGER update_ss_notify_bindings_updated_at BEFORE UPDATE ON ss_notify_bindings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- WxPusher 扫码绑定会话
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

-- ==============================================
-- 交接班班次表（B5）
-- ==============================================
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
