// Mọi khóa nội dung mà sim sinh ra đều có chuỗi tiếng Việt (kiểm tra bằng 300 đời thật, không liệt kê tay).
import { hasKey, t } from '@tsvl/content';
import { calendarOf, birthplaceId, regionId, type Birthplace, type SettlementKind } from '@tsvl/shared';
import { Life } from '@tsvl/sim';
import { describe, expect, it } from 'vitest';
import { dateText, logText } from '../src/app/format';

const MISSING = /⟨|\{\w+\}/;

describe('chuỗi nội dung phủ hết đầu ra của sim', () => {
  it('300 đời: mọi câu nhật ký, mọi trường view, mọi tổng kết đều dịch được', () => {
    const kinds: SettlementKind[] = ['village', 'town', 'city'];
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const bp: Birthplace = { id: birthplaceId(`r0/c${i % 5}`), name: 'Phố Kỳ', nameHan: '浦岐', kind: kinds[i % 3]!, cell: { x: 0, y: 0 }, county: 0 };
      const life = Life.create({ worldSeed: 'content', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: i }, bp);
      while (life.alive) {
        life.advance('year');
        const v = life.view();
        for (const id of [v.background, v.personality, v.constitution, v.aptitude, `health.${v.healthBand}`, `gender.${v.gender}`, ...v.traits, ...v.conditions.map((c) => c.id), ...v.conditions.map((c) => `severity.${c.severity}`)]) {
          expect(hasKey(id), id).toBe(true);
        }
      }
      for (const e of life.log) {
        seen.add(e.key);
        const text = logText(e);
        expect(text, `${e.key} ${JSON.stringify(e.params)}`).not.toMatch(MISSING);
      }
      const s = life.summary();
      expect(hasKey(`death.${s.cause}`)).toBe(true);
      expect(hasKey(s.causeDetail), s.causeDetail).toBe(true);
    }
    expect([...seen].sort()).toEqual(expect.arrayContaining(['log.birth', 'log.death', 'log.illness.onset', 'log.illness.recovered', 'log.age.milestone']));
  });

  it('lịch đủ 12 tháng, 3 tuần, 4 mùa', () => {
    for (let tick = 0; tick < 36; tick++) {
      const d = calendarOf(tick);
      expect(dateText(d)).not.toMatch(MISSING);
      expect(t(`season.${d.season}`)).not.toMatch(MISSING);
    }
  });

  it('khóa thiếu thì hiện rõ chứ không im lặng', () => {
    expect(t('khong.co.khoa')).toBe('⟨khong.co.khoa⟩');
    expect(t('log.age.milestone', { age: 15 })).toBe('Tròn 15 tuổi.');
    expect(t('log.illness.onset', { age: 3, illness: 'illness.cold' })).toBe('3 tuổi, mắc cảm hàn.');
  });
});
