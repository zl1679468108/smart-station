import React, { useEffect, useState, useMemo } from 'react';
import * as adminService from '@/services/admin';
import { useShelves, useInvalidateShelves } from '@/hooks/useDictionary';
import { useAuth } from '@/utils/auth';
import { canManageSystem } from '@/utils/permission';
import Icon from '@/components/ui/Icon';
import ShelfMap3DEditor, { EditorShelf } from '@/components/ShelfMapEditor';
import type { Shelf, StationLayoutConfig, LayoutDoor } from '@/types/admin';

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

// 仓库布局 Tab：管理员拖拽摆放货架 + 配置门口，统一保存
const StationLayoutTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = canManageSystem(user?.role);

  const { data: shelfList = [], isLoading } = useShelves();
  const invalidateShelves = useInvalidateShelves();

  // 服务器端原始数据（用于 dirty 判断 + 重置）
  const [serverBounds, setServerBounds] = useState<{ width: number; depth: number } | null>(null);
  const [serverDoors, setServerDoors] = useState<LayoutDoor[]>([]);

  // 本地可编辑数据
  const [layoutConfig, setLayoutConfig] = useState<StationLayoutConfig | null>(null);
  const [boundsForm, setBoundsForm] = useState({ width: 20, depth: 15 });
  const [doorForm, setDoorForm] = useState({ x: 0, y: 0, width: 1.2, label: '正门' });
  const [doors, setDoors] = useState<LayoutDoor[]>([]);
  const [shelfOverrides, setShelfOverrides] = useState<Record<string, ShelfOverride>>({});

  // 选中项
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'shelf' | 'door' | null>(null);

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
        setDoorForm(finalDoors[0]);
      })
      .catch((e) => {
        setMsg({ type: 'error', text: e.message || '加载户型配置失败' });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // dirty 判断：货架有覆盖 / bounds 变了 / doors 变了
  const isDirty = useMemo(() => {
    if (Object.keys(shelfOverrides).length > 0) return true;
    if (serverBounds && (serverBounds.width !== boundsForm.width || serverBounds.depth !== boundsForm.depth)) {
      return true;
    }
    if (JSON.stringify(serverDoors) !== JSON.stringify(doors)) return true;
    return false;
  }, [shelfOverrides, boundsForm, doors, serverBounds, serverDoors]);

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

  // 添加门口 → 本地
  const handleAddDoor = () => {
    setDoors((prev) => [...prev, doorForm]);
  };

  // 删除门口 → 本地
  const handleRemoveDoor = (idx: number) => {
    setDoors((prev) => prev.filter((_, i) => i !== idx));
  };

  // ============ 统一保存 ============

  const handleSaveAll = async () => {
    if (!canEdit || saving || !isDirty) return;
    setSaving(true);
    try {
      // 统一保存：提交所有货架当前位置 + 仓库尺寸 + 门口列表（保证至少一个门）
      // 货架：提交所有货架的当前（override 合并后的）位置，未配置的传 null
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
        {selectedShelf && (
          <div className="text-xs text-gray-500">
            选中：<span className="font-medium text-primary">#{selectedShelf.number} 号货架</span>
          </div>
        )}
        {!canEdit && (
          <div className="text-xs text-gray-400">店员角色只读，无法配置</div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* 左侧：3D 编辑器 */}
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <ShelfMap3DEditor
            shelves={editorShelves}
            layoutConfig={layoutConfig ? { ...layoutConfig, bounds: boundsForm, doors } : null}
            selectedId={selectedId}
            selectedType={selectedType || 'shelf'}
            onSelect={(id, type) => {
              setSelectedId(id);
              setSelectedType(type);
            }}
            onShelfDragEnd={canEdit ? handleShelfDragEnd : undefined}
            onDoorDragEnd={canEdit ? handleDoorDragEnd : undefined}
            height={520}
          />
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
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50"
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
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50"
                />
              </label>
            </div>
          </div>

          {/* 门口管理 */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-gray-700">门口列表</h4>
            {doors.length === 0 ? (
              <div className="mb-2 text-xs text-gray-400">暂无门口，请添加</div>
            ) : (
              <div className="mb-3 space-y-1">
                {doors.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded bg-gray-50 px-2 py-1.5 text-xs"
                  >
                    <span>
                      <span className="font-medium text-gray-700">{d.label}</span>
                      <span className="ml-2 text-gray-500">
                        ({d.x}, {d.y}) · 宽 {d.width}m
                      </span>
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveDoor(i)}
                        className="text-danger hover:underline"
                      >
                        删除
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-gray-500">
                    X 坐标
                    <input
                      type="number"
                      step={0.5}
                      value={doorForm.x}
                      onChange={(e) =>
                        setDoorForm((f) => ({ ...f, x: Number(e.target.value) }))
                      }
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs text-gray-500">
                    Y 坐标
                    <input
                      type="number"
                      step={0.5}
                      value={doorForm.y}
                      onChange={(e) =>
                        setDoorForm((f) => ({ ...f, y: Number(e.target.value) }))
                      }
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs text-gray-500">
                    宽度（米）
                    <input
                      type="number"
                      min={0.5}
                      step={0.1}
                      value={doorForm.width}
                      onChange={(e) =>
                        setDoorForm((f) => ({ ...f, width: Number(e.target.value) }))
                      }
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="text-xs text-gray-500">
                    标签
                    <input
                      type="text"
                      maxLength={20}
                      value={doorForm.label}
                      onChange={(e) =>
                        setDoorForm((f) => ({ ...f, label: e.target.value }))
                      }
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </label>
                </div>
                <button
                  onClick={handleAddDoor}
                  className="mt-2 w-full rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-success/90"
                >
                  + 添加门口
                </button>
              </>
            )}
          </div>

          {/* 选中货架：位置展示 + 精调 */}
          {selectedType === 'shelf' && selectedShelf && selectedShelfPos && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-sm font-semibold text-gray-700">
                选中货架 #{selectedShelf.number}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {SIZE_LABEL[selectedShelf.size_type]} · {selectedShelf.layers} 层 · 在库{' '}
                  {selectedShelf.in_stock_count} 件
                </span>
              </h4>
              <div className="mb-2 rounded bg-blue-50 px-3 py-2 text-xs text-blue-600">
                💡 直接在 3D 视图中按住货架拖拽，或下方输入框精调，最后点顶部「保存全部改动」
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
                    placeholder="未配置"
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50"
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
                    placeholder="未配置"
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  朝向（度）
                  <select
                    value={selectedShelfPos.rotation}
                    onChange={(e) =>
                      updateSelectedShelfField('rotation', Number(e.target.value))
                    }
                    disabled={!canEdit}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50"
                  >
                    <option value={0}>0°</option>
                    <option value={90}>90°</option>
                    <option value={180}>180°</option>
                    <option value={270}>270°</option>
                  </select>
                </label>
                <label className="text-xs text-gray-500">
                  区域
                  <input
                    type="text"
                    maxLength={4}
                    value={selectedShelfPos.zone ?? ''}
                    onChange={(e) =>
                      updateSelectedShelfField(
                        'zone',
                        e.target.value === '' ? null : e.target.value,
                      )
                    }
                    disabled={!canEdit}
                    placeholder="留空按类型推断"
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50"
                  />
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

          {/* 选中门口：信息展示 */}
          {selectedType === 'door' && selectedId && (() => {
            const doorIdx = Number(selectedId.replace('door-', ''));
            const door = doors[doorIdx];
            if (!door) return null;
            return (
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <h4 className="mb-3 text-sm font-semibold text-gray-700">
                  选中门口：{door.label}
                </h4>
                <div className="mb-2 rounded bg-blue-50 px-3 py-2 text-xs text-blue-600">
                  💡 直接在 3D 视图中按住门口拖拽，最后点顶部「保存全部改动」
                </div>
                <div className="space-y-1 text-xs text-gray-600">
                  <div>X 坐标：{door.x.toFixed(2)} 米</div>
                  <div>Y 坐标：{door.y.toFixed(2)} 米</div>
                  <div>门宽：{door.width.toFixed(1)} 米</div>
                </div>
              </div>
            );
          })()}

          {/* 货架列表 */}
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h4 className="mb-3 text-sm font-semibold text-gray-700">货架列表</h4>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {editorShelves.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id);
                    setSelectedType('shelf');
                  }}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${
                    s.id === selectedId
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>
                    <span className="font-medium">#{s.number}</span>
                    <span className="ml-2 text-gray-500">{SIZE_LABEL[s.sizeType]}</span>
                  </span>
                  <span className="text-gray-400">
                    {s.posX !== null
                      ? `(${s.posX.toFixed(1)}, ${s.posY?.toFixed(1)})`
                      : '未配置'}
                    {shelfOverrides[s.id] && (
                      <span className="ml-1 text-warning">●</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 操作说明 */}
      <div className="rounded-lg bg-info/5 px-4 py-3 text-xs text-gray-500">
        <p className="mb-1 font-medium text-gray-600">操作说明</p>
        <ul className="ml-4 list-disc space-y-0.5">
          <li>点击 3D 视图中的货架或门口选中（高亮蓝色 + 光圈）</li>
          <li>按住选中的货架/门口拖拽即可移动，或右侧输入框精调</li>
          <li>所有改动先在本地暂存（货架列表中 ● 标记改动项），点顶部「保存全部改动」一次性提交</li>
          <li>未配置位置的货架由前端按 size_type 自动 fallback 排列，仅视觉占位不落库</li>
          <li>查询页（/query）会读取这些配置，渲染真实位置 + 门口到货架的寻路路径</li>
        </ul>
      </div>
    </div>
  );
};

export default StationLayoutTab;
