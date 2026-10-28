// Bộ não nhu cầu (ADR 0016, v0.4 M11): ăn ở → an toàn → nghề. Lõi chung cho NPC và người chơi máy (tools/headless):
// đầu tháng quyết định mua bán lương và kế hoạch ba ô. Chỉ đọc những gì người trong cuộc thấy được; thuần, tất định.
import { HARVEST_MONTH, type MonthPlan, type SupplyBand } from '@tsvl/shared';

/**
 * Kinh tế của một người biết lo (v0.3 S7):
 * - giữ một năm ăn trong kho, vì năm đói kém chợ hết lương, có tiền cũng không mua được;
 * - thừa quá hai năm ăn thì bán bớt;
 * - giữ tiền nộp thuế đinh và trả thầy thuốc.
 */
export const GRAIN_RESERVE = 360;
export const SELL_ABOVE = 720;
export const MONEY_RESERVE = 300;
/** Dưới chừng ấy tuần ăn (kho + tiền dư quy ra lương) thì bỏ việc riêng, đi làm kiếm ăn. */
export const SURVIVAL_WEEKS = 12;

export interface BrainInput {
  ageYears: number;
  /** Sức khỏe 0..100 (%). */
  healthPct: number;
  sick: boolean;
  independent: boolean;
  money: number;
  grain: number;
  /** Tháng 1..12. */
  month: number;
  /** Hành động làm được lúc này, ở nơi đang đứng (khóa của sim). */
  usable: (id: string) => boolean;
  /** Chợ quận đang đứng; null thì không mua bán. */
  market: { buyPrice: number; maxBuy: number; maxSell: number; supply: SupplyBand } | null;
  /**
   * Cả nhà ăn bao nhiêu mỗi tuần (thăng): khẩu phần mình cộng con đang nuôi (v0.5 S2). Mặc định 10, khẩu phần một người
   * lớn; mọi ngưỡng tính bằng tuần ăn của cả nhà.
   */
  need?: number;
}

/** Khẩu phần một người lớn mỗi tuần (thăng): GRAIN_RESERVE, SELL_ABOVE ứng với 36, 72 tuần ăn của một người. */
const ADULT_NEED = 10;
const needOf = (b: BrainInput) => Math.max(1, b.need ?? ADULT_NEED);

/** Kho cộng tiền dư (ngoài phần giữ) quy ra lương theo giá mua, tính bằng tuần ăn của cả nhà. */
export function foodWeeks(b: BrainInput): number {
  const price = Math.max(1, b.market?.buyPrice ?? 40);
  return Math.floor((b.grain + Math.floor((Math.max(0, b.money - MONEY_RESERVE) * 10) / price)) / needOf(b));
}
export const weeksToHarvest = (month: number) => ((HARVEST_MONTH - month + 12) % 12 || 12) * 3;
export const struggling = (b: BrainInput) => b.independent && foodWeeks(b) < SURVIVAL_WEEKS;

/** Việc có cái ăn ngay: làm thuê, săn (ra thịt và da), hái lượm. Mùa đông ruộng nghỉ thì làm việc này. */
export const QUICK_WORK = ['action.hire', 'action.hunt', 'action.forage'] as const;

export interface WorkChoice {
  /** Việc chính lúc này: nghề ưa thích nếu làm được, không thì ruộng, không thì việc kiếm ăn ngay. */
  work: string;
  quick: string;
  /** Hai ô làm của tháng: ruộng chỉ cho ăn lúc gặt, nên thiếu ăn tới mùa gặt thì một ô kiếm ăn ngay, túng hẳn thì cả hai. */
  first: string;
  second: string;
}

/** `preferred`: việc của nghề (NPC); người chơi máy để trống. */
export function workChoice(b: BrainInput, preferred?: string): WorkChoice {
  const quick = QUICK_WORK.find(b.usable) ?? 'action.rest';
  const work = preferred && b.usable(preferred) ? preferred : b.usable('action.farm') ? 'action.farm' : quick;
  const short = work === 'action.farm' && b.independent && foodWeeks(b) < weeksToHarvest(b.month);
  return { work, quick, first: short && struggling(b) ? quick : work, second: short ? quick : work };
}

const slots = (a: string, b: string, c: string): MonthPlan => ({ slots: [{ action: a }, { action: b }, { action: c }] });

/** Hai ô làm, một ô nghỉ: nhịp của người điều độ. */
export const earnPlan = (w: WorkChoice): MonthPlan => slots(w.first, w.second, 'action.rest');

/**
 * Nhịp của NPC (ăn ở trước nhất): như người điều độ, nhưng túng thì làm cả ô thứ ba (việc kiếm ăn ngay) thay vì nghỉ.
 * Người chơi máy "điều độ" giữ hai ô (tiêu chí batch v0.3).
 */
export const needsPlan = (b: BrainInput, w: WorkChoice): MonthPlan => (struggling(b) ? slots(w.first, w.second, w.quick === 'action.rest' ? w.work : w.quick) : earnPlan(w));

/**
 * Yếu (sức khỏe dưới 50%): có bệnh và còn của thì chữa; hết của thì vẫn phải làm một ô kiếm ăn, nghỉ hai ô (nằm chờ là
 * chết đói). Trả null khi không yếu.
 */
export function weakPlan(b: BrainInput, w: WorkChoice): MonthPlan | null {
  if (b.healthPct >= 50) return null;
  if (b.sick && b.usable('action.heal') && !struggling(b)) return slots('action.heal', 'action.heal', 'action.heal');
  if (struggling(b)) return earnPlan(w);
  if (b.independent) return slots(w.first, 'action.rest', 'action.rest');
  return slots('action.rest', 'action.rest', 'action.rest');
}

/**
 * Mua bán lương thực đầu tháng (cùng luật lệnh TRADE): > 0 mua, < 0 bán, 0 thôi. Chưa ra riêng thì cha mẹ lo. Không mua
 * lúc đói kém (chợ cạn, giá đỉnh).
 */
export function tradeDecision(b: BrainInput): number {
  const m = b.market;
  if (!b.independent || !m) return 0;
  // Giữ một năm ăn, bán phần trên hai năm ăn — của cả nhà
  const reserve = Math.floor((GRAIN_RESERVE * needOf(b)) / ADULT_NEED), sellAbove = Math.floor((SELL_ABOVE * needOf(b)) / ADULT_NEED);
  if (b.grain < reserve && m.supply !== 'famine') {
    const afford = Math.floor(((b.money - MONEY_RESERVE) * 10) / Math.max(1, m.buyPrice)) - 1;
    return Math.max(0, Math.min(reserve - b.grain, afford, m.maxBuy));
  }
  if (b.grain > sellAbove) return -Math.min(b.grain - sellAbove, m.maxSell);
  return 0;
}

/** Đủ ăn hai năm và chưa về già thì mới lo việc riêng (học, buôn) — như người chơi máy học giả, lang bạt. */
export const AMBITION_WEEKS = 72;
export const AMBITION_MAX_AGE = 45;

/**
 * Tầng tham vọng của bộ não nhu cầu (ADR 0016): đã đủ ăn lâu dài thì ô làm thứ hai thành việc riêng (học chữ, buôn bán
 * nhỏ) nếu làm được. Trả null khi chưa tới lượt tham vọng.
 */
export function ambitionPlan(b: BrainInput, w: WorkChoice, action: string | null): MonthPlan | null {
  if (!action || b.ageYears >= AMBITION_MAX_AGE || foodWeeks(b) < AMBITION_WEEKS || !b.usable(action)) return null;
  return slots(w.first === action ? w.work : w.first, action, 'action.rest');
}
