import React, { useEffect, useState, useMemo, useCallback } from 'react';
import * as adminService from '@/services/admin';
import { useShelves, useInvalidateShelves } from '@/hooks/useDictionary';
import { useAuth } from '@/utils/auth';
import { canManageSystem } from '@/utils/permission';
import Icon from '@/components/ui/Icon';
import ShelfMap3DEditor, {
  EditorShelf,
  MODEL_LIBRARY,
  findModelByType,
} from '@/components/ShelfMapEditor';
import type { Shelf, StationLayoutConfig, LayoutDoor, LayoutArea } from '@/types/admin';

const SIZE_LABEL: Record<string, string> = {
  small: '小件',
  medium: '中件',
  large: '大件',
};

// 把后台 Shelf 数据转成 EditorShelf（KioskShelf + id）
function toEditorShelf(s: Shelf): EditorShelf {
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
  };
}

// 货架本地覆盖（拖拽/输入框改过但未保存）
interface ShelfOverride {
  posX?: number | null;
  posY?: number | null;
  rotation?: number;
  zone?: string | null;
}

// 生成默认门：放在前墙中央（+Y 方向墙，y = depth/2）
// 地面中心在原点，bounds 范围 [-w/2, w/2] × [-d/2, d/2]
function makeDefaultDoor(depth: number): LayoutDoor {
  return { x: 0, y: depth / 2, width: 1.2, label: '正门' };
}

// 生成区域唯一 ID（优先 crypto.randomUUID，兼容降级）
function genAreaId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 计算同类型区域的下一个序号（用于默认标签）
function nextAreaLabel(areas: LayoutArea[], type: 'office' | 'pickup'): string {
  const prefix = type === 'office' ? '办公区' : '揽收区';
  const count = areas.filter((a) => a.type === type).length;
  return `${prefix} ${count + 1}`;
}

// 仓库布局 Tab：管理员拖拽摆放货架 + 拖拽模型库建模 + 统一保存
const StationLayoutTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = canManageSystem(user?.role);

  const { data: shelfList = [], isLoading } = useShelves();
  const invalidateShelves = useInvalidateShelves();

  // 服务器端原始数据（用于 dirty 判断 + 重置）
  const [serverBounds, setServerBounds] = useState<{ width: number; depth: number } | null>(null);
  const [serverDoors, setServerDoors] = useState<LayoutDoor[]>([]);
  const [serverAreas, setServerAreas] = useState<LayoutArea[]>([]);

  // 本地可编辑数据
  const [layoutConfig, setLayoutConfig] = useState<StationLayoutConfig | null>(null);
  const [boundsForm, setBoundsForm] = useState({ width: 20, depth: 15 });
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

  // 拉取户型配置
  useEffect(() => {
    adminService
      .fetchLayoutConfig()
      .then((res) => {
        setLayoutConfig(res.layoutConfig);
        const b = res.layoutConfig.bounds;
        if (b) {
          setBoundsForm(b);
          setServerBounds(b);
        }
        // 默认保证至少一个门：如果没门，用默认门（前墙中央）
        const ds = res.layoutConfig.doors ?? [];
        const finalDoors = ds.length > 0 ? ds : [makeDefaultDoor(b?.depth ?? boundsForm.depth)];
        setDoors(finalDoors);
        setServerDoors(finalDoors);
        const ars = res.layoutConfig.areas ?? [];
        setAreas(ars);
        setServerAreas(ars);
      })
      .catch((e) => {
        setMsg({ type: 'error', text: e.message || '加载户型配置失败' });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // dirty 判断：货架有覆盖 / bounds 变了 / doors 变了 / areas 变了
  const isDirty = useMemo(() => {
    if (Object.keys(shelfOverrides).length > 0) return true;
    if (serverBounds && (serverBounds.width !== boundsForm.width || serverBounds.depth !== boundsForm.depth)) {
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
      if (!model) return;
      const newArea: LayoutArea = {
        id: genAreaId(),
        x: snappedX,
        y: snappedZ,
        width: model.width,
        depth: model.depth,
        height: model.height,
        type: model.type as 'office' | 'pickup',
        label: nextAreaLabel(areas, model.type as 'office' | 'pickup'),
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
      // 统一保存：提交所有货架当前位置 + 仓库尺寸 + 门口列表 + 区域列表
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
        areas,
      });

      // 刷新数据，重置本地状态
      await invalidateShelves();
      setLayoutConfig(res.layoutConfig);
      const b = res.layoutConfig.bounds;
      if (b) {
        setServerBounds(b);
        setBoundsForm(b);
      }
      const ds = res.layoutConfig.doors ?? [];
      const finalDs = ds.length > 0 ? ds : [makeDefaultDoor(b?.depth ?? boundsForm.depth)];
      setServerDoors(finalDs);
      setDoors(finalDs);
      const ars = res.layoutConfig.areas ?? [];
      setServerAreas(ars);
      setAreas(ars);
      setShelfOverrides({});
      showMsg('success', `仓库布局已保存（${res.shelvesUpdated} 个货架位置更新）`);
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

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        加载中...
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

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* 左侧：3D 编辑器 + 模型库 */}
        <div className="space-y-3">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <ShelfMap3DEditor
              shelves={editorShelves}
              layoutConfig={
                layoutConfig
                  ? { ...layoutConfig, bounds: boundsForm, doors, areas }
                  : null
              }
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
                    }}
                    className="cursor-grab select-none rounded-lg border-2 border-dashed border-gray-200 p-3 text-center transition-colors hover:border-primary hover:bg-primary/5 active:cursor-grabbing"
                    title={`拖拽到 3D 场景创建${m.label}`}
                  >
                    <div
                      className="mx-auto mb-2 h-8 w-8 rounded"
                      style={{ background: m.color, opacity: 0.7 }}
                    />
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
          {/* 仓库尺寸 */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-gray-700">仓库尺寸（米）</h4>
            <div className="grid grid-cols-2 gap-2">
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
            </div>
          </div>

          {/* 区域列表 */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-gray-700">
              区域列表（{areas.length}）
            </h4>
            {areas.length === 0 ? (
              <div className="text-xs text-gray-400">
                暂无区域，从模型库拖入办公区/揽收区即可创建
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
                        background: a.type === 'office' ? '#3B82F6' : '#8B5CF6',
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
                    {s.pos_x !== null ? `(${s.pos_x.toFixed(1)}, ${s.pos_y?.toFixed(1)})` : '未配置'}
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
                  {selectedArea.type === 'office' ? '办公区' : '揽收区'}
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
