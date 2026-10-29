// Thái độ của thế lực với người chơi (v0.7 S7, ADR 0020 Q9): mỗi thế lực một trục −100..100, giữ ở `playerAttitude`
// (không có là 0 — thế giới không người chơi không ghi gì). Đổi theo lựa chọn trong sự kiện thế lực và theo nghề (vào
// làm, ở lâu, bỏ đi); ảnh hưởng vào nghề (ghét thì không nhận), lương sai dịch, phần nộp hội, trọng số sự kiện thế lực.
// Không gộp với tiếng tăm theo quận. Thuần, tất định, không rút RNG.
import type { AttitudeBand, CareerId } from '@tsvl/shared';
import { clamp, idiv } from '../core/math';
import type { FactionState, FactionWorldState } from './state';

export const ATTITUDE_MAX = 100;
/** Dải: ghét từ −40 trở xuống, dè chừng −39..−10, thường −9..29, thân từ 30. */
export const HOSTILE_AT = -40;
export const WARY_AT = -10;
export const FRIENDLY_AT = 30;

export const attitudeOf = (f: FactionState): number => f.playerAttitude ?? 0;

/** Cộng dồn trong khoảng; về 0 thì bỏ trường (snapshot như chưa từng quen). */
export function shiftAttitude(f: FactionState | null | undefined, delta: number): void {
  if (!f || delta === 0) return;
  const v = clamp(attitudeOf(f) + delta, -ATTITUDE_MAX, ATTITUDE_MAX);
  if (v === 0) delete f.playerAttitude;
  else f.playerAttitude = v;
}

export function attitudeBand(v: number): AttitudeBand {
  return v <= HOSTILE_AT ? 'hostile' : v <= WARY_AT ? 'wary' : v < FRIENDLY_AT ? 'neutral' : 'friendly';
}
export const isHostile = (f: FactionState | null | undefined): boolean => !!f && attitudeOf(f) <= HOSTILE_AT;

/**
 * Trọng số sự kiện thế lực theo thái độ (%): chuyện có lợi (phát chẩn, rủ theo đoàn, dạm hỏi) đến nhiều hơn khi thế lực
 * thân; chuyện gây khó (bắt phu, sách nhiễu, cướp về làng, kiện ruộng) đến nhiều hơn khi thế lực ghét.
 */
export type EventTone = 'favor' | 'grudge';
export const EVENT_TONE_PCT: Readonly<Record<EventTone, Readonly<Record<AttitudeBand, number>>>> = {
  favor: { hostile: 50, wary: 75, neutral: 100, friendly: 150 },
  grudge: { hostile: 200, wary: 150, neutral: 100, friendly: 50 },
};
export const toneOf = (f: FactionState | null | undefined, tone: EventTone): number => (f ? EVENT_TONE_PCT[tone][attitudeBand(attitudeOf(f))] : 100);

/** Lương sai dịch theo thái độ quan phủ (%): 100 + thái độ / 5, trong khoảng ±10%. */
export const wageAttitudePct = (f: FactionState): number => 100 + clamp(idiv(attitudeOf(f), 5), -10, 10);
/** Phần lời nộp hội khi theo đoàn buôn (điểm %): hội thân bớt 5, hội dè chừng hay ghét thêm 5. */
export const CARAVAN_CUT_SHIFT = 5;
export function caravanCutPct(base: number, guild: FactionState): number {
  const b = attitudeBand(attitudeOf(guild));
  return b === 'friendly' ? base - CARAVAN_CUT_SHIFT : b === 'wary' || b === 'hostile' ? base + CARAVAN_CUT_SHIFT : base;
}

/** Lúc vào: sai dịch, hội viên +20 với thế lực nhận; theo cướp +30 với băng, −30 với quan phủ. */
export const JOIN_ATTITUDE = 20;
export const OUTLAW_JOIN_BAND = 30;
export const OUTLAW_JOIN_GOV = -30;
/** Bỏ đi: rời nha môn, rời hội −10; chuộc tội ra băng: quan phủ +20, băng −20; trốn băng: băng −40. */
export const LEAVE_ATTITUDE = -10;
export const ATONE_GOV = 20;
export const ATONE_BAND = -20;
export const DESERT_BAND = -40;
/** Mỗi quý ở trong thế lực: thân thêm 2 (tới 60). Người theo cướp: quan phủ ghét thêm 2 mỗi quý (tới −80). */
export const MEMBER_QUARTER = 2;
export const MEMBER_CAP = 60;
export const OUTLAW_GOV_QUARTER = -2;
export const OUTLAW_GOV_FLOOR = -80;

/** Thế lực nhận người chơi theo nghề (nha môn, hội, băng). */
const MEMBER_CAREERS: ReadonlySet<CareerId> = new Set(['soldier', 'merchant', 'outlaw']);

/** Đầu quý, sau pha Thế lực: người chơi ở trong thế lực thì thân dần; theo cướp thì quan phủ ghét dần. */
export function attitudeQuarter(fw: FactionWorldState, career: { id: CareerId; faction: string | null } | null): void {
  if (!career?.faction || !MEMBER_CAREERS.has(career.id)) return;
  const own = fw.list.find((f) => f.id === career.faction && f.ended === null);
  if (own && attitudeOf(own) < MEMBER_CAP) shiftAttitude(own, Math.min(MEMBER_QUARTER, MEMBER_CAP - attitudeOf(own)));
  if (career.id !== 'outlaw') return;
  const gov = fw.list.find((f) => f.kind === 'government' && f.ended === null);
  if (gov && attitudeOf(gov) > OUTLAW_GOV_FLOOR) shiftAttitude(gov, Math.max(OUTLAW_GOV_QUARTER, OUTLAW_GOV_FLOOR - attitudeOf(gov)));
}
