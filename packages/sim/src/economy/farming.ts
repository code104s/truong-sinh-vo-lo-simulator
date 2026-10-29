// Mùa vụ của người chơi: tuần công, thu hoạch, thuế điền, tô (ADR 0012). Toàn số nguyên; lương thực tính bằng thăng.
import type { RegionLogic } from '@tsvl/worldgen';
import { idiv, mulDiv } from '../core/math';
import type { CharacterState } from '../life/character';
import type { HouseholdState } from '../life/household';
import type { CountyEconomy, EconomyState } from './market';
import { rankStep, type CareerState } from '../life/career';

/** Một tuần công ở độ phì 100%, thời tiết 100%, chưa có kỹ năng: 5 đấu. */
export const FARM_YIELD_PER_WEEK = 50;
/** Kỹ năng làm ruộng cao nhất cộng thêm bao nhiêu phần trăm sản lượng. */
export const FARM_SKILL_MAX_PCT = 60;
/** Một mẫu cần bấy nhiêu tuần công một mùa. */
export const WEEKS_PER_MU = 3;
export const LAND_TAX_PCT = 10;
export const RENT_PCT = 50;
/**
 * Nông dân theo bậc (v0.7 S2): lão nông làm được, có tiếng gặt nhiều hơn (+10%, +20%) và thuê được ruộng tô nhẹ hơn
 * (tô 45%, 40%). Người không làm nghề nông và NPC giữ 100%, tô 50%.
 */
export const FARM_RANK_PCT = [100, 110, 120] as const;
export const RENT_RANK_CUT = [0, 5, 10] as const;

/**
 * Thuế điền trên `gross` thăng ở quận có ruộng (v0.6 S6, Q7): lệ 10% nhân nửa phần lệch của mức thuế người giữ quận —
 * quan thanh liêm nhất 7,5%, tham nhất 12,5%.
 */
export const landTax = (gross: number, field: CountyEconomy): number => mulDiv(gross, LAND_TAX_PCT * (100 + field.taxPct), 20_000);

export interface HarvestResult {
  /** Tổng thu trên ruộng đã làm, trước thuế, tô. */
  gross: number;
  tax: number;
  rent: number;
  /** Tô thu được từ đất cho thuê (nhà giàu), đã trừ thuế. */
  landlordIncome: number;
  /** Thực nhận vào kho. */
  net: number;
}

/** Một ô làm ruộng: cộng tuần công ở quận đang làm. Đổi quận là bỏ ruộng cũ, mùa tính lại từ đầu. */
export function recordFarmWeek(h: HouseholdState, county: number): void {
  if (h.farmCounty !== county) {
    h.farmCounty = county;
    h.farmWeeks = 0;
  }
  h.farmWeeks++;
}

export function farmSkillPct(c: CharacterState): number {
  return 100 + mulDiv(c.skillXp.farming, FARM_SKILL_MAX_PCT, 10_000);
}

/** Số tuần công trên ruộng nhà (phần còn lại là ruộng thuê). Chỉ có ruộng nhà ở quận nhà, khi đã có đất. */
export function ownWeeks(c: CharacterState): number {
  const h = c.household;
  const owns = h.tenure === 'owner' || h.tenure === 'landlord';
  return owns && h.farmCounty === c.home ? Math.min(h.farmWeeks, h.landMu * WEEKS_PER_MU) : 0;
}

/**
 * Đầu tháng thu hoạch, sau khi dân nền gặt: người chơi gặt phần mình, nộp thuế điền (ruộng nhà) và tô (ruộng thuê)
 * vào kho quận nơi có ruộng; nhà giàu thu tô phần đất cho thuê từ kho dân nền quận nhà. Mùa mới bắt đầu.
 */
export function harvestPlayer(c: CharacterState, eco: EconomyState, logic: RegionLogic, career: CareerState | null = null): HarvestResult {
  const h = c.household;
  const res: HarvestResult = { gross: 0, tax: 0, rent: 0, landlordIncome: 0, net: 0 };
  if (h.farmWeeks > 0) {
    const field = eco.counties[h.farmCounty]!;
    // Tai họa: phần thiệt so với năm thường được cứu lại theo reliefPct (gánh nước, đắp bờ… — S6)
    const weather = field.weatherPct < 100 ? field.weatherPct + mulDiv(100 - field.weatherPct, h.reliefPct, 100) : field.weatherPct;
    const step = rankStep(career, 'farmer');
    const perWeek = mulDiv(mulDiv(mulDiv(mulDiv(FARM_YIELD_PER_WEEK, farmSkillPct(c), 100), FARM_RANK_PCT[step], 100), logic.fertilityPct[h.farmCounty]!, 100), weather, 100);
    const own = ownWeeks(c);
    const ownGross = perWeek * own;
    const rentedGross = perWeek * (h.farmWeeks - own);
    res.gross = ownGross + rentedGross;
    res.tax = landTax(ownGross, field);
    res.rent = mulDiv(rentedGross, RENT_PCT - RENT_RANK_CUT[step] + h.rentHikePct, 100);
    field.grain += res.tax + res.rent;
    field.taxGrain += res.tax;
    res.net = res.gross - res.tax - res.rent;
  }
  if (h.tenure === 'landlord') {
    const home = eco.counties[c.home]!;
    // Phần đất không tự làm được cho tá điền (kỹ năng thường) cấy; tô lấy từ kho dân nền, năm mất mùa tô cũng ít
    const workedMu = idiv(ownWeeks(c) + WEEKS_PER_MU - 1, WEEKS_PER_MU);
    const rentedMu = Math.max(0, h.landMu - workedMu);
    const yieldOut = mulDiv(mulDiv(rentedMu * WEEKS_PER_MU * FARM_YIELD_PER_WEEK, logic.fertilityPct[c.home]!, 100), home.weatherPct, 100);
    const rent = mulDiv(yieldOut, RENT_PCT, 100);
    const income = Math.min(home.grain, rent - landTax(rent, home));
    home.grain -= income;
    res.landlordIncome = income;
    res.net += income;
  }
  h.grain += res.net;
  h.farmWeeks = 0;
  h.reliefPct = 0;
  h.rentHikePct = 0;
  return res;
}
