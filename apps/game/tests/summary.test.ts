import { hasKey, t } from '@tsvl/content';
import { birthplaceId, regionId, TICKS_PER_YEAR, type Birthplace, type CultivationRecord, type LogEntry } from '@tsvl/shared';
import { firstOpenChoice, Life } from '@tsvl/sim';
import { describe, expect, it } from 'vitest';
import { affairsRows, careerRows, daoMilestones, daoReachLine, daoSummary, departedPeople, eventOf, legacyRows, lifeCareer, turningPoints, type DaoReach } from '../src/app/summary';

const MISSING = /⟨|\{\w+\}/;

describe('màn tổng kết (F5)', () => {
  it('tách id sự kiện từ khóa kết quả; dòng khác không phải ngã rẽ', () => {
    expect(eventOf({ tick: 1, key: 'event.beggar.result.give', params: {}, importance: 'major' })).toBe('event.beggar');
    expect(eventOf({ tick: 1, key: 'log.hunger.starving', params: {}, importance: 'major' })).toBeNull();
    expect(eventOf({ tick: 1, key: 'event.cat.road', params: {}, importance: 'major' })).toBeNull();
  });

  it('20 đời thật: mỗi lựa chọn đã chọn là một ngã rẽ, có tựa và lời kể dịch được, đúng tuổi', () => {
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const bp: Birthplace = { id: birthplaceId('r0/c0'), name: 'Phố Kỳ', nameHan: '浦岐', kind: i % 2 ? 'town' : 'village', cell: { x: 0, y: 0 }, county: 0 };
      const life = Life.create({ worldSeed: 'summary', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: i }, bp);
      let chosen = 0;
      // Nghỉ cả đời thì chết đói sớm; xếp kế hoạch làm ruộng/làm thuê để đời đủ dài, gặp nhiều sự kiện
      while (life.alive) {
        if (life.view().canAct && !life.active) life.setPlan({ slots: [{ action: i % 2 ? 'action.hire' : 'action.farm' }, { action: 'action.forage' }, { action: 'action.rest' }] });
        const r = life.advance('month');
        if (r.status === 'event') { life.choose(r.pending.instance, firstOpenChoice(r.pending)); chosen++; }
      }
      const s = life.summary();
      const turns = turningPoints(s.milestones, s.birthTick);
      expect(turns).toHaveLength(chosen);
      for (const p of turns) {
        expect(t(`${p.eventId}.title`, p.entry.params), p.eventId).not.toMatch(MISSING);
        expect(p.age).toBe(Math.floor((p.entry.tick - s.birthTick) / 36));
      }
      expect(s.estate.money).toBe(life.character.household.money);
      total += turns.length;
    }
    expect(total).toBeGreaterThan(20);
  });
});

describe('những người đã đi trước (v0.4 F4)', () => {
  it('chỉ người quen mất (tin mất là mốc lớn), kèm tuổi người ấy và tuổi người chơi lúc đó; lời kể dịch được', () => {
    const ms: LogEntry[] = [
      { tick: 0, key: 'log.birth', params: { birthplace: 'Làng', background: 'background.commoner' }, importance: 'major' },
      { tick: 400, key: 'log.npc.death', params: { name: 'Lý An', age: 61, cause: 'death.old_age' }, importance: 'major' },
      { tick: 500, key: 'log.npc.death', params: { name: 'Hàn Tú', age: 3, cause: 'death.illness' }, importance: 'minor' },
    ];
    const d = departedPeople(ms, 0);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ name: 'Lý An', age: 61, playerAge: 11 });
    expect(t(d[0]!.entry.key, d[0]!.entry.params)).toBe('Lý An mất năm 61 tuổi, vì già yếu.');
  });

  it('đời thật: có người quen mất trong tổng kết, lời kể dịch được', () => {
    let found = 0;
    for (let i = 0; i < 30 && found === 0; i++) {
      const bp: Birthplace = { id: birthplaceId('r0/c0'), name: 'Phố Kỳ', nameHan: '浦岐', kind: i % 2 ? 'town' : 'village', cell: { x: 0, y: 0 }, county: 0 };
      const life = Life.create({ worldSeed: 'departed', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: i }, bp);
      while (life.alive) {
        if (life.view().canAct && !life.active) life.setPlan({ slots: [{ action: i % 2 ? 'action.hire' : 'action.farm' }, { action: 'action.forage' }, { action: 'action.rest' }] });
        const r = life.advance('month');
        if (r.status === 'event') life.choose(r.pending.instance, firstOpenChoice(r.pending));
      }
      const s = life.summary();
      const d = departedPeople(s.milestones, s.birthTick);
      for (const x of d) expect(t(x.entry.key, x.entry.params)).not.toMatch(MISSING);
      found += d.length;
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('di sản (v0.5 F4)', () => {
  const base = { spouse: null, children: [], friends: 0, enemies: 0, reputation: 'unknown' as const, factions: [], careers: [], cultivation: { root: null, realm: 'mortal' as const, path: null, breakthroughs: [] } };
  const text = (r: ReturnType<typeof legacyRows>[number]) => t(r.value, r.params);

  it('vợ/chồng gọi theo giới người chơi; đã mất thì ghi; chưa cưới thì "Không lập gia đình"', () => {
    expect(legacyRows({ ...base, spouse: { name: 'Lý Thị Hoa', alive: true } }, 'male')[0]).toMatchObject({ label: 'ui.summary.wife' });
    expect(text(legacyRows({ ...base, spouse: { name: 'Lý Thị Hoa', alive: false } }, 'male')[0]!)).toBe('Lý Thị Hoa (đã mất)');
    expect(legacyRows({ ...base, spouse: { name: 'Trần An', alive: true } }, 'female')[0]).toMatchObject({ label: 'ui.summary.husband' });
    expect(text(legacyRows(base, null)[0]!)).toBe('Không lập gia đình');
  });

  it('con cái: còn sống trên tổng số, tên người còn sống; bạn, kẻ thù, tiếng tăm có sắc', () => {
    const rows = legacyRows({ ...base, children: [{ name: 'An', alive: true }, { name: 'Bình', alive: false }, { name: 'Chi', alive: true }], friends: 3, enemies: 1, reputation: 'respected' }, 'male');
    expect(text(rows[1]!)).toBe('2 còn sống / 3 người');
    expect(rows[1]!.note).toBe('An, Chi');
    expect(rows.slice(2).map((r) => [text(r), r.tone ?? null])).toEqual([['3 người', null], ['1 người', 'bad'], [t('reputation.respected'), 'good']]);
    expect(text(legacyRows(base, 'male')[1]!)).toBe('Không có con');
  });

  it('người thân mất cũng là người đã đi trước', () => {
    const ms: LogEntry[] = [{ tick: 700, key: 'log.kin.death', params: { role: 'kin.mother', name: 'La Thị Thục', age: 58, cause: 'death.illness' }, importance: 'major' }];
    expect(departedPeople(ms, 0)).toMatchObject([{ name: 'La Thị Thục', age: 58, playerAge: 19 }]);
    expect(t(ms[0]!.key, ms[0]!.params)).not.toMatch(MISSING);
  });

  it('đời thật: mọi dòng di sản dịch được', () => {
    const bp: Birthplace = { id: birthplaceId('r0/c0'), name: 'Phố Kỳ', nameHan: '浦岐', kind: 'village', cell: { x: 0, y: 0 }, county: 0 };
    const life = Life.create({ worldSeed: 'legacy', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: 1 }, bp);
    while (life.alive) {
      if (life.view().canAct && !life.active) life.setPlan({ slots: [{ action: 'action.farm' }, { action: 'action.forage' }, { action: 'action.rest' }] });
      const r = life.advance('month');
      if (r.status === 'event') life.choose(r.pending.instance, firstOpenChoice(r.pending));
    }
    const s = life.summary();
    for (const r of legacyRows(s.legacy, life.view().gender)) {
      expect(t(r.label), r.label).not.toMatch(MISSING);
      expect(text(r), r.value).not.toMatch(MISSING);
    }
  });
});

describe('thế sự một đời (v0.6 F4)', () => {
  it('xếp theo số phận: tan rã, thịnh lên, suy đi, vẫn đứng; cùng số phận theo thứ tự thấy; đủ chữ', async () => {
    const { hasKey } = await import('@tsvl/content');
    const f = (kind: 'government' | 'clan' | 'guild' | 'bandits', fate: 'rose' | 'fell' | 'gone' | 'endured', place: string) => ({ name: { key: `faction.${kind}.name`, params: { place, surname: 'Lương' } }, kind, fate });
    const rows = affairsRows([f('government', 'endured', 'A'), f('bandits', 'gone', 'B'), f('clan', 'rose', 'C'), f('guild', 'gone', 'D'), f('clan', 'fell', 'E')]);
    expect(rows.map((r) => r.name.params.place)).toEqual(['B', 'D', 'C', 'E', 'A']);
    for (const k of ['ui.summary.affairs', 'ui.summary.affairs_count', 'ui.summary.affairs_none', 'faction.fate.rose', 'faction.fate.fell', 'faction.fate.gone', 'faction.fate.endured']) expect(hasKey(k), k).toBe(true);
  });
});

describe('một đời làm nghề (v0.7 F4)', () => {
  it('gộp các lần vào cùng nghề: bậc cao nhất, cộng năm, đếm số lần; nghề làm tới cuối đời ghi riêng; theo thứ tự vào nghề lần đầu', () => {
    const rows = careerRows([
      { id: 'farmer', rank: 'journeyman', years: 6 }, { id: 'hunter', rank: 'apprentice', years: 1 },
      { id: 'farmer', rank: 'apprentice', years: 2 }, { id: 'merchant', rank: 'master', years: 8, current: true },
    ]);
    expect(rows).toEqual([
      { id: 'farmer', rank: 'journeyman', years: 8, stints: 2, current: false },
      { id: 'hunter', rank: 'apprentice', years: 1, stints: 1, current: false },
      { id: 'merchant', rank: 'master', years: 8, stints: 1, current: true },
    ]);
    // Bằng năm thì nghề làm tới cuối đời
    expect(lifeCareer(rows)!.id).toBe('merchant');
    expect(lifeCareer(careerRows([{ id: 'farmer', rank: 'master', years: 30 }, { id: 'drifter', rank: 'apprentice', years: 2, current: true }]))!.id).toBe('farmer');
    expect(lifeCareer([])).toBeNull();
  });

  it('chuỗi hiển thị có đủ', () => {
    for (const k of ['ui.summary.careers', 'ui.summary.careers_none', 'ui.summary.career_rank', 'ui.summary.career_years', 'ui.summary.career_short', 'ui.summary.career_stints', 'ui.summary.career_current']) expect(hasKey(k), k).toBe(true);
    expect(t('ui.summary.career_rank', { rank: 'career.rank.master' })).toBe('Bậc cao nhất: Có tiếng');
  });
});

describe('đường tu trong màn tổng kết (v0.8 F4)', () => {
  const Y = TICKS_PER_YEAR;
  const rec = (r: Partial<CultivationRecord>): CultivationRecord => ({ root: null, realm: 'mortal', path: null, breakthroughs: [], ...r });
  it('chạm tới đâu: chưa kiểm, không có linh căn, có mà không bước vào, đã dẫn khí, đã phá cảnh', () => {
    const cases: [Partial<CultivationRecord>, DaoReach][] = [
      [{}, 'untested'], [{ root: 'none' }, 'no_root'], [{ root: 'good' }, 'outside'],
      [{ root: 'mixed', path: 'rogue', breakthroughs: [{ at: 20 * Y, ok: false }] }, 'entered'],
      [{ root: 'fair', path: 'sect', realm: 'qi1', entered: 19 * Y + 4, breakthroughs: [{ at: 17 * Y, ok: false }, { at: 19 * Y + 4, ok: true }] }, 'risen'],
    ];
    expect(cases.map(([r]) => daoSummary(rec(r), 0).reach)).toEqual(cases.map(([, x]) => x));
    for (const [r] of cases) expect(hasKey(daoReachLine(daoSummary(rec(r), 0)).key)).toBe(true);
  });

  it('đã phá cảnh: cảnh giới, tuổi dẫn khí, các lần đột phá theo tuổi; chưa kiểm thì ghi chưa từng được kiểm, chưa bước vào', () => {
    const d = daoSummary(rec({ root: 'fair', path: 'sect', realm: 'qi1', entered: 19 * Y + 4, breakthroughs: [{ at: 17 * Y, ok: false }, { at: 19 * Y + 4, ok: true }] }), 0);
    expect(d).toMatchObject({ root: 'root.fair', path: 'cultivation.path.sect', realm: 'qi1', enteredAge: 19, attempts: [{ age: 17, ok: false }, { age: 19, ok: true }] });
    const line = daoReachLine(d);
    expect(t(line.key, line.params)).toBe('Bước qua ngưỡng cửa: Luyện Khí tầng một từ năm 19 tuổi.');
    const none = daoSummary(rec({}), 0);
    expect([t(none.root), t(none.path), none.enteredAge, none.attempts]).toEqual(['Chưa từng được kiểm', 'Chưa bước vào', null, []]);
    expect(t('ui.summary.dao_breaks_count', { count: 2, ok: 1, failed: 1 })).toBe('2 lần: 1 thành, 1 hỏng');
  });

  it('tab "Đạo": chỉ mốc đường tiên của chính mình trong những mốc lớn, giữ thứ tự', () => {
    const at = (tick: number, key: string): LogEntry => ({ tick, key, params: {}, importance: 'major' });
    const ms = [at(1, 'log.birth'), at(2, 'log.sect.joined'), at(3, 'event.seek_cave.result.enter'), at(4, 'log.kin.death'), at(5, 'log.breakthrough.ok'), at(6, 'log.sect.rumor')];
    // Tin kỳ tuyển ba năm một lần là tin chung, lặp suốt đời: không vào tab
    expect(daoMilestones(ms).map((e) => e.tick)).toEqual([2, 3, 5]);
    for (const id of ['ui.summary.dao', 'ui.summary.dao_tab', 'ui.summary.dao_none', 'ui.summary.dao_breaks', 'ui.summary.dao_breaks_none', 'ui.summary.dao_attempt_ok', 'ui.summary.dao_attempt_failed'])
      expect(hasKey(id), id).toBe(true);
  });

  it('chơi thật: tổng kết một đời mang khối đường tu khớp bản ghi của sim', () => {
    const bp: Birthplace = { id: birthplaceId('r0/c0'), name: 'Phố Kỳ', nameHan: '浦岐', kind: 'village', cell: { x: 0, y: 0 }, county: 0 };
    const life = Life.create({ worldSeed: 'f4', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: 2 }, bp);
    life.runToDeath(200 * Y, firstOpenChoice);
    const sum = life.summary();
    const d = daoSummary(sum.legacy.cultivation, sum.birthTick);
    expect(d.attempts).toHaveLength(sum.legacy.cultivation.breakthroughs.length);
    expect(d.realm).toBe(sum.legacy.cultivation.realm);
  }, 60_000);
});

