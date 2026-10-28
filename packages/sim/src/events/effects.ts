// Hậu quả của lựa chọn sự kiện. Mọi thay đổi đi qua đây để giữ sổ cái tiền (ADR 0012) và luật thân thể (ADR 0005).
import { actionDef } from '../life/actions';
import { staminaMax } from '../life/stamina';
import type { EventContext } from './engine';
import type { NpcState } from '../npc/state';
import type { FactionState } from '../factions/state';

/** Trả tiền vào quỹ một quận; trả về số đã trả (không vượt túi). */
export function payTo(ctx: EventContext, county: number, amount: number): number {
  const h = ctx.c.household;
  const n = Math.max(0, Math.min(amount, h.money));
  h.money -= n;
  ctx.eco.counties[county]!.money += n;
  return n;
}

/** Trả tiền cho một người có tên (v0.5): từ túi người chơi sang túi người ấy, trong giới hạn túi. */
export function payNpc(ctx: EventContext, n: NpcState, amount: number): number {
  const h = ctx.c.household;
  const paid = Math.max(0, Math.min(amount, h.money));
  h.money -= paid;
  n.character.household.money += paid;
  return paid;
}

/** Mất lương thực (ăn, cho, bị lấy); trả về số thăng đã mất. Lương mất đi không vào đâu: nó đã bị ăn. */
export function loseGrain(ctx: EventContext, amount: number): number {
  const h = ctx.c.household;
  const n = Math.max(0, Math.min(amount, h.grain));
  h.grain -= n;
  return n;
}

export function spendStamina(ctx: EventContext, amount: number): void {
  ctx.c.stamina = Math.max(0, ctx.c.stamina - amount);
}

/** Bị đánh, bị thương: thành thương tích nhẹ để diễn tiến và nguyên nhân chết theo đúng luật bệnh tật. */
export function wound(ctx: EventContext, weeks: number): void {
  if (ctx.c.conditions.some((x) => x.kind === 'injury')) return;
  ctx.c.conditions.push({ id: 'injury.wound', kind: 'injury', severity: 'mild', weeksLeft: weeks });
}

/** Chiếm ô thời gian bằng một hành động ẩn (vd. đi phu), chạy như hành động dài của ADR 0008. */
export function occupy(ctx: EventContext, action: string, slots?: number): void {
  const def = actionDef(action);
  if (!def?.hidden) throw new Error(`chỉ hành động ẩn mới chiếm ô từ sự kiện: ${action}`);
  const n = slots ?? def.slots;
  ctx.player.active = { slot: { action }, total: n, remaining: n, preview: null };
}

/** Quỹ một quận trả cho người chơi (bán hàng, công, tiền cướp được…), trong giới hạn quỹ. */
export function receiveFrom(ctx: EventContext, county: number, amount: number): number {
  const ce = ctx.eco.counties[county]!;
  const n = Math.max(0, Math.min(amount, ce.money));
  ce.money -= n;
  ctx.c.household.money += n;
  return n;
}

/** Lương thực đổi chủ giữa người chơi và kho quận (bán lúa, được biếu thóc…). n > 0: quận → người chơi. */
export function moveGrain(ctx: EventContext, county: number, n: number): number {
  const ce = ctx.eco.counties[county]!;
  const h = ctx.c.household;
  const amount = n >= 0 ? Math.min(n, ce.grain) : -Math.min(-n, h.grain);
  ce.grain -= amount;
  h.grain += amount;
  return Math.abs(amount);
}

/** Lương thực tự làm ra (thịt săn, gặt non): từ đất và sức người, không lấy của ai. */
export function produceGrain(ctx: EventContext, n: number): void {
  ctx.c.household.grain += Math.max(0, n);
}

/** Hồi thể lực (vui hội, nghỉ ngơi), không vượt trần thể lực theo tuổi. */
export function refresh(ctx: EventContext, amount: number): void {
  ctx.c.stamina = Math.min(staminaMax(ctx.c, ctx.tick), ctx.c.stamina + amount);
}

export function heal(ctx: EventContext, hp: number): void {
  ctx.c.health = Math.min(ctx.c.healthMax, ctx.c.health + hp);
}

export function hurt(ctx: EventContext, hp: number): void {
  ctx.c.health = Math.max(1, ctx.c.health - hp);
}

/** Mắc bệnh do sự kiện (ăn đồ hỏng, nhiễm dịch); mỗi lúc tối đa một bệnh như luật ADR 0005. */
export function catchIllness(ctx: EventContext, id: string, severity: 'mild' | 'serious' | 'grave', weeks: number): boolean {
  if (ctx.c.conditions.some((x) => x.kind === 'illness')) return false;
  ctx.c.conditions.push({ id, kind: 'illness', severity, weeksLeft: weeks });
  return true;
}

export function addFlag(ctx: EventContext, flag: string): void {
  if (!ctx.events.flags.includes(flag)) ctx.events.flags.push(flag);
}

// —— Tác động lên NPC thật trong sự kiện (S6, ADR 0016): đi qua túi, kho của người ấy, sổ cái giữ nguyên ——

/** Đưa lương từ kho người chơi sang kho NPC; trả số thăng đã đưa. */
export function giveGrainTo(ctx: EventContext, n: NpcState, amount: number): number {
  const g = Math.max(0, Math.min(amount, ctx.c.household.grain));
  ctx.c.household.grain -= g; n.character.household.grain += g;
  return g;
}

/** Lương từ kho người chơi sang kho NPC theo chiều ngược (bán cho NPC): NPC trả tiền từ túi mình. Trả số văn nhận. */
export function sellGrainTo(ctx: EventContext, n: NpcState, grain: number, money: number): number {
  const g = Math.max(0, Math.min(grain, ctx.c.household.grain));
  const pay = Math.max(0, Math.min(money, n.character.household.money));
  ctx.c.household.grain -= g; n.character.household.grain += g;
  n.character.household.money -= pay; ctx.c.household.money += pay;
  return pay;
}

/** Lương từ kho NPC sang kho người chơi (được biếu, được giúp); trả số thăng nhận. */
export function takeGrainFrom(ctx: EventContext, n: NpcState, amount: number): number {
  const g = Math.max(0, Math.min(amount, n.character.household.grain));
  n.character.household.grain -= g; ctx.c.household.grain += g;
  return g;
}

// —— Kho thế lực (v0.6 S7): tiền, lương chuyển giữa người chơi và kho một thế lực; không có thế lực (dựng thử) thì quỹ,
// kho quận `county` như người vô danh. Sổ cái gồm kho thế lực nên tổng không đổi ——

/** Người chơi nộp tiền vào kho thế lực; trả số đã nộp. */
export function payFaction(ctx: EventContext, f: FactionState | null, county: number, amount: number): number {
  if (!f) return payTo(ctx, county, amount);
  const n = Math.max(0, Math.min(amount, ctx.c.household.money));
  ctx.c.household.money -= n; f.money += n;
  return n;
}

/** Kho thế lực trả tiền cho người chơi (thưởng, công), trong giới hạn kho; trả số nhận. */
export function receiveFromFaction(ctx: EventContext, f: FactionState | null, county: number, amount: number): number {
  if (!f) return receiveFrom(ctx, county, amount);
  const n = Math.max(0, Math.min(amount, f.money));
  f.money -= n; ctx.c.household.money += n;
  return n;
}

/** Lương đổi chủ giữa người chơi và kho thế lực. n > 0: thế lực → người chơi; n < 0: người chơi → thế lực. Trả số thăng. */
export function moveGrainFaction(ctx: EventContext, f: FactionState | null, county: number, n: number): number {
  if (!f) return moveGrain(ctx, county, n);
  const h = ctx.c.household;
  const amount = n >= 0 ? Math.min(n, f.grain) : -Math.min(-n, h.grain);
  f.grain -= amount; h.grain += amount;
  return Math.abs(amount);
}

/** Ruộng (mẫu) từ người chơi sang một NPC (thua kiện, nhường ruộng); trả số mẫu đã sang. Còn ít nhất một mẫu. */
export function giveLandTo(ctx: EventContext, n: NpcState | null, mu: number): number {
  const h = ctx.c.household;
  const k = Math.max(0, Math.min(mu, h.landMu - 1));
  h.landMu -= k;
  if (n) {
    n.character.household.landMu += k;
    if (n.character.household.tenure === 'none' || n.character.household.tenure === 'tenant') n.character.household.tenure = 'owner';
  }
  return k;
}

/** NPC bị thương nhẹ (không chồng thương). */
export function woundNpc(n: NpcState, weeks: number): void {
  if (!n.character.conditions.some((x) => x.kind === 'injury')) n.character.conditions.push({ id: 'injury.wound', kind: 'injury', severity: 'mild', weeksLeft: weeks });
}
