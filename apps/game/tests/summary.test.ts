import { t } from '@tsvl/content';
import { birthplaceId, regionId, type Birthplace, type LogEntry } from '@tsvl/shared';
import { firstOpenChoice, Life } from '@tsvl/sim';
import { describe, expect, it } from 'vitest';
import { departedPeople, eventOf, turningPoints } from '../src/app/summary';

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
