// Dựng một `World` tối thiểu từ RegionMapData để renderer của Cartographer vẽ được vùng cắt (ADR 0006).
// Chỉ phục vụ vẽ; không có luật game.
import type { RegionMapData, RegionSummary } from '@tsvl/shared';
import { DEFAULT_PARAMS, REGION_WORLD_W, type Label, type World } from '@tsvl/worldgen';

export function regionWorld(map: RegionMapData, region: RegionSummary, seed: string): World {
  const n = map.W * map.H;
  // Ngưỡng sông của renderer tỉ lệ (W/1024)²: quy lưu lượng của thế giới gốc về khung vùng cắt
  const flowK = (map.W / REGION_WORLD_W) ** 2;
  const scale = (a: Float32Array) => a.map((v) => v * flowK);
  const realm = new Int16Array(n);
  for (let i = 0; i < n; i++) realm[i] = Number.isNaN(map.water[i]) ? 0 : -1;
  const labels: Label[] = map.labels.map((l) => ({
    kind: l.kind as Label['kind'],
    name: l.name,
    zh: l.name,
    x: l.x,
    y: l.y,
    angle: l.angle,
    weight: l.weight,
    span: l.span,
    ...(l.path ? { path: l.path } : {}),
  }));
  return {
    params: { ...DEFAULT_PARAMS, seed, width: map.W, height: map.H, naming: 'eastern', settlements: true },
    W: map.W,
    H: map.H,
    elevation: map.elevation,
    water: map.water,
    temperature: map.temperature,
    // Renderer kiểu ink không dùng lượng mưa; điền giá trị trung bình cho đủ kiểu
    precipitation: new Float32Array(n).fill(800),
    flow: scale(map.flow),
    biome: map.biome,
    coastDist: map.coastDist,
    rivers: map.rivers.map((r) => ({ points: r.points, flow: scale(r.flow) })),
    labels,
    realm,
    realms: [{ name: region.realmName, zh: region.realmName, color: 0, x: map.W / 2, y: map.H / 2, capital: -1, noLabel: true, area: n, room: 0 }],
    roads: map.roads.map((r) => ({ kind: r.kind, pts: r.pts })),
    worldName: region.name,
    worldNameZh: region.name,
    worldNameJa: region.name,
    kmPerCell: map.kmPerCell,
    stats: { land: 0, peak: 0, trench: 0, lakes: 0, rivers: map.rivers.length, ms: 0 },
  };
}

/** Đường biên vùng chơi theo cạnh ô (mask 1 cạnh mask 0 hoặc mép bản đồ), toạ độ ô. */
export function maskOutline(map: RegionMapData): string {
  const { W, H, mask } = map;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? mask[y * W + x] : 0);
  let d = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) d += `M${x} ${y}h1`;
      if (!at(x, y + 1)) d += `M${x} ${y + 1}h1`;
      if (!at(x - 1, y)) d += `M${x} ${y}v1`;
      if (!at(x + 1, y)) d += `M${x + 1} ${y}v1`;
    }
  }
  return d;
}

/** Ranh giới giữa các quận trong vùng, toạ độ ô. */
export function countyLines(map: RegionMapData): string {
  const { W, H, county } = map;
  let d = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = county[y * W + x];
      if (c < 0) continue;
      if (x + 1 < W && county[y * W + x + 1] >= 0 && county[y * W + x + 1] !== c) d += `M${x + 1} ${y}v1`;
      if (y + 1 < H && county[(y + 1) * W + x] >= 0 && county[(y + 1) * W + x] !== c) d += `M${x} ${y + 1}h1`;
    }
  }
  return d;
}

/** Ảnh mặt nạ làm mờ phần ngoài vùng chơi (mỗi ô một điểm ảnh; trình duyệt làm mịn khi phóng). */
export function outsideMaskUrl(map: RegionMapData, rgba: [number, number, number, number]): string {
  const c = document.createElement('canvas');
  c.width = map.W;
  c.height = map.H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(map.W, map.H);
  for (let i = 0; i < map.W * map.H; i++) {
    if (map.mask[i]) continue;
    img.data.set(rgba, i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
