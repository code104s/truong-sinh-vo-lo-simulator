// Sự kiện đời thường (ADR 0014; văn phong: docs/van-phong.md, giọng E).
import { ageYearsAt, GRAIN_PER_DOU, TICKS_PER_YEAR } from '@tsvl/shared';
import { becomeIndependent } from '../../life/household';
import { gainSkill } from '../../life/skills';
import { idiv } from '../../core/math';
import { giveGrainTo, heal, loseGrain, moveGrain, payTo, refresh, spendStamina, wound, woundNpc } from '../effects';
import type { EventContext, EventDef } from '../engine';
import { npcFigure, type NpcState } from '../../npc/state';
import { castOr, figure, inTown, inVillage, man, month, nearestTown, npcAge, npcName, peopleHere, personality, pickOne, doingNow } from './common';

/**
 * Lập thân (G2): viết ở S6, bật ở S7 cùng chiến lược batch có kinh tế (giữ một năm ăn, bán phần thừa, giữ tiền thuế).
 * Ra riêng là lúc đói nghèo có thật.
 */
export const COMING_OF_AGE_LIVE = true;
export const STAY_UNTIL_AGE = 20;
export const FESTIVAL_DUES = 50;
export const FUNERAL_GIFT = 30;
export const BOOKS_PRICE = 40;

export const comingOfAge: EventDef = {
  id: 'event.coming_of_age',
  category: 'daily',
  weight: (ctx) => (COMING_OF_AGE_LIVE && ctx.age >= 16 && !ctx.c.household.independent && ctx.c.household.stayUntil === 0 ? 1_000_000 : 0),
  cooldownTicks: 0,
  oncePerLife: true,
  variant: (ctx) => (ctx.c.background === 'destitute' ? 'poor' : ctx.c.background === 'wealthy' ? 'rich' : null),
  figure: () => man('adult', 'common'),
  choices: [
    {
      id: 'stay', costs: ['money', 'time'],
      apply: (ctx) => { ctx.c.household.stayUntil = STAY_UNTIL_AGE; return { result: 'stay' }; },
    },
    {
      id: 'leave_town', costs: ['risk', 'opportunity'],
      // Bỏ ruộng lên trấn: chỉ kẻ có chí lớn hay khéo xoay xở mới dám
      available: (ctx) => (personality(ctx, 'ambitious', 'cunning') ? null : 'lock.personality'),
      apply: (ctx) => {
        const got = becomeIndependent(ctx.c, ctx.eco.counties[ctx.c.home]!, { landless: true });
        const town = nearestTown(ctx);
        if (town !== null) ctx.c.location = town;
        return { result: 'leave_town', params: { money: got.money } };
      },
    },
    {
      id: 'leave', costs: ['opportunity'],
      apply: (ctx) => {
        const got = becomeIndependent(ctx.c, ctx.eco.counties[ctx.c.home]!);
        return { result: 'leave', params: { money: got.money, grain: idiv(got.grain, GRAIN_PER_DOU), land: got.landMu } };
      },
    },
  ],
};

export const BEGGAR_GIFT = 10;
export const BEGGAR_MEAL = 30;

export const beggar: EventDef = {
  id: 'event.beggar',
  category: 'daily',
  // Người xin ăn chỉ tới nhà có cái ăn; mùa đông đói rét nên tới nhiều hơn
  weight: (ctx) => (ctx.age >= 12 && ctx.c.household.grain >= BEGGAR_GIFT ? (month(ctx) >= 10 ? 50_000 : 30_000) : 0),
  cooldownTicks: 48,
  // Người thật (S6): ai trong quận đang đói, hết gạo; cho thì gạo vào kho người ấy
  cast: (ctx, rng) => pickOne(peopleHere(ctx).filter((n) => { const h = n.character.household; return h.independent && (h.hunger > 0 || (h.grain < BEGGAR_MEAL && h.money < BEGGAR_MEAL)); }), rng),
  variant: (ctx) => (ctx.npc ? 'named' : month(ctx) >= 10 ? 'winter' : null),
  params: npcName,
  figure: castOr((_ctx, rng) => figure(rng, rng.int(0, 1) === 0 ? 'old' : 'child', 'poor')),
  choices: [
    { id: 'give', costs: ['grain'], apply: (ctx) => ({ result: 'give', params: { lost: ctx.npc ? giveGrainTo(ctx, ctx.npc, BEGGAR_GIFT) : loseGrain(ctx, BEGGAR_GIFT) } }) },
    {
      id: 'share_meal', costs: ['grain', 'stamina'],
      // Nấu cho bữa nóng, giữ lại qua đêm: chỉ người hiền hậu hay chính trực mới làm
      available: (ctx) => (personality(ctx, 'kind', 'righteous') ? null : 'lock.personality'),
      apply: (ctx) => { const lost = ctx.npc ? giveGrainTo(ctx, ctx.npc, BEGGAR_MEAL) : loseGrain(ctx, BEGGAR_MEAL); spendStamina(ctx, 40); return { result: 'share_meal', params: { lost } }; },
    },
    {
      id: 'refuse', costs: ['risk'],
      apply: (ctx, rng) => (rng.chance(200_000) ? { result: 'refuse_stolen', params: { lost: ctx.npc ? giveGrainTo(ctx, ctx.npc, 5) : loseGrain(ctx, 5) } } : { result: 'refuse' }),
    },
  ],
};

export const villageFestival: EventDef = {
  id: 'event.village_festival',
  category: 'daily',
  // Hội làng đầu xuân (tháng Giêng) và rằm tháng Tám
  weight: (ctx) => (ctx.age >= 12 && inVillage(ctx) && (month(ctx) === 1 || month(ctx) === 8) ? 120_000 : 0),
  cooldownTicks: 100,
  variant: (ctx) => (month(ctx) === 8 ? 'autumn' : null),
  figure: () => man('old', 'common'),
  params: () => ({ dues: FESTIVAL_DUES }),
  choices: [
    {
      id: 'pay_dues', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= FESTIVAL_DUES ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, FESTIVAL_DUES); refresh(ctx, 200); heal(ctx, 20); return { result: 'pay_dues' }; },
    },
    {
      id: 'labor', costs: ['stamina'],
      apply: (ctx) => { spendStamina(ctx, 60); heal(ctx, 20); return { result: 'labor' }; },
    },
    { id: 'stay_home', costs: ['opportunity'], apply: () => ({ result: 'stay_home' }) },
  ],
};

export const NEIGHBOR_PAY = 20;

export const neighborHarvest: EventDef = {
  id: 'event.neighbor_harvest',
  category: 'daily',
  // Mùa gặt tháng Chín, người còn sức
  weight: (ctx) => (ctx.age >= 14 && inVillage(ctx) && month(ctx) === 9 && ctx.c.stamina >= 300 ? 80_000 : 0),
  cooldownTicks: 36,
  figure: (_ctx, rng) => figure(rng, 'adult', 'common'),
  choices: [
    {
      id: 'help', costs: ['stamina', 'time'],
      apply: (ctx) => { spendStamina(ctx, 150); const got = moveGrain(ctx, ctx.c.location, NEIGHBOR_PAY); return { result: 'help', params: { got } }; },
    },
    { id: 'decline', costs: ['opportunity'], apply: () => ({ result: 'decline' }) },
  ],
};

export const marketBrawl: EventDef = {
  id: 'event.market_brawl',
  category: 'daily',
  // Chợ trấn đông người dễ sinh chuyện; người nóng nảy dễ dính vào hơn
  weight: (ctx) => (ctx.age >= 14 && inTown(ctx) ? (personality(ctx, 'hot_tempered') ? 60_000 : 25_000) : 0),
  cooldownTicks: 72,
  // Người thật (S6): một người lớn trẻ ở trấn; lảng đi thì người ấy bị đánh bị thương
  cast: (ctx, rng) => pickOne(peopleHere(ctx).filter((n) => { const a = npcAge(ctx, n); return a >= 16 && a < 50; }), rng),
  variant: (ctx) => (ctx.npc ? 'named' : null),
  params: npcName,
  figure: castOr(() => man('young', 'poor')),
  choices: [
    {
      id: 'break_up', costs: ['stamina', 'risk'],
      apply: (ctx, rng) => { spendStamina(ctx, 40); if (rng.chance(200_000)) { wound(ctx, 1); return { result: 'break_up_hurt' }; } return { result: 'break_up' }; },
    },
    {
      id: 'join', costs: ['health', 'risk'],
      available: (ctx) => (personality(ctx, 'hot_tempered', 'righteous') ? null : 'lock.personality'),
      apply: (ctx, rng) => {
        gainSkill(ctx.c, 'martial', ctx.tick, 100);
        if (rng.chance(500_000)) { wound(ctx, 2); return { result: 'join_hurt' }; }
        return { result: 'join' };
      },
    },
    { id: 'walk_away', costs: ['opportunity'], apply: (ctx) => { if (!ctx.npc) return { result: 'walk_away' }; woundNpc(ctx.npc, 2); return { result: 'walk_away_named' }; } },
  ],
};

/** Người trong quận mất gần nhất, trong vòng một năm (người mất ở lại danh sách một năm, S4). */
function recentDead(ctx: EventContext): NpcState | null {
  let best: NpcState | null = null;
  for (const n of ctx.npcs.people) {
    if (!n.death || n.death.tick > ctx.tick || n.character.location !== ctx.c.location || ctx.tick - n.death.tick > TICKS_PER_YEAR) continue;
    if (!best || n.death.tick > best.death!.tick) best = n;
  }
  return best;
}

export const villageFuneral: EventDef = {
  id: 'event.village_funeral',
  category: 'daily',
  // Người thật (S6): người trong quận vừa mất trong năm; có người mất thật thì đám tang dễ xảy ra hơn
  weight: (ctx) => (ctx.age >= 12 && inVillage(ctx) ? (recentDead(ctx) ? 100_000 : 25_000) : 0),
  cooldownTicks: 72,
  cast: (ctx) => recentDead(ctx),
  variant: (ctx) => (ctx.npc ? 'named' : null),
  params: (ctx) => ({ gift: FUNERAL_GIFT, ...npcName(ctx), ...(ctx.npc ? { age: ageYearsAt(ctx.npc.character.birthTick, ctx.npc.death!.tick) } : {}) }),
  figure: (ctx) => (ctx.npc ? npcFigure(ctx.npc, ctx.npc.death!.tick) : null),
  choices: [
    {
      id: 'condolence', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= FUNERAL_GIFT ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, FUNERAL_GIFT); return { result: 'condolence' }; },
    },
    { id: 'help', costs: ['stamina', 'time'], apply: (ctx) => { spendStamina(ctx, 60); return { result: 'help' }; } },
    { id: 'stay_away', costs: ['opportunity'], apply: () => ({ result: 'stay_away' }) },
  ],
};

export const teacherWord: EventDef = {
  id: 'event.teacher_word',
  category: 'daily',
  // Đang theo học ở trấn: thầy đồ khen người sáng dạ, chê người chậm hiểu
  weight: (ctx) => (inTown(ctx) && doingNow(ctx) === 'action.study' ? 50_000 : 0),
  cooldownTicks: 108,
  variant: (ctx) => (ctx.c.aptitude >= 7 ? null : 'scold'),
  figure: () => man('old', 'common'),
  params: () => ({ price: BOOKS_PRICE }),
  choices: [
    {
      id: 'buy_books', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= BOOKS_PRICE ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, BOOKS_PRICE); gainSkill(ctx.c, 'literacy', ctx.tick, 200); return { result: 'buy_books' }; },
    },
    { id: 'thank', costs: ['opportunity'], apply: () => ({ result: 'thank' }) },
  ],
};


export const DAILY: readonly EventDef[] = [comingOfAge, beggar, villageFestival, neighborHarvest, marketBrawl, villageFuneral, teacherWord];
