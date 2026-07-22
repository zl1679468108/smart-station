import React, { useMemo, useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useThree, ThreeEvent } from '@react-three/fiber';
import LightingRig from './LightingRig';
import { OrbitControls, Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import type {
  StationLayoutConfig,
  LayoutDoor,
  LayoutArea,
} from '@/types/kiosk';
import WarehouseShell from './WarehouseShell';
import CameraRig from './CameraRig';
import { computeShelfPositions, computeCameraInit } from './layout';
import { normalizeStationLayout } from './layoutConfig';
import {
  ParcelBox,
  StationAreaModel,
  getStationAreaPalette,
} from './StationModels';
import { GltfModel, shelfAssetKey } from './assets';
import {
  SHELF_W,
  SHELF_D,
  LAYER_H,
  POST,
  BOARD_T,
  SELECTED_COLOR,
  NORMAL_FRAME,
  NORMAL_BOARD,
  DOOR_COLOR,
  SNAP,
} from './constants';
import {
  getOccupancyRatio,
  getOccupancyColor,
  getRemainingCapacity,
} from './occupancy';
import type { WarehouseEditableShelf, WarehouseShelf } from './types';

/**
 * 仓库 3D 编辑场景（内部实现，业务入口请用 Warehouse3D variant="editor"）
 * --------------------------------------------------
 * 交互：
 *  - 点击货架/门/区域选中（高亮）
 *  - 按住拖拽 → 沿地面（y=0）自由移动，实时跟随鼠标
 *  - 松手 → 自动吸附到 0.5m 网格 + 回调保存
 *  - 拖拽时禁用 OrbitControls，避免相机跟着转
 *  - 模型库（服务台/出库记录区/异常件区等）支持 HTML5 drag-and-drop 拖入 3D 场景
 *
 * 技术实现：手动 raycaster 投影到 y=0 平面，直接操作 group ref（不走 React state），
 * 避免 TransformControls 在 r3f 下的崩溃问题，同时保证拖拽 60fps 丝滑
 */

export type EditorShelf = WarehouseEditableShelf;

// 模型库注册表统一维护在 modelLibrary.ts
export type { ModelLibraryItem } from './modelLibrary';
export { MODEL_LIBRARY, findModelByType } from './modelLibrary';

const DRAG_PLANE_OFFSET_Y = 0; // 拖拽投影平面 Y 高度

// ============ 拖拽工具：把鼠标 NDC 投影到 y=0 平面 ============
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_PLANE_OFFSET_Y);

function getGroundPoint(
  clientX: number,
  clientY: number,
  dom: HTMLElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
): { x: number; z: number } | null {
  const rect = dom.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  const point = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(dragPlane, point);
  if (!hit) return null;
  return { x: point.x, z: point.z };
}

// ============ 可拖拽货架 ============
interface DraggableShelfProps {
  shelf: EditorShelf;
  initialPos: [number, number, number];
  rotationY: number;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, z: number) => void;
  orbitRef: React.MutableRefObject<any>;
}

const DraggableShelf: React.FC<DraggableShelfProps> = ({
  shelf,
  initialPos,
  rotationY,
  selected,
  dimmed,
  onSelect,
  onDragEnd,
  orbitRef,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const dragging = useRef(false);
  const { camera, gl, raycaster } = useThree();

  const totalH = shelf.layers * LAYER_H + BOARD_T;
  const frameColor = selected ? SELECTED_COLOR : NORMAL_FRAME;
  const boardColor = selected ? '#BFDBFE' : NORMAL_BOARD;
  const opacity = dimmed ? 0.35 : 1;
  const occupancyRatio = getOccupancyRatio(shelf);
  const occupancyColor = getOccupancyColor(occupancyRatio);
  const remainingCapacity = getRemainingCapacity(shelf);
  const shelfPackages = useMemo(() => {
    const count = Math.min(14, Math.max(0, shelf.inStockCount ?? 0));
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

  // 把 onDragEnd 存到 ref，避免 useEffect 重新注册 listener
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    const dom = gl.domElement;
    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !groupRef.current) return;
      const p = getGroundPoint(e.clientX, e.clientY, dom, camera, raycaster);
      if (!p) return;
      // 直接操作 ref，不走 state，保证丝滑
      groupRef.current.position.x = p.x;
      groupRef.current.position.z = p.z;
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = 'default';
      if (orbitRef.current) orbitRef.current.enabled = true;
      if (groupRef.current) {
        // 网格吸附
        const snappedX = Math.round(groupRef.current.position.x / SNAP) * SNAP;
        const snappedZ = Math.round(groupRef.current.position.z / SNAP) * SNAP;
        groupRef.current.position.x = snappedX;
        groupRef.current.position.z = snappedZ;
        onDragEndRef.current(snappedX, snappedZ);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl, raycaster, orbitRef]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect();
    dragging.current = true;
    document.body.style.cursor = 'move';
    if (orbitRef.current) orbitRef.current.enabled = false;
  };

  return (
    <group
      ref={groupRef}
      position={initialPos}
      rotation={[0, rotationY, 0]}
      onPointerDown={handlePointerDown}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        if (!dragging.current) document.body.style.cursor = 'default';
      }}
    >
      {/* 选中光圈 */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[SHELF_W * 0.55, SHELF_W * 0.7, 32]} />
          <meshStandardMaterial
            color={SELECTED_COLOR}
            transparent
            opacity={0.5}
            emissive={SELECTED_COLOR}
            emissiveIntensity={0.4}
          />
        </mesh>
      )}

      {/* GLB 货架模型（与只读场景共用资产）；加载失败时退回程序化立柱/层板 */}
      <GltfModel
        assetKey={shelfAssetKey(shelf.sizeType)}
        size={[SHELF_W, totalH, SHELF_D]}
        opacity={opacity}
        emissive={selected ? SELECTED_COLOR : undefined}
        emissiveIntensity={selected ? 0.25 : 0}
        fallback={
          <group>
            {postPositions.map((p, i) => (
              <mesh key={`post-${i}`} position={[p[0], totalH / 2, p[2]]} castShadow>
                <boxGeometry args={[POST, totalH, POST]} />
                <meshStandardMaterial color={frameColor} transparent opacity={opacity} />
              </mesh>
            ))}
            {Array.from({ length: shelf.layers + 1 }).map((_, i) => (
              <mesh key={`board-${i}`} position={[0, i * LAYER_H, 0]} receiveShadow castShadow>
                <boxGeometry args={[SHELF_W, BOARD_T, SHELF_D]} />
                <meshStandardMaterial color={boardColor} transparent opacity={opacity} />
              </mesh>
            ))}
          </group>
        }
      />

      {!dimmed &&
        shelfPackages.map((pkg, i) => (
          <ParcelBox
            key={`editor-shelf-pkg-${i}`}
            position={[pkg.x, pkg.y, pkg.z]}
            rotation={[0, pkg.rot, 0]}
            size={[0.28, 0.22, 0.22]}
            color={pkg.color}
          />
        ))}

      {/* 占用率侧边条 */}
      <mesh position={[SHELF_W / 2 + 0.04, totalH * 0.5, 0]}>
        <boxGeometry args={[0.08, totalH, 0.18]} />
        <meshStandardMaterial color="#E2E8F0" transparent opacity={0.5 * opacity} />
      </mesh>
      <mesh
        position={[SHELF_W / 2 + 0.04, totalH * occupancyRatio * 0.5, 0]}
      >
        <boxGeometry args={[0.08, Math.max(0.08, totalH * occupancyRatio), 0.18]} />
        <meshStandardMaterial
          color={occupancyColor}
          emissive={occupancyColor}
          emissiveIntensity={0.35}
          transparent
          opacity={0.9 * opacity}
        />
      </mesh>

      {/* 层内数字货位灯带 */}
      {Array.from({ length: shelf.layers }).map((_, i) => {
        const y = i * LAYER_H + BOARD_T + 0.16;
        const segmentOpacity = Math.max(0.15, occupancyRatio * 0.8);
        return (
          <mesh key={`slot-${i}`} position={[0, y, SHELF_D / 2 + 0.02]}>
            <boxGeometry args={[SHELF_W * 0.7, 0.04, 0.06]} />
            <meshStandardMaterial
              color={occupancyColor}
              emissive={occupancyColor}
              emissiveIntensity={0.25}
              transparent
              opacity={segmentOpacity * opacity}
            />
          </mesh>
        );
      })}

      {/* 货架号 */}
      <Text
        position={[0, totalH + 0.35, 0]}
        fontSize={0.32}
        color={selected ? SELECTED_COLOR : '#334155'}
        anchorX="center"
        anchorY="middle"
      >
        {`#${shelf.number}`}
      </Text>

      {/* 占用信息 */}
      <Html position={[0, totalH + 0.62, 0]} center distanceFactor={5.5}>
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

      {selected && (
        <Html position={[0, totalH + 1.02, 0]} center distanceFactor={5.5}>
          <div
            style={{
              background: SELECTED_COLOR,
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(59,130,246,0.4)',
            }}
          >
            ✋ 按住拖拽
          </div>
        </Html>
      )}
    </group>
  );
};

// ============ 可拖拽门口 ============
interface DraggableDoorProps {
  door: LayoutDoor;
  index: number;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  orbitRef: React.MutableRefObject<any>;
}

const DraggableDoor: React.FC<DraggableDoorProps> = ({
  door,
  selected,
  dimmed,
  onSelect,
  onDragEnd,
  orbitRef,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const dragging = useRef(false);
  const { camera, gl, raycaster } = useThree();
  const opacity = dimmed ? 0.35 : 1;

  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    const dom = gl.domElement;
    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !groupRef.current) return;
      const p = getGroundPoint(e.clientX, e.clientY, dom, camera, raycaster);
      if (!p) return;
      groupRef.current.position.x = p.x;
      groupRef.current.position.z = p.z;
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = 'default';
      if (orbitRef.current) orbitRef.current.enabled = true;
      if (groupRef.current) {
        const snappedX = Math.round(groupRef.current.position.x / SNAP) * SNAP;
        const snappedZ = Math.round(groupRef.current.position.z / SNAP) * SNAP;
        groupRef.current.position.x = snappedX;
        groupRef.current.position.z = snappedZ;
        onDragEndRef.current(snappedX, snappedZ);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl, raycaster, orbitRef]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect();
    dragging.current = true;
    document.body.style.cursor = 'move';
    if (orbitRef.current) orbitRef.current.enabled = false;
  };

  return (
    <group
      ref={groupRef}
      position={[door.x, 0, door.y]}
      onPointerDown={handlePointerDown}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        if (!dragging.current) document.body.style.cursor = 'default';
      }}
    >
      {/* 选中光圈 */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.8, 1.0, 32]} />
          <meshStandardMaterial
            color={SELECTED_COLOR}
            transparent
            opacity={0.5}
            emissive={SELECTED_COLOR}
            emissiveIntensity={0.4}
          />
        </mesh>
      )}
      {/* 门口发光条 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[door.width, 0.3]} />
        <meshStandardMaterial
          color={DOOR_COLOR}
          emissive={DOOR_COLOR}
          emissiveIntensity={0.7}
          transparent
          opacity={0.8 * opacity}
        />
      </mesh>
      {/* 门柱 */}
      {[-door.width / 2, door.width / 2].map((x, i) => (
        <mesh key={`dp-${i}`} position={[x, 1, 0]}>
          <boxGeometry args={[0.1, 2, 0.1]} />
          <meshStandardMaterial
            color={selected ? SELECTED_COLOR : DOOR_COLOR}
            emissive={selected ? SELECTED_COLOR : DOOR_COLOR}
            emissiveIntensity={0.3}
            transparent
            opacity={opacity}
          />
        </mesh>
      ))}
      <Text
        position={[0, 2.4, 0]}
        fontSize={0.28}
        color={selected ? SELECTED_COLOR : DOOR_COLOR}
        anchorX="center"
        anchorY="middle"
      >
        {door.label}
      </Text>
    </group>
  );
};

// ============ 可拖拽区域（办公区/揽收区） ============
interface DraggableAreaProps {
  area: LayoutArea;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, z: number) => void;
  orbitRef: React.MutableRefObject<any>;
}

const DraggableArea: React.FC<DraggableAreaProps> = ({
  area,
  selected,
  dimmed,
  onSelect,
  onDragEnd,
  orbitRef,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const dragging = useRef(false);
  const { camera, gl, raycaster } = useThree();

  const palette = getStationAreaPalette(area.type);
  const frameColor = selected ? SELECTED_COLOR : palette.color;

  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    const dom = gl.domElement;
    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !groupRef.current) return;
      const p = getGroundPoint(e.clientX, e.clientY, dom, camera, raycaster);
      if (!p) return;
      groupRef.current.position.x = p.x;
      groupRef.current.position.z = p.z;
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = 'default';
      if (orbitRef.current) orbitRef.current.enabled = true;
      if (groupRef.current) {
        const snappedX = Math.round(groupRef.current.position.x / SNAP) * SNAP;
        const snappedZ = Math.round(groupRef.current.position.z / SNAP) * SNAP;
        groupRef.current.position.x = snappedX;
        groupRef.current.position.z = snappedZ;
        onDragEndRef.current(snappedX, snappedZ);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, gl, raycaster, orbitRef]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect();
    dragging.current = true;
    document.body.style.cursor = 'move';
    if (orbitRef.current) orbitRef.current.enabled = false;
  };

  return (
    <group
      ref={groupRef}
      position={[area.x, 0, area.y]}
      onPointerDown={handlePointerDown}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        if (!dragging.current) document.body.style.cursor = 'default';
      }}
    >
      <StationAreaModel area={area} selected={selected} dimmed={dimmed} />

      {/* 区域标签 */}
      <Text
        position={[0, area.height + 0.35, 0]}
        fontSize={0.32}
        color={selected ? SELECTED_COLOR : frameColor}
        anchorX="center"
        anchorY="middle"
      >
        {area.label}
      </Text>

      {selected && (
        <Html position={[0, area.height + 0.75, 0]} center distanceFactor={5.5}>
          <div
            style={{
              background: SELECTED_COLOR,
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(59,130,246,0.4)',
            }}
          >
            ✋ 按住拖拽
          </div>
        </Html>
      )}
    </group>
  );
};

// ============ 模型库拖入落点检测（HTML5 drag-and-drop + raycaster） ============
const DropZone: React.FC<{
  onDropAt: (modelType: string, x: number, z: number) => void;
}> = ({ onDropAt }) => {
  const { camera, gl, raycaster } = useThree();
  const onDropAtRef = useRef(onDropAt);
  onDropAtRef.current = onDropAt;

  useEffect(() => {
    const dom = gl.domElement;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault(); // 允许 drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const modelType = e.dataTransfer?.getData('text/model-type');
      if (!modelType) return;
      const p = getGroundPoint(e.clientX, e.clientY, dom, camera, raycaster);
      if (!p) return;
      onDropAtRef.current(modelType, p.x, p.z);
    };
    dom.addEventListener('dragover', onDragOver);
    dom.addEventListener('drop', onDrop);
    return () => {
      dom.removeEventListener('dragover', onDragOver);
      dom.removeEventListener('drop', onDrop);
    };
  }, [camera, gl, raycaster]);

  return null;
};

// ============ 网格地面 ============
// ============ 场景 ============
interface SelectedTarget {
  type: 'shelf' | 'door' | 'area';
  id: string;
}

const EditorScene: React.FC<{
  shelves: EditorShelf[];
  layoutConfig: StationLayoutConfig | null;
  selected: SelectedTarget | null;
  onSelect: (t: SelectedTarget | null) => void;
  onShelfDragEnd: (shelfId: string, x: number, z: number) => void;
  onDoorDragEnd: (doorIndex: number, x: number, y: number) => void;
  onAreaDragEnd: (areaId: string, x: number, z: number) => void;
  onDropFromLibrary: (modelType: string, x: number, z: number) => void;
  orbitRef: React.MutableRefObject<any>;
  containerWidth: number;
  containerHeight: number;
}> = ({
  shelves,
  layoutConfig,
  selected,
  onSelect,
  onShelfDragEnd,
  onDoorDragEnd,
  onAreaDragEnd,
  onDropFromLibrary,
  orbitRef,
  containerWidth,
  containerHeight,
}) => {
  const { placed, bounds } = useMemo(() => computeShelfPositions(shelves), [shelves]);
  const normalizedLayout = useMemo(
    () => normalizeStationLayout(layoutConfig, bounds),
    [layoutConfig, bounds],
  );

  const doors: LayoutDoor[] = useMemo(() => {
    return normalizedLayout.doors;
  }, [normalizedLayout.doors]);

  const areas: LayoutArea[] = useMemo(
    () => normalizedLayout.areas,
    [normalizedLayout.areas],
  );

  // 地面尺寸：统一走归一化配置，接口未返回/字段不全时使用稳定默认门店尺寸
  const groundW = normalizedLayout.bounds.width;
  const groundD = normalizedLayout.bounds.depth;
  const groundH = normalizedLayout.bounds.height ?? 3.2;

  // 相机距离自适应：根据容器宽高比 + 地面尺寸计算，让地面网格铺满视口宽度
  // 注意：地面网格以原点 (0,0) 为中心绘制，相机 target 也对准原点，
  // 这样网格在视口中水平居中，放大时不会一侧空出空间
  const cameraInit = useMemo(() => {
    const halfFov = ((45 * Math.PI) / 180) / 2; // FOV=45°，halfFov=22.5°
    const aspect = containerWidth > 0 && containerHeight > 0
      ? containerWidth / containerHeight
      : 1.5;
    // 水平方向刚好装下 groundW 需要的距离
    const dHorizontal = groundW / (2 * Math.tan(halfFov) * aspect);
    // 垂直方向刚好装下 groundD 需要的距离
    const dVertical = groundD / (2 * Math.tan(halfFov));
    // 取较大值确保都装下，加 1.2 倍 margin
    const dist = Math.max(dHorizontal, dVertical, 5) * 1.2;
    return {
      // target 对准地面网格中心（原点），保证网格在视口水平居中
      target: [0, 1, 0] as [number, number, number],
      // 俯视角度：抬高 dist*0.8，水平偏移 dist*0.9
      position: [0, dist * 0.8, dist * 0.9] as [number, number, number],
    };
  }, [groundW, groundD, containerWidth, containerHeight]);

  return (
    <>
      <LightingRig theme="ops" width={groundW} depth={groundD} height={groundH} />

      <WarehouseShell width={groundW} depth={groundD} height={groundH} visualTheme="ops" />

      {/* 区域（办公区/揽收区，可拖拽） */}
      {areas.map((a) => {
        const isSelected = selected?.type === 'area' && selected.id === a.id;
        return (
          <DraggableArea
            key={a.id}
            area={a}
            selected={isSelected}
            dimmed={selected !== null && !isSelected}
            onSelect={() =>
              onSelect(isSelected ? null : { type: 'area', id: a.id })
            }
            onDragEnd={(x, z) => onAreaDragEnd(a.id, x, z)}
            orbitRef={orbitRef}
          />
        );
      })}

      {/* 门口（可拖拽） */}
      {doors.map((d, i) => {
        const isSelected = selected?.type === 'door' && selected.id === `door-${i}`;
        return (
          <DraggableDoor
            key={`door-${i}`}
            door={d}
            index={i}
            selected={isSelected}
            dimmed={selected !== null && !isSelected}
            onSelect={() =>
              onSelect(isSelected ? null : { type: 'door', id: `door-${i}` })
            }
            onDragEnd={(x, y) => onDoorDragEnd(i, x, y)}
            orbitRef={orbitRef}
          />
        );
      })}

      {/* 货架（可拖拽） */}
      {placed.map((p) => {
        const isSelected = selected?.type === 'shelf' && selected.id === p.shelf.id;
        return (
          <DraggableShelf
            key={p.shelf.id}
            shelf={p.shelf}
            initialPos={[p.x, 0, p.z]}
            rotationY={(p.shelf.rotation * Math.PI) / 180}
            selected={isSelected}
            dimmed={selected !== null && !isSelected}
            onSelect={() =>
              onSelect(isSelected ? null : { type: 'shelf', id: p.shelf.id })
            }
            onDragEnd={(x, z) => onShelfDragEnd(p.shelf.id, x, z)}
            orbitRef={orbitRef}
          />
        );
      })}

      {/* 模型库拖入落点检测 */}
      <DropZone onDropAt={onDropFromLibrary} />

      <OrbitControls
        ref={orbitRef}
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
        overviewKey="editor"
      />
    </>
  );
};

// ============ 对外组件 ============
export interface ShelfMap3DEditorProps {
  shelves: EditorShelf[];
  layoutConfig?: StationLayoutConfig | null;
  selectedId?: string | null;
  selectedType?: 'shelf' | 'door' | 'area';
  onSelect?: (id: string | null, type: 'shelf' | 'door' | 'area' | null) => void;
  onShelfDragEnd?: (shelfId: string, x: number, z: number) => void;
  onDoorDragEnd?: (doorIndex: number, x: number, y: number) => void;
  onAreaDragEnd?: (areaId: string, x: number, z: number) => void;
  /** 模型库拖入 3D 场景时触发，modelType: 'office' | 'pickup' | 'outboundRecord' | 'door' */
  onDropFromLibrary?: (modelType: string, x: number, z: number) => void;
  height?: number | string;
  className?: string;
  layoutLoading?: boolean;
}

const ShelfMap3DEditor: React.FC<ShelfMap3DEditorProps> = ({
  shelves,
  layoutConfig = null,
  selectedId = null,
  selectedType = 'shelf',
  onSelect,
  onShelfDragEnd,
  onDoorDragEnd,
  onAreaDragEnd,
  onDropFromLibrary,
  height = 480,
  className,
  layoutLoading = false,
}) => {
  const orbitRef = useRef<any>(null);
  const [internalSelected, setInternalSelected] = useState<SelectedTarget | null>(null);
  const selected: SelectedTarget | null =
    selectedId !== null
      ? { type: selectedType, id: selectedId }
      : internalSelected;

  // 监听容器尺寸变化，用于相机距离自适应（让地面网格铺满父容器宽度）
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

  const handleSelect = (t: SelectedTarget | null) => {
    if (onSelect) {
      onSelect(t?.id ?? null, t?.type ?? null);
    } else {
      setInternalSelected(t);
    }
  };

  const waitingForLayout = layoutLoading;

  if (shelves.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-white text-sm text-gray-400 ${className || ''}`}
        style={{ height }}
      >
        暂无货架，请先在「货架管理」Tab 新建货架
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl bg-white ${className || ''}`}
      style={{ height }}
    >
      {!waitingForLayout ? (
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ fov: 45, near: 0.1, far: 100 }}
          gl={{ preserveDrawingBuffer: true }}
          style={{ background: 'linear-gradient(180deg, #eef4fb 0%, #d9e4f2 100%)' }}
          onPointerMissed={() => handleSelect(null)}
        >
          <Suspense fallback={null}>
            <EditorScene
              shelves={shelves}
              layoutConfig={layoutConfig}
              selected={selected}
              onSelect={handleSelect}
              onShelfDragEnd={onShelfDragEnd || (() => {})}
              onDoorDragEnd={onDoorDragEnd || (() => {})}
              onAreaDragEnd={onAreaDragEnd || (() => {})}
              onDropFromLibrary={onDropFromLibrary || (() => {})}
              orbitRef={orbitRef}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
            />
          </Suspense>
        </Canvas>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-500 shadow-sm">
            正在加载门店布局...
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-3 rounded bg-black/30 px-2 py-0.5 text-xs text-white">
        点击货架/门/区域选中 · 按住拖拽移动 · 从模型库拖入新模型 · 松手自动对齐 0.5m 网格
      </div>
    </div>
  );
};

export default ShelfMap3DEditor;
