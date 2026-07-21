import type { ShelfSizeType } from '@/types/kiosk';

/** 布局常量（fallback 自动布局用，与后端 autoInit 一致） */
export const SHELF_W = 2.4;
export const SHELF_D = 1.2;
export const LAYER_H = 0.55;
export const POST = 0.08;
export const BOARD_T = 0.05;
export const SHELF_GAP_X = 0.5;
export const SHELF_GAP_Z = 1.0;
export const PER_ROW = 6;
export const ZONE_GAP = 2.4;
export const ZONE_LABEL_H = 0.6;

export const HIGHLIGHT_COLOR = '#FF6A00';
export const SELECTED_COLOR = '#3B82F6';
export const NORMAL_FRAME = '#94A3B8';
export const NORMAL_BOARD = '#E2E8F0';
export const GROUND_COLOR = '#EEF2F7';
export const GRID_COLOR = '#CBD5E1';
export const DOOR_COLOR = '#10B981';
export const PATH_COLOR = '#FF6A00';
export const AREA_OFFICE_COLOR = '#3B82F6';
export const AREA_PICKUP_COLOR = '#8B5CF6';
export const SNAP = 0.5;

export const SIZE_ACCENT: Record<ShelfSizeType, string> = {
  small: '#38BDF8',
  medium: '#8B5CF6',
  large: '#F97316',
};

export const CAMERA_FOV = 45;

/** 大屏科技主题色 */
export const SCREEN_BG = '#06101f';
export const SCREEN_GROUND = '#0b1a2e';
export const SCREEN_GRID = '#1d4ed8';
export const SCREEN_EDGE = '#22d3ee';
export const SCREEN_FRAME = '#64748b';
export const SCREEN_BOARD = '#1e293b';
export const SCREEN_TEXT = '#e2e8f0';
