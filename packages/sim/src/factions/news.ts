// Tin đồn thế lực (v0.6 S6, ADR 0019 Q10): so thế lực trước và sau pha quý, ra tin đồn cho người chơi đang đứng ở một
// quận. Chỉ đọc; thuần, tất định (duyệt theo id, theo chỉ số quận).
import { TICKS_PER_MONTH, type FactionId, type LogEntry, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { GREEDY_FROM, HONEST_BELOW, type GovernmentReport } from './government';
import { controlOf, type FactionWorldState } from './state';

/** Thế lực trước pha quý: người giữ mỗi quận, thế lực còn sống, nhiệm kỳ quan đương nhiệm (null: chưa có quan). */
export interface FactionMark {
  control: (FactionId | null)[];
  alive: ReadonlySet<string>;
  termEnds: Tick | null;
}

export function factionMark(fw: FactionWorldState, counties: number): FactionMark {
  const gov = fw.list.find((f) => f.ended === null && f.kind === 'government');
  return {
    control: controlOf(fw, counties),
    alive: new Set(fw.list.filter((f) => f.ended === null).map((f) => f.id)),
    // Quan đầu tiên nhậm chức ở pha đầu tiên của vùng (nhiệm kỳ còn bằng tick lập): không thành tin
    termEnds: gov && gov.termEnds !== gov.founded ? gov.termEnds : null,
  };
}

/**
 * Tin đồn sau pha quý `t`, nghe sau một tháng như tin đồn v0.5: chuyện ở quận kề `here` — băng cướp mới tụ, quận bị cướp
 * hay họ lớn chiếm, quan phủ lấy lại. Quan mới nhậm chức thì cả vùng nghe, kèm lời đồn về độ tham. Chuyện ở chính quận
 * đang đứng là tin thế sự (F3), không qua đây.
 */
export function factionRumors(fw: FactionWorldState, logic: RegionLogic, before: FactionMark, here: number, t: Tick): LogEntry[] {
  const out: LogEntry[] = [];
  const near: number[] = [];
  for (const [a, b] of logic.adjacency) { if (a === here) near.push(b); else if (b === here) near.push(a); }
  near.sort((x, y) => x - y);
  const at = t + TICKS_PER_MONTH;
  const rumor = (key: string, params: Record<string, string>) => out.push({ tick: at, key, params, importance: 'minor' });
  const place = (k: number) => logic.counties[k]!.name ?? 'place.unknown';
  for (const f of fw.list) if (f.ended === null && f.kind === 'bandits' && !before.alive.has(f.id) && near.includes(f.seat)) rumor('log.rumor.bandits', { county: place(f.seat) });
  const kindOf = new Map(fw.list.map((f) => [f.id, f.kind]));
  const now = controlOf(fw, logic.counties.length);
  for (const k of near) {
    const id = now[k];
    if (id === before.control[k] || id === null || id === undefined) continue;
    const kind = kindOf.get(id);
    const key = kind === 'bandits' ? 'log.rumor.seized_bandits' : kind === 'clan' ? 'log.rumor.seized_clan' : kind === 'government' ? 'log.rumor.retaken' : null;
    if (key) rumor(key, { county: place(k) });
  }
  const gov = fw.list.find((f) => f.ended === null && f.kind === 'government');
  if (gov && before.termEnds !== null && gov.termEnds !== before.termEnds) {
    rumor('log.rumor.magistrate', { temper: gov.greed >= GREEDY_FROM ? 'rumor.magistrate.greedy' : gov.greed < HONEST_BELOW ? 'rumor.magistrate.honest' : 'rumor.magistrate.middling' });
  }
  return out;
}

/**
 * Tin thế sự (v0.6 F3): chuyện thế lực ở chính quận đang đứng, ghi vào biên niên ngay (không qua tin đồn). Băng cướp tụ
 * lại, quận bị cướp hay họ lớn chiếm, quan phủ lấy lại là việc lớn (ngắt tua); họ lớn, thương hội lập hay tàn, băng cướp
 * tan, quan phủ tiễu phỉ ở đây hay quận kề là việc thường.
 */
export function factionNews(fw: FactionWorldState, logic: RegionLogic, before: FactionMark, here: number, report: GovernmentReport | null): Omit<LogEntry, 'tick'>[] {
  const out: Omit<LogEntry, 'tick'>[] = [];
  const place = (k: number) => logic.counties[k]!.name ?? 'place.unknown';
  const news = (key: string, params: Record<string, string | number>, major = false) => out.push({ key, params, importance: major ? 'major' : 'minor' });
  for (const f of fw.list) {
    if (f.seat !== here || f.kind === 'government') continue;
    const params = { ...f.name.params, place: place(f.seat) };
    if (f.ended === null && !before.alive.has(f.id)) news(`log.faction.${f.kind}_founded`, params, f.kind === 'bandits');
    if (f.ended !== null && before.alive.has(f.id)) news(`log.faction.${f.kind}_ended`, params);
  }
  const now = controlOf(fw, logic.counties.length);
  const id = now[here];
  if (id !== before.control[here] && id !== null && id !== undefined) {
    const f = fw.list.find((x) => x.id === id)!;
    const key = f.kind === 'bandits' ? 'log.faction.seized_bandits' : f.kind === 'clan' ? 'log.faction.seized_clan' : f.kind === 'government' ? 'log.faction.retaken' : null;
    if (key) news(key, { ...f.name.params, place: place(here) }, true);
  }
  const near = (c: number) => c === here || logic.adjacency.some(([a, b]) => (a === here && b === c) || (b === here && a === c));
  for (const b of report?.battles ?? []) if (near(b.seat)) news(b.won ? 'log.faction.campaign_won' : 'log.faction.campaign_lost', { place: place(b.seat) });
  return out;
}
