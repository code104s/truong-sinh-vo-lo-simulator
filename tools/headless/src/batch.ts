import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { ageYearsAt, calendarOf, type Birthplace, type PlanSlot, type RegionId } from '@tsvl/shared';
import { BACKGROUNDS, EVENT_IDS, Life } from '@tsvl/sim';
import type { RegionLogic } from '@tsvl/worldgen';
import { POLICIES, policyChoose, policyPlan, policyTrade, type PolicyContext, type PolicyName } from './policies';

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
export const FAMILY_MARRIED_BY_30_PCT = 70;
export const FAMILY_WITH_CHILDREN_PCT = 60;
export const RARE_EVENTS: readonly string[] = [
  // v0.5 S7–S8: cần kẻ thù, món nợ ơn hay người quen thân ngoài người thân — chưa chiến lược nào tạo ra (`family` chỉ thăm
  // người hợp đôi). Đường đi của từng sự kiện có test riêng (events.test.ts). Con ốm, vợ chồng lục đục: `family` gặp.
  'event.debt_called', 'event.enemy_revenge', 'event.friend_brings_rice', 'event.friend_in_need',
];

export interface BackgroundReport { count: number; meanAge: number; starvationPct: number }
export interface PolicyReport { estateMedian: number; inheritedPct: number; inheritedMedian: number; npcDeaths: number; npcMeanAge: number; policy: PolicyName; count: number; stuck: number; overCap: number; meanAge: number; medianAge: number; inRangePct: number; oldAgePct: number; starvationPct: number; causes: Record<string, number>; skills: Record<string, number>; byBackground: Record<string, BackgroundReport>; events: Record<string, number>; eventYears: number; ticks: number; ms: number; starved: (StarvedInfo & { background: string })[]; reached30: number; marriedBy30: number; withChildren: number }

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
}
export interface StarvedInfo {
  age: number; independent: boolean; town: boolean; away: boolean; landMu: number; tenure: string; money: number; hungerYears: number;
  famine: boolean; badHarvests: number; taxShort: number; inherited: boolean; kinHelp: number; lastEvents: string[];
}

/** Bộ nhớ đệm đích đi được theo vùng/quận: thuần, mỗi luồng giữ một cái. */
export type TravelCache = Map<string, ReturnType<Life['travel']>>;

/** Chạy đời thứ `i` của một chiến lược: thuần, tất định theo (vùng, i). */
export function runLife(regions: readonly BatchRegion[], policy: PolicyName, i: number, optionsCache: TravelCache = new Map()): LifeResult {
  const r = regions[i % regions.length]!, logic = r.logic!;
  const bp = r.birthplaces[Math.floor(i / regions.length) % r.birthplaces.length]!;
  const life = Life.create({ worldSeed: r.seed, regionId: r.regionId, birthplaceId: bp.id, lifeSeed: i }, bp, logic);
  const end = life.tick + 200 * 36;
  const events: Record<string, number> = {};
  let ticks = 0;
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
    if (!optionsCache.has(key)) optionsCache.set(key, policy === 'wanderer' || policy === 'scholar' ? life.travel() : []);
    const ctx = (): PolicyContext => ({
      character: life.view(), date: calendarOf(life.tick), actions: life.actions(), travel: optionsCache.get(key)!, settlements: logic.settlementKind, seed: i, active: !!life.active, market: life.market(),
      // Xã giao (v0.5 S8): chỉ chiến lược `family`, ở tuần thứ hai, thứ ba của tháng — tuần chạy ô xã giao (kế hoạch xếp
      // lại mỗi tuần)
      ...(policy === 'family' && life.tick % 3 !== 0 ? { people: life.people(), socialLock: (slot: PlanSlot) => life.socialLock(slot) } : {}),
    });
    const now = ctx();
    // Đầu tháng: mua bán lương thực (không tốn ô) rồi mới xếp kế hoạch, để kế hoạch thấy kho mới
    if (life.tick % 3 === 0 && now.character.canAct) { const g = policyTrade(policy, now); if (g !== 0 && life.trade(g) === null) Object.assign(now, ctx()); }
    const plan = policyPlan(policy, now);
    if (plan) life.setPlan(plan);
    life.advance('week'); ticks++;
    const pending = life.pendingEvent();
    if (pending) {
      events[pending.eventId] = (events[pending.eventId] ?? 0) + 1;
      const refused = life.choose(pending.instance, policyChoose(policy, pending, ctx()));
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
  if (life.alive) return { stuck: true, overCap: false, age: 0, cause: '', background: c.background, skills: {}, events, ticks, npcDeaths, npcDeathAgeSum, estate, inherited, ...family };
  return {
    stuck: false, overCap: life.death!.tick - c.birthTick > c.lifespanBase + c.lifespanBonus, age: ageYearsAt(c.birthTick, life.death!.tick), cause: life.death!.cause,
    background: c.background, skills: { ...c.skillXp }, events, ticks, npcDeaths, npcDeathAgeSum, estate, inherited, ...family,
    ...(life.death!.cause === 'starvation' ? { starved: starvedInfo(life, logic, inherited > 0) } : {}),
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
export type LifeRunner = (policy: PolicyName, n: number) => Promise<LifeResult[]>;

/** Chạy tuần tự trên luồng chính (`--threads 1`, và test). */
export const sequentialRunner = (regions: readonly BatchRegion[]): LifeRunner => async (policy, n) => {
  const cache: TravelCache = new Map();
  return Array.from({ length: n }, (_, i) => runLife(regions, policy, i, cache));
};

/** Gộp kết quả theo đúng thứ tự đời: song song hay tuần tự đều ra cùng một báo cáo. */
export function aggregate(policy: PolicyName, results: readonly LifeResult[], ms: number): PolicyReport {
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
    npcDeaths, npcMeanAge: npcAgeSum / Math.max(1, npcDeaths), policy, count: n, stuck, overCap, meanAge: avg(ages), medianAge: ages[Math.floor(ages.length / 2)] ?? 0, inRangePct: 100 * ages.filter((a) => a >= 40 && a <= 80).length / n, oldAgePct: 100 * (causes.old_age ?? 0) / n, starvationPct: 100 * (causes.starvation ?? 0) / n, causes, skills, byBackground, events, eventYears, ticks, ms };
}

export async function runPolicyBatch(regions: BatchRegion[], n: number, selection: string, out?: string, runner: LifeRunner = sequentialRunner(regions)): Promise<PolicyReport[]> {
  const policies = selection === 'all' ? POLICIES : POLICIES.filter((p) => p === selection);
  if (!policies.length) throw new Error(`--policy phải là ${POLICIES.join('|')}|all`);
  const reports: PolicyReport[] = [];
  for (const policy of policies) {
    const started = performance.now();
    const report = aggregate(policy, await runner(policy, n), 0);
    report.ms = performance.now() - started;
    reports.push(report);
    console.log(`${policy}: ${n} đời · kẹt ${report.stuck} · vượt trần ${report.overCap} · trung bình ${report.meanAge.toFixed(2)} · trung vị ${report.medianAge} · 40–80 ${report.inRangePct.toFixed(1)}% · chết già ${report.oldAgePct.toFixed(1)}% · ${report.ms.toFixed(0)} ms`);
    console.log(`  Nguyên nhân: ${JSON.stringify(report.causes)} · kỹ năng trung bình: ${JSON.stringify(report.skills)}`);
    const bgs = report.byBackground;
    console.log(`  Xuất thân: ${BACKGROUNDS.filter((b) => bgs[b]).map((b) => `${b} ${bgs[b]!.count} đời · ${bgs[b]!.meanAge.toFixed(1)} tuổi · đói ${bgs[b]!.starvationPct.toFixed(0)}%`).join(' | ')}`);
    console.log(`  Của cải lúc chết (trung vị): ${report.estateMedian} văn · được thừa kế: ${report.inheritedPct.toFixed(1)}% đời, trung vị ${report.inheritedMedian} văn`);
    console.log(`  NPC mất khi người chơi ${NPC_WINDOW_YEARS.join('–')} tuổi: ${report.npcDeaths} người · tuổi trung bình lúc mất ${report.npcMeanAge.toFixed(2)}`);
    if (report.policy === 'family') console.log(`  Gia đình: cưới trước 30 tuổi ${pct(report.marriedBy30, report.reached30).toFixed(1)}% đời sống tới 30 (mục tiêu ≥ ${FAMILY_MARRIED_BY_30_PCT}) · có con ${pct(report.withChildren, report.marriedBy30).toFixed(1)}% (≥ ${FAMILY_WITH_CHILDREN_PCT})`);
    console.log(`  Sự kiện: ${(Object.values(report.events).reduce((a, b) => a + b, 0) / Math.max(1, report.eventYears)).toFixed(2)}/năm sau 12 tuổi · ${Object.keys(report.events).length} loại`);
  }
  const failed = batchCriteria(reports, selection === 'all');
  for (const f of failed) console.log(`  ✗ ${f}`);
  const pass = failed.length === 0;
  console.log(pass ? 'KẾT QUẢ: PASS' : 'KẾT QUẢ: FAIL (xem phân bố/cân bằng chiến lược)');
  if (out) writeFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), out), JSON.stringify({ pass, reports }, null, 2));
  if (!pass) process.exitCode = 1;
  return reports;
}

const pct = (k: number, n: number) => (100 * k) / Math.max(1, n);

/** Trả danh sách tiêu chí không đạt (rỗng = PASS). `all`: đủ năm chiến lược, xét được so sánh giữa các chiến lược. */
export function batchCriteria(reports: PolicyReport[], all: boolean): string[] {
  const failed: string[] = [];
  const by = (p: PolicyName) => reports.find((r) => r.policy === p);
  for (const r of reports) {
    if (r.stuck || r.overCap) failed.push(`${r.policy}: kẹt ${r.stuck}, vượt trần ${r.overCap}`);
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

