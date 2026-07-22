import { useEffect, useState } from 'react';
import { Box3, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { StationAssetDef, StationAssetKey } from './registry';
import { STATION_ASSET_REGISTRY } from './registry';

export type AssetLoadState = 'idle' | 'probing' | 'loading' | 'ready' | 'missing' | 'error';

export interface OptionalGltfResult {
  state: AssetLoadState;
  /** 已适配 targetSize 的模板；调用方需 clone 后再挂载 */
  template: Object3D | null;
  def: StationAssetDef;
}

const cache = new Map<
  string,
  {
    state: AssetLoadState;
    template: Object3D | null;
    waiters: Array<(r: { state: AssetLoadState; template: Object3D | null }) => void>;
  }
>();

function fitToTarget(root: Object3D, targetSize: [number, number, number]) {
  const box = new Box3().setFromObject(root);
  const size = new Vector3();
  box.getSize(size);
  if (size.x < 1e-4 || size.y < 1e-4 || size.z < 1e-4) return root;

  const sx = targetSize[0] / size.x;
  const sy = targetSize[1] / size.y;
  const sz = targetSize[2] / size.z;
  const scale = Math.min(sx, sy, sz);
  root.scale.multiplyScalar(scale);

  const fitted = new Box3().setFromObject(root);
  const center = new Vector3();
  fitted.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= fitted.min.y;
  root.updateMatrixWorld(true);
  return root;
}

function loadAsset(def: StationAssetDef): Promise<{ state: AssetLoadState; template: Object3D | null }> {
  const existing = cache.get(def.url);
  if (existing && (existing.state === 'ready' || existing.state === 'missing' || existing.state === 'error')) {
    return Promise.resolve({ state: existing.state, template: existing.template });
  }
  if (existing && (existing.state === 'loading' || existing.state === 'probing')) {
    return new Promise((resolve) => {
      existing.waiters.push(resolve);
    });
  }

  const entry = {
    state: 'probing' as AssetLoadState,
    template: null as Object3D | null,
    waiters: [] as Array<(r: { state: AssetLoadState; template: Object3D | null }) => void>,
  };
  cache.set(def.url, entry);

  const finish = (state: AssetLoadState, template: Object3D | null) => {
    entry.state = state;
    entry.template = template;
    const payload = { state, template };
    entry.waiters.splice(0).forEach((w) => w(payload));
    return payload;
  };

  const isLikelyGltf = (res: Response) => {
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // SPA fallback 可能把缺失资源指到 index.html
    if (ct.includes('text/html')) return false;
    return true;
  };

  return fetch(def.url, { method: 'HEAD' })
    .catch(() => fetch(def.url, { method: 'GET' }))
    .then((res) => {
      if (!isLikelyGltf(res)) return finish('missing', null);
      entry.state = 'loading';
      return new Promise<{ state: AssetLoadState; template: Object3D | null }>((resolve) => {
        const loader = new GLTFLoader();
        loader.load(
          def.url,
          (gltf) => {
            const root = gltf.scene.clone(true);
            const toRemove: Object3D[] = [];
            root.traverse((obj) => {
              const mesh = obj as any;
              if (mesh.isMesh) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
              }
              const n = (obj.name || '').toLowerCase();
              if (
                n.includes('aisle label') ||
                n.includes('aisle_label') ||
                n.includes('label plate') ||
                n.includes('label text') ||
                n.includes('front printed label') ||
                n.includes('shelf parcel')
              ) {
                toRemove.push(obj);
              }
            });
            for (const obj of toRemove) {
              obj.parent?.remove(obj);
            }
            fitToTarget(root, def.targetSize);
            resolve(finish('ready', root));
          },
          undefined,
          () => resolve(finish('error', null)),
        );
      });
    })
    .catch(() => finish('missing', null));
}

/**
 * 可选 GLB 加载：文件不存在/失败时 state=missing|error，业务侧回退程序化模型。
 */
export function useOptionalGltf(key: StationAssetKey | null | undefined): OptionalGltfResult {
  const def = key ? STATION_ASSET_REGISTRY[key] : null;
  const [state, setState] = useState<AssetLoadState>(def ? 'probing' : 'idle');
  const [template, setTemplate] = useState<Object3D | null>(null);

  useEffect(() => {
    if (!def) {
      setState('idle');
      setTemplate(null);
      return;
    }
    let alive = true;
    setState('probing');
    loadAsset(def).then((result) => {
      if (!alive) return;
      setState(result.state);
      setTemplate(result.template);
    });
    return () => {
      alive = false;
    };
  }, [def?.key, def?.url]);

  return {
    state,
    template: state === 'ready' ? template : null,
    def: def ?? STATION_ASSET_REGISTRY['shelf.medium'],
  };
}

/** 预热常用资产（大屏进入时调用） */
export function preloadStationAssets(keys?: StationAssetKey[]) {
  const list = keys ?? (Object.keys(STATION_ASSET_REGISTRY) as StationAssetKey[]);
  return Promise.all(list.map((k) => loadAsset(STATION_ASSET_REGISTRY[k])));
}
