// Điều kiện và tiện ích dùng chung cho các sự kiện. Chỉ đọc trạng thái; đổi trạng thái thì qua effects.ts.
import { calendarOf, GRAIN_PER_DOU, type EventFigure, type Season } from '@tsvl/shared';
import { mulDiv } from '../../core/math';
import type { Rng } from '../../core/rng';
import { sellPrice, type CountyEconomy } from '../../economy/market';
import { FARM_YIELD_PER_WEEK, farmSkillPct } from '../../economy/farming';
import { routeTerrainPct } from '../../life/travel';
import type { EventContext } from '../engine';

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
export function nearestTown(ctx: EventContext): number | null {
  const km = ctx.logic.seatKm[ctx.c.location]!;
  let best = -1;
  for (let i = 0; i < ctx.logic.settlementKind.length; i++) {
    if (ctx.logic.settlementKind[i] === 'village' || i === ctx.c.location) continue;
    if (best < 0 || km[i]! < km[best]!) best = i;
  }
  return best < 0 ? null : best;
}

export const percentOf = (n: number, pct: number) => mulDiv(n, pct, 100);
