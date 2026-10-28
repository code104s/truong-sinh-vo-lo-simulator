// Khối "Người trong quận" (v0.4 F1): thứ tự, gập danh sách, sắc sức khỏe, chân dung cố định theo người.
// Khối "Người thân, người quen" (v0.5 F1): thứ tự sim, vai, nhãn quan hệ.
import { hasKey, t } from '@tsvl/content';
import { birthplaceId, regionId, REPUTATION_BANDS, vNpcView, type NpcView } from '@tsvl/shared';
import { Life } from '@tsvl/sim';
import { describe, expect, it } from 'vitest';
import { CIRCLE_PREVIEW, circleRows, healthTone, kinKey, PEOPLE_PREVIEW, peopleRows, relationKeys, relationTone, reputationTone } from '../src/app/people';

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
      t('ui.people.none'), t('ui.people.less'), t('ui.people.gender'), t('ui.people.age_k'), t('ui.people.occupation'), t('ui.people.health'), t('ui.people.place')]) {
      expect(text).not.toMatch(MISSING);
    }
  });
});

describe('người thân, người quen (v0.5 F1)', () => {
  const bond = (b: Partial<NonNullable<NpcView['bond']>> = {}): NpcView['bond'] => ({ closeness: 'acquaintance', trust: 'neutral', hostility: 'none', owed: 'none', ...b });

  it('giữ thứ tự sim gửi; gập còn CIRCLE_PREVIEW người', () => {
    const xs = Array.from({ length: 9 }, (_, i) => person(i + 1, 30 + i));
    const { shown, hidden } = circleRows(xs, false);
    expect(shown.map((p) => p.id)).toEqual(xs.slice(0, CIRCLE_PREVIEW).map((p) => p.id));
    expect(hidden).toBe(9 - CIRCLE_PREVIEW);
    expect(circleRows(xs, true)).toMatchObject({ hidden: 0 });
  });

  it('vai: vợ/chồng gọi theo giới; người quen ghi dải thân thiết; thù, nợ ơn thêm sau, có sắc', () => {
    expect(kinKey({ kin: 'spouse', gender: 'female' })).toBe('kin.wife');
    expect(kinKey({ kin: 'spouse', gender: 'male' })).toBe('kin.husband');
    expect(kinKey({ kin: 'mother', gender: 'female' })).toBe('kin.mother');
    expect(kinKey({ gender: 'male' })).toBeNull();
    expect(relationKeys({ kin: 'father', gender: 'male', bond: bond({ closeness: 'close' }) })).toEqual(['kin.father']);
    expect(relationKeys({ gender: 'male', bond: bond({ closeness: 'friend', hostility: 'grudge', owed: 'i_owe' }) }))
      .toEqual(['bond.closeness.friend', 'bond.hostility.grudge', 'bond.owed.i_owe']);
    expect(relationKeys({ gender: 'male' })).toEqual([]);
    expect(['bond.closeness.friend', 'bond.hostility.enemy', 'bond.owed.i_owe', 'bond.owed.they_owe'].map(relationTone)).toEqual([null, 'bad', 'warn', null]);
  });

  it('người thật từ sim: cha mẹ đứng đầu, view hợp lệ, mọi chuỗi của khối dịch được', () => {
    const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
    const l = Life.create({ worldSeed: 'circle', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: 1 }, bp);
    const circle = l.circle();
    expect(circle.slice(0, 2).map((p) => p.kin)).toEqual(['father', 'mother']);
    const MISSING = /⟨|\{\w+\}/;
    for (const p of circle) {
      expect(vNpcView.check(p, '$')).toBeNull();
      for (const k of relationKeys(p)) expect(hasKey(k), k).toBe(true);
      if (p.bond) for (const k of [`bond.closeness.${p.bond.closeness}`, `bond.trust.${p.bond.trust}`, `bond.hostility.${p.bond.hostility}`, `bond.owed.${p.bond.owed}`]) expect(hasKey(k), k).toBe(true);
    }
    for (const k of ['kin.husband', 'kin.wife', 'kin.son', 'kin.daughter', 'kin.sibling']) expect(hasKey(k), k).toBe(true);
    for (const text of [t('ui.circle.title', { count: circle.length }), t('ui.circle.none'), t('ui.circle.away'), t('ui.circle.role'), t('ui.circle.closeness'),
      t('ui.circle.trust'), t('ui.circle.hostility'), t('ui.circle.owed'), t('ui.circle.no_bond')]) {
      expect(text).not.toMatch(MISSING);
    }
  });
});

describe('tiếng tăm trên thanh trạng thái (v0.5 F3)', () => {
  it('sắc theo dải; mọi dải và câu đầy đủ dịch được', () => {
    expect(REPUTATION_BANDS.map(reputationTone)).toEqual(['bad', 'warn', 'plain', 'good', 'good']);
    for (const b of REPUTATION_BANDS) expect(hasKey(`reputation.${b}`), b).toBe(true);
    expect(t('ui.hud.reputation', { place: 'Ký Ninh', band: t('reputation.respected') })).not.toMatch(/⟨|\{\w+\}/);
  });
});
