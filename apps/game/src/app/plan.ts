// Điều kiện chặn nút "Áp dụng kế hoạch". Chỉ kiểm ý nghĩa của kế hoạch, không kiểm luật game:
// khóa của lúc này (mùa, nơi ở, thể lực…) không chặn, vì sim xét lại từng ô khi chạy (ADR 0008).
import type { ActionOption, ContentId, MonthPlan, NpcView, PlanSlot, TravelOption } from '@tsvl/shared';

/** Hành động xã giao (nhóm `social`): ô phải nhắm vào một người (v0.5 F2). */
export const isSocial = (actions: readonly ActionOption[], id: string): boolean => actions.some((a) => a.id === id && a.group === 'social');

export function planInvalid(plan: MonthPlan, actions: readonly ActionOption[], travel: readonly TravelOption[]): boolean {
  return plan.slots.some((s) => !actions.some((a) => a.id === s.action)
    || ((s.action === 'action.travel' || s.action === 'action.haul') && !travel.some((p) => p.county === s.target))
    || isSocial(actions, s.action) !== (s.person !== undefined));
}

export const defaultPlan = (): MonthPlan => ({ slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] });

/** Bản nháp khác kế hoạch đang áp dụng (chưa có kế hoạch thì so với ba ô nghỉ). */
export function planDirty(draft: MonthPlan, plan: MonthPlan | null): boolean {
  const base = plan ?? defaultPlan();
  return draft.slots.some((s, i) => s.action !== base.slots[i]!.action || s.target !== base.slots[i]!.target || s.person !== base.slots[i]!.person || s.cargo !== base.slots[i]!.cargo);
}

/**
 * Khóa lúc này của một ô xã giao (v0.5 F2), theo khóa sim gửi kèm người trong quận: người không còn ở quận này thì
 * "không ở đây"; null là làm được. Chỉ để cảnh báo: sim xét lại khi ô chạy.
 */
export function socialLockOf(slot: PlanSlot, people: readonly NpcView[]): ContentId | null {
  if (slot.person === undefined) return null;
  const p = people.find((x) => x.id === slot.person);
  if (!p) return 'lock.person_away';
  return p.social?.find((o) => o.action === slot.action)?.locked ?? null;
}

/**
 * Người để chọn cho một hành động xã giao: người làm được trước, rồi người thân, người có quan hệ, rồi theo tuổi (già
 * trước) và id — để người hay qua lại nằm trên cùng.
 */
export function socialCandidates(people: readonly NpcView[], action: string): { p: NpcView; locked: ContentId | null }[] {
  const rank = (p: NpcView) => (p.kin ? 0 : p.bond ? 1 : 2);
  return people
    .map((p) => ({ p, locked: p.social?.find((o) => o.action === action)?.locked ?? null }))
    .sort((a, b) => Number(a.locked !== null) - Number(b.locked !== null) || rank(a.p) - rank(b.p) || b.p.ageYears - a.p.ageYears || Number(a.p.id.slice(1)) - Number(b.p.id.slice(1)));
}
