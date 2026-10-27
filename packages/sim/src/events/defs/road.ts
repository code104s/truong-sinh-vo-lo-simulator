// Đường xá, rừng núi (ADR 0014; văn phong: docs/van-phong.md).
import { GRAIN_PER_DOU } from '@tsvl/shared';
import { idiv, mulDiv } from '../../core/math';
import { gainSkill } from '../../life/skills';
import { catchIllness, loseGrain, payTo, produceGrain, receiveFrom, spendStamina, wound } from '../effects';
import type { EventDef } from '../engine';
import { doingNow, inVillage, man, percentOf, roughRoad, traveling } from './common';

/** Võ từ mức Thạo (ADR 0010: 1000 điểm) mới dám liều với cướp. */
export const FIGHT_MARTIAL_XP = 1_000;
export const BEAST_MEAT = 30;
export const BEAST_HIDE = 60;

export const highwayRobbers: EventDef = {
  id: 'event.highway_robbers',
  category: 'road',
  // Đang trên đường; đường qua núi vắng thì dễ gặp hơn
  weight: (ctx) => (traveling(ctx) ? (roughRoad(ctx) ? 60_000 : 20_000) : 0),
  cooldownTicks: 36,
  figure: () => man('adult', 'poor'),
  choices: [
    {
      id: 'pay', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= 10 ? null : 'lock.money'),
      apply: (ctx) => {
        const n = payTo(ctx, ctx.c.location, idiv(ctx.c.household.money, 2));
        return { result: 'pay', params: { money: n } };
      },
    },
    {
      id: 'fight', costs: ['health', 'risk'],
      available: (ctx) => (ctx.c.skillXp.martial >= FIGHT_MARTIAL_XP ? null : 'lock.skill'),
      apply: (ctx, rng) => {
        gainSkill(ctx.c, 'martial', ctx.tick, 80);
        const ppm = 400_000 + mulDiv(ctx.c.skillXp.martial, 400_000, 10_000) + ctx.c.luck * 20_000;
        if (rng.chance(ppm)) return { result: 'fight_won' };
        wound(ctx, 4);
        // Tiền vào tay cướp đi về quỹ quận đang qua (v0.6 mới có băng cướp thật); sổ cái không thủng
        payTo(ctx, ctx.c.location, ctx.c.household.money);
        return { result: 'fight_lost' };
      },
    },
    {
      id: 'run', costs: ['grain', 'risk'],
      apply: (ctx, rng) => {
        if (rng.chance(700_000)) return { result: 'run_away', params: { lost: idiv(loseGrain(ctx, percentOf(ctx.c.household.grain, 10)), GRAIN_PER_DOU) } };
        wound(ctx, 2);
        return { result: 'run_fell' };
      },
    },
  ],
};

export const wildBeast: EventDef = {
  id: 'event.wild_beast',
  category: 'road',
  weight: (ctx) => (inVillage(ctx) && doingNow(ctx) === 'action.hunt' ? 120_000 : 0),
  cooldownTicks: 36,
  choices: [
    {
      id: 'shoot', costs: ['risk'],
      apply: (ctx, rng) => {
        const ppm = 300_000 + mulDiv(ctx.c.skillXp.hunting, 500_000, 10_000);
        if (rng.chance(ppm)) {
          produceGrain(ctx, BEAST_MEAT);
          const hide = receiveFrom(ctx, ctx.c.location, BEAST_HIDE);
          return { result: 'shoot_hit', params: { money: hide } };
        }
        wound(ctx, 3);
        return { result: 'shoot_miss' };
      },
    },
    { id: 'climb', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 80); return { result: 'climb' }; } },
    {
      id: 'flee', costs: ['risk'],
      apply: (ctx, rng) => { if (rng.chance(300_000)) { wound(ctx, 2); return { result: 'flee_hurt' }; } return { result: 'flee' }; },
    },
  ],
};

export const lostInMountains: EventDef = {
  id: 'event.lost_in_mountains',
  category: 'road',
  weight: (ctx) => (traveling(ctx) && roughRoad(ctx) ? 50_000 : 0),
  cooldownTicks: 72,
  choices: [
    {
      id: 'follow_stream', costs: ['time'],
      // Theo suối xuống núi: chắc ăn mà vòng, đi thêm một tuần (chỉ khi đang dở chuyến đi)
      available: (ctx) => (ctx.player.active ? null : 'lock.route'),
      apply: (ctx) => { const a = ctx.player.active!; a.remaining++; a.total++; return { result: 'follow_stream' }; },
    },
    {
      id: 'camp', costs: ['stamina', 'risk'],
      apply: (ctx, rng) => { spendStamina(ctx, 60); return rng.chance(200_000) && catchIllness(ctx, 'illness.cold', 'mild', 2) ? { result: 'camp_cold' } : { result: 'camp' }; },
    },
    {
      id: 'push_on', costs: ['risk'],
      apply: (ctx, rng) => { if (rng.chance(300_000)) { wound(ctx, 2); return { result: 'push_on_hurt' }; } return { result: 'push_on' }; },
    },
  ],
};

export const ROAD: readonly EventDef[] = [highwayRobbers, wildBeast, lostInMountains];
