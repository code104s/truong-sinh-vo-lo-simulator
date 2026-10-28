// Gia đình (v0.5 S5, ADR 0018 Q8): cha mẹ già ốm, tang người thân — sự kiện tốn ô và tiền. Văn phong: docs/van-phong.md.
import { GIFT_BY_BACKGROUND, HEAL_FEE } from '../../economy/income';
import { kinRole, lookup } from '../../npc/family';
import { physicianIn, type NpcState } from '../../npc/state';
import { occupy, payNpc, payTo, spendStamina } from '../effects';
import type { EventContext, EventDef } from '../engine';
import { castOr, man, npcAge } from './common';

/** Cha mẹ từ tuổi này coi là già. */
export const ELDER_AGE = 50;
/** Mời thầy thuốc chữa cho cha mẹ: phí bệnh nặng. */
export const ELDER_FEE = HEAL_FEE.serious;
/** Chăm cha mẹ ốm: bớt chừng ấy tuần bệnh, hồi chừng ấy sức khỏe. */
const NURSE_WEEKS = 3, NURSE_HEAL = 100, PHYSICIAN_HEAL = 50;
/** Tang người thân mất trong vòng chừng ấy tuần, ở quận mình đang đứng. */
export const FUNERAL_WINDOW = 6;
/** Tang lễ chu đáo: gấp mười quà thăm hỏi theo xuất thân mình; làm đơn sơ: bằng quà thăm hỏi. Tiền vào quỹ quận (cỗ bàn, hàng xóm). */
export const FUNERAL_PROPER_X = 10;

const MOURNED_ROLES: readonly string[] = ['father', 'mother', 'spouse', 'son', 'daughter'];
const roleKey = (ctx: EventContext, n: NpcState): string => {
  const role = kinRole(ctx.c, n);
  return role === 'spouse' ? (n.character.gender === 'male' ? 'kin.husband' : 'kin.wife') : `kin.${role}`;
};

/** Cha hoặc mẹ đã già, đang ốm, ở cùng quận với mình (cha trước). Tra theo id: hàm trọng số chạy mỗi tuần. */
function sickElder(ctx: EventContext): NpcState | null {
  const byId = lookup(ctx.npcs);
  for (const id of [ctx.c.kin.father, ctx.c.kin.mother]) {
    const n = id === null ? undefined : byId.get(id);
    if (!n || n.death || n.character.location !== ctx.c.location) continue;
    if (npcAge(ctx, n) >= ELDER_AGE && n.character.conditions.some((x) => x.kind === 'illness')) return n;
  }
  return null;
}

/** Người thân mới mất (vài tuần nay) mà mình đang ở đúng nơi lo tang được; người mất gần nhất trước. */
function freshDead(ctx: EventContext): NpcState | null {
  let best: NpcState | null = null;
  for (const n of ctx.npcs.people) {
    const d = n.death;
    if (!d || d.tick < ctx.tick - FUNERAL_WINDOW || (n.character.location !== ctx.c.location && n.character.home !== ctx.c.location)) continue;
    if (!MOURNED_ROLES.includes(kinRole(ctx.c, n) ?? '')) continue;
    if (!best || d.tick > best.death!.tick) best = n;
  }
  return best;
}

/** Tên và vai người thân trong chuyện (luôn có khi sự kiện xảy ra; trống khi dựng không có người, ở test văn bản). */
const named = (ctx: EventContext): Record<string, string> => (ctx.npc ? { name: ctx.npc.character.name, role: roleKey(ctx, ctx.npc) } : {});
const funeralCost = (ctx: EventContext, x: number) => GIFT_BY_BACKGROUND[ctx.c.background] * x;

export const parentIll: EventDef = {
  id: 'event.parent_ill',
  category: 'health',
  weight: (ctx) => (ctx.age >= 16 && ctx.c.household.independent && sickElder(ctx) ? 120_000 : 0),
  cooldownTicks: 72,
  // Tiếng tăm ở quận đang đứng (v0.5 S6, Q9)
  reputation: { nurse: 5, physician: 3, leave: -5 },
  // Chăm, chữa cho cha mẹ thì gần hơn; bỏ mặc thì nhạt đi
  bonds: { nurse: { closeness: 10, trust: 5 }, physician: { closeness: 5, trust: 5 }, leave: { closeness: -10 } },
  cast: (ctx) => sickElder(ctx),
  variant: (ctx) => (ctx.npc ? 'named' : null),
  params: (ctx) => ({ ...named(ctx), fee: ELDER_FEE }),
  figure: castOr(() => man('old', 'common')),
  choices: [
    {
      id: 'nurse', costs: ['time', 'stamina'],
      apply: (ctx) => {
        occupy(ctx, 'action.nurse');
        spendStamina(ctx, 60);
        const p = ctx.npc?.character;
        if (p) {
          for (const x of p.conditions) if (x.kind === 'illness') x.weeksLeft = Math.max(1, x.weeksLeft - NURSE_WEEKS);
          p.health = Math.min(p.healthMax, p.health + NURSE_HEAL);
        }
        return { result: 'nurse' };
      },
    },
    {
      id: 'physician', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= ELDER_FEE ? null : 'lock.money'),
      apply: (ctx) => {
        // Thầy thuốc NPC trong quận thì phí vào túi người ấy; không có thì mời thầy nơi khác, tiền vào quỹ quận
        const doc = physicianIn(ctx.npcs, ctx.c.location);
        if (doc) payNpc(ctx, doc, ELDER_FEE); else payTo(ctx, ctx.c.location, ELDER_FEE);
        const p = ctx.npc?.character;
        if (p) {
          p.conditions = p.conditions.filter((x) => x.kind !== 'illness');
          p.health = Math.min(p.healthMax, p.health + PHYSICIAN_HEAL);
        }
        return { result: 'physician' };
      },
    },
    { id: 'leave', costs: ['opportunity'], apply: () => ({ result: 'leave' }) },
  ],
};

export const kinFuneral: EventDef = {
  id: 'event.kin_funeral',
  category: 'daily',
  weight: (ctx) => (ctx.age >= 16 && freshDead(ctx) ? 600_000 : 0),
  cooldownTicks: 12,
  // Tiếng tăm ở quận đang đứng (v0.5 S6, Q9)
  reputation: { proper: 10, simple: 2, neighbors: -5 },
  cast: (ctx) => freshDead(ctx),
  variant: (ctx) => (ctx.npc ? 'named' : null),
  params: (ctx) => ({ ...named(ctx), proper: funeralCost(ctx, FUNERAL_PROPER_X), simple: funeralCost(ctx, 1) }),
  figure: castOr(() => null),
  choices: [
    {
      id: 'proper', costs: ['money', 'time'],
      available: (ctx) => (ctx.c.household.money >= funeralCost(ctx, FUNERAL_PROPER_X) ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, funeralCost(ctx, FUNERAL_PROPER_X)); occupy(ctx, 'action.mourn'); return { result: 'proper' }; },
    },
    {
      id: 'simple', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= funeralCost(ctx, 1) ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, funeralCost(ctx, 1)); return { result: 'simple' }; },
    },
    // Không lo nổi: họ hàng, làng xóm chôn cất giúp
    { id: 'neighbors', costs: ['opportunity'], apply: () => ({ result: 'neighbors' }) },
  ],
};

export const FAMILY: readonly EventDef[] = [parentIll, kinFuneral];
