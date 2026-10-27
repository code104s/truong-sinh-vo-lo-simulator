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

export type ChronicleFilter = 'all' | 'major';

/**
 * Những dòng hiện cho một năm. "Chuyện lớn": chỉ việc lớn. "Tất cả": năm mới nhất hiện đủ; năm cũ gập việc thường
 * ngày lại trừ khi người chơi mở năm đó.
 */
export function visibleItems(g: YearGroup, filter: ChronicleFilter, latest: boolean, unfolded: boolean): { items: ChronicleItem[]; folded: number } {
  if (filter === 'all' && (latest || unfolded)) return { items: g.items, folded: 0 };
  return { items: g.items.filter((it) => it.entry.importance === 'major'), folded: filter === 'all' ? g.minorCount : 0 };
}
