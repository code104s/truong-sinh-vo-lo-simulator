// Tai họa (ADR 0014, G3): hạn, lũ, châu chấu là tên gọi năm xấu của quận (economy/market.ts labelDisasters). Tin báo cho
// mọi người ở quận; người chơi chỉ được hỏi chọn khi tai họa chạm tới mình — có ruộng mùa này ở đó.
import { GRAIN_PER_DOU } from '@tsvl/shared';
import { idiv } from '../../core/math';
import { epidemicAt, type DisasterKind } from '../../economy/market';
import { catchIllness, hurt, loseGrain, occupy, payTo, receiveFrom, wound } from '../effects';
import type { EventContext, EventDef } from '../engine';
import { cropValue, farmingHere, figure, here, month, percentOf, sellValue } from './common';

/** Tai họa của quận phát đúng tháng này và chạm tới ruộng mình. */
const striking = (ctx: EventContext, kind: DisasterKind) => here(ctx).disaster === kind && here(ctx).disasterMonth === month(ctx) && farmingHere(ctx);
const relieve = (ctx: EventContext, pct: number) => { ctx.c.household.reliefPct = Math.min(100, ctx.c.household.reliefPct + pct); };

export const GREEN_SALE_PCT = 40;
export const REMEDY_PRICE = 60;
export const FIREWOOD_PRICE = 40;

export const drought: EventDef = {
  id: 'event.drought',
  category: 'disaster',
  weight: (ctx) => (striking(ctx, 'drought') ? 1_000_000 : 0),
  cooldownTicks: 30,
  choices: [
    { id: 'irrigate', costs: ['stamina', 'time'], apply: (ctx) => { occupy(ctx, 'action.toil', 2); relieve(ctx, 50); return { result: 'irrigate' }; } },
    {
      id: 'sell_green', costs: ['grain'],
      // Bán lúa non: bỏ cả vụ, lấy ngay chừng bốn phần mười giá trị bằng tiền
      apply: (ctx) => {
        const got = receiveFrom(ctx, ctx.c.location, sellValue(here(ctx), cropValue(ctx), GREEN_SALE_PCT));
        ctx.c.household.farmWeeks = 0;
        return { result: 'sell_green', params: { money: got } };
      },
    },
    {
      id: 'wait', costs: ['risk'],
      apply: (_ctx, rng) => { if (rng.chance(250_000)) { relieve(_ctx, 50); return { result: 'wait_rain' }; } return { result: 'wait_dry' }; },
    },
  ],
};

export const flood: EventDef = {
  id: 'event.flood',
  category: 'disaster',
  weight: (ctx) => (striking(ctx, 'flood') ? 1_000_000 : 0),
  cooldownTicks: 30,
  choices: [
    { id: 'dyke', costs: ['stamina', 'time'], apply: (ctx) => { occupy(ctx, 'action.toil', 2); relieve(ctx, 50); return { result: 'dyke' }; } },
    // Khuân thóc lên gò cao: giữ được kho, ruộng thì đành chịu
    { id: 'save_grain', costs: ['time'], apply: (ctx) => { occupy(ctx, 'action.toil', 1); return { result: 'save_grain' }; } },
    {
      id: 'let_be', costs: ['risk'],
      apply: (ctx, rng) => (rng.chance(500_000) ? { result: 'let_be_flooded', params: { lost: idiv(loseGrain(ctx, percentOf(ctx.c.household.grain, 30)), GRAIN_PER_DOU) } } : { result: 'let_be' }),
    },
  ],
};

export const locusts: EventDef = {
  id: 'event.locusts',
  category: 'disaster',
  weight: (ctx) => (striking(ctx, 'locust') ? 1_000_000 : 0),
  cooldownTicks: 30,
  choices: [
    { id: 'drive_off', costs: ['stamina', 'time'], apply: (ctx) => { occupy(ctx, 'action.toil', 1); relieve(ctx, 30); return { result: 'drive_off' }; } },
    {
      id: 'reap_green', costs: ['grain'],
      // Gặt non chạy châu chấu: được nửa vụ ngay, mùa này coi như xong
      apply: (ctx) => {
        const got = percentOf(cropValue(ctx), 50);
        ctx.c.household.grain += got;
        ctx.c.household.farmWeeks = 0;
        return { result: 'reap_green', params: { grain: idiv(got, GRAIN_PER_DOU) } };
      },
    },
    { id: 'watch', costs: ['opportunity'], apply: () => ({ result: 'watch' }) },
  ],
};

export const epidemic: EventDef = {
  id: 'event.epidemic',
  category: 'disaster',
  weight: (ctx) => (ctx.age >= 12 && epidemicAt(here(ctx), ctx.tick) && !(ctx.c.household.shieldUntil > ctx.tick) ? 300_000 : 0),
  cooldownTicks: 12,
  params: () => ({ price: REMEDY_PRICE }),
  figure: (_ctx, rng) => figure(rng, 'adult', 'common'),
  choices: [
    {
      id: 'shelter', costs: ['time'],
      apply: (ctx) => { occupy(ctx, 'action.shelter', 2); ctx.c.household.shieldUntil = here(ctx).epidemicUntil; return { result: 'shelter' }; },
    },
    {
      id: 'remedy', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= REMEDY_PRICE ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, REMEDY_PRICE); ctx.c.household.shieldUntil = here(ctx).epidemicUntil; return { result: 'remedy' }; },
    },
    {
      id: 'carry_on', costs: ['risk'],
      apply: (ctx, rng) => (rng.chance(300_000) && catchIllness(ctx, 'illness.fever', 'serious', 4) ? { result: 'carry_on_sick' } : { result: 'carry_on' }),
    },
  ],
};

export const houseFire: EventDef = {
  id: 'event.house_fire',
  category: 'disaster',
  // Mùa hanh khô dễ cháy; nhà có của mới mất được
  weight: (ctx) => (ctx.age >= 14 && ctx.c.household.grain >= 200 ? (month(ctx) >= 10 || month(ctx) <= 3 ? 3_000 : 1_500) : 0),
  cooldownTicks: 360,
  choices: [
    {
      id: 'rush_in', costs: ['health', 'risk'],
      apply: (ctx, rng) => {
        if (rng.chance(600_000)) return { result: 'rush_in_saved' };
        hurt(ctx, 60); wound(ctx, 3);
        return { result: 'rush_in_burnt', params: { lost: idiv(loseGrain(ctx, percentOf(ctx.c.household.grain, 40)), GRAIN_PER_DOU) } };
      },
    },
    { id: 'stand_back', costs: ['grain'], apply: (ctx) => ({ result: 'stand_back', params: { lost: idiv(loseGrain(ctx, percentOf(ctx.c.household.grain, 50)), GRAIN_PER_DOU) } }) },
  ],
};

export const bitterCold: EventDef = {
  id: 'event.bitter_cold',
  category: 'disaster',
  weight: (ctx) => (ctx.age >= 12 && (month(ctx) === 12 || month(ctx) === 1) ? 40_000 : 0),
  cooldownTicks: 36,
  params: () => ({ price: FIREWOOD_PRICE }),
  choices: [
    { id: 'cut_wood', costs: ['stamina', 'time', 'risk'], apply: (ctx) => { occupy(ctx, 'action.toil', 1); return { result: 'cut_wood' }; } },
    {
      id: 'buy_wood', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= FIREWOOD_PRICE ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, FIREWOOD_PRICE); return { result: 'buy_wood' }; },
    },
    {
      id: 'endure', costs: ['health', 'risk'],
      apply: (ctx, rng) => { hurt(ctx, 40); return rng.chance(300_000) && catchIllness(ctx, 'illness.cold', 'mild', 2) ? { result: 'endure_sick' } : { result: 'endure' }; },
    },
  ],
};

export const DISASTER: readonly EventDef[] = [drought, flood, locusts, epidemic, houseFire, bitterCold];
