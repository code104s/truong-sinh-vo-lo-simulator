// Khối "Người trong quận" (v0.4 F1): thứ tự, gập danh sách, sắc sức khỏe, chân dung cố định theo người.
import { hasKey, t } from '@tsvl/content';
import { birthplaceId, regionId, vNpcView, type NpcView } from '@tsvl/shared';
import { Life } from '@tsvl/sim';
import { describe, expect, it } from 'vitest';
import { healthTone, PEOPLE_PREVIEW, peopleRows } from '../src/app/people';

const person = (id: number, ageYears: number): NpcView => ({
  id: `n${id}` as NpcView['id'], name: `Người ${id}`, gender: 'male', ageYears, occupation: 'occupation.farmer', healthBand: 'healthy',
  portrait: { ageBand: ageYears < 16 ? 'child' : 'adult', class: 'common', key: `n${id}` },
});

describe('người trong quận (F1)', () => {
  it('già trước trẻ, cùng tuổi theo id; gập còn PEOPLE_PREVIEW người', () => {
    const xs = [person(3, 20), person(1, 70), person(2, 20), ...Array.from({ length: 10 }, (_, i) => person(10 + i, 5))];
    const { shown, hidden } = peopleRows(xs, false);
    expect(shown.map((p) => p.id).slice(0, 3)).toEqual(['n1', 'n2', 'n3']);
    expect(shown).toHaveLength(PEOPLE_PREVIEW);
    expect(hidden).toBe(xs.length - PEOPLE_PREVIEW);
    expect(peopleRows(xs, true)).toMatchObject({ hidden: 0 });
    expect(peopleRows(xs, true).shown).toHaveLength(xs.length);
    expect(peopleRows(xs.slice(0, 3), false)).toMatchObject({ hidden: 0 });
  });

  it('sắc sức khỏe theo dải', () => {
    expect(['robust', 'healthy', 'weak', 'ill', 'dying'].map((b) => healthTone(b as NpcView['healthBand']))).toEqual(['good', 'good', 'warn', 'bad', 'bad']);
  });

  it('người thật từ sim: view hợp lệ, mọi chuỗi của khối dịch được', () => {
    const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
    const l = Life.create({ worldSeed: 'people', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: 1 }, bp);
    const people = l.people();
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) {
      expect(vNpcView.check(p, '$')).toBeNull();
      for (const id of [p.occupation, `health.${p.healthBand}`, `gender.${p.gender}`]) expect(hasKey(id), id).toBe(true);
    }
    const MISSING = /⟨|\{\w+\}/;
    for (const text of [t('ui.people.title', { place: 'Làng', count: people.length }), t('ui.people.age', { age: 3 }), t('ui.people.more', { count: 12 }), t('ui.people.view', { name: 'A' }),
      t('ui.people.none'), t('ui.people.less'), t('ui.people.gender'), t('ui.people.age_k'), t('ui.people.occupation'), t('ui.people.health'), t('ui.people.place'), t('ui.people.no_interaction')]) {
      expect(text).not.toMatch(MISSING);
    }
  });
});
