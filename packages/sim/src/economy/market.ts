// Chợ quận: dân nền tổng hợp, kho lương, quỹ tiền, giá theo tháng, buôn giữa quận kề (ADR 0012).
// Toàn số nguyên. Lương thực: thăng; tiền: văn; giá: văn/đấu (1 đấu = 10 thăng).
import { calendarOf, GRAIN_PER_DOU, HARVEST_MONTH, type MarketView, type SupplyBand, type Tick } from '@tsvl/shared';

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
      disaster: null, disasterMonth: 0, epidemicFrom: -1, epidemicUntil: -1,
    };
    ce.price = ce.prevPrice = priceOf(ce);
    return ce;
  });
  return { regionWeatherPct: 100, counties };
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
  rollWeather(eco, rng);
  labelDisasters(eco, rng, yearStart);
}

export function economyMonth(eco: EconomyState, logic: RegionLogic, tick: Tick): void {
  const harvest = calendarOf(tick).month === HARVEST_MONTH;
  for (const ce of eco.counties) {
    const need = monthlyNeed(ce);
    if (harvest) ce.grain += mulDiv(mulDiv(need * 12, BASE_YIELD_PCT, 100), ce.weatherPct, 100);
    ce.grain = Math.max(0, ce.grain - need);
    ce.grain -= idiv(ce.grain * SPOILAGE_PERMILLE, 1000);
  }
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
  });
  logic.adjacency.forEach(([a, b]) => {
    const A = eco.counties[a]!, B = eco.counties[b]!;
    // x làm A.money/A.mouths = B.money/B.mouths; dương thì A giàu hơn
    const x = idiv(A.money * B.mouths - B.money * A.mouths, A.mouths + B.mouths);
    const flow = idiv(x * MONEY_FLOW_PERMILLE, 1000);
    A.money -= flow; B.money += flow;
  });
  for (const ce of eco.counties) {
    ce.prevPrice = ce.price;
    ce.price = priceOf(ce);
  }
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

export function marketView(eco: EconomyState, county: number): MarketView {
  const ce = eco.counties[county]!;
  const sell = sellPrice(ce);
  const trend = ce.price * 100 > ce.prevPrice * 105 ? 'rising' : ce.price * 100 < ce.prevPrice * 95 ? 'falling' : 'steady';
  return {
    county, buyPrice: buyPrice(ce), sellPrice: sell, supply: supplyOf(ce), trend,
    maxBuy: ce.grain, maxSell: idiv(ce.money * GRAIN_PER_DOU, Math.max(1, sell)),
  };
}

/** Tổng tiền các quỹ quận (sổ cái: cộng túi người chơi phải không đổi qua mọi tick). */
export function countyMoney(eco: EconomyState): number {
  return eco.counties.reduce((s, ce) => s + ce.money, 0);
}
