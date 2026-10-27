// Hộ và chợ quận như người chơi thấy (ADR 0012, 0013). Chỉ kiểu và validate, không có luật.
import type { CountyIndex } from './actions';
import { bool, nat, obj, oneOf, type Validator } from './schema';

/** Tiền, đơn vị văn (số nguyên). */
export type Coin = number;
/** Lương thực, đơn vị thăng (số nguyên); 10 thăng = 1 đấu = khẩu phần người lớn một tuần. */
export type Grain = number;
export const GRAIN_PER_DOU = 10;

export const HUNGER_BANDS = ['fed', 'hungry', 'starving', 'famished'] as const;
export type HungerBand = (typeof HUNGER_BANDS)[number];

export const SUPPLY_BANDS = ['plenty', 'normal', 'scarce', 'famine'] as const;
export type SupplyBand = (typeof SUPPLY_BANDS)[number];

/** Quyền với ruộng: không có, tá điền, tự canh, chủ cho thuê một phần. */
export const TENURES = ['none', 'tenant', 'owner', 'landlord'] as const;
export type Tenure = (typeof TENURES)[number];

/** Kho + tiền nuôi được bao lâu: không còn, vài tuần, một mùa, một năm trở lên. */
export const FOOD_WEEKS_BANDS = ['none', 'short', 'season', 'year'] as const;
export type FoodWeeksBand = (typeof FOOD_WEEKS_BANDS)[number];

export const PRICE_TRENDS = ['falling', 'steady', 'rising'] as const;
export type PriceTrend = (typeof PRICE_TRENDS)[number];

export interface HouseholdView {
  /** Đã lập thân (tự nuôi mình) chưa; trước đó cha mẹ nuôi (ADR 0013). */
  independent: boolean;
  money: Coin;
  grain: Grain;
  landMu: number;
  tenure: Tenure;
  /** Mức đói; bộ đếm đói thật là trường ẩn. */
  hungerBand: HungerBand;
  foodWeeksBand: FoodWeeksBand;
}

/** Chợ quận đang đứng. Giá do mô phỏng (ADR 0012). */
export interface MarketView {
  county: CountyIndex;
  /** Văn/đấu khi người chơi mua. */
  buyPrice: Coin;
  /** Văn/đấu khi người chơi bán. */
  sellPrice: Coin;
  supply: SupplyBand;
  trend: PriceTrend;
  /** Giới hạn mua/bán lúc này (thăng), theo kho và quỹ của quận. */
  maxBuy: Grain;
  maxSell: Grain;
}

export const vHouseholdView: Validator<HouseholdView> = obj<HouseholdView>({
  independent: bool,
  money: nat,
  grain: nat,
  landMu: nat,
  tenure: oneOf(TENURES),
  hungerBand: oneOf(HUNGER_BANDS),
  foodWeeksBand: oneOf(FOOD_WEEKS_BANDS),
});

export const vMarketView: Validator<MarketView> = obj<MarketView>({
  county: nat,
  buyPrice: nat,
  sellPrice: nat,
  supply: oneOf(SUPPLY_BANDS),
  trend: oneOf(PRICE_TRENDS),
  maxBuy: nat,
  maxSell: nat,
});
