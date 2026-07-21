import React, { Suspense } from 'react';
import ShelfMap3D from './ShelfMap3D';
import type { Warehouse3DProps } from './types';

// 编辑场景体积大（含拖拽交互），按需加载，避免工作台/取件页打包进编辑器
const ShelfMap3DEditor = React.lazy(() => import('./ShelfMap3DEditor'));

export { MODEL_LIBRARY, findModelByType } from './modelLibrary';
export type { ModelLibraryItem } from './modelLibrary';
export {
  parseShelfNumberFromCode,
  parseLayerFromCode,
  getZoneLetter,
} from './utils';
export type {
  SelectedTargetType,
  Warehouse3DProps,
  WarehouseEditableShelf,
  WarehouseHighlight,
  WarehouseShelf,
  WarehouseVisualTheme,
} from './types';

function EditFallback({ height }: { height?: number | string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-white text-sm text-gray-400"
      style={{ height: height ?? 480 }}
    >
      正在加载 3D 编辑器...
    </div>
  );
}

/**
 * 仓库 3D 唯一业务入口。
 * - mode="view"（默认）：工作台占用 / 取件引导 / 大屏中间仓体
 * - mode="edit"：布局拖拽编辑
 * 主题 visualTheme: ops | screen 控制材质与氛围，不复制第二套场景。
 */
const Warehouse3D: React.FC<Warehouse3DProps> = (props) => {
  if (props.mode === 'edit') {
    return (
      <Suspense fallback={<EditFallback height={props.height} />}>
        <ShelfMap3DEditor {...props} />
      </Suspense>
    );
  }

  return <ShelfMap3D {...props} />;
};

export default Warehouse3D;
