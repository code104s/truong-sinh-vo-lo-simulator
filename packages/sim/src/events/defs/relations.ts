// Sự kiện quan hệ (v0.5 S7, ADR 0017 Q10): mai mối, đám cưới trong làng, người quen mang gạo khi đói, kẻ thù trả thù,
// con ốm, đòi nợ ơn, tranh chia gia tài, người quen gặp khó, vợ chồng lục đục. Mỗi sự kiện gọi một người thật; dựng
// không có người (test văn bản) thì tiền, lương đi vào quỹ quận như người vô danh. Văn phong: docs/van-phong.md.
import { GIFT_BY_BACKGROUND, HEAL_FEE } from '../../economy/income';
import { KIN_KEEP_GRAIN, kinRole, lookup, playerStandIn, single } from '../../npc/family';
import { physicianIn, type NpcState } from '../../npc/state';
import { marryLock } from '../../social/actions';
import { MARRY_AGE } from '../../npc/lifecycle';
import { bondOf } from '../../social/bonds';
import { giveGrainTo, loseGrain, occupy, payNpc, payTo, spendStamina, takeGrainFrom, wound } from '../effects';
import type { EventContext, EventDef } from '../engine';
import { castOr, month, npcAge, npcName, peopleHere, percentOf, pickOne } from './common';
import { GRAIN_PER_DOU } from '@tsvl/shared';
import { idiv } from '../../core/math';

const gift = (ctx: EventContext, x = 1) => GIFT_BY_BACKGROUND[ctx.c.background] * x;
const named = (ctx: EventContext) => (ctx.npc ? 'named' : null);
const bond = (ctx: EventContext, n: NpcState) => bondOf(ctx.bonds, n.id);
const notKin = (ctx: EventContext, n: NpcState) => kinRole(ctx.c, n) === null;
/** Trả tiền cho người trong chuyện; không có người (test văn bản) thì vào quỹ quận. */
const payPerson = (ctx: EventContext, amount: number) => (ctx.npc ? payNpc(ctx, ctx.npc, amount) : payTo(ctx, ctx.c.location, amount));
const dou = (grain: number) => idiv(grain, GRAIN_PER_DOU);
const pickFirst = (xs: readonly NpcState[]): NpcState | null => xs[0] ?? null;

// —— Mai mối ——
/** Bà mối lấy lễ gấp đôi quà thăm hỏi; gặp mặt thì hai bên thành người quen (thân thiết 30). */
const MATCH_FEE_X = 2;
export const matchCandidates = (ctx: EventContext): NpcState[] => {
  // Điều kiện rẻ trước (hàm trọng số chạy mỗi tuần): ngoài tuổi cưới, chưa ra riêng, đã có vợ/chồng thì thôi
  if (ctx.age < MARRY_AGE[0] || ctx.age > MARRY_AGE[1] || !ctx.c.household.independent || !single(playerStandIn(ctx.c), lookup(ctx.npcs))) return [];
  return peopleHere(ctx).filter((n) => { const lock = marryLock(ctx.c, n, ctx); return lock === null || lock === 'lock.not_close'; });
};
export const matchmaker: EventDef = {
  id: 'event.matchmaker',
  category: 'daily',
  weight: (ctx) => (ctx.age >= 18 && matchCandidates(ctx).length ? 10_000 : 0),
  cooldownTicks: 108,
  bonds: { meet: { closeness: 30, trust: 10 } },
  cast: (ctx, rng) => pickOne(matchCandidates(ctx), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), fee: gift(ctx, MATCH_FEE_X) }),
  figure: castOr(() => ({ gender: 'female', ageBand: 'old', class: 'common' })),
  choices: [
    {
      id: 'meet', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= gift(ctx, MATCH_FEE_X) ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, gift(ctx, MATCH_FEE_X)); return { result: 'meet' }; },
    },
    { id: 'decline', costs: ['opportunity'], apply: () => ({ result: 'decline' }) },
  ],
};

// —— Đám cưới trong làng ——
/** Cô dâu mới: người nữ 18–21 tuổi có chồng ở quận đang đứng. Cưới hỏi rộ sau mùa gặt, tháng Mười một tới tháng Giêng. */
const brides = (ctx: EventContext): NpcState[] => peopleHere(ctx).filter((n) => {
  const a = npcAge(ctx, n);
  return n.character.gender === 'female' && n.character.kin.spouse !== null && a >= 18 && a <= 21 && notKin(ctx, n);
});
const WEDDING_MONTHS: readonly number[] = [11, 12, 1];
export const villageWedding: EventDef = {
  id: 'event.village_wedding',
  category: 'daily',
  weight: (ctx) => (ctx.age >= 14 && WEDDING_MONTHS.includes(month(ctx)) && brides(ctx).length ? 20_000 : 0),
  cooldownTicks: 36,
  bonds: { gift: { closeness: 10 }, help: { closeness: 5 }, skip: { closeness: -2 } },
  reputation: { gift: 2, help: 2, skip: -1 },
  cast: (ctx, rng) => pickOne(brides(ctx), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), gift: gift(ctx) }),
  figure: castOr(() => ({ gender: 'female', ageBand: 'young', class: 'common' })),
  choices: [
    {
      id: 'gift', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= gift(ctx) ? null : 'lock.money'),
      apply: (ctx) => { payPerson(ctx, gift(ctx)); return { result: 'gift' }; },
    },
    { id: 'help', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 60); return { result: 'help' }; } },
    { id: 'skip', costs: ['opportunity'], apply: () => ({ result: 'skip' }) },
  ],
};

// —— Người quen mang gạo khi đói ——
/** Người quen thân (thân thiết từ 50, không phải người thân — người thân đã giúp theo luật Q6) còn dư lương. */
const FRIEND_CLOSENESS = 50;
const FRIEND_RICE = 40;
// Hàm trọng số chạy mỗi tuần: xét kho quan hệ (vài chục mục) trước khi quét người trong quận (S8, hiệu năng)
const hasBond = (ctx: EventContext, ok: (b: { closeness: number; hostility: number; owed: number }) => boolean) => ctx.bonds.some(ok);
const riceFriend = (ctx: EventContext): NpcState | null => !hasBond(ctx, (b) => b.closeness >= FRIEND_CLOSENESS) ? null : pickFirst(peopleHere(ctx).filter((n) =>
  notKin(ctx, n) && (bond(ctx, n)?.closeness ?? 0) >= FRIEND_CLOSENESS && n.character.household.grain >= KIN_KEEP_GRAIN + 10));
export const friendBringsRice: EventDef = {
  id: 'event.friend_brings_rice',
  category: 'daily',
  weight: (ctx) => (ctx.c.household.independent && ctx.c.household.hunger > 0 && riceFriend(ctx) ? 300_000 : 0),
  cooldownTicks: 36,
  bonds: { accept: { closeness: 5, owed: -15 } },
  cast: (ctx) => riceFriend(ctx),
  variant: named,
  params: npcName,
  figure: castOr(() => ({ gender: 'male', ageBand: 'adult', class: 'common' })),
  choices: [
    {
      id: 'accept', costs: ['opportunity'],
      apply: (ctx) => {
        const n = ctx.npc;
        const got = n ? takeGrainFrom(ctx, n, Math.min(FRIEND_RICE, n.character.household.grain - KIN_KEEP_GRAIN)) : 0;
        return { result: 'accept', params: { dou: dou(got) } };
      },
    },
    { id: 'refuse', costs: ['opportunity'], apply: () => ({ result: 'refuse' }) },
  ],
};

// —— Kẻ thù trả thù ——
/** Người có hiềm khích (thù hận từ 30) ở quận đang đứng; người thù nặng nhất trước. */
const GRUDGE = 30;
const STEAL_PCT = 20, STEAL_MAX = 150;
const PEACE_GIFT_X = 3;
const enemyOf = (ctx: EventContext): NpcState | null => {
  if (!hasBond(ctx, (b) => b.hostility >= GRUDGE)) return null;
  let best: NpcState | null = null;
  for (const n of peopleHere(ctx)) {
    const h = bond(ctx, n)?.hostility ?? 0;
    if (h >= GRUDGE && npcAge(ctx, n) >= 16 && (!best || h > bond(ctx, best)!.hostility)) best = n;
  }
  return best;
};
/** Bị phá kho: lương sang kho kẻ thù (không có người thì mất). */
const steal = (ctx: EventContext): number => {
  const g = Math.min(STEAL_MAX, percentOf(ctx.c.household.grain, STEAL_PCT));
  return ctx.npc ? giveGrainTo(ctx, ctx.npc, g) : loseGrain(ctx, g);
};
export const enemyRevenge: EventDef = {
  id: 'event.enemy_revenge',
  category: 'daily',
  weight: (ctx) => (ctx.age >= 16 && ctx.c.household.independent && enemyOf(ctx) ? 15_000 : 0),
  cooldownTicks: 108,
  bonds: { confront_won: { hostility: 10 }, confront_hurt: { hostility: 5 }, make_peace: { hostility: -25, closeness: 5 }, endure: { hostility: -10 } },
  reputation: { confront_won: 2 },
  cast: (ctx) => enemyOf(ctx),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), gift: gift(ctx, PEACE_GIFT_X) }),
  figure: castOr(() => ({ gender: 'male', ageBand: 'adult', class: 'poor' })),
  choices: [
    {
      id: 'confront', costs: ['risk', 'health'],
      apply: (ctx, rng) => {
        if (rng.chance(500_000 + ctx.c.luck * 20_000)) return { result: 'confront_won' };
        wound(ctx, 2);
        return { result: 'confront_hurt', params: { lost: dou(steal(ctx)) } };
      },
    },
    {
      id: 'make_peace', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= gift(ctx, PEACE_GIFT_X) ? null : 'lock.money'),
      apply: (ctx) => { payPerson(ctx, gift(ctx, PEACE_GIFT_X)); return { result: 'make_peace' }; },
    },
    { id: 'endure', costs: ['grain'], apply: (ctx) => ({ result: 'endure', params: { lost: dou(steal(ctx)) } }) },
  ],
};

// —— Con ốm ——
const CHILD_FEE = HEAL_FEE.serious;
const NURSE_WEEKS = 3, NURSE_HEAL = 100;
// Chưa từng có vợ/chồng thì chưa có con
const sickChild = (ctx: EventContext): NpcState | null => ctx.c.kin.spouse === null ? null : pickFirst(peopleHere(ctx).filter((n) => {
  const role = kinRole(ctx.c, n);
  return (role === 'son' || role === 'daughter') && npcAge(ctx, n) < 16 && n.character.conditions.some((x) => x.kind === 'illness');
}));
export const childIll: EventDef = {
  id: 'event.child_ill',
  category: 'health',
  weight: (ctx) => (sickChild(ctx) ? 150_000 : 0),
  cooldownTicks: 36,
  bonds: { physician: { closeness: 5 }, nurse: { closeness: 10 } },
  cast: (ctx) => sickChild(ctx),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), fee: CHILD_FEE }),
  figure: castOr(() => ({ gender: 'male', ageBand: 'child', class: 'common' })),
  choices: [
    {
      id: 'physician', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= CHILD_FEE ? null : 'lock.money'),
      apply: (ctx) => {
        const doc = physicianIn(ctx.npcs, ctx.c.location);
        if (doc) payNpc(ctx, doc, CHILD_FEE); else payTo(ctx, ctx.c.location, CHILD_FEE);
        if (ctx.npc) ctx.npc.character.conditions = ctx.npc.character.conditions.filter((x) => x.kind !== 'illness');
        return { result: 'physician' };
      },
    },
    {
      id: 'nurse', costs: ['time', 'stamina'],
      apply: (ctx) => {
        occupy(ctx, 'action.nurse');
        const k = ctx.npc?.character;
        if (k) {
          for (const x of k.conditions) if (x.kind === 'illness') x.weeksLeft = Math.max(1, x.weeksLeft - NURSE_WEEKS);
          k.health = Math.min(k.healthMax, k.health + NURSE_HEAL);
        }
        return { result: 'nurse' };
      },
    },
    { id: 'pray', costs: ['opportunity'], apply: () => ({ result: 'pray' }) },
  ],
};

// —— Đòi nợ ơn ——
/** Người mình đang mang ơn (nợ ơn từ 20) tới nhờ lại. */
const OWING = -20;
const REPAY_X = 5;
const creditor = (ctx: EventContext): NpcState | null => !hasBond(ctx, (b) => b.owed <= OWING) ? null : pickFirst(peopleHere(ctx).filter((n) => notKin(ctx, n) && (bond(ctx, n)?.owed ?? 0) <= OWING));
export const debtCalled: EventDef = {
  id: 'event.debt_called',
  category: 'daily',
  weight: (ctx) => (ctx.c.household.independent && creditor(ctx) ? 15_000 : 0),
  cooldownTicks: 108,
  bonds: { repay_money: { owed: 20, trust: 5 }, repay_labor: { owed: 15 }, excuse: { trust: -10 } },
  reputation: { excuse: -3 },
  cast: (ctx) => creditor(ctx),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), coin: gift(ctx, REPAY_X) }),
  figure: castOr(() => ({ gender: 'male', ageBand: 'adult', class: 'common' })),
  choices: [
    {
      id: 'repay_money', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= gift(ctx, REPAY_X) ? null : 'lock.money'),
      apply: (ctx) => { payPerson(ctx, gift(ctx, REPAY_X)); return { result: 'repay_money' }; },
    },
    { id: 'repay_labor', costs: ['stamina', 'time'], apply: (ctx) => { occupy(ctx, 'action.toil', 1); return { result: 'repay_labor' }; } },
    { id: 'excuse', costs: ['opportunity'], apply: () => ({ result: 'excuse' }) },
  ],
};

// —— Tranh chia gia tài ——
/** Cha hoặc mẹ mất trong vòng chừng ấy tuần mà không còn vợ/chồng: của chia cho các con (S3), anh chị em dễ sinh chuyện. */
const ESTATE_WINDOW = 12;
const SHARE_X = 10;
const estateSibling = (ctx: EventContext): NpcState | null => {
  const byId = lookup(ctx.npcs);
  const fresh = [ctx.c.kin.father, ctx.c.kin.mother].some((id) => {
    const p = id === null ? undefined : byId.get(id);
    if (!p?.death || p.death.tick < ctx.tick - ESTATE_WINDOW) return false;
    const sp = p.character.kin.spouse === null ? undefined : byId.get(p.character.kin.spouse);
    return !sp || sp.death !== null;
  });
  if (!fresh) return null;
  return pickFirst(peopleHere(ctx).filter((n) => kinRole(ctx.c, n) === 'sibling' && n.character.household.independent));
};
export const estateDispute: EventDef = {
  id: 'event.estate_dispute',
  category: 'economy',
  weight: (ctx) => (ctx.age >= 16 && estateSibling(ctx) ? 300_000 : 0),
  cooldownTicks: 36,
  bonds: { give_share: { closeness: 10, trust: 5 }, stand_firm: { closeness: -10, hostility: 25 } },
  reputation: { give_share: 3, stand_firm: -2 },
  cast: (ctx) => estateSibling(ctx),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), share: gift(ctx, SHARE_X) }),
  figure: castOr(() => ({ gender: 'male', ageBand: 'adult', class: 'common' })),
  choices: [
    {
      id: 'give_share', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= gift(ctx, SHARE_X) ? null : 'lock.money'),
      apply: (ctx) => { payPerson(ctx, gift(ctx, SHARE_X)); return { result: 'give_share' }; },
    },
    { id: 'stand_firm', costs: ['opportunity'], apply: () => ({ result: 'stand_firm' }) },
  ],
};

// —— Người quen gặp khó ——
/**
 * Người quen (thân thiết từ 20, không phải người thân) đang đói. Giúp theo cùng luật người thân giúp nhau (Q6): chỉ
 * phần lương trên một năm ăn, phần tiền trên 300 văn.
 */
const ACQUAINTANCE = 20;
const HELP_GRAIN = 40, HELP_MONEY = 100, KEEP_MONEY = 300;
const needy = (ctx: EventContext): NpcState | null => !hasBond(ctx, (b) => b.closeness >= ACQUAINTANCE) ? null : pickFirst(peopleHere(ctx).filter((n) =>
  notKin(ctx, n) && (bond(ctx, n)?.closeness ?? 0) >= ACQUAINTANCE && n.character.household.hunger > 0));
export const friendInNeed: EventDef = {
  id: 'event.friend_in_need',
  category: 'daily',
  weight: (ctx) => (ctx.c.household.independent && needy(ctx) ? 30_000 : 0),
  cooldownTicks: 72,
  bonds: { give: { closeness: 10, owed: 15 }, lend: { closeness: 5, owed: 10 }, refuse: { closeness: -5 } },
  reputation: { give: 2 },
  cast: (ctx) => needy(ctx),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), dou: dou(HELP_GRAIN), coin: HELP_MONEY }),
  figure: castOr(() => ({ gender: 'male', ageBand: 'adult', class: 'poor' })),
  choices: [
    {
      id: 'give', costs: ['grain'],
      available: (ctx) => (ctx.c.household.grain >= KIN_KEEP_GRAIN + HELP_GRAIN ? null : 'lock.grain'),
      apply: (ctx) => { if (ctx.npc) giveGrainTo(ctx, ctx.npc, HELP_GRAIN); else loseGrain(ctx, HELP_GRAIN); return { result: 'give' }; },
    },
    {
      id: 'lend', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= KEEP_MONEY + HELP_MONEY ? null : 'lock.money'),
      apply: (ctx) => { payPerson(ctx, HELP_MONEY); return { result: 'lend' }; },
    },
    { id: 'refuse', costs: ['opportunity'], apply: () => ({ result: 'refuse' }) },
  ],
};

// —— Vợ chồng lục đục ——
/** Nhà túng (đang đói hay túi dưới 100 văn) thì vợ chồng hay cãi nhau. */
const POOR_MONEY = 100;
const spouseHere = (ctx: EventContext): NpcState | null => {
  const n = ctx.c.kin.spouse === null ? undefined : lookup(ctx.npcs).get(ctx.c.kin.spouse);
  return n && !n.death && n.character.location === ctx.c.location ? n : null;
};
export const spouseQuarrel: EventDef = {
  id: 'event.spouse_quarrel',
  category: 'daily',
  weight: (ctx) => ((ctx.c.household.hunger > 0 || ctx.c.household.money < POOR_MONEY) && spouseHere(ctx) ? 20_000 : 0),
  cooldownTicks: 72,
  bonds: { talk: { closeness: 5 }, gift: { closeness: 10 }, sulk: { closeness: -10, trust: -5 } },
  cast: (ctx) => spouseHere(ctx),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), gift: gift(ctx) }),
  figure: castOr(() => ({ gender: 'female', ageBand: 'adult', class: 'common' })),
  choices: [
    { id: 'talk', costs: ['time'], apply: (ctx) => { occupy(ctx, 'action.shelter', 1); return { result: 'talk' }; } },
    {
      id: 'gift', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= gift(ctx) ? null : 'lock.money'),
      apply: (ctx) => { payPerson(ctx, gift(ctx)); return { result: 'gift' }; },
    },
    { id: 'sulk', costs: ['opportunity'], apply: () => ({ result: 'sulk' }) },
  ],
};

export const RELATIONS: readonly EventDef[] = [matchmaker, villageWedding, friendBringsRice, enemyRevenge, childIll, debtCalled, estateDispute, friendInNeed, spouseQuarrel];
