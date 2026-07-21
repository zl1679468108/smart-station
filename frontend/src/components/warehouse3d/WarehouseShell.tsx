import React, { useMemo } from 'react';
import { Text } from '@react-three/drei';
import {
  GROUND_COLOR,
  GRID_COLOR,
  SCREEN_EDGE,
  SCREEN_GROUND,
  SCREEN_GRID,
} from './constants';
import { ParcelBox } from './StationModels';
import type { WarehouseVisualTheme } from './types';

const GridFloor: React.FC<{
  width: number;
  depth: number;
  theme?: WarehouseVisualTheme;
}> = ({ width, depth, theme = 'ops' }) => {
  const isScreen = theme === 'screen';
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
        <meshStandardMaterial
          color={isScreen ? SCREEN_GROUND : GROUND_COLOR}
          roughness={isScreen ? 0.72 : 0.78}
          metalness={isScreen ? 0.22 : 0.06}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]} receiveShadow>
        <planeGeometry args={[width * 0.96, depth * 0.96]} />
        <meshStandardMaterial
          color={isScreen ? '#10243d' : '#F8FAFC'}
          transparent
          opacity={isScreen ? 0.55 : 0.45}
          roughness={0.9}
          metalness={isScreen ? 0.18 : 0}
        />
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
          <lineBasicMaterial
            color={isScreen ? SCREEN_GRID : GRID_COLOR}
            transparent
            opacity={isScreen ? 0.28 : 0.4}
          />
        </line>
      ))}
    </group>
  );
};

const WallStorage: React.FC<{
  x: number;
  z: number;
  rotation?: number;
  tone?: 'blue' | 'orange';
  theme?: WarehouseVisualTheme;
}> = ({ x, z, rotation = 0, tone = 'blue', theme = 'ops' }) => {
  const isScreen = theme === 'screen';
  const accent = tone === 'orange' ? '#FF6A00' : isScreen ? '#22D3EE' : '#0EA5E9';
  const boxA = tone === 'orange' ? '#D8A15F' : '#C58A54';
  const boxB = tone === 'orange' ? '#C08457' : '#D6A36A';

  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.55, 1.5, 0.16]} />
        <meshStandardMaterial
          color={isScreen ? '#1e293b' : '#F8FAFC'}
          roughness={0.62}
          metalness={isScreen ? 0.2 : 0.04}
        />
      </mesh>
      {[0.32, 0.72, 1.12].map((y, i) => (
        <mesh key={`wall-board-${i}`} position={[0, y, 0.09]} castShadow>
          <boxGeometry args={[1.42, 0.06, 0.18]} />
          <meshStandardMaterial
            color={accent}
            roughness={0.5}
            emissive={accent}
            emissiveIntensity={isScreen ? 0.22 : 0.08}
            transparent
            opacity={0.78}
          />
        </mesh>
      ))}
      {[-0.44, 0, 0.42].map((px, i) => (
        <ParcelBox
          key={`wall-parcel-${i}`}
          position={[px, 0.48 + (i % 2) * 0.4, 0.22]}
          rotation={[0, (i - 1) * 0.08, 0]}
          size={i === 1 ? [0.36, 0.24, 0.28] : [0.42, 0.28, 0.32]}
          color={i % 2 === 0 ? boxA : boxB}
          opacity={0.92}
        />
      ))}
      {/* 近景可读标签：放大后可辨认墙储包裹区 */}
      <Text
        position={[0, 1.62, 0.12]}
        fontSize={0.16}
        color={isScreen ? '#e2e8f0' : '#334155'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor={isScreen ? '#020617' : '#ffffff'}
      >
        墙储
      </Text>
    </group>
  );
};

const QueuePost: React.FC<{ x: number; z: number; theme?: WarehouseVisualTheme }> = ({
  x,
  z,
  theme = 'ops',
}) => {
  const isScreen = theme === 'screen';
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.34, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.68, 16]} />
        <meshStandardMaterial
          color={isScreen ? '#334155' : '#475569'}
          roughness={0.42}
          metalness={0.28}
        />
      </mesh>
      <mesh position={[0, 0.7, 0]} castShadow>
        <sphereGeometry args={[0.075, 16, 12]} />
        <meshStandardMaterial
          color="#FF6A00"
          emissive="#FF6A00"
          emissiveIntensity={isScreen ? 0.42 : 0.22}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
};

export interface WarehouseShellProps {
  width: number;
  depth: number;
  /** 顶部黄灯带，默认关闭避免遮挡俯视 */
  showCeilingLights?: boolean;
  visualTheme?: WarehouseVisualTheme;
}

/**
 * 公共驿站门店外壳：地面网格 + 半开放墙体 + 店面细节 + 可选顶部灯带。
 * 只读/编辑场景共用，消除双份外壳策略。
 */
const WarehouseShell: React.FC<WarehouseShellProps> = ({
  width,
  depth,
  showCeilingLights = false,
  visualTheme = 'ops',
}) => {
  const isScreen = visualTheme === 'screen';
  const halfW = width / 2;
  const halfD = depth / 2;
  const wallH = 2.8;
  const wallT = 0.14;
  const wallColor = isScreen ? '#15233a' : '#D8E0EA';
  const wallInner = isScreen ? '#1a2d4a' : '#E4EAF2';
  const edgeColor = isScreen ? SCREEN_EDGE : '#38BDF8';
  const edgeEmissive = isScreen ? '#22D3EE' : '#0EA5E9';
  const edgeIntensity = isScreen ? 0.28 : 0.18;

  const backStorage = useMemo(() => {
    const count = Math.max(3, Math.min(7, Math.floor(width / 2.4)));
    return Array.from({ length: count }, (_, i) => {
      const span = Math.min(width * 0.72, 10);
      const x = count === 1 ? 0 : -span / 2 + (i * span) / (count - 1);
      return { x, tone: i % 2 === 0 ? ('blue' as const) : ('orange' as const) };
    });
  }, [width]);

  const sideStorage = useMemo(() => {
    const count = Math.max(2, Math.min(4, Math.floor(depth / 3.2)));
    return Array.from({ length: count }, (_, i) => {
      const span = Math.min(depth * 0.52, 6);
      const z = count === 1 ? 0 : -span / 2 + (i * span) / (count - 1);
      return z;
    });
  }, [depth]);

  const screenDepthGuides = useMemo(() => {
    if (!isScreen) return [] as number[];
    const count = Math.max(4, Math.min(7, Math.floor(depth / 2.4)));
    return Array.from({ length: count }, (_, i) => {
      if (count === 1) return 0;
      return -halfD * 0.72 + (i * (halfD * 1.02)) / (count - 1);
    });
  }, [depth, halfD, isScreen]);

  const screenWallBars = useMemo(() => {
    if (!isScreen) return [] as number[];
    const count = Math.max(3, Math.min(6, Math.floor(width / 2.8)));
    return Array.from({ length: count }, (_, i) => {
      const span = width * 0.72;
      if (count === 1) return 0;
      return -span / 2 + (i * span) / (count - 1);
    });
  }, [width, isScreen]);

  const lightRows = useMemo(() => {
    if (!showCeilingLights) return [] as number[];
    const rows = Math.max(2, Math.min(5, Math.floor(depth / 4)));
    return Array.from({ length: rows }, (_, i) => {
      if (rows === 1) return 0;
      return -halfD * 0.55 + (i * (halfD * 1.1)) / (rows - 1);
    });
  }, [depth, halfD, showCeilingLights]);

  return (
    <group>
      <GridFloor width={width} depth={depth} theme={visualTheme} />

      {/* 后墙 */}
      <mesh position={[0, wallH / 2, -halfD - wallT / 2]} castShadow receiveShadow>
        <boxGeometry args={[width + wallT * 2, wallH, wallT]} />
        <meshStandardMaterial color={wallColor} roughness={0.68} metalness={isScreen ? 0.16 : 0.04} />
      </mesh>
      {/* 左右半墙（前侧开口） */}
      <mesh position={[-halfW - wallT / 2, wallH / 2, -depth * 0.12]} castShadow receiveShadow>
        <boxGeometry args={[wallT, wallH, depth * 0.76]} />
        <meshStandardMaterial color={wallInner} roughness={0.68} metalness={isScreen ? 0.14 : 0.04} />
      </mesh>
      <mesh position={[halfW + wallT / 2, wallH / 2, -depth * 0.12]} castShadow receiveShadow>
        <boxGeometry args={[wallT, wallH, depth * 0.76]} />
        <meshStandardMaterial color={wallInner} roughness={0.68} metalness={isScreen ? 0.14 : 0.04} />
      </mesh>

      {/* 墙顶压条 */}
      {[
        [0, wallH + 0.04, -halfD - wallT / 2, width + wallT * 2, 0.08, wallT + 0.04],
        [-halfW - wallT / 2, wallH + 0.04, -depth * 0.12, wallT + 0.04, 0.08, depth * 0.76],
        [halfW + wallT / 2, wallH + 0.04, -depth * 0.12, wallT + 0.04, 0.08, depth * 0.76],
      ].map((item, i) => (
        <mesh key={`cap-${i}`} position={[item[0], item[1], item[2]] as [number, number, number]}>
          <boxGeometry args={[item[3], item[4], item[5]] as [number, number, number]} />
          <meshStandardMaterial
            color={isScreen ? '#0ea5e9' : '#94A3B8'}
            emissive={isScreen ? '#0284c7' : '#000000'}
            emissiveIntensity={isScreen ? 0.25 : 0}
            roughness={0.5}
            metalness={0.2}
          />
        </mesh>
      ))}

      {/* 柱体 */}
      {[
        [-halfW, -halfD],
        [halfW, -halfD],
        [-halfW, halfD * 0.35],
        [halfW, halfD * 0.35],
      ].map(([x, z], i) => (
        <mesh key={`col-${i}`} position={[x, wallH / 2, z]} castShadow>
          <boxGeometry args={[0.18, wallH, 0.18]} />
          <meshStandardMaterial
            color={isScreen ? '#243b55' : '#A8B3C4'}
            roughness={0.55}
            metalness={isScreen ? 0.25 : 0.08}
          />
        </mesh>
      ))}

      {isScreen && (
        <>
          {/* 低位空间框架：让大屏镜头有明确的前景、中景、后景层次 */}
          {screenDepthGuides.map((z, i) => (
            <group key={`screen-depth-${i}`} position={[0, 0, z]}>
              <mesh position={[0, wallH + 0.24, 0]}>
                <boxGeometry args={[width * 0.84, 0.035, 0.045]} />
                <meshStandardMaterial
                  color="#38bdf8"
                  emissive="#0891b2"
                  emissiveIntensity={0.32}
                  transparent
                  opacity={0.5}
                  roughness={0.38}
                />
              </mesh>
              <mesh position={[-halfW + 0.34, 1.32, 0]}>
                <boxGeometry args={[0.035, 2.2, 0.035]} />
                <meshStandardMaterial color="#0ea5e9" emissive="#0284c7" emissiveIntensity={0.24} transparent opacity={0.58} />
              </mesh>
              <mesh position={[halfW - 0.34, 1.32, 0]}>
                <boxGeometry args={[0.035, 2.2, 0.035]} />
                <meshStandardMaterial color="#0ea5e9" emissive="#0284c7" emissiveIntensity={0.24} transparent opacity={0.58} />
              </mesh>
            </group>
          ))}

          {screenWallBars.map((x, i) => (
            <React.Fragment key={`screen-wall-bar-${i}`}>
              <mesh position={[x, 1.56, -halfD - wallT - 0.05]}>
                <boxGeometry args={[0.06, 1.55, 0.026]} />
                <meshStandardMaterial
                  color={i % 2 === 0 ? '#22d3ee' : '#fb923c'}
                  emissive={i % 2 === 0 ? '#0891b2' : '#f97316'}
                  emissiveIntensity={0.28}
                  transparent
                  opacity={0.58}
                />
              </mesh>
              <mesh position={[x, 0.86, -halfD - wallT - 0.052]}>
                <boxGeometry args={[Math.min(width * 0.08, 0.9), 0.035, 0.024]} />
                <meshStandardMaterial color="#94a3b8" emissive="#38bdf8" emissiveIntensity={0.16} transparent opacity={0.46} />
              </mesh>
            </React.Fragment>
          ))}

          {[-1, 1].map((side) => (
            <React.Fragment key={`screen-portal-${side}`}>
              <mesh position={[side * halfW * 0.86, 1.4, halfD * 0.64]}>
                <boxGeometry args={[0.055, 2.65, 0.055]} />
                <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.34} transparent opacity={0.7} />
              </mesh>
              <pointLight
                position={[side * halfW * 0.82, 1.1, halfD * 0.52]}
                color="#ff8a3d"
                intensity={0.22}
                distance={5}
              />
            </React.Fragment>
          ))}
          <mesh position={[0, 2.78, halfD * 0.64]}>
            <boxGeometry args={[width * 0.72, 0.055, 0.055]} />
            <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={0.34} transparent opacity={0.62} />
          </mesh>
          <mesh position={[0, 0.055, halfD * 0.66]}>
            <boxGeometry args={[width * 0.74, 0.018, 0.08]} />
            <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.28} transparent opacity={0.58} />
          </mesh>
        </>
      )}

      {/* 前侧引导线 / 队列 */}
      <mesh position={[0, 0.02, halfD * 0.42]} receiveShadow>
        <boxGeometry args={[Math.min(width * 0.42, 5.2), 0.02, 1.6]} />
        <meshStandardMaterial
          color={isScreen ? '#0f2744' : '#CBD5E1'}
          roughness={0.7}
          transparent
          opacity={0.75}
        />
      </mesh>
      <mesh position={[0, 0.03, halfD * 0.55]} receiveShadow>
        <boxGeometry args={[1.1, 0.015, 2.4]} />
        <meshStandardMaterial
          color={isScreen ? '#164e63' : '#334155'}
          roughness={0.9}
          transparent
          opacity={0.72}
        />
      </mesh>
      <mesh position={[0, 0.035, halfD * 0.22]} receiveShadow>
        <boxGeometry args={[0.55, 0.012, halfD * 0.55]} />
        <meshStandardMaterial
          color="#F8FAFC"
          roughness={0.88}
          transparent
          opacity={isScreen ? 0.35 : 0.72}
        />
      </mesh>
      <mesh position={[0, 0.036, halfD * 0.05]} receiveShadow>
        <boxGeometry args={[0.18, 0.01, halfD * 0.35]} />
        <meshStandardMaterial color="#FF6A00" roughness={0.82} transparent opacity={0.18} />
      </mesh>
      <mesh position={[-0.9, 0.04, halfD * 0.48]}>
        <boxGeometry args={[0.9, 0.02, 0.08]} />
        <meshStandardMaterial color="#FF6A00" emissive="#FF6A00" emissiveIntensity={0.28} transparent opacity={0.78} />
      </mesh>
      <mesh position={[0.9, 0.04, halfD * 0.48]}>
        <boxGeometry args={[0.9, 0.02, 0.08]} />
        <meshStandardMaterial color="#10B981" emissive="#10B981" emissiveIntensity={0.22} transparent opacity={0.68} />
      </mesh>

      {[-1.1, 1.1].map((x) => (
        <React.Fragment key={`queue-${x}`}>
          <QueuePost x={x} z={halfD * 0.62} theme={visualTheme} />
          <QueuePost x={x} z={halfD * 0.38} theme={visualTheme} />
          <mesh position={[x, 0.62, halfD * 0.5]} castShadow>
            <boxGeometry args={[0.04, 0.06, 1.1]} />
            <meshStandardMaterial
              color="#FF6A00"
              emissive="#FF6A00"
              emissiveIntensity={isScreen ? 0.3 : 0.16}
              roughness={0.48}
            />
          </mesh>
        </React.Fragment>
      ))}

      {/* 店招 */}
      <mesh position={[0, wallH * 0.74, -halfD - wallT - 0.02]} castShadow>
        <boxGeometry args={[Math.min(width * 0.42, 6.4), 0.44, 0.045]} />
        <meshStandardMaterial
          color="#0F172A"
          emissive={isScreen ? '#0ea5e9' : '#1E293B'}
          emissiveIntensity={isScreen ? 0.18 : 0.1}
          roughness={0.58}
        />
      </mesh>
      <mesh position={[0, wallH * 0.74, -halfD - wallT - 0.047]} castShadow>
        <boxGeometry args={[Math.min(width * 0.3, 4.8), 0.12, 0.025]} />
        <meshStandardMaterial
          color="#FF6A00"
          emissive="#FF6A00"
          emissiveIntensity={isScreen ? 0.55 : 0.35}
          roughness={0.45}
        />
      </mesh>
      <mesh position={[-Math.min(width * 0.35, 4.6), wallH * 0.52, -halfD - wallT - 0.048]} castShadow>
        <boxGeometry args={[1.3, 0.72, 0.035]} />
        <meshStandardMaterial color={isScreen ? '#e2e8f0' : '#FFFFFF'} roughness={0.58} />
      </mesh>
      <mesh position={[-Math.min(width * 0.35, 4.6), wallH * 0.61, -halfD - wallT - 0.072]}>
        <boxGeometry args={[0.92, 0.08, 0.02]} />
        <meshStandardMaterial color="#0EA5E9" emissive="#0EA5E9" emissiveIntensity={isScreen ? 0.35 : 0.18} />
      </mesh>
      <mesh position={[-Math.min(width * 0.35, 4.6), wallH * 0.45, -halfD - wallT - 0.072]}>
        <boxGeometry args={[0.72, 0.08, 0.02]} />
        <meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={isScreen ? 0.28 : 0.14} />
      </mesh>
      <mesh position={[Math.min(width * 0.35, 4.6), wallH * 0.52, -halfD - wallT - 0.048]} castShadow>
        <boxGeometry args={[1.3, 0.72, 0.035]} />
        <meshStandardMaterial color={isScreen ? '#1e293b' : '#FFF7ED'} roughness={0.58} />
      </mesh>
      <mesh position={[Math.min(width * 0.35, 4.6), wallH * 0.54, -halfD - wallT - 0.072]}>
        <boxGeometry args={[0.96, 0.12, 0.02]} />
        <meshStandardMaterial color="#FF6A00" emissive="#FF6A00" emissiveIntensity={isScreen ? 0.4 : 0.22} />
      </mesh>

      {backStorage.map((item, i) => (
        <WallStorage
          key={`back-storage-${i}`}
          x={item.x}
          z={-halfD + 0.16}
          tone={item.tone}
          theme={visualTheme}
        />
      ))}
      {sideStorage.map((z, i) => (
        <WallStorage
          key={`left-storage-${i}`}
          x={-halfW + 0.16}
          z={z}
          rotation={Math.PI / 2}
          tone={i % 2 === 0 ? 'orange' : 'blue'}
          theme={visualTheme}
        />
      ))}
      {sideStorage.map((z, i) => (
        <WallStorage
          key={`right-storage-${i}`}
          x={halfW - 0.16}
          z={z + 0.6}
          rotation={-Math.PI / 2}
          tone={i % 2 === 0 ? 'blue' : 'orange'}
          theme={visualTheme}
        />
      ))}

      {[-1, 1].map((side) => (
        <group
          key={`side-board-${side}`}
          position={[side * (halfW + wallT + 0.01), 1.45, -depth * 0.16]}
        >
          <mesh castShadow>
            <boxGeometry args={[0.035, 0.78, 1.8]} />
            <meshStandardMaterial color={isScreen ? '#cbd5e1' : '#FFFFFF'} roughness={0.65} />
          </mesh>
          <mesh position={[side * 0.002, 0.18, 0]}>
            <boxGeometry args={[0.038, 0.08, 1.36]} />
            <meshStandardMaterial color="#38BDF8" emissive="#0EA5E9" emissiveIntensity={isScreen ? 0.3 : 0.14} />
          </mesh>
          <mesh position={[side * 0.002, -0.12, 0]}>
            <boxGeometry args={[0.038, 0.08, 1.0]} />
            <meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={isScreen ? 0.26 : 0.12} />
          </mesh>
        </group>
      ))}

      {lightRows.map((z, i) => (
        <group key={`light-${i}`} position={[0, wallH + 0.35, z]}>
          <mesh>
            <boxGeometry args={[width * 0.62, 0.06, 0.12]} />
            <meshStandardMaterial
              color={isScreen ? '#7dd3fc' : '#FDE68A'}
              emissive={isScreen ? '#38bdf8' : '#FACC15'}
              emissiveIntensity={isScreen ? 0.35 : 0.55}
              transparent
              opacity={0.85}
            />
          </mesh>
          <pointLight color={isScreen ? '#7dd3fc' : '#FDE68A'} intensity={isScreen ? 0.45 : 0.35} distance={8} />
        </group>
      ))}

      {[
        { pos: [0, 0.04, -halfD] as [number, number, number], size: [width, 0.04, 0.04] as [number, number, number] },
        { pos: [0, 0.04, halfD] as [number, number, number], size: [width, 0.04, 0.04] as [number, number, number] },
        { pos: [-halfW, 0.04, 0] as [number, number, number], size: [0.04, 0.04, depth] as [number, number, number] },
        { pos: [halfW, 0.04, 0] as [number, number, number], size: [0.04, 0.04, depth] as [number, number, number] },
      ].map((edge, i) => (
        <mesh key={`edge-${i}`} position={edge.pos}>
          <boxGeometry args={edge.size} />
          <meshStandardMaterial
            color={edgeColor}
            emissive={edgeEmissive}
            emissiveIntensity={edgeIntensity}
          />
        </mesh>
      ))}
    </group>
  );
};

export default WarehouseShell;
export { GridFloor };
