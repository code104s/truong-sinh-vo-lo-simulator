// Đường tu của người chơi (v0.8, ADR 0022): cảnh giới, linh căn đã kiểm, đường vào, linh khí, các lần đột phá; linh khí
// nơi ở theo bản đồ. Bước 0: chỉ trạng thái và phép chiếu (luôn phàm nhân, chưa kiểm); luật ở S1–S5. Thuần, tất định.
import type { CultivationPath, CultivationRecord, CultivationView, QiBand, QiPlaceBand, Realm, RootBand, SiteView, Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import type { SpiritRoot } from './character';
import { hash32 } from '../core/hash';
import { mountainCounty } from './wayward';

export interface CultivationState {
  realm: Realm;
  /** Dải linh căn khi đã được kiểm (Q4); null là chưa kiểm. Linh căn thật nằm ở `CharacterState.spiritRoot` (ẩn). */
  root: RootBand | null;
  path: CultivationPath | null;
  /** Linh khí đã tích ở tầng đang tu (ẩn, chỉ gửi dải). */
  qi: number;
  /** Tick dẫn khí nhập thể (vào tầng 1). */
  entered: Tick | null;
  breakthroughs: { at: Tick; ok: boolean }[];
  /** Linh thạch hạ phẩm (S3): cấp phát tông môn, cơ duyên; không phải tiền, không vào sổ cái (Q11). */
  stones: number;
  /** Đệ tử ký danh còn tên trong sổ (S3): tuần tạp dịch năm nay, số năm liền bỏ nghĩa vụ, lúc vào; null là không (chưa vào, tán tu, bị gạch tên). */
  duty: { weeks: number; missed: number; since: Tick } | null;
  /** Ô tu luyện trong năm nay (S6): tu nhiều thì ít thời gian cho người thân, quan hệ phai nhanh hơn; đầu năm đặt lại. */
  secluded: number;
  /**
   * Quận có di tích, miếu mà người chơi từng đặt chân tới (F3), xếp tăng dần: người ở đó ai cũng biết ngôi miếu, hang đá
   * cũ trong núi. Thiếu là chưa biết chốn nào (save trước F3).
   */
  seen?: number[];
}

export const newCultivation = (): CultivationState => ({ realm: 'mortal', root: null, path: null, qi: 0, entered: null, breakthroughs: [], stones: 0, duty: null, secluded: 0 });

/** Linh khí tới đỉnh mỗi tầng (giá trị tạm, chốt ở S5 theo Q7: linh căn khá, tu một nửa số ô, tới đỉnh trong 3–6 năm). */
export const QI_PEAK: Readonly<Record<Realm, number>> = { mortal: 0, qi1: 10_000 };

/** Công pháp theo đường vào (Q6, Q7): công pháp nhập môn của tông môn 100%, công pháp thô của tán tu 60% — S5 nhân vào linh khí mỗi ô. */
export const TECHNIQUE_PCT: Readonly<Record<CultivationPath, number>> = { sect: 100, rogue: 60 };

/** Dải linh khí: chưa có, ít, nửa, gần đỉnh (từ 3/4), đỉnh. */
export function qiBand(qi: number, peak: number): QiBand {
  if (peak <= 0 || qi <= 0) return 'empty';
  if (qi >= peak) return 'peak';
  const quarter = Math.floor((qi * 4) / peak);
  return quarter >= 3 ? 'high' : quarter >= 2 ? 'half' : 'low';
}

/** Đường tu như người chơi thấy; chưa dẫn khí thì không có dải linh khí. */
export function cultivationView(s: CultivationState): CultivationView {
  return { realm: s.realm, root: s.root, path: s.path, qi: s.path ? qiBand(s.qi, QI_PEAK[s.realm === 'mortal' ? 'qi1' : s.realm]) : null };
}

/**
 * Dải linh căn khi được kiểm (S2, Q4): độ thuần trừ 15 mỗi hệ thêm (một hệ là thuần nhất); từ 55 là tốt, từ 25 là khá,
 * dưới nữa là tạp. Không có linh căn thì "không có" — kiểm cách nào, bao nhiêu lần cũng vậy. Không lộ số.
 */
export const ROOT_PER_ELEMENT = 15;
export const ROOT_GOOD_AT = 55;
export const ROOT_FAIR_AT = 25;
export function rootBand(r: SpiritRoot | null): RootBand {
  if (!r) return 'none';
  const q = r.purity - (r.elements.length - 1) * ROOT_PER_ELEMENT;
  return q >= ROOT_GOOD_AT ? 'good' : q >= ROOT_FAIR_AT ? 'fair' : 'mixed';
}

/** Kiểm linh căn (đá thử, tu sĩ, ẩn sĩ, kỳ tuyển): ghi dải vào đường tu, nhớ cả đời; đã kiểm thì giữ kết quả cũ. */
export function testRoot(s: CultivationState, spiritRoot: SpiritRoot | null): RootBand {
  s.root ??= rootBand(spiritRoot);
  return s.root;
}

/** Một đời tu cho tổng kết (F4). */
export function legacyCultivation(s: CultivationState): CultivationRecord {
  return { root: s.root, realm: s.realm, path: s.path, ...(s.entered === null ? {} : { entered: s.entered }), breakthroughs: s.breakthroughs.map((b) => ({ ...b })) };
}

/**
 * Chốn tìm cơ duyên (S1, Q3), suy từ bản đồ có sẵn (băm số hiệu quận trong thế giới, không rút RNG, không lưu):
 * - **di tích** (hang đá cũ) chỉ ở quận có đường núi: một nửa số quận núi, ít nhất một nếu vùng có núi;
 * - **miếu** ở làng, trấn: một phần ba số quận ấy, ít nhất một.
 * Thành không có miếu thờ thần núi; vùng không núi thì không có di tích.
 */
export type Site = 'ruin' | 'shrine';
export interface Sites { ruins: readonly number[]; shrines: readonly number[] }
const sitesCache = new WeakMap<RegionLogic, Sites>();
function pickSites(logic: RegionLogic, tag: string, eligible: (k: number) => boolean, every: number): number[] {
  const pool = logic.counties.map((c, k) => ({ k, h: hash32(tag, c.worldIndex) })).filter((x) => eligible(x.k));
  if (!pool.length) return [];
  const chosen = pool.filter((x) => x.h % every === 0).map((x) => x.k);
  // Ít nhất một chốn: quận có số băm nhỏ nhất (tất định, không phụ thuộc thứ tự quận)
  return chosen.length ? chosen : [pool.reduce((a, b) => (b.h < a.h ? b : a)).k];
}
export function sitesOf(logic: RegionLogic): Sites {
  let s = sitesCache.get(logic);
  if (!s) {
    s = {
      ruins: pickSites(logic, 'ruin', (k) => mountainCounty(logic, k), 2),
      shrines: pickSites(logic, 'shrine', (k) => logic.settlementKind[k] !== 'city', 3),
    };
    sitesCache.set(logic, s);
  }
  return s;
}
/** Quận có chốn ấy không (một quận có thể có cả di tích lẫn miếu). */
export function hasSite(logic: RegionLogic, county: number, site: Site): boolean {
  const s = sitesOf(logic);
  return (site === 'ruin' ? s.ruins : s.shrines).includes(county);
}

/** Đặt chân tới quận có chốn (F3): ghi vào danh sách đã biết, giữ thứ tự tăng dần. */
export function noteSites(s: CultivationState, logic: RegionLogic, county: number): void {
  if (!hasSite(logic, county, 'ruin') && !hasSite(logic, county, 'shrine')) return;
  const seen = (s.seen ??= []);
  if (seen.includes(county)) return;
  seen.push(county);
  seen.sort((a, b) => a - b);
}

/** Chốn đã biết như người chơi thấy (F3): theo quận, di tích trước miếu. */
export function knownSites(s: CultivationState, logic: RegionLogic): SiteView[] {
  const out: SiteView[] = [];
  for (const county of s.seen ?? []) {
    if (hasSite(logic, county, 'ruin')) out.push({ county, kind: 'ruin' });
    if (hasSite(logic, county, 'shrine')) out.push({ county, kind: 'shrine' });
  }
  return out;
}

/**
 * Linh khí nơi ở (%, Q7): thành 80, trấn 90, làng 100; quận có đường núi 120; quận có di tích 150. Suy từ bản đồ có sẵn,
 * không lưu, không sinh lại bản đồ.
 */
export const QI_PLACE_PCT = { city: 80, town: 90, village: 100, mountain: 120, ruin: 150 } as const;
export function qiPlacePct(logic: RegionLogic, county: number): number {
  if (sitesOf(logic).ruins.includes(county)) return QI_PLACE_PCT.ruin;
  return mountainCounty(logic, county) ? QI_PLACE_PCT.mountain : QI_PLACE_PCT[logic.settlementKind[county]!];
}

/** Dải linh khí nơi ở (F2): dưới gốc làng là loãng, bằng là thường, trên là dồi dào, từ mức di tích là đậm đặc. */
export function qiPlaceBand(pct: number): QiPlaceBand {
  return pct < QI_PLACE_PCT.village ? 'thin' : pct === QI_PLACE_PCT.village ? 'common' : pct < QI_PLACE_PCT.ruin ? 'rich' : 'dense';
}

/** Tìm cơ duyên (S1): vào núi sâu ở quận có đường núi, hay thăm miếu; nơi khác không có chỗ tìm. */
export function seekLock(logic: RegionLogic, county: number): string | null {
  return mountainCounty(logic, county) || hasSite(logic, county, 'shrine') ? null : 'lock.no_seek_place';
}
