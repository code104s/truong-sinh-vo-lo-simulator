// Hộ và chợ quận như người chơi thấy (ADR 0012, 0013). Chỉ kiểu và validate, không có luật.
import type { CountyIndex } from './actions';
import { arr, bool, nat, obj, oneOf, type Validator } from './schema';

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

/** Hàng hóa (v0.7 S3b, ADR 0021): da thú, đồ thủ công, thảo dược. Khóa nội dung `good.<id>`. Mảng hàng theo thứ tự này. */
export const GOODS = ['hide', 'wares', 'herb'] as const;
export type GoodId = (typeof GOODS)[number];
/** Hàng đếm bằng phân (số nguyên); 10 phân = 1 phần, đơn vị giá — như thăng và đấu của lương thực. */
export const GOOD_UNITS_PER_PART = 10;

/** Một món trong túi đồ (phân). */
export interface GoodStack { id: GoodId; qty: number }

/** Một món ở chợ quận đang đứng; giá văn/phần, giới hạn mua bán bằng phân. */
export interface MarketGoodView {
  id: GoodId;
  buyPrice: Coin;
  sellPrice: Coin;
  supply: SupplyBand;
  trend: PriceTrend;
  maxBuy: number;
  maxSell: number;
}

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
  /** Kho riêng đủ ăn bao nhiêu tuần nữa, chưa tính tiền (F4). */
  grainWeeks: number;
  /** Kho cộng tiền quy ra lương theo giá mua ở chợ đang đứng, đủ ăn bao nhiêu tuần (F4); `foodWeeksBand` là dải của số này. */
  foodWeeks: number;
  /** Túi đồ (v0.7 S3b): chỉ món đang có, theo thứ tự `GOODS`; và sức gánh tối đa (phân, tổng mọi món). */
  goods: GoodStack[];
  goodsCap: number;
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
  /** Chợ hàng (v0.7 S3b), đủ ba món theo thứ tự `GOODS`. */
  goods: MarketGoodView[];
}

export const vGoodStack: Validator<GoodStack> = obj<GoodStack>({ id: oneOf(GOODS), qty: nat });

export const vMarketGoodView: Validator<MarketGoodView> = obj<MarketGoodView>({
  id: oneOf(GOODS),
  buyPrice: nat,
  sellPrice: nat,
  supply: oneOf(SUPPLY_BANDS),
  trend: oneOf(PRICE_TRENDS),
  maxBuy: nat,
  maxSell: nat,
});

export const vHouseholdView: Validator<HouseholdView> = obj<HouseholdView>({
  independent: bool,
  money: nat,
  grain: nat,
  landMu: nat,
  tenure: oneOf(TENURES),
  hungerBand: oneOf(HUNGER_BANDS),
  foodWeeksBand: oneOf(FOOD_WEEKS_BANDS),
  grainWeeks: nat,
  foodWeeks: nat,
  goods: arr(vGoodStack),
  goodsCap: nat,
});

export const vMarketView: Validator<MarketView> = obj<MarketView>({
  county: nat,
  buyPrice: nat,
  sellPrice: nat,
  supply: oneOf(SUPPLY_BANDS),
  trend: oneOf(PRICE_TRENDS),
  maxBuy: nat,
  maxSell: nat,
  goods: arr(vMarketGoodView),
});
