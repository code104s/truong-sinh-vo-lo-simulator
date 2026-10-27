import { describe, expect, it } from 'vitest';
import type { PendingEvent } from '@tsvl/shared';
import { GRAIN_RESERVE, MONEY_RESERVE, policyChoose, policyPlan, policyTrade, POLICIES, SELL_ABOVE, type PolicyContext } from '../src/policies';
import { sampleCharacter, sampleMarket } from '../../../packages/shared/tests/fixtures';
const context = (household: Partial<PolicyContext['character']['household']> = { grain: 1_000 }): PolicyContext => ({
  character: { ...sampleCharacter, canAct: true, healthPct: 100, ageYears: 20, household: { ...sampleCharacter.household, ...household } },
  date: { tick: 721, year: 21, month: 1, tenDay: 1, season: 'spring' },
  actions: ['action.rest', 'action.farm', 'action.travel', 'action.hunt'].map((id) => ({ id, group: 'rest', slots: 1, cost: { stamina: 'cost.low', risk: 'risk.low', money: 'money.none' }, gains: [], locked: null })),
  travel: [{ county: 1, slots: 1, risk: 'risk.low' }], settlements: ['village', 'town'], seed: 123, active: false, market: sampleMarket,
});
const pending = (choices: [string, PendingEvent['choices'][number]['costs'], string | null][]): PendingEvent => ({
  instance: 0, eventId: 'event.x', variant: null, params: {}, figure: null,
  choices: choices.map(([id, costs, locked]) => ({ id, costs, locked })),
});

describe('người chơi tự động', () => {
  it('cùng đầu vào cùng kế hoạch; không sửa đầu vào và không đặt kế hoạch khi trẻ/đang đi', () => {
    for (const name of POLICIES) {
      const c = context(), before = JSON.stringify(c);
      expect(policyPlan(name, c)).toEqual(policyPlan(name, c)); expect(policyTrade(name, c)).toBe(policyTrade(name, c));
      expect(JSON.stringify(c)).toBe(before);
      expect(policyPlan(name, { ...c, active: true })).toBeNull();
      expect(policyPlan(name, { ...c, character: { ...c.character, canAct: false } })).toBeNull();
    }
  });

  it('học giả đủ ăn thì tìm trấn; nông dân điều độ nghỉ 1 ô, lao lực làm cả 3; mùa đông ruộng nghỉ thì đi săn', () => {
    const c = context();
    expect(policyPlan('scholar', c)?.slots[1]).toEqual({ action: 'action.travel', target: 1 });
    expect(policyPlan('balanced', c)?.slots.filter((s) => s.action === 'action.rest')).toHaveLength(1);
    expect(policyPlan('overwork', c)?.slots.every((s) => s.action === 'action.farm')).toBe(true);
    c.actions.find((x) => x.id === 'action.farm')!.locked = 'lock.winter';
    expect(policyPlan('balanced', c)?.slots.map((s) => s.action)).toEqual(['action.hunt', 'action.hunt', 'action.rest']);
  });

  it('S7: chưa đủ hai năm ăn thì học giả, kẻ ngao du đi làm; túng tới mùa gặt thì một ô săn kiếm ăn ngay', () => {
    const poor = context({ grain: 150, money: 0 });
    expect(policyPlan('scholar', poor)?.slots.some((s) => s.action === 'action.travel')).toBe(false);
    expect(policyPlan('wanderer', poor)?.slots.some((s) => s.action === 'action.travel')).toBe(false);
    // Tháng Giêng, còn tám tháng tới mùa gặt mà kho chỉ đủ mười lăm tuần: một ô ruộng, một ô săn
    expect(policyPlan('balanced', poor)?.slots.map((s) => s.action)).toEqual(['action.farm', 'action.hunt', 'action.rest']);
    // Kiệt quệ (dưới mười hai tuần): cả hai ô kiếm ăn ngay
    expect(policyPlan('balanced', context({ grain: 50, money: 0 }))?.slots.map((s) => s.action)).toEqual(['action.hunt', 'action.hunt', 'action.rest']);
  });

  it('S7: mua cho đủ một năm ăn khi chợ còn lương; bán phần thừa quá hai năm; giữ tiền thuế', () => {
    const buy = policyTrade('balanced', context({ grain: 100, money: 5_000 }));
    expect(buy).toBe(GRAIN_RESERVE - 100);
    const little = policyTrade('balanced', context({ grain: 100, money: MONEY_RESERVE + 46 }));
    expect(little).toBeLessThan(10); // chỉ tiêu phần dư ngoài tiền giữ
    expect(policyTrade('balanced', { ...context({ grain: 100, money: 5_000 }), market: { ...sampleMarket, supply: 'famine' } })).toBe(0);
    expect(policyTrade('balanced', context({ grain: 2_000 }))).toBe(-Math.min(2_000 - SELL_ABOVE, sampleMarket.maxSell));
    expect(policyTrade('lazy', context({ grain: 100, money: 5_000 }))).toBe(0);
    expect(policyTrade('balanced', context({ grain: 100, money: 5_000, independent: false }))).toBe(0);
  });

  it('S7: chọn lựa chọn có giá nhẹ nhất theo hoàn cảnh; "lười" đi lối ra; lựa chọn khóa không chọn', () => {
    const p = pending([['sell', ['grain'], null], ['carry', ['stamina', 'time'], null], ['bribe', ['money'], 'lock.money'], ['leave', ['opportunity'], null]]);
    expect(policyChoose('lazy', p, context())).toBe('leave');
    expect(policyChoose('balanced', p)).toBe('sell'); // không có ngữ cảnh: lựa chọn đầu đang mở
    expect(policyChoose('balanced', p, context({ grain: 100 }))).toBe('leave'); // thiếu lương thì không bán lương
    expect(policyChoose('overwork', pending([['carry', ['stamina', 'time'], null], ['leave', ['opportunity'], null]]), context())).toBe('carry');
    expect(policyChoose('balanced', pending([['fight', ['health', 'risk'], null], ['pay', ['money'], null], ['leave', ['opportunity'], null]]), context({ money: 5_000 }))).toBe('pay');
  });
});
