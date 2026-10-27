import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { calendarOf, type Birthplace, type RegionId } from '@tsvl/shared';
import { BACKGROUNDS, EVENT_IDS, Life } from '@tsvl/sim';
import type { RegionLogic } from '@tsvl/worldgen';
import { POLICIES, policyChoose, policyPlan, policyTrade, type PolicyContext, type PolicyName } from './policies';

interface BatchRegion { seed: string; regionId: RegionId; birthplaces: Birthplace[]; logic: RegionLogic | null }
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
/** Sự kiện hiếm, được phép không xảy ra trong một lượt batch (ghi chú trong ADR 0014). */
export const RARE_EVENTS: readonly string[] = [];

export interface BackgroundReport { count: number; meanAge: number; starvationPct: number }
export interface PolicyReport { policy: PolicyName; count: number; stuck: number; overCap: number; meanAge: number; medianAge: number; inRangePct: number; oldAgePct: number; starvationPct: number; causes: Record<string, number>; skills: Record<string, number>; byBackground: Record<string, BackgroundReport>; events: Record<string, number>; eventYears: number; ticks: number; ms: number }

export function runPolicyBatch(regions: BatchRegion[], n: number, selection: string, out?: string): PolicyReport[] {
  const policies = selection === 'all' ? POLICIES : POLICIES.filter((p) => p === selection);
  if (!policies.length) throw new Error(`--policy phải là ${POLICIES.join('|')}|all`);
  const reports: PolicyReport[] = [];
  for (const policy of policies) {
    const ages: number[] = [], causes: Record<string, number> = {}, skills: Record<string, number> = {};
    const byBg: Record<string, { ages: number[]; starved: number }> = {};
    const events: Record<string, number> = {};
    let eventYears = 0;
    let stuck = 0, overCap = 0, ticks = 0;
    const started = performance.now();
    const optionsCache = new Map<string, ReturnType<Life['travel']>>();
    for (let i = 0; i < n; i++) {
      const r = regions[i % regions.length]!, logic = r.logic!;
      const bp = r.birthplaces[Math.floor(i / regions.length) % r.birthplaces.length]!;
      const life = Life.create({ worldSeed: r.seed, regionId: r.regionId, birthplaceId: bp.id, lifeSeed: i }, bp, logic);
      const end = life.tick + 200 * 36;
      while (life.alive && life.tick < end) {
        const key = `${r.seed}/${life.character.location}`;
        if (!optionsCache.has(key)) optionsCache.set(key, policy === 'wanderer' || policy === 'scholar' ? life.travel() : []);
        const ctx = (): PolicyContext => ({ character: life.view(), date: calendarOf(life.tick), actions: life.actions(), travel: optionsCache.get(key)!, settlements: logic.settlementKind, seed: i, active: !!life.active, market: life.market() });
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
      if (life.alive) { stuck++; continue; }
      if (life.death!.tick - life.character.birthTick > life.character.lifespanBase + life.character.lifespanBonus) overCap++;
      const age = life.summary().ageYears;
      ages.push(age); causes[life.death!.cause] = (causes[life.death!.cause] ?? 0) + 1;
      const bg = (byBg[life.character.background] ??= { ages: [], starved: 0 });
      bg.ages.push(age); if (life.death!.cause === 'starvation') bg.starved++;
      eventYears += Math.max(0, age - 12);
      for (const [skill, xp] of Object.entries(life.character.skillXp)) skills[skill] = (skills[skill] ?? 0) + xp;
    }
    ages.sort((a, b) => a - b);
    for (const key of Object.keys(skills)) skills[key] = Math.round(skills[key]! / n);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const byBackground: Record<string, BackgroundReport> = {};
    for (const key of BACKGROUNDS) { const b = byBg[key]; if (b) byBackground[key] = { count: b.ages.length, meanAge: avg(b.ages), starvationPct: 100 * b.starved / b.ages.length }; }
    const report: PolicyReport = { policy, count: n, stuck, overCap, meanAge: avg(ages), medianAge: ages[Math.floor(ages.length / 2)] ?? 0, inRangePct: 100 * ages.filter((a) => a >= 40 && a <= 80).length / n, oldAgePct: 100 * (causes.old_age ?? 0) / n, starvationPct: 100 * (causes.starvation ?? 0) / n, causes, skills, byBackground, events, eventYears, ticks, ms: performance.now() - started };
    reports.push(report);
    console.log(`${policy}: ${n} đời · kẹt ${stuck} · vượt trần ${overCap} · trung bình ${report.meanAge.toFixed(2)} · trung vị ${report.medianAge} · 40–80 ${report.inRangePct.toFixed(1)}% · chết già ${report.oldAgePct.toFixed(1)}% · ${report.ms.toFixed(0)} ms`);
    console.log(`  Nguyên nhân: ${JSON.stringify(causes)} · kỹ năng trung bình: ${JSON.stringify(skills)}`);
    console.log(`  Xuất thân: ${BACKGROUNDS.filter((b) => byBackground[b]).map((b) => `${b} ${byBackground[b]!.count} đời · ${byBackground[b]!.meanAge.toFixed(1)} tuổi · đói ${byBackground[b]!.starvationPct.toFixed(0)}%`).join(' | ')}`);
    console.log(`  Sự kiện: ${(Object.values(events).reduce((a, b) => a + b, 0) / Math.max(1, eventYears)).toFixed(2)}/năm sau 12 tuổi · ${Object.keys(events).length} loại`);
  }
  const failed = batchCriteria(reports, selection === 'all');
  for (const f of failed) console.log(`  ✗ ${f}`);
  const pass = failed.length === 0;
  console.log(pass ? 'KẾT QUẢ: PASS' : 'KẾT QUẢ: FAIL (xem phân bố/cân bằng chiến lược)');
  if (out) writeFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), out), JSON.stringify({ pass, reports }, null, 2));
  if (!pass) process.exitCode = 1;
  return reports;
}

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
  if (lazy && lazy.starvationPct < LAZY_STARVATION_MIN_PCT) failed.push(`lười: chết đói ${lazy.starvationPct.toFixed(1)}% < ${LAZY_STARVATION_MIN_PCT}%`);
  if (!all) return failed;
  if (!(lazy!.meanAge <= balanced!.meanAge - LAZY_SHORTER_YEARS)) failed.push(`lười ${lazy!.meanAge.toFixed(1)} tuổi không ngắn hơn điều độ ${balanced!.meanAge.toFixed(1)} ít nhất ${LAZY_SHORTER_YEARS} năm`);
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

