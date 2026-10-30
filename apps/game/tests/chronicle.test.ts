import { CAREERS, type LogEntry } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { CHRONICLE_FILTERS, FILTERS_WITH_EMPTY, groupByYear, isAffairsNews, isCareerNews, isDaoEvent, isDaoNews, isPeopleNews, visibleItems } from '../src/app/chronicle';
import { planDirty } from '../src/app/plan';
import { CAREER_CHAR, DAO_CHAR, logSeal } from '../src/ui/icons';

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

describe('lọc "Thế sự" (v0.6 F3)', () => {
  const at = (key: string, importance: 'major' | 'minor' = 'minor') => ({ tick: 40, key, params: { place: 'Vị Kinh', surname: 'Lương', county: 'Vị Kinh' }, importance });
  it('chỉ tin thế lực: tin thế sự, tin đồn thế lực, kết quả sự kiện thế lực; không gập', async () => {
    const { hasKey } = await import('@tsvl/content');
    const log = [at('log.faction.bandits_founded', 'major'), at('log.rumor.seized_clan'), at('log.rumor.famine'), at('event.corvee_levy.result.go', 'major'), at('log.harvest.own'), at('log.faction.campaign_won')];
    expect(log.map(isAffairsNews)).toEqual([true, true, false, true, false, true]);
    const [g] = groupByYear(log, 0);
    expect(visibleItems(g!, 'affairs', false, false)).toMatchObject({ folded: 0 });
    expect(visibleItems(g!, 'affairs', false, false).items.map((it) => it.entry.key)).toEqual(['log.faction.campaign_won', 'event.corvee_levy.result.go', 'log.rumor.seized_clan', 'log.faction.bandits_founded']);
    expect(CHRONICLE_FILTERS).toContain('affairs');
    for (const k of ['ui.chron.affairs', 'ui.chron.affairs_empty']) expect(hasKey(k), k).toBe(true);
    for (const k of ['bandits', 'clan', 'guild'].flatMap((x) => [`log.faction.${x}_founded`, `log.faction.${x}_ended`]).concat(['log.faction.seized_bandits', 'log.faction.seized_clan', 'log.faction.retaken', 'log.faction.campaign_won', 'log.faction.campaign_lost'])) expect(hasKey(k), k).toBe(true);
  });
});

describe('biểu tượng tin thế sự (v0.6 F3)', () => {
  it('cướp triện đỏ, quan phủ triện mực, họ lớn, thương hội triện vàng đất', () => {
    expect(logSeal(e(1, 'major', 'log.faction.seized_bandits'))).toEqual({ char: '匪', tone: 'red' });
    expect(logSeal(e(1, 'minor', 'log.faction.campaign_lost'))).toEqual({ char: '官', tone: 'ink' });
    expect(logSeal(e(1, 'minor', 'log.faction.guild_founded'))).toEqual({ char: '勢', tone: 'ochre' });
  });
});

describe('lọc "Nghề" và triện nghề (v0.7 F3)', () => {
  const at = (key: string, career?: LogEntry['career']): LogEntry => ({ tick: 40, key, params: {}, importance: 'major', ...(career ? { career } : {}) });
  it('chỉ việc nghề: vào, rời nghề, sai dịch, buôn chuyến, thương hội, theo cướp, kết quả sự kiện nghề; không gập', async () => {
    const { hasKey } = await import('@tsvl/content');
    const log = [at('log.career.enter'), at('log.soldier.wage'), at('log.haul.profit'), at('log.guild.join'), at('log.outlaw.atone'),
      at('event.hunt_wolf.result.fight', 'hunter'), at('event.tax_collector.result.pay'), at('log.harvest.own')];
    expect(log.map(isCareerNews)).toEqual([true, true, true, true, true, true, false, false]);
    const [g] = groupByYear(log, 0);
    expect(visibleItems(g!, 'career', false, false)).toMatchObject({ folded: 0 });
    expect(visibleItems(g!, 'career', false, false).items).toHaveLength(6);
    expect(CHRONICLE_FILTERS).toEqual(['all', 'major', 'career', 'dao', 'people', 'affairs']);
    for (const f of FILTERS_WITH_EMPTY) expect(hasKey(`ui.chron.${f}_empty`), f).toBe(true);
    for (const f of CHRONICLE_FILTERS) expect(hasKey(`ui.chron.${f}`), f).toBe(true);
  });

  it('kết quả sự kiện nghề đóng triện nghề; theo cướp triện đỏ; mỗi nghề một chữ', () => {
    expect(logSeal(at('event.hunt_wolf.result.fight', 'hunter'))).toEqual(CAREER_CHAR.hunter);
    expect(logSeal(at('log.outlaw.desert'))).toEqual({ char: '匪', tone: 'red' });
    expect(new Set(CAREERS.map((c) => CAREER_CHAR[c].char)).size).toBe(CAREERS.length);
  });
});

describe('lọc "Đạo" và triện đường tiên (v0.8 F3)', () => {
  const at = (key: string, importance: LogEntry['importance'] = 'major'): LogEntry => ({ tick: 40, key, params: {}, importance });
  it('chỉ chuyện đường tiên: tông môn, kỳ tuyển, dấu hiệu, dẫn khí, tu luyện, đột phá, kết quả sự kiện đường tiên; không gập', () => {
    const log = [at('log.sect.rumor'), at('log.sect.neighbor_taken', 'minor'), at('log.omen.dream'), at('log.rogue.induced'), at('log.cultivate.peak', 'minor'),
      at('log.breakthrough.failed'), at('event.seek_cave.result.enter'), at('event.tax_collector.result.pay'), at('log.harvest.own'), at('event.seek_cavern.result.x')];
    expect(log.map(isDaoNews)).toEqual([true, true, true, true, true, true, true, false, false, false]);
    const [g] = groupByYear(log, 0);
    expect(visibleItems(g!, 'dao', false, false)).toMatchObject({ folded: 0 });
    expect(visibleItems(g!, 'dao', false, false).items).toHaveLength(7);
    expect(isDaoEvent('event.seek_cave')).toBe(true);
    expect(isDaoEvent('event.tax_collector')).toBe(false);
  });

  it('kết quả sự kiện đường tiên đóng triện 道; đột phá thành ngọc, hỏng đỏ; tông môn 宗', () => {
    expect(logSeal(at('event.wandering_cultivator.result.share'))).toEqual(DAO_CHAR);
    expect(logSeal(at('log.breakthrough.ok'))).toEqual({ char: '成', tone: 'jade' });
    expect(logSeal(at('log.breakthrough.severe'))).toEqual({ char: '逆', tone: 'red' });
    expect(logSeal(at('log.sect.joined'))).toEqual({ char: '宗', tone: 'jade' });
    expect(logSeal(at('log.sect.expelled'))).toEqual({ char: '宗', tone: 'ink' });
  });
});

