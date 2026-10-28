// Thế giới tự chạy không người chơi (v0.4 Q11): chỉ là công cụ kiểm dân số NPC và kinh tế nhiều năm; trong game,
// người chơi chết thì thế giới dừng (GDD 3.2 C). Dùng đúng pha Thế giới và pha NPC của đời người chơi. Thuần, tất định.
import { ageYearsAt, isMonthStart, isQuarterStart, isYearStart, regionId, TICKS_PER_YEAR } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { hash32 } from '../core/hash';
import { RngStreams } from '../core/rng';
import { countyMoney, createEconomy, economyMonth, MONEY_PER_MOUTH, PRICE_BASE, supplyOf, worldYearStart } from '../economy/market';
import { STREAMS } from '../life/life';
import { npcPhase, type NpcPhaseOptions } from './phase';
import { npcQuota, seedPopulation } from './population';
import { seedFamilies } from './family';
import { newNpcWorld, npcMoney, type NpcState } from './state';
import { controlOf, factionMoney, factionPhase, newFactionWorld } from '../factions/state';
import { foundGovernment, GREEDY_FROM, HONEST_BELOW } from '../factions/government';

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
  /** Trẻ sinh trong lượt chạy, và số trẻ có cha mẹ thật (S2 v0.5). */
  births: number;
  birthsWithParents: number;
  /** Người 25–50 tuổi có vợ/chồng còn sống (‰), trung bình các năm (S2 v0.5). */
  marriedPermille: number;
  /** Phụ nữ sinh trong lượt chạy đã qua 45 tuổi: số người và tổng số con (S2 v0.5). */
  mothersOver45: number;
  childrenOfMothersOver45: number;
  /** Như trên, chỉ người đã từng có chồng. */
  wivesOver45: number;
  childrenOfWivesOver45: number;
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
  /** Phần tiền NPC nắm trong tổng tiền vùng (‰), đo đầu mỗi năm: cao nhất và năm cuối (S3–S8 v0.5: tiền không dồn mãi). */
  npcMoneyPermilleMax: number;
  npcMoneyPermilleEnd: number;
  /** Kho thế lực (v0.6 S1), đầu mỗi năm: tiền cao nhất và năm cuối (văn), lương năm cuối (thăng). */
  factionMoneyMax: number;
  factionMoneyEnd: number;
  factionGrainEnd: number;
  /**
   * Gia tộc (v0.6 S2): số còn sống đầu mỗi năm (thấp nhất từ năm 10, cao nhất, năm cuối); số lập sau năm đầu, số tàn (cả nhập vào họ
   * khác), số chi tách; số quận có ít nhất hai họ lần lượt đứng đầu.
   */
  clansMin: number;
  clansMax: number;
  clansEnd: number;
  clansFounded: number;
  clansEnded: number;
  clansSplit: number;
  leaderChangedCounties: number;
  /**
   * Thương hội (v0.6 S3): số còn sống đầu mỗi năm (thấp nhất từ năm 10, cao nhất, năm cuối), số lập, số tan; năm cuối:
   * số đường đang giữ, tổng hội viên, tổng kho; số cạnh kề của vùng (Q12: thương hội lớn hơn ở vùng nhiều cạnh kề).
   */
  guildsMin: number;
  guildsMax: number;
  guildsEnd: number;
  guildsFounded: number;
  guildsEnded: number;
  guildRoadsEnd: number;
  guildMembersEnd: number;
  guildMoneyEnd: number;
  edges: number;
  /**
   * Băng cướp (v0.6 S4): số lập, số tan; số người theo cướp đầu mỗi năm, cộng dồn riêng năm trong vòng 2 năm sau khi một
   * quận rơi vào đói kém và năm thường (Q12: cướp sau đói kém gấp ít nhất 1,5 lần năm thường); đông nhất một năm.
   */
  banditsFounded: number;
  banditsEnded: number;
  banditMembersMax: number;
  banditMembersAfterFamine: number;
  yearsAfterFamine: number;
  banditMembersNormal: number;
  yearsNormal: number;
  /**
   * Quan phủ (v0.6 S5): người theo cướp đầu mỗi năm dưới quan tham (độ tham ≥ 67) và quan thanh liêm (< 34), cộng dồn với
   * số năm; số trận tiễu phỉ, số thắng; lương phát chẩn (thăng); số sai dịch năm cuối; kho năm cuối.
   */
  banditMembersGreedy: number;
  yearsGreedy: number;
  banditMembersHonest: number;
  yearsHonest: number;
  campaigns: number;
  campaignWins: number;
  reliefGrain: number;
  officialsEnd: number;
  govMoneyEnd: number;
  /**
   * Người giữ quận (S5): số lần quận đổi người giữ; nhiều nhất bao nhiêu lần trong 10 năm ở một quận (Q12: ≤ 3); số năm
   * liền dài nhất một thế lực ngoài quan phủ giữ quá nửa số quận (Q12: ≤ 10); quận-năm không do quan phủ giữ (‰).
   */
  controlChanges: number;
  maxChangesPerDecade: number;
  longestNonGovMajorityYears: number;
  nonGovCountyYearsPermille: number;
  /**
   * Bản đồ thế lực theo năm (v0.6 S8, nghiệm thu mục 6): đầu mỗi năm (từ năm 1), số gia tộc, thương hội, băng cướp còn
   * sống; có quan phủ không (1/0); số đường thương hội giữ. Công cụ `world` đánh giá tiêu chí "sống", "có nguyên nhân".
   */
  yearly: { clans: number; guilds: number; bands: number; gov: number; guildRoads: number }[];
  /**
   * Số đo thế lực sau 50 năm (nghiệm thu v0.6 mục 6 đo 50 năm; lượt ngắn hơn thì lúc hết lượt): người giữ quận, gia tộc,
   * cướp theo đói kém và theo quan.
   */
  at50: FactionTally;
}

/** Phần số đo thế lực chụp lại ở năm 50 (`WorldRunStats.at50`). */
export type FactionTally = Pick<WorldRunStats, 'controlChanges' | 'maxChangesPerDecade' | 'longestNonGovMajorityYears' | 'clansFounded' | 'clansEnded' | 'leaderChangedCounties'
  | 'banditMembersAfterFamine' | 'yearsAfterFamine' | 'banditMembersNormal' | 'yearsNormal' | 'banditMembersGreedy' | 'yearsGreedy' | 'banditMembersHonest' | 'yearsHonest'>;
export const FACTION_MEASURE_YEARS = 50;
const tally = (s: WorldRunStats, leaderChanged: number): FactionTally => ({
  controlChanges: s.controlChanges, maxChangesPerDecade: s.maxChangesPerDecade, longestNonGovMajorityYears: s.longestNonGovMajorityYears, clansFounded: s.clansFounded,
  clansEnded: s.clansEnded, leaderChangedCounties: leaderChanged, banditMembersAfterFamine: s.banditMembersAfterFamine, yearsAfterFamine: s.yearsAfterFamine,
  banditMembersNormal: s.banditMembersNormal, yearsNormal: s.yearsNormal, banditMembersGreedy: s.banditMembersGreedy, yearsGreedy: s.yearsGreedy,
  banditMembersHonest: s.banditMembersHonest, yearsHonest: s.yearsHonest,
});

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
  seedFamilies(npcs, logic, streams.get('npc-world'), 0);
  const factions = newFactionWorld();
  const clanSeen = new Set<string>(), clanGone = new Set<string>();
  let lastFamine = Number.MIN_SAFE_INTEGER;
  let control = controlOf(factions, logic.counties.length), majorityRun = 0, nonGovCountyYears = 0;
  const changes = logic.counties.map((): number[] => []);
  const leaders = logic.counties.map(() => new Set<string>());
  foundGovernment(factions, logic, 0);
  const alive = () => npcs.people.filter((n) => n.death === null).length;
  const money = () => countyMoney(eco) + npcMoney(npcs) + factionMoney(factions);
  const stats: WorldRunStats = { years, counties: eco.counties.length, ticks: years * TICKS_PER_YEAR, npcStart: alive(), npcEnd: 0, moneyStart: money(), moneyEnd: 0, deaths: {}, deathAgeSum: 0, starvationNormalYears: 0, minQuotaPct: Number.MAX_SAFE_INTEGER, maxQuotaPct: 0, childrenPermille: 0, yearsWithPhysician: 0, yearsWithMerchant: 0, maxPhysiciansPerCounty: 0, births: 0,
    birthsWithParents: 0, marriedPermille: 0, mothersOver45: 0, childrenOfMothersOver45: 0, wivesOver45: 0, childrenOfWivesOver45: 0,
    famines: 0, lowMoneyMonthsPermille: 0, minPricePct: Number.MAX_SAFE_INTEGER, maxPricePct: 0, minGrain: Number.MAX_SAFE_INTEGER, ledgerBreaks: 0,
    npcMoneyPermilleMax: 0, npcMoneyPermilleEnd: 0, factionMoneyMax: 0, factionMoneyEnd: 0, factionGrainEnd: 0, clansMin: Number.MAX_SAFE_INTEGER, clansMax: 0, clansEnd: 0, clansFounded: 0, clansEnded: 0, clansSplit: 0, leaderChangedCounties: 0, guildsMin: Number.MAX_SAFE_INTEGER, guildsMax: 0, guildsEnd: 0, guildsFounded: 0, guildsEnded: 0, guildRoadsEnd: 0, guildMembersEnd: 0, guildMoneyEnd: 0, edges: logic.adjacency.length, banditsFounded: 0, banditsEnded: 0, banditMembersMax: 0, banditMembersAfterFamine: 0, yearsAfterFamine: 0, banditMembersNormal: 0, yearsNormal: 0, banditMembersGreedy: 0, yearsGreedy: 0, banditMembersHonest: 0, yearsHonest: 0, campaigns: 0, campaignWins: 0, reliefGrain: 0, officialsEnd: 0, govMoneyEnd: 0, controlChanges: 0, maxChangesPerDecade: 0, longestNonGovMajorityYears: 0, nonGovCountyYearsPermille: 0, yearly: [], at50: null as unknown as FactionTally };
  const inFamine = eco.counties.map((ce) => supplyOf(ce) === 'famine');
  let lowMoneyMonths = 0, months = 0;
  const firstId = npcs.nextId;
  const quota = npcQuota(logic);
  let childSum = 0, measured = 0, marriedSum = 0;
  const lastHard = eco.counties.map(() => -HARD_WINDOW - 1);
  const dead: NpcState[] = [];
  for (let t = 0; t < stats.ticks; t++) {
    if (isYearStart(t)) worldYearStart(eco, streams.get('weather'), t);
    if (isMonthStart(t)) {
      economyMonth(eco, logic, t);
      eco.counties.forEach((ce, i) => {
        const s = supplyOf(ce);
        if (s === 'famine' && !inFamine[i]) { stats.famines++; lastFamine = t; }
        inFamine[i] = s === 'famine';
        if (ce.money * 10 < ce.mouths * MONEY_PER_MOUTH) lowMoneyMonths++;
        const pct = Math.trunc((ce.price * 100) / PRICE_BASE);
        stats.minPricePct = Math.min(stats.minPricePct, pct); stats.maxPricePct = Math.max(stats.maxPricePct, pct);
        stats.minGrain = Math.min(stats.minGrain, ce.grain);
        months++;
      });
    }
    eco.counties.forEach((ce, i) => { const s = supplyOf(ce); if (s === 'famine' || s === 'scarce') lastHard[i] = t; });
    // Pha Thế lực (v0.6): đầu quý, trước pha NPC — như đời người chơi
    const report = factionPhase(factions, eco, npcs, logic, t, streams.get('factions'));
    if (report) { stats.campaigns += report.campaigns; stats.campaignWins += report.wins; stats.reliefGrain += report.reliefGrain; }
    if (isQuarterStart(t)) {
      const now = controlOf(factions, logic.counties.length);
      now.forEach((id, c) => {
        if (id === control[c]) return;
        stats.controlChanges++;
        changes[c]!.push(t);
        while (changes[c]!.length > 0 && changes[c]![0]! <= t - 10 * TICKS_PER_YEAR) changes[c]!.shift();
        stats.maxChangesPerDecade = Math.max(stats.maxChangesPerDecade, changes[c]!.length);
      });
      control = now;
      for (const f of factions.list) {
        if (f.kind === 'bandits') {
          if (!clanSeen.has(f.id)) { clanSeen.add(f.id); stats.banditsFounded++; }
          if (f.ended !== null && !clanGone.has(f.id)) { clanGone.add(f.id); stats.banditsEnded++; }
        }
        if (f.kind === 'guild') {
          if (!clanSeen.has(f.id)) { clanSeen.add(f.id); stats.guildsFounded++; }
          if (f.ended !== null && !clanGone.has(f.id)) { clanGone.add(f.id); stats.guildsEnded++; }
        }
        if (f.kind !== 'clan') continue;
        if (!clanSeen.has(f.id)) {
          clanSeen.add(f.id);
          if (f.founded >= TICKS_PER_YEAR) stats.clansFounded++;
          if (f.relations.length > 0) stats.clansSplit++;
          // Chi tách ra mang sẵn thái độ với họ gốc lúc lập; họ lập mới thì chưa có
        }
        if (f.ended !== null && !clanGone.has(f.id)) { clanGone.add(f.id); stats.clansEnded++; }
      }
      for (const f of factions.list) if (f.kind === 'clan' && f.ended === null) for (const c of f.counties) leaders[c]!.add(f.id);
    }
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
      const ids = new Set(living.map((n) => n.id));
      const adults = living.filter((n) => { const a = ageYearsAt(n.character.birthTick, t); return a >= 25 && a <= 50; });
      marriedSum += Math.floor((1000 * adults.filter((n) => n.character.kin.spouse !== null && ids.has(n.character.kin.spouse)).length) / Math.max(1, adults.length));
      measured++;
      if (living.some((n) => n.occupation === 'physician')) stats.yearsWithPhysician++;
      quota.forEach((_, county) => { stats.maxPhysiciansPerCounty = Math.max(stats.maxPhysiciansPerCounty, living.filter((n) => n.occupation === 'physician' && n.character.location === county).length); });
      if (living.some((n) => n.occupation === 'merchant')) stats.yearsWithMerchant++;
      stats.npcMoneyPermilleEnd = Math.floor((1000 * npcMoney(npcs)) / Math.max(1, money()));
      stats.npcMoneyPermilleMax = Math.max(stats.npcMoneyPermilleMax, stats.npcMoneyPermilleEnd);
      const clans = factions.list.filter((f) => f.kind === 'clan' && f.ended === null).length;
      // Mười năm đầu là lúc dòng họ của dân số ban đầu mới thành (năm 0 hầu như chưa dòng nào đủ người): không tính thấp nhất
      if (t >= 10 * TICKS_PER_YEAR) stats.clansMin = Math.min(stats.clansMin, clans); stats.clansMax = Math.max(stats.clansMax, clans); stats.clansEnd = clans;
      const guilds = factions.list.filter((f) => f.kind === 'guild' && f.ended === null);
      const bandits = factions.list.reduce((s, f) => s + (f.kind === 'bandits' && f.ended === null ? f.members.length : 0), 0);
      stats.banditMembersMax = Math.max(stats.banditMembersMax, bandits);
      if (t - lastFamine <= 2 * TICKS_PER_YEAR) { stats.banditMembersAfterFamine += bandits; stats.yearsAfterFamine++; }
      else { stats.banditMembersNormal += bandits; stats.yearsNormal++; }
      const gov = factions.list.find((f) => f.kind === 'government' && f.ended === null);
      if (gov && gov.greed >= GREEDY_FROM) { stats.banditMembersGreedy += bandits; stats.yearsGreedy++; }
      if (gov && gov.greed < HONEST_BELOW) { stats.banditMembersHonest += bandits; stats.yearsHonest++; }
      stats.officialsEnd = gov?.members.length ?? 0;
      stats.govMoneyEnd = gov?.money ?? 0;
      // Thế lực ngoài quan phủ giữ quá nửa số quận: chuỗi năm liền
      const majority = factions.list.some((f) => f.kind !== 'government' && f.ended === null && 2 * f.holds.length > logic.counties.length);
      majorityRun = majority ? majorityRun + 1 : 0;
      stats.longestNonGovMajorityYears = Math.max(stats.longestNonGovMajorityYears, majorityRun);
      nonGovCountyYears += control.filter((id) => id !== gov?.id).length;
      if (t >= 10 * TICKS_PER_YEAR) stats.guildsMin = Math.min(stats.guildsMin, guilds.length);
      stats.guildsMax = Math.max(stats.guildsMax, guilds.length); stats.guildsEnd = guilds.length;
      stats.guildRoadsEnd = guilds.reduce((s, f) => s + f.roads.length, 0);
      stats.guildMembersEnd = guilds.reduce((s, f) => s + f.members.length, 0);
      stats.guildMoneyEnd = guilds.reduce((s, f) => s + f.money, 0);
      stats.factionMoneyEnd = factionMoney(factions);
      stats.factionMoneyMax = Math.max(stats.factionMoneyMax, stats.factionMoneyEnd);
      stats.factionGrainEnd = factions.list.reduce((s, f) => s + f.grain, 0);
      stats.yearly.push({ clans, guilds: guilds.length, bands: factions.list.filter((f) => f.kind === 'bandits' && f.ended === null).length, gov: gov ? 1 : 0, guildRoads: stats.guildRoadsEnd });
      if (t === FACTION_MEASURE_YEARS * TICKS_PER_YEAR) stats.at50 = tally(stats, leaders.filter((l) => l.size >= 2).length);
    }
  }
  stats.childrenPermille = Math.floor(childSum / Math.max(1, measured));
  stats.marriedPermille = Math.floor(marriedSum / Math.max(1, measured));
  stats.births = npcs.nextId - firstId;
  // Mọi người từng sống trong lượt: người đã mất (kể cả đã dọn) và người còn sống
  const everyone = [...dead, ...npcs.people.filter((n) => n.death === null)];
  const born = everyone.filter((n) => Number(n.id.slice(1)) >= firstId);
  stats.birthsWithParents = born.filter((n) => n.character.kin.mother !== null).length;
  const kids = new Map<string, number>();
  for (const n of everyone) if (n.character.kin.mother !== null) kids.set(n.character.kin.mother, (kids.get(n.character.kin.mother) ?? 0) + 1);
  for (const w of born) {
    if (w.character.gender !== 'female' || ageYearsAt(w.character.birthTick, w.death?.tick ?? stats.ticks) < 45) continue;
    stats.mothersOver45++;
    stats.childrenOfMothersOver45 += kids.get(w.id) ?? 0;
    if (w.character.kin.spouse !== null) { stats.wivesOver45++; stats.childrenOfWivesOver45 += kids.get(w.id) ?? 0; }
  }
  stats.lowMoneyMonthsPermille = Math.trunc((lowMoneyMonths * 1000) / Math.max(1, months));
  for (const n of dead) {
    stats.deaths[n.death!.cause] = (stats.deaths[n.death!.cause] ?? 0) + 1;
    stats.deathAgeSum += ageYearsAt(n.character.birthTick, n.death!.tick);
  }
  stats.npcEnd = alive();
  stats.leaderChangedCounties = leaders.filter((l) => l.size >= 2).length;
  stats.at50 ??= tally(stats, stats.leaderChangedCounties);
  stats.nonGovCountyYearsPermille = Math.floor((1000 * nonGovCountyYears) / Math.max(1, (years - 1) * logic.counties.length));
  stats.moneyEnd = money();
  return stats;
}
