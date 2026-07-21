import React, { useMemo, useRef, useState, Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Text, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type {
  StationLayoutConfig,
  LayoutDoor,
  LayoutArea,
} from '@/types/kiosk';
import WarehouseShell from './WarehouseShell';
import CameraRig from './CameraRig';
import LightingRig from './LightingRig';
import CameraPatrol from './CameraPatrol';
import { GltfModel, shelfAssetKey } from './assets';
import { computeShelfPositions, computeCameraInit } from './layout';
import { normalizeStationLayout } from './layoutConfig';
import {
  ParcelBox,
  StationAreaModel,
  getStationAreaPalette,
} from './StationModels';
import {
  SHELF_W,
  SHELF_D,
  LAYER_H,
  POST,
  BOARD_T,
  HIGHLIGHT_COLOR,
  NORMAL_FRAME,
  NORMAL_BOARD,
  DOOR_COLOR,
  PATH_COLOR,
  SIZE_ACCENT,
  SCREEN_FRAME,
  SCREEN_BOARD,
  SCREEN_TEXT,
} from './constants';
import {
  getOccupancyRatio,
  getOccupancyColor,
  getShelfCapacity,
  getRemainingCapacity,
} from './occupancy';
import type { WarehouseShelf, WarehouseVisualTheme } from './types';

/**
 * 仓库 3D 只读场景（内部实现，业务入口请用 Warehouse3D）
 * ----------------------------------------------------------------
 * - 优先按货架 posX/posY 真实坐标摆放 + rotation 朝向
 * - 货架无坐标时自动 fallback 到 size_type 网格布局（向后兼容）
 * - 渲染门店地面网格（bounds）+ 门口 + 服务台/出库记录区/功能区 + 货架
 * - 高亮货架：橙色发光 + 「该货架包裹（N）个」悬浮 + 底面脉冲光圈
 * - 服务台/办公区：显示「您在这里」悬浮标注（作为寻路起点）
 * - 寻路路径：服务台/办公区 → 每个高亮货架画 L 形虚线 + 箭头
 * - OrbitControls 旋转/缩放，限制角度不可翻到地下
 * - 地面网格以原点为中心，相机对准原点，与管理端完全对齐
 *
 * 入参：
 *  - shelves：货架列表
 *  - layoutConfig：驿站门店布局（bounds + doors + areas）
 *  - highlights：高亮项（货架号 + 可选层号 + 包裹数量，来自取件码前两段）
 */

// ============ 单个货架 ============
interface ShelfMeshProps {
  shelf: WarehouseShelf;
  position: [number, number, number];
  rotationY: number;
  highlight: boolean;
  highlightLayer?: number | null;
  highlightCount?: number;
  dimmed?: boolean;
  showOccupancy?: boolean;
  showOccupancyLabel?: boolean;
  visualTheme?: WarehouseVisualTheme;
}

const ShelfRack: React.FC<ShelfMeshProps> = ({
  shelf,
  position,
  rotationY,
  highlight,
  highlightLayer,
  highlightCount = 0,
  dimmed,
  showOccupancy = false,
  showOccupancyLabel = true,
  visualTheme = 'ops',
}) => {
  const isScreen = visualTheme === 'screen';
  const totalH = shelf.layers * LAYER_H + BOARD_T;
  const occupancyRatio = getOccupancyRatio(shelf);
  const occupancyColor = getOccupancyColor(occupancyRatio);
  const remainingCapacity = getRemainingCapacity(shelf);
  const frameColor = highlight ? HIGHLIGHT_COLOR : isScreen ? SCREEN_FRAME : NORMAL_FRAME;
  const boardColor = highlight ? '#FFD7B5' : isScreen ? SCREEN_BOARD : NORMAL_BOARD;
  const opacity = dimmed ? (isScreen ? 0.28 : 0.35) : 1;
  const labelColor = highlight ? HIGHLIGHT_COLOR : isScreen ? SCREEN_TEXT : '#334155';
  const accentColor = highlight
    ? HIGHLIGHT_COLOR
    : showOccupancy
      ? occupancyColor
      : SIZE_ACCENT[shelf.sizeType];
  const packageStackCount = highlight && highlightCount > 0 ? Math.min(3, Math.max(1, highlightCount)) : 0;
  const shelfPackages = useMemo(() => {
    const count = Math.min(14, Math.max(4, Math.round((shelf.inStockCount ?? shelf.layers * 3) * 0.18)));
    return Array.from({ length: count }, (_, i) => {
      const layer = i % Math.max(1, shelf.layers);
      const col = Math.floor(i / Math.max(1, shelf.layers)) % 4;
      return {
        x: -SHELF_W * 0.34 + col * (SHELF_W * 0.22),
        y: layer * LAYER_H + 0.18,
        z: -SHELF_D * 0.18 + ((i + shelf.number) % 3) * 0.17,
        rot: ((i + shelf.number) % 5 - 2) * 0.04,
        color: (i + shelf.number) % 2 === 0 ? '#C58A54' : '#D8A15F',
      };
    });
  }, [shelf.inStockCount, shelf.layers, shelf.number]);

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

      <GltfModel
        assetKey={shelfAssetKey(shelf.sizeType)}
        size={[SHELF_W, totalH, SHELF_D]}
        opacity={opacity}
        emissive={highlight ? HIGHLIGHT_COLOR : undefined}
        emissiveIntensity={highlight ? (isScreen ? 0.35 : 0.2) : 0}
        fallback={
          <group>
      {/* 4 根立柱 */}
      {postPositions.map((p, i) => (
        <mesh key={`post-${i}`} position={[p[0], totalH / 2, p[2]]} castShadow>
          <boxGeometry args={[POST, totalH, POST]} />
          <meshStandardMaterial
            color={frameColor}
            transparent
            opacity={opacity}
            metalness={isScreen ? 0.45 : 0.18}
            roughness={isScreen ? 0.38 : 0.55}
            emissive={highlight ? HIGHLIGHT_COLOR : '#000000'}
            emissiveIntensity={highlight ? (isScreen ? 0.35 : 0.15) : 0}
          />
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
              emissive={isHighlightLayer ? HIGHLIGHT_COLOR : isScreen ? '#0ea5e9' : '#000000'}
              emissiveIntensity={isHighlightLayer ? (isScreen ? 0.55 : 0.4) : isScreen ? 0.04 : 0}
              transparent
              opacity={opacity}
              roughness={0.62}
              metalness={isScreen ? 0.18 : 0.05}
            />
          </mesh>
        );
      })}

      {/* 背板与侧边识别条，增强体积感 */}
      <mesh position={[0, totalH * 0.5, -SHELF_D / 2 + 0.03]} castShadow>
        <boxGeometry args={[SHELF_W - 0.12, totalH - 0.08, 0.06]} />
        <meshStandardMaterial
          color={highlight ? '#FFE4C7' : '#C7D2FE'}
          transparent
          opacity={0.28 * opacity}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[-SHELF_W / 2 + 0.03, totalH * 0.5, 0]} castShadow>
        <boxGeometry args={[0.06, totalH - 0.04, SHELF_D - 0.12]} />
        <meshStandardMaterial color={accentColor} transparent opacity={0.18 * opacity} />
      </mesh>
      <mesh position={[SHELF_W / 2 - 0.03, totalH * 0.5, 0]} castShadow>
        <boxGeometry args={[0.06, totalH - 0.04, SHELF_D - 0.12]} />
        <meshStandardMaterial color={accentColor} transparent opacity={0.18 * opacity} />
      </mesh>

          </group>
        }
      />

      {/* 高亮层上的包裹小盒 */}
      {!dimmed &&
        shelfPackages.map((pkg, i) => (
          <ParcelBox
            key={`shelf-pkg-${i}`}
            position={[pkg.x, pkg.y, pkg.z]}
            rotation={[0, pkg.rot, 0]}
            size={[0.28, 0.22, 0.22]}
            color={pkg.color}
          />
        ))}

      {highlight && highlightLayer !== null && highlightLayer !== undefined && (
        <group position={[0, highlightLayer * LAYER_H + BOARD_T / 2 + 0.16, 0]}>
          {Array.from({ length: packageStackCount }).map((_, i) => (
            <mesh
              key={`pkg-${i}`}
              position={[(i - (packageStackCount - 1) / 2) * 0.26, i * 0.02, 0]}
              castShadow
            >
              <boxGeometry args={[0.22, 0.28, 0.24]} />
              <meshStandardMaterial
                color={HIGHLIGHT_COLOR}
                emissive={HIGHLIGHT_COLOR}
                emissiveIntensity={0.65}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* 货架号 */}
      <Text
        position={[0, totalH + 0.38, 0]}
        fontSize={0.4}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={isScreen ? 0.014 : 0.008}
        outlineColor="#020617"
      >
        {`#${shelf.number}`}
      </Text>

      {/* 库存占用可视化（工作台） */}
      {showOccupancy && (
        <>
          <mesh position={[SHELF_W / 2 - 0.04, totalH * 0.5, 0]}>
            <boxGeometry args={[0.08, totalH * 0.85, 0.12]} />
            <meshStandardMaterial color="#E2E8F0" transparent opacity={0.55 * opacity} />
          </mesh>
          <mesh
            position={[
              SHELF_W / 2 - 0.04,
              (totalH * 0.85 * occupancyRatio) / 2 + totalH * 0.075,
              0,
            ]}
          >
            <boxGeometry args={[0.08, Math.max(0.05, totalH * 0.85 * occupancyRatio), 0.12]} />
            <meshStandardMaterial
              color={occupancyColor}
              emissive={occupancyColor}
              emissiveIntensity={0.3}
              transparent
              opacity={0.9 * opacity}
            />
          </mesh>
          {showOccupancyLabel && (
            <Html position={[0, totalH + 0.72, 0]} center distanceFactor={5.5}>
              <div
                style={{
                  background: occupancyColor,
                  color: '#fff',
                  padding: '3px 9px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  boxShadow: `0 2px 8px ${occupancyColor}66`,
                }}
              >
                在库 {shelf.inStockCount ?? 0} · 余 {remainingCapacity}
              </div>
            </Html>
          )}
        </>
      )}

      {/* 高亮悬浮标注：显示该货架包裹数量 */}
      {highlight && (
        <Html position={[0, totalH + 0.82, 0]} center distanceFactor={5.5}>
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
const DoorMesh: React.FC<{
  door: LayoutDoor;
  distanceLabel?: string;
  showLabel?: boolean;
}> = ({
  door,
  distanceLabel,
  showLabel = true,
}) => {
  const procedural = (
    <>
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
      {[-door.width / 2, door.width / 2].map((x, i) => (
        <mesh key={`doorpost-${i}`} position={[x, 1, 0]}>
          <boxGeometry args={[0.1, 2, 0.1]} />
          <meshStandardMaterial color={DOOR_COLOR} emissive={DOOR_COLOR} emissiveIntensity={0.3} />
        </mesh>
      ))}
    </>
  );

  return (
    <group position={[door.x, 0, door.y]}>
      <GltfModel
        assetKey="door.main"
        size={[Math.max(1.2, door.width), 2.2, 0.4]}
        fallback={procedural}
      />
      {showLabel && (
        <Html position={[0, 2.4, 0]} center distanceFactor={5.5}>
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
            {door.label}
          </div>
        </Html>
      )}
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

// ============ 区域（只读，服务台/办公区显示「您在这里」作为寻路起点） ============
const AreaMesh: React.FC<{
  area: LayoutArea;
  isStartPoint: boolean;
  showLabel?: boolean;
}> = ({
  area,
  isStartPoint,
  showLabel = true,
}) => {
  const palette = getStationAreaPalette(area.type);
  const totalH = area.height;

  return (
    <group position={[area.x, 0, area.y]}>
      <StationAreaModel area={area} selected={isStartPoint} />

      {/* 区域标签 */}
      {showLabel && (
        <Text
          position={[0, totalH + 0.35, 0]}
          fontSize={0.32}
          color={palette.color}
          anchorX="center"
          anchorY="middle"
        >
          {area.label}
        </Text>
      )}

      {/* 服务台/办公区作为寻路起点：显示「您在这里」悬浮标注 */}
      {showLabel && isStartPoint && (
        <Html position={[0, totalH + 0.75, 0]} center distanceFactor={5.5}>
          <div
            style={{
              background: palette.color,
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: `0 2px 8px ${palette.color}66`,
            }}
          >
            您在这里
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
  shelves: WarehouseShelf[];
  layoutConfig: StationLayoutConfig | null;
  highlights: Array<{ shelfNumber: number; layer?: number | null; count?: number }>;
  containerWidth: number;
  containerHeight: number;
  showOccupancy?: boolean;
  showCeilingLights?: boolean;
  enableCameraFly?: boolean;
  enableBloom?: boolean;
  enablePath?: boolean;
  visualTheme?: WarehouseVisualTheme;
  /** 大屏自动环绕巡航 */
  enableCameraPatrol?: boolean;
  showGuidanceLabels?: boolean;
}

const Scene: React.FC<SceneProps> = ({
  shelves,
  layoutConfig,
  highlights,
  containerWidth,
  containerHeight,
  showOccupancy = false,
  showCeilingLights = false,
  enableCameraFly,
  enableBloom = true,
  enablePath,
  visualTheme = 'ops',
  enableCameraPatrol,
  showGuidanceLabels,
}) => {
  const isScreen = visualTheme === 'screen';
  const shouldShowGuidanceLabels = showGuidanceLabels ?? !isScreen;

  const { placed, bounds } = useMemo(() => computeShelfPositions(shelves), [shelves]);
  const normalizedLayout = useMemo(
    () => normalizeStationLayout(layoutConfig, bounds),
    [layoutConfig, bounds],
  );

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
    return normalizedLayout.doors;
  }, [normalizedLayout.doors]);

  // 区域列表
  const areas: LayoutArea[] = useMemo(
    () => normalizedLayout.areas,
    [normalizedLayout.areas],
  );

  // 地面尺寸：统一走归一化配置，接口未返回/字段不全时使用稳定默认门店尺寸
  const groundW = normalizedLayout.bounds.width;
  const groundD = normalizedLayout.bounds.depth;
  const shouldShowPath = enablePath ?? highlights.length > 0;
  const shouldFlyToTarget = enableCameraFly ?? highlights.length > 0;
  const shouldPatrol =
    (enableCameraPatrol ?? isScreen) && !shouldFlyToTarget && highlights.length === 0;
  const patrolRadius = isScreen
    ? Math.max(9, groundW * 0.62)
    : Math.max(10, Math.max(groundW, groundD) * 0.7);
  const patrolHeight = isScreen
    ? Math.max(4.4, Math.max(groundW, groundD) * 0.26)
    : Math.max(7.5, Math.max(groundW, groundD) * 0.4);

  // 寻路起点：优先选服务台，其次办公区；无配置时 fallback 到最近门口
  const startPoint = useMemo<{ x: number; z: number } | null>(() => {
    if (!shouldShowPath || highlights.length === 0) return null;
    const servicePoint = areas.find((a) => a.type === 'counter') ?? areas.find((a) => a.type === 'office');
    if (servicePoint) return { x: servicePoint.x, z: servicePoint.y };
    // 无服务台/办公区，用第一个门口
    if (doors.length > 0) return { x: doors[0].x, z: doors[0].y };
    return null;
  }, [shouldShowPath, highlights, areas, doors]);

  // 相机初始位置：对准原点（公共策略）
  const cameraInit = useMemo(
    () => computeCameraInit(groundW, groundD, containerWidth, containerHeight, isScreen ? 'screen' : 'ops'),
    [groundW, groundD, containerWidth, containerHeight, isScreen],
  );
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
      <LightingRig theme={visualTheme} width={groundW} depth={groundD} />

      {/* 门店外壳（地面 + 墙体 + 灯带） */}
      <WarehouseShell
        width={groundW}
        depth={groundD}
        showCeilingLights={showCeilingLights}
        visualTheme={visualTheme}
      />

      {/* 区域/门口始终渲染（与工作台共用同一套 GLB 模型）；仅标签受 showGuidanceLabels 控制 */}
      {areas.map((a) => (
        <AreaMesh
          key={a.id}
          area={a}
          showLabel={shouldShowGuidanceLabels}
          isStartPoint={
            startPoint !== null &&
            (a.type === 'counter' || a.type === 'office') &&
            a.x === startPoint.x &&
            a.y === startPoint.z
          }
        />
      ))}

      {doors.map((d, i) => (
        <DoorMesh key={`door-${i}`} door={d} showLabel={shouldShowGuidanceLabels} />
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
            showOccupancy={showOccupancy && !isHighlighted}
            showOccupancyLabel={shouldShowGuidanceLabels}
            visualTheme={visualTheme}
          />
        );
      })}

      {/* 寻路路径：从服务台/办公区出发到每个高亮货架画 L 形路径 */}
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
        minDistance={0.6}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={Math.PI / 6}
      />
      <CameraRig
        position={cameraInit.position}
        target={cameraInit.target}
        focusTarget={focusTarget}
        enableFly={shouldFlyToTarget}
        overviewKey="view-init"
      />
      <CameraPatrol
        enabled={shouldPatrol}
        center={[0, 0, 0]}
        radius={patrolRadius}
        radiusZ={isScreen ? Math.max(9, groundD * 0.62) : undefined}
        height={patrolHeight}
        speed={isScreen ? 0.052 : 0.05}
        resumeDelaySec={6}
        lookAtY={isScreen ? 1.35 : 0.8}
      />

      {/* 后处理：Bloom 让门口绿光 + 包裹橙色高亮真实发光 */}
      {enableBloom && (
        <EffectComposer>
          <Bloom
            luminanceThreshold={isScreen ? 0.45 : 0.28}
            luminanceSmoothing={0.55}
            intensity={isScreen ? 0.45 : 0.5}
            mipmapBlur
            radius={isScreen ? 0.4 : 0.5}
          />
        </EffectComposer>
      )}
    </>
  );
};

// ============ 对外组件 ============
export interface ShelfMap3DProps {
  shelves: WarehouseShelf[];
  layoutConfig?: StationLayoutConfig | null;
  highlights?: Array<{ shelfNumber: number; layer?: number | null; count?: number }>;
  height?: number | string;
  className?: string;
  showOccupancy?: boolean;
  showCeilingLights?: boolean;
  enableCameraFly?: boolean;
  enableBloom?: boolean;
  enablePath?: boolean;
  layoutLoading?: boolean;
  visualTheme?: WarehouseVisualTheme;
  enableCameraPatrol?: boolean;
  showGuidanceLabels?: boolean;
}

const ShelfMap3D: React.FC<ShelfMap3DProps> = ({
  shelves,
  layoutConfig = null,
  highlights = [],
  height = 420,
  className,
  showOccupancy = false,
  showCeilingLights = false,
  enableCameraFly,
  enableBloom = true,
  enablePath,
  layoutLoading = false,
  visualTheme = 'ops',
  enableCameraPatrol,
  showGuidanceLabels,
}) => {
  const isScreen = visualTheme === 'screen';

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

  const waitingForLayout = layoutLoading;
  const screenStats = useMemo(() => {
    const totalInStock = shelves.reduce((sum, shelf) => sum + (shelf.inStockCount ?? 0), 0);
    const totalCapacity = shelves.reduce((sum, shelf) => sum + getShelfCapacity(shelf), 0);
    const occupancy = totalCapacity > 0 ? totalInStock / totalCapacity : 0;
    return {
      shelfCount: shelves.length,
      totalInStock,
      occupancy,
      highlightCount: highlights.length,
    };
  }, [highlights.length, shelves]);

  if (shelves.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl text-sm ${
          isScreen
            ? 'border border-cyan-500/20 bg-[#07111f] text-slate-400'
            : 'bg-white text-gray-400'
        } ${className || ''}`}
        style={{ height }}
      >
        暂无货架布局数据
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden ${
        isScreen ? 'rounded-none bg-[#06101f]' : 'rounded-xl bg-white'
      } ${className || ''}`}
      style={{ height }}
    >
      {!waitingForLayout ? (
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ fov: isScreen ? 42 : 45, near: 0.1, far: 120 }}
          style={{
            background: isScreen
              ? 'radial-gradient(ellipse at center, #0b1f38 0%, #040b16 70%)'
              : 'linear-gradient(180deg, #eef4fb 0%, #d9e4f2 100%)',
          }}
        >
          <Suspense fallback={null}>
            <Scene
              shelves={shelves}
              layoutConfig={layoutConfig}
              highlights={highlights}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              showOccupancy={showOccupancy}
              showCeilingLights={showCeilingLights}
              enableCameraFly={enableCameraFly}
              enableBloom={enableBloom}
              enablePath={enablePath}
              visualTheme={visualTheme}
              enableCameraPatrol={enableCameraPatrol}
              showGuidanceLabels={showGuidanceLabels}
            />
          </Suspense>
        </Canvas>
      ) : (
        <div
          className={`absolute inset-0 flex items-center justify-center ${
            isScreen ? 'bg-[#07111f]' : 'bg-slate-50'
          }`}
        >
          <div
            className={`rounded-lg px-4 py-2 text-sm shadow-sm ${
              isScreen
                ? 'border border-cyan-400/30 bg-slate-900/80 text-cyan-100'
                : 'border border-gray-200 bg-white text-gray-500'
            }`}
          >
            正在加载门店布局...
          </div>
        </div>
      )}
      {!isScreen && (
        <div className="pointer-events-none absolute bottom-2 left-3 rounded bg-black/30 px-2 py-0.5 text-xs text-white">
          {showOccupancy ? '库存占用可视化 · 拖拽旋转 · 滚轮缩放' : '拖拽旋转 · 滚轮缩放'}
        </div>
      )}
      {isScreen && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-none border border-cyan-400/25 bg-slate-950/55 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-cyan-100 backdrop-blur-sm">
          <span>货架 {screenStats.shelfCount}</span>
          <span className="text-cyan-400">·</span>
          <span>在库 {screenStats.totalInStock}</span>
          <span className="text-cyan-400">·</span>
          <span>占用 {(screenStats.occupancy * 100).toFixed(1)}%</span>
          <span className="text-cyan-400">·</span>
          <span>高亮 {screenStats.highlightCount}</span>
        </div>
      )}
    </div>
  );
};

export default ShelfMap3D;
