// Hậu quả của lựa chọn sự kiện. Mọi thay đổi đi qua đây để giữ sổ cái tiền (ADR 0012) và luật thân thể (ADR 0005).
import { actionDef } from '../life/actions';
import { staminaMax } from '../life/stamina';
import type { EventContext } from './engine';

/** Trả tiền vào quỹ một quận; trả về số đã trả (không vượt túi). */
export function payTo(ctx: EventContext, county: number, amount: number): number {
  const h = ctx.c.household;
  const n = Math.max(0, Math.min(amount, h.money));
  h.money -= n;
  ctx.eco.counties[county]!.money += n;
  return n;
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
