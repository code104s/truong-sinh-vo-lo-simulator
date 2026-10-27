// Cảnh báo đói (F1): nói rõ đang đói tới mức nào, đói làm gì mình (đúng luật ADR 0013) và làm gì được ngay.
// Không có luật game: việc nào làm được lúc này lấy từ khóa hành động sim gửi (nơi ở, đói lả không làm việc nặng…).
import type { ActionOption, HouseholdView } from '@tsvl/shared';

/** Việc có cái ăn hay tiền mua ăn ngay trong tuần, khác làm ruộng (chỉ cho ăn lúc gặt). */
export const QUICK_FOOD_ACTIONS = ['action.hire', 'action.hunt', 'action.forage'] as const;

export interface HungerAlert {
  key: string;
  tone: 'warn' | 'bad';
  /** Lời khuyên và các việc kiếm ăn ngay đang làm được; null khi còn ở nhà cha mẹ. */
  advice: { key: string; actions: string[] } | null;
  /** Hiện nút ra chợ: chỉ người đã ra riêng mới tự mua cái ăn được (trẻ ở nhà ăn theo cha mẹ). */
  market: boolean;
}

export function hungerAlert(h: HouseholdView, canAct: boolean, actions: readonly ActionOption[]): HungerAlert | null {
  const tone = h.hungerBand === 'starving' || h.hungerBand === 'famished' ? 'bad' : 'warn';
  if (!h.independent) {
    // Còn ở nhà: đói là vì quận nhà đói kém, cha mẹ bớt phần con; mua lương vào túi riêng cũng không ăn được
    return h.hungerBand === 'fed' ? null : { key: `ui.hunger.${h.hungerBand}`, tone, advice: { key: 'ui.hunger.advice_child', actions: [] }, market: false };
  }
  const key = h.hungerBand !== 'fed' ? `ui.hunger.${h.hungerBand}` : h.foodWeeks === 0 ? 'ui.hunger.empty' : null;
  if (!key) return null;
  const quick = QUICK_FOOD_ACTIONS.filter((id) => actions.some((a) => a.id === id && !a.locked));
  const advice = !canAct ? null : quick.length ? { key: 'ui.hunger.advice', actions: [...quick] } : { key: 'ui.hunger.advice_market', actions: [] };
  return { key, tone, advice, market: canAct };
}
