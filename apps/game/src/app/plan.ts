// Điều kiện chặn nút "Áp dụng kế hoạch". Chỉ kiểm ý nghĩa của kế hoạch, không kiểm luật game:
// khóa của lúc này (mùa, nơi ở, thể lực…) không chặn, vì sim xét lại từng ô khi chạy (ADR 0008).
import type { ActionOption, MonthPlan, TravelOption } from '@tsvl/shared';

export function planInvalid(plan: MonthPlan, actions: readonly ActionOption[], travel: readonly TravelOption[]): boolean {
  return plan.slots.some((s) => !actions.some((a) => a.id === s.action) || (s.action === 'action.travel' && !travel.some((p) => p.county === s.target)));
}
