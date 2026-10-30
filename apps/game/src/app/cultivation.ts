// Đường tu (v0.8 F1): cảnh giới trên thanh trạng thái khi đã bước qua, khối "Đạo" ở hồ sơ. F2: dòng đường tu trên ô việc
// trong bảng chọn việc, hỏi lại trước khi đột phá. Thuần, không có luật game: mọi thứ đọc từ CharacterView.cultivation (dải
// chữ, không lộ số linh khí, không lộ xác suất) và thế lực tông môn trong danh sách thế lực.
import type { BreakthroughPreview, CultivationView, FactionName, FactionView, LogEntry, Realm, SectDutyView } from '@tsvl/shared';

export type RisenRealm = Exclude<Realm, 'mortal'>;

/** Cảnh giới cho thanh trạng thái: chỉ khi đã bước qua phàm nhân (người phàm không ghi gì). */
export function realmLine(cv: CultivationView): RisenRealm | null {
  return cv.realm === 'mortal' ? null : cv.realm;
}

/** Triện riêng của từng cảnh giới trên thanh trạng thái (F2 bổ sung): tầng một là chữ 氣. */
export const REALM_SEAL: Record<RisenRealm, string> = { qi1: '氣' };

export type Tone = 'good' | 'warn' | 'bad';

export interface DutyLine {
  key: string;
  params: Record<string, string | number>;
  tone: Tone;
}

export interface DaoBlock {
  /** Khóa dải linh căn, hay "chưa từng được kiểm". */
  root: string;
  /** Đường vào; null khi chưa dẫn khí. */
  path: CultivationView['path'];
  /** Tông môn nhận mình (đệ tử ký danh), nếu thế lực còn trong danh sách. */
  sect: FactionName | null;
  /** Đã bị gạch tên: đường tông môn mà không còn nghĩa vụ. */
  expelled: boolean;
  realm: Realm;
  /** Khóa dải linh khí tới đỉnh tầng; null khi chưa dẫn khí. */
  qi: string | null;
  /** Đỉnh tầng một là trần của v0.8 (M8): ghi "chưa tới lúc". */
  ceiling: boolean;
  /** Nghĩa vụ tông môn năm nay, theo thứ tự đọc; rỗng khi không còn tên trong sổ. */
  duty: DutyLine[];
}

/** Nghĩa vụ năm nay: tuần tạp dịch đã làm; thiếu thì cuối năm nộp tiền thay; đã bỏ năm nào thì nhắc mức bị gạch tên. */
export function dutyLines(d: SectDutyView): DutyLine[] {
  const done = d.weeks >= d.need;
  const out: DutyLine[] = [{ key: done ? 'ui.dao.duty_done' : 'ui.dao.duty_weeks', params: { weeks: d.weeks, need: d.need }, tone: done ? 'good' : 'warn' }];
  if (!done) out.push({ key: 'ui.dao.duty_fee', params: { coin: d.fee }, tone: 'warn' });
  if (d.missed > 0) out.push({ key: 'ui.dao.duty_missed', params: { missed: d.missed, expel: d.expelAt }, tone: 'bad' });
  return out;
}

/** Khối "Đạo" ở hồ sơ. */
export function daoBlock(cv: CultivationView, factions: readonly FactionView[]): DaoBlock {
  const sect = cv.path === 'sect' ? factions.find((f) => f.kind === 'sect') : undefined;
  return {
    root: cv.root ? `root.${cv.root}` : 'ui.dao.root_unknown',
    path: cv.path,
    sect: sect && cv.duty ? sect.name : null,
    expelled: cv.path === 'sect' && !cv.duty,
    realm: cv.realm,
    qi: cv.qi ? `qi.${cv.qi}` : null,
    ceiling: cv.realm === 'qi1' && cv.qi === 'peak',
    duty: cv.duty ? dutyLines(cv.duty) : [],
  };
}

/** Dòng thêm trên ô việc đường tu (F2): tu luyện ghi linh khí nơi đang đứng; đột phá ghi cơ hội thành. */
export function cultivationNote(actionId: string, cv: CultivationView): { key: string; params: Record<string, string> } | null {
  if (actionId === 'action.cultivate' && cv.place) return { key: 'ui.dao.place', params: { place: `qi_place.${cv.place}` } };
  if (actionId === 'action.breakthrough' && cv.breakthrough) return { key: 'ui.bt.chance_line', params: { chance: `chance.${cv.breakthrough.chance}` } };
  return null;
}

/** Xếp ô này thì phải hỏi lại trước (F2): đột phá làm được. */
export const needsConfirm = (actionId: string, locked: string | null): boolean => actionId === 'action.breakthrough' && locked === null;

export interface BreakthroughAsk {
  chance: string;
  mind: string;
  /** Tâm cảnh rối: nên đợi lúc tâm yên hơn (cơ hội thấp hơn). */
  mindWarn: boolean;
  stones: { key: string; params: Record<string, number> };
  /** Hỏng thì mất gì, theo thứ tự nặng dần. */
  losses: string[];
}

/** Hộp hỏi lại trước khi đột phá: cơ hội, tâm cảnh, linh thạch dùng, mất gì nếu hỏng (cùng luật sim, S5). */
export function breakthroughAsk(p: BreakthroughPreview): BreakthroughAsk {
  return {
    chance: `chance.${p.chance}`,
    mind: `mind.${p.mind}`,
    mindWarn: p.mind === 'troubled',
    stones: p.stones > 0 ? { key: 'ui.bt.stones', params: { stones: p.stones } } : { key: 'ui.bt.no_stones', params: {} },
    losses: ['ui.bt.lose_qi', 'ui.bt.lose_meridian', 'ui.bt.lose_mind', 'ui.bt.lose_severe'],
  };
}

// —— Cảnh đột phá có dựng (đề xuất "cuốn hơn" mục 7.3, 9.5): màn tối, chờ một nhịp rồi mới hiện kết quả ——

export type BreakthroughOutcome = 'ok' | 'failed' | 'severe';
const OUTCOME_PREFIX = 'log.breakthrough.';

/** Kết quả một dòng biên niên đột phá; dòng khác thì null. */
export function breakthroughOutcome(e: LogEntry): BreakthroughOutcome | null {
  if (!e.key.startsWith(OUTCOME_PREFIX)) return null;
  const k = e.key.slice(OUTCOME_PREFIX.length);
  return k === 'ok' || k === 'failed' || k === 'severe' ? k : null;
}

/** Tick của lần đột phá gần nhất trong biên niên đang giữ (-1 nếu chưa có): mở save thì không dựng lại cảnh cũ. */
export function lastBreakthroughTick(log: readonly LogEntry[]): number {
  for (let i = log.length - 1; i >= 0; i--) if (breakthroughOutcome(log[i]!)) return log[i]!.tick;
  return -1;
}

/** Lần đột phá mới (sau `afterTick`) vừa vào biên niên, để dựng cảnh; không có thì null. */
export function newBreakthrough(log: readonly LogEntry[], afterTick: number): { entry: LogEntry; outcome: BreakthroughOutcome } | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    if (e.tick <= afterTick) break;
    const outcome = breakthroughOutcome(e);
    if (outcome) return { entry: e, outcome };
  }
  return null;
}

/** Giao diện đổi màu mực khi đã bước qua phàm nhân (mục 7.3: "bước qua ngưỡng thì giao diện đổi theo"). */
export const realmClass = (cv: CultivationView): string => (cv.realm === 'mortal' ? '' : ` realm-${cv.realm}`);
