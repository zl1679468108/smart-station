import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { HIGHLIGHT_COLOR } from './constants';

export interface WalkthroughControlsProps {
  enabled?: boolean;
  width: number;
  depth: number;
  /** 人眼高度，单位米 */
  eyeHeight?: number;
  /** 镜头移动速度，单位 m/s */
  walkSpeed?: number;
  onWalkComplete?: (target: THREE.Vector3) => void;
}

const CLICK_TOLERANCE = 8;
const EDGE_PADDING = 0.45;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 看房式点击漫游：短点击地面后，相机以人眼高度平滑移动到目标点。
 * P0 版本使用地面投影直线移动，不做障碍物寻路。
 */
const WalkthroughControls: React.FC<WalkthroughControlsProps> = ({
  enabled = false,
  width,
  depth,
  eyeHeight = 1.55,
  walkSpeed = 4.2,
  onWalkComplete,
}) => {
  const { camera, controls, gl } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerDownRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const activeTweenRef = useRef<gsap.core.Tween | null>(null);
  const markerRef = useRef<THREE.Mesh>(null);
  const markerStartRef = useRef(0);
  const [marker, setMarker] = useState<THREE.Vector3 | null>(null);

  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const halfW = width / 2;
  const halfD = depth / 2;

  const stopWalk = (restoreControls = true) => {
    if (activeTweenRef.current) {
      activeTweenRef.current.kill();
      activeTweenRef.current = null;
    }
    if (restoreControls && controls) {
      (controls as any).enabled = true;
      if (typeof (controls as any).dispatchEvent === 'function') {
        (controls as any).dispatchEvent({ type: 'end' });
      }
    }
  };

  useEffect(() => {
    const canvas = gl.domElement;
    const previousCursor = canvas.style.cursor;
    if (enabled) {
      canvas.style.cursor = 'crosshair';
    }

    const getGroundPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const hit = new THREE.Vector3();
      raycasterRef.current.setFromCamera(mouse, camera);
      if (!raycasterRef.current.ray.intersectPlane(groundPlane, hit)) return null;

      const outsideX = Math.abs(hit.x) > halfW + EDGE_PADDING;
      const outsideZ = Math.abs(hit.z) > halfD + EDGE_PADDING;
      if (outsideX || outsideZ) return null;

      hit.x = clamp(hit.x, -halfW + EDGE_PADDING, halfW - EDGE_PADDING);
      hit.y = eyeHeight;
      hit.z = clamp(hit.z, -halfD + EDGE_PADDING, halfD - EDGE_PADDING);
      return hit;
    };

    const startWalkTo = (target: THREE.Vector3) => {
      stopWalk(false);

      // 触发 OrbitControls start 事件，让 CameraRig 取消可能尚未完成的自动飞行。
      if (controls && typeof (controls as any).dispatchEvent === 'function') {
        (controls as any).dispatchEvent({ type: 'start' });
      }

      const currentTarget = controls
        ? (controls as any).target.clone()
        : new THREE.Vector3(0, eyeHeight, 0);
      const startPosition = camera.position.clone();
      const horizontalDir = new THREE.Vector3(
        target.x - startPosition.x,
        0,
        target.z - startPosition.z,
      );

      if (horizontalDir.length() < 0.12 && Math.abs(startPosition.y - eyeHeight) < 0.12) {
        return;
      }

      const lookDir =
        horizontalDir.length() > 0.01
          ? horizontalDir.normalize()
          : new THREE.Vector3(
              currentTarget.x - startPosition.x,
              0,
              currentTarget.z - startPosition.z,
            ).normalize();
      const lookDistance = 1.8;
      const targetLookAt = new THREE.Vector3(
        clamp(target.x + lookDir.x * lookDistance, -halfW + EDGE_PADDING, halfW - EDGE_PADDING),
        eyeHeight,
        clamp(target.z + lookDir.z * lookDistance, -halfD + EDGE_PADDING, halfD - EDGE_PADDING),
      );
      const distance = startPosition.distanceTo(target);
      const duration = clamp(distance / walkSpeed, 0.55, 3.2);
      const tweenState = {
        px: startPosition.x,
        py: startPosition.y,
        pz: startPosition.z,
        tx: currentTarget.x,
        ty: currentTarget.y,
        tz: currentTarget.z,
      };

      if (controls) {
        (controls as any).enabled = false;
      }
      markerStartRef.current = performance.now();
      setMarker(target.clone());

      activeTweenRef.current = gsap.to(tweenState, {
        px: target.x,
        py: target.y,
        pz: target.z,
        tx: targetLookAt.x,
        ty: targetLookAt.y,
        tz: targetLookAt.z,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          camera.position.set(tweenState.px, tweenState.py, tweenState.pz);
          if (controls) {
            (controls as any).target.set(tweenState.tx, tweenState.ty, tweenState.tz);
            (controls as any).update();
          } else {
            camera.lookAt(tweenState.tx, tweenState.ty, tweenState.tz);
          }
        },
        onComplete: () => {
          activeTweenRef.current = null;
          if (controls) {
            (controls as any).enabled = true;
            if (typeof (controls as any).dispatchEvent === 'function') {
              (controls as any).dispatchEvent({ type: 'end' });
            }
          }
          setMarker(null);
          onWalkComplete?.(target.clone());
        },
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!enabled || event.button !== 0) return;
      pointerDownRef.current = { x: event.clientX, y: event.clientY, button: event.button };
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!enabled) return;
      const start = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!start || start.button !== 0) return;

      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > CLICK_TOLERANCE) return;

      const target = getGroundPoint(event);
      if (!target) return;
      startWalkTo(target);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.style.cursor = previousCursor;
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      stopWalk();
    };
  }, [
    camera,
    controls,
    depth,
    enabled,
    eyeHeight,
    gl.domElement,
    groundPlane,
    halfD,
    halfW,
    onWalkComplete,
    walkSpeed,
    width,
  ]);

  useFrame(() => {
    if (!markerRef.current) return;
    const material = markerRef.current.material as THREE.MeshStandardMaterial;
    const elapsed = (performance.now() - markerStartRef.current) / 1000;
    const pulse = 1 + Math.sin(elapsed * 8) * 0.08;
    markerRef.current.scale.setScalar(pulse);
    material.opacity = 0.34 + Math.sin(elapsed * 8) * 0.12;
  });

  if (!enabled || !marker) return null;

  return (
    <group position={[marker.x, 0.07, marker.z]}>
      <mesh ref={markerRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.26, 0.42, 48]} />
        <meshStandardMaterial
          color={HIGHLIGHT_COLOR}
          emissive={HIGHLIGHT_COLOR}
          emissiveIntensity={0.45}
          transparent
          opacity={0.42}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.08, 32]} />
        <meshStandardMaterial
          color={HIGHLIGHT_COLOR}
          emissive={HIGHLIGHT_COLOR}
          emissiveIntensity={0.35}
          transparent
          opacity={0.72}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export default WalkthroughControls;
