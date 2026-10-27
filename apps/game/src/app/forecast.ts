// Dự báo "đủ ăn tới…" trong kế hoạch tháng (F4). Chỉ đọc số tuần ăn sim tính sẵn (HouseholdView) và lịch chung;
// không đoán thu nhập của kế hoạch — giá tiền từng ô đã hiện trên chip.
import { TICKS_PER_YEAR, weeksToHarvest, type HouseholdView, type Tick } from '@tsvl/shared';

export type ForecastTone = 'good' | 'warn' | 'bad';
export interface FoodForecast {
  /** Câu chính: khóa nội dung và tham số (tham số ngày là tick, giao diện đổi ra chữ). */
  key: string;
  weeks: number;
  /** Tick kho riêng hết và tick kho cộng tiền hết. */
  grainUntil: Tick;
  foodUntil: Tick;
  /** Có làm ruộng trong kế hoạch: kịp hay không kịp mùa gặt; null nếu không làm ruộng. */
  harvest: { at: Tick; inTime: boolean } | null;
  tone: ForecastTone;
}

/** Quá chừng này thì chỉ nói "đủ ăn vài năm", không đếm nữa. */
export const LONG_WEEKS = 3 * TICKS_PER_YEAR;
export const SHORT_WEEKS = 4;
export const LOW_WEEKS = 12;

/** Chưa ra riêng thì cha mẹ lo, không dự báo. */
export function foodForecast(h: HouseholdView, tick: Tick, farming: boolean): FoodForecast | null {
  if (!h.independent) return null;
  const toHarvest = weeksToHarvest(tick);
  const harvest = farming ? { at: tick + toHarvest, inTime: h.foodWeeks >= toHarvest } : null;
  const key = h.foodWeeks === 0 ? 'ui.food.none'
    : h.foodWeeks >= LONG_WEEKS ? 'ui.food.long'
    : h.grainWeeks === 0 ? 'ui.food.money_only'
    : h.grainWeeks < h.foodWeeks ? 'ui.food.until_money'
    : 'ui.food.until';
  const tone: ForecastTone = h.foodWeeks < SHORT_WEEKS ? 'bad' : h.foodWeeks < LOW_WEEKS || (harvest && !harvest.inTime) ? 'warn' : 'good';
  return { key, weeks: h.foodWeeks, grainUntil: tick + h.grainWeeks, foodUntil: tick + h.foodWeeks, harvest, tone };
}
