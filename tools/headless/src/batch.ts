import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ageYearsAt, calendarOf, type Birthplace, type CultivationPath, type Realm, type RegionId, type RootBand } from '@tsvl/shared';
import { BACKGROUNDS, CAREER_EVENT_IDS, CAREER_EVENTS_OF, CULTIVATION_EVENT_IDS, EVENT_IDS, Life, mountainCounty, rootBand } from '@tsvl/sim';
import type { RegionLogic } from '@tsvl/worldgen';
import { POLICIES, policyChoose, policyGoods, policyPlan, policyTrade, type PolicyContext, type PolicyName } from './policies';
import { isPath, PATHS, pathChoose, pathPlan, type PathName } from './paths';
import { isSeeker, SEEKERS, seekerChoose, seekerPlan, type SeekerName } from './seekers';

/** Chiến lược batch: sáu người chơi máy v0.6, người chơi máy theo nghề (v0.7 S9, `--policy paths`), tìm đạo (v0.8 S7, `--policy seekers`). */
export type Strategy = PolicyName | PathName | SeekerName;

export interface BatchRegion { seed: string; regionId: RegionId; birthplaces: Birthplace[]; logic: RegionLogic | null }
/**
 * Tiêu chí batch v0.3 (mục 6, Q3; chủ dự án duyệt 2026-10-27). Từ S7 ra riêng có thật nên "lười" chết đói sớm: tiêu chí
 * 40–80 tuổi chỉ còn áp cho "điều độ"; chiến lược khác so với "điều độ".
 */
export const IN_RANGE_MIN_PCT = 80;
export const BALANCED_STARVATION_MAX_PCT = 5;
export const LAZY_STARVATION_MIN_PCT = 40;
export const LAZY_SHORTER_YEARS = 10;
export const BACKGROUND_GAP_YEARS = 5;
export const EVENTS_PER_YEAR = [2, 4] as const;
/**
 * Tương đương LOD phía người chơi (nghiệm thu v0.4 mục 6): tuổi trung bình lúc mất của NPC khi người chơi "lang bạt"
 * (đổi quận, kéo NPC qua lại giữa L0 và L1) so với "điều độ" lệch ≤ 1 năm. Đo NPC mất khi người chơi 16–45 tuổi, để hai
 * chiến lược có cùng cửa sổ thời gian.
 */
export const NPC_AGE_GAP_MAX_YEARS = 1;
export const NPC_WINDOW_YEARS = [16, 45] as const;
/** Giá gốc một thăng (văn), để quy lương ra tiền khi so của cải (như phần chia lúc lập thân, ADR 0013). */
const GRAIN_BASE_COIN = 4;
/** Sự kiện hiếm, được phép không xảy ra trong một lượt batch (ghi chú trong ADR 0014). */
/**
 * Quan hệ tác động tới kết cục (nghiệm thu v0.5 mục 6, Q13): trong các đời `family` sống tới 30 tuổi, ít nhất chừng ấy %
 * đã cưới trước 30; trong số đó, ít nhất chừng ấy % có con; `family` chết đói không quá ngưỡng của điều độ. Chủ dự án
 * bỏ tiêu chí "bần cùng chết đói ít hơn điều độ 25%" (S8): hơn nửa số chết đói ở tuổi thơ (hộ trừu tượng, Q2), còn nuôi
 * con tốn lương bù trừ phần người thân giúp lúc về già.
 */
// v0.8 S7 (chủ dự án duyệt 2026-10-30, ADR 0023): 70 → 65 — linh căn 15% nên nhiều thanh niên NPC đỗ kỳ tuyển rời vùng,
// ít người để cưới hơn (cùng code mà linh căn 5% thì 71,9%, 15% thì 69,1–69,4%)
export const FAMILY_MARRIED_BY_30_PCT = 65;
export const FAMILY_WITH_CHILDREN_PCT = 60;
export const RARE_EVENTS: readonly string[] = [
  // v0.5 S7–S8: cần kẻ thù, món nợ ơn hay người quen thân ngoài người thân — chưa chiến lược nào tạo ra (`family` chỉ thăm
  // người hợp đôi). Đường đi của từng sự kiện có test riêng (events.test.ts). Con ốm, vợ chồng lục đục: `family` gặp.
  'event.debt_called', 'event.enemy_revenge', 'event.friend_brings_rice', 'event.friend_in_need',
  // v0.7 S8: sự kiện theo nghề chỉ đến với người làm nghề; người chơi máy chưa theo nghề nào (batch theo nghề ở S9)
  ...CAREER_EVENT_IDS,
  // v0.8 S1: chuyện tu tiên đến với người tìm cơ duyên; người chơi máy tìm đạo ở S7 (tu sĩ ghé qua vẫn có thể đến người thường)
  ...CULTIVATION_EVENT_IDS,
  // v0.8 S3: bị cướp bắt theo — chỉ người chơi máy lang bạt gặp, 3–6 lần mỗi 1.000 đời ở v0.7–S2; trẻ NPC rời vùng (S3) đổi
  // RNG thì ra 0. Đường đi có test riêng (events.test.ts); người chơi máy theo cướp ở batch nghề
  'event.bandit_seize',
];

export interface BackgroundReport { count: number; meanAge: number; starvationPct: number }
export interface PolicyReport {
  /** Theo nghề (S9). */
  path?: PathStats;
  /** Đường tu (v0.8 S7), mọi chiến lược. */
  cult: CultStats;
  /** Tìm đạo (S7): báo cáo riêng các đời đã vào đường tu, để so với người điều độ. */
  onPath?: PolicyReport; estateMedian: number; inheritedPct: number; inheritedMedian: number; npcDeaths: number; npcMeanAge: number; policy: Strategy; count: number; stuck: number; overCap: number; meanAge: number; medianAge: number; inRangePct: number; oldAgePct: number; starvationPct: number; causes: Record<string, number>; skills: Record<string, number>; byBackground: Record<string, BackgroundReport>; events: Record<string, number>; eventYears: number; ticks: number; ms: number; starved: (StarvedInfo & { background: string })[]; reached30: number; marriedBy30: number; withChildren: number; roadWeeks: [number, number]; robbed: [number, number] }

/** Kết quả một đời trong batch: đủ để gộp thành báo cáo, gửi được qua luồng (structured clone). */
export interface LifeResult {
  stuck: boolean;
  overCap: boolean;
  age: number;
  cause: string;
  background: string;
  skills: Record<string, number>;
  /** Sự kiện đã gặp, theo thứ tự gặp lần đầu (để báo cáo song song in giống hệt chạy tuần tự). */
  events: Record<string, number>;
  ticks: number;
  /** NPC mất trong cửa sổ đo (`NPC_WINDOW_YEARS` tuổi người chơi): số người, tổng tuổi lúc mất. */
  npcDeaths: number;
  npcDeathAgeSum: number;
  /** Của cải lúc chết (văn, gồm lương quy theo giá gốc 4 văn/thăng) và tiền, lương được thừa kế trong đời (v0.5 S3). */
  estate: number;
  inherited: number;
  /** Đời chết đói (v0.5 S8): hoàn cảnh lúc chết, để tìm nguyên nhân. */
  starved?: StarvedInfo;
  /** Gia đình (v0.5 S8): tuổi lúc cưới lần đầu (null: chưa cưới), số con chào đời. */
  marriedAge: number | null;
  children: number;
  /**
   * Đường (v0.6 S8, nghiệm thu mục 6): tuần đi đường và số lần gặp cướp đường, tách đường băng cướp giữ [đường khác,
   * đường cướp giữ] — người chơi máy "lang bạt" phải gặp cướp trên đường cướp giữ nhiều hơn.
   */
  roadWeeks: [number, number];
  robbed: [number, number];
  /** Người chơi máy theo nghề (S9): tuổi vào nghề (null: chưa vào), nghề lúc chết, số năm làm nghề ấy cả đời. */
  path?: { entered: number | null; atDeath: string | null; years: number };
  /** Đường tu (v0.8 S7): xem `CultResult`. */
  cult: CultResult;
}
/**
 * Đường tu một đời (v0.8 S7): dải linh căn thật (đo, không phải thứ người chơi máy thấy), dải đã biết, đường vào, cảnh giới
 * lúc chết, tuổi vào tầng 1, các lần đột phá; chết sớm vì hậu quả đột phá: chết vì thương kinh mạch, chết trong một năm
 * sau một lần đột phá hỏng, hay chết già sau một lần hỏng nặng (thọ đã bị cắt ba năm).
 */
export interface CultResult {
  band: RootBand; known: RootBand | null; path: CultivationPath | null; realm: Realm; qi1Age: number | null;
  attempts: number; firstFailed: boolean | null; severe: boolean; fatal: boolean;
}
export interface StarvedInfo {
  age: number; independent: boolean; town: boolean; away: boolean; landMu: number; tenure: string; money: number; hungerYears: number;
  famine: boolean; badHarvests: number; taxShort: number; inherited: boolean; kinHelp: number; lastEvents: string[];
}

/** Bộ nhớ đệm đích đi được theo vùng/quận: thuần, mỗi luồng giữ một cái. */
export type TravelCache = Map<string, ReturnType<Life['travel']>>;

/** Chạy đời thứ `i` của một chiến lược: thuần, tất định theo (vùng, i). */
export function runLife(regions: readonly BatchRegion[], policy: Strategy, i: number, optionsCache: TravelCache = new Map()): LifeResult {
  const path = isPath(policy) ? policy : null;
  const seeker = isSeeker(policy) ? policy : null;
  // Chiến lược theo nghề, tìm đạo mua bán lương, bán hàng như người điều độ
  const trader: PolicyName = path || seeker ? 'balanced' : (policy as PolicyName);
  let entered: number | null = null;
  const r = regions[i % regions.length]!, logic = r.logic!;
  const bp = r.birthplaces[Math.floor(i / regions.length) % r.birthplaces.length]!;
  const life = Life.create({ worldSeed: r.seed, regionId: r.regionId, birthplaceId: bp.id, lifeSeed: i }, bp, logic);
  const end = life.tick + 200 * 36;
  const events: Record<string, number> = {};
  let ticks = 0;
  const roadWeeks: [number, number] = [0, 0], robbed: [number, number] = [0, 0];
  // NPC mất: đọc trước mỗi đầu năm (người mất được giữ một năm rồi dọn) và lúc hết đời; đếm mỗi người một lần
  const from = life.character.birthTick + NPC_WINDOW_YEARS[0] * 36, to = life.character.birthTick + NPC_WINDOW_YEARS[1] * 36;
  const seen = new Set<string>();
  let npcDeaths = 0, npcDeathAgeSum = 0;
  const countDeaths = () => {
    for (const d of life.npcDeaths()) if (d.tick >= from && d.tick < to && !seen.has(d.id)) { seen.add(d.id); npcDeaths++; npcDeathAgeSum += d.ageYears; }
  };
  while (life.alive && life.tick < end) {
    if (life.tick % 36 === 35 && life.tick >= from && life.tick < to + 36) countDeaths();
    const key = `${r.seed}/${life.character.location}`;
    if (!optionsCache.has(key)) optionsCache.set(key, policy === 'wanderer' || policy === 'scholar' || path || seeker ? life.travel() : []);
    const ctx = (): PolicyContext => ({
      character: life.view(), date: calendarOf(life.tick), actions: life.actions(), travel: optionsCache.get(key)!, settlements: logic.settlementKind, seed: i, active: !!life.active, market: life.market(),
      // Xã giao (v0.5 S8): chỉ chiến lược `family`, ở tuần thứ hai, thứ ba của tháng — tuần chạy ô xã giao (kế hoạch xếp
      // lại mỗi tuần)
      ...(policy === 'family' && life.tick % 3 !== 0 ? { people: () => life.people() } : {}),
      // Theo nghề (S9): người trong quận (tìm thầy), thế lực (trị sở), quận núi rừng
      ...(path ? { people: () => life.people(), factions: () => life.factions(), mountain: logic.counties.map((_, k) => mountainCounty(logic, k)) } : {}),
      // Tìm đạo (v0.8 S7): trị sở tông môn (kỳ tuyển), quận núi (tìm cơ duyên)
      ...(seeker ? { factions: () => life.factions(), mountain: logic.counties.map((_, k) => mountainCounty(logic, k)) } : {}),
    });
    const now = ctx();
    // Đầu tháng: mua bán lương thực (không tốn ô) rồi mới xếp kế hoạch, để kế hoạch thấy kho mới
    if (life.tick % 3 === 0 && now.character.canAct) {
      // Bán hàng trong túi trước (v0.7 S3b), để tiền bán hàng vào phần mua lương
      const sold = policyGoods(trader, now).filter((x) => life.tradeGoods(x.good, x.qty) === null).length;
      if (sold) Object.assign(now, ctx());
      const g = policyTrade(trader, now); if (g !== 0 && life.trade(g) === null) Object.assign(now, ctx());
    }
    if (path && entered === null && now.character.career?.id === path) entered = now.character.ageYears;
    const plan = path ? pathPlan(path, now) : seeker ? seekerPlan(seeker, now) : policyPlan(policy as PolicyName, now);
    if (plan) life.setPlan(plan);
    // Tuần đi đường: đường đang đi có băng cướp giữ không (đích đi từ quận đang đứng, như lúc xem trước chuyến đi)
    const trip = now.active ? life.active : null;
    const road: -1 | 0 | 1 = trip?.slot.action === 'action.travel' ? (life.travel().find((o) => o.county === trip.slot.target)?.danger ? 1 : 0) : -1;
    if (road !== -1) roadWeeks[road]++;
    life.advance('week'); ticks++;
    const pending = life.pendingEvent();
    if (pending) {
      events[pending.eventId] = (events[pending.eventId] ?? 0) + 1;
      if (pending.eventId === 'event.highway_robbers' && road !== -1) robbed[road]++;
      const refused = life.choose(pending.instance, path ? pathChoose(path, pending, ctx()) : seeker ? seekerChoose(pending, ctx()) : policyChoose(policy as PolicyName, pending, ctx()));
      if (refused) throw new Error(`${policy}: ${refused}`);
    }
  }
  countDeaths();
  const c = life.character;
  // Thừa kế đã nhận (S3 v0.5): tin đã báo, cộng phần còn chờ báo nếu người chơi chết trước tuần người kia mất;
  // quy lương (thăng) ra văn theo giá gốc như phần chia lúc lập thân
  const pending = life.alive ? [] : life.snapshot().bequests;
  const inherited = life.log.reduce((s, e) => s + (e.key === 'log.kin.inherit' ? Number(e.params.money) + Number(e.params.grain) * GRAIN_BASE_COIN : 0), 0)
    + pending.reduce((s, x) => s + x.money + x.grain * GRAIN_BASE_COIN, 0);
  const estate = c.household.money + c.household.grain * GRAIN_BASE_COIN;
  const wed = life.log.find((e) => e.key.startsWith('log.marry.wed'));
  const family = { marriedAge: wed ? ageYearsAt(c.birthTick, wed.tick) : null, children: life.log.filter((e) => e.key === 'log.kin.birth').length };
  // Nghề (S9): nghề lúc chết, số năm làm nghề của chiến lược cả đời (các lần làm cộng lại)
  const snap = path ? life.snapshot() : null;
  const careerInfo = snap ? { path: { entered, atDeath: snap.career?.id ?? null, years: snap.careers.filter((r) => r.id === path).reduce((s, r) => s + r.years, 0) + (snap.career?.id === path ? snap.career.years : 0) } } : {};
  const cult = cultResult(life);
  if (life.alive) return { stuck: true, overCap: false, age: 0, cause: '', background: c.background, skills: {}, events, ticks, npcDeaths, npcDeathAgeSum, estate, inherited, ...family, roadWeeks, robbed, ...careerInfo, cult };
  return {
    stuck: false, overCap: life.death!.tick - c.birthTick > c.lifespanBase + c.lifespanBonus, age: ageYearsAt(c.birthTick, life.death!.tick), cause: life.death!.cause,
    background: c.background, skills: { ...c.skillXp }, events, ticks, npcDeaths, npcDeathAgeSum, estate, inherited, ...family, roadWeeks, robbed, ...careerInfo, cult,
    ...(life.death!.cause === 'starvation' ? { starved: starvedInfo(life, logic, inherited > 0) } : {}),
  };
}

/** Chết trong chừng này tick sau một lần đột phá hỏng thì tính là chết vì hậu quả đột phá. */
export const BREAKTHROUGH_FATAL_TICKS = 36;
function cultResult(life: Life): CultResult {
  const c = life.character, v = life.view().cultivation;
  const tries = life.log.filter((e) => e.key.startsWith('log.breakthrough.'));
  const ok = tries.find((e) => e.key === 'log.breakthrough.ok');
  const d = life.death;
  const lastFail = tries.filter((e) => e.key !== 'log.breakthrough.ok').at(-1);
  const severe = tries.some((e) => e.key === 'log.breakthrough.severe');
  return {
    band: rootBand(c.spiritRoot), known: v.root, path: v.path, realm: v.realm, qi1Age: ok ? ageYearsAt(c.birthTick, ok.tick) : null,
    attempts: tries.length, firstFailed: tries.length ? tries[0]!.key !== 'log.breakthrough.ok' : null, severe,
    fatal: !!d && (d.detail === 'illness.meridian' || (!!lastFail && d.tick - lastFail.tick < BREAKTHROUGH_FATAL_TICKS) || (severe && d.cause === 'old_age')),
  };
}

/** Đời sống tới 30 tuổi; trong đó, đời đã cưới trước 30; trong đó nữa, đời có con. */
function familyStats(results: readonly LifeResult[]): { reached30: number; marriedBy30: number; withChildren: number } {
  const grown = results.filter((x) => !x.stuck && x.age >= 30);
  const wed = grown.filter((x) => x.marriedAge !== null && x.marriedAge < 30);
  return { reached30: grown.length, marriedBy30: wed.length, withChildren: wed.filter((x) => x.children > 0).length };
}

/** Hoàn cảnh một đời chết đói: nơi ở, ruộng, tiền, năm đói kém, mấy năm cuối có gì (v0.5 S8). */
function starvedInfo(life: Life, logic: RegionLogic, inherited: boolean): StarvedInfo {
  const c = life.character, h = c.household, t = life.death!.tick;
  const recent = life.log.filter((e) => e.tick >= t - 3 * 36);
  const count = (key: string) => recent.filter((e) => e.key === key).length;
  return {
    age: ageYearsAt(c.birthTick, t), independent: h.independent, town: logic.settlementKind[c.location] !== 'village', away: c.location !== c.home,
    landMu: h.landMu, tenure: h.tenure, money: h.money, hungerYears: h.hungerYears, famine: life.market().supply === 'famine',
    badHarvests: count('log.world.harvest_bad'), taxShort: count('log.tax.short'), inherited, kinHelp: count('log.kin.help'),
    lastEvents: recent.filter((e) => e.key.startsWith('event.')).map((e) => e.key.replace(/\.result\..*/, '')).slice(-4),
  };
}

/** Chạy n đời của một chiến lược; trả kết quả theo thứ tự đời. `pool` (song song) phải trả đúng kết quả của `runLife`. */
export type LifeRunner = (policy: Strategy, n: number) => Promise<LifeResult[]>;

/** Chạy tuần tự trên luồng chính (`--threads 1`, và test). */
export const sequentialRunner = (regions: readonly BatchRegion[]): LifeRunner => async (policy, n) => {
  const cache: TravelCache = new Map();
  return Array.from({ length: n }, (_, i) => runLife(regions, policy, i, cache));
};

/** Gộp kết quả theo đúng thứ tự đời: song song hay tuần tự đều ra cùng một báo cáo. */
export function aggregate(policy: Strategy, results: readonly LifeResult[], ms: number): PolicyReport {
  const n = results.length;
  const ages: number[] = [], causes: Record<string, number> = {}, skills: Record<string, number> = {};
  const byBg: Record<string, { ages: number[]; starved: number }> = {};
  const events: Record<string, number> = {};
  let eventYears = 0, stuck = 0, overCap = 0, ticks = 0, npcDeaths = 0, npcAgeSum = 0;
  const estates = results.map((x) => x.estate).sort((a, b) => a - b), heirs = results.filter((x) => x.inherited > 0).map((x) => x.inherited).sort((a, b) => a - b);
  for (const x of results) {
    ticks += x.ticks; npcDeaths += x.npcDeaths; npcAgeSum += x.npcDeathAgeSum;
    for (const [id, k] of Object.entries(x.events)) events[id] = (events[id] ?? 0) + k;
    if (x.stuck) { stuck++; continue; }
    if (x.overCap) overCap++;
    ages.push(x.age); causes[x.cause] = (causes[x.cause] ?? 0) + 1;
    const bg = (byBg[x.background] ??= { ages: [], starved: 0 });
    bg.ages.push(x.age); if (x.cause === 'starvation') bg.starved++;
    eventYears += Math.max(0, x.age - 12);
    for (const [skill, xp] of Object.entries(x.skills)) skills[skill] = (skills[skill] ?? 0) + xp;
  }
  ages.sort((a, b) => a - b);
  for (const key of Object.keys(skills)) skills[key] = Math.round(skills[key]! / n);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const byBackground: Record<string, BackgroundReport> = {};
  for (const key of BACKGROUNDS) { const b = byBg[key]; if (b) byBackground[key] = { count: b.ages.length, meanAge: avg(b.ages), starvationPct: 100 * b.starved / b.ages.length }; }
  return { estateMedian: estates[Math.floor(estates.length / 2)] ?? 0, inheritedPct: (100 * heirs.length) / Math.max(1, n), inheritedMedian: heirs[Math.floor(heirs.length / 2)] ?? 0,
    starved: results.flatMap((x) => (x.starved ? [{ ...x.starved, background: x.background }] : [])),
    ...familyStats(results),
    roadWeeks: [0, 1].map((k) => results.reduce((s, x) => s + x.roadWeeks[k]!, 0)) as [number, number],
    robbed: [0, 1].map((k) => results.reduce((s, x) => s + x.robbed[k]!, 0)) as [number, number],
    ...(isPath(policy) ? { path: pathStats(policy, results, events) } : {}),
    cult: cultStats(results),
    npcDeaths, npcMeanAge: npcAgeSum / Math.max(1, npcDeaths), policy, count: n, stuck, overCap, meanAge: avg(ages), medianAge: ages[Math.floor(ages.length / 2)] ?? 0, inRangePct: 100 * ages.filter((a) => a >= 40 && a <= 80).length / n, oldAgePct: 100 * (causes.old_age ?? 0) / n, starvationPct: 100 * (causes.starvation ?? 0) / n, causes, skills, byBackground, events, eventYears, ticks, ms };
}

export async function runPolicyBatch(regions: BatchRegion[], n: number, selection: string, out?: string, runner: LifeRunner = sequentialRunner(regions)): Promise<PolicyReport[]> {
  const paths = selection === 'paths' || isPath(selection);
  const seekers = selection === 'seekers' || isSeeker(selection);
  // Tìm đạo (v0.8 S7): chạy kèm người điều độ để so (mặt khác biệt, đời không linh căn, thọ người tầng 1)
  const policies: readonly Strategy[] = selection === 'all' ? POLICIES : selection === 'paths' ? PATHS : selection === 'seekers' ? ['balanced', ...SEEKERS] : [...POLICIES, ...PATHS, ...SEEKERS].filter((p) => p === selection);
  if (!policies.length) throw new Error(`--policy phải là ${POLICIES.join('|')}|all|paths|${PATHS.join('|')}|seekers|${SEEKERS.join('|')}`);
  const reports: PolicyReport[] = [];
  for (const policy of policies) {
    const started = performance.now();
    const results = await runner(policy, n);
    const report = aggregate(policy, results, 0);
    report.ms = performance.now() - started;
    if (isSeeker(policy)) report.onPath = aggregate(policy, results.filter((x) => x.cult.path !== null), 0);
    reports.push(report);
    console.log(`${policy}: ${n} đời · kẹt ${report.stuck} · vượt trần ${report.overCap} · trung bình ${report.meanAge.toFixed(2)} · trung vị ${report.medianAge} · 40–80 ${report.inRangePct.toFixed(1)}% · chết già ${report.oldAgePct.toFixed(1)}% · ${report.ms.toFixed(0)} ms`);
    console.log(`  Nguyên nhân: ${JSON.stringify(report.causes)} · kỹ năng trung bình: ${JSON.stringify(report.skills)}`);
    const bgs = report.byBackground;
    console.log(`  Xuất thân: ${BACKGROUNDS.filter((b) => bgs[b]).map((b) => `${b} ${bgs[b]!.count} đời · ${bgs[b]!.meanAge.toFixed(1)} tuổi · đói ${bgs[b]!.starvationPct.toFixed(0)}%`).join(' | ')}`);
    console.log(`  Của cải lúc chết (trung vị): ${report.estateMedian} văn · được thừa kế: ${report.inheritedPct.toFixed(1)}% đời, trung vị ${report.inheritedMedian} văn`);
    console.log(`  NPC mất khi người chơi ${NPC_WINDOW_YEARS.join('–')} tuổi: ${report.npcDeaths} người · tuổi trung bình lúc mất ${report.npcMeanAge.toFixed(2)}`);
    if (report.policy === 'family') console.log(`  Gia đình: cưới trước 30 tuổi ${pct(report.marriedBy30, report.reached30).toFixed(1)}% đời sống tới 30 (mục tiêu ≥ ${FAMILY_MARRIED_BY_30_PCT}) · có con ${pct(report.withChildren, report.marriedBy30).toFixed(1)}% (≥ ${FAMILY_WITH_CHILDREN_PCT})`);
    if (report.roadWeeks[0] + report.roadWeeks[1] > 0) console.log(`  Đường: ${roadLine(report)}`);
    console.log(`  Sự kiện: ${(Object.values(report.events).reduce((a, b) => a + b, 0) / Math.max(1, report.eventYears)).toFixed(2)}/năm sau 12 tuổi · ${Object.keys(report.events).length} loại`);
    const ps = report.path;
    if (report.cult.rooted || report.cult.known) console.log(`  Đường tu: ${cultLine(report)}`);
    if (ps) console.log(`  Nghề: vào nghề ${ps.enteredPct.toFixed(1)}% đời (tuổi vào trung bình ${ps.entryAge.toFixed(1)}) · trọn đời trong nghề ${ps.livedPct.toFixed(1)}% · còn trong nghề lúc chết ${ps.atDeathPct.toFixed(1)}% · làm nghề trung bình ${ps.years.toFixed(1)} năm · sự kiện riêng của nghề ${ps.ownEventPct.toFixed(1)}% · kỹ năng chính ${ps.mainSkill}`);
  }
  const failed = paths ? pathCriteria(reports, selection === 'paths') : seekers ? seekerCriteria(reports, selection === 'seekers') : batchCriteria(reports, selection === 'all');
  for (const f of failed) console.log(`  ✗ ${f}`);
  const pass = failed.length === 0;
  console.log(pass ? 'KẾT QUẢ: PASS' : 'KẾT QUẢ: FAIL (xem phân bố/cân bằng chiến lược)');
  if (out) writeFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), out), JSON.stringify({ pass, reports }, null, 2));
  if (!pass) process.exitCode = 1;
  return reports;
}

const pct = (k: number, n: number) => (100 * k) / Math.max(1, n);

/** Tuổi trung bình, của cải trung vị, số con trung bình của một nhóm đời (không kẹt). */
export interface GroupStats { count: number; meanAge: number; estateMedian: number; children: number }
function groupStats(xs: readonly LifeResult[]): GroupStats {
  const lived = xs.filter((x) => !x.stuck);
  const estates = lived.map((x) => x.estate).sort((a, b) => a - b);
  const n = Math.max(1, lived.length);
  return { count: lived.length, meanAge: lived.reduce((s, x) => s + x.age, 0) / n, estateMedian: estates[Math.floor(estates.length / 2)] ?? 0, children: lived.reduce((s, x) => s + x.children, 0) / n };
}
/**
 * Đường tu của một chiến lược (v0.8 S7, nghiệm thu mục 6): số đời có linh căn thật, đã biết dải, vào đường (tông môn, tán
 * tu), vào tầng 1 (theo đường), đột phá (lần đầu hỏng, chết vì hậu quả); nhóm đời vào tầng 1, nhóm không có linh căn, nhóm
 * đã vào đường tu.
 */
export interface CultStats {
  rooted: number; known: number; sect: number; rogue: number; qi1: number; qi1Rooted: number; qi1Sect: number; qi1Rogue: number; rootedSect: number; rootedRogue: number;
  attempted: number; firstFailed: number; fatal: number; qi1Group: GroupStats; noRoot: GroupStats; onPath: GroupStats; everyone: GroupStats;
  /** Đời vào tầng 1: [tuổi vào, tuổi lúc chết]; tuổi lúc chết mọi đời (tăng dần) — để so thọ người tầng 1 với người cùng tuổi. */
  qi1Ages: [number, number][]; ages: number[];
}
function cultStats(results: readonly LifeResult[]): CultStats {
  const rooted = results.filter((x) => x.cult.band !== 'none'), qi1 = results.filter((x) => x.cult.qi1Age !== null);
  const tried = results.filter((x) => x.cult.attempts > 0);
  return {
    rooted: rooted.length, known: results.filter((x) => x.cult.known !== null).length,
    sect: results.filter((x) => x.cult.path === 'sect').length, rogue: results.filter((x) => x.cult.path === 'rogue').length,
    rootedSect: rooted.filter((x) => x.cult.path === 'sect').length, rootedRogue: rooted.filter((x) => x.cult.path === 'rogue').length,
    qi1: qi1.length, qi1Rooted: rooted.filter((x) => x.cult.qi1Age !== null).length,
    qi1Sect: qi1.filter((x) => x.cult.path === 'sect').length, qi1Rogue: qi1.filter((x) => x.cult.path === 'rogue').length,
    attempted: tried.length, firstFailed: tried.filter((x) => x.cult.firstFailed).length, fatal: tried.filter((x) => x.cult.fatal).length,
    qi1Group: groupStats(qi1), noRoot: groupStats(results.filter((x) => x.cult.band === 'none')), onPath: groupStats(results.filter((x) => x.cult.path !== null)), everyone: groupStats(results),
    qi1Ages: qi1.filter((x) => !x.stuck).map((x) => [x.cult.qi1Age!, x.age]), ages: results.filter((x) => !x.stuck).map((x) => x.age).sort((a, b) => a - b),
  };
}
const cultLine = (r: PolicyReport) => {
  const k = r.cult;
  return `có linh căn ${k.rooted} · biết dải ${k.known} · vào đường tông môn ${k.sect}, tán tu ${k.rogue} · vào tầng 1 ${k.qi1} (tông môn ${k.qi1Sect}, tán tu ${k.qi1Rogue}; ${pct(k.qi1Rooted, k.rooted).toFixed(1)}% đời có linh căn) · đột phá ${k.attempted} đời, lần đầu hỏng ${pct(k.firstFailed, k.attempted).toFixed(1)}%, chết vì hậu quả ${k.fatal}`
    + (k.qi1 ? ` · tầng 1: ${k.qi1Group.meanAge.toFixed(1)} tuổi, của cải ${k.qi1Group.estateMedian} văn, ${k.qi1Group.children.toFixed(2)} con` : '')
    + ` · không linh căn: ${k.noRoot.meanAge.toFixed(1)} tuổi, của cải ${k.noRoot.estateMedian} văn`;
};

/** Số đo một nghề (S9): vào nghề, còn trong nghề lúc chết, số năm làm nghề, phần sự kiện riêng của nghề, kỹ năng chính. */
export interface PathStats { enteredPct: number; entryAge: number; atDeathPct: number; livedPct: number; years: number; ownEventPct: number; mainSkill: string }
/**
 * Một đời "trọn đời trong nghề": đã vào nghề, và số năm làm nghề (năm đủ ô) từ hai phần ba quãng từ lúc vào nghề tới lúc
 * chết trở lên. Không đòi còn nghề lúc chết: về già không làm nổi thì bỏ nghề (hai năm không làm), như mọi người.
 */
const livedIn = (x: LifeResult) => !x.stuck && x.path?.entered !== null && x.path?.entered !== undefined && 3 * x.path.years >= 2 * (x.age - x.path.entered);
function pathStats(path: PathName, results: readonly LifeResult[], events: Record<string, number>): PathStats {
  const n = Math.max(1, results.length);
  const entered = results.filter((x) => x.path?.entered !== null && x.path?.entered !== undefined);
  const own = CAREER_EVENTS_OF[path]!.reduce((s, id) => s + (events[id] ?? 0), 0);
  const total = Object.values(events).reduce((a, b) => a + b, 0);
  const skills: Record<string, number> = {};
  for (const x of results) for (const [k, v] of Object.entries(x.skills)) skills[k] = (skills[k] ?? 0) + v;
  const mainSkill = Object.entries(skills).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '-';
  return {
    enteredPct: (100 * entered.length) / n, entryAge: entered.reduce((s, x) => s + x.path!.entered!, 0) / Math.max(1, entered.length),
    atDeathPct: (100 * results.filter((x) => !x.stuck && x.path?.atDeath === path).length) / n, livedPct: (100 * results.filter(livedIn).length) / n,
    years: results.reduce((s, x) => s + (x.path?.years ?? 0), 0) / n, ownEventPct: (100 * own) / Math.max(1, total), mainSkill,
  };
}

/**
 * "6+ con đường khác biệt rõ" (nghiệm thu v0.7 mục 6, Q2). Nghề "có người chơi máy sống trọn đời trong nghề": ít nhất nửa
 * số đời trọn đời trong nghề (`livedIn`), không kẹt. Giữa các nghề ấy: hai nghề bất kỳ khác nhau ở ít nhất hai trong năm
 * mặt; không nghề nào trội hẳn.
 */
export const PATH_LIVED_MIN_PCT = 50;
export const PATH_MIN_COUNT = 6;
export const PATH_AGE_GAP = 3;
export const PATH_CAUSE_GAP_PCT = 10;
export const PATH_ESTATE_RATIO_X10 = 15;
export const PATH_OWN_EVENT_PCT = 30;
/** Nguyên nhân chết chính của một nghề, và tỉ lệ (%) từng nguyên nhân. */
const causeShare = (r: PolicyReport) => { const n = Math.max(1, r.count - r.stuck); return Object.fromEntries(Object.entries(r.causes).map(([k, v]) => [k, (100 * v) / n])); };
const mainCause = (r: PolicyReport) => Object.entries(r.causes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '-';
/** Các mặt khác nhau giữa hai nghề (tên mặt). */
export function pathFacets(a: PolicyReport, b: PolicyReport): string[] {
  const out: string[] = [];
  if (Math.abs(a.meanAge - b.meanAge) >= PATH_AGE_GAP) out.push('tuổi thọ');
  const ca = causeShare(a), cb = causeShare(b);
  if (mainCause(a) !== mainCause(b) || [...new Set([...Object.keys(ca), ...Object.keys(cb)])].some((k) => Math.abs((ca[k] ?? 0) - (cb[k] ?? 0)) >= PATH_CAUSE_GAP_PCT)) out.push('nguyên nhân chết');
  const lo = Math.max(1, Math.min(a.estateMedian, b.estateMedian)), hi = Math.max(a.estateMedian, b.estateMedian);
  if (hi * 10 >= lo * PATH_ESTATE_RATIO_X10) out.push('của cải');
  if (a.path!.mainSkill !== b.path!.mainSkill) out.push('kỹ năng chính');
  if (a.path!.ownEventPct >= PATH_OWN_EVENT_PCT && b.path!.ownEventPct >= PATH_OWN_EVENT_PCT) out.push('sự kiện riêng');
  return out;
}
export function pathCriteria(reports: PolicyReport[], all: boolean): string[] {
  const failed: string[] = [];
  for (const r of reports) if (r.stuck || r.overCap) failed.push(`${r.policy}: kẹt ${r.stuck}, vượt trần ${r.overCap}`);
  if (!all) return failed;
  const lived = reports.filter((r) => r.path!.livedPct >= PATH_LIVED_MIN_PCT);
  console.log(`Nghề sống trọn đời trong nghề (≥ ${PATH_LIVED_MIN_PCT}% đời trọn đời trong nghề): ${lived.map((r) => r.policy).join(', ') || '—'} (${lived.length}; mục tiêu ≥ ${PATH_MIN_COUNT})`);
  if (lived.length < PATH_MIN_COUNT) failed.push(`chỉ ${lived.length} nghề sống trọn đời trong nghề < ${PATH_MIN_COUNT}`);
  for (let i = 0; i < lived.length; i++) for (let j = i + 1; j < lived.length; j++) {
    const f = pathFacets(lived[i]!, lived[j]!);
    if (f.length < 2) failed.push(`${lived[i]!.policy} – ${lived[j]!.policy}: chỉ khác ${f.length} mặt (${f.join(', ') || 'không'})`);
  }
  // Không nghề nào trội hẳn: vừa sống lâu nhất, vừa giàu nhất, vừa ít chết đói nhất
  if (lived.length) {
    const oldest = lived.reduce((a, b) => (b.meanAge > a.meanAge ? b : a)), richest = lived.reduce((a, b) => (b.estateMedian > a.estateMedian ? b : a)), fed = lived.reduce((a, b) => (b.starvationPct < a.starvationPct ? b : a));
    console.log(`Trội nhất: sống lâu ${oldest.policy} (${oldest.meanAge.toFixed(1)}), giàu ${richest.policy} (${richest.estateMedian} văn), ít chết đói ${fed.policy} (${fed.starvationPct.toFixed(1)}%)`);
    if (oldest === richest && richest === fed) failed.push(`${oldest.policy} trội hẳn: sống lâu nhất, giàu nhất, ít chết đói nhất`);
  }
  return failed;
}
/** Gặp cướp mỗi 1.000 tuần đi đường: [đường khác, đường cướp giữ]. */
const robRate = (r: PolicyReport) => [0, 1].map((k) => (1000 * r.robbed[k]!) / Math.max(1, r.roadWeeks[k]!)) as [number, number];
const roadLine = (r: PolicyReport) => { const [safe, danger] = robRate(r); return `gặp cướp ${danger.toFixed(1)}‰ tuần trên đường băng cướp giữ (${r.roadWeeks[1]} tuần), ${safe.toFixed(1)}‰ trên đường khác (${r.roadWeeks[0]} tuần)`; };

/** Trả danh sách tiêu chí không đạt (rỗng = PASS). `all`: đủ năm chiến lược, xét được so sánh giữa các chiến lược. */
export function batchCriteria(reports: PolicyReport[], all: boolean): string[] {
  const failed: string[] = [];
  const by = (p: PolicyName) => reports.find((r) => r.policy === p);
  for (const r of reports) {
    if (r.stuck || r.overCap) failed.push(`${r.policy}: kẹt ${r.stuck}, vượt trần ${r.overCap}`);
    // v0.8 S7: người không tìm đạo hầu như không chạm ngưỡng
    if (10 * pct(r.cult.qi1, r.count) >= ORDINARY_QI1_MAX_PCT_X10) failed.push(`${r.policy}: vào tầng 1 ${pct(r.cult.qi1, r.count).toFixed(1)}% đời ≥ ${ORDINARY_QI1_MAX_PCT_X10 / 10}%`);
    const poor = r.byBackground.destitute, rich = r.byBackground.wealthy;
    if (poor && rich && !(poor.meanAge <= rich.meanAge - BACKGROUND_GAP_YEARS)) failed.push(`${r.policy}: bần cùng ${poor.meanAge.toFixed(1)} không thấp hơn giàu ${rich.meanAge.toFixed(1)} ít nhất ${BACKGROUND_GAP_YEARS} năm`);
  }
  const balanced = by('balanced'), lazy = by('lazy'), overwork = by('overwork');
  if (balanced) {
    if (balanced.inRangePct < IN_RANGE_MIN_PCT) failed.push(`điều độ: 40–80 tuổi ${balanced.inRangePct.toFixed(1)}% < ${IN_RANGE_MIN_PCT}%`);
    if (balanced.starvationPct > BALANCED_STARVATION_MAX_PCT) failed.push(`điều độ: chết đói ${balanced.starvationPct.toFixed(1)}% > ${BALANCED_STARVATION_MAX_PCT}%`);
  }
  const family = by('family');
  if (family) {
    if (pct(family.marriedBy30, family.reached30) < FAMILY_MARRIED_BY_30_PCT) failed.push(`gia đình: cưới trước 30 tuổi ${pct(family.marriedBy30, family.reached30).toFixed(1)}% < ${FAMILY_MARRIED_BY_30_PCT}%`);
    if (pct(family.withChildren, family.marriedBy30) < FAMILY_WITH_CHILDREN_PCT) failed.push(`gia đình: có con ${pct(family.withChildren, family.marriedBy30).toFixed(1)}% < ${FAMILY_WITH_CHILDREN_PCT}%`);
    if (family.starvationPct > BALANCED_STARVATION_MAX_PCT) failed.push(`gia đình: chết đói ${family.starvationPct.toFixed(1)}% > ${BALANCED_STARVATION_MAX_PCT}%`);
  }
  if (lazy && lazy.starvationPct < LAZY_STARVATION_MIN_PCT) failed.push(`lười: chết đói ${lazy.starvationPct.toFixed(1)}% < ${LAZY_STARVATION_MIN_PCT}%`);
  if (!all) return failed;
  if (!(lazy!.meanAge <= balanced!.meanAge - LAZY_SHORTER_YEARS)) failed.push(`lười ${lazy!.meanAge.toFixed(1)} tuổi không ngắn hơn điều độ ${balanced!.meanAge.toFixed(1)} ít nhất ${LAZY_SHORTER_YEARS} năm`);
  const wanderer = by('wanderer')!;
  const npcGap = Math.abs(wanderer.npcMeanAge - balanced!.npcMeanAge);
  console.log(`NPC: tuổi lúc mất, lang bạt ${wanderer.npcMeanAge.toFixed(2)} so với điều độ ${balanced!.npcMeanAge.toFixed(2)} (lệch ${npcGap.toFixed(2)} năm)`);
  if (npcGap > NPC_AGE_GAP_MAX_YEARS) failed.push(`NPC: tuổi lúc mất lệch ${npcGap.toFixed(2)} năm giữa lang bạt và điều độ > ${NPC_AGE_GAP_MAX_YEARS}`);
  // Đường (nghiệm thu v0.6 mục 6): lang bạt gặp cướp trên đường băng cướp giữ nhiều hơn đường khác
  const [safe, danger] = robRate(wanderer);
  console.log(`Đường (lang bạt): ${roadLine(wanderer)}`);
  if (!(danger > safe)) failed.push(`lang bạt gặp cướp trên đường cướp giữ ${danger.toFixed(1)}‰ không hơn đường khác ${safe.toFixed(1)}‰`);
  if (!(overwork!.meanAge < balanced!.meanAge)) failed.push(`lao lực ${overwork!.meanAge.toFixed(1)} không ngắn hơn điều độ ${balanced!.meanAge.toFixed(1)}`);
  // Sự kiện: gộp mọi chiến lược trừ "lười" (đời "lười" quá ngắn); mỗi sự kiện phải xảy ra ít nhất một lần
  const active = reports.filter((r) => r.policy !== 'lazy');
  const count = active.reduce((s, r) => s + Object.values(r.events).reduce((a, b) => a + b, 0), 0);
  const perYear = count / Math.max(1, active.reduce((s, r) => s + r.eventYears, 0));
  console.log(`Sự kiện (trừ "lười"): ${perYear.toFixed(2)}/năm sau 12 tuổi`);
  if (perYear < EVENTS_PER_YEAR[0] || perYear > EVENTS_PER_YEAR[1]) failed.push(`sự kiện ${perYear.toFixed(2)}/năm ngoài ${EVENTS_PER_YEAR.join('–')}`);
  const seen = new Set(reports.flatMap((r) => Object.keys(r.events)));
  const missing = EVENT_IDS.filter((id) => !seen.has(id) && !RARE_EVENTS.includes(id));
  if (missing.length) failed.push(`sự kiện chưa xảy ra lần nào: ${missing.join(', ')}`);
  return failed;
}


/**
 * Tìm đạo (nghiệm thu v0.8 mục 6, Q2). Chạm ngưỡng: cả hai đường đều có người vào tầng 1; trong số đời có linh căn, người
 * chơi máy tìm đạo (gộp hai đường) vào tầng 1 ở 30–60%, tông môn cao hơn tán tu. Đủ giá: khác người điều độ ở ít nhất hai trong năm
 * mặt; đời không có linh căn sống kém hơn người điều độ (thọ ngắn hơn hay của cải ít hơn). Đột phá: lần đầu hỏng 30–60%; có
 * đời chết vì hậu quả nhưng không quá 10% số đời đột phá. Tu tiên không phải đường đúng: người tầng 1 thọ hơn người điều
 * độ không quá 8 năm, của cải, con cái không quá 1,5 lần. Sự kiện tu tiên xảy ra hết (trừ danh sách hiếm).
 */
export const SEEKER_QI1_PCT = [30, 60] as const;
export const ORDINARY_QI1_MAX_PCT_X10 = 5;
export const SEEKER_FACETS_MIN = 2;
export const FIRST_FAIL_PCT = [30, 60] as const;
export const BREAKTHROUGH_FATAL_MAX_PCT = 10;
export const QI1_AGE_GAP_MAX = 8;
export const QI1_RICHER_X10 = 15;
/** Sự kiện tu tiên được phép không xảy ra trong batch tìm đạo (ghi chú ở ADR 0022). */
export const RARE_SEEKER_EVENTS: readonly string[] = [
  // Gặp lại ẩn sĩ: cần đã gặp ẩn sĩ khi ẩn dật (sự kiện nghề v0.7) — người chơi máy tìm đạo không theo nghề. Đường đi có
  // test riêng (events.test.ts)
  'event.hermit_hint', 'event.hermit_stone',
  // Vợ/chồng lạnh nhạt vì tu: người tìm đạo làm ăn như người điều độ, ít khi cưới (chiến lược `family` mới đi hỏi vợ)
  'event.spouse_cold',
];

const mainSkillOf = (r: PolicyReport) => Object.entries(r.skills).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '-';
const cultEventPct = (r: PolicyReport) => pct(CULTIVATION_EVENT_IDS.reduce((s, id) => s + (r.events[id] ?? 0), 0), Object.values(r.events).reduce((a, b) => a + b, 0));
/** Các mặt người tìm đạo khác người điều độ (năm mặt của tiêu chí "6+ con đường" v0.7). */
export function seekerFacets(a: PolicyReport, b: PolicyReport): string[] {
  const out: string[] = [];
  if (Math.abs(a.meanAge - b.meanAge) >= PATH_AGE_GAP) out.push('tuổi thọ');
  const ca = causeShare(a), cb = causeShare(b);
  if (mainCause(a) !== mainCause(b) || [...new Set([...Object.keys(ca), ...Object.keys(cb)])].some((k) => Math.abs((ca[k] ?? 0) - (cb[k] ?? 0)) >= PATH_CAUSE_GAP_PCT)) out.push('nguyên nhân chết');
  const lo = Math.max(1, Math.min(a.estateMedian, b.estateMedian)), hi = Math.max(a.estateMedian, b.estateMedian);
  if (hi * 10 >= lo * PATH_ESTATE_RATIO_X10) out.push('của cải');
  if (mainSkillOf(a) !== mainSkillOf(b)) out.push('kỹ năng chính');
  if (cultEventPct(a) >= PATH_OWN_EVENT_PCT) out.push('sự kiện riêng');
  return out;
}

export function seekerCriteria(reports: PolicyReport[], all: boolean): string[] {
  const failed: string[] = [];
  for (const r of reports) if (r.stuck || r.overCap) failed.push(`${r.policy}: kẹt ${r.stuck}, vượt trần ${r.overCap}`);
  if (!all) return failed;
  const balanced = reports.find((r) => r.policy === 'balanced')!;
  const seekers = reports.filter((r) => isSeeker(r.policy));
  const rate = (r: PolicyReport) => pct(r.cult.qi1Rooted, r.cult.rooted);
  // Gộp hai đường (ADR 0023): người tìm đạo có linh căn vào tầng 1 ở 30–60%; từng đường in riêng, tông môn phải cao hơn
  const both = pct(seekers.reduce((s, r) => s + r.cult.qi1Rooted, 0), seekers.reduce((s, r) => s + r.cult.rooted, 0));
  console.log(`Vào tầng 1 (đời có linh căn): gộp ${both.toFixed(1)}% · ${seekers.map((r) => `${r.policy} ${rate(r).toFixed(1)}%`).join(' · ')}`);
  if (both < SEEKER_QI1_PCT[0] || both > SEEKER_QI1_PCT[1]) failed.push(`tìm đạo: vào tầng 1 ${both.toFixed(1)}% đời có linh căn ngoài ${SEEKER_QI1_PCT.join('–')}%`);
  for (const r of seekers) {
    const k = r.cult;
    // Đời đã vào đường tu so với người điều độ (đời chưa bước vào thì sống như người thường, phần ấy đo ở đời không linh căn)
    const p = r.onPath!;
    const facets = seekerFacets(p, balanced);
    console.log(`${r.policy}, ${p.count} đời đã vào đường tu, so với điều độ: khác ${facets.length} mặt (${facets.join(', ') || 'không'}) · ${p.meanAge.toFixed(1)} tuổi · nguyên nhân ${JSON.stringify(p.causes)} · của cải ${p.estateMedian} văn · kỹ năng chính ${mainSkillOf(p)} · sự kiện tu tiên ${cultEventPct(p).toFixed(1)}%`);
    if (facets.length < SEEKER_FACETS_MIN) failed.push(`${r.policy}: chỉ khác điều độ ${facets.length} mặt`);
    const none = k.noRoot, base = balanced.cult.noRoot;
    if (!(none.meanAge < base.meanAge || none.estateMedian < base.estateMedian)) failed.push(`${r.policy}: đời không linh căn ${none.meanAge.toFixed(1)} tuổi, ${none.estateMedian} văn không kém điều độ (${base.meanAge.toFixed(1)} tuổi, ${base.estateMedian} văn)`);
  }
  const sect = reports.find((r) => r.policy === 'seeker_sect'), rogue = reports.find((r) => r.policy === 'seeker_rogue');
  const qi1Sect = seekers.reduce((s, r) => s + r.cult.qi1Sect, 0), qi1Rogue = seekers.reduce((s, r) => s + r.cult.qi1Rogue, 0);
  if (!qi1Sect || !qi1Rogue) failed.push(`vào tầng 1: tông môn ${qi1Sect}, tán tu ${qi1Rogue} — cả hai đường phải có người`);
  if (sect && rogue && !(rate(sect) > rate(rogue))) failed.push(`tông môn ${rate(sect).toFixed(1)}% không cao hơn tán tu ${rate(rogue).toFixed(1)}%`);
  // Đột phá, người tầng 1: gộp hai chiến lược tìm đạo
  const sum = (f: (k: CultStats) => number) => seekers.reduce((s, r) => s + f(r.cult), 0);
  const attempted = sum((k) => k.attempted), firstFail = pct(sum((k) => k.firstFailed), attempted), fatal = sum((k) => k.fatal);
  console.log(`Đột phá (tìm đạo): ${attempted} đời, lần đầu hỏng ${firstFail.toFixed(1)}%, chết vì hậu quả ${fatal} (${pct(fatal, attempted).toFixed(1)}%)`);
  if (firstFail < FIRST_FAIL_PCT[0] || firstFail > FIRST_FAIL_PCT[1]) failed.push(`đột phá lần đầu hỏng ${firstFail.toFixed(1)}% ngoài ${FIRST_FAIL_PCT.join('–')}%`);
  if (!fatal || pct(fatal, attempted) > BREAKTHROUGH_FATAL_MAX_PCT) failed.push(`chết vì hậu quả đột phá ${fatal} đời (${pct(fatal, attempted).toFixed(1)}%): phải có, không quá ${BREAKTHROUGH_FATAL_MAX_PCT}%`);
  const qi1 = seekers.flatMap((r) => (r.cult.qi1 ? [{ n: r.cult.qi1, g: r.cult.qi1Group }] : []));
  const n = qi1.reduce((s, x) => s + x.n, 0);
  if (n) {
    const children = qi1.reduce((s, x) => s + x.n * x.g.children, 0) / n;
    const estate = Math.max(...qi1.map((x) => x.g.estateMedian)), base = balanced.cult.everyone;
    // Thọ: so với người điều độ đã sống tới đúng tuổi người ấy vào tầng 1 (người tầng 1 đã qua được tuổi trẻ)
    const pairs = seekers.flatMap((r) => r.cult.qi1Ages);
    const peers = (from: number) => { const xs = balanced.cult.ages.filter((a) => a >= from); return xs.reduce((s, a) => s + a, 0) / Math.max(1, xs.length); };
    const age = pairs.reduce((s, p) => s + p[1], 0) / Math.max(1, pairs.length), peerAge = pairs.reduce((s, p) => s + peers(p[0]), 0) / Math.max(1, pairs.length);
    console.log(`Tầng 1 (tìm đạo): ${n} đời · ${age.toFixed(1)} tuổi (điều độ cùng tuổi ${peerAge.toFixed(1)}, cả thảy ${balanced.meanAge.toFixed(1)}) · của cải trung vị cao nhất ${estate} văn (điều độ ${balanced.estateMedian}) · ${children.toFixed(2)} con (điều độ ${base.children.toFixed(2)})`);
    if (age - peerAge > QI1_AGE_GAP_MAX) failed.push(`người tầng 1 thọ hơn người điều độ cùng tuổi ${(age - peerAge).toFixed(1)} năm > ${QI1_AGE_GAP_MAX}`);
    if (estate * 10 > Math.max(1, balanced.estateMedian) * QI1_RICHER_X10) failed.push(`người tầng 1 giàu hơn điều độ quá ${QI1_RICHER_X10 / 10} lần`);
    if (children * 10 > base.children * QI1_RICHER_X10) failed.push(`người tầng 1 đông con hơn điều độ quá ${QI1_RICHER_X10 / 10} lần`);
  }
  // Sự kiện: tần suất như batch v0.6; mọi sự kiện tu tiên xảy ra ít nhất một lần trong batch tìm đạo
  const count = seekers.reduce((s, r) => s + Object.values(r.events).reduce((a, b) => a + b, 0), 0);
  const perYear = count / Math.max(1, seekers.reduce((s, r) => s + r.eventYears, 0));
  console.log(`Sự kiện (tìm đạo): ${perYear.toFixed(2)}/năm sau 12 tuổi`);
  if (perYear < EVENTS_PER_YEAR[0] || perYear > EVENTS_PER_YEAR[1]) failed.push(`sự kiện ${perYear.toFixed(2)}/năm ngoài ${EVENTS_PER_YEAR.join('–')}`);
  const seen = new Set(seekers.flatMap((r) => Object.keys(r.events)));
  const missing = CULTIVATION_EVENT_IDS.filter((id) => !seen.has(id) && !RARE_SEEKER_EVENTS.includes(id));
  if (missing.length) failed.push(`sự kiện tu tiên chưa xảy ra lần nào: ${missing.join(', ')}`);
  return failed;
}
