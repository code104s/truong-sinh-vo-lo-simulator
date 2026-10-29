import { describe, expect, it } from 'vitest';
import {
  HIDDEN_CHARACTER_KEYS, TICKS_PER_YEAR,
  ageYearsAt, base64ToBytes, HARVEST_MONTH, weeksToHarvest, bytesToBase64, calendarOf, decodeSave, encodeSave, isMonthStart, isYearStart,
  parseCommand, parseWorkerMessage, vCommandRecord, vLogEntry, vCharacterView, vHouseholdView, vLifeSummary, vMarketView, vMonthPlan, vNpcView, vPendingEvent, vFactionView, vTravelOption, PROTOCOL_VERSION, SAVE_VERSION, CAREERS, CAREER_RANKS, GOODS,
} from '../src/index';
import {
  sampleBirthplace, sampleCharacter, sampleHousehold, sampleLife, sampleLog, sampleMap, sampleMarket, sampleNpc, sampleOption, samplePending, samplePlan, sampleSave, sampleSummary,
} from './fixtures';

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

  it('số tuần tới mùa gặt (đầu tháng Chín, F4)', () => {
    const harvest = (HARVEST_MONTH - 1) * 3; // tick 24 của mỗi năm
    expect(calendarOf(harvest)).toMatchObject({ month: HARVEST_MONTH, tenDay: 0 });
    expect(weeksToHarvest(harvest)).toBe(0);
    expect(weeksToHarvest(harvest - 1)).toBe(1);
    expect(weeksToHarvest(harvest + 1)).toBe(35);
    expect(weeksToHarvest(0)).toBe(24);
    expect(weeksToHarvest(36 * 5 + harvest)).toBe(0);
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
      { type: 'STATE', reqId: 2, date: calendarOf(37), character: sampleCharacter, running: false, plan: samplePlan, active: null, slotIndex: 1, actions: [sampleOption], travel: [], market: sampleMarket, pending: null, people: [sampleNpc], circle: [{ ...sampleNpc, kin: 'mother' }], factions: [], control: [null], careers: [], hauls: [] },
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
    // Save v1 của v0.1 bị từ chối (ADR 0004)
    expect(decodeSave(JSON.stringify({ ...JSON.parse(encodeSave(sampleSave())), version: 1 })).ok).toBe(false);
    // Save v2 (v0.3 Q9), v3 (v0.4 Q10), v4 của v0.4 (v0.5 Q11), v5 của v0.5, v6 của v0.6 (v0.7 Q12) bị từ chối, save đời sau cũng vậy
    for (const version of [2, 3, 4, 5, 6, 8]) expect(decodeSave(JSON.stringify({ ...JSON.parse(encodeSave(sampleSave())), version })).ok, `v${version}`).toBe(false);
    expect(decodeSave(JSON.stringify({ ...JSON.parse(encodeSave(sampleSave())), format: 'other' })).ok).toBe(false);
  });
});

describe('v0.2: kế hoạch tháng, di chuyển, nhật ký lệnh (ADR 0008–0011)', () => {
  it('nhận SET_PLAN và PREVIEW_TRAVEL hợp lệ', () => {
    expect(parseCommand({ type: 'SET_PLAN', reqId: 1, plan: samplePlan })).toMatchObject({ ok: true });
    expect(parseCommand({ type: 'PREVIEW_TRAVEL', reqId: 2, county: 3 })).toMatchObject({ ok: true });
  });

  it.each([
    ['thiếu ô', { slots: [{ action: 'action.farm' }, { action: 'action.rest' }] }],
    ['thừa ô', { slots: [{ action: 'action.farm' }, { action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] }],
    ['id hành động sai', { slots: [{ action: 'farm' }, { action: 'action.rest' }, { action: 'action.rest' }] }],
    ['đích âm', { slots: [{ action: 'action.travel', target: -1 }, { action: 'action.rest' }, { action: 'action.rest' }] }],
    ['khóa lạ trong ô', { slots: [{ action: 'action.rest', cost: 0 }, { action: 'action.rest' }, { action: 'action.rest' }] }],
  ])('từ chối kế hoạch: %s', (_n, plan) => {
    expect(parseCommand({ type: 'SET_PLAN', reqId: 1, plan }).ok).toBe(false);
  });

  it('STATE mang kế hoạch, hành động khả dụng, đích đi được', () => {
    const base = { type: 'STATE', reqId: 2, date: calendarOf(37), character: sampleCharacter, running: false, active: null, market: null, pending: null, people: [], circle: [], factions: [], control: [], careers: [], hauls: [] };
    expect(parseWorkerMessage({ ...base, plan: samplePlan, slotIndex: 1, actions: [sampleOption, { ...sampleOption, id: 'action.hunt', locked: 'lock.winter' }], travel: [{ county: 2, slots: 1, risk: 'risk.low' }] })).toMatchObject({ ok: true });
    expect(parseWorkerMessage({ ...base, plan: null, slotIndex: 0, actions: [], travel: [] })).toMatchObject({ ok: true });
    expect(parseWorkerMessage({ ...base, plan: null, slotIndex: 3, actions: [], travel: [] }).ok).toBe(false);
    expect(parseWorkerMessage({ ...base, plan: null, slotIndex: 0, actions: [{ ...sampleOption, group: 'magic' }], travel: [] }).ok).toBe(false);
    // F1: việc riêng của nghề, ô tính vào năm làm nghề
    expect(parseWorkerMessage({ ...base, plan: null, slotIndex: 0, actions: [{ ...sampleOption, id: 'action.trap', career: 'hunter', careerWork: true }], travel: [] }).ok).toBe(true);
    expect(parseWorkerMessage({ ...base, plan: null, slotIndex: 0, actions: [{ ...sampleOption, career: 'monk' }], travel: [] }).ok).toBe(false);
    expect(parseWorkerMessage({ ...base, plan: null, slotIndex: 0, actions: [{ ...sampleOption, careerWork: false }], travel: [] }).ok).toBe(false);
    // STATE kiểu v0.1 (thiếu trường mới) bị từ chối
    const { market: _m, pending: _p, people: _q, ...v01 } = base;
    expect(parseWorkerMessage(v01).ok).toBe(false);
  });

  it('TRAVEL_PREVIEW', () => {
    expect(parseWorkerMessage({ type: 'TRAVEL_PREVIEW', reqId: 3, preview: { county: 4, route: [0, 2, 4], days: 7, slots: 1, risk: 'risk.medium' } })).toMatchObject({ ok: true });
    expect(parseWorkerMessage({ type: 'TRAVEL_PREVIEW', reqId: 3, preview: { county: 4, route: [], days: 7, slots: 1, risk: 'risk.medium' } }).ok).toBe(false);
  });

  it('view thiếu trường v0.2 bị từ chối', () => {
    const { staminaBand: _s, ...old } = sampleCharacter;
    expect(vCharacterView.check(old, '$')).toContain('staminaBand');
  });

  it('nhật ký lệnh round-trip trong save, lệnh lạ bị từ chối', () => {
    const back = decodeSave(encodeSave(sampleSave()));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.commandLog).toEqual(sampleSave().commandLog);
    const bad = JSON.parse(encodeSave(sampleSave()));
    bad.commandLog.push({ seq: 5, tick: 49, cmd: { type: 'PAUSE' } });
    expect(decodeSave(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('v0.3: hộ, chợ, mua bán, sự kiện (ADR 0012–0014)', () => {
  const state = { type: 'STATE', reqId: 2, date: calendarOf(41), character: sampleCharacter, running: false, plan: null, active: null, slotIndex: 2, actions: [], travel: [], people: [], circle: [], factions: [], control: [], careers: [], hauls: [] };

  it('nhận TRADE và CHOOSE hợp lệ', () => {
    expect(parseCommand({ type: 'TRADE', reqId: 1, grain: 30 })).toMatchObject({ ok: true });
    expect(parseCommand({ type: 'TRADE', reqId: 1, grain: -30 })).toMatchObject({ ok: true });
    expect(parseCommand({ type: 'CHOOSE', reqId: 2, instance: 4, choice: 'corvee' })).toMatchObject({ ok: true });
  });

  it.each([
    ['TRADE số 0', { type: 'TRADE', reqId: 1, grain: 0 }],
    ['TRADE số thực', { type: 'TRADE', reqId: 1, grain: 1.5 }],
    ['CHOOSE thiếu instance', { type: 'CHOOSE', reqId: 1, choice: 'pay' }],
    ['CHOOSE id sai', { type: 'CHOOSE', reqId: 1, instance: 0, choice: 'Pay now' }],
  ])('từ chối: %s', (_n, u) => {
    expect(parseCommand(u).ok).toBe(false);
  });

  it('STATE mang chợ và sự kiện chờ; EVENT', () => {
    expect(parseWorkerMessage({ ...state, market: sampleMarket, pending: samplePending })).toMatchObject({ ok: true });
    expect(parseWorkerMessage({ ...state, market: null, pending: null })).toMatchObject({ ok: true });
    expect(parseWorkerMessage({ type: 'EVENT', reqId: 3, pending: samplePending })).toMatchObject({ ok: true });
    expect(parseWorkerMessage({ type: 'ERROR', reqId: 3, code: 'EVENT_PENDING', message: 'x' })).toMatchObject({ ok: true });
  });

  it('hộ: số nguyên không âm, không lộ bộ đếm đói', () => {
    expect(vHouseholdView.check(sampleHousehold, '$')).toBeNull();
    expect(vHouseholdView.check({ ...sampleHousehold, money: -1 }, '$')).toContain('money');
    expect(vHouseholdView.check({ ...sampleHousehold, grain: 1.5 }, '$')).toContain('grain');
    expect(vHouseholdView.check({ ...sampleHousehold, hunger: 3 }, '$')).toContain('hunger');
    expect(vHouseholdView.check({ ...sampleHousehold, tenure: 'serf' }, '$')).toContain('tenure');
    const { household: _h, ...v02 } = sampleCharacter;
    expect(vCharacterView.check(v02, '$')).toContain('household');
  });

  it('chợ: giá là số nguyên', () => {
    expect(vMarketView.check(sampleMarket, '$')).toBeNull();
    expect(vMarketView.check({ ...sampleMarket, buyPrice: 45.5 }, '$')).toContain('buyPrice');
    expect(vMarketView.check({ ...sampleMarket, supply: 'glut' }, '$')).toContain('supply');
  });

  it.each([
    ['không có lựa chọn', { choices: [] }],
    ['chỉ một lựa chọn (không còn là lựa chọn)', { choices: [{ id: 'pay', costs: ['money'], locked: null }] }],
    ['năm lựa chọn (quá bốn)', { choices: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, costs: ['time'], locked: null })) }],
    ['mọi lựa chọn đều khóa (ADR 0014: luôn có lối ra)', { choices: samplePending.choices.map((c) => ({ ...c, locked: 'lock.money' })) }],
    ['lựa chọn không có giá', { choices: [{ id: 'free', costs: [], locked: null }, { id: 'pay', costs: ['money'], locked: null }] }],
    ['giá lạ', { choices: [{ id: 'pay', costs: ['soul'], locked: null }, { id: 'flee', costs: ['risk'], locked: null }] }],
    ['id lựa chọn trùng', { choices: [{ id: 'pay', costs: ['money'], locked: null }, { id: 'pay', costs: ['time'], locked: null }] }],
    ['id sự kiện sai', { eventId: 'tax_collector' }],
    ['tham số số thực', { params: { amount: 0.5 } }],
  ])('sự kiện chờ bị từ chối: %s', (_n, patch) => {
    expect(vPendingEvent.check({ ...samplePending, ...patch }, '$')).not.toBeNull();
  });

  it('hành động mang giá tiền', () => {
    const { money: _m, ...cost } = sampleOption.cost;
    expect(parseWorkerMessage({ ...state, actions: [{ ...sampleOption, cost }], market: null, pending: null }).ok).toBe(false);
  });

  it('nhật ký lệnh có TRADE và CHOOSE round-trip', () => {
    const back = decodeSave(encodeSave(sampleSave()));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.commandLog.map((r) => r.cmd.type)).toEqual(['NEW_LIFE', 'SET_PLAN', 'ADVANCE', 'TRADE', 'CHOOSE']);
    const bad = JSON.parse(encodeSave(sampleSave()));
    bad.commandLog[3].cmd.grain = 0;
    expect(decodeSave(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('v0.4: NPC (ADR 0015, 0016)', () => {
  const state = { type: 'STATE', reqId: 2, date: calendarOf(41), character: sampleCharacter, running: false, plan: null, active: null, slotIndex: 2, actions: [], travel: [], market: null, pending: null, circle: [], factions: [], control: [], careers: [], hauls: [] };

  it('STATE mang người trong quận; STATE kiểu v0.3 (thiếu people) bị từ chối', () => {
    expect(parseWorkerMessage({ ...state, people: [sampleNpc, { ...sampleNpc, id: 'n2', gender: 'male' }] })).toMatchObject({ ok: true });
    expect(parseWorkerMessage({ ...state, people: [] })).toMatchObject({ ok: true });
    expect(parseWorkerMessage(state).ok).toBe(false);
  });

  it.each([
    ['id sai dạng', { id: 'npc-17' }],
    ['id số 0', { id: 'n0' }],
    ['tuổi âm', { ageYears: -1 }],
    ['nghề không phải id nội dung', { occupation: 'Nông' }],
    ['dải sức khỏe lạ', { healthBand: 'fine' }],
    ['chân dung thiếu khóa', { portrait: { ageBand: 'adult', class: 'common', key: '' } }],
    ['khóa xã giao sai id hành động (v0.5 F2)', { social: [{ action: 'visit', locked: null }] }],
    ['khóa xã giao thiếu lý do (v0.5 F2)', { social: [{ action: 'action.visit' }] }],
  ])('NpcView từ chối: %s', (_n, patch) => {
    expect(vNpcView.check({ ...sampleNpc, ...patch }, '$')).not.toBeNull();
  });

  it('NpcView nhận khóa xã giao (v0.5 F2)', () => {
    expect(vNpcView.check({ ...sampleNpc, social: [{ action: 'action.visit', locked: null }, { action: 'action.propose', locked: 'lock.not_close' }] }, '$')).toBeNull();
  });
  it('NpcView không lộ thuộc tính ẩn', () => {
    for (const key of HIDDEN_CHARACTER_KEYS) expect(vNpcView.check({ ...sampleNpc, [key]: 1 }, '$'), key).not.toBeNull();
  });

  it('người trong sự kiện có thể là NPC thật (npcId), hoặc vô danh', () => {
    expect(vPendingEvent.check({ ...samplePending, figure: { gender: 'female', ageBand: 'old', class: 'poor', npcId: 'n17' } }, '$')).toBeNull();
    expect(vPendingEvent.check({ ...samplePending, figure: { gender: 'female', ageBand: 'old', class: 'poor' } }, '$')).toBeNull();
    expect(vPendingEvent.check({ ...samplePending, figure: { gender: 'female', ageBand: 'old', class: 'poor', npcId: '17' } }, '$')).not.toBeNull();
  });
});

describe('v0.5: quan hệ, gia đình, tiếng tăm (ADR 0017, 0018)', () => {
  const state = { type: 'STATE', reqId: 2, date: calendarOf(41), character: sampleCharacter, running: false, plan: null, active: null, slotIndex: 2, actions: [], travel: [], market: null, pending: null, people: [], factions: [], control: [], careers: [], hauls: [] };
  const bond = { closeness: 'friend', trust: 'trusted', hostility: 'none', owed: 'they_owe' };

  it('phiên bản giao thức 7, save 7 (v0.7; v0.6 là 6, 6)', () => {
    expect([PROTOCOL_VERSION, SAVE_VERSION]).toEqual([7, 7]);
  });

  it('STATE mang người thân, người quen ở mọi quận; STATE kiểu v0.4 (thiếu circle) bị từ chối', () => {
    expect(parseWorkerMessage({ ...state, circle: [{ ...sampleNpc, kin: 'mother' }, { ...sampleNpc, id: 'n9', bond }] })).toMatchObject({ ok: true });
    expect(parseWorkerMessage({ ...state, circle: [] })).toMatchObject({ ok: true });
    expect(parseWorkerMessage(state).ok).toBe(false);
  });

  it('NpcView: vai ruột thịt, quan hệ theo dải; không nhận số thô hay vai lạ', () => {
    expect(vNpcView.check({ ...sampleNpc, kin: 'spouse', bond }, '$')).toBeNull();
    expect(vNpcView.check({ ...sampleNpc, kin: 'cousin' }, '$')).not.toBeNull();
    expect(vNpcView.check({ ...sampleNpc, bond: { ...bond, closeness: 72 } }, '$')).not.toBeNull();
    expect(vNpcView.check({ ...sampleNpc, bond: { ...bond, score: 3 } }, '$')).not.toBeNull();
  });

  it('CharacterView có tiếng tăm (bắt buộc), vợ/chồng (tùy); kiểu v0.4 bị từ chối', () => {
    expect(vCharacterView.check({ ...sampleCharacter, spouse: 'n4' }, '$')).toBeNull();
    expect(vCharacterView.check({ ...sampleCharacter, reputation: 'famous' }, '$')).not.toBeNull();
    expect(vCharacterView.check({ ...sampleCharacter, spouse: 'n0' }, '$')).not.toBeNull();
    const { reputation: _r, ...v04 } = sampleCharacter;
    expect(vCharacterView.check(v04, '$')).not.toBeNull();
  });

  it('ô kế hoạch nhắm vào người: id NPC đúng dạng', () => {
    expect(vMonthPlan.check({ slots: [{ action: 'action.visit', person: 'n12' }, { action: 'action.rest' }, { action: 'action.rest' }] }, '$')).toBeNull();
    expect(vMonthPlan.check({ slots: [{ action: 'action.visit', person: 'Lý Hoa' }, { action: 'action.rest' }, { action: 'action.rest' }] }, '$')).not.toBeNull();
  });

  it('tổng kết có di sản; thiếu di sản bị từ chối', () => {
    expect(vLifeSummary.check(sampleLife, '$')).toBeNull();
    const { legacy: _l, ...v04 } = sampleLife;
    expect(vLifeSummary.check(v04, '$')).not.toBeNull();
    expect(vLifeSummary.check({ ...sampleLife, legacy: { ...sampleLife.legacy, friends: -1 } }, '$')).not.toBeNull();
  });
});

describe('hợp đồng v6: thế lực (v0.6, ADR 0019)', () => {
  const faction = { id: 'f2', kind: 'clan', name: { key: 'faction.clan.name', params: { surname: 'Lương', place: 'Vị Kinh' } }, seat: 3, counties: [3], strength: 'strong', members: 7, leader: 'n12' };
  const state = { type: 'STATE', reqId: 2, date: calendarOf(41), character: sampleCharacter, running: false, plan: null, active: null, slotIndex: 2, actions: [], travel: [], market: null, pending: null, people: [], circle: [], careers: [], hauls: [] };

  it('STATE mang thế lực và người giữ từng quận; STATE kiểu v0.5 (thiếu factions, control) bị từ chối', () => {
    expect(parseWorkerMessage({ ...state, factions: [faction], control: ['f1', null, 'f2'] })).toMatchObject({ ok: true });
    expect(parseWorkerMessage(state).ok).toBe(false);
    expect(parseWorkerMessage({ ...state, factions: [], control: ['f0'] }).ok).toBe(false);
  });

  it('FactionView: loại, dải thế đúng danh mục; id dạng "f3"; không lộ số thô', () => {
    expect(vFactionView.check(faction, '$')).toBeNull();
    expect(vFactionView.check({ ...faction, kind: 'sect' }, '$')).not.toBeNull();
    expect(vFactionView.check({ ...faction, strength: 73 }, '$')).not.toBeNull();
    expect(vFactionView.check({ ...faction, id: 'n2' }, '$')).not.toBeNull();
    // Đường giữ (F1): cặp quận [nhỏ, lớn]
    expect(vFactionView.check({ ...faction, roads: [[0, 2], [1, 3]] }, '$')).toBeNull();
    expect(vFactionView.check({ ...faction, roads: [[2, 0]] }, '$')).not.toBeNull();
    expect(vFactionView.check({ ...faction, roads: [[1]] }, '$')).not.toBeNull();
  });

  it('NpcView mang thế lực; đường đi mang băng cướp giữ đường; di sản có thế sự một đời', () => {
    expect(vNpcView.check({ ...sampleNpc, faction: 'f2' }, '$')).toBeNull();
    expect(vNpcView.check({ ...sampleNpc, faction: 'Họ Lương' }, '$')).not.toBeNull();
    expect(vTravelOption.check({ county: 1, slots: 1, risk: 'risk.low', danger: 'f4' }, '$')).toBeNull();
    expect(vTravelOption.check({ county: 1, slots: 1, risk: 'risk.low', danger: 4 }, '$')).not.toBeNull();
    expect(vLifeSummary.check({ ...sampleLife, legacy: { ...sampleLife.legacy, factions: [{ name: { key: 'faction.bandits.name', params: { place: 'núi Hổ' } }, kind: 'bandits', fate: 'gone' }] } }, '$')).toBeNull();
    expect(vLifeSummary.check({ ...sampleLife, legacy: { ...sampleLife.legacy, factions: [{ name: { key: 'faction.bandits.name', params: {} }, kind: 'bandits', fate: 'exploded' }] } }, '$')).not.toBeNull();
    expect(vFactionView.check({ ...faction, name: 'Họ Lương ở Vị Kinh' }, '$')).not.toBeNull();
  });
});

describe('hợp đồng v7: nghề (v0.7 Bước 0, ADR 0020)', () => {
  it('F3b: STATE mang chuyến buôn (quận đích, hàng, số ô đi về, lời mỗi đấu, mỗi phần, lời cả chuyến có thể âm, khóa); thiếu thì bị từ chối', () => {
    const state = { type: 'STATE', reqId: 2, date: calendarOf(41), character: sampleCharacter, running: false, plan: null, active: null, slotIndex: 2, actions: [], travel: [], market: null, pending: null, people: [], circle: [], factions: [], control: [], careers: [] };
    const haul = { county: 2, cargo: 'hide', slots: 4, margin: 6, profit: 340, risk: 'risk.low', locked: null };
    expect(parseWorkerMessage({ ...state, hauls: [haul, { ...haul, cargo: 'grain', margin: -3, profit: -120, locked: 'lock.no_profit', danger: 'f4' }] })).toMatchObject({ ok: true });
    expect(parseWorkerMessage(state).ok).toBe(false);
    expect(parseWorkerMessage({ ...state, hauls: [{ ...haul, cargo: 'silk' }] }).ok).toBe(false);
    expect(parseWorkerMessage({ ...state, hauls: [{ ...haul, margin: 1.5 }] }).ok).toBe(false);
  });

  it('F4: nghề trong tổng kết đời có thể ghi còn làm tới lúc nhắm mắt', () => {
    const legacy = (careers: unknown) => ({ ...sampleLife, legacy: { ...sampleLife.legacy, careers } });
    expect(vLifeSummary.check(legacy([{ id: 'farmer', rank: 'master', years: 30 }, { id: 'drifter', rank: 'apprentice', years: 2, current: true }]), '$')).toBeNull();
    expect(vLifeSummary.check(legacy([{ id: 'farmer', rank: 'master', years: 30, current: false }]), '$')).toContain('current');
  });

  it('F3: sự kiện chờ và dòng nhật ký có thể mang nghề; nghề lạ bị từ chối', () => {
    expect(vPendingEvent.check({ ...samplePending, career: 'hunter' }, '$')).toBeNull();
    expect(vPendingEvent.check({ ...samplePending, career: 'monk' }, '$')).toContain('career');
    expect(vLogEntry.check({ ...sampleLog, career: 'farmer' }, '$')).toBeNull();
    expect(vLogEntry.check({ ...sampleLog, career: 'monk' }, '$')).toContain('career');
  });

  it('STATE mang bảng chọn nghề (F2): cách vào, việc vào nghề, thầy ở đây (lễ, khóa); STATE thiếu bảng nghề bị từ chối', () => {
    const state = { type: 'STATE', reqId: 2, date: calendarOf(41), character: sampleCharacter, running: false, plan: null, active: null, slotIndex: 2, actions: [], travel: [], market: null, pending: null, people: [], circle: [], factions: [], control: [], hauls: [] };
    const board = [
      { career: 'farmer', way: 'mentor', action: 'action.apprentice', mentors: [{ id: 'n3', gift: 0, locked: null }, { id: 'n9', gift: 300, locked: 'lock.stranger' }], locked: null },
      { career: 'physician', way: 'mentor', action: 'action.apprentice', mentors: [], locked: 'lock.no_mentor_here' },
      { career: 'soldier', way: 'faction', action: 'action.enlist', mentors: [], locked: 'lock.not_seat' },
      { career: 'outlaw', way: 'event', action: null, mentors: [], locked: null },
    ];
    expect(parseWorkerMessage({ ...state, careers: board })).toMatchObject({ ok: true });
    expect(parseWorkerMessage(state).ok).toBe(false);
    expect(parseWorkerMessage({ ...state, careers: [{ ...board[0], way: 'bribe' }] }).ok).toBe(false);
    expect(parseWorkerMessage({ ...state, careers: [{ ...board[0], action: 'action.farm' }] }).ok).toBe(false);
    expect(parseWorkerMessage({ ...state, careers: [{ ...board[0], mentors: [{ id: 'n3', gift: -1, locked: null }] }] }).ok).toBe(false);
  });

  it('lệnh rời nghề (S1): có trong lệnh UI và nhật ký lệnh để phát lại', () => {
    expect(parseCommand({ type: 'LEAVE_CAREER', reqId: 3 })).toMatchObject({ ok: true });
    expect(parseCommand({ type: 'LEAVE_CAREER' })).toMatchObject({ ok: false });
    expect(vCommandRecord.check({ seq: 4, tick: 900, cmd: { type: 'LEAVE_CAREER' } }, '$')).toBeNull();
  });

  it('kho đồ (S3b, ADR 0021): lệnh mua bán hàng, hàng của chuyến buôn, túi đồ và chợ hàng trong view', () => {
    expect(GOODS).toEqual(['hide', 'wares', 'herb']);
    expect(parseCommand({ type: 'TRADE_GOODS', reqId: 5, good: 'herb', qty: -30 })).toMatchObject({ ok: true });
    expect(parseCommand({ type: 'TRADE_GOODS', reqId: 5, good: 'salt', qty: 10 })).toMatchObject({ ok: false });
    expect(parseCommand({ type: 'TRADE_GOODS', reqId: 5, good: 'hide', qty: 0 })).toMatchObject({ ok: false });
    expect(parseCommand({ type: 'TRADE_GOODS', reqId: 5, good: 'hide', qty: 1.5 })).toMatchObject({ ok: false });
    expect(vCommandRecord.check({ seq: 6, tick: 900, cmd: { type: 'TRADE_GOODS', good: 'wares', qty: 10 } }, '$')).toBeNull();
    const haul = (cargo: unknown) => ({ slots: [{ action: 'action.haul', target: 2, cargo }, { action: 'action.rest' }, { action: 'action.rest' }] });
    expect(vMonthPlan.check(haul('wares'), '$')).toBeNull();
    expect(vMonthPlan.check(haul('grain'), '$')).toBeNull();
    expect(vMonthPlan.check(haul('silk'), '$')).not.toBeNull();
    expect(vHouseholdView.check({ ...sampleHousehold, goods: [{ id: 'hide', qty: -1 }] }, '$')).toContain('goods');
    const { goods: _g, ...noGoods } = sampleHousehold;
    expect(vHouseholdView.check(noGoods, '$')).not.toBeNull();
    expect(vMarketView.check({ ...sampleMarket, goods: [{ ...sampleMarket.goods[0], buyPrice: 2.5 }] }, '$')).toContain('goods');
    expect(vMarketView.check({ ...sampleMarket, goods: [{ ...sampleMarket.goods[0], id: 'silk' }] }, '$')).toContain('goods');
  });

  it('CharacterView có thân phận nghề (null hay nghề, bậc, lúc vào, nơi nhận); kiểu v0.6 (thiếu career) bị từ chối', () => {
    expect(vCharacterView.check({ ...sampleCharacter, career: null }, '$')).toBeNull();
    expect(vCharacterView.check({ ...sampleCharacter, career: { id: 'physician', rank: 'apprentice', since: 720, years: 0, leave: {} } }, '$')).toBeNull();
    expect(vCharacterView.check({ ...sampleCharacter, career: { id: 'soldier', rank: 'master', since: 720, faction: 'f1', years: 12, leave: { angers: 'f1' } } }, '$')).toBeNull();
    expect(vCharacterView.check({ ...sampleCharacter, career: { id: 'monk', rank: 'master', since: 720 } }, '$')).not.toBeNull();
    expect(vCharacterView.check({ ...sampleCharacter, career: { id: 'farmer', rank: 'grandmaster', since: 720 } }, '$')).not.toBeNull();
    const { career: _c, ...v06 } = sampleCharacter;
    expect(vCharacterView.check(v06, '$')).not.toBeNull();
    // F1: thầy dạy nghề (tên, còn sống không)
    const mentor = { id: 'n12', name: 'Lý Văn Tâm', alive: false };
    expect(vCharacterView.check({ ...sampleCharacter, career: { id: 'farmer', rank: 'apprentice', since: 720, mentor, years: 1, leave: {} } }, '$')).toBeNull();
    expect(vCharacterView.check({ ...sampleCharacter, career: { id: 'farmer', rank: 'apprentice', since: 720, mentor: { ...mentor, name: '' }, years: 1, leave: {} } }, '$')).toContain('mentor');
    expect(vCharacterView.check({ ...sampleCharacter, career: { id: 'farmer', rank: 'apprentice', since: 720, mentor: { id: 'n12', name: 'Tâm' }, years: 1, leave: {} } }, '$')).toContain('mentor');
    // F2: số năm làm nghề, rời nghề mất gì (thế lực phật lòng; ra băng chuộc tội hay trốn)
    const outlaw = { id: 'outlaw', rank: 'apprentice', since: 720, faction: 'f3', years: 0 };
    expect(vCharacterView.check({ ...sampleCharacter, career: { ...outlaw, leave: { outlaw: { way: 'atone', fee: 1000 } } } }, '$')).toBeNull();
    expect(vCharacterView.check({ ...sampleCharacter, career: { ...outlaw, leave: { outlaw: { way: 'flee', fee: 1000 } } } }, '$')).toContain('leave');
    expect(vCharacterView.check({ ...sampleCharacter, career: { ...outlaw } }, '$')).toContain('leave');
    expect(CAREERS).toHaveLength(9);
    expect(CAREER_RANKS).toEqual(['apprentice', 'journeyman', 'master']);
  });

  it('di sản có các nghề đã làm (bậc cao nhất, số năm); thiếu thì bị từ chối', () => {
    expect(vLifeSummary.check(sampleLife, '$')).toBeNull();
    const { careers: _c, ...legacy06 } = sampleLife.legacy;
    expect(vLifeSummary.check({ ...sampleLife, legacy: legacy06 }, '$')).not.toBeNull();
    expect(vLifeSummary.check({ ...sampleLife, legacy: { ...sampleLife.legacy, careers: [{ id: 'farmer', rank: 'journeyman', years: -1 }] } }, '$')).not.toBeNull();
  });
});

