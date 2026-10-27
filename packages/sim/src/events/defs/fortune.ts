// Cơ duyên phàm nhân (ADR 0014): không cho sức mạnh, chỉ để lại dấu vết cho cửa ngõ tu tiên (v0.8). GDD 1.2.
import { gainSkill } from '../../life/skills';
import { addFlag, heal, payTo, receiveFrom, spendStamina } from '../effects';
import type { EventDef } from '../engine';
import { doingNow, inTown, inVillage, man } from './common';

export const TALE_WINE = 30;
export const HERB_PRICE = 150;
export const BOOK_PRICE = 50;

export const immortalTale: EventDef = {
  id: 'event.immortal_tale',
  category: 'opportunity',
  // Quán trà chợ trấn; một lần trong đời, hiếm
  weight: (ctx) => (ctx.age >= 12 && inTown(ctx) ? 15_000 : 0),
  cooldownTicks: 0,
  oncePerLife: true,
  params: () => ({ price: TALE_WINE }),
  figure: () => man('old', 'poor'),
  choices: [
    { id: 'listen', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 60); addFlag(ctx, 'heard_immortal'); return { result: 'listen' }; } },
    {
      id: 'treat', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= TALE_WINE ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, TALE_WINE); addFlag(ctx, 'heard_immortal'); addFlag(ctx, 'knows_cave'); return { result: 'treat' }; },
    },
    // Chỉ đến một lần trong đời: cười cho qua là mất hẳn
    { id: 'laugh', costs: ['opportunity'], apply: () => ({ result: 'laugh' }) },
  ],
};

export const rareHerb: EventDef = {
  id: 'event.rare_herb',
  category: 'opportunity',
  weight: (ctx) => {
    const now = doingNow(ctx);
    return inVillage(ctx) && (now === 'action.forage' || now === 'action.hunt') ? 25_000 : 0;
  },
  cooldownTicks: 144,
  params: () => ({ price: HERB_PRICE }),
  choices: [
    {
      id: 'sell', costs: ['opportunity'],
      apply: (ctx) => ({ result: 'sell', params: { money: receiveFrom(ctx, ctx.c.location, HERB_PRICE) } }),
    },
    {
      id: 'brew', costs: ['opportunity'],
      apply: (ctx) => {
        ctx.c.conditions = ctx.c.conditions.filter((x) => x.severity !== 'mild');
        heal(ctx, 80);
        return { result: 'brew' };
      },
    },
    { id: 'leave', costs: ['opportunity'], apply: () => ({ result: 'leave' }) },
  ],
};

export const oldBook: EventDef = {
  id: 'event.old_book',
  category: 'opportunity',
  weight: (ctx) => (inTown(ctx) && ctx.c.skillXp.literacy > 0 ? 30_000 : 0),
  cooldownTicks: 144,
  params: () => ({ price: BOOK_PRICE }),
  figure: () => man('old', 'common'),
  choices: [
    {
      id: 'buy', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= BOOK_PRICE ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, BOOK_PRICE); gainSkill(ctx.c, 'literacy', ctx.tick, 300); return { result: 'buy' }; },
    },
    {
      id: 'read_there', costs: ['stamina', 'risk'],
      apply: (ctx, rng) => { spendStamina(ctx, 30); gainSkill(ctx.c, 'literacy', ctx.tick, 80); return rng.chance(300_000) ? { result: 'read_chased' } : { result: 'read_there' }; },
    },
    { id: 'pass', costs: ['opportunity'], apply: () => ({ result: 'pass' }) },
  ],
};

export const FORTUNE: readonly EventDef[] = [immortalTale, rareHerb, oldBook];
