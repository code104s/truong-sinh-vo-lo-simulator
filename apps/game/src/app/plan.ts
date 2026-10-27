// Điều kiện chặn nút "Áp dụng kế hoạch". Chỉ kiểm ý nghĩa của kế hoạch, không kiểm luật game:
// khóa của lúc này (mùa, nơi ở, thể lực…) không chặn, vì sim xét lại từng ô khi chạy (ADR 0008).
import type { ActionOption, MonthPlan, TravelOption } from '@tsvl/shared';

export function planInvalid(plan: MonthPlan, actions: readonly ActionOption[], travel: readonly TravelOption[]): boolean {
  return plan.slots.some((s) => !actions.some((a) => a.id === s.action) || (s.action === 'action.travel' && !travel.some((p) => p.county === s.target)));
}

export const defaultPlan = (): MonthPlan => ({ slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] });

/** Bản nháp khác kế hoạch đang áp dụng (chưa có kế hoạch thì so với ba ô nghỉ). */
export function planDirty(draft: MonthPlan, plan: MonthPlan | null): boolean {
  const base = plan ?? defaultPlan();
  return draft.slots.some((s, i) => s.action !== base.slots[i]!.action || s.target !== base.slots[i]!.target);
}
