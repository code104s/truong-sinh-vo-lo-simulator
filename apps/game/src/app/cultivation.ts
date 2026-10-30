// Đường tu (v0.8 F1): cảnh giới trên thanh trạng thái khi đã bước qua, khối "Đạo" ở hồ sơ. Thuần, không có luật game:
// mọi thứ đọc từ CharacterView.cultivation (dải chữ, không lộ số linh khí) và thế lực tông môn trong danh sách thế lực.
import type { CultivationView, FactionName, FactionView, Realm, SectDutyView } from '@tsvl/shared';

/** Cảnh giới cho thanh trạng thái: chỉ khi đã bước qua phàm nhân (người phàm không ghi gì). */
export function realmLine(cv: CultivationView): Realm | null {
  return cv.realm === 'mortal' ? null : cv.realm;
}

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
