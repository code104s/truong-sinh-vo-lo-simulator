// Hậu quả của lựa chọn sự kiện. Mọi thay đổi đi qua đây để giữ sổ cái tiền (ADR 0012) và luật thân thể (ADR 0005).
import { actionDef } from '../life/actions';
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
export function occupy(ctx: EventContext, action: string): void {
  const def = actionDef(action);
  if (!def?.hidden) throw new Error(`chỉ hành động ẩn mới chiếm ô từ sự kiện: ${action}`);
  ctx.player.active = { slot: { action }, total: def.slots, remaining: def.slots, preview: null };
}
