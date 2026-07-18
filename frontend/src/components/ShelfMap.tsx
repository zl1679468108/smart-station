import React, { useMemo, useRef, useState, Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Text, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import gsap from 'gsap';
import type {
  KioskShelf,
  ShelfSizeType,
  StationLayoutConfig,
  LayoutDoor,
  LayoutArea,
} from '@/types/kiosk';
import { SHELF_ZONE_MAP } from '@/types/kiosk';

/**
 * 货架 3D 平面图（v1.2.0 真实位置版，与管理端 ShelfMapEditor 渲染统一）
 * ----------------------------------------------------------------
 * - 优先按货架 posX/posY 真实坐标摆放 + rotation 朝向
 * - 货架无坐标时自动 fallback 到 size_type 网格布局（向后兼容）
 * - 渲染仓库地面网格（bounds）+ 门口 + 区域（办公区/揽收区）+ 货架
 * - 高亮货架：橙色发光 + 「该货架包裹（N）个」悬浮 + 底面脉冲光圈
 * - 办公区：显示「您在这里」悬浮标注（作为寻路起点）
 * - 寻路路径：办公区 → 每个高亮货架画 L 形虚线 + 箭头
 * - OrbitControls 旋转/缩放，限制角度不可翻到地下
 * - 地面网格以原点为中心，相机对准原点，与管理端完全对齐
 *
 * 入参：
 *  - shelves：货架列表
 *  - layoutConfig：仓库户型（bounds + doors + areas）
 *  - highlights：高亮项（货架号 + 可选层号 + 包裹数量，来自取件码前两段）
 */

// ============ 布局常量（fallback 自动布局用，与后端 autoInit 一致） ============
const SHELF_W = 2.4;
const SHELF_D = 1.2;
const LAYER_H = 0.55;
const POST = 0.08;
const BOARD_T = 0.05;
const SHELF_GAP_X = 0.5;
const SHELF_GAP_Z = 1.0;
const PER_ROW = 6;
const ZONE_GAP = 2.4;
const ZONE_LABEL_H = 0.6;

const HIGHLIGHT_COLOR = '#FF6A00';
const NORMAL_FRAME = '#94A3B8';
const NORMAL_BOARD = '#E2E8F0';
const GROUND_COLOR = '#F1F5F9';
const GRID_COLOR = '#CBD5E1';
const DOOR_COLOR = '#10B981';
const PATH_COLOR = '#FF6A00';
const AREA_OFFICE_COLOR = '#3B82F6';
const AREA_PICKUP_COLOR = '#8B5CF6';

// ============ 工具：fallback 自动布局计算 ============
interface PlacedShelf {
  shelf: KioskShelf;
  x: number;
  z: number;
  zone: string;
}

/**
 * 计算货架摆放位置：
 * - 有 posX/posY 的货架用真实坐标
 * - 无坐标的货架走 size_type 网格自动布局（区与区沿 Z 错开）
 */
function computeShelfPositions(shelves: KioskShelf[]): {
  placed: PlacedShelf[];
  hasRealCoords: boolean;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
} {
  const hasRealCoords = shelves.some((s) => s.posX !== null && s.posY !== null);

  // 无坐标的货架按 size_type 分组走 fallback
  const order: ShelfSizeType[] = ['small', 'medium', 'large'];
  const fallbackGroup: Record<ShelfSizeType, KioskShelf[]> = {
    small: [],
    medium: [],
    large: [],
  };
  for (const s of shelves) {
    if (s.posX === null || s.posY === null) {
      fallbackGroup[s.sizeType].push(s);
    }
  }

  // 计算 fallback 区块的起始 Z（避开真实坐标货架的最大 Z）
  let cursorZ = 0;
  if (hasRealCoords) {
    for (const s of shelves) {
      if (s.posX !== null && s.posY !== null) {
        cursorZ = Math.max(cursorZ, s.posY + SHELF_D);
      }
    }
    cursorZ += ZONE_GAP;
  }

  const placed: PlacedShelf[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = 0;
  let maxZ = -Infinity;

  // 真实坐标货架
  for (const s of shelves) {
    if (s.posX !== null && s.posY !== null) {
      placed.push({
        shelf: s,
        x: s.posX,
        z: s.posY,
        zone: s.zone || SHELF_ZONE_MAP[s.sizeType],
      });
      minX = Math.min(minX, s.posX - SHELF_W / 2);
      maxX = Math.max(maxX, s.posX + SHELF_W / 2);
      minZ = Math.min(minZ, s.posY - SHELF_D / 2);
      maxZ = Math.max(maxZ, s.posY + SHELF_D / 2);
    }
  }

  // fallback 网格货架
  for (const t of order) {
    const items = fallbackGroup[t];
    if (items.length === 0) continue;
    const rows = Math.ceil(items.length / PER_ROW);
    const rowWidth = PER_ROW * SHELF_W + (PER_ROW - 1) * SHELF_GAP_X;
    const zoneDepth = rows * SHELF_D + (rows - 1) * SHELF_GAP_Z + ZONE_LABEL_H;
    const originZ = cursorZ;
    cursorZ += zoneDepth + ZONE_GAP;

    items.forEach((s, i) => {
      const row = Math.floor(i / PER_ROW);
      const col = i % PER_ROW;
      const x = col * (SHELF_W + SHELF_GAP_X) - rowWidth / 2 + SHELF_W / 2;
      const z = row * (SHELF_D + SHELF_GAP_Z) + ZONE_LABEL_H + SHELF_D / 2 + originZ;
      placed.push({
        shelf: s,
        x,
        z,
        zone: s.zone || SHELF_ZONE_MAP[t],
      });
      minX = Math.min(minX, x - SHELF_W / 2);
      maxX = Math.max(maxX, x + SHELF_W / 2);
      maxZ = Math.max(maxZ, z + SHELF_D / 2);
    });
  }

  if (minX === Infinity) {
    minX = -5;
    maxX = 5;
    maxZ = 5;
  }

  return {
    placed,
    hasRealCoords,
    bounds: { minX, maxX, minZ, maxZ },
  };
}

// ============ 单个货架 ============
interface ShelfMeshProps {
  shelf: KioskShelf;
  position: [number, number, number];
  rotationY: number;
  highlight: boolean;
  highlightLayer?: number | null;
  highlightCount?: number;
  dimmed?: boolean;
}

const ShelfRack: React.FC<ShelfMeshProps> = ({
  shelf,
  position,
  rotationY,
  highlight,
  highlightLayer,
  highlightCount = 0,
  dimmed,
}) => {
  const totalH = shelf.layers * LAYER_H + BOARD_T;
  const frameColor = highlight ? HIGHLIGHT_COLOR : NORMAL_FRAME;
  const boardColor = highlight ? '#FFD7B5' : NORMAL_BOARD;
  const opacity = dimmed ? 0.35 : 1;

  const postPositions: [number, number, number][] = [
    [-SHELF_W / 2 + POST / 2, 0, -SHELF_D / 2 + POST / 2],
    [SHELF_W / 2 - POST / 2, 0, -SHELF_D / 2 + POST / 2],
    [-SHELF_W / 2 + POST / 2, 0, SHELF_D / 2 - POST / 2],
    [SHELF_W / 2 - POST / 2, 0, SHELF_D / 2 - POST / 2],
  ];

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 高亮货架底面脉冲光圈 */}
      {highlight && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[SHELF_W * 0.55, SHELF_W * 0.7, 32]} />
          <meshStandardMaterial
            color={HIGHLIGHT_COLOR}
            transparent
            opacity={0.4}
            emissive={HIGHLIGHT_COLOR}
            emissiveIntensity={0.5}
          />
        </mesh>
      )}

      {/* 4 根立柱 */}
      {postPositions.map((p, i) => (
        <mesh key={`post-${i}`} position={[p[0], totalH / 2, p[2]]} castShadow>
          <boxGeometry args={[POST, totalH, POST]} />
          <meshStandardMaterial color={frameColor} transparent opacity={opacity} />
        </mesh>
      ))}

      {/* 层板 */}
      {Array.from({ length: shelf.layers + 1 }).map((_, i) => {
        const y = i * LAYER_H;
        const isHighlightLayer =
          highlight &&
          highlightLayer !== null &&
          highlightLayer !== undefined &&
          i === highlightLayer;
        return (
          <mesh key={`board-${i}`} position={[0, y, 0]} receiveShadow castShadow>
            <boxGeometry args={[SHELF_W, BOARD_T, SHELF_D]} />
            <meshStandardMaterial
              color={isHighlightLayer ? HIGHLIGHT_COLOR : boardColor}
              emissive={isHighlightLayer ? HIGHLIGHT_COLOR : '#000000'}
              emissiveIntensity={isHighlightLayer ? 0.4 : 0}
              transparent
              opacity={opacity}
            />
          </mesh>
        );
      })}

      {/* 高亮层上的包裹小盒 */}
      {highlight && highlightLayer !== null && highlightLayer !== undefined && (
        <mesh position={[0, highlightLayer * LAYER_H + BOARD_T / 2 + 0.18, 0]} castShadow>
          <boxGeometry args={[SHELF_W * 0.6, 0.32, SHELF_D * 0.6]} />
          <meshStandardMaterial
            color={HIGHLIGHT_COLOR}
            emissive={HIGHLIGHT_COLOR}
            emissiveIntensity={0.6}
          />
        </mesh>
      )}

      {/* 货架号 */}
      <Text
        position={[0, totalH + 0.35, 0]}
        fontSize={0.32}
        color={highlight ? HIGHLIGHT_COLOR : '#334155'}
        anchorX="center"
        anchorY="middle"
      >
        {`#${shelf.number}`}
      </Text>

      {/* 高亮悬浮标注：显示该货架包裹数量 */}
      {highlight && (
        <Html position={[0, totalH + 0.75, 0]} center distanceFactor={10}>
          <div
            style={{
              background: HIGHLIGHT_COLOR,
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(255,106,0,0.4)',
              transform: 'translateY(-4px)',
            }}
          >
            ▼ 该货架包裹（{highlightCount}）个
          </div>
        </Html>
      )}
    </group>
  );
};

// ============ 门口 ============
const DoorMesh: React.FC<{ door: LayoutDoor; distanceLabel?: string }> = ({
  door,
  distanceLabel,
}) => {
  return (
    <group position={[door.x, 0, door.y]}>
      {/* 门口发光框（贴地面，沿 X 轴方向） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[door.width, 0.3]} />
        <meshStandardMaterial
          color={DOOR_COLOR}
          emissive={DOOR_COLOR}
          emissiveIntensity={0.7}
          transparent
          opacity={0.8}
        />
      </mesh>
      {/* 门柱（两侧） */}
      {[-door.width / 2, door.width / 2].map((x, i) => (
        <mesh key={`doorpost-${i}`} position={[x, 1, 0]}>
          <boxGeometry args={[0.1, 2, 0.1]} />
          <meshStandardMaterial color={DOOR_COLOR} emissive={DOOR_COLOR} emissiveIntensity={0.3} />
        </mesh>
      ))}
      {/* 「入口」标签 */}
      <Html position={[0, 2.4, 0]} center distanceFactor={10}>
        <div
          style={{
            background: DOOR_COLOR,
            color: '#fff',
            padding: '3px 10px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(16,185,129,0.4)',
          }}
        >
          🚪 {door.label}
        </div>
      </Html>
      {distanceLabel && (
        <Text
          position={[0, 0.5, 0]}
          fontSize={0.22}
          color={DOOR_COLOR}
          anchorX="center"
          anchorY="middle"
        >
          {distanceLabel}
        </Text>
      )}
    </group>
  );
};

// ============ 网格地面（与管理端 ShelfMapEditor 统一） ============
const GridFloor: React.FC<{ width: number; depth: number }> = ({ width, depth }) => {
  const lines = useMemo(() => {
    const arr: Array<[number, number, number, number, number, number]> = [];
    const halfW = width / 2;
    const halfD = depth / 2;
    for (let x = -Math.ceil(halfW); x <= Math.ceil(halfW); x++) {
      arr.push([x, 0.005, -halfD, x, 0.005, halfD]);
    }
    for (let z = -Math.ceil(halfD); z <= Math.ceil(halfD); z++) {
      arr.push([-halfW, 0.005, z, halfW, 0.005, z]);
    }
    return arr;
  }, [width, depth]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={GROUND_COLOR} />
      </mesh>
      {lines.map((l, i) => (
        <line key={`g-${i}`}>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array(l)}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color={GRID_COLOR} transparent opacity={0.4} />
        </line>
      ))}
    </group>
  );
};

// ============ 区域（只读，办公区显示「您在这里」作为寻路起点） ============
const AreaMesh: React.FC<{ area: LayoutArea; isStartPoint: boolean }> = ({
  area,
  isStartPoint,
}) => {
  const baseColor = area.type === 'office' ? AREA_OFFICE_COLOR : AREA_PICKUP_COLOR;
  const totalH = area.height;

  return (
    <group position={[area.x, 0, area.y]}>
      {/* 区域底面（半透明色块） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={[area.width, area.depth]} />
        <meshStandardMaterial
          color={baseColor}
          transparent
          opacity={isStartPoint ? 0.35 : 0.22}
          emissive={baseColor}
          emissiveIntensity={isStartPoint ? 0.3 : 0.15}
        />
      </mesh>

      {/* 区域边框（4 立柱 + 顶框，与管理端统一） */}
      {[
        [-area.width / 2, 0, -area.depth / 2],
        [area.width / 2, 0, -area.depth / 2],
        [-area.width / 2, 0, area.depth / 2],
        [area.width / 2, 0, area.depth / 2],
      ].map((p, i) => (
        <mesh key={`ap-${i}`} position={[p[0], totalH / 2, p[2]]}>
          <boxGeometry args={[0.06, totalH, 0.06]} />
          <meshStandardMaterial color={baseColor} transparent opacity={0.8} />
        </mesh>
      ))}
      {[
        { pos: [0, totalH, -area.depth / 2] as [number, number, number], size: [area.width, 0.05, 0.05] as [number, number, number] },
        { pos: [0, totalH, area.depth / 2] as [number, number, number], size: [area.width, 0.05, 0.05] as [number, number, number] },
        { pos: [-area.width / 2, totalH, 0] as [number, number, number], size: [0.05, 0.05, area.depth] as [number, number, number] },
        { pos: [area.width / 2, totalH, 0] as [number, number, number], size: [0.05, 0.05, area.depth] as [number, number, number] },
      ].map((b, i) => (
        <mesh key={`ab-${i}`} position={b.pos}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={baseColor} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* 区域标签 */}
      <Text
        position={[0, totalH + 0.35, 0]}
        fontSize={0.32}
        color={baseColor}
        anchorX="center"
        anchorY="middle"
      >
        {area.label}
      </Text>

      {/* 办公区作为寻路起点：显示「您在这里」悬浮标注 */}
      {isStartPoint && (
        <Html position={[0, totalH + 0.75, 0]} center distanceFactor={10}>
          <div
            style={{
              background: baseColor,
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: `0 2px 8px rgba(59,130,246,0.4)`,
            }}
          >
            📍 您在这里
          </div>
        </Html>
      )}
    </group>
  );
};

// ============ 寻路路径（L 形虚线 + 箭头 + 流动光效） ============
const PathLine: React.FC<{
  from: [number, number];
  to: [number, number];
}> = ({ from, to }) => {
  const lineRef = useRef<any>(null);
  const arrowRef = useRef<any>(null);
  const labelRef = useRef<any>(null);
  const startTime = useRef<number | null>(null);

  // L 形路径：先沿 X 走到目标 X，再沿 Z 走到目标 Z
  const points: [number, number, number][] = [
    [from[0], 0.05, from[1]],
    [to[0], 0.05, from[1]],
    [to[0], 0.05, to[1]],
  ];

  // 距离 / 步数 / 时间
  const dist = Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2);
  const steps = Math.max(1, Math.ceil(dist / 0.6)); // 步距 0.6m
  const seconds = dist / 1.2; // 步速 1.2 m/s
  const midX = (from[0] + to[0]) / 2;
  const midZ = (from[1] + to[1]) / 2;
  const arrowAngle = Math.atan2(to[1] - from[1], to[0] - from[0]);

  useFrame((state, delta) => {
    // 流动：dashOffset 持续递减让虚线"流向"终点
    if (lineRef.current?.material) {
      const mat = lineRef.current.material;
      mat.dashOffset -= delta * 1.0;

      // 出现动画：0.5s 内 opacity 0→1
      if (startTime.current === null) startTime.current = state.clock.elapsedTime;
      const elapsed = state.clock.elapsedTime - startTime.current;
      const t = Math.min(1, elapsed / 0.5);
      mat.opacity = t;
      mat.transparent = true;
    }
    // 箭头 + 标签延后 0.3s 出现
    const showExtras =
      startTime.current !== null &&
      state.clock.elapsedTime - startTime.current > 0.3;
    if (arrowRef.current) arrowRef.current.visible = showExtras;
    if (labelRef.current) labelRef.current.visible = showExtras;
  });

  return (
    <group>
      <Line
        ref={lineRef}
        points={points}
        color={PATH_COLOR}
        lineWidth={3}
        dashed
        dashScale={2}
        dashSize={0.3}
        gapSize={0.15}
        transparent
      />
      {/* 距离/步数/时间标签 */}
      <Text
        ref={labelRef}
        position={[midX, 0.3, midZ]}
        fontSize={0.22}
        color={PATH_COLOR}
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {`≈ ${dist.toFixed(1)} 米 · ${steps} 步 · ${seconds.toFixed(0)} 秒`}
      </Text>
      {/* 终点箭头（小圆锥） */}
      <mesh
        ref={arrowRef}
        position={[to[0], 0.15, to[1]]}
        rotation={[-Math.PI / 2, 0, arrowAngle + Math.PI / 2]}
      >
        <coneGeometry args={[0.18, 0.36, 4]} />
        <meshStandardMaterial
          color={PATH_COLOR}
          emissive={PATH_COLOR}
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
};

// ============ 场景内容 ============
interface SceneProps {
  shelves: KioskShelf[];
  layoutConfig: StationLayoutConfig | null;
  highlights: Array<{ shelfNumber: number; layer?: number | null; count?: number }>;
  containerWidth: number;
  containerHeight: number;
}

const Scene: React.FC<SceneProps> = ({
  shelves,
  layoutConfig,
  highlights,
  containerWidth,
  containerHeight,
}) => {
  const { placed, bounds } = useMemo(() => computeShelfPositions(shelves), [shelves]);

  // 高亮映射：货架号 → { 层号, 包裹数 }
  const highlightMap = useMemo(() => {
    const m = new Map<number, { layer: number | null; count: number }>();
    for (const h of highlights) {
      m.set(h.shelfNumber, { layer: h.layer ?? null, count: h.count ?? 1 });
    }
    return m;
  }, [highlights]);

  // 门口：优先用 layoutConfig.doors，无配置时默认放在 fallback bounds 前墙中央
  const doors: LayoutDoor[] = useMemo(() => {
    if (layoutConfig?.doors && layoutConfig.doors.length > 0) {
      return layoutConfig.doors;
    }
    const doorX = (bounds.minX + bounds.maxX) / 2;
    const doorY = bounds.minZ;
    return [{ x: doorX, y: doorY, width: 1.2, label: '入口' }];
  }, [layoutConfig, bounds]);

  // 区域列表
  const areas: LayoutArea[] = useMemo(
    () => layoutConfig?.areas ?? [],
    [layoutConfig],
  );

  // 地面尺寸：优先用 layoutConfig.bounds，否则用货架 bounds
  const groundW = layoutConfig?.bounds?.width || bounds.maxX - bounds.minX + 4;
  const groundD = layoutConfig?.bounds?.depth || bounds.maxZ - bounds.minZ + 4;

  // 寻路起点：优先选第一个办公区；无办公区时 fallback 到最近门口
  const startPoint = useMemo<{ x: number; z: number } | null>(() => {
    if (highlights.length === 0) return null;
    const office = areas.find((a) => a.type === 'office');
    if (office) return { x: office.x, z: office.y };
    // 无办公区，用第一个门口
    if (doors.length > 0) return { x: doors[0].x, z: doors[0].y };
    return null;
  }, [highlights, areas, doors]);

  // 相机初始位置：对准原点（地面网格中心），与管理端统一
  // 距离按容器宽高比自适应，让网格铺满视口宽度
  const cameraInit = useMemo(() => {
    const halfFov = ((45 * Math.PI) / 180) / 2;
    const aspect = containerWidth > 0 && containerHeight > 0
      ? containerWidth / containerHeight
      : 1.5;
    const dHorizontal = groundW / (2 * Math.tan(halfFov) * aspect);
    const dVertical = groundD / (2 * Math.tan(halfFov));
    const dist = Math.max(dHorizontal, dVertical, 5) * 1.2;
    return {
      target: [0, 1, 0] as [number, number, number],
      position: [0, dist * 0.8, dist * 0.9] as [number, number, number],
    };
  }, [groundW, groundD, containerWidth, containerHeight]);

  // 相机飞行目标：高亮货架包围盒中心（单个直飞，多个框选）
  const focusTarget = useMemo<[number, number, number] | null>(() => {
    if (highlights.length === 0) return null;
    const targets = placed.filter((p) => highlightMap.has(p.shelf.number));
    if (targets.length === 0) return null;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const t of targets) {
      minX = Math.min(minX, t.x);
      maxX = Math.max(maxX, t.x);
      minZ = Math.min(minZ, t.z);
      maxZ = Math.max(maxZ, t.z);
    }
    return [(minX + maxX) / 2, 1, (minZ + maxZ) / 2];
  }, [highlights, placed, highlightMap]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[10, 15, 8]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={['#ffffff', '#cbd5e1', 0.4]} />

      {/* 网格地面（中心固定在原点，与管理端对齐） */}
      <GridFloor width={groundW} depth={groundD} />

      {/* 区域（办公区/揽收区，办公区作为寻路起点高亮「您在这里」） */}
      {areas.map((a) => (
        <AreaMesh
          key={a.id}
          area={a}
          isStartPoint={startPoint !== null && a.type === 'office' && a.x === startPoint.x && a.y === startPoint.z}
        />
      ))}

      {/* 门口 */}
      {doors.map((d, i) => (
        <DoorMesh key={`door-${i}`} door={d} />
      ))}

      {/* 货架 */}
      {placed.map((p) => {
        const info = highlightMap.get(p.shelf.number);
        const isHighlighted = !!info;
        return (
          <ShelfRack
            key={p.shelf.number}
            shelf={p.shelf}
            position={[p.x, 0, p.z]}
            rotationY={(p.shelf.rotation * Math.PI) / 180}
            highlight={isHighlighted}
            highlightLayer={info?.layer ?? null}
            highlightCount={info?.count ?? 0}
            dimmed={highlights.length > 0 && !isHighlighted}
          />
        );
      })}

      {/* 寻路路径：从办公区出发到每个高亮货架画 L 形路径 */}
      {startPoint &&
        highlights.map((h) => {
          const target = placed.find((p) => p.shelf.number === h.shelfNumber);
          if (!target) return null;
          return (
            <PathLine
              key={`path-${h.shelfNumber}`}
              from={[startPoint.x, startPoint.z]}
              to={[target.x, target.z]}
            />
          );
        })}

      <OrbitControls
        makeDefault
        target={cameraInit.target}
        enablePan={false}
        minDistance={3}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={Math.PI / 6}
      />
      <CameraRig
        position={cameraInit.position}
        target={cameraInit.target}
        focusTarget={focusTarget}
      />

      {/* 后处理：Bloom 让门口绿光 + 包裹橙色高亮真实发光 */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.4}
          intensity={0.6}
          mipmapBlur
          radius={0.6}
        />
      </EffectComposer>
    </>
  );
};

const CameraRig: React.FC<{
  position: [number, number, number];
  target: [number, number, number];
  focusTarget?: [number, number, number] | null;
}> = ({ position, target, focusTarget }) => {
  const { camera, controls } = useThree();
  const initialized = useRef(false);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  // 初始定位（仅一次）
  useFrame(() => {
    if (!initialized.current) {
      camera.position.set(position[0], position[1], position[2]);
      if (controls) {
        (controls as any).target.set(target[0], target[1], target[2]);
        (controls as any).update();
      } else {
        camera.lookAt(target[0], target[1], target[2]);
      }
      initialized.current = true;
    }
  });

  // 用户拖拽时取消飞行
  useEffect(() => {
    if (!controls) return;
    const c = controls as any;
    const onStart = () => {
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
    };
    c.addEventListener('start', onStart);
    return () => c.removeEventListener('start', onStart);
  }, [controls]);

  // 飞行到目标货架
  useEffect(() => {
    if (!focusTarget || !initialized.current || !controls) return;

    const [tx, , tz] = focusTarget;
    // 45° 俯视 + 距离 5m（抬高 3.5m，水平偏移 3.5m）
    const horiz = 3.5;
    const newPos = {
      x: tx + horiz,
      y: 3.5,
      z: tz + horiz,
    };

    if (tweenRef.current) tweenRef.current.kill();

    const obj = {
      px: camera.position.x,
      py: camera.position.y,
      pz: camera.position.z,
      tx: (controls as any).target.x,
      ty: (controls as any).target.y,
      tz: (controls as any).target.z,
    };
    tweenRef.current = gsap.to(obj, {
      px: newPos.x,
      py: newPos.y,
      pz: newPos.z,
      tx: tx,
      ty: 1,
      tz: tz,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.position.set(obj.px, obj.py, obj.pz);
        (controls as any).target.set(obj.tx, obj.ty, obj.tz);
        (controls as any).update();
      },
      onComplete: () => {
        tweenRef.current = null;
      },
    });
    return () => {
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
    };
  }, [focusTarget, camera, controls]);

  return null;
};

// ============ 对外组件 ============
export interface ShelfMap3DProps {
  shelves: KioskShelf[];
  layoutConfig?: StationLayoutConfig | null;
  highlights: Array<{ shelfNumber: number; layer?: number | null; count?: number }>;
  height?: number;
  className?: string;
}

const ShelfMap3D: React.FC<ShelfMap3DProps> = ({
  shelves,
  layoutConfig = null,
  highlights,
  height = 420,
  className,
}) => {
  // 监听容器尺寸变化，用于相机距离自适应（与管理端统一）
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (shelves.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-white text-sm text-gray-400 ${className || ''}`}
        style={{ height }}
      >
        暂无货架布局数据
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl bg-white ${className || ''}`}
      style={{ height }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 45, near: 0.1, far: 100 }}
        style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)' }}
      >
        <Suspense fallback={null}>
          <Scene
            shelves={shelves}
            layoutConfig={layoutConfig}
            highlights={highlights}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
          />
        </Suspense>
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-3 rounded bg-black/30 px-2 py-0.5 text-xs text-white">
        拖拽旋转 · 滚轮缩放
      </div>
    </div>
  );
};

export default ShelfMap3D;

// ============ 工具函数 ============

/** 从取件码解析货架号 */
export function parseShelfNumberFromCode(code: string | null | undefined): number | null {
  if (!code) return null;
  const seg = code.split('-')[0];
  const n = Number(seg);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 从取件码解析层号 */
export function parseLayerFromCode(code: string | null | undefined): number | null {
  if (!code) return null;
  const seg = code.split('-')[1];
  const n = Number(seg);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 根据货架号 + shelves 推断区字母 */
export function getZoneLetter(shelfNumber: number, shelves: KioskShelf[]): string | null {
  const s = shelves.find((x) => x.number === shelfNumber);
  if (!s) return null;
  return s.zone || SHELF_ZONE_MAP[s.sizeType];
}
