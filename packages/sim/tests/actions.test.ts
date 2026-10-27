import { describe, expect, it } from 'vitest';
import { ACTIONS, actionLock, validatePlan } from '../src/life/actions';
import { Life } from '../src/index';
import { birthplaceId, regionId } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
const character = () => Life.create({ worldSeed: 'actions', regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }).snapshot().character;
describe('danh mục hành động', () => {
  it('đủ 10 hành động (v0.3 thêm buôn bán nhỏ), mọi hành động tốn thời gian và mọi việc ngoài nghỉ có giá khác', () => {
    expect(ACTIONS).toHaveLength(10);
    for (const d of ACTIONS) { expect(d.slots).toBeGreaterThan(0); if (d.group !== 'rest') expect(d.stamina + d.riskPpm).toBeGreaterThan(0); }
  });
  it('khóa theo tuổi, nơi ở, mùa, sức khỏe và thể lực', () => {
    const c = character(); c.birthTick = 0;
    const farm = ACTIONS[0]!; expect(actionLock(farm, c, 1, 'village')).toBe('lock.child');
    expect(actionLock(farm, c, 20 * 36, 'town')).toBe('lock.place');
    expect(actionLock(farm, c, 20 * 36 + 33, 'village')).toBe('lock.winter');
    c.health = 100; expect(actionLock(farm, c, 20 * 36, 'village')).toBe('lock.health');
    c.health = 900; c.stamina = 0; expect(actionLock(ACTIONS[3]!, c, 20 * 36, 'village')).toBe('lock.stamina');
  });
  it('không nhận hành động lạ hoặc target không đúng loại', () => {
    const logic = { counties: [{}, {}] } as RegionLogic;
    expect(validatePlan({ slots: [{ action: 'action.fly' }, { action: 'action.rest' }, { action: 'action.rest' }] }, logic)).toBe(false);
    expect(validatePlan({ slots: [{ action: 'action.rest', target: 1 }, { action: 'action.rest' }, { action: 'action.rest' }] }, logic)).toBe(false);
  });
});
