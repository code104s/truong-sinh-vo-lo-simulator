// Cắt vùng chơi và đặt nơi sinh (ADR 0007). Code của dự án; không sửa bản chụp cartographer/.
// Số thực được phép ở đây: kết quả được lưu vào save, sim không sinh lại bản đồ.
import {
  birthplaceId, regionId,
  type Birthplace, type BirthplaceId, type CellPos, type MapCounty, type MapLabel, type MapRiver, type MapRoad,
  type RegionId, type RegionMapData, type RegionSummary, type SettlementKind, type WorldSeed,
} from '@tsvl/shared';
import { Namer } from '../cartographer/gen/naming';
import { hashString, RNG } from '../cartographer/gen/rng';
import { DEFAULT_PARAMS, type World } from '../cartographer/gen/types';
import { generateWorld, riverThreshold } from '../cartographer/gen/world';
import { toHanViet } from './hanviet';
import { countyAdjacency, reachableCounties } from './connectivity';

export const REGION_WORLD_W = 1024;
export const REGION_WORLD_H = 768;
export const REGION_RADIUS_KM = 150;
/** Lề quanh hộp bao vùng (ô), để bản đồ có chút cảnh quanh biên giới. */
export const REGION_MARGIN = 4;
const MIN_VILLAGES = 5;
const MAX_VILLAGES = 10;
/** Khoảng cách tối thiểu (ô) giữa làng phụ và nơi sinh khác. */
const MIN_SPACING = 3;

/** Lớp logic của vùng cho sim: chỉ số nguyên. */
export interface RegionLogic {
  /** km/ô × 1000 */
  kmPerCellMilli: number;
  counties: { worldIndex: number; area: number; seat: CellPos; name?: string }[];
  /** Loại khu dân cư tại trị sở mỗi quận (ADR 0009); làng phụ không đổi loại trị sở. */
  settlementKind: SettlementKind[];
  /** Cặp quận kề nhau (chỉ số cục bộ, a < b), sắp xếp. */
  adjacency: [number, number][];
  /** Hệ số địa hình (%) ứng với từng cạnh adjacency; núi ×2, sông lớn ×1,5. */
  terrainPct: number[];
  /** Khoảng cách đường chim bay giữa trị sở (km), ma trận đối xứng. */
  seatKm: number[][];
  /** Độ phì nhiêu đất mỗi quận (%), FERTILITY_MIN..FERTILITY_MAX (ADR 0012). */
  fertilityPct: number[];
}

export const FERTILITY_MIN = 70;
export const FERTILITY_MAX = 130;

/**
 * Độ phì nhiêu từ trung bình trên ô đất của quận (ADR 0012). Tỉ lệ đất canh tác theo quần xã gần như phẳng (85–100%)
 * nên không dùng. Hiệu chỉnh trên 112 quận của tsvl-01..10: độ cao 6–745 m, nhiệt độ 10,1–18,5°, ô sông lớn 0–302‰.
 */
export function fertilityOf(elevM: number, tempDeci: number, riverPermille: number): number {
  const river = Math.min(20, Math.floor(riverPermille / 10));
  const highland = Math.floor(Math.max(0, elevM - 100) / 12);
  const cold = Math.floor(Math.max(0, 150 - tempDeci) / 3);
  return Math.min(FERTILITY_MAX, Math.max(FERTILITY_MIN, 100 + river - highland - cold));
}

export interface RegionBundle {
  worldSeed: WorldSeed;
  summary: RegionSummary;
  map: RegionMapData;
  birthplaces: Birthplace[];
  logic: RegionLogic;
  /** Phương án đặt thị trấn của Cartographer đã dùng (0 nếu ngay lần đầu có nước kiểu `eastern`). */
  placeVariant: number;
  /** Thời gian sinh thế giới (ms) do Cartographer đo; chỉ để ghi nhận, không thuộc kết quả. */
  worldMs: number;
}

export type RegionProgress = (stage: 'worldgen' | 'region', pct: number) => void;

export class RegionError extends Error {}

export function buildRegion(worldSeed: WorldSeed, progress: RegionProgress = () => {}): RegionBundle {
  for (let placeVariant = 0; placeVariant <= 3; placeVariant++) {
    const world = generateWorld(
      { ...DEFAULT_PARAMS, seed: worldSeed, width: REGION_WORLD_W, height: REGION_WORLD_H, naming: 'eastern', placeVariant },
      (_stage, frac) => progress('worldgen', Math.min(95, Math.floor(frac * 95))),
    );
    const realm = pickRealm(world);
    if (realm < 0) continue;
    progress('region', 96);
    const bundle = cut(world, worldSeed, realm, placeVariant);
    progress('region', 100);
    return bundle;
  }
  throw new RegionError(`seed "${worldSeed}": không có nước văn hóa eastern sau 4 phương án đặt thị trấn`);
}

/** Nước đầu tiên (theo chỉ số) có văn hóa xây thành kiểu `eastern`. */
function pickRealm(world: World): number {
  const pol = world.political;
  if (!pol) return -1;
  return world.realms.findIndex((r) => r.culture !== undefined && pol.cultures[r.culture]?.town === 'eastern');
}

function cut(world: World, worldSeed: WorldSeed, ri: number, placeVariant: number): RegionBundle {
  const pol = world.political!;
  const { W } = world;
  const realm = world.realms[ri];
  const cap = world.labels[realm.capital];
  const capCell = { x: Math.floor(cap.x), y: Math.floor(cap.y) };
  const capCounty = pol.county[capCell.y * W + capCell.x];
  if (capCounty < 0) throw new RegionError(`kinh đô ${cap.zh} không nằm trong quận nào`);
  const rid = regionId(`r${ri}`);

  // Quận cùng nước có trị sở trong bán kính (so bình phương, tránh Math.hypot có thể lệch giữa engine)
  const r = REGION_RADIUS_KM / world.kmPerCell;
  const candidates: number[] = [];
  pol.counties.forEach((c, i) => {
    const dx = c.x - cap.x;
    const dy = c.y - cap.y;
    if (i === capCounty || (c.realm === ri && dx * dx + dy * dy <= r * r)) candidates.push(i);
  });
  const connected = reachableCounties(capCounty, countyAdjacency(pol.county, W, world.H, new Set(candidates)));
  const chosen = candidates.filter((i) => connected.has(i));
  const localOf = new Map(chosen.map((wi, li) => [wi, li]));

  // Hộp bao
  let minX = W, minY = world.H, maxX = -1, maxY = -1;
  for (let i = 0; i < pol.county.length; i++) {
    if (!localOf.has(pol.county[i])) continue;
    const x = i % W, y = (i - x) / W;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const x0 = Math.max(0, minX - REGION_MARGIN), y0 = Math.max(0, minY - REGION_MARGIN);
  const x1 = Math.min(W - 1, maxX + REGION_MARGIN), y1 = Math.min(world.H - 1, maxY + REGION_MARGIN);
  const RW = x1 - x0 + 1, RH = y1 - y0 + 1;
  const inBox = (x: number, y: number) => x >= x0 && x < x1 + 1 && y >= y0 && y < y1 + 1;

  const crop = <T extends Float32Array | Uint8Array>(src: T, make: (n: number) => T): T => {
    const out = make(RW * RH);
    for (let y = 0; y < RH; y++) out.set(src.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + RW), y * RW);
    return out;
  };
  const mask = new Uint8Array(RW * RH);
  const county = new Int16Array(RW * RH).fill(-1);
  for (let y = 0; y < RH; y++) {
    for (let x = 0; x < RW; x++) {
      const li = localOf.get(pol.county[(y0 + y) * W + x0 + x]);
      if (li === undefined) continue;
      mask[y * RW + x] = 1;
      county[y * RW + x] = li;
    }
  }

  // Tên: chữ Hán → Hán-Việt; tên không thuộc bộ chữ eastern (quận của văn hóa khác) thì đặt lại
  const namer = new Namer({ seed: worldSeed, naming: 'eastern' }, new RNG(hashString(`${worldSeed}|region|names`)), '|region');
  const usedHan = new Set<string>();
  const fresh = (kind: 'city' | 'realm'): { name: string; nameHan: string } => {
    for (let t = 0; t < 50; t++) {
      const han = namer.name(kind).zh;
      const name = toHanViet(han);
      if (name && !usedHan.has(han)) {
        usedHan.add(han);
        return { name, nameHan: han };
      }
    }
    throw new RegionError('không đặt được tên Hán-Việt');
  };
  const named = (han: string, kind: 'city' | 'realm') => {
    const name = toHanViet(han);
    if (name && !usedHan.has(han)) {
      usedHan.add(han);
      return { name, nameHan: han };
    }
    return fresh(kind);
  };

  const capName = named(cap.zh, 'city');
  const counties: MapCounty[] = chosen.map((wi) => {
    const c = pol.counties[wi];
    const n = wi === capCounty ? capName : named(c.zh, 'city');
    return { ...n, seat: { x: c.x - x0, y: c.y - y0 } };
  });

  // —— Nơi sinh ——
  const birthplaces: Birthplace[] = [];
  const add = (id: BirthplaceId, n: { name: string; nameHan: string }, kind: SettlementKind, cell: CellPos, li: number) =>
    birthplaces.push({ id, name: n.name, nameHan: n.nameHan, kind, cell, county: li });

  const capLocal = localOf.get(capCounty)!;
  add(birthplaceId(`${rid}/c${capCounty}`), capName, 'city', { x: capCell.x - x0, y: capCell.y - y0 }, capLocal);

  const others = chosen.filter((wi) => wi !== capCounty);
  const n = chosen.length;
  const nTowns = Math.min(others.length, 1 + (n >= 10 ? 1 : 0) + (n >= 16 ? 1 : 0));
  const byArea = [...others].sort((a, b) => pol.counties[b].area - pol.counties[a].area || a - b);
  const towns = byArea.slice(0, nTowns);
  const capDist2 = (wi: number) => {
    const c = pol.counties[wi];
    return (c.x - capCell.x) ** 2 + (c.y - capCell.y) ** 2;
  };
  for (const wi of [...towns].sort((a, b) => capDist2(a) - capDist2(b) || a - b)) {
    const li = localOf.get(wi)!;
    add(birthplaceId(`${rid}/c${wi}`), counties[li], 'town', counties[li].seat, li);
  }
  const villages = others.filter((wi) => !towns.includes(wi)).sort((a, b) => capDist2(a) - capDist2(b) || a - b).slice(0, MAX_VILLAGES);
  for (const wi of villages) {
    const li = localOf.get(wi)!;
    add(birthplaceId(`${rid}/c${wi}`), counties[li], 'village', counties[li].seat, li);
  }

  // Làng phụ trong quận lớn nhất khi chưa đủ làng
  const host = byArea[0] ?? capCounty;
  const hostLocal = localOf.get(host)!;
  let extra = 0;
  if (villages.length < MIN_VILLAGES) {
    const cand: { i: number; score: number }[] = [];
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        const wi = (y0 + y) * W + x0 + x;
        if (county[y * RW + x] !== hostLocal || !Number.isNaN(world.water[wi]) || world.elevation[wi] <= 0) continue;
        // Ưa ô thấp, gần dòng chảy lớn
        cand.push({ i: y * RW + x, score: Math.min(world.flow[wi], 50) - world.elevation[wi] * 20 });
      }
    }
    cand.sort((a, b) => b.score - a.score || a.i - b.i);
    for (const c of cand) {
      if (villages.length + extra >= MIN_VILLAGES) break;
      const cx = c.i % RW, cy = (c.i - cx) / RW;
      if (birthplaces.some((b) => Math.max(Math.abs(b.cell.x - cx), Math.abs(b.cell.y - cy)) < MIN_SPACING)) continue;
      extra++;
      add(birthplaceId(`${rid}/c${host}v${extra}`), fresh('city'), 'village', { x: cx, y: cy }, hostLocal);
    }
  }

  // —— Dữ liệu vẽ ——
  const translate = (pts: ArrayLike<number>) => Array.from(pts, (v, i) => (i % 2 === 0 ? v - x0 : v - y0));
  const touches = (pts: ArrayLike<number>) => {
    for (let i = 0; i + 1 < pts.length; i += 2) if (inBox(pts[i], pts[i + 1])) return true;
    return false;
  };
  const rivers: MapRiver[] = world.rivers
    .filter((rv) => touches(rv.points))
    .map((rv) => ({ points: Float32Array.from(translate(rv.points)), flow: rv.flow.slice() }));
  const roads: MapRoad[] = world.roads.filter((rd) => touches(rd.pts)).map((rd) => ({ kind: rd.kind, pts: translate(rd.pts) }));
  const labels: MapLabel[] = [];
  for (const l of world.labels) {
    if (l.kind === 'city' || l.kind === 'capital' || !inBox(l.x, l.y)) continue;
    const name = toHanViet(l.zh);
    if (!name) continue;
    const label: MapLabel = { kind: l.kind, name, x: l.x - x0, y: l.y - y0, angle: l.angle, weight: l.weight, span: l.span };
    if (l.path) label.path = translate(l.path);
    labels.push(label);
  }

  const map: RegionMapData = {
    W: RW,
    H: RH,
    origin: { x: x0, y: y0 },
    kmPerCell: world.kmPerCell,
    elevation: crop(world.elevation, (k) => new Float32Array(k)),
    water: crop(world.water, (k) => new Float32Array(k)),
    coastDist: crop(world.coastDist, (k) => new Float32Array(k)),
    flow: crop(world.flow, (k) => new Float32Array(k)),
    temperature: crop(world.temperature, (k) => new Float32Array(k)),
    biome: crop(world.biome, (k) => new Uint8Array(k)),
    mask,
    county,
    counties,
    rivers,
    roads,
    labels,
  };

  // —— Lớp logic ——
  const adjacency = countyAdjacency(county, RW, RH);
  const settlementKind: SettlementKind[] = chosen.map(() => 'village');
  for (const p of birthplaces) if (p.kind !== 'village') settlementKind[p.county] = p.kind;
  const seats = chosen.map((wi) => pol.counties[wi]);
  const seatKm = seats.map((a) => seats.map((b) => Math.round(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) * world.kmPerCell)));
  // Chỉ worldgen đọc mảng số thực. Sim nhận hệ số nguyên đã lưu, không đọc bản đồ vẽ.
  // Sông lớn = dòng chảy đủ để renderer vẽ thành sông (cùng ngưỡng); ngưỡng cũ 10 làm 91% cạnh bị tính là qua sông.
  const bigRiver = riverThreshold(world.W);
  const terrainPct = adjacency.map(([a, b]) => {
    const p = counties[a]!.seat, q = counties[b]!.seat;
    const steps = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y), 1);
    let mountain = false, river = false;
    for (let k = 0; k <= steps; k++) {
      const x = Math.round(p.x + (q.x - p.x) * k / steps);
      const y = Math.round(p.y + (q.y - p.y) * k / steps);
      const i = (y0 + y) * W + x0 + x;
      mountain ||= world.elevation[i]! >= 1; // độ cao km
      river ||= world.flow[i]! >= bigRiver;
    }
    return (mountain ? 200 : 100) * (river ? 150 : 100) / 100;
  });
  const fertilityPct = counties.map((_, c) => {
    let n = 0, elev = 0, temp = 0, river = 0;
    for (let i = 0; i < RW * RH; i++) {
      if (county[i] !== c || !mask[i] || !Number.isNaN(map.water[i]!)) continue;
      n++; elev += map.elevation[i]!; temp += map.temperature[i]!;
      if (map.flow[i]! >= bigRiver) river++;
    }
    if (n === 0) return 100;
    return fertilityOf(Math.round((elev / n) * 1000), Math.round((temp / n) * 10), Math.floor((river * 1000) / n));
  });
  const logic: RegionLogic = {
    kmPerCellMilli: Math.round(world.kmPerCell * 1000),
    counties: chosen.map((wi, li) => ({ worldIndex: wi, area: pol.counties[wi].area, seat: counties[li].seat, name: counties[li].name })),
    settlementKind,
    adjacency,
    terrainPct,
    seatKm,
    fertilityPct,
  };

  const landCells = chosen.reduce((s, wi) => s + pol.counties[wi].area, 0);
  const province = pol.provinces?.[pol.counties[capCounty].province ?? -1];
  const regionName = province ? named(province.zh, 'city') : capName;
  const realmName = toHanViet(realm.zh) ?? fresh('realm').name;
  const summary: RegionSummary = {
    id: rid,
    name: regionName.name,
    nameHan: regionName.nameHan,
    realmName,
    kmPerCell: world.kmPerCell,
    landKm2: Math.round(landCells * world.kmPerCell * world.kmPerCell),
  };

  return { worldSeed, summary, map, birthplaces, logic, placeVariant, worldMs: world.stats.ms };
}

/** Phần nhận dạng của vùng (chỉ số nguyên và chuỗi) để tính digest vùng: cùng seed ⇒ cùng vùng và cùng nơi sinh. */
export function regionIdentity(b: RegionBundle): {
  worldSeed: string; regionId: RegionId; placeVariant: number; origin: CellPos; size: [number, number];
  counties: [number, string, number, number][]; birthplaces: [string, string, string, SettlementKind, number, number, number][];
} {
  return {
    worldSeed: b.worldSeed,
    regionId: b.summary.id,
    placeVariant: b.placeVariant,
    origin: b.map.origin,
    size: [b.map.W, b.map.H],
    counties: b.map.counties.map((c, i) => [b.logic.counties[i]!.worldIndex, c.nameHan, c.seat.x, c.seat.y]),
    birthplaces: b.birthplaces.map((p) => [p.id, p.name, p.nameHan, p.kind, p.cell.x, p.cell.y, p.county]),
  };
}
