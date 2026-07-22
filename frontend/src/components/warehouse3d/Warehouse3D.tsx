import React, { Suspense } from 'react';
import ShelfMap3D from './ShelfMap3D';
import type {
  Warehouse3DEditProps,
  Warehouse3DProps,
  Warehouse3DViewProps,
} from './types';

// 编辑场景体积大（含拖拽交互），按需加载，避免工作台/取件页打包进编辑器
const ShelfMap3DEditor = React.lazy(() => import('./ShelfMap3DEditor'));

type Warehouse3DViewPreset = Partial<
  Omit<Warehouse3DViewProps, 'mode' | 'variant' | 'shelves'>
>;

const WAREHOUSE_3D_VIEW_PRESETS = {
  guide: {
    visualTheme: 'ops',
    enableBloom: true,
    enableWalkthrough: true,
    showGuidanceLabels: true,
  },
  screen: {
    visualTheme: 'screen',
    enableBloom: true,
    enableCameraPatrol: true,
    enableWalkthrough: true,
    showGuidanceLabels: true,
  },
} satisfies Record<NonNullable<Warehouse3DViewProps['variant']>, Warehouse3DViewPreset>;

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
  Warehouse3DVariant,
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
 * - variant="guide"：取件导览
 * - variant="screen"：数字孪生大屏中间仓体
 * - variant="editor"：布局拖拽编辑
 * 页面只表达场景意图，具体视觉/交互默认值在这里收敛。
 */
const Warehouse3D: React.FC<Warehouse3DProps> = (props) => {
  const editCandidate = props as Warehouse3DEditProps;
  const isEditor = editCandidate.mode === 'edit' || editCandidate.variant === 'editor';

  if (isEditor) {
    const editorProps = {
      ...(props as Warehouse3DEditProps),
      mode: 'edit' as const,
      variant: 'editor' as const,
    };
    return (
      <Suspense fallback={<EditFallback height={props.height} />}>
        <ShelfMap3DEditor {...editorProps} />
      </Suspense>
    );
  }

  const { variant, mode, ...viewProps } = props as Warehouse3DViewProps;
  const preset = getViewPreset(variant);

  return <ShelfMap3D {...preset} {...viewProps} />;
};

function getViewPreset(
  variant: Warehouse3DViewProps['variant'],
): Partial<Warehouse3DViewProps> {
  return variant ? WAREHOUSE_3D_VIEW_PRESETS[variant] : {};
}

export default Warehouse3D;
