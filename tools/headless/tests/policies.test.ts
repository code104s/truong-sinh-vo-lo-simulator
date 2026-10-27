import { describe, expect, it } from 'vitest';
import { policyPlan, POLICIES, type PolicyContext } from '../src/policies';
import { sampleCharacter } from '../../../packages/shared/tests/fixtures';
const context = (): PolicyContext => ({
  character: { ...sampleCharacter, canAct: true, healthPct: 100 }, date: { tick: 721, year: 21, month: 1, tenDay: 1, season: 'spring' },
  actions: ['action.rest', 'action.farm', 'action.travel'].map((id) => ({ id, group: 'rest', slots: 1, cost: { stamina: 'cost.low', risk: 'risk.low' }, gains: [], locked: null })),
  travel: [{ county: 1, slots: 1, risk: 'risk.low' }], settlements: ['village', 'town'], seed: 123, active: false,
});
describe('người chơi tự động', () => {
  it('cùng đầu vào cùng kế hoạch; không sửa đầu vào và không đặt kế hoạch khi trẻ/đang đi', () => {
    for (const name of POLICIES) {
      const c = context(), before = JSON.stringify(c);
      expect(policyPlan(name, c)).toEqual(policyPlan(name, c)); expect(JSON.stringify(c)).toBe(before);
      expect(policyPlan(name, { ...c, active: true })).toBeNull();
      expect(policyPlan(name, { ...c, character: { ...c.character, canAct: false } })).toBeNull();
    }
  });
  it('học giả tìm trấn; nông dân điều độ nghỉ 1 ô, lao lực làm cả 3', () => {
    const c = context();
    expect(policyPlan('scholar', c)?.slots[1]).toEqual({ action: 'action.travel', target: 1 });
    expect(policyPlan('balanced', c)?.slots.filter((s) => s.action === 'action.rest')).toHaveLength(1);
    expect(policyPlan('overwork', c)?.slots.every((s) => s.action === 'action.farm')).toBe(true);
    c.actions.find((x) => x.id === 'action.farm')!.locked = 'lock.winter';
    expect(policyPlan('balanced', c)?.slots.every((s) => s.action === 'action.rest')).toBe(true);
  });
});
