// Sự kiện sinh kế (ADR 0012, 0014; văn phong: docs/van-phong.md).
import { GRAIN_PER_DOU, TICKS_PER_YEAR } from '@tsvl/shared';
import { idiv } from '../../core/math';
import { HARVEST_MONTH, sellPrice, supplyOf } from '../../economy/market';
import { giveGrainTo, heal, loseGrain, moveGrain, occupy, payTo, receiveFrom, spendStamina, wound, sellGrainTo } from '../effects';
import type { EventContext, EventDef } from '../engine';
import { kinRole } from '../../npc/family';
import { figure, here, inVillage, man, month, nearestTown, percentOf, personality, sellValue, castOr, nearestWith, npcName, npcAge, peopleHere, pickOne } from './common';

/** Đấu đổi tay mỗi lần mua bán trong sự kiện (20 đấu = 200 thăng). */
export const DEAL_GRAIN = 200;
export const BROKER_PCT = 70;
export const FEAST_GRAIN = 30;
export const LOAN_PRINCIPAL = 300;
/** Lãi ba phân một tháng, trả sau một năm: gộp 36% (ADR 0012 không có ngân hàng; đây là chủ nợ trong làng). */
export const LOAN_INTEREST_PCT = 36;
export const POLICE_FEE = 20;
export const THEFT_PCT = 20;
/** Kẻ trộm có tên (v0.5 S7): lương mất vào kho người ấy; không có tên thì mất hẳn. */
const stolen = (ctx: EventContext): number => {
  const g = percentOf(ctx.c.household.grain, THEFT_PCT);
  return ctx.npc ? giveGrainTo(ctx, ctx.npc, g) : loseGrain(ctx, g);
};
export const RENT_HIKE_PCT = 10;
export const RENT_GIFT = 60;

export const goodHarvest: EventDef = {
  id: 'event.good_harvest',
  category: 'economy',
  // Ngay sau mùa gặt của năm được mùa, nhà có lúa đầy kho
  weight: (ctx) => (month(ctx) === HARVEST_MONTH && here(ctx).weatherPct >= 110 && ctx.c.household.grain >= 300 ? 400_000 : 0),
  cooldownTicks: 30,
  choices: [
    {
      id: 'sell_half', costs: ['grain'],
      apply: (ctx) => {
        const n = idiv(ctx.c.household.grain, 4);
        const got = receiveFrom(ctx, ctx.c.location, sellValue(here(ctx), n));
        moveGrain(ctx, ctx.c.location, -n);
        return { result: 'sell_half', params: { money: got, grain: idiv(n, GRAIN_PER_DOU) } };
      },
    },
    {
      id: 'feast', costs: ['grain'],
      apply: (ctx) => { moveGrain(ctx, ctx.c.location, -FEAST_GRAIN); heal(ctx, 30); return { result: 'feast' }; },
    },
    {
      id: 'store', costs: ['risk'],
      // Đổ đầy kho chờ giá lên: kho chật, ẩm mốc dễ hao
      apply: (ctx, rng) => (rng.chance(400_000) ? { result: 'store_spoiled', params: { lost: idiv(loseGrain(ctx, percentOf(ctx.c.household.grain, 5)), GRAIN_PER_DOU) } } : { result: 'store' }),
    },
  ],
};

export const grainBroker: EventDef = {
  id: 'event.grain_broker',
  category: 'economy',
  weight: (ctx) => ((month(ctx) === 9 || month(ctx) === 10) && inVillage(ctx) && ctx.c.household.grain >= 300 ? 150_000 : 0),
  cooldownTicks: 30,
  // Người thật (S6): thương nhân NPC gần nhất đủ bạc mua; mua bán đi qua túi, kho người ấy. Bán thì quen mặt, tin nhau hơn
  bonds: { sell: { closeness: 5, trust: 5 } },
  cast: (ctx) => nearestWith(ctx, (n) => n.occupation === 'merchant' && n.character.household.money >= sellValue(here(ctx), DEAL_GRAIN, BROKER_PCT)),
  variant: (ctx) => (ctx.npc ? 'named' : null),
  params: (ctx) => ({ offer: percentOf(sellPrice(here(ctx)), BROKER_PCT), ...npcName(ctx) }),
  figure: castOr(() => man('adult', 'rich')),
  choices: [
    {
      id: 'sell', costs: ['grain'],
      apply: (ctx) => {
        const value = sellValue(here(ctx), DEAL_GRAIN, BROKER_PCT);
        if (ctx.npc) return { result: 'sell', params: { money: sellGrainTo(ctx, ctx.npc, DEAL_GRAIN, value) } };
        const got = receiveFrom(ctx, ctx.c.location, value);
        moveGrain(ctx, ctx.c.location, -DEAL_GRAIN);
        return { result: 'sell', params: { money: got } };
      },
    },
    {
      id: 'haul', costs: ['time', 'risk'],
      available: (ctx) => (nearestTown(ctx) === null ? 'lock.route' : null),
      apply: (ctx) => {
        const town = nearestTown(ctx)!;
        const got = receiveFrom(ctx, town, sellValue(ctx.eco.counties[town]!, DEAL_GRAIN));
        moveGrain(ctx, town, -DEAL_GRAIN);
        occupy(ctx, 'action.toil', 1);
        return { result: 'haul', params: { money: got } };
      },
    },
    { id: 'keep', costs: ['grain'], apply: (ctx) => { loseGrain(ctx, percentOf(ctx.c.household.grain, 2)); return { result: 'keep' }; } },
  ],
};

export const riceSpike: EventDef = {
  id: 'event.rice_spike',
  category: 'economy',
  // Chợ khan lương mà nhà còn thóc: người ta tìm tới hỏi mua
  weight: (ctx) => {
    const s = supplyOf(here(ctx));
    return ctx.age >= 14 && (s === 'scarce' || s === 'famine') && ctx.c.household.grain >= 300 ? 60_000 : 0;
  },
  cooldownTicks: 36,
  // Tiếng tăm ở quận đang đứng (v0.5 S6, Q9)
  reputation: { share: 8, hoard: -5, hoard_robbed: -5 },
  params: (ctx) => ({ price: here(ctx).price }),
  choices: [
    {
      id: 'sell_high', costs: ['grain'],
      apply: (ctx) => {
        const got = receiveFrom(ctx, ctx.c.location, sellValue(here(ctx), DEAL_GRAIN));
        moveGrain(ctx, ctx.c.location, -DEAL_GRAIN);
        return { result: 'sell_high', params: { money: got } };
      },
    },
    {
      id: 'share', costs: ['grain'],
      // Chia thóc cho xóm đói: chỉ người hiền hậu, chính trực
      available: (ctx) => (personality(ctx, 'kind', 'righteous') ? null : 'lock.personality'),
      apply: (ctx) => { moveGrain(ctx, ctx.c.location, -DEAL_GRAIN); return { result: 'share' }; },
    },
    {
      id: 'hoard', costs: ['risk'],
      apply: (ctx, rng) => (rng.chance(200_000) ? { result: 'hoard_robbed', params: { lost: idiv(loseGrain(ctx, percentOf(ctx.c.household.grain, 10)), GRAIN_PER_DOU) } } : { result: 'hoard' }),
    },
  ],
};

export const usurer: EventDef = {
  id: 'event.usurer',
  category: 'economy',
  // Túng quẫn: không tiền, lương sắp cạn hoặc đang đói; chưa có món nợ nào
  weight: (ctx) => {
    const h = ctx.c.household;
    return ctx.age >= 16 && h.loan === 0 && h.money < 30 && (h.grain < 50 || h.hunger > 0) ? 60_000 : 0;
  },
  cooldownTicks: 72,
  params: () => ({ principal: LOAN_PRINCIPAL, owed: LOAN_PRINCIPAL + percentOf(LOAN_PRINCIPAL, LOAN_INTEREST_PCT) }),
  figure: () => man('adult', 'rich'),
  choices: [
    {
      id: 'borrow', costs: ['money'],
      apply: (ctx) => {
        const got = receiveFrom(ctx, ctx.c.home, LOAN_PRINCIPAL);
        ctx.c.household.loan += got + percentOf(got, LOAN_INTEREST_PCT);
        ctx.c.household.loanDue = ctx.tick + TICKS_PER_YEAR;
        return { result: 'borrow' };
      },
    },
    { id: 'endure', costs: ['opportunity'], apply: () => ({ result: 'endure' }) },
  ],
};

export const granaryTheft: EventDef = {
  id: 'event.granary_theft',
  category: 'economy',
  weight: (ctx) => (ctx.age >= 12 && ctx.c.household.grain >= 300 ? 8_000 : 0),
  cooldownTicks: 108,
  // Tiếng tăm ở quận đang đứng (v0.5 S6, Q9)
  reputation: { chase_caught: 5 },
  // Người thật (v0.5 S7): một người nghèo, đang đói ở quận này. Bị bắt quả tang thì người ấy thành thù
  bonds: { chase_caught: { hostility: 30 }, report_found: { hostility: 30 } },
  cast: (ctx, rng) => pickOne(peopleHere(ctx).filter((n) => { const a = npcAge(ctx, n); return a >= 16 && a < 46 && n.character.household.hunger > 0 && kinRole(ctx.c, n) === null; }), rng),
  variant: (ctx) => (ctx.npc ? 'named' : null),
  figure: castOr((_ctx, rng) => figure(rng, 'young', 'poor')),
  params: (ctx) => ({ ...npcName(ctx), fee: POLICE_FEE }),
  choices: [
    {
      id: 'chase', costs: ['risk'],
      apply: (ctx, rng) => {
        if (rng.chance(400_000 + ctx.c.luck * 20_000)) return { result: 'chase_caught' };
        wound(ctx, 1);
        return { result: 'chase_lost', params: { lost: idiv(stolen(ctx), GRAIN_PER_DOU) } };
      },
    },
    {
      id: 'report', costs: ['money', 'risk'],
      available: (ctx) => (ctx.c.household.money >= POLICE_FEE ? null : 'lock.money'),
      apply: (ctx, rng) => {
        payTo(ctx, ctx.c.location, POLICE_FEE);
        if (rng.chance(400_000)) return { result: 'report_found' };
        return { result: 'report_lost', params: { lost: idiv(stolen(ctx), GRAIN_PER_DOU) } };
      },
    },
    { id: 'accept', costs: ['grain'], apply: (ctx) => ({ result: 'accept', params: { lost: idiv(stolen(ctx), GRAIN_PER_DOU) } }) },
  ],
};

export const rentHike: EventDef = {
  id: 'event.rent_hike',
  category: 'economy',
  // Đầu mùa, người cấy ruộng thuê bị chủ đất đòi thêm tô
  weight: (ctx) => {
    const h = ctx.c.household;
    const tenant = h.tenure !== 'owner' && h.tenure !== 'landlord';
    return tenant && h.farmWeeks >= 3 && h.rentHikePct === 0 && month(ctx) >= 2 && month(ctx) <= 5 ? 50_000 : 0;
  },
  cooldownTicks: 108,
  params: () => ({ hike: RENT_HIKE_PCT, gift: RENT_GIFT }),
  figure: () => man('adult', 'rich'),
  choices: [
    { id: 'accept', costs: ['grain'], apply: (ctx) => { ctx.c.household.rentHikePct = RENT_HIKE_PCT; return { result: 'accept' }; } },
    {
      id: 'gift', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= RENT_GIFT ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, RENT_GIFT); return { result: 'gift' }; },
    },
    { id: 'quit', costs: ['opportunity'], apply: (ctx) => { ctx.c.household.farmWeeks = 0; return { result: 'quit' }; } },
  ],
};

export const taxCollector: EventDef = {
  id: 'event.tax_collector',
  category: 'economy',
  // Còn nợ thuế đinh (S4) thì quan sai sớm muộn cũng tới
  weight: (ctx) => (ctx.c.household.independent && ctx.c.household.taxDebt > 0 ? 150_000 : 0),
  cooldownTicks: 12,
  // Tiếng tăm ở quận đang đứng (v0.5 S6, Q9)
  reputation: { flee_caught: -10, flee_escaped: -10 },
  params: (ctx) => ({ amount: ctx.c.household.taxDebt }),
  figure: () => man('adult', 'official'),
  choices: [
    {
      id: 'pay', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= ctx.c.household.taxDebt ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.home, ctx.c.household.taxDebt); ctx.c.household.taxDebt = 0; return { result: 'pay' }; },
    },
    {
      id: 'corvee', costs: ['time', 'stamina'],
      // Đi phu trừ thuế: không đi được khi đang dở một chuyến đi hay việc dài
      available: (ctx) => (ctx.player.active ? 'lock.busy' : null),
      apply: (ctx) => { ctx.c.household.taxDebt = 0; occupy(ctx, 'action.corvee'); return { result: 'corvee' }; },
    },
    {
      id: 'flee', costs: ['risk', 'opportunity'],
      // Trốn: phúc duyên cao thì dễ thoát; bị bắt thì ăn đòn, nợ vẫn còn, quan sai sẽ quay lại
      apply: (ctx, rng) => {
        if (rng.chance(600_000 - ctx.c.luck * 40_000)) { wound(ctx, 2); spendStamina(ctx, 60); return { result: 'flee_caught' }; }
        return { result: 'flee_escaped' };
      },
    },
  ],
};

export const ECONOMY: readonly EventDef[] = [goodHarvest, grainBroker, riceSpike, taxCollector, usurer, granaryTheft, rentHike];
