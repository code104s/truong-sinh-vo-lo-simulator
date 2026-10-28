// Thế sự một đời (v0.6 F4, ADR 0019): thế lực người chơi đã thấy và số phận của chúng, cho màn tổng kết
// (`LifeSummary.legacy.factions`). Thuần, tất định, số nguyên; duyệt theo thứ tự danh sách thế lực.
import type { FactionFate, FactionKind, FactionName } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import type { FactionState, FactionWorldState } from './state';

/** Một thế lực đã thấy: thước đo lúc thấy lần đầu và lần gần nhất còn sống; đã tan chưa. */
export interface FactionSeen {
  id: string;
  kind: FactionKind;
  name: FactionName;
  first: number;
  last: number;
  ended: boolean;
}

/** Thước đo thịnh suy: quan phủ theo số quận giữ; gia tộc, thương hội theo thế; băng cướp theo số người. */
export function factionMeasure(f: FactionState): number {
  return f.kind === 'government' ? f.counties.length : f.kind === 'bandits' ? f.members.length : f.power;
}

/** Thế lực đặt chân ở quận ấy (như khối "Thế lực ở {nơi}"): quan phủ luôn có mặt. */
function presentAt(f: FactionState, logic: RegionLogic, here: number): boolean {
  return f.kind === 'government' || f.seat === here || f.counties.includes(here) || f.holds.includes(here)
    || (f.kind === 'bandits' && f.roads.some((k) => logic.adjacency[k]!.includes(here)));
}

/**
 * Đầu quý, sau pha Thế lực: thế lực còn sống đặt chân ở quận đang đứng mà chưa thấy thì ghi lại; thế lực đã thấy thì
 * cập nhật thước đo (còn sống) hay đánh dấu đã tan (dù người chơi ở đâu: tiếng đồn tới tai).
 */
export function trackSeen(seen: FactionSeen[], fw: FactionWorldState, logic: RegionLogic, here: number): void {
  const byId = new Map(seen.map((s) => [s.id, s]));
  for (const f of fw.list) {
    const s = byId.get(f.id);
    if (s) {
      if (s.ended) continue;
      if (f.ended !== null) s.ended = true;
      else s.last = factionMeasure(f);
    } else if (f.ended === null && presentAt(f, logic, here)) {
      const m = factionMeasure(f);
      seen.push({ id: f.id, kind: f.kind, name: { key: f.name.key, params: { ...f.name.params } }, first: m, last: m, ended: false });
    }
  }
  // Thế lực đã dọn khỏi danh sách mà chưa đánh dấu (tàn quá một năm): đã tan
  const alive = new Set(fw.list.map((f) => f.id));
  for (const s of seen) if (!alive.has(s.id)) s.ended = true;
}

/** Số phận: đã tan; thước đo lên gấp rưỡi thì thịnh; còn hai phần ba trở xuống thì suy; còn lại vẫn đứng. */
export function fateOf(s: FactionSeen): FactionFate {
  if (s.ended) return 'gone';
  if (2 * s.last >= 3 * s.first && s.last > s.first) return 'rose';
  if (3 * s.last <= 2 * s.first && s.last < s.first) return 'fell';
  return 'endured';
}

/** Phần "Thế sự một đời" của tổng kết, theo thứ tự thấy lần đầu. */
export function legacyFactions(seen: readonly FactionSeen[]): { name: FactionName; kind: FactionKind; fate: FactionFate }[] {
  return seen.map((s) => ({ name: { key: s.name.key, params: { ...s.name.params } }, kind: s.kind, fate: fateOf(s) }));
}
