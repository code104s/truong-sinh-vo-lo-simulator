// Đường tu (v0.8 F1): cảnh giới trên thanh trạng thái, khối Đạo ở hồ sơ. F2: ô tu luyện, đột phá, hỏi lại trước khi đột phá.
import { hasKey, t } from '@tsvl/content';
import { CHANCE_BANDS, MIND_BANDS, QI_BANDS, QI_PLACE_BANDS, REALMS, ROOT_BANDS, SITE_KINDS, type CultivationView, type FactionView, type LogEntry, type TrialNews } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import {
  breakthroughAsk, breakthroughOutcome, cultivationNote, daoBlock, dutyLines, lastBreakthroughTick, needsConfirm, newBreakthrough, REALM_SEAL, realmClass, realmLine, trialBanner,
} from '../src/app/cultivation';

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

  it('F2: ô tu luyện ghi linh khí nơi này; ô đột phá ghi cơ hội; việc khác, hay chưa có đường tu, không ghi', () => {
    const cv: CultivationView = { realm: 'mortal', root: 'fair', path: 'rogue', qi: 'peak', place: 'rich', breakthrough: { chance: 'even', mind: 'steady', stones: 0 } };
    const line = (id: string, c: CultivationView) => { const n = cultivationNote(id, c); return n && t(n.key, n.params); };
    expect(line('action.cultivate', cv)).toBe('Linh khí nơi này dồi dào');
    expect(line('action.breakthrough', cv)).toBe('Cơ hội thành: năm ăn năm thua');
    expect(line('action.farm', cv)).toBeNull();
    expect(line('action.cultivate', mortal)).toBeNull();
    expect(line('action.breakthrough', { ...cv, breakthrough: undefined })).toBeNull();
  });

  it('F2: chỉ đột phá làm được mới hỏi lại; hộp hỏi ghi cơ hội, tâm cảnh, linh thạch, được gì, mất gì', () => {
    expect(needsConfirm('action.breakthrough', null)).toBe(true);
    expect(needsConfirm('action.breakthrough', 'lock.unsettled')).toBe(false);
    expect(needsConfirm('action.cultivate', null)).toBe(false);
    const a = breakthroughAsk({ chance: 'doubtful', mind: 'troubled', stones: 3 });
    expect([t(a.chance), t(a.mind), t(a.stones.key, a.stones.params)]).toEqual(['khó thành', 'Tâm rối', 'Dùng 3 khối linh thạch, mất hết dù thành hay hỏng.']);
    expect(a.mindWarn).toBe(true);
    expect(a.losses.map((k) => t(k))).toEqual(['linh khí chỉ còn một nửa;', 'thương kinh mạch, ốm dài, khỏi mới tu tiếp được;', 'tâm cảnh chấn động một năm, chưa thử lại được;', 'hỏng nặng thì tổn thọ.']);
    const calm = breakthroughAsk({ chance: 'likely', mind: 'calm', stones: 0 });
    expect(calm.mindWarn).toBe(false);
    expect(t(calm.stones.key)).toBe('Không có linh thạch đỡ, cơ hội thấp hơn.');
  });

  it('F2: mọi dải linh khí nơi ở, cơ hội, tâm cảnh và chữ hộp hỏi có chuỗi', () => {
    for (const id of [...QI_PLACE_BANDS.map((b) => `qi_place.${b}`), ...CHANCE_BANDS.map((b) => `chance.${b}`), ...MIND_BANDS.map((b) => `mind.${b}`),
      'ui.bt.title', 'ui.bt.intro', 'ui.bt.chance', 'ui.bt.mind', 'ui.bt.mind_warn', 'ui.bt.win', 'ui.bt.lose', 'ui.bt.confirm', 'ui.bt.cancel']) expect(hasKey(id), id).toBe(true);
  });
});

const entry = (tick: number, key: string): LogEntry => ({ tick, key, params: {}, importance: 'major' });

describe('cảnh đột phá có dựng, vào tầng một (v0.8 F2 bổ sung)', () => {
  it('chỉ ba dòng kết quả đột phá được dựng cảnh', () => {
    expect(breakthroughOutcome(entry(5, 'log.breakthrough.ok'))).toBe('ok');
    expect(breakthroughOutcome(entry(5, 'log.breakthrough.failed'))).toBe('failed');
    expect(breakthroughOutcome(entry(5, 'log.breakthrough.severe'))).toBe('severe');
    expect(breakthroughOutcome(entry(5, 'log.breakthrough.other'))).toBeNull();
    expect(breakthroughOutcome(entry(5, 'log.illness.onset'))).toBeNull();
  });

  it('mở save thì nhớ lần đột phá cũ, không dựng lại; chỉ lần mới sau tick đó mới dựng', () => {
    const old = [entry(3, 'log.breakthrough.failed'), entry(4, 'log.illness.onset')];
    expect(lastBreakthroughTick([])).toBe(-1);
    expect(lastBreakthroughTick(old)).toBe(3);
    expect(newBreakthrough(old, lastBreakthroughTick(old))).toBeNull();
    const next = [...old, entry(9, 'log.breakthrough.ok'), entry(9, 'log.family.birth')];
    expect(newBreakthrough(next, 3)).toEqual({ entry: next[2], outcome: 'ok' });
    expect(newBreakthrough(next, 9)).toBeNull();
  });

  it('biên niên bị cắt đầu (LOG_LIMIT) vẫn nhận ra lần mới theo tick, không theo độ dài', () => {
    const cut = [entry(10, 'log.illness.onset'), entry(12, 'log.breakthrough.severe')];
    expect(newBreakthrough(cut, 3)?.outcome).toBe('severe');
  });

  it('giao diện đổi màu mực và triện khi đã vào tầng một; người phàm giữ nguyên', () => {
    expect(realmClass(mortal)).toBe('');
    expect(realmClass({ realm: 'qi1', root: 'fair', path: 'rogue', qi: 'low' })).toBe(' realm-qi1');
    for (const r of REALMS) if (r !== 'mortal') expect(REALM_SEAL[r], r).toBeTruthy();
  });

  it('chữ của cảnh đột phá có chuỗi', () => {
    for (const id of ['ui.bt.scene_gather', 'ui.bt.scene_ok', 'ui.bt.scene_failed', 'ui.bt.scene_severe', 'ui.bt.scene_close', 'log.breakthrough.ok', 'log.breakthrough.failed', 'log.breakthrough.severe'])
      expect(hasKey(id), id).toBe(true);
  });
});

describe('ngưỡng cửa: tin kỳ tuyển, chốn đã biết (v0.8 F3)', () => {
  const news: TrialNews = { sect: 'sect.name.4', place: 'Khê Kinh', county: 4, open: false, eligible: true };
  it('dải kỳ tuyển: báo trước từ tháng Giêng, chỉ đường tới nơi tuyển; đang ở đó tháng Ba thì bảo xếp "Dự tuyển"', () => {
    const soon = trialBanner(news, true, 1)!;
    expect(t(soon.key, soon.params)).toBe('Bích Lạc Tông sẽ xuống Khê Kinh chọn trẻ có căn cơ vào tháng Ba năm nay.');
    expect(t(soon.hint.key, soon.hint.params)).toBe('Tháng Ba có mặt ở Khê Kinh, xếp "Dự tuyển" vào một tuần.');
    expect(soon.toMap).toBe(true);
    const here = trialBanner({ ...news, open: true }, true, 4)!;
    expect(t(here.key, here.params)).toContain('đang ở Khê Kinh');
    expect(here.hint.key).toBe('ui.trial.here');
    expect(here.toMap).toBe(false);
  });

  it('không hiện khi không dự được, chưa tự xếp việc, hay không có kỳ tuyển', () => {
    expect(trialBanner(undefined, true, 4)).toBeNull();
    expect(trialBanner({ ...news, eligible: false }, true, 4)).toBeNull();
    expect(trialBanner(news, false, 4)).toBeNull();
  });

  it('chữ của chốn, kỳ tuyển, sự kiện đường tiên có chuỗi', () => {
    for (const k of SITE_KINDS) for (const id of [`site.${k}`, `site.${k}_note`]) expect(hasKey(id), id).toBe(true);
    for (const id of ['ui.trial.soon', 'ui.trial.open', 'ui.trial.go', 'ui.trial.here', 'ui.trial.to_map', 'ui.event.dao', 'log.sect.known_taken', 'log.sect.neighbor_taken'])
      expect(hasKey(id), id).toBe(true);
  });
});

