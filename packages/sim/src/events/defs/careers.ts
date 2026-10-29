// Sự kiện theo nghề (v0.7 S8, ADR 0020 Q3): mỗi nghề năm chuyện riêng, đến với người đang làm nghề ấy (trọng số theo
// thân phận nghề, việc đang làm, nơi đứng). Tiền, lương, hàng đi qua quỹ quận, kho thế lực hay túi người thật (sổ cái giữ);
// thái độ thế lực qua bảng `attitude` (S7). Văn phong: docs/van-phong.md (giọng E); văn bản ở content `events.careers.vi.ts`.
import { GOODS, HARVEST_MONTH, type CareerId, type CareerRank } from '@tsvl/shared';
import { idiv, mulDiv } from '../../core/math';
import { addGoods } from '../../economy/income';
import { epidemicAt } from '../../economy/market';
import { hasRank, leaveCareer, type CareerWorld } from '../../life/career';
import type { PlayerState } from '../../life/player';
import { gainSkill } from '../../life/skills';
import { joinBand } from '../../life/wayward';
import { GREEDY_FROM } from '../../factions/government';
import { isHostile } from '../../factions/attitude';
import type { NpcState } from '../../npc/state';
import { kinRole } from '../../npc/family';
import {
  addFlag, catchIllness, giveGrainTo, hurt, moveGrain, occupy, payFaction, payNpc, payTo, receiveFrom, receiveFromFaction, refresh, spendStamina, wound,
} from '../effects';
import type { ChoiceOutcome, EventContext, EventDef } from '../engine';
import { bandNear, bandOnRoad, castOr, doingNow, government, guildAt, here, inTown, inVillage, leadClan, man, month, npcAge, npcName, peopleHere, percentOf, pickOne, season, traveling } from './common';

const HIDE = GOODS.indexOf('hide'), WARES = GOODS.indexOf('wares'), HERB = GOODS.indexOf('herb');
/** Đang làm nghề này, từ bậc `min`. */
const is = (ctx: EventContext, id: CareerId, min: CareerRank = 'apprentice') => hasRank(ctx.player.career, id, min);
const named = (ctx: EventContext) => (ctx.npc ? 'named' : null);
/** Tiền từ túi một người thật sang túi người chơi (quà, tiền hùn trả lại), trong giới hạn túi người ấy. */
function takeMoneyFrom(ctx: EventContext, n: NpcState | null, amount: number): number {
  if (!n) return receiveFrom(ctx, ctx.c.location, amount);
  const got = Math.max(0, Math.min(amount, n.character.household.money));
  n.character.household.money -= got; ctx.c.household.money += got;
  return got;
}
const money = (ctx: EventContext, x: number) => (ctx.c.household.money >= x ? null : 'lock.money');
const grain = (ctx: EventContext, x: number) => (ctx.c.household.grain >= x ? null : 'lock.grain');
/** Thân phận nghề trong snapshot đời: đổi qua bản tạm rồi chép lại (như vào băng, S6). */
function careerWorld(ctx: EventContext): CareerWorld & { commit(): void } {
  const p = ctx.player as PlayerState & CareerWorld;
  const w = { career: p.career ?? null, careers: p.careers, commit: () => { p.career = w.career; } };
  return w;
}
const CAREER_W = 12_000;
const CAREER_COOLDOWN = 144;

// —— Nông dân ——
export const SEED_PRICE = 80;
export const farmSeedSwap: EventDef = {
  id: 'event.farm_seed_swap', career: 'farmer', category: 'economy',
  weight: (ctx) => (is(ctx, 'farmer') && season(ctx) === 'spring' && inVillage(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  params: () => ({ price: SEED_PRICE }),
  figure: () => man('old', 'common'),
  choices: [
    { id: 'buy', costs: ['money'], available: (ctx) => money(ctx, SEED_PRICE), apply: (ctx) => { payTo(ctx, ctx.c.location, SEED_PRICE); gainSkill(ctx.c, 'farming', ctx.tick, 200); return { result: 'buy' }; } },
    { id: 'trade_labor', costs: ['time', 'stamina'], apply: (ctx) => { occupy(ctx, 'action.toil', 1); gainSkill(ctx.c, 'farming', ctx.tick, 120); return { result: 'trade_labor' }; } },
    { id: 'keep_old', costs: ['opportunity'], apply: () => ({ result: 'keep_old' }) },
  ],
};

export const farmWaterTurn: EventDef = {
  id: 'event.farm_water_turn', career: 'farmer', category: 'daily',
  weight: (ctx) => (is(ctx, 'farmer') && season(ctx) === 'summer' && ctx.c.household.farmWeeks > 0 ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  reputation: { argue_won: -2, argue_lost: -2 },
  figure: () => man('adult', 'common'),
  choices: [
    { id: 'night_water', costs: ['stamina', 'health'], apply: (ctx) => { spendStamina(ctx, 90); hurt(ctx, 20); return { result: 'night_water' }; } },
    {
      id: 'argue', costs: ['risk'],
      apply: (ctx, rng): ChoiceOutcome => {
        if (rng.chance(500_000)) return { result: 'argue_won' };
        wound(ctx, 2);
        return { result: 'argue_lost' };
      },
    },
    // Chờ lượt: lúa thiếu nước, mùa này coi như mất một tuần công
    { id: 'wait', costs: ['opportunity'], apply: (ctx) => { ctx.c.household.farmWeeks = Math.max(0, ctx.c.household.farmWeeks - 1); return { result: 'wait' }; } },
  ],
};

export const BUMPER_SELL = 100;
export const BUMPER_PCT = 120;
export const farmBumperPrice: EventDef = {
  id: 'event.farm_bumper_price', career: 'farmer', category: 'economy',
  weight: (ctx) => (is(ctx, 'farmer') && month(ctx) === HARVEST_MONTH && ctx.c.household.grain >= BUMPER_SELL * 3 ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  params: () => ({ dou: idiv(BUMPER_SELL, 10) }),
  figure: () => man('adult', 'rich'),
  choices: [
    {
      id: 'sell', costs: ['grain'], available: (ctx) => grain(ctx, BUMPER_SELL),
      apply: (ctx) => {
        const g = moveGrain(ctx, ctx.c.location, -BUMPER_SELL);
        const got = receiveFrom(ctx, ctx.c.location, mulDiv(mulDiv(g, here(ctx).price, 10), BUMPER_PCT, 100));
        return { result: 'sell', params: { money: got } };
      },
    },
    { id: 'store', costs: ['opportunity'], apply: () => ({ result: 'store' }) },
  ],
};

export const OLD_HAND_WINE = 30;
export const farmOldHand: EventDef = {
  id: 'event.farm_old_hand', career: 'farmer', category: 'daily',
  weight: (ctx) => (is(ctx, 'farmer') && !is(ctx, 'farmer', 'master') && inVillage(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  bonds: { treat: { closeness: 8, trust: 5 }, listen: { closeness: 3 } },
  cast: (ctx, rng) => pickOne(peopleHere(ctx).filter((n) => n.occupation === 'farmer' && npcAge(ctx, n) >= 50), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), price: OLD_HAND_WINE }),
  figure: castOr(() => man('old', 'poor')),
  choices: [
    { id: 'treat', costs: ['money'], available: (ctx) => money(ctx, OLD_HAND_WINE), apply: (ctx) => { if (ctx.npc) payNpc(ctx, ctx.npc, OLD_HAND_WINE); else payTo(ctx, ctx.c.location, OLD_HAND_WINE); gainSkill(ctx.c, 'farming', ctx.tick, 400); return { result: 'treat' }; } },
    { id: 'listen', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 20); gainSkill(ctx.c, 'farming', ctx.tick, 200); return { result: 'listen' }; } },
    { id: 'busy', costs: ['opportunity'], apply: () => ({ result: 'busy' }) },
  ],
};

export const VET_FEE = 150;
export const farmBuffaloSick: EventDef = {
  id: 'event.farm_buffalo_sick', career: 'farmer', category: 'economy',
  weight: (ctx) => (is(ctx, 'farmer') && ctx.c.household.landMu >= 3 && inVillage(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  params: () => ({ price: VET_FEE }),
  choices: [
    { id: 'vet', costs: ['money'], available: (ctx) => money(ctx, VET_FEE), apply: (ctx) => { payTo(ctx, ctx.c.location, VET_FEE); return { result: 'vet' }; } },
    {
      id: 'herbs', costs: ['opportunity'], available: (ctx) => (ctx.c.household.goods[HERB]! >= 10 ? null : 'lock.no_herb'),
      apply: (ctx) => { ctx.c.household.goods[HERB]! -= 10; return { result: 'herbs' }; },
    },
    {
      id: 'wait', costs: ['risk'],
      apply: (ctx, rng): ChoiceOutcome => {
        if (rng.chance(500_000)) return { result: 'wait_ok' };
        ctx.c.household.farmWeeks = Math.max(0, ctx.c.household.farmWeeks - 2);
        return { result: 'wait_died' };
      },
    },
  ],
};

// —— Thợ thủ công ——
export const BIG_ORDER_PAY = 400;
export const craftBigOrder: EventDef = {
  id: 'event.craft_big_order', career: 'artisan', category: 'economy',
  weight: (ctx) => (is(ctx, 'artisan', 'journeyman') && inTown(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  params: () => ({ money: BIG_ORDER_PAY, rush: idiv(BIG_ORDER_PAY * 3, 4) }),
  figure: () => man('adult', 'rich'),
  choices: [
    { id: 'take', costs: ['time'], apply: (ctx) => { occupy(ctx, 'action.toil', 2); return { result: 'take', params: { got: receiveFrom(ctx, ctx.c.location, BIG_ORDER_PAY) } }; } },
    { id: 'rush', costs: ['stamina', 'health'], apply: (ctx) => { spendStamina(ctx, 150); hurt(ctx, 40); return { result: 'rush', params: { got: receiveFrom(ctx, ctx.c.location, idiv(BIG_ORDER_PAY * 3, 4)) } }; } },
    { id: 'decline', costs: ['opportunity'], apply: () => ({ result: 'decline' }) },
  ],
};

export const TOOL_PRICE = 100;
export const craftToolBroke: EventDef = {
  id: 'event.craft_tool_broke', career: 'artisan', category: 'economy',
  weight: (ctx) => (is(ctx, 'artisan') && (doingNow(ctx) === 'action.craft' || doingNow(ctx) === 'action.hire') ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  params: () => ({ price: TOOL_PRICE }),
  choices: [
    { id: 'buy', costs: ['money'], available: (ctx) => money(ctx, TOOL_PRICE), apply: (ctx) => { payTo(ctx, ctx.c.location, TOOL_PRICE); return { result: 'buy' }; } },
    { id: 'mend', costs: ['time', 'stamina'], apply: (ctx) => { spendStamina(ctx, 50); gainSkill(ctx.c, 'crafting', ctx.tick, 150); return { result: 'mend' }; } },
    { id: 'make_do', costs: ['opportunity'], apply: (ctx) => { occupy(ctx, 'action.toil', 1); return { result: 'make_do' }; } },
  ],
};

export const GUILD_LEVY = 100;
export const craftGuildLevy: EventDef = {
  id: 'event.craft_guild_levy', career: 'artisan', category: 'economy',
  weight: (ctx) => (is(ctx, 'artisan') && guildAt(ctx, ctx.c.location) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ guild: guildAt(ctx, ctx.c.location) }),
  attitude: { pay: { guild: 5 }, haggle_ok: { guild: -2 }, haggle_failed: { guild: -5 }, refuse: { guild: -10 } },
  reputation: { refuse: -2 },
  params: () => ({ price: GUILD_LEVY, half: idiv(GUILD_LEVY, 2) }),
  figure: () => man('adult', 'rich'),
  choices: [
    { id: 'pay', costs: ['money'], available: (ctx) => money(ctx, GUILD_LEVY), apply: (ctx) => ({ result: 'pay', params: { money: payFaction(ctx, guildAt(ctx, ctx.c.location), ctx.c.location, GUILD_LEVY) } }) },
    {
      id: 'haggle', costs: ['money', 'risk'],
      apply: (ctx, rng): ChoiceOutcome => {
        const ok = rng.chance(400_000);
        return { result: ok ? 'haggle_ok' : 'haggle_failed', params: { money: payFaction(ctx, guildAt(ctx, ctx.c.location), ctx.c.location, ok ? idiv(GUILD_LEVY, 2) : GUILD_LEVY) } };
      },
    },
    { id: 'refuse', costs: ['risk', 'opportunity'], apply: () => ({ result: 'refuse' }) },
  ],
};

export const PUPIL_GIFT = 100;
export const craftPupilAsks: EventDef = {
  id: 'event.craft_pupil_asks', career: 'artisan', category: 'daily',
  weight: (ctx) => (is(ctx, 'artisan', 'master') ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  reputation: { accept: 3 },
  bonds: { accept: { closeness: 15, trust: 10 }, decline: { closeness: -3 } },
  cast: (ctx, rng) => pickOne(peopleHere(ctx).filter((n) => npcAge(ctx, n) >= 12 && npcAge(ctx, n) <= 18 && kinRole(ctx.c, n) === null), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), money: PUPIL_GIFT }),
  figure: castOr(() => man('young', 'poor')),
  choices: [
    { id: 'accept', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 30); gainSkill(ctx.c, 'crafting', ctx.tick, 100); return { result: 'accept', params: { got: takeMoneyFrom(ctx, ctx.npc, PUPIL_GIFT) } }; } },
    { id: 'decline', costs: ['opportunity'], apply: () => ({ result: 'decline' }) },
  ],
};

export const FINE_PIECE_PRICE = 250;
export const craftFinePiece: EventDef = {
  id: 'event.craft_fine_piece', career: 'artisan', category: 'opportunity',
  weight: (ctx) => (is(ctx, 'artisan', 'journeyman') && ctx.c.skillXp.crafting >= 2_000 ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { present: { government: 15 } },
  reputation: { present: 5 },
  params: () => ({ money: FINE_PIECE_PRICE }),
  choices: [
    { id: 'sell', costs: ['opportunity'], apply: (ctx) => ({ result: 'sell', params: { got: receiveFrom(ctx, ctx.c.location, FINE_PIECE_PRICE) } }) },
    { id: 'present', costs: ['opportunity'], available: (ctx) => (government(ctx) ? null : 'lock.no_official'), apply: () => ({ result: 'present' }) },
    { id: 'keep', costs: ['opportunity'], apply: (ctx) => { addGoods(ctx.c.household, WARES, 20); return { result: 'keep' }; } },
  ],
};

// —— Thợ săn ——
export const TIGER_BOUNTY = 500;
export const huntTigerTracks: EventDef = {
  id: 'event.hunt_tiger_tracks', career: 'hunter', category: 'road',
  weight: (ctx) => (is(ctx, 'hunter') && (doingNow(ctx) === 'action.hunt' || doingNow(ctx) === 'action.trap') ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  reputation: { hunt_won: 8, warn: 3 },
  params: () => ({ money: TIGER_BOUNTY }),
  choices: [
    {
      id: 'hunt', costs: ['risk', 'health'],
      apply: (ctx, rng): ChoiceOutcome => {
        if (rng.chance(300_000 + mulDiv(ctx.c.skillXp.hunting, 50, 1))) return { result: 'hunt_won', params: { got: receiveFrom(ctx, ctx.c.location, TIGER_BOUNTY) } };
        wound(ctx, 4); hurt(ctx, 150);
        return { result: 'hunt_lost' };
      },
    },
    { id: 'warn', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 30); return { result: 'warn' }; } },
    { id: 'avoid', costs: ['opportunity'], apply: () => ({ result: 'avoid' }) },
  ],
};

export const PELT_PRICE = 200;
export const huntRarePelt: EventDef = {
  id: 'event.hunt_rare_pelt', career: 'hunter', category: 'opportunity',
  weight: (ctx) => (is(ctx, 'hunter') && doingNow(ctx) === 'action.hunt' ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ clan: leadClan(ctx, ctx.c.location) }),
  attitude: { gift_clan: { clan: 12 } },
  params: () => ({ money: PELT_PRICE }),
  choices: [
    { id: 'sell', costs: ['opportunity'], apply: (ctx) => ({ result: 'sell', params: { got: receiveFrom(ctx, ctx.c.location, PELT_PRICE) } }) },
    { id: 'gift_clan', costs: ['opportunity'], available: (ctx) => (leadClan(ctx, ctx.c.location) ? null : 'lock.no_clan'), apply: () => ({ result: 'gift_clan' }) },
    { id: 'keep', costs: ['opportunity'], apply: (ctx) => { addGoods(ctx.c.household, HIDE, 40); return { result: 'keep' }; } },
  ],
};

export const FOREST_FEE = 60;
export const FOREST_FINE = 150;
export const huntForbiddenWood: EventDef = {
  id: 'event.hunt_forbidden_wood', career: 'hunter', category: 'economy',
  weight: (ctx) => (is(ctx, 'hunter') && inVillage(ctx) && leadClan(ctx, ctx.c.location) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ clan: leadClan(ctx, ctx.c.location) }),
  attitude: { pay: { clan: 5 }, sneak_caught: { clan: -15 } },
  reputation: { sneak_caught: -5 },
  params: () => ({ price: FOREST_FEE, fine: FOREST_FINE }),
  choices: [
    { id: 'pay', costs: ['money'], available: (ctx) => money(ctx, FOREST_FEE), apply: (ctx) => { payTo(ctx, ctx.c.location, FOREST_FEE); return { result: 'pay' }; } },
    {
      id: 'sneak', costs: ['risk'],
      apply: (ctx, rng): ChoiceOutcome => {
        if (!rng.chance(300_000)) return { result: 'sneak_ok' };
        return { result: 'sneak_caught', params: { money: payTo(ctx, ctx.c.location, FOREST_FINE) } };
      },
    },
    { id: 'elsewhere', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 40); return { result: 'elsewhere' }; } },
  ],
};

export const TRAP_HURT_FEE = 100;
export const huntTrapVictim: EventDef = {
  id: 'event.hunt_trap_victim', career: 'hunter', category: 'daily',
  weight: (ctx) => (is(ctx, 'hunter') && doingNow(ctx) === 'action.trap' ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  reputation: { pay: 3, carry: 3, deny: -6 },
  bonds: { pay: { closeness: 5 }, carry: { closeness: 10, trust: 5 }, deny: { hostility: 25 } },
  cast: (ctx, rng) => pickOne(peopleHere(ctx).filter((n) => npcAge(ctx, n) >= 12 && kinRole(ctx.c, n) === null), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), money: TRAP_HURT_FEE }),
  figure: castOr(() => man('adult', 'poor')),
  choices: [
    { id: 'pay', costs: ['money'], available: (ctx) => money(ctx, TRAP_HURT_FEE), apply: (ctx) => { if (ctx.npc) payNpc(ctx, ctx.npc, TRAP_HURT_FEE); else payTo(ctx, ctx.c.location, TRAP_HURT_FEE); return { result: 'pay' }; } },
    { id: 'carry', costs: ['stamina', 'time'], apply: (ctx) => { spendStamina(ctx, 80); return { result: 'carry' }; } },
    { id: 'deny', costs: ['risk', 'opportunity'], apply: () => ({ result: 'deny' }) },
  ],
};

export const huntOldTracker: EventDef = {
  id: 'event.hunt_old_tracker', career: 'hunter', category: 'daily',
  weight: (ctx) => (is(ctx, 'hunter') && !is(ctx, 'hunter', 'master') && inVillage(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  params: () => ({ dou: 3 }),
  figure: () => man('old', 'poor'),
  choices: [
    { id: 'share_meat', costs: ['grain'], available: (ctx) => grain(ctx, 30), apply: (ctx) => { moveGrain(ctx, ctx.c.location, -30); gainSkill(ctx.c, 'hunting', ctx.tick, 400); return { result: 'share_meat' }; } },
    { id: 'follow', costs: ['time', 'stamina'], apply: (ctx) => { spendStamina(ctx, 60); gainSkill(ctx.c, 'hunting', ctx.tick, 250); return { result: 'follow' }; } },
    { id: 'pass', costs: ['opportunity'], apply: () => ({ result: 'pass' }) },
  ],
};

// —— Thương nhân ——
export const RUMOR_STAKE = 300;
export const merchantPriceRumor: EventDef = {
  id: 'event.merchant_price_rumor', career: 'merchant', category: 'economy',
  weight: (ctx) => (is(ctx, 'merchant') && inTown(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  params: () => ({ money: RUMOR_STAKE }),
  figure: () => man('adult', 'common'),
  choices: [
    {
      id: 'gamble', costs: ['money', 'risk'], available: (ctx) => money(ctx, RUMOR_STAKE),
      apply: (ctx, rng): ChoiceOutcome => {
        const paid = payTo(ctx, ctx.c.location, RUMOR_STAKE);
        if (rng.chance(450_000 + mulDiv(ctx.c.skillXp.trade, 20, 1))) return { result: 'gamble_won', params: { got: receiveFrom(ctx, ctx.c.location, paid * 2) } };
        return { result: 'gamble_lost', params: { money: paid } };
      },
    },
    { id: 'check', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 30); gainSkill(ctx.c, 'trade', ctx.tick, 150); return { result: 'check' }; } },
    { id: 'ignore', costs: ['opportunity'], apply: () => ({ result: 'ignore' }) },
  ],
};

export const BAD_COIN = 100;
export const merchantBadCoin: EventDef = {
  id: 'event.merchant_bad_coin', career: 'merchant', category: 'economy',
  weight: (ctx) => (is(ctx, 'merchant') && ctx.c.household.money >= BAD_COIN ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { report: { government: 5 }, pass_caught: { government: -10 } },
  reputation: { pass_caught: -8 },
  params: () => ({ money: BAD_COIN, fine: BAD_COIN * 2 }),
  choices: [
    { id: 'report', costs: ['time', 'money'], apply: (ctx) => { spendStamina(ctx, 30); return { result: 'report', params: { money: payTo(ctx, ctx.c.location, BAD_COIN) } }; } },
    {
      id: 'pass_on', costs: ['risk'],
      apply: (ctx, rng) => (rng.chance(300_000) ? { result: 'pass_caught', params: { money: payFaction(ctx, government(ctx), ctx.c.location, BAD_COIN * 2) } } : { result: 'pass_ok' }),
    },
    { id: 'swallow', costs: ['money'], apply: (ctx) => ({ result: 'swallow', params: { money: payTo(ctx, ctx.c.location, BAD_COIN) } }) },
  ],
};

export const PARTNER_STAKE = 500;
export const merchantPartner: EventDef = {
  id: 'event.merchant_partner', career: 'merchant', category: 'economy',
  weight: (ctx) => (is(ctx, 'merchant') && ctx.c.household.money >= PARTNER_STAKE ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  bonds: { invest_won: { trust: 10, closeness: 5 }, invest_lost: { trust: -15, hostility: 10 } },
  cast: (ctx, rng) => pickOne(peopleHere(ctx).filter((n) => n.occupation === 'merchant'), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), money: PARTNER_STAKE }),
  figure: castOr(() => man('adult', 'rich')),
  choices: [
    {
      id: 'invest', costs: ['money', 'risk'], available: (ctx) => money(ctx, PARTNER_STAKE),
      apply: (ctx, rng): ChoiceOutcome => {
        // Tiền hùn vào túi người rủ; trúng thì người ấy trả cả vốn lẫn lời (trong túi người ấy)
        const paid = ctx.npc ? payNpc(ctx, ctx.npc, PARTNER_STAKE) : payTo(ctx, ctx.c.location, PARTNER_STAKE);
        if (rng.chance(600_000)) return { result: 'invest_won', params: { got: takeMoneyFrom(ctx, ctx.npc, idiv(paid * 8, 5)) } };
        return { result: 'invest_lost', params: { money: paid } };
      },
    },
    { id: 'decline', costs: ['opportunity'], apply: () => ({ result: 'decline' }) },
  ],
};

export const MARKET_TOLL = 50;
export const merchantMarketToll: EventDef = {
  id: 'event.merchant_market_toll', career: 'merchant', category: 'economy',
  weight: (ctx) => (is(ctx, 'merchant') && inTown(ctx) && government(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ government: government(ctx) }),
  tone: { government: 'grudge' },
  attitude: { pay: { government: 3 }, bribe_failed: { government: -8 }, argue: { government: -5 } },
  params: () => ({ money: MARKET_TOLL, half: idiv(MARKET_TOLL, 2) }),
  figure: () => man('adult', 'official'),
  choices: [
    {
      id: 'bribe', costs: ['money', 'risk'],
      apply: (ctx, rng): ChoiceOutcome => {
        const g = government(ctx);
        const paid = payFaction(ctx, g, ctx.c.location, idiv(MARKET_TOLL, 2));
        if (rng.chance(300_000 + 5_000 * (g?.greed ?? 0))) return { result: 'bribe_ok', params: { money: paid } };
        return { result: 'bribe_failed', params: { money: paid + payFaction(ctx, g, ctx.c.location, MARKET_TOLL) } };
      },
    },
    { id: 'argue', costs: ['time', 'risk'], apply: (ctx) => { spendStamina(ctx, 40); return { result: 'argue' }; } },
    { id: 'pay', costs: ['money'], apply: (ctx) => ({ result: 'pay', params: { money: payFaction(ctx, government(ctx), ctx.c.location, MARKET_TOLL) } }) },
  ],
};

export const PACK_HORSE = 300;
export const PORTERS = 120;
export const merchantPackHorse: EventDef = {
  id: 'event.merchant_pack_horse', career: 'merchant', category: 'road',
  weight: (ctx) => (is(ctx, 'merchant') && ctx.player.active?.slot.action === 'action.haul' ? CAREER_W * 2 : 0),
  cooldownTicks: CAREER_COOLDOWN,
  params: () => ({ price: PACK_HORSE, porters: PORTERS }),
  choices: [
    { id: 'buy_horse', costs: ['money'], available: (ctx) => money(ctx, PACK_HORSE), apply: (ctx) => ({ result: 'buy_horse', params: { money: payTo(ctx, ctx.c.location, PACK_HORSE) } }) },
    { id: 'porters', costs: ['money', 'time'], available: (ctx) => money(ctx, PORTERS), apply: (ctx) => { spendStamina(ctx, 30); return { result: 'porters', params: { money: payTo(ctx, ctx.c.location, PORTERS) } }; } },
    { id: 'carry', costs: ['stamina', 'health'], apply: (ctx) => { spendStamina(ctx, 120); hurt(ctx, 60); return { result: 'carry' }; } },
  ],
};

// —— Thầy thuốc ——
export const NIGHT_CALL_FEE = 80;
export const physicianNightCall: EventDef = {
  id: 'event.physician_night_call', career: 'physician', category: 'health',
  weight: (ctx) => (is(ctx, 'physician', 'journeyman') ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  reputation: { go: 4, send_herbs: 2, refuse: -4 },
  params: () => ({ money: NIGHT_CALL_FEE }),
  figure: () => man('young', 'poor'),
  choices: [
    { id: 'go', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 60); gainSkill(ctx.c, 'medicine', ctx.tick, 100); return { result: 'go', params: { got: receiveFrom(ctx, ctx.c.location, NIGHT_CALL_FEE) } }; } },
    { id: 'send_herbs', costs: ['opportunity'], available: (ctx) => (ctx.c.household.goods[HERB]! >= 5 ? null : 'lock.no_herb'), apply: (ctx) => { ctx.c.household.goods[HERB]! -= 5; return { result: 'send_herbs' }; } },
    { id: 'refuse', costs: ['opportunity'], apply: () => ({ result: 'refuse' }) },
  ],
};

export const PLAGUE_PAY = 300;
/** Quận đang có dịch: nơi đang đứng hay quận kề. */
const plagueNear = (ctx: EventContext): number | null => {
  if (epidemicAt(here(ctx), ctx.tick)) return ctx.c.location;
  for (const [a, b] of ctx.logic.adjacency) {
    const k = a === ctx.c.location ? b : b === ctx.c.location ? a : -1;
    if (k >= 0 && epidemicAt(ctx.eco.counties[k]!, ctx.tick)) return k;
  }
  return null;
};
export const physicianPlagueCall: EventDef = {
  id: 'event.physician_plague_call', career: 'physician', category: 'health',
  weight: (ctx) => (is(ctx, 'physician', 'journeyman') && plagueNear(ctx) !== null ? 80_000 : 0),
  cooldownTicks: 36,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { go: { government: 8 }, go_sick: { government: 8 } },
  reputation: { go: 10, go_sick: 10, send_herbs: 4, stay: -5 },
  params: (ctx) => ({ place: ctx.logic.counties[plagueNear(ctx) ?? ctx.c.location]!.name ?? 'place.unknown', money: PLAGUE_PAY }),
  choices: [
    {
      id: 'go', costs: ['risk', 'health'],
      apply: (ctx, rng): ChoiceOutcome => {
        const got = receiveFrom(ctx, plagueNear(ctx) ?? ctx.c.location, PLAGUE_PAY);
        spendStamina(ctx, 80);
        gainSkill(ctx.c, 'medicine', ctx.tick, 300);
        if (rng.chance(300_000) && catchIllness(ctx, 'illness.fever', 'serious', 5)) return { result: 'go_sick', params: { got } };
        return { result: 'go', params: { got } };
      },
    },
    { id: 'send_herbs', costs: ['opportunity'], available: (ctx) => (ctx.c.household.goods[HERB]! >= 20 ? null : 'lock.no_herb'), apply: (ctx) => { ctx.c.household.goods[HERB]! -= 20; return { result: 'send_herbs' }; } },
    { id: 'stay', costs: ['opportunity'], apply: () => ({ result: 'stay' }) },
  ],
};

export const FAR_CALL_PAY = 600;
export const physicianFarCall: EventDef = {
  id: 'event.physician_far_call', career: 'physician', category: 'opportunity',
  weight: (ctx) => (is(ctx, 'physician', 'master') ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { go: { government: 10 }, decline: { government: -3 } },
  reputation: { go: 6 },
  params: (ctx) => ({ place: ctx.logic.counties[government(ctx)?.seat ?? ctx.c.location]!.name ?? 'place.unknown', money: FAR_CALL_PAY }),
  figure: () => man('adult', 'official'),
  choices: [
    { id: 'go', costs: ['time', 'stamina'], apply: (ctx) => { occupy(ctx, 'action.toil', 2); spendStamina(ctx, 60); return { result: 'go', params: { got: receiveFromFaction(ctx, government(ctx), ctx.c.location, FAR_CALL_PAY) } }; } },
    { id: 'decline', costs: ['opportunity'], apply: () => ({ result: 'decline' }) },
  ],
};

export const physicianHerbSeason: EventDef = {
  id: 'event.physician_herb_season', career: 'physician', category: 'opportunity',
  // Đồi thuốc quanh làng hay quanh trấn đều có (S9: thầy thuốc ở trấn chưa bao giờ gặp khi còn đòi ở làng)
  weight: (ctx) => (is(ctx, 'physician') && (season(ctx) === 'spring' || season(ctx) === 'summer') ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  choices: [
    { id: 'gather', costs: ['time', 'stamina'], apply: (ctx) => { occupy(ctx, 'action.toil', 1); return { result: 'gather', params: { qty: idiv(addGoods(ctx.c.household, HERB, 40), 10) } }; } },
    { id: 'study', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 30); gainSkill(ctx.c, 'medicine', ctx.tick, 250); return { result: 'study' }; } },
    { id: 'skip', costs: ['opportunity'], apply: () => ({ result: 'skip' }) },
  ],
};

export const CONDOLENCE = 100;
export const physicianLostPatient: EventDef = {
  id: 'event.physician_lost_patient', career: 'physician', category: 'health',
  weight: (ctx) => (is(ctx, 'physician', 'journeyman') ? idiv(CAREER_W, 2) : 0),
  cooldownTicks: CAREER_COOLDOWN,
  reputation: { condole: 3, explain_failed: -4, leave: -6 },
  params: () => ({ money: CONDOLENCE }),
  figure: () => man('old', 'poor'),
  choices: [
    { id: 'condole', costs: ['money'], available: (ctx) => money(ctx, CONDOLENCE), apply: (ctx) => ({ result: 'condole', params: { money: payTo(ctx, ctx.c.location, CONDOLENCE) } }) },
    { id: 'explain', costs: ['risk'], apply: (ctx, rng) => ({ result: rng.chance(500_000 + mulDiv(ctx.c.skillXp.medicine, 30, 1)) ? 'explain_ok' : 'explain_failed' }) },
    { id: 'leave', costs: ['opportunity'], apply: () => ({ result: 'leave' }) },
  ],
};

// —— Lính ——
export const BRIBE_OFFER = 200;
export const soldierBribeOffer: EventDef = {
  id: 'event.soldier_bribe_offer', career: 'soldier', category: 'economy',
  weight: (ctx) => (is(ctx, 'soldier') ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { take_caught: { government: -20 }, refuse: { government: 3 }, report: { government: 10 } },
  reputation: { take_ok: -3, take_caught: -8, report: 3 },
  params: () => ({ money: BRIBE_OFFER }),
  figure: () => man('adult', 'rich'),
  choices: [
    {
      id: 'take', costs: ['risk'],
      apply: (ctx, rng): ChoiceOutcome => {
        const got = receiveFrom(ctx, ctx.c.location, BRIBE_OFFER);
        if (!rng.chance(300_000)) return { result: 'take_ok', params: { got } };
        return { result: 'take_caught', params: { got, money: payFaction(ctx, government(ctx), ctx.c.location, got) } };
      },
    },
    { id: 'report', costs: ['risk', 'time'], apply: (ctx) => { spendStamina(ctx, 20); return { result: 'report' }; } },
    { id: 'refuse', costs: ['opportunity'], apply: () => ({ result: 'refuse' }) },
  ],
};

export const ESCORT_PAY = 150;
export const soldierTaxEscort: EventDef = {
  id: 'event.soldier_tax_escort', career: 'soldier', category: 'road',
  weight: (ctx) => (is(ctx, 'soldier') && month(ctx) % 3 === 1 ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { go: { government: 5 }, go_ambush: { government: 8 }, feign: { government: -10 } },
  params: () => ({ money: ESCORT_PAY }),
  choices: [
    {
      id: 'go', costs: ['time', 'risk'],
      apply: (ctx, rng): ChoiceOutcome => {
        occupy(ctx, 'action.toil', 2);
        const got = receiveFromFaction(ctx, government(ctx), ctx.c.location, ESCORT_PAY);
        if (bandNear(ctx) && rng.chance(250_000)) { wound(ctx, 3); return { result: 'go_ambush', params: { got } }; }
        return { result: 'go', params: { got } };
      },
    },
    { id: 'feign', costs: ['opportunity'], apply: () => ({ result: 'feign' }) },
  ],
};

export const soldierMarketBrawl: EventDef = {
  id: 'event.soldier_market_brawl', career: 'soldier', category: 'daily',
  weight: (ctx) => (is(ctx, 'soldier') && inTown(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { arrest: { government: 5 }, look_away: { government: -3 } },
  reputation: { break_up: 5, break_up_hurt: 4, arrest: 2, look_away: -3 },
  choices: [
    { id: 'break_up', costs: ['risk', 'health'], apply: (ctx, rng): ChoiceOutcome => { if (rng.chance(mulDiv(400_000, 100 - idiv(ctx.c.skillXp.martial, 200), 100))) { wound(ctx, 2); return { result: 'break_up_hurt' }; } return { result: 'break_up' }; } },
    { id: 'arrest', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 40); gainSkill(ctx.c, 'martial', ctx.tick, 80); return { result: 'arrest' }; } },
    { id: 'look_away', costs: ['opportunity'], apply: () => ({ result: 'look_away' }) },
  ],
};

export const soldierDrill: EventDef = {
  id: 'event.soldier_drill', career: 'soldier', category: 'daily',
  weight: (ctx) => (is(ctx, 'soldier') ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { hard: { government: 4 }, skip: { government: -4 } },
  choices: [
    { id: 'hard', costs: ['stamina', 'health'], apply: (ctx) => { spendStamina(ctx, 120); hurt(ctx, 20); gainSkill(ctx.c, 'martial', ctx.tick, 300); return { result: 'hard' }; } },
    { id: 'light', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 40); gainSkill(ctx.c, 'martial', ctx.tick, 100); return { result: 'light' }; } },
    { id: 'skip', costs: ['opportunity'], apply: () => ({ result: 'skip' }) },
  ],
};

export const BACK_PAY = 300;
export const soldierBackPay: EventDef = {
  id: 'event.soldier_back_pay', career: 'soldier', category: 'economy',
  weight: (ctx) => (is(ctx, 'soldier') && (government(ctx)?.greed ?? 0) >= GREEDY_FROM ? CAREER_W * 2 : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { petition_ok: { government: -3 }, petition_failed: { government: -10 }, grumble: { government: -3 } },
  params: () => ({ money: BACK_PAY }),
  figure: () => man('adult', 'official'),
  choices: [
    {
      id: 'petition', costs: ['risk'],
      apply: (ctx, rng) => (rng.chance(400_000) ? { result: 'petition_ok', params: { got: receiveFromFaction(ctx, government(ctx), ctx.c.location, BACK_PAY) } } : { result: 'petition_failed' }),
    },
    { id: 'grumble', costs: ['opportunity'], apply: () => ({ result: 'grumble' }) },
    { id: 'endure', costs: ['opportunity'], apply: () => ({ result: 'endure' }) },
  ],
};

// —— Lưu lạc ——
export const ODD_JOB_PAY = 60;
export const drifterOddJob: EventDef = {
  id: 'event.drifter_odd_job', career: 'drifter', category: 'road',
  weight: (ctx) => (is(ctx, 'drifter') && traveling(ctx) ? CAREER_W * 2 : 0),
  cooldownTicks: 72,
  params: () => ({ money: ODD_JOB_PAY }),
  figure: () => man('adult', 'common'),
  choices: [
    { id: 'work', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 60); return { result: 'work', params: { got: receiveFrom(ctx, ctx.c.location, ODD_JOB_PAY) } }; } },
    { id: 'tell_tales', costs: ['time'], apply: (ctx) => ({ result: 'tell_tales', params: { dou: idiv(moveGrain(ctx, ctx.c.location, 20), 10) } }) },
    { id: 'move_on', costs: ['opportunity'], apply: () => ({ result: 'move_on' }) },
  ],
};

export const drifterTempleNight: EventDef = {
  id: 'event.drifter_temple_night', career: 'drifter', category: 'road',
  weight: (ctx) => (is(ctx, 'drifter') && traveling(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  choices: [
    { id: 'sleep', costs: ['risk'], apply: (ctx, rng): ChoiceOutcome => { refresh(ctx, 120); if (rng.chance(200_000) && catchIllness(ctx, 'illness.cold', 'mild', 2)) return { result: 'sleep_cold' }; return { result: 'sleep' }; } },
    { id: 'pray', costs: ['time'], apply: (ctx) => { refresh(ctx, 60); addFlag(ctx, 'temple_prayer'); return { result: 'pray' }; } },
    { id: 'walk_on', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 50); return { result: 'walk_on' }; } },
  ],
};

export const drifterFellow: EventDef = {
  id: 'event.drifter_fellow', career: 'drifter', category: 'road',
  weight: (ctx) => (is(ctx, 'drifter') && traveling(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  figure: () => man('young', 'poor'),
  choices: [
    {
      id: 'walk_together', costs: ['risk'],
      apply: (ctx, rng): ChoiceOutcome => {
        if (rng.chance(200_000)) return { result: 'robbed', params: { money: payTo(ctx, ctx.c.location, percentOf(ctx.c.household.money, 20)) } };
        refresh(ctx, 60);
        return { result: 'walk_together' };
      },
    },
    { id: 'share_food', costs: ['grain'], available: (ctx) => grain(ctx, 20), apply: (ctx) => { moveGrain(ctx, ctx.c.location, -20); addFlag(ctx, 'road_friend'); return { result: 'share_food' }; } },
    { id: 'part', costs: ['opportunity'], apply: () => ({ result: 'part' }) },
  ],
};

export const MAP_PRICE = 50;
export const drifterStrangeMap: EventDef = {
  id: 'event.drifter_strange_map', career: 'drifter', category: 'opportunity',
  weight: (ctx) => (is(ctx, 'drifter') && inTown(ctx) ? CAREER_W : 0),
  cooldownTicks: 0,
  oncePerLife: true,
  params: () => ({ money: MAP_PRICE }),
  figure: () => man('old', 'poor'),
  choices: [
    { id: 'buy', costs: ['money'], available: (ctx) => money(ctx, MAP_PRICE), apply: (ctx) => { payTo(ctx, ctx.c.location, MAP_PRICE); addFlag(ctx, 'knows_cave'); return { result: 'buy' }; } },
    { id: 'memorize', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 20); addFlag(ctx, 'half_map'); return { result: 'memorize' }; } },
    { id: 'pass', costs: ['opportunity'], apply: () => ({ result: 'pass' }) },
  ],
};

export const drifterHomesick: EventDef = {
  id: 'event.drifter_homesick', career: 'drifter', category: 'daily',
  weight: (ctx) => (is(ctx, 'drifter') && season(ctx) === 'winter' ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  params: () => ({ money: 10 }),
  choices: [
    { id: 'letter', costs: ['money'], available: (ctx) => money(ctx, 10), apply: (ctx) => { payTo(ctx, ctx.c.location, 10); refresh(ctx, 40); return { result: 'letter' }; } },
    { id: 'drink', costs: ['money', 'health'], apply: (ctx) => { payTo(ctx, ctx.c.location, 20); hurt(ctx, 15); return { result: 'drink' }; } },
    { id: 'shrug', costs: ['opportunity'], apply: () => ({ result: 'shrug' }) },
  ],
};

// —— Ẩn dật ——
const atHut = (ctx: EventContext) => is(ctx, 'recluse') && ctx.c.location === ctx.c.home;
export const recluseWildBeast: EventDef = {
  id: 'event.recluse_wild_beast', career: 'recluse', category: 'daily',
  weight: (ctx) => (atHut(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  params: () => ({ dou: 3 }),
  choices: [
    { id: 'fight', costs: ['risk', 'health'], apply: (ctx, rng): ChoiceOutcome => { if (rng.chance(400_000 + mulDiv(ctx.c.skillXp.hunting, 30, 1))) { gainSkill(ctx.c, 'hunting', ctx.tick, 150); return { result: 'fight_won' }; } wound(ctx, 3); return { result: 'fight_lost' }; } },
    { id: 'fire', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 80); return { result: 'fire' }; } },
    { id: 'leave_food', costs: ['grain'], apply: (ctx) => ({ result: 'leave_food', params: { dou: idiv(moveGrain(ctx, ctx.c.location, -30), 10) } }) },
  ],
};

export const recluseVisitor: EventDef = {
  id: 'event.recluse_visitor', career: 'recluse', category: 'daily',
  weight: (ctx) => (atHut(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  bonds: { welcome: { closeness: 10, trust: 5 }, send_away: { closeness: -8 } },
  cast: (ctx, rng) => pickOne(ctx.npcs.people.filter((n) => n.death === null && kinRole(ctx.c, n) !== null), rng),
  variant: named,
  params: (ctx) => npcName(ctx),
  figure: castOr(() => man('adult', 'common')),
  choices: [
    { id: 'welcome', costs: ['grain'], apply: (ctx) => { if (ctx.npc) giveGrainTo(ctx, ctx.npc, 20); else moveGrain(ctx, ctx.c.location, -20); return { result: 'welcome' }; } },
    { id: 'send_away', costs: ['opportunity'], apply: () => ({ result: 'send_away' }) },
    { id: 'hide', costs: ['opportunity'], apply: () => ({ result: 'hide' }) },
  ],
};

export const recluseHermit: EventDef = {
  id: 'event.recluse_hermit', career: 'recluse', category: 'opportunity',
  weight: (ctx) => (atHut(ctx) ? CAREER_W : 0),
  cooldownTicks: 0,
  oncePerLife: true,
  figure: () => man('old', 'poor'),
  choices: [
    { id: 'sit', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 20); addFlag(ctx, 'met_hermit'); gainSkill(ctx.c, 'literacy', ctx.tick, 200); return { result: 'sit' }; } },
    { id: 'offer_tea', costs: ['grain'], apply: (ctx) => { moveGrain(ctx, ctx.c.location, -10); addFlag(ctx, 'met_hermit'); addFlag(ctx, 'hermit_gift'); return { result: 'offer_tea' }; } },
    { id: 'pass', costs: ['opportunity'], apply: () => ({ result: 'pass' }) },
  ],
};

export const recluseLandslide: EventDef = {
  id: 'event.recluse_landslide', career: 'recluse', category: 'disaster',
  weight: (ctx) => (atHut(ctx) && season(ctx) === 'summer' ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  choices: [
    { id: 'rebuild', costs: ['time', 'stamina'], apply: (ctx) => { occupy(ctx, 'action.toil', 1); spendStamina(ctx, 60); return { result: 'rebuild' }; } },
    { id: 'patch', costs: ['risk'], apply: (ctx, rng): ChoiceOutcome => { if (rng.chance(300_000)) { wound(ctx, 2); return { result: 'patch_hurt' }; } return { result: 'patch' }; } },
    { id: 'cave', costs: ['health'], apply: (ctx) => { hurt(ctx, 40); return { result: 'cave' }; } },
  ],
};

export const recluseHerbValley: EventDef = {
  id: 'event.recluse_herb_valley', career: 'recluse', category: 'opportunity',
  weight: (ctx) => (atHut(ctx) && season(ctx) !== 'winter' ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  choices: [
    { id: 'gather', costs: ['time', 'stamina'], apply: (ctx) => { spendStamina(ctx, 60); return { result: 'gather', params: { qty: idiv(addGoods(ctx.c.household, HERB, 40), 10) } }; } },
    { id: 'mark', costs: ['opportunity'], apply: (ctx) => { addFlag(ctx, 'herb_valley'); return { result: 'mark' }; } },
    { id: 'leave', costs: ['opportunity'], apply: () => ({ result: 'leave' }) },
  ],
};

// —— Theo cướp ——
export const SEIZE_RANSOM = 300;
/** Bị cướp bắt lên núi (Q8: "bị bắt theo"): đi qua chặng băng cướp giữ, chưa theo cướp. */
export const banditSeize: EventDef = {
  id: 'event.bandit_seize', category: 'road',
  // 2% mỗi tuần trên chặng băng giữ (đo batch S8: 0,8% thì người chơi máy lang bạt chưa gặp lần nào — cướp đường đến trước)
  weight: (ctx) => (ctx.age >= 16 && ctx.age <= 45 && bandOnRoad(ctx) && ctx.player.career?.id !== 'outlaw' && 'careers' in ctx.player ? 20_000 : 0),
  cooldownTicks: 216,
  factions: (ctx) => ({ bandits: bandOnRoad(ctx) }),
  attitude: { ransom: { bandits: 5 }, run_ok: { bandits: -10 }, run_caught: { bandits: -10 } },
  reputation: { go_along: -15 },
  params: () => ({ money: SEIZE_RANSOM }),
  figure: () => man('adult', 'poor'),
  choices: [
    {
      id: 'go_along', costs: ['risk', 'opportunity'],
      available: (ctx) => (!bandOnRoad(ctx) ? 'lock.no_band' : isHostile(bandOnRoad(ctx)) ? 'lock.hostile' : null),
      apply: (ctx) => {
        const w = careerWorld(ctx), band = bandOnRoad(ctx)!;
        const x = { career: w.career, careers: w.careers, bonds: ctx.bonds, npcs: ctx.npcs, tick: ctx.tick, factions: ctx.factions };
        joinBand(ctx.c, band, x);
        w.career = x.career;
        w.commit();
        return { result: 'go_along', params: { place: ctx.logic.counties[band.seat]!.name ?? 'place.unknown' } };
      },
    },
    { id: 'ransom', costs: ['money'], available: (ctx) => money(ctx, SEIZE_RANSOM), apply: (ctx) => ({ result: 'ransom', params: { money: payFaction(ctx, bandOnRoad(ctx), ctx.c.location, SEIZE_RANSOM) } }) },
    {
      id: 'run', costs: ['risk', 'health'],
      apply: (ctx, rng): ChoiceOutcome => {
        if (rng.chance(500_000)) return { result: 'run_ok' };
        wound(ctx, 3);
        return { result: 'run_caught', params: { money: payFaction(ctx, bandOnRoad(ctx), ctx.c.location, percentOf(ctx.c.household.money, 30)) } };
      },
    },
  ],
};

const myBand = (ctx: EventContext) => (ctx.player.career?.id === 'outlaw' ? ctx.factions.list.find((f) => f.id === ctx.player.career!.faction && f.ended === null) ?? null : null);
export const outlawNightRaid: EventDef = {
  id: 'event.outlaw_night_raid', career: 'outlaw', category: 'daily',
  weight: (ctx) => (myBand(ctx) ? CAREER_W * 2 : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ bandits: myBand(ctx), government: government(ctx) }),
  attitude: { raid: { bandits: 5, government: -5 }, raid_hurt: { bandits: 5, government: -5 }, guard: { bandits: 2 }, slip: { bandits: -10 } },
  reputation: { raid: -5, raid_hurt: -5 },
  params: () => ({ dou: 5 }),
  choices: [
    {
      id: 'raid', costs: ['risk'],
      apply: (ctx, rng): ChoiceOutcome => {
        const got = idiv(moveGrain(ctx, ctx.c.location, 50), 10);
        if (rng.chance(250_000)) { wound(ctx, 3); return { result: 'raid_hurt', params: { dou: got } }; }
        return { result: 'raid', params: { dou: got } };
      },
    },
    { id: 'guard', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 60); return { result: 'guard' }; } },
    { id: 'slip', costs: ['opportunity'], apply: () => ({ result: 'slip' }) },
  ],
};

export const SPLIT_MORE = 150;
export const outlawSplitQuarrel: EventDef = {
  id: 'event.outlaw_split_quarrel', career: 'outlaw', category: 'daily',
  weight: (ctx) => (myBand(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ bandits: myBand(ctx) }),
  attitude: { demand_ok: { bandits: -5 }, demand_beaten: { bandits: -10 }, side_leader: { bandits: 8 } },
  params: () => ({ money: SPLIT_MORE }),
  choices: [
    {
      id: 'demand', costs: ['risk', 'health'],
      apply: (ctx, rng): ChoiceOutcome => {
        if (rng.chance(400_000 + idiv(ctx.c.skillXp.martial, 25))) return { result: 'demand_ok', params: { got: receiveFromFaction(ctx, myBand(ctx), ctx.c.location, SPLIT_MORE) } };
        wound(ctx, 2);
        return { result: 'demand_beaten' };
      },
    },
    { id: 'side_leader', costs: ['opportunity'], apply: () => ({ result: 'side_leader' }) },
    { id: 'accept', costs: ['opportunity'], apply: () => ({ result: 'accept' }) },
  ],
};

export const KIN_SEND = 200;
export const outlawKinNews: EventDef = {
  id: 'event.outlaw_kin_news', career: 'outlaw', category: 'daily',
  weight: (ctx) => (myBand(ctx) ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  bonds: { send_money: { closeness: 10 }, visit_ok: { closeness: 12, trust: 5 }, visit_seen: { closeness: 8 } },
  cast: (ctx, rng) => pickOne(ctx.npcs.people.filter((n) => n.death === null && kinRole(ctx.c, n) !== null), rng),
  variant: named,
  factions: (ctx) => ({ government: government(ctx) }),
  attitude: { visit_seen: { government: -5 } },
  reputation: { visit_seen: -5 },
  params: (ctx) => ({ ...npcName(ctx), money: KIN_SEND }),
  figure: castOr(() => man('old', 'poor')),
  choices: [
    { id: 'send_money', costs: ['money'], available: (ctx) => money(ctx, KIN_SEND), apply: (ctx) => ({ result: 'send_money', params: { money: ctx.npc ? payNpc(ctx, ctx.npc, KIN_SEND) : payTo(ctx, ctx.c.home, KIN_SEND) } }) },
    { id: 'visit', costs: ['risk', 'time'], apply: (ctx, rng) => ({ result: rng.chance(300_000) ? 'visit_seen' : 'visit_ok' }) },
    { id: 'ignore', costs: ['opportunity'], apply: () => ({ result: 'ignore' }) },
  ],
};

export const outlawAmnesty: EventDef = {
  id: 'event.outlaw_amnesty', career: 'outlaw', category: 'daily',
  weight: (ctx) => (myBand(ctx) && government(ctx) && (government(ctx)?.greed ?? 100) < GREEDY_FROM ? CAREER_W : 0),
  cooldownTicks: CAREER_COOLDOWN,
  factions: (ctx) => ({ government: government(ctx), bandits: myBand(ctx) }),
  attitude: { surrender: { government: 25, bandits: -25 }, mock: { government: -10, bandits: 5 } },
  reputation: { surrender: 8 },
  figure: () => man('adult', 'official'),
  choices: [
    {
      // Ra hàng theo lệnh chiêu an: rời băng không phải chuộc tội
      id: 'surrender', costs: ['opportunity'],
      apply: (ctx) => {
        const w = careerWorld(ctx);
        leaveCareer(w, ctx.bonds, ctx.npcs);
        w.commit();
        return { result: 'surrender' };
      },
    },
    { id: 'mock', costs: ['risk', 'opportunity'], apply: () => ({ result: 'mock' }) },
    { id: 'stay', costs: ['opportunity'], apply: () => ({ result: 'stay' }) },
  ],
};

export const CAREER_EVENTS: readonly EventDef[] = [
  farmSeedSwap, farmWaterTurn, farmBumperPrice, farmOldHand, farmBuffaloSick,
  craftBigOrder, craftToolBroke, craftGuildLevy, craftPupilAsks, craftFinePiece,
  huntTigerTracks, huntRarePelt, huntForbiddenWood, huntTrapVictim, huntOldTracker,
  merchantPriceRumor, merchantBadCoin, merchantPartner, merchantMarketToll, merchantPackHorse,
  physicianNightCall, physicianPlagueCall, physicianFarCall, physicianHerbSeason, physicianLostPatient,
  soldierBribeOffer, soldierTaxEscort, soldierMarketBrawl, soldierDrill, soldierBackPay,
  drifterOddJob, drifterTempleNight, drifterFellow, drifterStrangeMap, drifterHomesick,
  recluseWildBeast, recluseVisitor, recluseHermit, recluseLandslide, recluseHerbValley,
  banditSeize, outlawNightRaid, outlawSplitQuarrel, outlawKinNews, outlawAmnesty,
];
/** Sự kiện chỉ đến với người làm nghề (cho batch: người chơi máy sáu chiến lược v0.6 không theo nghề). */
export const CAREER_EVENT_IDS: readonly string[] = CAREER_EVENTS.filter((d) => d !== banditSeize).map((d) => d.id);
/** Sự kiện riêng của từng nghề (S9: tiêu chí "sự kiện riêng của nghề"), theo thứ tự trong `CAREER_EVENTS`; năm sự kiện mỗi nghề. */
export const CAREER_EVENTS_OF: Readonly<Record<CareerId, readonly string[]>> = {
  farmer: CAREER_EVENTS.slice(0, 5).map((d) => d.id), artisan: CAREER_EVENTS.slice(5, 10).map((d) => d.id), hunter: CAREER_EVENTS.slice(10, 15).map((d) => d.id),
  merchant: CAREER_EVENTS.slice(15, 20).map((d) => d.id), physician: CAREER_EVENTS.slice(20, 25).map((d) => d.id), soldier: CAREER_EVENTS.slice(25, 30).map((d) => d.id),
  drifter: CAREER_EVENTS.slice(30, 35).map((d) => d.id), recluse: CAREER_EVENTS.slice(35, 40).map((d) => d.id), outlaw: CAREER_EVENTS.slice(40, 45).map((d) => d.id),
};
