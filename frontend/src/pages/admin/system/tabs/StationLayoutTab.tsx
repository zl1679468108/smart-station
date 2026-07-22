import React, { useEffect, useState, useMemo, useCallback } from 'react';
import * as adminService from '@/services/admin';
import { useShelves, useInvalidateShelves } from '@/hooks/useDictionary';
import {
  useLayoutConfig,
  useSetLayoutConfigCache,
} from '@/hooks/useSystemAdmin';
import { useInvalidateKioskLayout } from '@/hooks/useKioskLayout';
import { useAuth } from '@/utils/auth';
import { canManageSystem } from '@/utils/permission';
import Icon from '@/components/ui/Icon';
import Warehouse3D, {
  type WarehouseEditableShelf,
  type ModelLibraryItem,
  MODEL_LIBRARY,
  findModelByType,
  DEFAULT_STATION_LAYOUT,
  normalizeLayoutArea,
} from '@/components/warehouse3d';
import type { Shelf, StationLayoutConfig, LayoutDoor, LayoutArea, LayoutAreaType, LayoutBounds } from '@/types/admin';

const SIZE_LABEL: Record<string, string> = {
  small: '小件',
  medium: '中件',
  large: '大件',
};

// 把后台 Shelf 数据转成统一 3D 编辑货架数据
function toEditorShelf(s: Shelf): WarehouseEditableShelf {
  return {
    id: s.id,
    number: s.number,
    sizeType: s.size_type,
    layers: s.layers,
    description: s.description,
    posX: s.pos_x,
    posY: s.pos_y,
    rotation: s.rotation,
    zone: s.zone,
    inStockCount: s.in_stock_count,
    remainingCapacity: s.remaining_capacity,
    capacityPerLayer: s.capacity_per_layer,
  };
}

// 货架本地覆盖（拖拽/输入框改过但未保存）
interface ShelfOverride {
  posX?: number | null;
  posY?: number | null;
  rotation?: number;
  zone?: string | null;
}

type BoundsForm = { width: number; depth: number; height: number };

function normalizeBounds(bounds?: LayoutBounds | null): BoundsForm {
  return {
    width: bounds?.width ?? DEFAULT_STATION_LAYOUT.bounds.width,
    depth: bounds?.depth ?? DEFAULT_STATION_LAYOUT.bounds.depth,
    height: bounds?.height ?? DEFAULT_STATION_LAYOUT.bounds.height ?? 3.2,
  };
}

// 生成默认门：放在前墙中央（+Y 方向墙，y = depth/2）
// 地面中心在原点，bounds 范围 [-w/2, w/2] × [-d/2, d/2]
function makeDefaultDoor(depth: number): LayoutDoor {
  return { x: 0, y: depth / 2, width: DEFAULT_STATION_LAYOUT.doors[0].width, label: '正门' };
}

// 生成区域唯一 ID（优先 crypto.randomUUID，兼容降级）
function genAreaId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 计算同类型区域的下一个序号（用于默认标签）
function nextAreaLabel(areas: LayoutArea[], type: LayoutAreaType): string {
  const preset = findModelByType(type);
  const prefix = preset?.type !== 'door' ? preset?.label : '功能区';
  const count = areas.filter((a) => a.type === type).length;
  return `${prefix} ${count + 1}`;
}

const ModelLibraryPreview: React.FC<{ model: ModelLibraryItem }> = ({ model }) => {
  const baseStyle = { background: model.color };
  const isArea = model.type !== 'door';

  return (
    <div className="relative mx-auto mb-2 h-16 w-full max-w-[160px] overflow-hidden rounded-md bg-slate-50">
      <div className="absolute inset-x-4 bottom-2 h-4 skew-x-[-18deg] rounded bg-slate-200/80" />
      {model.type === 'door' && (
        <div className="absolute left-1/2 top-3 h-10 w-12 -translate-x-1/2 border-x-4 border-t-4 border-emerald-500">
          <div className="absolute bottom-0 left-1/2 h-2 w-10 -translate-x-1/2 rounded-sm bg-emerald-300/70" />
        </div>
      )}
      {model.type === 'counter' && (
        <div className="absolute left-1/2 top-5 h-7 w-24 -translate-x-1/2 rounded-sm bg-sky-200 shadow-sm">
          <div className="absolute inset-x-2 -top-2 h-3 rounded-sm bg-sky-400" />
          <div className="absolute bottom-1 left-3 h-2 w-8 rounded-sm bg-slate-700" />
          <div className="absolute bottom-1 right-3 h-2 w-5 rounded-sm bg-orange-400" />
        </div>
      )}
      {model.type === 'outboundRecord' && (
        <div className="absolute left-1/2 top-4 grid h-9 w-24 -translate-x-1/2 grid-cols-4 gap-1 rounded-sm bg-teal-100 p-1 shadow-sm">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="rounded-sm bg-teal-400/80" />
          ))}
        </div>
      )}
      {(model.type === 'pickup' || model.type === 'oversize' || model.type === 'exception') && (
        <div className="absolute left-1/2 top-4 grid w-24 -translate-x-1/2 grid-cols-4 gap-1.5">
          {Array.from({ length: model.type === 'oversize' ? 5 : 8 }).map((_, i) => (
            <span
              key={i}
              className="h-4 rounded-sm shadow-sm"
              style={{ background: i % 2 === 0 ? model.color : '#C08457' }}
            />
          ))}
        </div>
      )}
      {model.type === 'office' && (
        <div className="absolute left-1/2 top-4 h-9 w-24 -translate-x-1/2 rounded-sm bg-blue-100 shadow-sm">
          <div className="absolute bottom-2 left-4 h-3 w-10 rounded-sm bg-amber-300" />
          <div className="absolute bottom-2 right-4 h-5 w-4 rounded-sm bg-slate-800" />
          <div className="absolute right-2 top-2 h-4 w-6 rounded-sm bg-blue-500/80" />
        </div>
      )}
      {isArea && (
        <div
          className="absolute bottom-2 left-1/2 h-1.5 -translate-x-1/2 rounded-full opacity-80"
          style={{ ...baseStyle, width: `${Math.max(44, Math.min(92, model.width * 24))}px` }}
        />
      )}
    </div>
  );
};

// 驿站门店布局：管理员拖拽摆放货架 + 拖拽模型库建模 + 统一保存
interface StationLayoutTabProps {
  /** 系统设置仅展示配置概览；完整 3D 编辑器嵌入工作台。 */
  panelOnly?: boolean;
}

const StationLayoutTab: React.FC<StationLayoutTabProps> = ({ panelOnly = false }) => {
  const { user } = useAuth();
  const canEdit = canManageSystem(user?.role);

  const { data: shelfList = [], isLoading: shelvesLoading } = useShelves();
  const invalidateShelves = useInvalidateShelves();
  // 布局配置走 React Query 缓存；保存后 setQueryData 同步
  const {
    data: layoutRes,
    isLoading: layoutQueryLoading,
    error: layoutQueryError,
  } = useLayoutConfig();
  const setLayoutConfigCache = useSetLayoutConfigCache();
  const invalidateKioskLayout = useInvalidateKioskLayout();

  // 服务器端原始数据（用于 dirty 判断 + 重置）
  const [serverBounds, setServerBounds] = useState<BoundsForm | null>(null);
  const [serverDoors, setServerDoors] = useState<LayoutDoor[]>([]);
  const [serverAreas, setServerAreas] = useState<LayoutArea[]>([]);

  // 本地可编辑数据
  const [layoutConfig, setLayoutConfig] = useState<StationLayoutConfig | null>(null);
  const [boundsForm, setBoundsForm] = useState<BoundsForm>(normalizeBounds(DEFAULT_STATION_LAYOUT.bounds));
  const [doors, setDoors] = useState<LayoutDoor[]>([]);
  const [areas, setAreas] = useState<LayoutArea[]>([]);
  const [shelfOverrides, setShelfOverrides] = useState<Record<string, ShelfOverride>>({});

  // 选中项
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'shelf' | 'door' | 'area' | null>(null);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 合并 override 后的编辑器货架数据
  const editorShelves = useMemo(() => {
    return shelfList.map((s) => {
      const ov = shelfOverrides[s.id];
      if (!ov) return toEditorShelf(s);
      return toEditorShelf({
        ...s,
        pos_x: ov.posX !== undefined ? ov.posX : s.pos_x,
        pos_y: ov.posY !== undefined ? ov.posY : s.pos_y,
        rotation: ov.rotation !== undefined ? ov.rotation : s.rotation,
        zone: ov.zone !== undefined ? ov.zone : s.zone,
      });
    });
  }, [shelfList, shelfOverrides]);

  const selectedShelf = useMemo(
    () => shelfList.find((s) => s.id === selectedId),
    [shelfList, selectedId],
  );

  // 选中货架的当前（本地）位置 — 直接从 override + 原始数据派生
  const selectedShelfPos = useMemo(() => {
    if (!selectedShelf) return null;
    const ov = shelfOverrides[selectedShelf.id];
    return {
      posX: ov?.posX !== undefined ? ov.posX : selectedShelf.pos_x,
      posY: ov?.posY !== undefined ? ov.posY : selectedShelf.pos_y,
      rotation: ov?.rotation !== undefined ? ov.rotation : selectedShelf.rotation,
      zone: ov?.zone !== undefined ? ov.zone : selectedShelf.zone,
    };
  }, [selectedShelf, shelfOverrides]);

  const selectedArea = useMemo(
    () => areas.find((a) => a.id === selectedId) ?? null,
    [areas, selectedId],
  );

  const shelfSummary = useMemo(() => {
    const totalStock = shelfList.reduce((sum, s) => sum + (s.in_stock_count ?? 0), 0);
    const totalRemaining = shelfList.reduce((sum, s) => sum + (s.remaining_capacity ?? 0), 0);
    const totalCapacity = totalStock + totalRemaining;
    const occupancy = totalCapacity > 0 ? Math.round((totalStock / totalCapacity) * 100) : 0;
    return { totalStock, totalRemaining, totalCapacity, occupancy };
  }, [shelfList]);

  // 缓存数据同步到本地可编辑状态（staleTime Infinity，仅首次加载或写后 setQueryData 会变）
  useEffect(() => {
    if (!layoutRes) return;
    const cfg = layoutRes.layoutConfig || {};
    setLayoutConfig(cfg);
    const b = normalizeBounds(cfg.bounds);
    setBoundsForm(b);
    setServerBounds(b);
    // 默认保证至少一个门：如果没门，用默认门（前墙中央）
    const ds = cfg.doors ?? [];
    const finalDoors = ds.length > 0 ? ds : [makeDefaultDoor(b.depth)];
    setDoors(finalDoors);
    setServerDoors(finalDoors);
    const ars = Array.isArray(cfg.areas)
      ? cfg.areas.map((area) => normalizeLayoutArea(area as any) as LayoutArea)
      : DEFAULT_STATION_LAYOUT.areas.map((area) => ({ ...area }));
    setAreas(ars);
    setServerAreas(ars);
  }, [layoutRes]);

  useEffect(() => {
    if (layoutQueryError) {
      setMsg({
        type: 'error',
        text:
          layoutQueryError instanceof Error
            ? layoutQueryError.message
            : '加载户型配置失败',
      });
    }
  }, [layoutQueryError]);

  const layoutLoading = layoutQueryLoading && !layoutRes;

  // dirty 判断：货架有覆盖 / bounds 变了 / doors 变了 / areas 变了
  const isDirty = useMemo(() => {
    if (Object.keys(shelfOverrides).length > 0) return true;
    if (
      serverBounds &&
      (serverBounds.width !== boundsForm.width ||
        serverBounds.depth !== boundsForm.depth ||
        serverBounds.height !== boundsForm.height)
    ) {
      return true;
    }
    if (JSON.stringify(serverDoors) !== JSON.stringify(doors)) return true;
    if (JSON.stringify(serverAreas) !== JSON.stringify(areas)) return true;
    return false;
  }, [shelfOverrides, boundsForm, doors, areas, serverBounds, serverDoors, serverAreas]);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 2500);
  };

  // ============ 本地修改（不调接口） ============

  // 拖拽货架松手 → 只更新本地 override
  const handleShelfDragEnd = (shelfId: string, x: number, z: number) => {
    if (!canEdit) return;
    setShelfOverrides((prev) => ({
      ...prev,
      [shelfId]: { ...prev[shelfId], posX: x, posY: z },
    }));
  };

  // 拖拽门口松手 → 只更新本地 doors
  const handleDoorDragEnd = (doorIndex: number, x: number, y: number) => {
    if (!canEdit) return;
    setDoors((prev) => prev.map((d, i) => (i === doorIndex ? { ...d, x, y } : d)));
  };

  // 拖拽区域松手 → 只更新本地 areas
  const handleAreaDragEnd = useCallback((areaId: string, x: number, z: number) => {
    if (!canEdit) return;
    setAreas((prev) => prev.map((a) => (a.id === areaId ? { ...a, x, y: z } : a)));
  }, [canEdit]);

  // 模型库拖入 3D 场景 → 创建新区域或门口
  const handleDropFromLibrary = useCallback(
    (modelType: string, x: number, z: number) => {
      if (!canEdit) return;
      const snappedX = Math.round(x / 0.5) * 0.5;
      const snappedZ = Math.round(z / 0.5) * 0.5;
      if (modelType === 'door') {
        // 新门口：默认宽度 1.2m，标签按序号
        setDoors((prev) => [
          ...prev,
          { x: snappedX, y: snappedZ, width: 1.2, label: `入口 ${prev.length + 1}` },
        ]);
        return;
      }
      const model = findModelByType(modelType);
      if (!model || model.type === 'door') return;
      const newArea: LayoutArea = {
        id: genAreaId(),
        x: snappedX,
        y: snappedZ,
        width: model.width,
        depth: model.depth,
        height: model.height,
        type: model.type,
        label: nextAreaLabel(areas, model.type),
      };
      setAreas((prev) => [...prev, newArea]);
      // 自动选中新加的区域
      setSelectedId(newArea.id);
      setSelectedType('area');
    },
    [canEdit, areas],
  );

  // 输入框修改选中货架位置 → 只更新本地 override
  const updateSelectedShelfField = (field: keyof ShelfOverride, value: any) => {
    if (!selectedShelf || !canEdit) return;
    setShelfOverrides((prev) => ({
      ...prev,
      [selectedShelf.id]: { ...prev[selectedShelf.id], [field]: value },
    }));
  };

  // 清空选中货架位置 → 本地 override 设为 null
  const handleClearPosition = () => {
    if (!selectedShelf || !canEdit) return;
    setShelfOverrides((prev) => ({
      ...prev,
      [selectedShelf.id]: { ...prev[selectedShelf.id], posX: null, posY: null, zone: null },
    }));
  };

  // 输入框修改选中区域 → 只更新本地 areas
  const updateSelectedAreaField = (field: keyof LayoutArea, value: any) => {
    if (!selectedArea || !canEdit) return;
    setAreas((prev) => prev.map((a) => (a.id === selectedArea.id ? { ...a, [field]: value } : a)));
  };

  // 删除选中区域 → 本地
  const handleRemoveArea = (areaId: string) => {
    if (!canEdit) return;
    setAreas((prev) => prev.filter((a) => a.id !== areaId));
    if (selectedId === areaId) {
      setSelectedId(null);
      setSelectedType(null);
    }
  };

  // 删除门口 → 本地（至少保留 1 个门）
  const handleRemoveDoor = (idx: number) => {
    if (!canEdit || doors.length <= 1) return;
    setDoors((prev) => prev.filter((_, i) => i !== idx));
    if (selectedType === 'door' && selectedId === `door-${idx}`) {
      setSelectedId(null);
      setSelectedType(null);
    }
  };

  // ============ 统一保存 ============

  const handleSaveAll = async () => {
    if (!canEdit || saving || !isDirty) return;
    setSaving(true);
    try {
      // 统一保存：提交所有货架当前位置 + 门店尺寸 + 门口列表 + 区域列表
      const shelves = editorShelves.map((s) => ({
        id: s.id,
        posX: s.posX,
        posY: s.posY,
        rotation: s.rotation,
        zone: s.zone,
      }));

      // 门口：保证至少一个门（兜底默认门）
      const finalDoors = doors.length > 0 ? doors : [makeDefaultDoor(boundsForm.depth)];

      const res = await adminService.saveStationLayout({
        shelves,
        bounds: boundsForm,
        doors: finalDoors,
        areas: areas.map((area) => normalizeLayoutArea(area as any) as LayoutArea),
      });

      // 刷新货架缓存 + 写入布局缓存，重置本地状态
      await invalidateShelves();
      setLayoutConfigCache(res.layoutConfig);
      invalidateKioskLayout();
      setLayoutConfig(res.layoutConfig);
      const b = normalizeBounds(res.layoutConfig.bounds);
      setServerBounds(b);
      setBoundsForm(b);
      const ds = res.layoutConfig.doors ?? [];
      const finalDs = ds.length > 0 ? ds : [makeDefaultDoor(b.depth)];
      setServerDoors(finalDs);
      setDoors(finalDs);
      const ars = (res.layoutConfig.areas ?? []).map((area) => normalizeLayoutArea(area as any) as LayoutArea);
      setServerAreas(ars);
      setAreas(ars);
      setShelfOverrides({});
      showMsg('success', `门店布局已保存（${res.shelvesUpdated} 个货架位置更新）`);
    } catch (e: any) {
      showMsg('error', e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 重置本地改动
  const handleReset = () => {
    setShelfOverrides({});
    if (serverBounds) setBoundsForm(serverBounds);
    setDoors(serverDoors);
    setAreas(serverAreas);
  };

  // panelOnly 只依赖布局配置；完整编辑器还要等货架字典
  const pageLoading = panelOnly
    ? layoutLoading
    : layoutLoading || (shelvesLoading && shelfList.length === 0);

  if (pageLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        加载中...
      </div>
    );
  }

  if (panelOnly) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="border-b border-gray-200 pb-4">
          <h2 className="text-base font-semibold text-gray-800">驿站门店布局配置</h2>
          <p className="mt-1 text-sm text-gray-500">
            布局建模和货架位置调整已集中到工作台，适合按每家社区驿站的真实空间单独配置。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-gray-200 bg-white p-4">
            <div className="text-xs text-gray-500">门店尺寸</div>
            <div className="mt-1 text-lg font-semibold text-gray-800">
              {boundsForm.width}m × {boundsForm.depth}m × {boundsForm.height}m
            </div>
          </div>
          <div className="border border-gray-200 bg-white p-4">
            <div className="text-xs text-gray-500">布局对象</div>
            <div className="mt-1 text-lg font-semibold text-gray-800">
              {shelfList.length} 个货架 · {doors.length} 个入口 · {areas.length} 个区域
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            window.location.hash = '#/admin/dashboard?layout=edit';
          }}
          className="flex items-center gap-1.5 bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover"
        >
          <Icon name="inbox" size={16} />
          在工作台调整门店布局
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 提示消息 */}
      {msg && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            msg.type === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-danger/10 text-danger'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* 操作栏：统一保存 + 重置 */}
      <div className="flex flex-wrap items-center gap-3">
        {canEdit && (
          <>
            <button
              onClick={handleSaveAll}
              disabled={!isDirty || saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="check" size={14} />
              {saving ? '保存中...' : '保存全部改动'}
            </button>
            {isDirty && !saving && (
              <button
                onClick={handleReset}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
              >
                重置
              </button>
            )}
            {isDirty && (
              <span className="text-xs text-warning">● 有未保存的改动</span>
            )}
          </>
        )}
        {!canEdit && (
          <div className="text-xs text-gray-400">店员角色只读，无法配置</div>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-400">在库件数</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{shelfSummary.totalStock}</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-400">剩余容量</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">
            {shelfSummary.totalRemaining}
          </div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-400">总容量</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{shelfSummary.totalCapacity}</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-400">整体占用率</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{shelfSummary.occupancy}%</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* 左侧：3D 编辑器 + 模型库 */}
        <div className="space-y-3">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <Warehouse3D
              variant="editor"
              shelves={editorShelves}
              layoutConfig={
                { ...(layoutConfig ?? {}), bounds: boundsForm, doors, areas }
              }
              layoutLoading={layoutLoading}
              selectedId={selectedId}
              selectedType={selectedType || 'shelf'}
              onSelect={(id, type) => {
                setSelectedId(id);
                setSelectedType(type);
              }}
              onShelfDragEnd={canEdit ? handleShelfDragEnd : undefined}
              onDoorDragEnd={canEdit ? handleDoorDragEnd : undefined}
              onAreaDragEnd={canEdit ? handleAreaDragEnd : undefined}
              onDropFromLibrary={canEdit ? handleDropFromLibrary : undefined}
              height={520}
            />
          </div>

          {/* 模型库面板 */}
          {canEdit && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h4 className="mb-1 text-sm font-semibold text-gray-700">模型库</h4>
              <p className="mb-3 text-xs text-gray-400">
                按住卡片拖到 3D 场景中即可创建模型，松手自动对齐 0.5m 网格
              </p>
              <div className="grid grid-cols-3 gap-2">
                {MODEL_LIBRARY.map((m) => (
                  <div
                    key={m.type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/model-type', m.type);
                      e.dataTransfer.effectAllowed = 'copy';
                      e.dataTransfer.setDragImage(e.currentTarget, e.currentTarget.clientWidth / 2, 42);
                    }}
                    className="cursor-grab select-none rounded-lg border-2 border-dashed border-gray-200 p-3 text-center transition-colors hover:border-primary hover:bg-primary/5 active:cursor-grabbing"
                    title={`拖拽到 3D 场景创建${m.label}`}
                  >
                    <ModelLibraryPreview model={m} />
                    <div className="text-xs font-medium text-gray-700">{m.label}</div>
                    <div className="text-[10px] text-gray-400">
                      {m.width}×{m.depth}×{m.height}m
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：配置面板 */}
        <div className="space-y-3">
          {/* 门店尺寸 */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-gray-700">门店尺寸（米）</h4>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-gray-500">
                宽度
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={boundsForm.width}
                  onChange={(e) =>
                    setBoundsForm((f) => ({ ...f, width: Number(e.target.value) }))
                  }
                  disabled={!canEdit}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                />
              </label>
              <label className="text-xs text-gray-500">
                深度
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={boundsForm.depth}
                  onChange={(e) =>
                    setBoundsForm((f) => ({ ...f, depth: Number(e.target.value) }))
                  }
                  disabled={!canEdit}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                />
              </label>
              <label className="text-xs text-gray-500">
                层高
                <input
                  type="number"
                  min={2}
                  step={0.1}
                  value={boundsForm.height}
                  onChange={(e) =>
                    setBoundsForm((f) => ({ ...f, height: Number(e.target.value) }))
                  }
                  disabled={!canEdit}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                />
              </label>
            </div>
          </div>

          {/* 区域列表 */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-gray-700">
              区域列表（{areas.length}）
            </h4>
            {areas.length === 0 ? (
              <div className="text-xs text-gray-400">
                暂无区域，从模型库拖入服务台、出库记录区或功能区即可创建
              </div>
            ) : (
              <div className="space-y-1.5">
                {areas.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      // 再点击当前已选中的区域 → 取消选中
                      if (selectedType === 'area' && selectedId === a.id) {
                        setSelectedId(null);
                        setSelectedType(null);
                      } else {
                        setSelectedId(a.id);
                        setSelectedType('area');
                      }
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                      selectedType === 'area' && selectedId === a.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded"
                      style={{
                        background: findModelByType(a.type)?.color ?? '#8B5CF6',
                        opacity: 0.7,
                      }}
                    />
                    <span className="font-medium">{a.label}</span>
                    <span className="ml-auto text-[10px] text-gray-400">
                      ({a.x.toFixed(1)}, {a.y.toFixed(1)})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 门口列表 */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-gray-700">
              门口列表（{doors.length}）
            </h4>
            <div className="space-y-1.5">
              {doors.map((d, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${
                    selectedType === 'door' && selectedId === `door-${i}`
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <button
                    onClick={() => {
                      // 再点击当前已选中的门口 → 取消选中
                      if (selectedType === 'door' && selectedId === `door-${i}`) {
                        setSelectedId(null);
                        setSelectedType(null);
                      } else {
                        setSelectedId(`door-${i}`);
                        setSelectedType('door');
                      }
                    }}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span className="font-medium">门 #{i + 1}</span>
                    <span className="text-[10px] text-gray-400">{d.label}</span>
                    <span className="ml-auto text-[10px] text-gray-400">
                      ({d.x.toFixed(1)}, {d.y.toFixed(1)})
                    </span>
                  </button>
                  {canEdit && doors.length > 1 && (
                    <button
                      onClick={() => handleRemoveDoor(i)}
                      className="text-danger hover:text-danger/80"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="mt-2 text-[10px] text-gray-400">
                提示：从模型库拖入「门口」卡片可新增门口
              </div>
            )}
          </div>

          {/* 货架列表 */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-gray-700">
              货架列表（{shelfList.length}）
            </h4>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {shelfList.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    // 再点击当前已选中的货架 → 取消选中
                    if (selectedType === 'shelf' && selectedId === s.id) {
                      setSelectedId(null);
                      setSelectedType(null);
                    } else {
                      setSelectedId(s.id);
                      setSelectedType('shelf');
                    }
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                    selectedId === s.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-medium">#{s.number}</span>
                  <span className="text-[10px] text-gray-400">{SIZE_LABEL[s.size_type]}</span>
                  <span className="ml-auto text-[10px] text-gray-400">
                    {s.in_stock_count}/{s.remaining_capacity}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 选中货架：位置编辑（放在最下面，点击列表项后展开） */}
          {selectedShelf && selectedType === 'shelf' && selectedShelfPos && (
            <div className="rounded-xl border border-primary/30 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">
                  #{selectedShelf.number} 号货架
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {SIZE_LABEL[selectedShelf.size_type]} · {selectedShelf.layers} 层
                  </span>
                </h4>
                <button
                  onClick={() => {
                    setSelectedId(null);
                    setSelectedType(null);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                  title="取消编辑"
                >
                  收起 ✕
                </button>
              </div>
              <div className="mb-2 grid grid-cols-3 gap-2 text-[11px] text-gray-500">
                <div className="rounded-lg bg-gray-50 px-2 py-1.5">
                  在库 {selectedShelf.in_stock_count}
                </div>
                <div className="rounded-lg bg-gray-50 px-2 py-1.5">
                  余量 {selectedShelf.remaining_capacity}
                </div>
                <div className="rounded-lg bg-gray-50 px-2 py-1.5">
                  容量 {selectedShelf.in_stock_count + selectedShelf.remaining_capacity}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-500">
                  X 坐标（米）
                  <input
                    type="number"
                    step={0.5}
                    value={selectedShelfPos.posX ?? ''}
                    onChange={(e) =>
                      updateSelectedShelfField(
                        'posX',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                    disabled={!canEdit}
                    placeholder="未设置"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Y 坐标（米）
                  <input
                    type="number"
                    step={0.5}
                    value={selectedShelfPos.posY ?? ''}
                    onChange={(e) =>
                      updateSelectedShelfField(
                        'posY',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                    disabled={!canEdit}
                    placeholder="未设置"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  朝向（度）
                  <select
                    value={selectedShelfPos.rotation}
                    onChange={(e) => updateSelectedShelfField('rotation', Number(e.target.value))}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                  >
                    <option value={0}>0°</option>
                    <option value={90}>90°</option>
                    <option value={180}>180°</option>
                    <option value={270}>270°</option>
                  </select>
                </label>
                <label className="text-xs text-gray-500">
                  区域
                  <select
                    value={selectedShelfPos.zone ?? ''}
                    onChange={(e) =>
                      updateSelectedShelfField('zone', e.target.value === '' ? null : e.target.value)
                    }
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                  >
                    <option value="">未分区</option>
                    <option value="A">A 区</option>
                    <option value="B">B 区</option>
                    <option value="C">C 区</option>
                  </select>
                </label>
              </div>
              {canEdit && (
                <button
                  onClick={handleClearPosition}
                  className="mt-2 w-full rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                >
                  清空位置
                </button>
              )}
            </div>
          )}

          {/* 选中区域：信息 + 编辑（放在最下面） */}
          {selectedType === 'area' && selectedArea && (
            <div className="rounded-xl border border-primary/30 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">
                  {findModelByType(selectedArea.type)?.label ?? '功能区'}
                </h4>
                <div className="flex items-center gap-3">
                  {canEdit && (
                    <button
                      onClick={() => handleRemoveArea(selectedArea.id)}
                      className="text-xs text-danger hover:text-danger/80"
                    >
                      删除
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedId(null);
                      setSelectedType(null);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                    title="取消编辑"
                  >
                    收起 ✕
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-500">
                  X 坐标（米）
                  <input
                    type="number"
                    step={0.5}
                    value={selectedArea.x}
                    onChange={(e) =>
                      updateSelectedAreaField('x', Number(e.target.value))
                    }
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Y 坐标（米）
                  <input
                    type="number"
                    step={0.5}
                    value={selectedArea.y}
                    onChange={(e) =>
                      updateSelectedAreaField('y', Number(e.target.value))
                    }
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                  />
                </label>
              </div>
              <label className="mt-2 block text-xs text-gray-500">
                标签
                <input
                  type="text"
                  value={selectedArea.label}
                  onChange={(e) => updateSelectedAreaField('label', e.target.value)}
                  disabled={!canEdit}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                />
              </label>
              <div className="mt-2 text-[10px] text-gray-400">
                尺寸（只读）：{selectedArea.width}×{selectedArea.depth}×{selectedArea.height}m
              </div>
            </div>
          )}

          {/* 选中门口：信息展示 + 删除（放在最下面） */}
          {selectedType === 'door' && selectedId && (
            <div className="rounded-xl border border-primary/30 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">
                  门口 #{Number(selectedId.replace('door-', '')) + 1}
                </h4>
                <div className="flex items-center gap-3">
                  {canEdit && doors.length > 1 && (
                    <button
                      onClick={() => handleRemoveDoor(Number(selectedId.replace('door-', '')))}
                      className="text-xs text-danger hover:text-danger/80"
                    >
                      删除
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedId(null);
                      setSelectedType(null);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                    title="取消编辑"
                  >
                    收起 ✕
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                拖拽门口调整位置，保存后生效。至少保留 1 个门口。
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StationLayoutTab;
