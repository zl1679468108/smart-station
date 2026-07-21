import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

export interface CameraPatrolProps {
  /** 是否启用自动巡航 */
  enabled?: boolean;
  /** 环绕中心 */
  center?: [number, number, number];
  /** 环绕半径（水平） */
  radius?: number;
  /** Z 轴环绕半径，不传时与 radius 一致 */
  radiusZ?: number;
  /** 相机高度 */
  height?: number;
  /** 角速度（弧度/秒） */
  speed?: number;
  /** 用户交互后暂停秒数 */
  resumeDelaySec?: number;
  /** 仰视目标高度 */
  lookAtY?: number;
}

/**
 * 大屏自动巡航：绕仓缓慢环绕；用户拖拽后暂停，超时恢复。
 */
const CameraPatrol: React.FC<CameraPatrolProps> = ({
  enabled = false,
  center = [0, 0, 0],
  radius = 14,
  radiusZ,
  height = 9,
  speed = 0.08,
  resumeDelaySec = 6,
  lookAtY = 0.6,
}) => {
  const { camera, controls } = useThree();
  const angleRef = useRef(0);
  const pausedUntilRef = useRef(0);
  const userInteractingRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !controls) return;
    const c = controls as any;

    const pause = () => {
      userInteractingRef.current = true;
      pausedUntilRef.current = performance.now() + resumeDelaySec * 1000;
    };
    const onStart = () => pause();
    const onEnd = () => {
      userInteractingRef.current = false;
      pausedUntilRef.current = performance.now() + resumeDelaySec * 1000;
      // 从当前相机位置同步环绕角，避免恢复时跳变
      const dx = camera.position.x - center[0];
      const dz = camera.position.z - center[2];
      angleRef.current = Math.atan2(dx, dz);
    };

    c.addEventListener('start', onStart);
    c.addEventListener('end', onEnd);
    return () => {
      c.removeEventListener('start', onStart);
      c.removeEventListener('end', onEnd);
    };
  }, [enabled, controls, camera, center, resumeDelaySec]);

  useEffect(() => {
    if (!enabled) {
      initializedRef.current = false;
      return;
    }
    // 以当前相机方位为起点
    const dx = camera.position.x - center[0];
    const dz = camera.position.z - center[2];
    angleRef.current = Math.atan2(dx, dz);
    initializedRef.current = true;
  }, [enabled, camera, center]);

  useFrame((_, delta) => {
    if (!enabled || !initializedRef.current) return;
    const now = performance.now();
    if (userInteractingRef.current || now < pausedUntilRef.current) return;

    angleRef.current += speed * delta;
    const ellipseZ = radiusZ ?? radius;
    const x = center[0] + Math.sin(angleRef.current) * radius;
    const z = center[2] + Math.cos(angleRef.current) * ellipseZ;
    const y = height;

    // 平滑跟随，避免生硬
    camera.position.x += (x - camera.position.x) * Math.min(1, delta * 1.8);
    camera.position.y += (y - camera.position.y) * Math.min(1, delta * 1.8);
    camera.position.z += (z - camera.position.z) * Math.min(1, delta * 1.8);

    const tx = center[0];
    const ty = lookAtY;
    const tz = center[2];
    if (controls) {
      const c = controls as any;
      c.target.x += (tx - c.target.x) * Math.min(1, delta * 2.2);
      c.target.y += (ty - c.target.y) * Math.min(1, delta * 2.2);
      c.target.z += (tz - c.target.z) * Math.min(1, delta * 2.2);
      c.update();
    } else {
      camera.lookAt(tx, ty, tz);
    }
  });

  return null;
};

export default CameraPatrol;
