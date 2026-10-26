// Vùng chơi, nơi sinh và dữ liệu vẽ bản đồ (ADR 0001, 0007).
import { arr, brand, int, intRange, nat, nonEmpty, num, obj, oneOf, opt, str, f32, i16, u8, type Validator } from './schema';

/** Seed thế giới người chơi thấy (vd. "tsvl-01"). worldgen nhận nguyên chuỗi. */
export type WorldSeed = string;
/** Vùng chơi, dạng "r<realmIndex>". v0.1 mỗi thế giới một vùng. */
export type RegionId = string & { readonly __brand: 'RegionId' };
/** Nơi sinh, ổn định với cùng seed: "<regionId>/c<countyIndex>" hoặc "<regionId>/c<countyIndex>v<n>". */
export type BirthplaceId = string & { readonly __brand: 'BirthplaceId' };

export const REGION_ID_RE = /^r\d+$/;
export const BIRTHPLACE_ID_RE = /^r\d+\/c\d+(v\d+)?$/;
export const regionId = (s: string) => {
  if (!REGION_ID_RE.test(s)) throw new Error(`RegionId sai: ${s}`);
  return s as RegionId;
};
export const birthplaceId = (s: string) => {
  if (!BIRTHPLACE_ID_RE.test(s)) throw new Error(`BirthplaceId sai: ${s}`);
  return s as BirthplaceId;
};

export interface NewLifeConfig {
  worldSeed: WorldSeed;
  regionId: RegionId;
  birthplaceId: BirthplaceId;
  /** Seed riêng của đời, u32 (Q5). Bỏ trống thì sim suy ra từ worldSeed + birthplaceId. */
  lifeSeed?: number;
}

export const SETTLEMENT_KINDS = ['village', 'town', 'city'] as const;
/** làng / trấn / thành */
export type SettlementKind = (typeof SETTLEMENT_KINDS)[number];

export interface CellPos {
  x: number;
  y: number;
}

export interface Birthplace {
  id: BirthplaceId;
  /** Tên Hán-Việt, vd. "Vị Kinh". */
  name: string;
  /** Tên chữ Hán gốc từ Cartographer, vd. "渭京". */
  nameHan: string;
  kind: SettlementKind;
  /** Ô trong RegionMapData (số nguyên, gốc ở góc trên trái của vùng). */
  cell: CellPos;
  /** Chỉ số quận trong RegionMapData.counties. */
  county: number;
}

export interface RegionSummary {
  id: RegionId;
  /** Hán-Việt */
  name: string;
  nameHan: string;
  /** Tên nước, Hán-Việt */
  realmName: string;
  /** Chỉ để hiển thị thước tỉ lệ. */
  kmPerCell: number;
  landKm2: number;
}

export interface MapLabel {
  kind: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  weight: number;
  span: number;
  path?: number[];
}

export interface MapRoad {
  kind: 'major' | 'minor' | 'sea';
  pts: number[];
}

export interface MapRiver {
  points: Float32Array;
  flow: Float32Array;
}

export interface MapCounty {
  name: string;
  nameHan: string;
  seat: CellPos;
}

/**
 * Dữ liệu chỉ để VẼ. Số thực được phép; sim không đọc lại từ đây và digest sim không gồm nó.
 * Mọi mảng theo ô dài W*H, chỉ số y*W + x.
 */
export interface RegionMapData {
  W: number;
  H: number;
  /** Góc trên trái của vùng trong thế giới gốc (ô). */
  origin: CellPos;
  kmPerCell: number;
  elevation: Float32Array;
  /** Mặt nước: biển 0, hồ = mặt hồ, đất liền NaN. */
  water: Float32Array;
  coastDist: Float32Array;
  flow: Float32Array;
  temperature: Float32Array;
  biome: Uint8Array;
  /** 1 = ô thuộc vùng chơi, 0 = ngoài vùng. */
  mask: Uint8Array;
  /** Chỉ số quận theo ô, -1 ngoài vùng hoặc biển. */
  county: Int16Array;
  counties: MapCounty[];
  rivers: MapRiver[];
  roads: MapRoad[];
  /** Nhãn địa lý (núi, hồ, sông…) đã đổi sang Hán-Việt, toạ độ theo vùng. */
  labels: MapLabel[];
}

export const vWorldSeed: Validator<WorldSeed> = nonEmpty;
export const vRegionId = brand<RegionId>(REGION_ID_RE);
export const vBirthplaceId = brand<BirthplaceId>(BIRTHPLACE_ID_RE);
export const vU32 = intRange(0, 0xffffffff);

export const vNewLifeConfig = obj<NewLifeConfig>({
  worldSeed: vWorldSeed,
  regionId: vRegionId,
  birthplaceId: vBirthplaceId,
  lifeSeed: opt(vU32),
});

const vCell = obj<CellPos>({ x: nat, y: nat });

export const vBirthplace = obj<Birthplace>({
  id: vBirthplaceId,
  name: nonEmpty,
  nameHan: nonEmpty,
  kind: oneOf(SETTLEMENT_KINDS),
  cell: vCell,
  county: nat,
});

export const vRegionSummary = obj<RegionSummary>({
  id: vRegionId,
  name: nonEmpty,
  nameHan: nonEmpty,
  realmName: nonEmpty,
  kmPerCell: num,
  landKm2: nat,
});

const vLabel = obj<MapLabel>({
  kind: nonEmpty,
  name: str,
  x: num,
  y: num,
  angle: num,
  weight: num,
  span: num,
  path: opt(arr(num)),
});

export const vRegionMapData: Validator<RegionMapData> = (() => {
  const base = obj<RegionMapData>({
    W: nat,
    H: nat,
    origin: obj<CellPos>({ x: int, y: int }),
    kmPerCell: num,
    elevation: f32,
    water: f32,
    coastDist: f32,
    flow: f32,
    temperature: f32,
    biome: u8,
    mask: u8,
    county: i16,
    counties: arr(obj<MapCounty>({ name: nonEmpty, nameHan: nonEmpty, seat: vCell })),
    rivers: arr(obj<MapRiver>({ points: f32, flow: f32 })),
    roads: arr(obj<MapRoad>({ kind: oneOf(['major', 'minor', 'sea'] as const), pts: arr(num) })),
    labels: arr(vLabel),
  });
  return {
    check: (u, p) => {
      const e = base.check(u, p);
      if (e) return e;
      const m = u as RegionMapData;
      const n = m.W * m.H;
      for (const k of ['elevation', 'water', 'coastDist', 'flow', 'temperature', 'biome', 'mask', 'county'] as const) {
        if (m[k].length !== n) return `${p}.${k}: dài ${m[k].length}, cần W*H = ${n}`;
      }
      return null;
    },
  };
})();
