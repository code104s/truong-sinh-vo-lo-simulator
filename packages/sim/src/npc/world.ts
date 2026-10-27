// Thế giới tự chạy không người chơi (v0.4 Q11): chỉ là công cụ kiểm dân số NPC và kinh tế nhiều năm; trong game,
// người chơi chết thì thế giới dừng (GDD 3.2 C). Dùng đúng pha Thế giới và pha NPC của đời người chơi. Thuần, tất định.
import { ageYearsAt, isMonthStart, isYearStart, regionId, TICKS_PER_YEAR } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { hash32 } from '../core/hash';
import { RngStreams } from '../core/rng';
import { countyMoney, createEconomy, economyMonth, MONEY_PER_MOUTH, PRICE_BASE, supplyOf, worldYearStart } from '../economy/market';
import { STREAMS } from '../life/life';
import { npcPhase, type NpcPhaseOptions } from './phase';
import { npcQuota, seedPopulation } from './population';
import { newNpcWorld, npcMoney, type NpcState } from './state';

export interface WorldRunStats {
  years: number;
  counties: number;
  ticks: number;
  /** Số NPC còn sống lúc đầu và lúc cuối. */
  npcStart: number;
  npcEnd: number;
  /** Sổ cái: tổng tiền quỹ quận + túi NPC lúc đầu và lúc cuối. */
  moneyStart: number;
  moneyEnd: number;
  /** NPC mất trong lượt chạy, theo nguyên nhân, và tổng tuổi lúc mất (để tính tuổi thọ trung bình). */
  deaths: Record<string, number>;
  deathAgeSum: number;
  /** Chết đói trong năm thường: quận nhà không đói kém, khan hiếm trong 12 tháng trước đó (tiêu chí S2: ≤ 5%). */
  starvationNormalYears: number;
  /** Dân số (S4), đo đầu mỗi năm sau năm đầu: số người sống ở mỗi quận so với hạn mức (%), thấp và cao nhất. */
  minQuotaPct: number;
  maxQuotaPct: number;
  /** Tỉ lệ dưới 16 tuổi (‰), trung bình các năm. */
  childrenPermille: number;
  /** Số năm có ít nhất một thầy thuốc / thương nhân trong vùng. */
  yearsWithPhysician: number;
  yearsWithMerchant: number;
  /** Nhiều nhất bao nhiêu thầy thuốc cùng một quận cùng lúc (trần: 1, ADR 0016). */
  maxPhysiciansPerCounty: number;
  /** Trẻ sinh trong lượt chạy. */
  births: number;
  /**
   * Kinh tế có NPC (S5), cùng cách đo với `pnpm sim economy` (ADR 0012): số lần quận rơi vào đói kém, tháng-quận quỹ
   * dưới 10% ban đầu (‰), giá thấp/cao nhất (% giá gốc), kho thấp nhất; số tick sổ cái lệch (phải là 0).
   */
  famines: number;
  lowMoneyMonthsPermille: number;
  minPricePct: number;
  maxPricePct: number;
  minGrain: number;
  ledgerBreaks: number;
}

/** Một quận "năm khó" nếu đói kém hay khan hiếm trong ngần ấy tick gần nhất. */
const HARD_WINDOW = TICKS_PER_YEAR;

export interface WorldRunOptions extends NpcPhaseOptions {
  regionId?: string;
}

export function simulateWorld(logic: RegionLogic, years: number, seed: string, opts: WorldRunOptions = {}): WorldRunStats {
  const root = hash32('tsvl-world', seed);
  const streams = RngStreams.create(root, STREAMS);
  const eco = createEconomy(logic, 0);
  const npcs = newNpcWorld(root, regionId(opts.regionId ?? 'r0'));
  seedPopulation(npcs, eco, logic, streams.get('npc-world'), 0, null);
  const alive = () => npcs.people.filter((n) => n.death === null).length;
  const money = () => countyMoney(eco) + npcMoney(npcs);
  const stats: WorldRunStats = { years, counties: eco.counties.length, ticks: years * TICKS_PER_YEAR, npcStart: alive(), npcEnd: 0, moneyStart: money(), moneyEnd: 0, deaths: {}, deathAgeSum: 0, starvationNormalYears: 0, minQuotaPct: Number.MAX_SAFE_INTEGER, maxQuotaPct: 0, childrenPermille: 0, yearsWithPhysician: 0, yearsWithMerchant: 0, maxPhysiciansPerCounty: 0, births: 0,
    famines: 0, lowMoneyMonthsPermille: 0, minPricePct: Number.MAX_SAFE_INTEGER, maxPricePct: 0, minGrain: Number.MAX_SAFE_INTEGER, ledgerBreaks: 0 };
  const inFamine = eco.counties.map((ce) => supplyOf(ce) === 'famine');
  let lowMoneyMonths = 0, months = 0;
  const firstId = npcs.nextId;
  const quota = npcQuota(logic);
  let childSum = 0, measured = 0;
  const lastHard = eco.counties.map(() => -HARD_WINDOW - 1);
  const dead: NpcState[] = [];
  for (let t = 0; t < stats.ticks; t++) {
    if (isYearStart(t)) worldYearStart(eco, streams.get('weather'), t);
    if (isMonthStart(t)) {
      economyMonth(eco, logic, t);
      eco.counties.forEach((ce, i) => {
        const s = supplyOf(ce);
        if (s === 'famine' && !inFamine[i]) stats.famines++;
        inFamine[i] = s === 'famine';
        if (ce.money * 10 < ce.mouths * MONEY_PER_MOUTH) lowMoneyMonths++;
        const pct = Math.trunc((ce.price * 100) / PRICE_BASE);
        stats.minPricePct = Math.min(stats.minPricePct, pct); stats.maxPricePct = Math.max(stats.maxPricePct, pct);
        stats.minGrain = Math.min(stats.minGrain, ce.grain);
        months++;
      });
    }
    eco.counties.forEach((ce, i) => { const s = supplyOf(ce); if (s === 'famine' || s === 'scarce') lastHard[i] = t; });
    npcPhase(npcs, eco, logic, t, null, opts);
    if (money() !== stats.moneyStart) stats.ledgerBreaks++;
    // Người đã mất bị dọn khỏi danh sách sau một năm (S4): ghi lại để thống kê
    for (const n of npcs.people) if (n.death?.tick === t) dead.push(n);
    for (const n of npcs.people) {
      if (n.death?.tick === t && n.death.cause === 'starvation' && t - lastHard[n.character.home]! > HARD_WINDOW) stats.starvationNormalYears++;
    }
    if (isYearStart(t) && t > 0) {
      const living = npcs.people.filter((n) => n.death === null);
      quota.forEach((q, county) => {
        const pct = Math.floor((100 * living.filter((n) => n.character.home === county).length) / q);
        stats.minQuotaPct = Math.min(stats.minQuotaPct, pct); stats.maxQuotaPct = Math.max(stats.maxQuotaPct, pct);
      });
      childSum += Math.floor((1000 * living.filter((n) => ageYearsAt(n.character.birthTick, t) < 16).length) / Math.max(1, living.length));
      measured++;
      if (living.some((n) => n.occupation === 'physician')) stats.yearsWithPhysician++;
      quota.forEach((_, county) => { stats.maxPhysiciansPerCounty = Math.max(stats.maxPhysiciansPerCounty, living.filter((n) => n.occupation === 'physician' && n.character.location === county).length); });
      if (living.some((n) => n.occupation === 'merchant')) stats.yearsWithMerchant++;
    }
  }
  stats.childrenPermille = Math.floor(childSum / Math.max(1, measured));
  stats.births = npcs.nextId - firstId;
  stats.lowMoneyMonthsPermille = Math.trunc((lowMoneyMonths * 1000) / Math.max(1, months));
  for (const n of dead) {
    stats.deaths[n.death!.cause] = (stats.deaths[n.death!.cause] ?? 0) + 1;
    stats.deathAgeSum += ageYearsAt(n.character.birthTick, n.death!.tick);
  }
  stats.npcEnd = alive();
  stats.moneyEnd = money();
  return stats;
}
