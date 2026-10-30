// Người chơi máy tìm đạo và tiêu chí tìm đạo (v0.8 S7, ADR 0022 mục 6).
import { describe, expect, it } from 'vitest';
import type { CultivationView, FactionView, PendingEvent } from '@tsvl/shared';
import { seekerFacets, type PolicyReport } from '../src/batch';
import { isSeeker, SEEKERS, seekerChoose, seekerPlan } from '../src/seekers';
import type { PolicyContext } from '../src/policies';
import { sampleCharacter, sampleMarket } from '../../../packages/shared/tests/fixtures';

const SEAT = 2, PEAK = 3;
const sect = { kind: 'sect', seat: SEAT } as FactionView;
/** Người 14 tuổi ở nhà (quận 0, làng, không phải núi), đủ ăn; `open`: các việc không khóa. */
function context(o: { age?: number; year?: number; month?: number; tenDay?: 0 | 1 | 2; location?: number; cult?: Partial<CultivationView>; open?: string[]; locked?: Record<string, string> } = {}): PolicyContext {
  const open = ['action.rest', 'action.farm', 'action.travel', 'action.hunt', ...(o.open ?? [])];
  return {
    character: {
      ...sampleCharacter, canAct: true, healthPct: 100, ageYears: o.age ?? 14, location: o.location ?? 0, home: 0,
      household: { ...sampleCharacter.household, grain: 2_000, money: 5_000 },
      cultivation: { realm: 'mortal', root: null, path: null, qi: null, ...o.cult },
    },
    date: { tick: 0, year: o.year ?? 30, month: o.month ?? 1, tenDay: o.tenDay ?? 0, season: 'spring' },
    actions: [...open, ...Object.keys(o.locked ?? {})].map((id) => ({ id, group: 'rest', slots: 1, cost: { stamina: 'cost.low', risk: 'risk.low', money: 'money.none' }, gains: [], locked: o.locked?.[id] ?? null })),
    travel: [{ county: 0, slots: 1, risk: 'risk.low' }, { county: SEAT, slots: 2, risk: 'risk.low' }, { county: PEAK, slots: 2, risk: 'risk.low' }],
    settlements: ['village', 'village', 'city', 'village'], seed: 7, active: false, market: sampleMarket,
    factions: () => [sect], mountain: [false, false, false, true],
  };
}
const first = (c: PolicyContext, name: (typeof SEEKERS)[number]) => seekerPlan(name, c)?.slots[0];

describe('người chơi máy tìm đạo (S7)', () => {
  it('hai chiến lược; cùng đầu vào cùng kế hoạch, không sửa đầu vào; trẻ, đang đi thì không xếp', () => {
    expect(SEEKERS).toEqual(['seeker_sect', 'seeker_rogue']);
    expect(isSeeker('seeker_rogue')).toBe(true);
    expect(isSeeker('balanced')).toBe(false);
    for (const name of SEEKERS) {
      const c = context(), before = JSON.stringify({ ...c, factions: undefined });
      expect(seekerPlan(name, c)).toEqual(seekerPlan(name, c));
      expect(JSON.stringify({ ...c, factions: undefined })).toBe(before);
      expect(seekerPlan(name, { ...c, active: true })).toBeNull();
      expect(seekerPlan(name, { ...c, character: { ...c.character, canAct: false } })).toBeNull();
    }
  });

  it('tông môn: năm tuyển lên trị sở từ tháng Giêng, tháng Ba dự tuyển; quá tuổi, biết không có linh căn thì thôi; ngoài mùa về nhà', () => {
    expect(first(context(), 'seeker_sect')).toEqual({ action: 'action.travel', target: SEAT });
    expect(first(context({ month: 3, location: SEAT, open: ['action.trial'] }), 'seeker_sect')).toEqual({ action: 'action.trial' });
    // Năm không tuyển, quá tuổi, đã biết không có linh căn: làm ăn như thường
    expect(first(context({ year: 31 }), 'seeker_sect')?.action).toBe('action.farm');
    expect(first(context({ age: 21 }), 'seeker_sect')?.action).toBe('action.farm');
    expect(first(context({ cult: { root: 'none' } }), 'seeker_sect')?.action).toBe('action.farm');
    expect(first(context({ month: 5, location: SEAT }), 'seeker_sect')).toEqual({ action: 'action.travel', target: 0 });
  });

  it('tán tu: có công pháp thì dẫn khí; ở nơi tìm được thì tìm cơ duyên; tháng Mười lên núi; dưới 15 tuổi chưa đi', () => {
    expect(first(context({ age: 20, open: ['action.induce', 'action.seek'] }), 'seeker_rogue')).toEqual({ action: 'action.induce' });
    expect(first(context({ age: 20, open: ['action.seek'] }), 'seeker_rogue')).toEqual({ action: 'action.seek' });
    expect(first(context({ age: 20, month: 10 }), 'seeker_rogue')).toEqual({ action: 'action.travel', target: PEAK });
    expect(first(context({ age: 20, month: 4 }), 'seeker_rogue')?.action).toBe('action.farm');
    expect(first(context({ age: 14, month: 10 }), 'seeker_rogue')?.action).toBe('action.farm');
    expect(first(context({ age: 20, month: 10, cult: { root: 'none' } }), 'seeker_rogue')?.action).toBe('action.farm');
  });

  it('đã có đường tu: tu hai ô khi đủ ăn, đệ tử làm tạp dịch nửa cuối năm, đủ đỉnh thì đột phá', () => {
    const cult = { root: 'fair', path: 'sect', qi: 'half' } as const;
    expect(seekerPlan('seeker_sect', context({ age: 20, cult, open: ['action.cultivate', 'action.sect_duty'] }))?.slots.map((s) => s.action)).toEqual(['action.farm', 'action.cultivate', 'action.cultivate']);
    expect(seekerPlan('seeker_sect', context({ age: 20, month: 8, cult, open: ['action.cultivate', 'action.sect_duty'] }))?.slots.map((s) => s.action)).toEqual(['action.farm', 'action.cultivate', 'action.sect_duty']);
    expect(seekerPlan('seeker_rogue', context({ age: 20, cult: { ...cult, path: 'rogue', qi: 'peak' }, open: ['action.breakthrough'], locked: { 'action.cultivate': 'lock.qi_peak' } }))?.slots[1]).toEqual({ action: 'action.breakthrough' });
    // Tâm cảnh bất an: chờ, làm ăn
    expect(seekerPlan('seeker_rogue', context({ age: 20, cult: { ...cult, path: 'rogue', qi: 'peak' }, locked: { 'action.breakthrough': 'lock.unsettled', 'action.cultivate': 'lock.qi_peak' } }))?.slots.map((s) => s.action)).toEqual(['action.farm', 'action.farm', 'action.rest']);
  });

  it('chuyện cơ duyên: lựa chọn đầu đang mở; chuyện khác như người điều độ', () => {
    const p = (eventId: string): PendingEvent => ({ instance: 0, eventId, variant: null, params: {}, figure: null, choices: [
      { id: 'read', costs: ['time', 'stamina'], locked: 'lock.literacy' }, { id: 'risky', costs: ['risk', 'health'], locked: null }, { id: 'leave', costs: ['opportunity'], locked: null },
    ] });
    expect(seekerChoose(p('event.ruin_scroll'), context())).toBe('risky');
    expect(seekerChoose(p('event.seek_lost'), context())).toBe('leave');
  });

  it('mặt khác biệt so với điều độ: sự kiện tu tiên từ 30% là "sự kiện riêng"', () => {
    const report = (age: number, events: Record<string, number>) => ({ policy: 'x', count: 100, stuck: 0, meanAge: age, estateMedian: 30_000, causes: { illness: 50, old_age: 50 }, skills: { farming: 100 }, events } as unknown as PolicyReport);
    const base = report(60, { 'event.flood': 10 });
    expect(seekerFacets(report(60, { 'event.flood': 10 }), base)).toEqual([]);
    expect(seekerFacets(report(64, { 'event.flood': 7, 'event.seek_cave': 3 }), base)).toEqual(['tuổi thọ', 'sự kiện riêng']);
  });
});
