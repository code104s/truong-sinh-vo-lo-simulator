import type { LogEntry } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { groupByYear, visibleItems } from '../src/app/chronicle';
import { planDirty } from '../src/app/plan';

const e = (tick: number, importance: LogEntry['importance'] = 'minor', key = 'log.child.help'): LogEntry => ({ tick, key, params: {}, importance });

describe('biên niên theo năm (đề xuất giao diện P0)', () => {
  // Sinh tick 10 (năm 1); năm = 36 tick
  const log = [e(10, 'major', 'log.birth'), e(20), e(40), e(50, 'major'), e(60), e(80), e(110, 'major')];

  it('năm mới nhất lên đầu, việc mới nhất lên đầu, kèm tuổi', () => {
    const years = groupByYear(log, 10);
    expect(years.map((g) => g.year)).toEqual([4, 3, 2, 1]);
    expect(years[0]!.items.map((it) => it.index)).toEqual([6]);
    expect(years[2]!.items.map((it) => it.entry.tick)).toEqual([60, 50, 40]);
    expect(years[2]).toMatchObject({ ageFrom: 0, ageTo: 1, majorCount: 1, minorCount: 2 });
    expect(years[3]).toMatchObject({ ageFrom: 0, ageTo: 0 });
  });

  it('"Tất cả": năm mới nhất hiện đủ; năm cũ gập việc thường ngày, mở thì hiện đủ', () => {
    const [latest, , y2] = groupByYear(log, 10);
    expect(visibleItems(latest!, 'all', true, false).folded).toBe(0);
    expect(visibleItems(y2!, 'all', false, false)).toMatchObject({ folded: 2 });
    expect(visibleItems(y2!, 'all', false, false).items).toHaveLength(1);
    expect(visibleItems(y2!, 'all', false, true)).toMatchObject({ folded: 0 });
    expect(visibleItems(y2!, 'all', false, true).items).toHaveLength(3);
  });

  it('"Chuyện lớn": chỉ việc lớn, không có dòng gập, kể cả năm mới nhất', () => {
    const [latest, y3] = groupByYear(log, 10);
    expect(visibleItems(latest!, 'major', true, false).items.every((it) => it.entry.importance === 'major')).toBe(true);
    expect(visibleItems(y3!, 'major', false, false)).toEqual({ items: [], folded: 0 });
  });

  it('nhật ký rỗng thì không có năm nào', () => {
    expect(groupByYear([], 0)).toEqual([]);
  });
});

describe('bản nháp kế hoạch', () => {
  const plan = { slots: [{ action: 'action.farm' }, { action: 'action.rest' }, { action: 'action.travel', target: 2 }] } as const;
  it('so cả hành động và điểm đến; chưa có kế hoạch thì so với ba ô nghỉ', () => {
    expect(planDirty({ slots: [...plan.slots] as never }, plan as never)).toBe(false);
    expect(planDirty({ slots: [plan.slots[0], plan.slots[1], { action: 'action.travel', target: 3 }] } as never, plan as never)).toBe(true);
    expect(planDirty({ slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] }, null)).toBe(false);
    expect(planDirty({ slots: [{ action: 'action.farm' }, { action: 'action.rest' }, { action: 'action.rest' }] }, null)).toBe(true);
  });
});
