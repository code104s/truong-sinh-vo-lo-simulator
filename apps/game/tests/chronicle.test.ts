import type { LogEntry } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { groupByYear, isPeopleNews, visibleItems } from '../src/app/chronicle';
import { planDirty } from '../src/app/plan';
import { logSeal } from '../src/ui/icons';

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

  it('tin sinh, mất của người chưa quen gập cả ở năm mới nhất; người quen mất vẫn hiện; mở ra thì hiện đủ (v0.4 F2)', () => {
    const news: LogEntry[] = [
      e(10, 'major', 'log.birth'), e(40), e(50, 'minor', 'log.npc.birth'), e(60, 'minor', 'log.npc.death'), e(70, 'major', 'log.npc.death'),
    ];
    const [latest, older] = groupByYear(news, 10);
    const shown = visibleItems(latest!, 'all', true, false);
    expect(shown.folded).toBe(2);
    expect(shown.items.map((it) => it.entry.tick)).toEqual([70, 40]); // việc thường của mình vẫn hiện; người quen mất hiện
    expect(visibleItems(latest!, 'all', true, true)).toMatchObject({ folded: 0 });
    expect(visibleItems(latest!, 'all', true, true).items).toHaveLength(4);
    expect(visibleItems(older!, 'all', false, false)).toMatchObject({ folded: 0 });
  });

  it('"Người quanh mình": chỉ tin sinh, mất và sự kiện có người thật, không gập', () => {
    const named: LogEntry = { tick: 45, key: 'event.beggar.result.give', params: { name: 'Lý An', lost: 10 }, importance: 'major' };
    const anon: LogEntry = { tick: 46, key: 'event.beggar.result.give', params: { lost: 10 }, importance: 'major' };
    const news = [e(10, 'major', 'log.birth'), e(40), named, anon, e(50, 'minor', 'log.npc.birth'), e(60, 'major', 'log.npc.death')];
    expect(news.map(isPeopleNews)).toEqual([false, false, true, false, true, true]);
    const [g] = groupByYear(news, 40);
    expect(visibleItems(g!, 'people', true, false)).toMatchObject({ folded: 0 });
    expect(visibleItems(g!, 'people', false, false).items.map((it) => it.entry.tick)).toEqual([60, 50, 45]);
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

describe('tin quan hệ, gia đình, lời đồn trong biên niên (v0.5 F3)', () => {
  const keys = ['log.kin.death', 'log.kin.birth', 'log.kin.help', 'log.kin.inherit', 'log.social.visit', 'log.social.helped_grain', 'log.social.helped_money',
    'log.social.refused', 'log.social.cannot_help', 'log.marry.wed_groom', 'log.marry.wed_bride_moved', 'log.marry.refused', 'log.rumor.death'];

  it('lọc "Người quanh mình" gồm tin gia đình, xã giao, cưới hỏi, tin đồn người quen mất; tin đồn đói kém, tai họa thì không', () => {
    for (const key of keys) expect(isPeopleNews(e(1, 'minor', key)), key).toBe(true);
    for (const key of ['log.rumor.famine', 'log.rumor.flood', 'log.rumor.epidemic', 'log.spend', 'log.tax.short']) expect(isPeopleNews(e(1, 'minor', key)), key).toBe(false);
  });

  it('mỗi tin quan hệ, gia đình, lời đồn có ấn triện', () => {
    for (const key of [...keys, 'log.rumor.famine', 'log.rumor.drought', 'log.rumor.flood', 'log.rumor.locust', 'log.rumor.epidemic']) expect(logSeal(e(1, 'minor', key)), key).not.toBeNull();
    expect(logSeal(e(1, 'minor', 'log.rumor.flood'))!.char).toBe('聞');
  });
});
