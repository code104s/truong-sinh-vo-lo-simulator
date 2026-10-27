import { describe, expect, it } from 'vitest';
import { birthplaceId, regionId, vMarketView } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { Life, Rng, simulateEconomy } from '../src/index';
import {
  buyGrain, buyPrice, countyMoney, createEconomy, economyMonth, HARVEST_MONTH, INITIAL_RESERVE_MONTHS, marketView, MONTHLY_NEED_PER_MOUTH,
  MOUTHS_PER_CELL, PRICE_BASE, priceOf, rollWeather, stockMonths, supplyOf, WEATHER_COUNTY_NOISE, WEATHER_LEVELS, type CountyEconomy,
} from '../src/economy/market';
import type { CharacterState } from '../src/life/character';

/** Ba quận thẳng hàng: làng — trấn — làng, cách nhau 60 km đồng bằng. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1, 2].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town', 'village'], adjacency: [[0, 1], [1, 2]], terrainPct: [100, 100], fertilityPct: [100, 100, 80],
  seatKm: [[0, 60, 120], [60, 0, 60], [120, 60, 0]],
};
/** Tick đầu tháng `month` của năm 2. */
const monthStart = (month: number) => 36 + (month - 1) * 3;
const county = (grain: number, money = 1_000_000, mouths = 10_000): CountyEconomy => {
  const ce = { mouths, grain, money, weatherPct: 100, price: 0, prevPrice: 0 };
  ce.price = ce.prevPrice = priceOf(ce);
  return ce;
};

function adult(seed: string, patch: (c: CharacterState) => void = () => {}) {
  const l = Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }, region);
  const s = l.snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 2;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  patch(s.character);
  return Life.restore(s, [], region);
}

describe('chợ quận: dân nền, kho, giá (ADR 0012)', () => {
  it('dân nền theo diện tích, loại trị sở và độ phì; kho đủ tới vụ kế tiếp cộng dự trữ', () => {
    const eco = createEconomy(region, monthStart(3));
    expect(eco.counties.map((c) => c.mouths)).toEqual([100 * MOUTHS_PER_CELL.village, 100 * MOUTHS_PER_CELL.town, 80 * MOUTHS_PER_CELL.village]);
    const months = INITIAL_RESERVE_MONTHS + HARVEST_MONTH - 3;
    for (const c of eco.counties) expect(c.grain).toBe(c.mouths * MONTHLY_NEED_PER_MOUTH * months);
    // Sinh ngay sau mùa gặt thì kho lớn nhất
    expect(createEconomy(region, monthStart(10)).counties[0]!.grain).toBe(eco.counties[0]!.mouths * MONTHLY_NEED_PER_MOUTH * (INITIAL_RESERVE_MONTHS + 11));
  });

  it('giá theo số tháng dự trữ: ít lương thì đắt, trong khoảng 70–500% giá gốc', () => {
    const need = 10_000 * MONTHLY_NEED_PER_MOUTH;
    const prices = [0, 1, 2, 3, 6, 9, 12, 24].map((m) => priceOf(county(need * m)));
    expect(prices[0]).toBe(PRICE_BASE * 5);
    expect(prices[4]).toBe(PRICE_BASE);
    expect(prices.at(-1)).toBe(Math.trunc((PRICE_BASE * 70) / 100));
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]!);
    expect([0, 0.5, 2, 6, 10].map((m) => supplyOf(county(need * m)))).toEqual(['famine', 'famine', 'scarce', 'normal', 'plenty']);
  });

  it('mua đắt hơn, bán rẻ hơn giá niêm yết; chợ có giới hạn mua bán', () => {
    const eco = createEconomy(region, monthStart(3));
    const v = marketView(eco, 1);
    expect(vMarketView.check(v, '$')).toBeNull();
    expect(v.buyPrice).toBeGreaterThan(eco.counties[1]!.price);
    expect(v.sellPrice).toBeLessThan(eco.counties[1]!.price);
    expect(v.maxBuy).toBe(eco.counties[1]!.grain);
  });

  it('thu hoạch chỉ vào tháng thu hoạch; dân nền ăn mỗi tháng; kho không âm', () => {
    const eco = createEconomy(region, monthStart(3));
    const g0 = eco.counties[0]!.grain;
    economyMonth(eco, region, monthStart(4));
    expect(eco.counties[0]!.grain).toBeLessThan(g0);
    const before = eco.counties[0]!.grain;
    economyMonth(eco, region, monthStart(HARVEST_MONTH));
    expect(eco.counties[0]!.grain).toBeGreaterThan(before * 2);
    eco.counties[2]!.grain = 5;
    economyMonth(eco, region, monthStart(5));
    expect(eco.counties[2]!.grain).toBeGreaterThanOrEqual(0);
  });

  it('thời tiết năm: tất định, theo mức vùng, nhiễu theo quận có giới hạn', () => {
    const a = createEconomy(region, 0), b = createEconomy(region, 0);
    const ra = Rng.fromSeed(9), rb = Rng.fromSeed(9);
    for (let y = 0; y < 50; y++) {
      rollWeather(a, ra); rollWeather(b, rb);
      expect(WEATHER_LEVELS).toContain(a.regionWeatherPct);
      for (const c of a.counties) expect(Math.abs(c.weatherPct - a.regionWeatherPct)).toBeLessThanOrEqual(WEATHER_COUNTY_NOISE);
    }
    expect(a).toEqual(b);
  });
});

describe('buôn quận kề và sổ cái tiền', () => {
  it('lương chảy từ quận rẻ sang quận đắt, tiền chảy ngược; tổng tiền không đổi', () => {
    const eco = createEconomy(region, monthStart(3));
    eco.counties[0]!.grain *= 4; // làng 0 thừa lương
    eco.counties[2]!.grain = 0;
    const money = countyMoney(eco);
    const [g0, m0] = [eco.counties[0]!.grain, eco.counties[0]!.money];
    economyMonth(eco, region, monthStart(4));
    expect(eco.counties[0]!.money).toBeGreaterThan(m0);
    expect(eco.counties[0]!.grain).toBeLessThan(g0 - eco.counties[0]!.mouths * MONTHLY_NEED_PER_MOUTH);
    expect(eco.counties[2]!.grain).toBeGreaterThan(0); // trấn giữa mua rồi bán tiếp sang làng 2
    expect(countyMoney(eco)).toBe(money);
  });

  it('chênh giá không đủ bù phí chở thì không buôn', () => {
    const far: RegionLogic = { ...region, terrainPct: [300, 300], seatKm: [[0, 600, 1200], [600, 0, 600], [1200, 600, 0]] };
    const eco = createEconomy(far, monthStart(3));
    eco.counties[0]!.grain = eco.counties[0]!.grain + eco.counties[0]!.mouths * MONTHLY_NEED_PER_MOUTH; // rẻ hơn chút
    const m = eco.counties.map((c) => c.money);
    economyMonth(eco, far, monthStart(4));
    expect(eco.counties.map((c) => c.money)).toEqual(m);
  });

  it('100 năm không người chơi × 5 seed: tiền bảo toàn, kho không âm, giá trong khoảng, có đói kém nhưng không triền miên', () => {
    for (let i = 0; i < 5; i++) {
      const s = simulateEconomy(region, 100, `unit-${i}`);
      expect(s.moneyEnd).toBe(s.moneyStart);
      expect(s.minGrain).toBeGreaterThanOrEqual(0);
      expect(s.minPricePct).toBeGreaterThanOrEqual(70);
      expect(s.maxPricePct).toBeLessThanOrEqual(500);
      expect(s.famineMonthsPermille).toBeLessThan(100);
    }
    const total = [0, 1, 2, 3, 4].reduce((n, i) => n + simulateEconomy(region, 100, `unit-${i}`).famines, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe('người chơi và chợ', () => {
  it('thiếu lương mà có tiền thì tự mua ở chợ đang đứng, đủ ăn; tiền vào quỹ quận', () => {
    const l = adult('buy', (c) => { c.household.independent = true; c.household.money = 2_000; c.household.grain = 0; });
    const total = l.totalMoney();
    l.advance('week');
    expect(l.character.household.hunger).toBe(0);
    expect(l.character.household.money).toBeLessThan(2_000);
    expect(l.totalMoney()).toBe(total);
  });

  it('sổ cái: tổng tiền vùng không đổi qua từng tick suốt 3 năm tự mua ăn', () => {
    const l = adult('ledger', (c) => { c.household.independent = true; c.household.money = 50_000; c.household.grain = 0; });
    const total = l.totalMoney();
    for (let i = 0; i < 3 * 36 && l.alive; i++) {
      l.advance('week');
      expect(l.totalMoney()).toBe(total);
    }
    expect(l.character.household.money).toBeLessThan(50_000);
  });

  it('hết tiền, hết lương thì đói dù chợ còn lương', () => {
    const l = adult('broke', (c) => { c.household.independent = true; c.household.money = 0; c.household.grain = 0; });
    l.advance('week');
    expect(l.character.household.hunger).toBeGreaterThan(0);
  });

  it('chợ cạn thì có tiền cũng không mua được', () => {
    const l = adult('empty', (c) => { c.household.independent = true; c.household.money = 10_000; c.household.grain = 0; });
    const s = l.snapshot(); s.economy.counties[0]!.grain = 0;
    const dry = Life.restore(s, [], region);
    dry.advance('week');
    expect(dry.character.household.hunger).toBeGreaterThan(0);
    expect(dry.character.household.money).toBe(10_000);
  });

  it('buyGrain không bao giờ tiêu quá túi, làm tròn lên phần lẻ văn', () => {
    const ce = county(1_000_000);
    for (const money of [0, 1, 5, 47, 1000, 12345]) {
      const purse = { money, grain: 0 };
      const n = buyGrain(ce, purse, 10_000);
      expect(purse.money).toBeGreaterThanOrEqual(0);
      expect(purse.money).toBeLessThan(Math.ceil(buyPrice(ce) / 10) + 1);
      expect(purse.grain).toBe(n);
    }
  });

  it('quận nhà đói kém: trẻ nhà nghèo bị bỏ đói, tin đói kém ngắt tua', () => {
    const l = adult('famine', (c) => { c.birthTick = 20 * 36 + 2 - 5 * 36; c.background = 'destitute'; });
    const s = l.snapshot();
    // Đầu tháng kế tiếp chợ quận nhà còn chưa tới một tháng dự trữ
    s.economy.counties[0]!.grain = s.economy.counties[0]!.mouths * MONTHLY_NEED_PER_MOUTH;
    s.economy.counties[1]!.grain = s.economy.counties[2]!.grain = 0;
    const kid = Life.restore(s, [], region);
    const r = kid.advance('year'); // dừng ở tin đầu tiên quan trọng
    expect(r.status).toBe('interrupted');
    if (r.status === 'interrupted') expect(r.entry.key).toBe('log.world.famine');
    for (let i = 0; i < 12 && kid.alive; i++) kid.advance('week');
    expect(kid.log.some((e) => e.key.startsWith('log.hunger.'))).toBe(true);
    expect(stockMonths(kid.snapshot().economy.counties[0]!)).toBeLessThan(1000);
  });
});
