// Màn tổng kết (F5): rút các ngã rẽ từ những mốc lớn. Khóa kết quả sự kiện là `<id sự kiện>.result.<kết quả>`
// (ADR 0014), nên tách được id sự kiện để ghi tựa. Không có luật game.
import { ageYearsAt, CAREER_RANKS, type CareerId, type CareerRank, type ContentId, type CultivationRecord, type FactionFate, type Gender, type LifeSummary, type LogEntry, type Realm, type Tick } from '@tsvl/shared';
import { isDaoNews } from './chronicle';

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


/** Một nghề trong "Một đời làm nghề" (v0.7 F4): gộp các lần vào cùng nghề. */
export interface CareerRow { id: CareerId; rank: CareerRank; years: number; stints: number; current: boolean }

/**
 * Một đời làm nghề (v0.7 F4): mỗi nghề một dòng theo thứ tự vào nghề lần đầu; vào lại nghề cũ thì gộp — bậc cao nhất, cộng
 * số năm, đếm số lần vào; nghề còn làm tới lúc nhắm mắt ghi riêng.
 */
export function careerRows(careers: LifeSummary['legacy']['careers']): CareerRow[] {
  const rows: CareerRow[] = [];
  for (const r of careers) {
    const row = rows.find((x) => x.id === r.id);
    if (!row) { rows.push({ id: r.id, rank: r.rank, years: r.years, stints: 1, current: !!r.current }); continue; }
    if (CAREER_RANKS.indexOf(r.rank) > CAREER_RANKS.indexOf(row.rank)) row.rank = r.rank;
    row.years += r.years; row.stints++; row.current ||= !!r.current;
  }
  return rows;
}

/** Nghề của cả đời, ghi dưới tên trên bia: nghề làm lâu nhất; bằng năm thì nghề còn làm tới cuối, rồi nghề vào sau. */
export function lifeCareer(rows: readonly CareerRow[]): CareerRow | null {
  let best: CareerRow | null = null;
  for (const r of rows) if (!best || r.years > best.years || (r.years === best.years && (r.current || !best.current))) best = r;
  return best;
}

/** Đời tu chạm tới đâu (v0.8 F4): chưa kiểm; kiểm ra không có; có linh căn mà không bước vào; đã dẫn khí; đã phá cảnh. */
export type DaoReach = 'untested' | 'no_root' | 'outside' | 'entered' | 'risen';

export interface DaoSummary {
  reach: DaoReach;
  /** Khóa dải linh căn, hay "chưa từng được kiểm". */
  root: ContentId;
  /** Khóa đường vào, hay "chưa bước vào". */
  path: ContentId;
  realm: Realm;
  /** Tuổi dẫn khí nhập thể (vào tầng một); null khi chưa. */
  enteredAge: number | null;
  /** Các lần đột phá theo thứ tự, tuổi lúc ấy. */
  attempts: { age: number; ok: boolean }[];
}

/** Khối "Đường tu" ở bia đời (F4): chạm ngưỡng hay không, linh căn đã biết hay chưa, đường, cảnh giới, các lần đột phá. */
export function daoSummary(rec: CultivationRecord, birthTick: Tick): DaoSummary {
  const reach: DaoReach = rec.realm !== 'mortal' ? 'risen' : rec.path ? 'entered' : rec.root === 'none' ? 'no_root' : rec.root ? 'outside' : 'untested';
  return {
    reach,
    root: rec.root ? `root.${rec.root}` : 'ui.dao.root_unknown',
    path: rec.path ? `cultivation.path.${rec.path}` : 'ui.summary.dao_no_path',
    realm: rec.realm,
    enteredAge: rec.entered === undefined ? null : ageYearsAt(birthTick, rec.entered),
    attempts: rec.breakthroughs.map((b) => ({ age: ageYearsAt(birthTick, b.at), ok: b.ok })),
  };
}

/** Câu tóm đời tu ở đầu khối (F4). */
export function daoReachLine(d: DaoSummary): { key: ContentId; params: Record<string, string | number> } {
  const key = `ui.summary.dao_reach.${d.reach}`;
  return d.reach === 'risen' ? { key, params: { realm: `realm.${d.realm}`, age: d.enteredAge ?? 0 } } : { key, params: {} };
}

/**
 * Tab "Đạo" (F4): những mốc lớn về đường tiên trong cả đời, theo thứ tự thời gian. Bỏ tin kỳ tuyển ba năm một lần: tin
 * chung của cả vùng, lặp suốt đời, lấn mất chuyện của chính mình.
 */
export const daoMilestones = (milestones: readonly LogEntry[]): LogEntry[] => milestones.filter((e) => isDaoNews(e) && e.key !== 'log.sect.rumor');

