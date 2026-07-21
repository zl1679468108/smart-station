import type { WarehouseShelf } from './types';

export function getShelfCapacity(shelf: WarehouseShelf): number {
  if (typeof shelf.inStockCount === 'number' && typeof shelf.remainingCapacity === 'number') {
    return Math.max(1, shelf.inStockCount + shelf.remainingCapacity);
  }
  if (typeof shelf.capacityPerLayer === 'number') {
    return Math.max(1, shelf.layers * shelf.capacityPerLayer);
  }
  return Math.max(1, shelf.layers * 50);
}

export function getOccupancyRatio(shelf: WarehouseShelf): number {
  const inStock = shelf.inStockCount ?? 0;
  return Math.min(1, Math.max(0, inStock / getShelfCapacity(shelf)));
}

export function getOccupancyColor(ratio: number): string {
  if (ratio >= 0.85) return '#EF4444';
  if (ratio >= 0.65) return '#F59E0B';
  return '#22C55E';
}

export function getRemainingCapacity(shelf: WarehouseShelf): number {
  if (typeof shelf.remainingCapacity === 'number') return shelf.remainingCapacity;
  return Math.max(0, getShelfCapacity(shelf) - (shelf.inStockCount ?? 0));
}
