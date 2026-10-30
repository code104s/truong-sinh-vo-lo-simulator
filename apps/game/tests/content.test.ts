// Khóa nội dung chưa sim nào sinh ra, lịch, khóa thiếu. Phần kiểm bằng 300 đời thật ở content-lives-*.test.ts.
import { hasKey, t } from '@tsvl/content';
import { calendarOf, CAREER_RANKS, CAREERS, CULTIVATION_PATHS, QI_BANDS, REALMS, ROOT_BANDS } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { dateText } from '../src/app/format';
import { MISSING } from './contentLives';

describe('chuỗi nội dung phủ hết đầu ra của sim', () => {
  it('nghề, bậc nghề, y thuật có chuỗi (v0.7, chưa sim nào sinh ra trước S1)', () => {
    for (const id of [...CAREERS.map((c) => `career.${c}`), ...CAREER_RANKS.map((r) => `career.rank.${r}`), 'skill.medicine']) expect(hasKey(id), id).toBe(true);
  });

  it('cảnh giới, linh căn, đường tu, linh khí, tông môn có chuỗi (v0.8 Bước 0, chưa sim nào sinh ra trước S1)', () => {
    for (const id of [...REALMS.map((r) => `realm.${r}`), ...ROOT_BANDS.map((r) => `root.${r}`), ...CULTIVATION_PATHS.map((p) => `cultivation.path.${p}`), ...QI_BANDS.map((q) => `qi.${q}`),
      'faction.kind.sect', 'faction.sect.name']) expect(hasKey(id), id).toBe(true);
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
