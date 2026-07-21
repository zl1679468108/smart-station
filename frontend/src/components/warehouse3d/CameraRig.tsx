import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';

export interface CameraRigProps {
  position: [number, number, number];
  target: [number, number, number];
  /**
   * 有焦点才飞。edit 模式传 null 且 enableFly=false，禁止乱飞。
   * view 模式仅在有 highlights 时传入 focusTarget。
   */
  focusTarget?: [number, number, number] | null;
  /** 默认 false；仅 view 有焦点时开启 */
  enableFly?: boolean;
  /**
   * 仅在 key 变化时重新定位到总览（例如首次挂载）。
   * 编辑模式不因容器尺寸抖动反复重定位。
   */
  overviewKey?: string;
}

/**
 * 统一相机策略：
 * 1. 默认总览看原点
 * 2. 有焦点才飞
 * 3. 编辑模式禁止乱飞
 */
const CameraRig: React.FC<CameraRigProps> = ({
  position,
  target,
  focusTarget = null,
  enableFly = false,
  overviewKey = 'default',
}) => {
  const { camera, controls } = useThree();
  const initialized = useRef(false);
  const lastOverviewKey = useRef('');
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  // 初始/总览定位（仅 key 变化时，避免编辑模式 resize 乱飞）
  useFrame(() => {
    if (!initialized.current || lastOverviewKey.current !== overviewKey) {
      camera.position.set(position[0], position[1], position[2]);
      if (controls) {
        (controls as any).target.set(target[0], target[1], target[2]);
        (controls as any).update();
      } else {
        camera.lookAt(target[0], target[1], target[2]);
      }
      initialized.current = true;
      lastOverviewKey.current = overviewKey;
    }
  });

  // 用户拖拽时取消飞行
  useEffect(() => {
    if (!controls || !enableFly) return;
    const c = controls as any;
    const onStart = () => {
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
    };
    c.addEventListener('start', onStart);
    return () => c.removeEventListener('start', onStart);
  }, [controls, enableFly]);

  // 仅 enableFly 且有 focusTarget 时飞行
  useEffect(() => {
    if (!enableFly || !focusTarget || !initialized.current || !controls) return;

    const [tx, , tz] = focusTarget;
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
      tx,
      ty: 1,
      tz,
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
  }, [enableFly, focusTarget, camera, controls]);

  return null;
};

export default CameraRig;
