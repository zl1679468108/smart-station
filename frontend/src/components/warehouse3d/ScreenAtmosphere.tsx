import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

interface ScreenAtmosphereProps {
  width: number;
  depth: number;
}

/**
 * 大屏氛围层：稀疏粒子。
 * 避免贴地扫描面或圆环；巡航低角度会把它们透视成遮挡画面的巨型形状。
 */
const ScreenAtmosphere: React.FC<ScreenAtmosphereProps> = ({ width, depth }) => {
  const particleRef = useRef<Group>(null);

  const particles = useMemo(() => {
    const list: Array<{ x: number; y: number; z: number; s: number; speed: number }> = [];
    for (let i = 0; i < 22; i += 1) {
      list.push({
        x: (Math.random() - 0.5) * width * 0.82,
        y: 0.5 + Math.random() * 2.4,
        z: (Math.random() - 0.5) * depth * 0.82,
        s: 0.018 + Math.random() * 0.028,
        speed: 0.25 + Math.random() * 0.45,
      });
    }
    return list;
  }, [width, depth]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (particleRef.current) {
      particleRef.current.children.forEach((child, i) => {
        const p = particles[i];
        if (!p) return;
        child.position.y = p.y + Math.sin(t * p.speed + i) * 0.14;
      });
    }
  });

  return (
    <group>
      <group ref={particleRef}>
        {particles.map((p, i) => (
          <mesh key={`pt-${i}`} position={[p.x, p.y, p.z]}>
            <sphereGeometry args={[p.s, 6, 6]} />
            <meshBasicMaterial
              color={i % 3 === 0 ? '#ff8a3d' : '#67e8f9'}
              transparent
              opacity={0.4}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};

export default ScreenAtmosphere;
