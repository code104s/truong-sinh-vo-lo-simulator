// Tu luyện và đột phá Luyện Khí tầng 1 (v0.8 S5, ADR 0022 Q7–Q9). Người đã có đường tu (đệ tử ký danh S3, tán tu S4) ngồi
// tu tích linh khí tới đỉnh, rồi đột phá vào tầng 1: một ô, rút một lần; tâm cảnh là dải tính từ trạng thái sẵn có. Hỏng
// thì thương kinh mạch, mất nửa linh khí, tâm cảnh tụt; nặng thì giảm thọ. Vào tầng 1 thì tu tiếp tới đỉnh tầng 1 rồi
// dừng (trần v0.8, Q1). Thuần, tất định; số linh khí không lộ ra view.
import { TICKS_PER_YEAR, ageYearsAt, type LogEntry, type RootBand, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { clamp, mulDiv } from '../core/math';
import type { Rng } from '../core/rng';
import type { CharacterState } from './character';
import { QI_PEAK, qiPlacePct, rootBand, TECHNIQUE_PCT, type CultivationState } from './cultivation';
import { computeHealthMax } from './health';
import { ILLNESSES } from './params';
import { MERIDIAN_ILLNESS } from './rogue';
import { fatiguePct } from './stamina';

type Log = (e: Omit<LogEntry, 'tick'>) => void;

// —— Tu luyện (Q7) ——

/**
 * Linh khí mỗi ô gốc, nhân dải linh căn (%), ngộ tính (50–150%), công pháp (tông môn 100, tán tu 60), linh khí nơi ở,
 * linh thạch; chia mệt. Linh căn khá, ngộ tính vừa, công pháp tông môn, ở làng: 120 mỗi ô — đỉnh 10.000 là 84 ô, tu một
 * nửa số ô (18 trong 36 ô một năm) thì khoảng 4,6 năm (Q7: 3–6 năm). S6 sửa: S5 tính nhầm 54 ô một năm.
 */
export const QI_PER_SLOT = 120;
export const QI_ROOT_PCT: Readonly<Record<Exclude<RootBand, 'none'>, number>> = { mixed: 20, fair: 100, good: 170 };
/** Đốt một khối linh thạch mỗi ô thì nhanh hơn; giữ lại chừng này khối cho lúc đột phá. */
export const STONE_QI_PCT = 150;
export const BREAKTHROUGH_STONES = 3;

/** Đỉnh của tầng đang tu: người phàm tu tới đỉnh để đột phá vào tầng 1; tầng 1 tu tới đỉnh tầng 1 (trần v0.8). */
export const qiPeakOf = (cult: CultivationState) => QI_PEAK[cult.realm === 'mortal' ? 'qi1' : cult.realm];

export function cultivateLock(c: CharacterState, cult: CultivationState): string | null {
  if (!cult.path) return 'lock.no_path';
  if (c.conditions.some((x) => x.id === MERIDIAN_ILLNESS)) return 'lock.meridian';
  if (cult.qi < qiPeakOf(cult)) return null;
  return cult.realm === 'mortal' ? 'lock.qi_peak' : 'lock.realm_cap';
}

/** Linh khí một ô (chưa tính linh thạch). */
export function qiPerSlot(c: CharacterState, cult: CultivationState, logic: RegionLogic, tick: Tick): number {
  const band = rootBand(c.spiritRoot);
  if (band === 'none' || !cult.path) return 0;
  let qi = mulDiv(QI_PER_SLOT, QI_ROOT_PCT[band], 100);
  qi = mulDiv(qi, 50 + c.aptitude * 10, 100);
  qi = mulDiv(qi, TECHNIQUE_PCT[cult.path], 100);
  qi = mulDiv(qi, qiPlacePct(logic, c.location), 100);
  return Math.max(1, mulDiv(qi, 100, fatiguePct(c, tick)));
}

/** Một ô tu luyện: tích linh khí, không vượt đỉnh; còn dư linh thạch (ngoài phần giữ cho đột phá) thì đốt một khối. */
export function cultivate(c: CharacterState, cult: CultivationState, logic: RegionLogic, tick: Tick, log: Log): void {
  if (cultivateLock(c, cult)) return;
  let qi = qiPerSlot(c, cult, logic, tick);
  if (cult.stones > BREAKTHROUGH_STONES) { cult.stones--; qi = mulDiv(qi, STONE_QI_PCT, 100); }
  cult.secluded++;
  const peak = qiPeakOf(cult);
  cult.qi = Math.min(peak, cult.qi + qi);
  if (cult.qi >= peak) log({ key: cult.realm === 'mortal' ? 'log.cultivate.peak' : 'log.cultivate.cap', params: {}, importance: 'major' });
}

/**
 * Giá với phàm giới (S6, Q10): năm nào tu từ chừng này ô trở lên (một nửa số ô cả năm) thì đầu năm sau quan hệ phai thêm
 * một lượt, như người lưu lạc.
 */
export const SECLUSION_FADE_SLOTS = TICKS_PER_YEAR / 2;

// —— Tâm cảnh (Q8): dải tính từ trạng thái sẵn có, không thêm chỉ số ẩn ——

export type Mind = 'calm' | 'steady' | 'troubled' | 'shaken';
const CALM_PERSONALITIES: ReadonlySet<string> = new Set(['calm', 'aloof']);
const RESTLESS_PERSONALITIES: ReadonlySet<string> = new Set(['hot_tempered', 'greedy', 'ambitious']);
/** Đột phá hỏng trong chừng này tick thì tâm cảnh tụt (Q8: không thử lại ngay). */
export const FAIL_SHAKEN_TICKS = TICKS_PER_YEAR;

/** `mourning`: người thân gần mất trong năm (pha người chơi tính từ danh sách NPC). */
export function mindOf(c: CharacterState, cult: CultivationState, tick: Tick, mourning: boolean): Mind {
  let score = CALM_PERSONALITIES.has(c.personality) ? 1 : RESTLESS_PERSONALITIES.has(c.personality) ? -1 : 0;
  if (c.household.hunger > 0) score--;
  if (c.conditions.length > 0) score--;
  if (mourning) score--;
  const last = cult.breakthroughs.at(-1);
  if (last && !last.ok && tick - last.at < FAIL_SHAKEN_TICKS) score -= 3;
  return score >= 1 ? 'calm' : score === 0 ? 'steady' : score === -1 ? 'troubled' : 'shaken';
}

// —— Đột phá (Q8) ——

export const BREAKTHROUGH_BASE_PPM = 500_000;
export const MIND_PPM: Readonly<Record<Exclude<Mind, 'shaken'>, number>> = { calm: 100_000, steady: 0, troubled: -150_000 };
export const STONE_BREAKTHROUGH_PPM = 50_000;
/** Từ 30 tuổi mỗi năm trừ chừng này, tối đa trừ 300.000. */
export const AGE_FROM = 30;
export const AGE_PPM_PER_YEAR = 15_000;
export const AGE_PPM_MAX = 300_000;
/** Tán tu không thầy hộ pháp. */
export const ROGUE_BREAKTHROUGH_PPM = -30_000;
export const BREAKTHROUGH_PPM_RANGE = [50_000, 900_000] as const;
/** Hỏng nặng (phần trong số lần hỏng): tổn thọ. */
export const SEVERE_FAIL_PPM = 100_000;
export const SEVERE_LIFESPAN_TICKS = 3 * TICKS_PER_YEAR;
/** Tầng 1 (Q9): thọ +5 năm; thân thể đổi (nét ẩn `qi_body`: sức khỏe tối đa +100, ít bệnh, hồi sức nhanh). */
export const QI1_LIFESPAN_TICKS = 5 * TICKS_PER_YEAR;
export const QI_BODY = 'qi_body';

export function breakthroughLock(c: CharacterState, cult: CultivationState, tick: Tick, mourning: boolean): string | null {
  if (!cult.path) return 'lock.no_path';
  if (cult.realm !== 'mortal') return 'lock.realm_cap';
  if (cult.qi < qiPeakOf(cult)) return 'lock.qi_not_peak';
  if (c.conditions.some((x) => x.id === MERIDIAN_ILLNESS)) return 'lock.meridian';
  return mindOf(c, cult, tick, mourning) === 'shaken' ? 'lock.unsettled' : null;
}

/** Số linh thạch sẽ dùng khi đột phá. */
export const stonesFor = (cult: CultivationState) => Math.min(BREAKTHROUGH_STONES, cult.stones);

export function breakthroughPpm(c: CharacterState, cult: CultivationState, tick: Tick, mourning: boolean): number {
  const mind = mindOf(c, cult, tick, mourning);
  if (mind === 'shaken') return 0;
  let ppm = BREAKTHROUGH_BASE_PPM + MIND_PPM[mind] + stonesFor(cult) * STONE_BREAKTHROUGH_PPM;
  ppm -= Math.min(AGE_PPM_MAX, Math.max(0, ageYearsAt(c.birthTick, tick) - AGE_FROM) * AGE_PPM_PER_YEAR);
  if (cult.path === 'rogue') ppm += ROGUE_BREAKTHROUGH_PPM;
  return clamp(ppm, BREAKTHROUGH_PPM_RANGE[0], BREAKTHROUGH_PPM_RANGE[1]);
}

const MERIDIAN = ILLNESSES.find((d) => `illness.${d.id}` === MERIDIAN_ILLNESS)!;
export type BreakthroughResult = 'ok' | 'failed' | 'severe';

/**
 * Một ô đột phá, một lần rút. Linh thạch giữ cho đột phá dùng hết dù thành hay hỏng. Thành: vào tầng 1, linh khí về 0
 * (tu tiếp tới đỉnh tầng 1), thọ +5 năm, thân thể đổi. Hỏng: thương kinh mạch (nếu chưa mang bệnh), linh khí còn nửa
 * đỉnh, tâm cảnh tụt một năm; hỏng nặng thì tổn thọ ba năm.
 */
export function breakthrough(c: CharacterState, cult: CultivationState, tick: Tick, mourning: boolean, rng: Rng, log: Log): BreakthroughResult | null {
  if (breakthroughLock(c, cult, tick, mourning)) return null;
  const ppm = breakthroughPpm(c, cult, tick, mourning);
  cult.stones -= stonesFor(cult);
  if (rng.chance(ppm)) {
    cult.realm = 'qi1'; cult.entered = tick; cult.qi = 0;
    cult.breakthroughs.push({ at: tick, ok: true });
    c.lifespanBonus += QI1_LIFESPAN_TICKS;
    if (!c.traits.includes(QI_BODY)) c.traits.push(QI_BODY);
    c.healthMax = computeHealthMax(c, tick);
    log({ key: 'log.breakthrough.ok', params: {}, importance: 'major' });
    return 'ok';
  }
  cult.breakthroughs.push({ at: tick, ok: false });
  cult.qi = Math.floor(qiPeakOf(cult) / 2);
  if (!c.conditions.some((x) => x.kind === 'illness')) c.conditions.push({ id: MERIDIAN_ILLNESS, kind: 'illness', severity: MERIDIAN.severity, weeksLeft: rng.int(MERIDIAN.weeks[0], MERIDIAN.weeks[1]) });
  if (rng.chance(SEVERE_FAIL_PPM)) {
    c.lifespanBonus -= SEVERE_LIFESPAN_TICKS;
    log({ key: 'log.breakthrough.severe', params: {}, importance: 'major' });
    return 'severe';
  }
  log({ key: 'log.breakthrough.failed', params: {}, importance: 'major' });
  return 'failed';
}
