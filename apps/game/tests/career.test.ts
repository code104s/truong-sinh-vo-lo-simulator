// Thân phận nghề (v0.7 F1): dòng nghề trên thanh trạng thái, khối Nghề ở hồ sơ, việc của nghề trong bảng chọn việc.
import { hasKey, t } from '@tsvl/content';
import { CAREERS, CAREER_RANKS, type ActionOption, type CareerEntryView, type CareerView, type FactionView, type MonthPlan, type NpcId } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { careerBlock, careerLine, entryStatus, leaveLosses, mentorStatus, paletteSplit, placeEntry, sortMentors, switchNote } from '../src/app/career';

const option = (id: string, o: Partial<ActionOption> = {}): ActionOption => ({
  id, group: 'livelihood', slots: 1, cost: { stamina: 'cost.low', risk: 'risk.none', money: 'money.none' }, gains: [], locked: null, ...o,
});
const hunter: CareerView = { id: 'hunter', rank: 'apprentice', since: 720, faction: 'f4', mentor: { id: 'n12' as NpcId, name: 'Lý Văn Tâm', alive: true }, years: 2, leave: {} };
const guild: FactionView = { id: 'f4', kind: 'guild', name: { key: 'faction.guild.name', params: { place: 'Vị Kinh' } }, seat: 0, counties: [], strength: 'modest', members: 3 };

describe('thân phận nghề (v0.7 F1)', () => {
  it('thanh trạng thái: nghề · bậc; người lớn chưa vào nghề ghi "chưa theo nghề"; trẻ con không ghi', () => {
    const line = careerLine(hunter, true)!;
    expect(t(line.key, line.params)).toBe('Thợ săn · Học việc');
    expect(t(careerLine(null, true)!.key)).toBe('Chưa theo nghề');
    expect(careerLine(null, false)).toBeNull();
  });

  it('khối Nghề: nơi nhận theo thế lực còn sống, việc tính năm nghề theo thứ tự sim gửi; chưa vào nghề thì null', () => {
    const actions = [option('action.farm'), option('action.hunt', { careerWork: true }), option('action.forage', { careerWork: true })];
    expect(careerBlock(hunter, [guild], actions)).toEqual({ career: hunter, faction: { name: guild.name, kind: 'guild' }, works: ['action.hunt', 'action.forage'] });
    // Thế lực đã tan: không ghi nơi nhận
    expect(careerBlock(hunter, [], actions)!.faction).toBeNull();
    expect(careerBlock(null, [guild], actions)).toBeNull();
  });

  it('bảng chọn việc: việc nghề lên đầu; việc riêng nghề khác gom riêng; việc riêng nghề mình chưa đủ bậc vẫn bày', () => {
    const actions = [
      option('action.farm'), option('action.hunt', { careerWork: true }), option('action.craft', { career: 'artisan', locked: 'lock.career' }),
      option('action.trap', { career: 'hunter', careerWork: true }), option('action.practice', { career: 'physician', locked: 'lock.career' }),
    ];
    const { shown, foreign } = paletteSplit(actions, hunter);
    expect(shown.map((a) => a.id)).toEqual(['action.hunt', 'action.trap', 'action.farm']);
    expect(foreign.map((a) => a.id)).toEqual(['action.craft', 'action.practice']);
    // Chưa vào nghề: mọi việc riêng của nghề đều gom riêng
    expect(paletteSplit(actions, null).foreign.map((a) => a.id)).toEqual(['action.craft', 'action.trap', 'action.practice']);
    // Thầy thuốc học việc: việc hành nghề y (cần bậc làm được) vẫn bày, kèm lý do khóa
    expect(paletteSplit(actions, { ...hunter, id: 'physician' }).shown.map((a) => a.id)).toContain('action.practice');
  });

  it('mọi chuỗi nghề, bậc và nhãn F1 có trong nội dung', () => {
    for (const c of CAREERS) expect(hasKey(`career.${c}`), c).toBe(true);
    for (const r of CAREER_RANKS) expect(hasKey(`career.rank.${r}`), r).toBe(true);
    for (const k of ['ui.career.title', 'ui.career.none', 'ui.career.rank', 'ui.career.since', 'ui.career.mentor', 'ui.career.mentor_dead', 'ui.career.faction', 'ui.career.works',
      'ui.plan.career_work', 'ui.plan.career_work_hint', 'ui.plan.other_careers', 'ui.plan.career_of']) expect(hasKey(k), k).toBe(true);
    expect(t('ui.plan.career_of', { action: t('action.trap'), career: 'career.hunter' })).toBe(`${t('action.trap')} (Thợ săn)`);
  });
});

describe('bảng chọn nghề, rời nghề (v0.7 F2)', () => {
  const farm: CareerEntryView = { career: 'farmer', way: 'mentor', action: 'action.apprentice', mentors: [{ id: 'n3' as NpcId, gift: 0, locked: null }, { id: 'n9' as NpcId, gift: 300, locked: 'lock.stranger' }], locked: null };
  const soldier: CareerEntryView = { career: 'soldier', way: 'faction', action: 'action.enlist', mentors: [], locked: 'lock.not_seat' };
  const drifter: CareerEntryView = { career: 'drifter', way: 'own', action: 'action.drift', mentors: [], locked: null };
  const outlaw: CareerEntryView = { career: 'outlaw', way: 'event', action: null, mentors: [], locked: null };
  const farmer: CareerView = { id: 'farmer', rank: 'journeyman', since: 720, mentor: { id: 'n3' as NpcId, name: 'Phan Tuấn', alive: true }, years: 4, leave: {} };

  it('trạng thái nghề: đang làm, qua sự kiện, khóa, xếp được; nghề qua thầy xét theo từng thầy', () => {
    expect([farm, soldier, drifter, outlaw].map((e) => entryStatus(e, null))).toEqual(['open', 'locked', 'open', 'event']);
    expect(entryStatus(drifter, { ...farmer, id: 'drifter' })).toBe('current');
    expect(entryStatus(farm, farmer)).toBe('open');
    expect(farm.mentors.map((m) => mentorStatus(m, farmer))).toEqual(['current', 'locked']);
    expect(farm.mentors.map((m) => mentorStatus(m, null))).toEqual(['open', 'locked']);
    // Thầy đang theo học lên đầu, rồi người xin được, rồi người bị khóa
    const ms = [{ id: 'n9' as NpcId, gift: 300, locked: 'lock.stranger' }, { id: 'n4' as NpcId, gift: 0, locked: null }, { id: 'n3' as NpcId, gift: 0, locked: null }];
    expect(sortMentors(ms, farmer).map((m) => m.id)).toEqual(['n3', 'n4', 'n9']);
    expect(sortMentors(ms, null).map((m) => m.id)).toEqual(['n4', 'n3', 'n9']);
  });

  it('vào nghề khác thì báo bỏ nghề cũ; cùng nghề qua thầy khác thì báo đổi thầy giữ bậc; chưa có nghề thì không báo', () => {
    expect(switchNote(soldier, null)).toBeNull();
    const n = switchNote(soldier, farmer)!;
    expect(t(n.key, n.params)).toBe('Đang làm Nông dân (Làm được). Vào nghề khác thì bỏ nghề này: mất bậc, thầy cũ phật lòng.');
    expect(switchNote(farm, farmer)!.key).toBe('ui.careers.same_mentor');
    expect(switchNote(drifter, { ...farmer, id: 'drifter' })).toBeNull();
  });

  it('rời nghề mất gì: bậc, số năm, lòng thầy còn sống, thế lực nhận mình; ra băng chuộc tội hay trốn', () => {
    const text = (c: CareerView, fs: FactionView[] = []) => leaveLosses(c, fs).map((l) => t(l.key, l.params));
    expect(text(farmer)).toEqual(['Mất bậc Làm được; quay lại phải học việc từ đầu.', '4 năm làm nghề ghi vào tổng kết đời.', 'Thầy Phan Tuấn phật lòng.']);
    expect(text({ ...farmer, years: 0, mentor: { ...farmer.mentor!, alive: false } })).toHaveLength(1);
    const gov: FactionView = { ...guild, id: 'f1', kind: 'government', name: { key: 'faction.government.name', params: { place: 'Vị Kinh' } } };
    const office = text({ id: 'soldier', rank: 'apprentice', since: 0, faction: 'f1', years: 0, leave: { angers: 'f1' } }, [gov]);
    expect(office[1]).toBe(`${t('faction.government.name', { place: 'Vị Kinh' })} phật lòng.`);
    expect(office[1]).not.toContain('{');
    const band = (way: 'atone' | 'desert') => text({ id: 'outlaw', rank: 'apprentice', since: 0, faction: 'f9', years: 0, leave: { outlaw: { way, fee: 1000 } } })[1];
    expect(band('atone')).toContain('1000 văn chuộc tội');
    expect(band('desert')).toContain('phải trốn');
  });

  it('mọi chuỗi F2 có trong nội dung', () => {
    for (const w of ['mentor', 'faction', 'own', 'event']) expect(hasKey(`ui.careers.way.${w}`), w).toBe(true);
    for (const c of ['soldier', 'drifter', 'recluse', 'outlaw']) expect(hasKey(`ui.careers.how.${c}`), c).toBe(true);
    for (const k of ['ui.careers.open', 'ui.careers.title', 'ui.careers.title_han', 'ui.careers.hint', 'ui.careers.how.mentor', 'ui.careers.current', 'ui.careers.studying', 'ui.careers.gift', 'ui.careers.no_gift',
      'ui.careers.pick', 'ui.careers.busy', 'lock.no_mentor_here', 'ui.leave.open', 'ui.leave.title', 'ui.leave.lose', 'ui.leave.confirm', 'ui.leave.cancel']) expect(hasKey(k), k).toBe(true);
  });
});

describe('xếp việc vào nghề vào kế hoạch (v0.7 F2, sửa ở F3)', () => {
  it('ô khác còn học thầy cũ thì học tiếp với thầy mới (khỏi đổi thầy qua lại mỗi tháng); việc vào nghề khác thì nghỉ; việc thường giữ nguyên', () => {
    const plan = { slots: [{ action: 'action.apprentice', person: 'n3' }, { action: 'action.farm' }, { action: 'action.apprentice', person: 'n3' }] } as MonthPlan;
    expect(placeEntry(plan, 1, { action: 'action.apprentice', person: 'n9' as NpcId }).slots.map((s) => s.person ?? s.action)).toEqual(['n9', 'n9', 'n9']);
    expect(placeEntry(plan, 0, { action: 'action.apprentice', person: 'n9' as NpcId }).slots[1]).toEqual({ action: 'action.farm' });
    expect(placeEntry(plan, 1, { action: 'action.enlist' }).slots.map((s) => s.action)).toEqual(['action.rest', 'action.enlist', 'action.rest']);
    // Học tiếp với chính thầy đang học: không đụng ô khác
    const same = placeEntry(plan, 1, { action: 'action.apprentice', person: 'n3' as NpcId });
    expect(same.slots.map((s) => s.person ?? s.action)).toEqual(['n3', 'n3', 'n3']);
    expect(plan.slots[1]).toEqual({ action: 'action.farm' });
  });
});
