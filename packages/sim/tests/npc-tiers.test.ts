// v0.4 S3 (ADR 0015): tầng L1 tháng tương đương tầng L0 tuần. Tách khỏi npc.test.ts (v0.8) vì một mình chạy khoảng
// 100 s: để riêng một tệp thì vitest chạy song song với các test NPC khác.
import { buildRegion } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { simulateWorld } from '../src/index';

describe('tầng L1 tháng (v0.4 S3, ADR 0015)', () => {
  it('tương đương: cùng vùng thật, cùng dân số ban đầu, chạy toàn L0 và toàn L1 100 năm (có sinh từ S4) — tuổi lúc mất lệch ≤ 1 năm, mỗi nguyên nhân lệch ≤ 3 điểm, chết đói ≤ 2 điểm', () => {
    const real = buildRegion('tsvl-01').logic;
    const run = (allL0: boolean) => {
      const deaths: Record<string, number> = {}; let ages = 0;
      for (let i = 0; i < 15; i++) {
        const s = simulateWorld(real, 100, `eq-${i}`, { allL0 });
        for (const [k, v] of Object.entries(s.deaths)) deaths[k] = (deaths[k] ?? 0) + v;
        ages += s.deathAgeSum;
      }
      const n = Object.values(deaths).reduce((a, b) => a + b, 0);
      return { n, age: ages / n, pct: (k: string) => (100 * (deaths[k] ?? 0)) / n };
    };
    const l0 = run(true), l1 = run(false);
    expect(l0.n).toBeGreaterThanOrEqual(2000);
    expect(Math.abs(l0.age - l1.age)).toBeLessThanOrEqual(1);
    for (const cause of ['old_age', 'illness', 'accident']) expect(Math.abs(l0.pct(cause) - l1.pct(cause)), cause).toBeLessThanOrEqual(3);
    expect(Math.abs(l0.pct('starvation') - l1.pct('starvation'))).toBeLessThanOrEqual(2);
  }, 300_000);
});
