// Người chơi máy theo nghề và tiêu chí "6+ con đường" (v0.7 S9, ADR 0020 Q2).
import { CAREERS } from '@tsvl/shared';
import { CAREER_EVENTS_OF } from '@tsvl/sim';
import { describe, expect, it } from 'vitest';
import { pathFacets, type PolicyReport } from '../src/batch';
import { isPath, PATHS } from '../src/paths';

/** Báo cáo mẫu của một nghề: chỉ những số tiêu chí đọc tới. */
function report(policy: string, o: { age: number; estate: number; causes: Record<string, number>; skill: string; own?: number }): PolicyReport {
  return {
    policy, count: 100, stuck: 0, meanAge: o.age, estateMedian: o.estate, causes: o.causes,
    path: { enteredPct: 100, entryAge: 15, atDeathPct: 50, livedPct: 90, years: 30, ownEventPct: o.own ?? 10, mainSkill: o.skill },
  } as unknown as PolicyReport;
}

describe('người chơi máy theo nghề (S9)', () => {
  it('mỗi nghề một chiến lược; năm sự kiện riêng mỗi nghề, tên theo nghề', () => {
    expect(PATHS).toEqual(CAREERS);
    expect(isPath('hunter')).toBe(true);
    expect(isPath('balanced')).toBe(false);
    const prefix: Record<string, string> = { farmer: 'event.farm_', artisan: 'event.craft_', hunter: 'event.hunt_', merchant: 'event.merchant_', physician: 'event.physician_', soldier: 'event.soldier_', drifter: 'event.drifter_', recluse: 'event.recluse_' };
    for (const c of CAREERS) {
      expect(CAREER_EVENTS_OF[c], c).toHaveLength(5);
      if (prefix[c]) for (const id of CAREER_EVENTS_OF[c]!) expect(id.startsWith(prefix[c]!), id).toBe(true);
    }
    expect(CAREER_EVENTS_OF.outlaw).toContain('event.bandit_seize');
  });

  it('năm mặt khác biệt: tuổi thọ ≥ 3 năm, nguyên nhân chết, của cải ≥ 1,5 lần, kỹ năng chính, sự kiện riêng ≥ 30%', () => {
    const a = report('farmer', { age: 60, estate: 40_000, causes: { illness: 50, old_age: 30, accident: 20 }, skill: 'farming' });
    expect(pathFacets(a, report('x', { age: 60, estate: 40_000, causes: { illness: 50, old_age: 30, accident: 20 }, skill: 'farming' }))).toEqual([]);
    expect(pathFacets(a, report('x', { age: 56.9, estate: 60_000, causes: { illness: 50, old_age: 30, accident: 20 }, skill: 'hunting' }))).toEqual(['tuổi thọ', 'của cải', 'kỹ năng chính']);
    expect(pathFacets(a, report('x', { age: 60, estate: 59_000, causes: { illness: 50, old_age: 18, accident: 32 }, skill: 'farming' }))).toEqual(['nguyên nhân chết']);
    expect(pathFacets(report('a', { age: 60, estate: 1, causes: { illness: 1 }, skill: 's', own: 30 }), report('b', { age: 60, estate: 1, causes: { illness: 1 }, skill: 's', own: 35 }))).toEqual(['sự kiện riêng']);
  });
});
