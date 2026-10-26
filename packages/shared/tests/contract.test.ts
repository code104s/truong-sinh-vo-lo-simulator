import { describe, expect, it } from 'vitest';
import {
  HIDDEN_CHARACTER_KEYS, TICKS_PER_YEAR,
  ageYearsAt, base64ToBytes, bytesToBase64, calendarOf, decodeSave, encodeSave, isMonthStart, isYearStart,
  parseCommand, parseWorkerMessage, vCharacterView,
} from '../src/index';
import { sampleBirthplace, sampleCharacter, sampleLife, sampleLog, sampleMap, sampleSave, sampleSummary } from './fixtures';

describe('lịch', () => {
  it('tick 0 là thượng tuần tháng Giêng năm 1', () => {
    expect(calendarOf(0)).toEqual({ tick: 0, year: 1, month: 1, tenDay: 0, season: 'spring' });
  });

  it('ranh tháng, mùa và năm', () => {
    expect(calendarOf(2)).toMatchObject({ month: 1, tenDay: 2 });
    expect(calendarOf(3)).toMatchObject({ month: 2, tenDay: 0 });
    expect(calendarOf(35)).toMatchObject({ year: 1, month: 12, tenDay: 2, season: 'winter' });
    expect(calendarOf(36)).toMatchObject({ year: 2, month: 1, tenDay: 0, season: 'spring' });
    expect(calendarOf(36 * 60 + 3 * 6)).toMatchObject({ year: 61, month: 7, season: 'autumn' });
    expect(calendarOf(3 * 3)).toMatchObject({ month: 4, season: 'summer' });
  });

  it('nhịp đầu tháng, đầu năm', () => {
    expect([0, 1, 2, 3, 4].map(isMonthStart)).toEqual([true, false, false, true, false]);
    expect([0, 35, 36, 72].map(isYearStart)).toEqual([true, false, true, true]);
  });

  it('tuổi thật theo năm tròn', () => {
    expect(TICKS_PER_YEAR).toBe(36);
    expect(ageYearsAt(10, 10 + 35)).toBe(0);
    expect(ageYearsAt(10, 10 + 36)).toBe(1);
  });

  it('từ chối tick không hợp lệ', () => {
    expect(() => calendarOf(-1)).toThrow();
    expect(() => calendarOf(1.5)).toThrow();
  });
});

describe('lệnh UI → worker', () => {
  it('nhận lệnh hợp lệ', () => {
    const cmds = [
      { type: 'GEN_WORLD', reqId: 1, worldSeed: 'tsvl-01' },
      { type: 'NEW_LIFE', reqId: 2, config: { worldSeed: 'tsvl-01', regionId: 'r1', birthplaceId: 'r1/c3' } },
      { type: 'NEW_LIFE', reqId: 2, config: { worldSeed: 'tsvl-01', regionId: 'r1', birthplaceId: 'r1/c3v2', lifeSeed: 4294967295 } },
      { type: 'ADVANCE', reqId: 3, mode: 'untilEvent' },
      { type: 'PAUSE', reqId: 4 },
      { type: 'SAVE', reqId: 5 },
      { type: 'LOAD', reqId: 6, save: sampleSave() },
    ];
    for (const c of cmds) expect(parseCommand(c), JSON.stringify(c).slice(0, 80)).toMatchObject({ ok: true });
  });

  it.each([
    ['không phải object', 42],
    ['type lạ', { type: 'FLY', reqId: 1 }],
    ['thiếu reqId', { type: 'PAUSE' }],
    ['reqId âm', { type: 'PAUSE', reqId: -1 }],
    ['mode sai', { type: 'ADVANCE', reqId: 1, mode: 'decade' }],
    ['khóa lạ', { type: 'PAUSE', reqId: 1, extra: true }],
    ['seed rỗng', { type: 'GEN_WORLD', reqId: 1, worldSeed: '' }],
    ['birthplaceId sai', { type: 'NEW_LIFE', reqId: 1, config: { worldSeed: 's', regionId: 'r1', birthplaceId: 'c3' } }],
    ['lifeSeed vượt u32', { type: 'NEW_LIFE', reqId: 1, config: { worldSeed: 's', regionId: 'r1', birthplaceId: 'r1/c3', lifeSeed: 2 ** 32 } }],
    ['lifeSeed không nguyên', { type: 'NEW_LIFE', reqId: 1, config: { worldSeed: 's', regionId: 'r1', birthplaceId: 'r1/c3', lifeSeed: 1.5 } }],
  ])('từ chối: %s', (_name, u) => {
    const r = parseCommand(u);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^\$cmd/);
  });
});

describe('tin worker → UI', () => {
  it('nhận mọi loại tin hợp lệ', () => {
    const msgs = [
      { type: 'READY', protocolVersion: 1, simVersion: '0.1.0' },
      { type: 'PROGRESS', reqId: 1, stage: 'worldgen.terrain', pct: 40 },
      { type: 'WORLD', reqId: 1, worldSeed: 'tsvl-01', region: sampleSummary, map: sampleMap(), birthplaces: [sampleBirthplace] },
      { type: 'STATE', reqId: 2, date: calendarOf(37), character: sampleCharacter, running: false },
      { type: 'LOG', reqId: 2, entries: [sampleLog] },
      { type: 'INTERRUPT', reqId: 2, entry: { ...sampleLog, importance: 'major' } },
      { type: 'DIED', reqId: 3, summary: sampleLife },
      { type: 'SAVED', reqId: 4, save: sampleSave() },
      { type: 'ERROR', reqId: null, code: 'INTERNAL', message: 'x' },
    ];
    for (const m of msgs) expect(parseWorkerMessage(m), m.type).toMatchObject({ ok: true });
  });

  it('từ chối bản đồ có mảng sai độ dài', () => {
    const map = { ...sampleMap(), biome: new Uint8Array(5) };
    const r = parseWorkerMessage({ type: 'WORLD', reqId: 1, worldSeed: 's', region: sampleSummary, map, birthplaces: [] });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain('biome');
  });

  it('từ chối mảng số sai kiểu', () => {
    const map = { ...sampleMap(), elevation: Array.from(sampleMap().elevation) };
    expect(parseWorkerMessage({ type: 'WORLD', reqId: 1, worldSeed: 's', region: sampleSummary, map, birthplaces: [] }).ok).toBe(false);
  });

  it('từ chối tham số nhật ký là số thực (sim chỉ dùng số nguyên)', () => {
    expect(parseWorkerMessage({ type: 'LOG', reqId: 1, entries: [{ ...sampleLog, params: { x: 0.5 } }] }).ok).toBe(false);
  });
});

describe('CharacterView không lộ trường ẩn', () => {
  it.each(HIDDEN_CHARACTER_KEYS)('view có khóa "%s" bị từ chối', (key) => {
    const leaked = { ...sampleCharacter, [key]: 1 };
    const r = vCharacterView.check(leaked, '$');
    expect(r).toContain(key);
  });

  it('view mẫu không chứa khóa ẩn', () => {
    for (const k of HIDDEN_CHARACTER_KEYS) expect(Object.keys(sampleCharacter)).not.toContain(k);
  });
});

describe('save', () => {
  it('base64 khớp với chuẩn (đối chiếu Buffer của Node)', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 255, 1000]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 255);
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString('base64'));
      expect(base64ToBytes(b64)).toEqual(bytes);
    }
  });

  it('round-trip giữ nguyên mảng số, kể cả NaN', () => {
    const save = sampleSave();
    const text = encodeSave(save);
    const back = decodeSave(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const m = back.value.region.map;
    expect(m.elevation).toBeInstanceOf(Float32Array);
    expect(m.county).toBeInstanceOf(Int16Array);
    expect(m.biome).toBeInstanceOf(Uint8Array);
    expect(Array.from(m.elevation)).toEqual(Array.from(save.region.map.elevation));
    expect(Number.isNaN(m.water[5]!)).toBe(true);
    expect(m.water[0]).toBe(0);
    expect(Array.from(m.rivers[0]!.points)).toEqual([0.5, 0.5, 1.5, 2.25]);
    expect(back.value.sim).toEqual(save.sim);
    expect(encodeSave(back.value)).toBe(text);
  });

  it('từ chối save hỏng', () => {
    expect(decodeSave('{').ok).toBe(false);
    expect(decodeSave(JSON.stringify({ ...JSON.parse(encodeSave(sampleSave())), version: 2 })).ok).toBe(false);
    expect(decodeSave(JSON.stringify({ ...JSON.parse(encodeSave(sampleSave())), format: 'other' })).ok).toBe(false);
  });
});
