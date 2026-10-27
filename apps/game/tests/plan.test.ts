import type { ActionOption, MonthPlan } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { planInvalid } from '../src/app/plan';

const opt = (id: string, locked: string | null = null): ActionOption => ({ id, group: 'livelihood', slots: 1, cost: { stamina: 'cost.low', risk: 'risk.low' }, gains: [], locked });
const actions = [opt('action.farm', 'lock.winter'), opt('action.study', 'lock.place'), opt('action.rest'), opt('action.travel')];
const travel = [{ county: 1, slots: 1, risk: 'risk.low' }];

describe('kế hoạch tháng phía giao diện (hồi quy: FE từng chặn theo khóa lúc này)', () => {
  it('khóa lúc này không chặn: lên trấn rồi học chữ, hoặc xếp làm ruộng trước khi hết đông', () => {
    const plan: MonthPlan = { slots: [{ action: 'action.travel', target: 1 }, { action: 'action.study' }, { action: 'action.farm' }] };
    expect(planInvalid(plan, actions, travel)).toBe(false);
  });
  it('vẫn chặn kế hoạch sai ý nghĩa', () => {
    expect(planInvalid({ slots: [{ action: 'action.fly' }, { action: 'action.rest' }, { action: 'action.rest' }] }, actions, travel)).toBe(true);
    expect(planInvalid({ slots: [{ action: 'action.travel', target: 7 }, { action: 'action.rest' }, { action: 'action.rest' }] }, actions, travel)).toBe(true);
    expect(planInvalid({ slots: [{ action: 'action.travel' }, { action: 'action.rest' }, { action: 'action.rest' }] }, actions, travel)).toBe(true);
  });
});
