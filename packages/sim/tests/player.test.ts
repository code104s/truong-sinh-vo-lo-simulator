import { describe, expect, it } from 'vitest';
import { birthplaceId, regionId, type MonthPlan } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { Life } from '../src/index';
import { restPlan } from '../src/life/actions';

const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1, 2].map((worldIndex) => ({ worldIndex, area: 10, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town', 'city'], adjacency: [[0, 1], [1, 2]], terrainPct: [300, 300],
  seatKm: [[0, 60, 120], [60, 0, 60], [120, 60, 0]],
};
export function adult(seed = 'player') {
  const l = Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }, region);
  const s = l.snapshot(); s.character.birthTick = 0; s.tick = 20 * 36 + 2; s.character.health = s.character.healthMax = 1000; s.character.stamina = 900;
  return Life.restore(s, l.log, region);
}
describe('pha người chơi', () => {
  it('tuổi thơ tự động, không cho trẻ xếp kế hoạch', () => {
    const l = adult(); const s = l.snapshot(); s.tick = 5 * 36;
    const child = Life.restore(s, [], region); expect(child.setPlan(restPlan())).toBe(false);
    child.advance('week'); expect(child.log.some((e) => e.key.startsWith('log.child.'))).toBe(true);
  });
  it('hành động cho kỹ năng, tốn thể lực; kế hoạch lặp', () => {
    const l = adult(); const p: MonthPlan = { slots: [{ action: 'action.farm' }, { action: 'action.farm' }, { action: 'action.farm' }] };
    expect(l.setPlan(p)).toBe(true); l.advance('week');
    expect(l.character.skillXp.farming).toBeGreaterThan(0); expect(l.character.stamina).toBeLessThan(900);
    expect(l.plan).toEqual(p);
  });
  it('mùa đông: ô làm ruộng tự nghỉ, không ngắt tua, không báo kế hoạch hỏng (hồi quy)', () => {
    const l = adult(); const s = l.snapshot(); s.tick = 20 * 36 + 27; // thượng tuần tháng Mười
    const winter = Life.restore(s, [], region);
    winter.setPlan({ slots: [{ action: 'action.farm' }, { action: 'action.farm' }, { action: 'action.rest' }] });
    const xp = winter.character.skillXp.farming;
    const r = winter.advance('month');
    expect(r.status).toBe('done');
    expect(winter.log.some((e) => e.key === 'log.plan.invalid')).toBe(false);
    expect(winter.character.skillXp.farming).toBe(xp);
    expect(winter.plan?.slots[0]).toEqual({ action: 'action.farm' }); // kế hoạch giữ nguyên, sang xuân làm tiếp
  });
  it('kế hoạch sai nơi ở: nghỉ, ngắt tua đúng một lần cho tới khi sửa kế hoạch (hồi quy)', () => {
    const l = adult(); const s = l.snapshot(); s.character.location = 1; s.tick = 20 * 36 + 3; // ở trấn, tháng Hai
    const town = Life.restore(s, [], region);
    town.setPlan({ slots: [{ action: 'action.farm' }, { action: 'action.farm' }, { action: 'action.farm' }] });
    const r = town.advance('year');
    expect(r.status).toBe('interrupted');
    if (r.status === 'interrupted') expect(r.entry.key).toBe('log.plan.invalid');
    for (let k = 0; k < 3 && town.alive; k++) town.advance('year');
    expect(town.log.filter((e) => e.key === 'log.plan.invalid')).toHaveLength(1);
    town.setPlan({ slots: [{ action: 'action.farm' }, { action: 'action.rest' }, { action: 'action.rest' }] });
    town.advance('week');
    expect(town.log.filter((e) => e.key === 'log.plan.invalid')).toHaveLength(2);
  });
  it('ô di chuyển chỉ chạy một lần: tới nơi thì ô đó thành nghỉ, tua năm không bị ngắt vì kế hoạch (hồi quy)', () => {
    const l = adult(); const plan = restPlan(); plan.slots[2] = { action: 'action.travel', target: 1 }; l.setPlan(plan);
    l.advance('week');
    expect(l.character.location).toBe(1);
    expect(l.plan?.slots[2]).toEqual({ action: 'action.rest' });
    for (let k = 0; k < 3 && l.alive; k++) {
      const r = l.advance('year');
      if (r.status === 'interrupted') expect(r.entry.key).not.toBe('log.plan.invalid');
    }
    expect(l.log.some((e) => e.key === 'log.plan.invalid')).toBe(false);
  });
  it('kiệt sức giữa chuyến: nghỉ ô đó, chuyến đi giữ nguyên rồi đi tiếp', () => {
    const l = adult(); const plan = restPlan(); plan.slots[2] = { action: 'action.travel', target: 2 }; l.setPlan(plan);
    l.advance('week'); expect(l.active?.remaining).toBe(1);
    const s = l.snapshot(); s.character.stamina = 0;
    const tired = Life.restore(s, l.log, region);
    tired.advance('week');
    expect(tired.active?.remaining).toBe(1);
    expect(tired.character.location).toBe(0);
    while (tired.active && tired.alive) tired.advance('week');
    expect(tired.character.location).toBe(2);
  });
  it('việc thường ngày không ghi nhật ký (hồi quy: 94% nhật ký là "Dành một tuần để…")', () => {
    const l = adult(); const from = l.log.length;
    l.setPlan({ slots: [{ action: 'action.forage' }, { action: 'action.forage' }, { action: 'action.rest' }] });
    for (let k = 0; k < 5 && l.alive; k++) l.advance('year');
    const entries = l.log.slice(from);
    expect(entries.some((e) => e.key === 'log.action.done')).toBe(false);
    expect(entries.length).toBeLessThan(60); // 5 năm ≈ 180 ô; trước đây mỗi ô một dòng
  });
  it('đi 2 ô qua ranh tháng; lưu giữa đường không trừ lại giá ô đã xong', () => {
    const l = adult(); const plan = restPlan(); plan.slots[2] = { action: 'action.travel', target: 2 }; l.setPlan(plan);
    l.advance('week'); expect(l.character.location).toBe(0); expect(l.active?.remaining).toBe(1);
    const loaded = Life.restore(l.snapshot(), l.log, region);
    l.advance('week'); loaded.advance('week');
    expect(l.character.location).toBe(2); expect(l.active).toBeNull();
    expect(loaded.digest()).toBe(l.digest()); expect(loaded.log).toEqual(l.log);
  });
});
