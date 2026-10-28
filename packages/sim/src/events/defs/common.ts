// Điều kiện và tiện ích dùng chung cho các sự kiện. Chỉ đọc trạng thái; đổi trạng thái thì qua effects.ts.
import { ageYearsAt, calendarOf, GRAIN_PER_DOU, type EventFigure, type Season } from '@tsvl/shared';
import { mulDiv } from '../../core/math';
import type { Rng } from '../../core/rng';
import { sellPrice, type CountyEconomy } from '../../economy/market';
import { FARM_YIELD_PER_WEEK, farmSkillPct } from '../../economy/farming';
import { nearestTownFrom, routeTerrainPct } from '../../life/travel';
import type { EventContext } from '../engine';
import { npcFigure, type NpcState } from '../../npc/state';
import { REP_KNOWN } from '../../social/reputation';

export const figure = (rng: Rng, ageBand: EventFigure['ageBand'], cls: EventFigure['class']): EventFigure => ({ gender: rng.int(0, 1) === 0 ? 'male' : 'female', ageBand, class: cls });
export const man = (ageBand: EventFigure['ageBand'], cls: EventFigure['class']): EventFigure => ({ gender: 'male', ageBand, class: cls });

export const month = (ctx: EventContext) => calendarOf(ctx.tick).month;
export const season = (ctx: EventContext): Season => calendarOf(ctx.tick).season;
export const kindHere = (ctx: EventContext) => ctx.logic.settlementKind[ctx.c.location]!;
export const inVillage = (ctx: EventContext) => kindHere(ctx) === 'village';
export const inTown = (ctx: EventContext) => kindHere(ctx) !== 'village';
export const here = (ctx: EventContext): CountyEconomy => ctx.eco.counties[ctx.c.location]!;
export const ill = (ctx: EventContext) => ctx.c.conditions.some((x) => x.kind === 'illness');
export const personality = (ctx: EventContext, ...p: string[]) => p.includes(ctx.c.personality);

/** Việc đã xếp cho tuần này (khi không dở hành động dài). */
export const doingNow = (ctx: EventContext): string | null => (ctx.player.active ? ctx.player.active.slot.action : ctx.player.plan?.slots[ctx.tick % 3]?.action ?? null);
export const traveling = (ctx: EventContext) => ctx.player.active?.slot.action === 'action.travel';
/** Chuyến đi đang dở có qua núi (hệ số địa hình ≥ 200%). */
export const roughRoad = (ctx: EventContext) => !!ctx.player.active?.preview && routeTerrainPct(ctx.logic, ctx.player.active.preview.route) >= 200;
/** Có ruộng đang làm mùa này ở quận đang đứng. */
export const farmingHere = (ctx: EventContext) => ctx.c.household.farmWeeks > 0 && ctx.c.household.farmCounty === ctx.c.location;

/** Giá trị thóc của số tuần công mùa này nếu gặt ở năm thường (thăng), để quy giá lúa non. */
export function cropValue(ctx: EventContext): number {
  const h = ctx.c.household;
  if (h.farmWeeks <= 0) return 0;
  return mulDiv(mulDiv(h.farmWeeks * FARM_YIELD_PER_WEEK, farmSkillPct(ctx.c), 100), ctx.logic.fertilityPct[h.farmCounty]!, 100);
}

/** Tiền bán `grain` thăng theo giá bán chợ (văn), nhân thêm `pct`. */
export const sellValue = (ce: CountyEconomy, grain: number, pct = 100) => mulDiv(mulDiv(grain, sellPrice(ce), GRAIN_PER_DOU), pct, 100);

/** Quận trấn hoặc thành gần nhất (theo khoảng cách trị sở), không kể quận đang đứng; null nếu không có. */
export const nearestTown = (ctx: EventContext): number | null => nearestTownFrom(ctx.logic, ctx.c.location);

export const percentOf = (n: number, pct: number) => mulDiv(n, pct, 100);

/** Tiếng tăm của người chơi ở quận đang đứng (v0.5 S6). */
export const repHere = (ctx: EventContext): number => ctx.reputation[ctx.c.location] ?? 0;
/** Trọng số theo tiếng tăm: tiếng tốt (từ "được trọng") hay tiếng xấu (từ "bị chê") nhân thêm phần trăm. */
export const byReputation = (ctx: EventContext, w: number, goodPct: number, badPct: number): number => {
  const rep = repHere(ctx);
  return rep >= REP_KNOWN ? mulDiv(w, goodPct, 100) : rep <= -REP_KNOWN ? mulDiv(w, badPct, 100) : w;
};

/** NPC còn sống ở quận người chơi đang đứng, theo id (S6: người thật trong sự kiện). */
export const peopleHere = (ctx: EventContext): NpcState[] => ctx.npcs.people.filter((n) => n.death === null && n.character.location === ctx.c.location);
/** Tuổi một NPC lúc này. */
export const npcAge = (ctx: EventContext, n: NpcState): number => ageYearsAt(n.character.birthTick, ctx.tick);
/** Người trong thẻ: NPC thật nếu sự kiện đã chọn được, không thì người vô danh do `fallback` dựng. */
export const castOr = (fallback: (ctx: EventContext, rng: Rng) => EventFigure | null) => (ctx: EventContext, rng: Rng): EventFigure | null =>
  (ctx.npc ? npcFigure(ctx.npc, ctx.tick) : fallback(ctx, rng));
/** Tham số lời kể: tên người thật nếu có. */
export const npcName = (ctx: EventContext): Record<string, string | number> => (ctx.npc ? { name: ctx.npc.character.name } : {});
/** Chọn ngẫu nhiên một người trong danh sách (rút RNG chỉ khi có người). */
export const pickOne = (xs: readonly NpcState[], rng: Rng): NpcState | null => (xs.length ? xs[rng.int(0, xs.length - 1)]! : null);

/** NPC còn sống thỏa điều kiện, gần quận người chơi nhất (km giữa trị sở; bằng nhau thì id đứng trước). Không rút RNG. */
export function nearestWith(ctx: EventContext, ok: (n: NpcState) => boolean): NpcState | null {
  const km = ctx.logic.seatKm[ctx.c.location];
  let best: NpcState | null = null, bestKm = Number.MAX_SAFE_INTEGER;
  for (const n of ctx.npcs.people) {
    if (n.death || !ok(n)) continue;
    const d = n.character.location === ctx.c.location ? 0 : km?.[n.character.location] ?? Number.MAX_SAFE_INTEGER - 1;
    if (d < bestKm) { best = n; bestKm = d; }
  }
  return best;
}
