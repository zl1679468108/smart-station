import React, { useLayoutEffect, useMemo, useRef } from 'react';
import type { Group, Object3D } from 'three';
import type { StationAssetKey } from './registry';
import { useOptionalGltf } from './useOptionalGltf';

export interface GltfModelProps {
  assetKey: StationAssetKey;
  /** 在已适配 targetSize 的基础上再按业务尺寸微调 */
  size?: [number, number, number];
  rotation?: [number, number, number];
  position?: [number, number, number];
  /** 整体透明度（仅影响含 material 的 mesh） */
  opacity?: number;
  /** 高亮时附加自发光 */
  emissive?: string;
  emissiveIntensity?: number;
  /** GLB 不可用时渲染 */
  fallback?: React.ReactNode;
  /** 是否强制只用 fallback（编辑态可关资产） */
  disabled?: boolean;
  onReadyChange?: (ready: boolean) => void;
}

/**
 * 可选 GLB 模型：有资产用资产，无资产用 fallback。
 * 布局数据仍由外层 group 的 position/rotation 控制。
 */
function shouldStripPlaceholderNode(name: string): boolean {
  const n = (name || '').toLowerCase();
  if (!n) return false;
  // A-12 等通道假铭牌
  if (
    n.includes('aisle label') ||
    n.includes('aisle_label') ||
    n.includes('label plate') ||
    n.includes('label text') ||
    n.includes('front printed label')
  ) {
    return true;
  }
  // 货架 GLB 内嵌示意包裹，真实库存由业务侧 ParcelBox 渲染
  if (n.includes('shelf parcel')) {
    return true;
  }
  return false;
}

const GltfModel: React.FC<GltfModelProps> = ({
  assetKey,
  size,
  rotation = [0, 0, 0],
  position = [0, 0, 0],
  opacity = 1,
  emissive,
  emissiveIntensity = 0,
  fallback = null,
  disabled = false,
  onReadyChange,
}) => {
  const { state, template, def } = useOptionalGltf(disabled ? null : assetKey);
  const groupRef = useRef<Group>(null);
  const ready = !disabled && state === 'ready' && !!template;

  useLayoutEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  const instance = useMemo(() => {
    if (!ready || !template) return null;
    const cloned = template.clone(true);
    cloned.userData.__baseScale = cloned.scale.clone();

    // 彻底移除占位铭牌 / 内嵌示意包裹（如 A-12），避免与真实货架号/库存混淆
    const toRemove: Object3D[] = [];
    cloned.traverse((obj) => {
      if (shouldStripPlaceholderNode(obj.name || '')) {
        toRemove.push(obj);
      }
    });
    for (const obj of toRemove) {
      obj.parent?.remove(obj);
    }

    cloned.traverse((obj) => {
      const mesh = obj as any;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.userData.__baseMaterials = mats.map((m: any) => m?.clone?.() ?? m);
    });
    return cloned;
  }, [ready, template]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    while (group.children.length) {
      group.remove(group.children[0]);
    }
    if (!instance) return;

    const root: Object3D = instance;
    const baseScale = root.userData.__baseScale ?? root.scale;
    if (size) {
      const [tw, th, td] = size;
      const [bw, bh, bd] = def.targetSize;
      root.scale.set(
        baseScale.x * (tw / Math.max(bw, 1e-4)),
        baseScale.y * (th / Math.max(bh, 1e-4)),
        baseScale.z * (td / Math.max(bd, 1e-4)),
      );
    } else {
      root.scale.copy(baseScale);
    }

    root.traverse((obj) => {
      const mesh = obj as any;
      if (!mesh.isMesh || !mesh.material) return;
      const isArr = Array.isArray(mesh.material);
      const baseMaterials = mesh.userData.__baseMaterials;
      const mats = Array.isArray(baseMaterials)
        ? baseMaterials
        : isArr
          ? mesh.material
          : [mesh.material];
      const next = mats.map((m: any) => {
        const cloned = m?.clone?.() ?? m;
        if (!cloned) return m;
        if (opacity < 0.999) {
          cloned.transparent = true;
          cloned.opacity = (cloned.opacity ?? 1) * opacity;
          cloned.depthWrite = opacity > 0.95;
        }
        if (emissive && 'emissive' in cloned) {
          cloned.emissive?.set?.(emissive);
          cloned.emissiveIntensity = emissiveIntensity;
        }
        return cloned;
      });
      mesh.material = isArr ? next : next[0];
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    group.add(root);
  }, [instance, size, def.targetSize, opacity, emissive, emissiveIntensity]);

  if (!ready) {
    return <>{fallback}</>;
  }

  return <group ref={groupRef} position={position} rotation={rotation} />;
};

export default GltfModel;
