// Sức khỏe (ADR 0014; văn phong: docs/van-phong.md).
import { HEAL_FEE } from '../../economy/income';
import { catchIllness, heal, hurt, loseGrain, payTo } from '../effects';
import type { EventDef } from '../engine';
import { figure, ill, inTown, inVillage, man, castOr, nearestWith, npcName } from './common';

/** Phí thầy thuốc giỏi đi ngang: bằng phí chữa bệnh nặng ở trấn, nhưng tới tận nơi. */
export const WANDERING_PHYSICIAN_FEE = HEAL_FEE.serious + 50;
export const QUACK_PRICE = 80;
export const SPOILED_GRAIN = 5;

export const wanderingPhysician: EventDef = {
  id: 'event.wandering_physician',
  category: 'health',
  // Thầy thuốc giỏi chỉ đi ngang làng; ở trấn, thành thì đã có thầy thuốc
  weight: (ctx) => (ctx.age >= 12 && ill(ctx) && inVillage(ctx) ? 60_000 : 0),
  cooldownTicks: 108,
  // Người thật (S6): thầy thuốc NPC ở trấn, thành gần nhất (theo km giữa trị sở)
  cast: (ctx) => nearestWith(ctx, (n) => n.occupation === 'physician'),
  variant: (ctx) => (ctx.npc ? 'named' : null),
  params: (ctx) => ({ fee: WANDERING_PHYSICIAN_FEE, ...npcName(ctx) }),
  figure: castOr((_ctx, rng) => figure(rng, rng.int(0, 1) === 0 ? 'adult' : 'old', 'common')),
  choices: [
    {
      id: 'pay', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= WANDERING_PHYSICIAN_FEE ? null : 'lock.money'),
      apply: (ctx) => {
        payTo(ctx, ctx.c.location, WANDERING_PHYSICIAN_FEE);
        ctx.c.conditions = ctx.c.conditions.filter((x) => x.kind !== 'illness');
        heal(ctx, 50);
        return { result: 'pay' };
      },
    },
    {
      id: 'herbs', costs: ['risk'],
      // Tự hái lá thuốc theo lời chỉ: hên thì đỡ, xui thì nặng thêm
      apply: (ctx, rng) => {
        if (rng.chance(500_000)) {
          for (const x of ctx.c.conditions) if (x.kind === 'illness') x.weeksLeft = Math.max(1, x.weeksLeft - 2);
          return { result: 'herbs_ok' };
        }
        hurt(ctx, 30);
        return { result: 'herbs_bad' };
      },
    },
  ],
};

export const quack: EventDef = {
  id: 'event.quack',
  category: 'health',
  // Chợ trấn có kẻ rao thuốc tiên; người đang ốm, đang yếu dễ động lòng
  weight: (ctx) => (ctx.age >= 12 && inTown(ctx) && (ill(ctx) || ctx.c.health < 600) ? 40_000 : 0),
  cooldownTicks: 108,
  params: () => ({ price: QUACK_PRICE }),
  figure: () => man('adult', 'common'),
  choices: [
    {
      id: 'buy', costs: ['money', 'risk'],
      available: (ctx) => (ctx.c.household.money >= QUACK_PRICE ? null : 'lock.money'),
      apply: (ctx, rng) => {
        payTo(ctx, ctx.c.location, QUACK_PRICE);
        const roll = rng.int(0, 9);
        if (roll < 3) { for (const x of ctx.c.conditions) if (x.kind === 'illness') x.weeksLeft = Math.max(1, x.weeksLeft - 2); heal(ctx, 20); return { result: 'buy_helped' }; }
        if (roll === 9) { hurt(ctx, 30); return { result: 'buy_worse' }; }
        return { result: 'buy_nothing' };
      },
    },
    { id: 'ignore', costs: ['opportunity'], apply: () => ({ result: 'ignore' }) },
  ],
};

export const spoiledFood: EventDef = {
  id: 'event.spoiled_food',
  category: 'health',
  // Đang đói mà trong nhà chỉ còn chút đồ ăn đã ôi
  weight: (ctx) => (ctx.age >= 12 && ctx.c.household.hunger > 0 && ctx.c.household.grain >= SPOILED_GRAIN && ctx.c.household.grain < 60 ? 80_000 : 0),
  cooldownTicks: 72,
  choices: [
    {
      id: 'eat', costs: ['health', 'risk'],
      apply: (ctx, rng) => (rng.chance(400_000) && catchIllness(ctx, 'illness.dysentery', 'grave', 2) ? { result: 'eat_sick' } : { result: 'eat' }),
    },
    { id: 'throw_out', costs: ['grain'], apply: (ctx) => { loseGrain(ctx, SPOILED_GRAIN); ctx.c.household.hunger += 1; return { result: 'throw_out' }; } },
  ],
};

export const HEALTH: readonly EventDef[] = [wanderingPhysician, quack, spoiledFood];
