import React, { useMemo, useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import type {
  KioskShelf,
  ShelfSizeType,
  StationLayoutConfig,
  LayoutDoor,
  LayoutArea,
} from '@/types/kiosk';
import { SHELF_ZONE_MAP } from '@/types/kiosk';

/**
 * 货架 3D 编辑器（管理员配置仓库布局用）— 点击拖拽版 + 模型库拖拽建模
 * --------------------------------------------------
 * 交互：
 *  - 点击货架/门/区域选中（高亮）
 *  - 按住拖拽 → 沿地面（y=0）自由移动，实时跟随鼠标
 *  - 松手 → 自动吸附到 0.5m 网格 + 回调保存
 *  - 拖拽时禁用 OrbitControls，避免相机跟着转
 *  - 模型库（办公区/揽收区/门口）支持 HTML5 drag-and-drop 拖入 3D 场景
 *
 * 技术实现：手动 raycaster 投影到 y=0 平面，直接操作 group ref（不走 React state），
 * 避免 TransformControls 在 r3f 下的崩溃问题，同时保证拖拽 60fps 丝滑
 */

export type EditorShelf = KioskShelf & { id: string };

/**
 * 模型库预设尺寸（米）— 后期基本不动，管理员只拖拽摆放
 * 宽度/深度/高度对应 3D 场景的 X/Z/Y 轴
 */
export interface ModelLibraryItem {
  type: 'office' | 'pickup' | 'door';
  label: string;
  width: number;
  depth: number;
  height: number;
  color: string;
}

export const MODEL_LIBRARY: ModelLibraryItem[] = [
  { type: 'office', label: '办公区', width: 3, depth: 3, height: 2.5, color: '#3B82F6' },
  { type: 'pickup', label: '揽收区', width: 4, depth: 2, height: 2.5, color: '#8B5CF6' },
  { type: 'door', label: '门口', width: 1.2, depth: 0.3, height: 2, color: '#10B981' },
];

/** 根据 type 查找预设 */
export function findModelByType(type: string): ModelLibraryItem | undefined {
  return MODEL_LIBRARY.find((m) => m.type === type);
}

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

const SELECTED_COLOR = '#3B82F6';
const NORMAL_FRAME = '#94A3B8';
const NORMAL_BOARD = '#E2E8F0';
const GROUND_COLOR = '#F1F5F9';
const DOOR_COLOR = '#10B981';
const GRID_COLOR = '#CBD5E1';
const AREA_OFFICE_COLOR = '#3B82F6';
const AREA_PICKUP_COLOR = '#8B5CF6';
const AREA_LABEL_BG = 'rgba(15,23,42,0.75)';
const SNAP = 0.5;
const DRAG_PLANE_OFFSET_Y = 0; // 拖拽投影平面 Y 高度

// ============ 自动布局 fallback ============
interface PlacedShelf {
  shelf: EditorShelf;
  x: number;
  z: number;
  zone: string;
}

function computeShelfPositions(shelves: EditorShelf[]) {
  const hasRealCoords = shelves.some((s) => s.posX !== null && s.posY !== null);
  const order: ShelfSizeType[] = ['small', 'medium', 'large'];
  const fallbackGroup: Record<ShelfSizeType, EditorShelf[]> = {
    small: [],
    medium: [],
    large: [],
  };
  for (const s of shelves) {
    if (s.posX === null || s.posY === null) fallbackGroup[s.sizeType].push(s);
  }

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
      placed.push({ shelf: s, x, z, zone: s.zone || SHELF_ZONE_MAP[t] });
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
  return { placed, bounds: { minX, maxX, minZ, maxZ } };
}

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

      {/* 4 立柱 */}
      {postPositions.map((p, i) => (
        <mesh key={`post-${i}`} position={[p[0], totalH / 2, p[2]]} castShadow>
          <boxGeometry args={[POST, totalH, POST]} />
          <meshStandardMaterial color={frameColor} transparent opacity={opacity} />
        </mesh>
      ))}

      {/* 层板 */}
      {Array.from({ length: shelf.layers + 1 }).map((_, i) => (
        <mesh key={`board-${i}`} position={[0, i * LAYER_H, 0]} receiveShadow castShadow>
          <boxGeometry args={[SHELF_W, BOARD_T, SHELF_D]} />
          <meshStandardMaterial color={boardColor} transparent opacity={opacity} />
        </mesh>
      ))}

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

      {selected && (
        <Html position={[0, totalH + 0.75, 0]} center distanceFactor={10}>
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

  const baseColor = area.type === 'office' ? AREA_OFFICE_COLOR : AREA_PICKUP_COLOR;
  const frameColor = selected ? SELECTED_COLOR : baseColor;
  const opacity = dimmed ? 0.18 : 0.32;
  const frameOpacity = dimmed ? 0.35 : 1;

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
      {/* 选中光圈 */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[Math.max(area.width, area.depth) * 0.6, Math.max(area.width, area.depth) * 0.72, 32]} />
          <meshStandardMaterial
            color={SELECTED_COLOR}
            transparent
            opacity={0.5}
            emissive={SELECTED_COLOR}
            emissiveIntensity={0.4}
          />
        </mesh>
      )}

      {/* 区域底面（半透明色块） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={[area.width, area.depth]} />
        <meshStandardMaterial
          color={baseColor}
          transparent
          opacity={opacity}
          emissive={baseColor}
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* 区域边框（4 根立柱 + 顶框） */}
      {[
        [-area.width / 2, 0, -area.depth / 2],
        [area.width / 2, 0, -area.depth / 2],
        [-area.width / 2, 0, area.depth / 2],
        [area.width / 2, 0, area.depth / 2],
      ].map((p, i) => (
        <mesh key={`ap-${i}`} position={[p[0], area.height / 2, p[2]]}>
          <boxGeometry args={[0.06, area.height, 0.06]} />
          <meshStandardMaterial
            color={frameColor}
            transparent
            opacity={frameOpacity}
          />
        </mesh>
      ))}
      {/* 顶框 4 条边 */}
      {[
        { pos: [0, area.height, -area.depth / 2] as [number, number, number], size: [area.width, 0.05, 0.05] as [number, number, number] },
        { pos: [0, area.height, area.depth / 2] as [number, number, number], size: [area.width, 0.05, 0.05] as [number, number, number] },
        { pos: [-area.width / 2, area.height, 0] as [number, number, number], size: [0.05, 0.05, area.depth] as [number, number, number] },
        { pos: [area.width / 2, area.height, 0] as [number, number, number], size: [0.05, 0.05, area.depth] as [number, number, number] },
      ].map((b, i) => (
        <mesh key={`ab-${i}`} position={b.pos}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={frameColor} transparent opacity={frameOpacity} />
        </mesh>
      ))}

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
        <Html position={[0, area.height + 0.75, 0]} center distanceFactor={10}>
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

  const doors: LayoutDoor[] = useMemo(() => {
    if (layoutConfig?.doors && layoutConfig.doors.length > 0) return layoutConfig.doors;
    const doorX = (bounds.minX + bounds.maxX) / 2;
    return [{ x: doorX, y: bounds.minZ, width: 1.2, label: '入口' }];
  }, [layoutConfig, bounds]);

  const areas: LayoutArea[] = useMemo(
    () => layoutConfig?.areas ?? [],
    [layoutConfig],
  );

  // 地面尺寸：取仓库 bounds，没配置时用货架布局范围 + margin
  const groundW = layoutConfig?.bounds?.width || bounds.maxX - bounds.minX + 4;
  const groundD = layoutConfig?.bounds?.depth || bounds.maxZ - bounds.minZ + 4;

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
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 15, 8]} intensity={0.8} castShadow />
      <hemisphereLight args={['#ffffff', '#cbd5e1', 0.4]} />

      <GridFloor width={groundW} depth={groundD} />

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
        minDistance={3}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={Math.PI / 6}
      />
      <CameraRig
        position={cameraInit.position}
        target={cameraInit.target}
        resetKey={`${containerWidth}x${containerHeight}`}
      />
    </>
  );
};

const CameraRig: React.FC<{
  position: [number, number, number];
  target: [number, number, number];
  resetKey: string;
}> = ({ position, target, resetKey }) => {
  const { camera } = useThree();
  const lastResetKey = useRef('');
  useEffect(() => {
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(target[0], target[1], target[2]);
  }, [resetKey, position, target, camera]);
  return null;
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
  /** 模型库拖入 3D 场景时触发，modelType: 'office' | 'pickup' | 'door' */
  onDropFromLibrary?: (modelType: string, x: number, z: number) => void;
  height?: number;
  className?: string;
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
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 45, near: 0.1, far: 100 }}
        style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)' }}
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
      <div className="pointer-events-none absolute bottom-2 left-3 rounded bg-black/30 px-2 py-0.5 text-xs text-white">
        点击货架/门/区域选中 · 按住拖拽移动 · 从模型库拖入新模型 · 松手自动对齐 0.5m 网格
      </div>
    </div>
  );
};

export default ShelfMap3DEditor;
