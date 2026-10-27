// Bản chụp Cartographer (xem src/cartographer/UPSTREAM.md). Chỉ phần sinh dữ liệu, không có DOM.
export { generateWorld } from './cartographer/gen/world';
export { DEFAULT_PARAMS } from './cartographer/gen/types';
export type { World, WorldParams, Label, County, Realm } from './cartographer/gen/types';
export { generateSettlement } from './cartographer/settlement/generate';
export { fromWorld } from './cartographer/settlement/fromWorld';
export { DEFAULT_SETTLEMENT } from './cartographer/settlement/types';
export type { Settlement, SettlementParams } from './cartographer/settlement/types';

// Vùng chơi và nơi sinh (code của dự án, ADR 0007)
export { buildRegion, fertilityOf, regionIdentity, RegionError, FERTILITY_MAX, FERTILITY_MIN, REGION_WORLD_W, REGION_WORLD_H, REGION_RADIUS_KM } from './region/buildRegion';
export type { RegionBundle, RegionLogic, RegionProgress } from './region/buildRegion';
export { toHanViet, HANVIET_CHARS } from './region/hanviet';
