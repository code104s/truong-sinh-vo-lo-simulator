// Đường tu (v0.8 F1): cảnh giới trên thanh trạng thái, khối Đạo ở hồ sơ.
import { hasKey, t } from '@tsvl/content';
import { QI_BANDS, REALMS, ROOT_BANDS, type CultivationView, type FactionView } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { daoBlock, dutyLines, realmLine } from '../src/app/cultivation';

const mortal: CultivationView = { realm: 'mortal', root: null, path: null, qi: null };
const sect: FactionView = { id: 'f9', kind: 'sect', name: { key: 'faction.sect.name', params: { name: 'Thanh Vân' } }, seat: 2, counties: [], strength: 'modest', members: 0 };
const duty = { weeks: 2, need: 6, missed: 0, expelAt: 2, fee: 600 };

describe('đường tu (v0.8 F1)', () => {
  it('thanh trạng thái: người phàm không ghi gì; vào tầng một thì ghi cảnh giới', () => {
    expect(realmLine(mortal)).toBeNull();
    expect(realmLine({ ...mortal, path: 'sect', qi: 'half' })).toBeNull();
    expect(t(`realm.${realmLine({ realm: 'qi1', root: 'fair', path: 'rogue', qi: 'low' })}`)).toBe('Luyện Khí tầng một');
  });

  it('khối Đạo: chưa kiểm thì ghi "chưa từng được kiểm", chưa có đường tu thì không có dòng đường, linh khí', () => {
    const b = daoBlock(mortal, [sect]);
    expect(t(b.root)).toBe('Chưa từng được kiểm');
    expect(b).toMatchObject({ path: null, sect: null, qi: null, expelled: false, ceiling: false, duty: [] });
    expect(t(daoBlock({ ...mortal, root: 'none' }, []).root)).toBe('Không có linh căn');
  });

  it('đệ tử ký danh: tên tông môn, dải linh khí, nghĩa vụ năm nay; bị gạch tên thì không còn tên tông môn', () => {
    const b = daoBlock({ realm: 'mortal', root: 'good', path: 'sect', qi: 'half', duty }, [sect]);
    expect(t(b.sect!.key, b.sect!.params)).toBe('Thanh Vân Tông');
    expect(t(b.qi!)).toBe('Được nửa chừng');
    expect(b.duty.map((d) => t(d.key, d.params))).toEqual(['Tạp dịch năm nay 2/6 tuần', 'Thiếu tuần thì cuối năm nộp 600 văn thay.']);
    const out = daoBlock({ realm: 'qi1', root: 'good', path: 'sect', qi: 'low' }, [sect]);
    expect(out).toMatchObject({ sect: null, expelled: true, duty: [] });
    // Tán tu không có tông môn, không có nghĩa vụ
    expect(daoBlock({ realm: 'mortal', root: 'mixed', path: 'rogue', qi: 'empty' }, [sect])).toMatchObject({ sect: null, expelled: false, duty: [] });
  });

  it('nghĩa vụ: đủ tuần thì báo đủ; bỏ năm nào thì nhắc mức bị gạch tên', () => {
    expect(dutyLines({ ...duty, weeks: 6 }).map((d) => [t(d.key, d.params), d.tone])).toEqual([['Tạp dịch năm nay đã đủ (6/6 tuần)', 'good']]);
    const missed = dutyLines({ ...duty, missed: 1 });
    expect(missed.at(-1)!.tone).toBe('bad');
    expect(t(missed.at(-1)!.key, missed.at(-1)!.params)).toBe('Đã bỏ nghĩa vụ 1 năm liền; 2 năm liền thì bị gạch tên.');
  });

  it('đỉnh tầng một là trần v0.8: ghi "chưa tới lúc"', () => {
    expect(daoBlock({ realm: 'qi1', root: 'fair', path: 'rogue', qi: 'peak' }, []).ceiling).toBe(true);
    expect(daoBlock({ realm: 'mortal', root: 'fair', path: 'rogue', qi: 'peak' }, []).ceiling).toBe(false);
  });

  it('mọi khóa khối Đạo có chuỗi', () => {
    for (const id of [...REALMS.map((r) => `realm.${r}`), ...ROOT_BANDS.map((r) => `root.${r}`), ...QI_BANDS.map((q) => `qi.${q}`),
      'ui.dao.title', 'ui.dao.root', 'ui.dao.root_unknown', 'ui.dao.path', 'ui.dao.realm', 'ui.dao.qi', 'ui.dao.expelled', 'ui.dao.ceiling', 'ui.dao.duty']) expect(hasKey(id), id).toBe(true);
  });
});
