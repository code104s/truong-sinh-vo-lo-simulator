// Gom nhật ký thành biên niên theo năm (đề xuất giao diện P0). Thuần, test được; không có luật game.
import { ageYearsAt, calendarOf, type LogEntry, type Tick } from '@tsvl/shared';

export interface ChronicleItem { entry: LogEntry; index: number }
export interface YearGroup {
  year: number;
  ageFrom: number;
  ageTo: number;
  /** Mới nhất trước. */
  items: ChronicleItem[];
  majorCount: number;
  minorCount: number;
}

/** Năm mới nhất lên đầu, trong năm thì việc mới nhất lên đầu: điều vừa xảy ra luôn ở chỗ mắt nhìn trước. */
export function groupByYear(log: readonly LogEntry[], birthTick: Tick): YearGroup[] {
  const groups: YearGroup[] = [];
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i]!;
    const year = calendarOf(entry.tick).year;
    const age = Math.max(0, ageYearsAt(birthTick, entry.tick));
    let g = groups.at(-1);
    if (!g || g.year !== year) {
      g = { year, ageFrom: age, ageTo: age, items: [], majorCount: 0, minorCount: 0 };
      groups.push(g);
    }
    g.items.push({ entry, index: i });
    g.ageFrom = Math.min(g.ageFrom, age);
    g.ageTo = Math.max(g.ageTo, age);
    if (entry.importance === 'major') g.majorCount++;
    else g.minorCount++;
  }
  return groups;
}

export type ChronicleFilter = 'all' | 'major' | 'people';
export const CHRONICLE_FILTERS: readonly ChronicleFilter[] = ['all', 'major', 'people'];

/** Tin về người có tên (v0.4 F2): sinh, mất của người quanh mình, và sự kiện có người thật (kết quả mang tên người ấy). */
export const isPeopleNews = (e: LogEntry): boolean => e.key.startsWith('log.npc.') || (e.key.startsWith('event.') && e.params.name !== undefined);
/** Tin sinh, mất của người chưa quen: việc thường ngày, gập cả ở năm mới nhất. Người đã gặp mất là việc lớn, không gập. */
const isNeighbourNews = (e: LogEntry): boolean => e.importance === 'minor' && e.key.startsWith('log.npc.');

/**
 * Những dòng hiện cho một năm:
 * - "Chuyện lớn": chỉ việc lớn;
 * - "Người quanh mình": chỉ tin về người có tên, không gập;
 * - "Tất cả": năm mới nhất hiện đủ, trừ tin sinh, mất của người chưa quen (F2); năm cũ gập mọi việc thường ngày. Người
 *   chơi mở năm nào thì năm đó hiện đủ.
 */
export function visibleItems(g: YearGroup, filter: ChronicleFilter, latest: boolean, unfolded: boolean): { items: ChronicleItem[]; folded: number } {
  if (filter === 'people') return { items: g.items.filter((it) => isPeopleNews(it.entry)), folded: 0 };
  if (filter === 'major') return { items: g.items.filter((it) => it.entry.importance === 'major'), folded: 0 };
  if (unfolded) return { items: g.items, folded: 0 };
  const hide = latest ? isNeighbourNews : (e: LogEntry) => e.importance !== 'major';
  const items = g.items.filter((it) => !hide(it.entry));
  return { items, folded: g.items.length - items.length };
}
