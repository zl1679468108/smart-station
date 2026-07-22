import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import type { Group } from 'three';
import type { WarehouseVisualTheme } from './types';

interface LightingRigProps {
  theme?: WarehouseVisualTheme;
  /** 仓库大致尺寸，用于阴影与氛围范围 */
  width?: number;
  depth?: number;
  height?: number;
}

/**
 * 统一光影：ops 偏干净运营质感，screen 偏科技数字孪生氛围。
 */
const LightingRig: React.FC<LightingRigProps> = ({
  theme = 'ops',
  width = 20,
  depth = 16,
  height = 3.2,
}) => {
  const isScreen = theme === 'screen';
  const ceilingH = Math.max(2, height);
  const rimRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!rimRef.current || !isScreen) return;
    const t = clock.getElapsedTime();
    rimRef.current.position.x = Math.sin(t * 0.35) * (width * 0.28);
    rimRef.current.position.z = Math.cos(t * 0.28) * (depth * 0.22);
  });

  return (
    <>
      <color attach="background" args={[isScreen ? '#06101f' : '#e8eef6']} />
      <fog attach="fog" args={[isScreen ? '#071322' : '#dbe4f0', isScreen ? 28 : 28, isScreen ? 72 : 70]} />

      <ambientLight intensity={isScreen ? 0.28 : 0.48} color={isScreen ? '#8ec5ff' : '#ffffff'} />
      <hemisphereLight
        args={[isScreen ? '#9ad0ff' : '#f8fafc', isScreen ? '#0b1a2e' : '#94a3b8', isScreen ? 0.45 : 0.55]}
      />

      <directionalLight
        position={[width * 0.45, Math.max(12, ceilingH + 9), depth * 0.35]}
        intensity={isScreen ? 1.05 : 1.15}
        color={isScreen ? '#dbeafe' : '#fff7ed'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={60}
        shadow-camera-left={-width}
        shadow-camera-right={width}
        shadow-camera-top={depth}
        shadow-camera-bottom={-depth}
        shadow-bias={-0.0002}
      />

      <directionalLight
        position={[-width * 0.5, 8, -depth * 0.3]}
        intensity={isScreen ? 0.45 : 0.35}
        color={isScreen ? '#38bdf8' : '#93c5fd'}
      />

      <pointLight
        position={[0, ceilingH + 0.8, 0]}
        intensity={isScreen ? 0.55 : 0.25}
        color={isScreen ? '#ff8a3d' : '#fde68a'}
        distance={Math.max(width, depth) * 1.4}
      />

      {isScreen && (
        <group ref={rimRef} position={[0, ceilingH + 0.35, 0]}>
          <pointLight color="#22d3ee" intensity={0.28} distance={12} />
        </group>
      )}

      {!isScreen && (
        <ContactShadows
          position={[0, 0.01, 0]}
          opacity={0.42}
          scale={Math.max(width, depth) * 1.35}
          blur={2.1}
          far={12}
          color="#64748b"
        />
      )}
    </>
  );
};

export default LightingRig;
