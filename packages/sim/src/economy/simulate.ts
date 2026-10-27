// Chạy chợ quận nhiều năm không người chơi để kiểm ổn định (ADR 0012, nghiệm thu v0.3). Thuần, tất định.
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { hash32 } from '../core/hash';
import { Rng } from '../core/rng';
import { countyMoney, createEconomy, economyMonth, PRICE_BASE, rollWeather, supplyOf } from './market';

export interface EconomyRunStats {
  years: number;
  counties: number;
  /** Số lần một quận rơi vào đói kém (chuyển từ không đói kém sang đói kém). */
  famines: number;
  /** Tỉ lệ tháng-quận ở mức đói kém, khan hiếm (‰). */
  famineMonthsPermille: number;
  scarceMonthsPermille: number;
  /** Giá thấp nhất, cao nhất (% giá gốc). */
  minPricePct: number;
  maxPricePct: number;
  /** Tổng tiền vùng lúc đầu và lúc cuối (sổ cái). */
  moneyStart: number;
  moneyEnd: number;
  minGrain: number;
}

export function simulateEconomy(logic: RegionLogic, years: number, seed: string): EconomyRunStats {
  const eco = createEconomy(logic, 0);
  const rng = Rng.fromSeed(hash32('tsvl-economy', seed));
  const n = eco.counties.length;
  const famine = eco.counties.map((ce) => supplyOf(ce) === 'famine');
  const stats: EconomyRunStats = {
    years, counties: n, famines: 0, famineMonthsPermille: 0, scarceMonthsPermille: 0,
    minPricePct: Number.MAX_SAFE_INTEGER, maxPricePct: 0, moneyStart: countyMoney(eco), moneyEnd: 0, minGrain: Number.MAX_SAFE_INTEGER,
  };
  let famineMonths = 0, scarceMonths = 0;
  for (let t = 0; t < years * TICKS_PER_YEAR; t += TICKS_PER_MONTH) {
    if (t % TICKS_PER_YEAR === 0) rollWeather(eco, rng);
    economyMonth(eco, logic, t);
    eco.counties.forEach((ce, i) => {
      const s = supplyOf(ce);
      if (s === 'famine') { famineMonths++; if (!famine[i]) stats.famines++; }
      if (s === 'scarce') scarceMonths++;
      famine[i] = s === 'famine';
      stats.minPricePct = Math.min(stats.minPricePct, Math.trunc((ce.price * 100) / PRICE_BASE));
      stats.maxPricePct = Math.max(stats.maxPricePct, Math.trunc((ce.price * 100) / PRICE_BASE));
      stats.minGrain = Math.min(stats.minGrain, ce.grain);
    });
  }
  const months = years * 12 * n;
  stats.famineMonthsPermille = Math.trunc((famineMonths * 1000) / months);
  stats.scarceMonthsPermille = Math.trunc((scarceMonths * 1000) / months);
  stats.moneyEnd = countyMoney(eco);
  return stats;
}
