// Chợ quận: dân nền tổng hợp, kho lương, quỹ tiền, giá theo tháng, buôn giữa quận kề (ADR 0012).
// Toàn số nguyên. Lương thực: thăng; tiền: văn; giá: văn/đấu (1 đấu = 10 thăng).
import { calendarOf, GOOD_UNITS_PER_PART, GOODS, GRAIN_PER_DOU, HARVEST_MONTH, type MarketGoodView, type MarketView, type PriceTrend, type SettlementKind, type SupplyBand, type Tick } from '@tsvl/shared';

/** Tháng gặt nằm ở lịch chung (shared), xuất lại cho mã sim cũ. */
export { HARVEST_MONTH };
import type { RegionLogic } from '@tsvl/worldgen';
import { clamp, idiv, lerpTable, mulDiv } from '../core/math';
import type { Rng } from '../core/rng';

export interface CountyEconomy {
  /** Dân nền (miệng ăn); cố định ở v0.3, v0.4 thay một phần bằng NPC. */
  mouths: number;
  grain: number;
  money: number;
  /** Thời tiết năm nay của quận (%), quyết định mùa thu hoạch. */
  weatherPct: number;
  /** Giá niêm yết tháng này và tháng trước (văn/đấu). */
  price: number;
  prevPrice: number;
  /** Tai họa của năm nay (G3, S6): tên gọi của năm thời tiết xấu, phát ra ở `disasterMonth` (0 = không có). */
  disaster: DisasterKind | null;
  disasterMonth: number;
  /** Dịch trong quận: [từ tick, tới tick); −1 = không có. */
  epidemicFrom: number;
  epidemicUntil: number;
  /** Thuế đinh (tiền), thuế điền (lương) quận thu được từ đầu quý; pha Thế lực chia cho người giữ quận rồi về 0 (v0.6 S1). */
  taxMoney: number;
  taxGrain: number;
  /**
   * Mức thuế của người giữ quận (%; v0.6 S6, Q7): thuế đinh nhân thẳng, thuế điền nhân nửa phần lệch. Quan phủ đặt theo độ
   * tham (50 thanh liêm nhất … 150 tham nhất); quận cát cứ giữ lệ cũ 100. Pha Thế lực đặt mỗi quý.
   */
  taxPct: number;
  /**
   * Lương làm thuê (%; S6, Q10): trấn có thương hội đủ kho thì thương hội thuê thêm, trả cao hơn. Phần trả thêm quỹ quận
   * ứng trước, ghi ở `wageBonus`; đầu quý thương hội hoàn lại rồi về 0.
   */
  wagePct: number;
  wageBonus: number;
  /** Ruộng (mẫu) dân nền đã bán năm nay (v0.7 S2); đầu năm về 0. */
  landSold: number;
  /** Chợ hàng (v0.7 S3b, ADR 0021): mỗi món theo thứ tự `GOODS`. */
  goods: CountyGood[];
}

/** Kho (phân) và giá niêm yết tháng này, tháng trước (văn/phần) của một món ở chợ quận. */
export interface CountyGood {
  stock: number;
  price: number;
  prevPrice: number;
}

export const DISASTERS = ['drought', 'flood', 'locust'] as const;
export type DisasterKind = (typeof DISASTERS)[number];
/** Tháng phát của từng tai họa (mùa hạn, mùa lũ, mùa châu chấu). */
export const DISASTER_MONTHS: Record<DisasterKind, readonly [number, number]> = { drought: [5, 7], flood: [7, 9], locust: [6, 8] };
/** Năm thời tiết quận từ mức này trở xuống thì có tên tai họa. */
export const DISASTER_WEATHER_PCT = 85;
/** Xác suất dịch mỗi quận mỗi năm (ppm) và độ dài (tick). */
export const EPIDEMIC_PPM = 30_000;
export const EPIDEMIC_TICKS = 9;

export interface EconomyState {
  /** Mức thời tiết chung của vùng năm nay (%). */
  regionWeatherPct: number;
  counties: CountyEconomy[];
  /**
   * Lời của lái buôn trên mỗi đường (theo `adjacency`) từ đầu quý (v0.6 S3): chênh giá trừ phí chở trên số lương đã chở,
   * [quận a mua, quận b mua]. Pha Thế lực cho thương hội giữ đường lấy một phần từ quận mua rồi về 0.
   */
  tradeMargin: [number, number][];
}

/** Dân nền mỗi ô đất theo loại trị sở, nhân độ phì: đất tốt nuôi được nhiều người hơn. */
export const MOUTHS_PER_CELL = { village: 150, town: 200, city: 300 } as const;
/** Một miệng ăn một tháng (3 tuần × 10 thăng). */
export const MONTHLY_NEED_PER_MOUTH = 30;
/** Dự trữ ngoài phần ăn tới vụ kế tiếp lúc thế giới bắt đầu (tháng). */
export const INITIAL_RESERVE_MONTHS = 4;
export const MONEY_PER_MOUTH = 100;
/** Sản lượng năm thường của dân nền so với nhu cầu cả năm (%), trước thời tiết. */
export const BASE_YIELD_PCT = 107;
/** Hao hụt kho mỗi tháng (‰). */
export const SPOILAGE_PERMILLE = 5;

export const PRICE_BASE = 40;
/** Giá (% giá gốc) theo số tháng dự trữ × 1000. */
export const PRICE_BY_STOCK: readonly (readonly [number, number])[] = [[0, 500], [1000, 300], [3000, 150], [6000, 100], [12000, 70]];
export const BUY_PCT = 115;
export const SELL_PCT = 85;

/** Buôn quận kề: mỗi tháng chở tối đa 2% kho quận rẻ; phí chở (văn/đấu) = km × địa hình% × 5 / 10000. */
export const TRADE_SHARE_PERMILLE = 20;
export const TRANSPORT_PER_DOU_KM = 5;
/**
 * Lưu thông tiền ngoài lương thực (vải, đồ thủ công, chi tiêu): mỗi tháng, theo từng cạnh, chuyển bấy nhiêu ‰ phần chênh
 * để tiền trên đầu người hai quận bằng nhau. Không có kênh này thì quận hay phải mua lương bị rút cạn tiền vĩnh viễn
 * (đo 50 năm, 3 vùng: 41–49% tháng-quận có quỹ dưới 10% ban đầu; 20‰ còn 4–8%, 50‰ còn 1–2%, đói kém không đổi).
 */
export const MONEY_FLOW_PERMILLE = 50;

/**
 * Chợ hàng (v0.7 S3b, ADR 0021 Q13–Q14), mảng theo thứ tự `GOODS` (da, đồ thủ công, thảo dược). Hàng đếm bằng phân, giá
 * văn/phần (10 phân). Dân nền làm ra và dùng hết mỗi tháng theo miệng ăn và loại trị sở: làng dư da, thuốc; trấn, thành dư
 * đồ thủ công. Kho đầy thì dân nền làm ít đi, kho cạn thì làm nhiều lên (`GOOD_MAKE_BY_STOCK`), nên kho không phình mãi
 * cũng không cạn mãi. Giá theo số tháng tồn như lương (`PRICE_BY_STOCK`); lái buôn quận kề cùng luật với lương. Hàng
 * không nằm trong sổ cái tiền: mua bán chỉ chuyển tiền giữa túi người và quỹ quận.
 */
export const GOOD_BASE_PRICE: readonly number[] = [20, 60, 15];
/** Hư hao mỗi tháng (‰) ở kho quận và trong túi người. */
export const GOOD_SPOIL_PERMILLE: readonly number[] = [10, 0, 30];
/** Dân nền dùng mỗi tháng (phân trên 1.000 miệng ăn) theo loại trị sở. */
export const GOOD_USE: readonly Record<SettlementKind, number>[] = [
  { village: 60, town: 120, city: 150 },
  { village: 40, town: 50, city: 60 },
  { village: 60, town: 60, city: 60 },
];
/**
 * Dân nền làm ra lúc kho đủ 6 tháng (% phần dùng) theo loại trị sở. Da ở làng 90%: phần còn thiếu do thợ săn (NPC, người
 * chơi) bán vào. Đo ở S3b (4 vùng × 60 năm): làng làm ra 120% thì giá bán da ở chợ làng 15,5 văn/phần (thợ săn mất gần một
 * phần tư tiền da so với trả ngay 20 văn), 100% → 17,8, 90% → 20,8, 80% → 30,1.
 */
export const GOOD_MAKE_PCT: readonly Record<SettlementKind, number>[] = [
  { village: 90, town: 90, city: 80 },
  { village: 80, town: 120, city: 130 },
  { village: 130, town: 90, city: 80 },
];
/** Làm ra (%) theo số tháng tồn × 1000. */
export const GOOD_MAKE_BY_STOCK: readonly (readonly [number, number])[] = [[0, 140], [3000, 115], [6000, 100], [12000, 50]];
/** Có dịch thì thuốc dùng gấp ba (%). */
export const HERB_EPIDEMIC_USE_PCT = 300;
/** Kho mỗi món lúc thế giới bắt đầu (tháng dùng). */
export const GOOD_INITIAL_MONTHS = 4;

/** Phân dân nền một quận dùng mỗi tháng (năm thường, không dịch). */
export function goodUse(ce: CountyEconomy, g: number, kind: SettlementKind): number {
  return Math.max(1, mulDiv(ce.mouths, GOOD_USE[g]![kind], 1000));
}
function goodPrice(g: number, stock: number, use: number): number {
  return Math.max(1, mulDiv(GOOD_BASE_PRICE[g]!, lerpTable(PRICE_BY_STOCK, idiv(stock * 1000, use)), 100));
}
export const goodBuyPrice = (cg: CountyGood) => mulDiv(cg.price, BUY_PCT, 100);
export const goodSellPrice = (cg: CountyGood) => mulDiv(cg.price, SELL_PCT, 100);
/** Dải cung theo giá (giá đơn điệu theo số tháng tồn): dưới 1 tháng ⇔ trên 300%, dưới 3 ⇔ trên 150%, dưới 9 ⇔ trên 85%. */
function goodSupply(g: number, cg: CountyGood): SupplyBand {
  const pct = idiv(cg.price * 100, GOOD_BASE_PRICE[g]!);
  return pct > 300 ? 'famine' : pct > 150 ? 'scarce' : pct > 85 ? 'normal' : 'plenty';
}
const trendOf = (price: number, prev: number): PriceTrend => (price * 100 > prev * 105 ? 'rising' : price * 100 < prev * 95 ? 'falling' : 'steady');

function newCountyGoods(ce: CountyEconomy, kind: SettlementKind): CountyGood[] {
  return GOODS.map((_, g) => {
    const use = goodUse(ce, g, kind), stock = use * GOOD_INITIAL_MONTHS, price = goodPrice(g, stock, use);
    return { stock, price, prevPrice: price };
  });
}

/** Một tháng của chợ hàng một quận: dân nền làm ra, dùng, hư hao (trước khi lái buôn chở). */
function goodsMonth(ce: CountyEconomy, kind: SettlementKind, epidemic: boolean): void {
  ce.goods.forEach((cg, g) => {
    const use = goodUse(ce, g, kind);
    const make = mulDiv(mulDiv(use, GOOD_MAKE_PCT[g]![kind], 100), lerpTable(GOOD_MAKE_BY_STOCK, idiv(cg.stock * 1000, use)), 100);
    const used = epidemic && GOODS[g] === 'herb' ? mulDiv(use, HERB_EPIDEMIC_USE_PCT, 100) : use;
    cg.stock = Math.max(0, cg.stock + make - used);
    cg.stock -= idiv(cg.stock * GOOD_SPOIL_PERMILLE[g]!, 1000);
  });
}

/** Mức thời tiết năm của vùng và trọng số: mất mùa, kém, thường, khá, được mùa. */
export const WEATHER_LEVELS = [50, 80, 100, 110, 120] as const;
export const WEATHER_WEIGHTS = [6, 14, 50, 20, 10] as const;
export const WEATHER_COUNTY_NOISE = 10;

export function monthlyNeed(ce: CountyEconomy): number {
  return Math.max(1, ce.mouths * MONTHLY_NEED_PER_MOUTH);
}

/** Số tháng dự trữ × 1000. */
export function stockMonths(ce: CountyEconomy): number {
  return idiv(ce.grain * 1000, monthlyNeed(ce));
}

export function priceOf(ce: CountyEconomy): number {
  return mulDiv(PRICE_BASE, lerpTable(PRICE_BY_STOCK, stockMonths(ce)), 100);
}

export function supplyOf(ce: CountyEconomy): SupplyBand {
  const m = stockMonths(ce);
  return m < 1000 ? 'famine' : m < 3000 ? 'scarce' : m < 9000 ? 'normal' : 'plenty';
}

export const buyPrice = (ce: CountyEconomy) => mulDiv(ce.price, BUY_PCT, 100);
export const sellPrice = (ce: CountyEconomy) => mulDiv(ce.price, SELL_PCT, 100);

/**
 * Chợ lúc thế giới bắt đầu (tick sinh của người chơi). Kho đủ ăn tới vụ kế tiếp cộng dự trữ, để ai sinh sau mùa gặt
 * cũng không gặp đói kém giả do điểm bắt đầu.
 */
export function createEconomy(logic: RegionLogic, tick: Tick): EconomyState {
  const month = calendarOf(tick).month;
  const untilHarvest = (HARVEST_MONTH - month + 12) % 12;
  const counties = logic.counties.map((county, i): CountyEconomy => {
    const mouths = Math.max(1, mulDiv(county.area * MOUTHS_PER_CELL[logic.settlementKind[i]!], logic.fertilityPct[i]!, 100));
    const ce: CountyEconomy = {
      mouths, grain: mouths * MONTHLY_NEED_PER_MOUTH * (INITIAL_RESERVE_MONTHS + untilHarvest), money: mouths * MONEY_PER_MOUTH, weatherPct: 100, price: 0, prevPrice: 0,
      disaster: null, disasterMonth: 0, epidemicFrom: -1, epidemicUntil: -1, taxMoney: 0, taxGrain: 0, taxPct: 100, wagePct: 100, wageBonus: 0, landSold: 0, goods: [],
    };
    ce.price = ce.prevPrice = priceOf(ce);
    ce.goods = newCountyGoods(ce, logic.settlementKind[i]!);
    return ce;
  });
  return { regionWeatherPct: 100, counties, tradeMargin: logic.adjacency.map((): [number, number] => [0, 0]) };
}

/** Đầu năm: rút thời tiết vùng, cộng nhiễu theo quận (luồng weather). */
export function rollWeather(eco: EconomyState, rng: Rng): void {
  eco.regionWeatherPct = WEATHER_LEVELS[rng.weighted([...WEATHER_WEIGHTS])]!;
  for (const ce of eco.counties) ce.weatherPct = clamp(eco.regionWeatherPct + rng.int(-WEATHER_COUNTY_NOISE, WEATHER_COUNTY_NOISE), 30, 130);
}

/**
 * Đầu năm, sau khi rút thời tiết: năm xấu của quận được gọi tên (hạn, lũ, châu chấu) và định tháng phát; mỗi quận có
 * thể có dịch. Không đổi thời tiết — tai họa là cách năm xấu hiện ra, nên phân bố mùa màng và đói kém giữ nguyên (G3).
 */
export function labelDisasters(eco: EconomyState, rng: Rng, yearStart: Tick): void {
  for (const ce of eco.counties) {
    ce.disaster = null;
    ce.disasterMonth = 0;
    if (ce.weatherPct <= DISASTER_WEATHER_PCT) {
      const kind = DISASTERS[rng.int(0, DISASTERS.length - 1)]!;
      const [from, to] = DISASTER_MONTHS[kind];
      ce.disaster = kind;
      ce.disasterMonth = rng.int(from, to);
    }
    if (rng.chance(EPIDEMIC_PPM)) {
      ce.epidemicFrom = yearStart + rng.int(0, 11) * 3;
      ce.epidemicUntil = ce.epidemicFrom + EPIDEMIC_TICKS;
    }
  }
}

/** Quận đang có dịch ở tick này. */
export const epidemicAt = (ce: CountyEconomy, tick: Tick) => ce.epidemicFrom <= tick && tick < ce.epidemicUntil;

/**
 * Pha Thế giới, đầu tháng: thu hoạch (tháng thu hoạch), dân nền ăn, hao hụt, buôn quận kề, niêm yết giá.
 * Dân nền thiếu ăn chưa chết (v0.4 có NPC); kho chỉ chạm 0.
 */
/** Pha Thế giới đầu năm, dùng chung cho đời người chơi và thế giới tự chạy: thời tiết năm, rồi gọi tên tai họa (G3). */
export function worldYearStart(eco: EconomyState, rng: Rng, yearStart: Tick): void {
  for (const ce of eco.counties) ce.landSold = 0;
  rollWeather(eco, rng);
  labelDisasters(eco, rng, yearStart);
}

export function economyMonth(eco: EconomyState, logic: RegionLogic, tick: Tick): void {
  const harvest = calendarOf(tick).month === HARVEST_MONTH;
  eco.counties.forEach((ce, i) => {
    const need = monthlyNeed(ce);
    if (harvest) ce.grain += mulDiv(mulDiv(need * 12, BASE_YIELD_PCT, 100), ce.weatherPct, 100);
    ce.grain = Math.max(0, ce.grain - need);
    ce.grain -= idiv(ce.grain * SPOILAGE_PERMILLE, 1000);
    goodsMonth(ce, logic.settlementKind[i]!, epidemicAt(ce, tick));
  });
  // Cạnh đã sắp xếp (a < b) nên thứ tự buôn tất định
  logic.adjacency.forEach(([a, b], k) => {
    const A = eco.counties[a]!, B = eco.counties[b]!;
    const pa = priceOf(A), pb = priceOf(B);
    const [cheap, dear, pc, pd] = pa <= pb ? [A, B, pa, pb] : [B, A, pb, pa];
    const transport = idiv(logic.seatKm[a]![b]! * logic.terrainPct[k]! * TRANSPORT_PER_DOU_KM, 10_000);
    if (pd - pc <= transport) return;
    // Quận đắt mua theo giá quận rẻ; phí chở là ngưỡng lời của lái buôn, không làm mất tiền khỏi vùng
    const amount = Math.min(idiv(cheap.grain * TRADE_SHARE_PERMILLE, 1000), idiv(dear.money * GRAIN_PER_DOU, Math.max(1, pc)));
    if (amount <= 0) return;
    const pay = idiv(amount * pc, GRAIN_PER_DOU);
    cheap.grain -= amount; dear.grain += amount;
    dear.money -= pay; cheap.money += pay;
    eco.tradeMargin[k]![dear === A ? 0 : 1] += idiv(amount * (pd - pc - transport), GRAIN_PER_DOU);
  });
  // Lái buôn chở hàng (S3b): cùng luật, cùng phí chở mỗi phần như mỗi đấu lương, lời vào cùng sổ lời đường
  logic.adjacency.forEach(([a, b], k) => {
    const A = eco.counties[a]!, B = eco.counties[b]!;
    const transport = idiv(logic.seatKm[a]![b]! * logic.terrainPct[k]! * TRANSPORT_PER_DOU_KM, 10_000);
    for (let g = 0; g < GOODS.length; g++) {
      const ga = A.goods[g]!, gb = B.goods[g]!;
      const [cheap, dear, cg, dg] = ga.price <= gb.price ? [A, B, ga, gb] : [B, A, gb, ga];
      const pc = cg.price, pd = dg.price;
      if (pd - pc <= transport) continue;
      const amount = Math.min(idiv(cg.stock * TRADE_SHARE_PERMILLE, 1000), idiv(dear.money * GOOD_UNITS_PER_PART, pc));
      if (amount <= 0) continue;
      const pay = idiv(amount * pc, GOOD_UNITS_PER_PART);
      cg.stock -= amount; dg.stock += amount;
      dear.money -= pay; cheap.money += pay;
      eco.tradeMargin[k]![dear === A ? 0 : 1] += idiv(amount * (pd - pc - transport), GOOD_UNITS_PER_PART);
    }
  });
  logic.adjacency.forEach(([a, b]) => {
    const A = eco.counties[a]!, B = eco.counties[b]!;
    // x làm A.money/A.mouths = B.money/B.mouths; dương thì A giàu hơn
    const x = idiv(A.money * B.mouths - B.money * A.mouths, A.mouths + B.mouths);
    const flow = idiv(x * MONEY_FLOW_PERMILLE, 1000);
    A.money -= flow; B.money += flow;
  });
  eco.counties.forEach((ce, i) => {
    ce.prevPrice = ce.price;
    ce.price = priceOf(ce);
    const kind = logic.settlementKind[i]!;
    ce.goods.forEach((cg, g) => { cg.prevPrice = cg.price; cg.price = goodPrice(g, cg.stock, goodUse(ce, g, kind)); });
  });
}

/** Người mua `need` thăng ở chợ quận theo giá mua; trả số thăng mua được (giới hạn bởi kho và túi). */
export function buyGrain(ce: CountyEconomy, purse: { money: number; grain: number }, need: number): number {
  const p = buyPrice(ce);
  const n = Math.max(0, Math.min(need, ce.grain, idiv(purse.money * GRAIN_PER_DOU, Math.max(1, p))));
  if (n === 0) return 0;
  // Làm tròn lên phần lẻ văn; vẫn không vượt túi vì n × p / 10 ≤ tiền
  const cost = idiv(n * p + GRAIN_PER_DOU - 1, GRAIN_PER_DOU);
  purse.money -= cost; ce.money += cost;
  purse.grain += n; ce.grain -= n;
  return n;
}

/** `goods`: false thì bỏ chợ hàng (mảng rỗng) — bộ não NPC chỉ đọc phần lương, mỗi NPC gọi mỗi tháng (S3b). */
export function marketView(eco: EconomyState, county: number, goods = true): MarketView {
  const ce = eco.counties[county]!;
  const sell = sellPrice(ce);
  return {
    county, buyPrice: buyPrice(ce), sellPrice: sell, supply: supplyOf(ce), trend: trendOf(ce.price, ce.prevPrice),
    maxBuy: ce.grain, maxSell: idiv(ce.money * GRAIN_PER_DOU, Math.max(1, sell)),
    goods: !goods ? [] : ce.goods.map((cg, g): MarketGoodView => ({
      id: GOODS[g]!, buyPrice: goodBuyPrice(cg), sellPrice: goodSellPrice(cg), supply: goodSupply(g, cg), trend: trendOf(cg.price, cg.prevPrice),
      maxBuy: cg.stock, maxSell: idiv(ce.money * GOOD_UNITS_PER_PART, Math.max(1, goodSellPrice(cg))),
    })),
  };
}

/** Tổng tiền các quỹ quận (sổ cái: cộng túi người chơi phải không đổi qua mọi tick). */
export function countyMoney(eco: EconomyState): number {
  return eco.counties.reduce((s, ce) => s + ce.money, 0);
}
