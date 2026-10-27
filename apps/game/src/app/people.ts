// Khối "Người trong quận" (v0.4 F1): sắp xếp, gập danh sách. Thuần, không có luật game: số liệu từ STATE.people.
import type { HealthBand, NpcView } from '@tsvl/shared';

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
