import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { calendarOf, type Birthplace, type RegionId } from '@tsvl/shared';
import { Life } from '@tsvl/sim';
import type { RegionLogic } from '@tsvl/worldgen';
import { POLICIES, policyPlan, type PolicyName } from './policies';

interface BatchRegion { seed: string; regionId: RegionId; birthplaces: Birthplace[]; logic: RegionLogic | null }
/**
 * Tỉ lệ tối thiểu đời chết trong 40–80 tuổi, mỗi chiến lược. v0.2: 85%. v0.3 mục 6 (chủ dự án duyệt 2026-10-27): 80%, vì
 * từ S2 trẻ nhà nghèo có thể chết đói trong nạn đói. Bộ tiêu chí đầy đủ của Q3 thêm ở S7.
 */
export const IN_RANGE_MIN_PCT = 80;

export interface PolicyReport { policy: PolicyName; count: number; stuck: number; overCap: number; meanAge: number; medianAge: number; inRangePct: number; oldAgePct: number; causes: Record<string, number>; skills: Record<string, number>; ticks: number; ms: number }

export function runPolicyBatch(regions: BatchRegion[], n: number, selection: string, out?: string): PolicyReport[] {
  const policies = selection === 'all' ? POLICIES : POLICIES.filter((p) => p === selection);
  if (!policies.length) throw new Error(`--policy phải là ${POLICIES.join('|')}|all`);
  const reports: PolicyReport[] = [];
  for (const policy of policies) {
    const ages: number[] = [], causes: Record<string, number> = {}, skills: Record<string, number> = {};
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
        const plan = policyPlan(policy, { character: life.view(), date: calendarOf(life.tick), actions: life.actions(), travel: optionsCache.get(key)!, settlements: logic.settlementKind, seed: i, active: !!life.active });
        if (plan) life.setPlan(plan);
        life.advance('week'); ticks++;
      }
      if (life.alive) { stuck++; continue; }
      if (life.death!.tick - life.character.birthTick > life.character.lifespanBase + life.character.lifespanBonus) overCap++;
      const age = life.summary().ageYears;
      ages.push(age); causes[life.death!.cause] = (causes[life.death!.cause] ?? 0) + 1;
      for (const [skill, xp] of Object.entries(life.character.skillXp)) skills[skill] = (skills[skill] ?? 0) + xp;
    }
    ages.sort((a, b) => a - b);
    for (const key of Object.keys(skills)) skills[key] = Math.round(skills[key]! / n);
    const report: PolicyReport = { policy, count: n, stuck, overCap, meanAge: ages.reduce((a, b) => a + b, 0) / Math.max(1, ages.length), medianAge: ages[Math.floor(ages.length / 2)] ?? 0, inRangePct: 100 * ages.filter((a) => a >= 40 && a <= 80).length / n, oldAgePct: 100 * (causes.old_age ?? 0) / n, causes, skills, ticks, ms: performance.now() - started };
    reports.push(report);
    console.log(`${policy}: ${n} đời · kẹt ${stuck} · vượt trần ${overCap} · trung bình ${report.meanAge.toFixed(2)} · trung vị ${report.medianAge} · 40–80 ${report.inRangePct.toFixed(1)}% · chết già ${report.oldAgePct.toFixed(1)}% · ${report.ms.toFixed(0)} ms`);
    console.log(`  Nguyên nhân: ${JSON.stringify(causes)} · kỹ năng trung bình: ${JSON.stringify(skills)}`);
  }
  const basePass = reports.every((r) => r.stuck === 0 && r.overCap === 0 && r.inRangePct >= IN_RANGE_MIN_PCT);
  const mean = (p: PolicyName) => reports.find((r) => r.policy === p)?.meanAge;
  const balanced = reports.find((r) => r.policy === 'balanced');
  const ordering = selection !== 'all' || (mean('overwork')! < mean('balanced')! && mean('balanced')! <= mean('lazy')! + 1);
  const pass = basePass && ordering && (!balanced || balanced.oldAgePct >= 30);
  console.log(pass ? 'KẾT QUẢ: PASS' : 'KẾT QUẢ: FAIL (xem phân bố/cân bằng chiến lược)');
  if (out) writeFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), out), JSON.stringify({ pass, reports }, null, 2));
  if (!pass) process.exitCode = 1;
  return reports;
}
