// Sự kiện chung v0.7 (S8, Q3): chợ phiên, mùa màng, quan trường, đường xá — đến với mọi người, không theo nghề.
// Văn phong: docs/van-phong.md (giọng E); văn bản ở content `events.careers.vi.ts`.
import { HARVEST_MONTH } from '@tsvl/shared';
import { catchIllness, hurt, loseGrain, occupy, payFaction, payTo, refresh, spendStamina } from '../effects';
import type { EventContext, EventDef } from '../engine';
import { farmingHere, govRules, government, inTown, inVillage, man, month, season, traveling } from './common';

const money = (ctx: EventContext, x: number) => (ctx.c.household.money >= x ? null : 'lock.money');

export const FAIR_GIFT = 50;
export const marketFair: EventDef = {
  id: 'event.market_fair', category: 'daily',
  // Chợ phiên tháng Giêng, tháng Tám ở trấn, thành
  weight: (ctx) => (ctx.age >= 12 && inTown(ctx) && (month(ctx) === 1 || month(ctx) === 8) ? 25_000 : 0),
  cooldownTicks: 108,
  params: () => ({ money: FAIR_GIFT }),
  choices: [
    { id: 'buy_gift', costs: ['money'], available: (ctx) => money(ctx, FAIR_GIFT), apply: (ctx) => { payTo(ctx, ctx.c.location, FAIR_GIFT); refresh(ctx, 150); return { result: 'buy_gift' }; } },
    { id: 'watch', costs: ['time'], apply: (ctx) => { refresh(ctx, 80); return { result: 'watch' }; } },
    { id: 'stay_home', costs: ['opportunity'], apply: () => ({ result: 'stay_home' }) },
  ],
};

export const harvestFeast: EventDef = {
  id: 'event.harvest_feast', category: 'daily',
  weight: (ctx) => (ctx.age >= 16 && inVillage(ctx) && month(ctx) === HARVEST_MONTH && ctx.c.household.independent ? 20_000 : 0),
  cooldownTicks: 108,
  reputation: { offer: 3, skip: -1 },
  params: () => ({ dou: 2, money: 30 }),
  choices: [
    { id: 'offer', costs: ['grain'], apply: (ctx) => { loseGrain(ctx, 20); refresh(ctx, 60); return { result: 'offer' }; } },
    { id: 'feast', costs: ['money', 'health'], available: (ctx) => money(ctx, 30), apply: (ctx) => { payTo(ctx, ctx.c.location, 30); refresh(ctx, 150); hurt(ctx, 10); return { result: 'feast' }; } },
    { id: 'skip', costs: ['opportunity'], apply: () => ({ result: 'skip' }) },
  ],
};

export const RAT_POISON = 40;
export const fieldRats: EventDef = {
  id: 'event.field_rats', category: 'economy',
  weight: (ctx) => (farmingHere(ctx) && (season(ctx) === 'summer' || season(ctx) === 'autumn') ? 15_000 : 0),
  cooldownTicks: 144,
  params: () => ({ money: RAT_POISON }),
  choices: [
    { id: 'hunt_rats', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 80); return { result: 'hunt_rats' }; } },
    { id: 'poison', costs: ['money'], available: (ctx) => money(ctx, RAT_POISON), apply: (ctx) => { payTo(ctx, ctx.c.location, RAT_POISON); return { result: 'poison' }; } },
    // Mặc kệ: chuột ăn mất một tuần công của mùa
    { id: 'let_be', costs: ['opportunity'], apply: (ctx) => { ctx.c.household.farmWeeks = Math.max(0, ctx.c.household.farmWeeks - 1); return { result: 'let_be' }; } },
  ],
};

export const TOUR_GIFT = 100;
export const officialTour: EventDef = {
  id: 'event.official_tour', category: 'economy',
  weight: (ctx) => (ctx.age >= 18 && ctx.c.household.independent && govRules(ctx, ctx.c.location) ? 6_000 : 0),
  cooldownTicks: 180,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { gift: { government: 10 }, petition_heard: { government: 5 }, petition_scolded: { government: -8 } },
  reputation: { petition_heard: 5 },
  params: () => ({ money: TOUR_GIFT }),
  figure: () => man('adult', 'official'),
  choices: [
    { id: 'gift', costs: ['money'], available: (ctx) => money(ctx, TOUR_GIFT), apply: (ctx) => ({ result: 'gift', params: { money: payFaction(ctx, government(ctx), ctx.c.location, TOUR_GIFT) } }) },
    {
      id: 'petition', costs: ['risk', 'time'],
      apply: (ctx, rng) => (rng.chance(500_000 - 3_000 * (government(ctx)?.greed ?? 0)) ? { result: 'petition_heard' } : { result: 'petition_scolded' }),
    },
    { id: 'stay_away', costs: ['opportunity'], apply: () => ({ result: 'stay_away' }) },
  ],
};

export const FERRY_FEE = 20;
export const ferryCrossing: EventDef = {
  id: 'event.ferry_crossing', category: 'road',
  weight: (ctx) => (traveling(ctx) ? 15_000 : 0),
  cooldownTicks: 72,
  params: () => ({ money: FERRY_FEE }),
  figure: () => man('old', 'poor'),
  choices: [
    { id: 'pay', costs: ['money'], available: (ctx) => money(ctx, FERRY_FEE), apply: (ctx) => ({ result: 'pay', params: { money: payTo(ctx, ctx.c.location, FERRY_FEE) } }) },
    { id: 'wade', costs: ['risk', 'health'], apply: (ctx, rng) => (rng.chance(250_000) && catchIllness(ctx, 'illness.cold', 'mild', 2) ? { result: 'wade_cold' } : { result: 'wade' }) },
    { id: 'wait', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 20); return { result: 'wait' }; } },
  ],
};

export const BRIDGE_GIFT = 50;
export const bridgeLevy: EventDef = {
  id: 'event.bridge_levy', category: 'economy',
  weight: (ctx) => (ctx.age >= 18 && ctx.c.household.independent && inVillage(ctx) && season(ctx) === 'winter' ? 10_000 : 0),
  cooldownTicks: 216,
  reputation: { give: 5, labor: 5, refuse: -4 },
  params: () => ({ money: BRIDGE_GIFT }),
  figure: () => man('old', 'common'),
  choices: [
    { id: 'give', costs: ['money'], available: (ctx) => money(ctx, BRIDGE_GIFT), apply: (ctx) => ({ result: 'give', params: { money: payTo(ctx, ctx.c.location, BRIDGE_GIFT) } }) },
    { id: 'labor', costs: ['time', 'stamina'], apply: (ctx) => { occupy(ctx, 'action.toil', 1); return { result: 'labor' }; } },
    { id: 'refuse', costs: ['opportunity'], apply: () => ({ result: 'refuse' }) },
  ],
};

export const SEASON_EVENTS: readonly EventDef[] = [marketFair, harvestFeast, fieldRats, officialTour, ferryCrossing, bridgeLevy];
