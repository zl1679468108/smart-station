import React, { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Text, Line } from '@react-three/drei';
import type {
  KioskShelf,
  ShelfSizeType,
  StationLayoutConfig,
  LayoutDoor,
} from '@/types/kiosk';
import { SHELF_ZONE_MAP } from '@/types/kiosk';

/**
 * 货架 3D 平面图（v1.2.0 真实位置版）
 * --------------------------------------
 * - 优先按货架 posX/posY 真实坐标摆放 + rotation 朝向
 * - 货架无坐标时自动 fallback 到 size_type 网格布局（向后兼容）
 * - 渲染仓库地面（bounds）+ 门口（发光框 + 「入口」标签）
 * - 高亮货架：橙色发光 + 「您在这里」悬浮 + 底面脉冲光圈 + 「距门口 N 米」
 * - 寻路路径：门口 → 每个高亮货架画 L 形虚线 + 箭头
 * - OrbitControls 旋转/缩放，限制角度不可翻到地下
 *
 * 入参：
 *  - shelves：货架列表
 *  - layoutConfig：仓库户型（bounds + doors）
 *  - highlights：高亮项（货架号 + 可选层号，来自取件码前两段）
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
const DOOR_COLOR = '#10B981';
const PATH_COLOR = '#FF6A00';

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
  dimmed?: boolean;
}

const ShelfRack: React.FC<ShelfMeshProps> = ({
  shelf,
  position,
  rotationY,
  highlight,
  highlightLayer,
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

      {/* 高亮悬浮标注 */}
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
            ▼ 您在这里
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

// ============ 寻路路径（L 形虚线 + 箭头） ============
const PathLine: React.FC<{
  from: [number, number];
  to: [number, number];
}> = ({ from, to }) => {
  // L 形路径：先沿 X 走到目标 X，再沿 Z 走到目标 Z
  const points: [number, number, number][] = [
    [from[0], 0.05, from[1]],
    [to[0], 0.05, from[1]],
    [to[0], 0.05, to[1]],
  ];

  // 距离标签（路径中点）
  const dist = Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2);
  const midX = (from[0] + to[0]) / 2;
  const midZ = (from[1] + to[1]) / 2;

  // 箭头（在终点处，朝向终点方向）
  const arrowAngle = Math.atan2(to[1] - from[1], to[0] - from[0]);

  return (
    <group>
      <Line points={points} color={PATH_COLOR} lineWidth={3} dashed dashScale={2} dashSize={0.3} gapSize={0.15} />
      {/* 距离标签 */}
      <Text
        position={[midX, 0.3, midZ]}
        fontSize={0.25}
        color={PATH_COLOR}
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {`≈ ${dist.toFixed(1)} 米`}
      </Text>
      {/* 终点箭头（小圆锥） */}
      <mesh
        position={[to[0], 0.15, to[1]]}
        rotation={[-Math.PI / 2, 0, arrowAngle + Math.PI / 2]}
      >
        <coneGeometry args={[0.18, 0.36, 4]} />
        <meshStandardMaterial color={PATH_COLOR} emissive={PATH_COLOR} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
};

// ============ 场景内容 ============
interface SceneProps {
  shelves: KioskShelf[];
  layoutConfig: StationLayoutConfig | null;
  highlights: Array<{ shelfNumber: number; layer?: number | null }>;
}

const Scene: React.FC<SceneProps> = ({ shelves, layoutConfig, highlights }) => {
  const { placed, bounds } = useMemo(() => computeShelfPositions(shelves), [shelves]);

  // 高亮映射：货架号 → 层号
  const highlightMap = useMemo(() => {
    const m = new Map<number, number | null>();
    for (const h of highlights) m.set(h.shelfNumber, h.layer ?? null);
    return m;
  }, [highlights]);

  // 门口：优先用 layoutConfig.doors，无配置时默认放在 fallback bounds 前墙中央
  const doors: LayoutDoor[] = useMemo(() => {
    if (layoutConfig?.doors && layoutConfig.doors.length > 0) {
      return layoutConfig.doors;
    }
    // 默认门口：bounds 前墙中央（y = 0 或 minZ）
    const doorX = (bounds.minX + bounds.maxX) / 2;
    const doorY = bounds.minZ;
    return [{ x: doorX, y: doorY, width: 1.2, label: '入口' }];
  }, [layoutConfig, bounds]);

  // 地面尺寸：优先用 layoutConfig.bounds，否则用货架 bounds
  // 注意：地面中心固定在原点 (0, 0)，与编辑器 ShelfMapEditor 保持一致
  // 这样货架/门口的 posX/posY 真实坐标在两端渲染时位置完全对齐
  const groundW = layoutConfig?.bounds?.width || bounds.maxX - bounds.minX + 4;
  const groundD = layoutConfig?.bounds?.depth || bounds.maxZ - bounds.minZ + 4;

  // 相机初始位置：覆盖全部货架 + 门口
  const cameraInit = useMemo(() => {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const w = bounds.maxX - bounds.minX;
    const d = bounds.maxZ - bounds.minZ;
    const size = Math.max(w, d, groundW, groundD, 4);
    const dist = size * 1.1;
    return {
      target: [cx, 1, cz] as [number, number, number],
      position: [cx + dist * 0.7, size * 0.9 + 2, cz + dist * 0.9] as [
        number,
        number,
        number,
      ],
    };
  }, [bounds, groundW, groundD]);

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

      {/* 地面（中心固定在原点，与编辑器对齐） */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
      >
        <planeGeometry args={[groundW, groundD]} />
        <meshStandardMaterial color={GROUND_COLOR} />
      </mesh>

      {/* 门口 */}
      {doors.map((d, i) => (
        <DoorMesh key={`door-${i}`} door={d} />
      ))}

      {/* 货架 */}
      {placed.map((p) => {
        const isHighlighted = highlightMap.has(p.shelf.number);
        const layer = highlightMap.get(p.shelf.number) ?? null;
        return (
          <ShelfRack
            key={p.shelf.number}
            shelf={p.shelf}
            position={[p.x, 0, p.z]}
            rotationY={(p.shelf.rotation * Math.PI) / 180}
            highlight={isHighlighted}
            highlightLayer={layer}
            dimmed={highlights.length > 0 && !isHighlighted}
          />
        );
      })}

      {/* 寻路路径：每个高亮货架画一条从最近门口出发的 L 形路径 */}
      {highlights.map((h) => {
        const target = placed.find((p) => p.shelf.number === h.shelfNumber);
        if (!target) return null;
        // 找最近的门口
        let nearestDoor = doors[0];
        let minDist = Infinity;
        for (const d of doors) {
          const dist = (d.x - target.x) ** 2 + (d.y - target.z) ** 2;
          if (dist < minDist) {
            minDist = dist;
            nearestDoor = d;
          }
        }
        return (
          <PathLine
            key={`path-${h.shelfNumber}`}
            from={[nearestDoor.x, nearestDoor.y]}
            to={[target.x, target.z]}
          />
        );
      })}

      <OrbitControls
        target={cameraInit.target}
        enablePan={false}
        minDistance={3}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={Math.PI / 6}
      />
      <CameraRig position={cameraInit.position} target={cameraInit.target} />
    </>
  );
};

const CameraRig: React.FC<{
  position: [number, number, number];
  target: [number, number, number];
}> = ({ position, target }) => {
  const initialized = useRef(false);
  useFrame((state) => {
    if (!initialized.current) {
      state.camera.position.set(position[0], position[1], position[2]);
      state.camera.lookAt(target[0], target[1], target[2]);
      initialized.current = true;
    }
  });
  return null;
};

// ============ 对外组件 ============
export interface ShelfMap3DProps {
  shelves: KioskShelf[];
  layoutConfig?: StationLayoutConfig | null;
  highlights: Array<{ shelfNumber: number; layer?: number | null }>;
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
