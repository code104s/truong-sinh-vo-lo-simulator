// Màn tổng kết (F5): rút các ngã rẽ từ những mốc lớn. Khóa kết quả sự kiện là `<id sự kiện>.result.<kết quả>`
// (ADR 0014), nên tách được id sự kiện để ghi tựa. Không có luật game.
import { ageYearsAt, type ContentId, type FactionFate, type Gender, type LifeSummary, type LogEntry, type Tick } from '@tsvl/shared';

const RESULT = '.result.';

/** Id sự kiện của một dòng kết quả lựa chọn; null nếu không phải. */
export function eventOf(e: LogEntry): string | null {
  const at = e.key.indexOf(RESULT);
  return e.key.startsWith('event.') && at > 0 ? e.key.slice(0, at) : null;
}

export interface TurningPoint { entry: LogEntry; eventId: string; age: number }

/** Ngã rẽ: mọi lựa chọn sự kiện đã chọn trong đời, theo thứ tự thời gian. */
export function turningPoints(milestones: readonly LogEntry[], birthTick: Tick): TurningPoint[] {
  const out: TurningPoint[] = [];
  for (const entry of milestones) {
    const eventId = eventOf(entry);
    if (eventId) out.push({ entry, eventId, age: ageYearsAt(birthTick, entry.tick) });
  }
  return out;
}

export interface Departed { entry: LogEntry; name: string; age: number; playerAge: number }

/**
 * Những người đã đi trước (v0.4 F4): người quen (đã gặp qua sự kiện) mất trong đời người chơi, và người thân mất (v0.5
 * F4: cha mẹ, vợ/chồng, con, anh chị em). Tin mất của họ là mốc lớn, nên lấy từ những mốc lớn; người chưa quen chỉ là
 * việc thường ngày, không vào đây.
 */
export function departedPeople(milestones: readonly LogEntry[], birthTick: Tick): Departed[] {
  return milestones
    .filter((e) => (e.key === 'log.npc.death' || e.key === 'log.kin.death') && e.importance === 'major')
    .map((entry) => ({ entry, name: String(entry.params.name), age: Number(entry.params.age), playerAge: ageYearsAt(birthTick, entry.tick) }));
}

/** Một dòng di sản (v0.5 F4): nhãn, giá trị đã dịch sẵn dạng khóa + tham số, và dòng phụ (tên con còn sống). */
export interface LegacyRow { label: ContentId; value: ContentId; params?: Record<string, string | number>; note?: string; tone?: 'good' | 'warn' | 'bad' }

/**
 * Di sản (v0.5 F4, ADR 0017, 0018): vợ/chồng, con cái, bạn, kẻ thù, tiếng tăm quê nhà. Vợ hay chồng gọi theo giới người
 * chơi (người chơi nữ thì người kia là chồng — hôn nhân chỉ nam–nữ, Q3); không rõ giới thì "Vợ/chồng".
 */
export function legacyRows(legacy: LifeSummary['legacy'], gender: Gender | null): LegacyRow[] {
  const spouseLabel = gender === 'male' ? 'ui.summary.wife' : gender === 'female' ? 'ui.summary.husband' : 'ui.summary.spouse';
  const sp = legacy.spouse;
  const alive = legacy.children.filter((c) => c.alive);
  const rep = legacy.reputation;
  return [
    sp ? { label: spouseLabel, value: sp.alive ? 'ui.summary.name' : 'ui.summary.name_dead', params: { name: sp.name } } : { label: spouseLabel, value: 'ui.summary.spouse_none' },
    legacy.children.length
      ? { label: 'ui.summary.children', value: 'ui.summary.children_count', params: { alive: alive.length, total: legacy.children.length }, ...(alive.length ? { note: alive.map((c) => c.name).join(', ') } : {}) }
      : { label: 'ui.summary.children', value: 'ui.summary.children_none' },
    { label: 'ui.summary.friends', value: 'ui.summary.people_count', params: { count: legacy.friends } },
    { label: 'ui.summary.enemies', value: 'ui.summary.people_count', params: { count: legacy.enemies }, ...(legacy.enemies > 0 ? { tone: 'bad' as const } : {}) },
    {
      label: 'ui.summary.reputation', value: `reputation.${rep}`,
      ...(rep === 'respected' || rep === 'renowned' ? { tone: 'good' as const } : rep === 'disliked' ? { tone: 'warn' as const } : rep === 'infamous' ? { tone: 'bad' as const } : {}),
    },
  ];
}

/** Thứ tự số phận trong "Thế sự một đời" (v0.6 F4): tan rã, thịnh lên, suy đi, vẫn đứng. */
const FATE_ORDER: Record<FactionFate, number> = { gone: 0, rose: 1, fell: 2, endured: 3 };
export type AffairsRow = LifeSummary['legacy']['factions'][number];

/** Thế lực đã thấy trong đời theo số phận; cùng số phận thì theo thứ tự thấy lần đầu (sim gửi). */
export function affairsRows(factions: LifeSummary['legacy']['factions']): AffairsRow[] {
  return factions.map((f, i) => ({ f, i })).sort((a, b) => FATE_ORDER[a.f.fate] - FATE_ORDER[b.f.fate] || a.i - b.i).map(({ f }) => f);
}

