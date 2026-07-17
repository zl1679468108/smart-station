-- Smart Station - 货架规则重设计迁移脚本
-- 用途：将旧的 ss_shelves(code/area/capacity) 结构升级为新结构(number/size_type/layers/capacity_per_layer)
--       并为 ss_parcels 增加 size/shelf_layer/shelf_position 字段
-- 执行位置：Supabase SQL Editor
-- 注意：执行前请备份相关表数据。本脚本可安全重复执行（使用 IF NOT EXISTS / DO 块判断）
-- 取件码格式：{number}-{layer}-{random4}，如 22-9-2132 = 第22号货架第9层

-- ==============================================
-- 1. ss_shelves 表结构升级
-- ==============================================

-- 1.1 新增列
ALTER TABLE ss_shelves ADD COLUMN IF NOT EXISTS number INTEGER;
ALTER TABLE ss_shelves ADD COLUMN IF NOT EXISTS size_type VARCHAR(20) NOT NULL DEFAULT 'small';
ALTER TABLE ss_shelves ADD COLUMN IF NOT EXISTS layers INTEGER NOT NULL DEFAULT 4;
ALTER TABLE ss_shelves ADD COLUMN IF NOT EXISTS capacity_per_layer INTEGER NOT NULL DEFAULT 50;

-- 1.2 添加 CHECK 约束（size_type 枚举）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ss_shelves_size_type_check' AND table_name = 'ss_shelves'
  ) THEN
    ALTER TABLE ss_shelves
      ADD CONSTRAINT ss_shelves_size_type_check
      CHECK (size_type IN ('small', 'medium', 'large'));
  END IF;
END $$;

-- 1.3 从旧 code 列迁移货架号（提取数字部分）
--     先尝试从 code 提取数字，提取不到的置 NULL，由 1.4 步兜底
--     用 DO 块判断 code 列是否存在，避免列已删除时报错
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ss_shelves' AND column_name = 'code'
  ) THEN
    UPDATE ss_shelves
    SET number = NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::int
    WHERE number IS NULL AND code IS NOT NULL;
  END IF;
END $$;

-- 1.4 去重：检测每个 station 内是否有重复的 number，如有则按 created_at 排序重新分配连续编号
--     这一步保证 (station_id, number) 唯一，无论旧 code 格式如何
DO $$
DECLARE
  sid UUID;
  r RECORD;
  n INT;
BEGIN
  -- 遍历每个驿站
  FOR sid IN SELECT DISTINCT station_id FROM ss_shelves LOOP
    -- 检查该驿站是否有重复 number（排除 NULL）
    IF EXISTS (
      SELECT 1
      FROM ss_shelves
      WHERE station_id = sid AND number IS NOT NULL
      GROUP BY number
      HAVING count(*) > 1
    ) THEN
      -- 有重复：该驿站所有货架按 created_at 排序重新分配 1, 2, 3...
      n := 1;
      FOR r IN
        SELECT id FROM ss_shelves
        WHERE station_id = sid
        ORDER BY created_at, id
      LOOP
        UPDATE ss_shelves SET number = n WHERE id = r.id;
        n := n + 1;
      END LOOP;
    ELSE
      -- 无重复：仅为 NULL 的货架补号（追加到末尾）
      SELECT COALESCE(MAX(number), 0) INTO n
      FROM ss_shelves WHERE station_id = sid AND number IS NOT NULL;

      FOR r IN
        SELECT id FROM ss_shelves
        WHERE station_id = sid AND number IS NULL
        ORDER BY created_at, id
      LOOP
        n := n + 1;
        UPDATE ss_shelves SET number = n WHERE id = r.id;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- 1.5 从旧 capacity 迁移到 capacity_per_layer（按 4 层估算，最小 10）
--     用 DO 块判断 capacity 列是否存在，避免列已删除时报错
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ss_shelves' AND column_name = 'capacity'
  ) THEN
    UPDATE ss_shelves
    SET capacity_per_layer = GREATEST(capacity / 4, 10)
    WHERE capacity IS NOT NULL AND capacity_per_layer = 50;
  END IF;
END $$;

-- 1.6 添加 (station_id, number) 唯一约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ss_shelves_station_id_number_key' AND table_name = 'ss_shelves'
  ) THEN
    ALTER TABLE ss_shelves ADD CONSTRAINT ss_shelves_station_id_number_key UNIQUE (station_id, number);
  END IF;
END $$;

-- 1.7 添加按大小分区的索引
CREATE INDEX IF NOT EXISTS idx_ss_shelves_station_size ON ss_shelves(station_id, size_type);

-- 1.8 删除旧列（确认无依赖后）
ALTER TABLE ss_shelves DROP COLUMN IF EXISTS code;
ALTER TABLE ss_shelves DROP COLUMN IF EXISTS area;
ALTER TABLE ss_shelves DROP COLUMN IF EXISTS capacity;

-- 1.9 更新注释
COMMENT ON TABLE ss_shelves IS '货架表 - 每个货架独立标记 size_type，入库时按包裹 size 匹配货架；货架号无上限，归属类型可在后台随时调整（有在库包裹时除外）；取件码 {number}-{layer}-{random4}';
COMMENT ON COLUMN ss_shelves.number IS '货架号，同驿站唯一，无上限，仓库扩容时直接新增';
COMMENT ON COLUMN ss_shelves.size_type IS '货架大小类型：small(小件) / medium(中件) / large(大件)，可随时调整';
COMMENT ON COLUMN ss_shelves.layers IS '货架层数';
COMMENT ON COLUMN ss_shelves.capacity_per_layer IS '每层容量，超限时入库提示';

-- ==============================================
-- 2. ss_parcels 表新增位置字段
-- ==============================================
ALTER TABLE ss_parcels ADD COLUMN IF NOT EXISTS size VARCHAR(20);
ALTER TABLE ss_parcels ADD COLUMN IF NOT EXISTS shelf_layer INTEGER;
ALTER TABLE ss_parcels ADD COLUMN IF NOT EXISTS shelf_position INTEGER;

-- 添加 size CHECK 约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ss_parcels_size_check' AND table_name = 'ss_parcels'
  ) THEN
    ALTER TABLE ss_parcels
      ADD CONSTRAINT ss_parcels_size_check
      CHECK (size IN ('small', 'medium', 'large'));
  END IF;
END $$;

COMMENT ON COLUMN ss_parcels.size IS '包裹大小：small(小件) / medium(中件) / large(大件)，决定分配到哪类货架';
COMMENT ON COLUMN ss_parcels.shelf_layer IS '所在货架层号 1..N，取件码第 2 段';
COMMENT ON COLUMN ss_parcels.shelf_position IS '层内件号（顺序号，同层内排序用，不直接展示给用户）';

-- ==============================================
-- 验证查询（执行后可取消注释查看结果）
-- ==============================================
-- SELECT number, size_type, layers, capacity_per_layer, status FROM ss_shelves ORDER BY number;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ss_parcels' AND column_name IN ('size','shelf_layer','shelf_position');
