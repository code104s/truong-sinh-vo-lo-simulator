// Khối "Người trong quận" (v0.4 F1): sắp xếp, gập danh sách. Thuần, không có luật game: số liệu từ STATE.people.
import type { ContentId, HealthBand, NpcView, ReputationBand } from '@tsvl/shared';

/** Số người hiện khi danh sách gập; quận đông (trấn 20, thành 30) thì bấm xem hết. */
export const PEOPLE_PREVIEW = 8;

export type Tone = 'good' | 'warn' | 'bad';
export const healthTone = (band: HealthBand): Tone => (band === 'robust' || band === 'healthy' ? 'good' : band === 'weak' ? 'warn' : 'bad');

/**
 * Thứ tự trong khối: người lớn trước trẻ con, già trước trẻ (như ngồi chiếu trong làng); cùng tuổi thì theo id cho ổn
 * định giữa các tuần. Trả phần hiện và số người còn gập.
 */
export function peopleRows(people: readonly NpcView[], expanded: boolean): { shown: NpcView[]; hidden: number } {
  const sorted = [...people].sort((a, b) => b.ageYears - a.ageYears || Number(a.id.slice(1)) - Number(b.id.slice(1)));
  if (expanded || sorted.length <= PEOPLE_PREVIEW) return { shown: sorted, hidden: 0 };
  return { shown: sorted.slice(0, PEOPLE_PREVIEW), hidden: sorted.length - PEOPLE_PREVIEW };
}

// —— Người thân, người quen (v0.5 F1, ADR 0017, 0018): STATE.circle, mọi quận ——

/** Số người hiện khi khối gập: người thân luôn đứng đầu (sim đã sắp: cha, mẹ, vợ/chồng, con, anh chị em, rồi người quen). */
export const CIRCLE_PREVIEW = 6;

/** Giữ thứ tự sim gửi; gập còn `CIRCLE_PREVIEW` người. */
export function circleRows(circle: readonly NpcView[], expanded: boolean): { shown: NpcView[]; hidden: number } {
  if (expanded || circle.length <= CIRCLE_PREVIEW) return { shown: [...circle], hidden: 0 };
  return { shown: circle.slice(0, CIRCLE_PREVIEW), hidden: circle.length - CIRCLE_PREVIEW };
}

/** Khóa vai của một người với mình: vợ/chồng gọi theo giới; không phải người thân thì null. */
export function kinKey(p: Pick<NpcView, 'kin' | 'gender'>): ContentId | null {
  if (!p.kin) return null;
  if (p.kin === 'spouse') return p.gender === 'male' ? 'kin.husband' : 'kin.wife';
  return `kin.${p.kin}`;
}

/**
 * Nhãn quan hệ ngắn trên một dòng: vai nếu là người thân, không thì dải thân thiết; thêm thù hận, nợ ơn khi có (điều
 * đáng nhớ nhất về người ấy). Trả khóa nội dung theo thứ tự hiện.
 */
export function relationKeys(p: Pick<NpcView, 'kin' | 'gender' | 'bond'>): ContentId[] {
  const out: ContentId[] = [];
  const kin = kinKey(p);
  if (kin) out.push(kin);
  else if (p.bond) out.push(`bond.closeness.${p.bond.closeness}`);
  if (p.bond && p.bond.hostility !== 'none') out.push(`bond.hostility.${p.bond.hostility}`);
  if (p.bond && p.bond.owed !== 'none') out.push(`bond.owed.${p.bond.owed}`);
  return out;
}

/** Sắc của nhãn quan hệ: thù là xấu, nợ ơn mình là cảnh, còn lại thường. */
export function relationTone(key: ContentId): Tone | null {
  if (key.startsWith('bond.hostility.')) return 'bad';
  if (key === 'bond.owed.i_owe') return 'warn';
  return null;
}

/** Sắc của tiếng tăm (v0.5 F3): tiếng tốt xanh, bị chê vàng, khét tiếng đỏ, vô danh thường. */
export function reputationTone(band: ReputationBand): Tone | 'plain' {
  return band === 'respected' || band === 'renowned' ? 'good' : band === 'disliked' ? 'warn' : band === 'infamous' ? 'bad' : 'plain';
}
