import { birthplaceId, regionId, type CharacterView, type WorkerMessage } from '@tsvl/shared';
import { t } from '@tsvl/content';
import { describe, expect, it } from 'vitest';
import { initialState, reduce, type Action, type AppState } from '../src/app/state';

const run = (actions: Action[], from: AppState = initialState) => actions.reduce(reduce, from);
const msg = (m: WorkerMessage): Action => ({ type: 'msg', m });

const map = { W: 1, H: 1, origin: { x: 0, y: 0 }, kmPerCell: 6, elevation: new Float32Array(1), water: new Float32Array(1), coastDist: new Float32Array(1), flow: new Float32Array(1), temperature: new Float32Array(1), biome: new Uint8Array(1), mask: new Uint8Array(1), county: new Int16Array(1), counties: [], rivers: [], roads: [], labels: [] };
const region = { id: regionId('r0'), name: 'Vị Kinh Châu', nameHan: '渭京州', realmName: 'Lương', kmPerCell: 6, landKm2: 1 };
const world: WorkerMessage = { type: 'WORLD', reqId: 1, worldSeed: 's', region, map, birthplaces: [] };
const character = { name: 'A', alive: true } as CharacterView;
const state: WorkerMessage = { type: 'STATE', reqId: 2, date: { tick: 1, year: 1, month: 1, tenDay: 1, season: 'spring' }, character, running: false, plan: null, active: null, slotIndex: 1, actions: [], travel: [], market: null, pending: null, people: [], circle: [], factions: [], control: [] };
const entry = { tick: 1, key: 'log.birth', params: {}, importance: 'major' as const };

describe('máy trạng thái màn', () => {
  it('v0.4: STATE mang người trong quận; đời mới thì xóa', () => {
    const npc = { id: 'n3', name: 'Lý Thị Hoa', gender: 'female' as const, ageYears: 34, occupation: 'occupation.farmer', healthBand: 'healthy' as const, portrait: { ageBand: 'adult' as const, class: 'common' as const, key: 'n3' } };
    let s = run([msg({ ...(state as Extract<WorkerMessage, { type: 'STATE' }>), people: [npc] })]);
    expect(s.people).toEqual([npc]);
    s = run([{ type: 'newLifeStart' }], s);
    expect(s.people).toEqual([]);
  });

  it('v0.5: STATE mang người thân, người quen ở mọi quận; đời mới thì xóa', () => {
    const mother = { id: 'n4', name: 'Lý Thị Hoa', gender: 'female' as const, ageYears: 40, occupation: 'occupation.farmer', healthBand: 'healthy' as const, portrait: { ageBand: 'adult' as const, class: 'common' as const, key: 'n4' }, kin: 'mother' as const };
    let s = run([msg({ ...(state as Extract<WorkerMessage, { type: 'STATE' }>), circle: [mother] })]);
    expect(s.circle).toEqual([mother]);
    s = run([{ type: 'newLifeStart' }], s);
    expect(s.circle).toEqual([]);
  });

    it('tải save của bản sim khác: báo như save bản cũ, về màn chính', () => {
    const s = run([{ type: 'loadStart' }, msg({ type: 'ERROR', reqId: 3, code: 'VERSION', message: 'save của sim 0.3.0, bản này là 0.3.1' })]);
    expect(s.screen).toBe('menu');
    expect(s.error).toBe(t('ui.save.outdated_sim'));
    // Lỗi VERSION ngoài lúc tải (không xảy ra) vẫn hiện nguyên văn
    expect(run([msg({ type: 'ERROR', reqId: 3, code: 'VERSION', message: 'x' })]).error).toBe('VERSION: x');
  });

    it('lỗi phía giao diện (save bản cũ) hiện ra và đóng được', () => {
    let s = run([{ type: 'error', message: 'save cũ' }]);
    expect(s.error).toBe('save cũ');
    expect(s.screen).toBe('menu');
    s = run([{ type: 'dismissError' }], s);
    expect(s.error).toBeNull();
  });

  it('v0.3: sự kiện chờ chọn dừng tua liên tục; STATE mang chợ và sự kiện', () => {
    const pending = { instance: 1, eventId: 'event.tax_collector', variant: null, params: {}, choices: [{ id: 'pay', costs: ['money' as const], locked: null }, { id: 'flee', costs: ['risk' as const], locked: null }], figure: null };
    let s = run([{ type: 'run', on: true }, msg({ type: 'EVENT', reqId: 7, pending })]);
    expect(s.running).toBe(false);
    expect(s.pending).toEqual(pending);
    const market = { county: 0, buyPrice: 46, sellPrice: 34, supply: 'normal' as const, trend: 'steady' as const, maxBuy: 10, maxSell: 0 };
    s = run([msg({ ...(state as Extract<WorkerMessage, { type: 'STATE' }>), market, pending: null })], s);
    expect(s.market).toEqual(market);
    expect(s.pending).toBeNull();
  });

  it('đời mới: menu → loading → birthplace → life', () => {
    let s = run([msg({ type: 'READY', protocolVersion: 1, simVersion: '0.1.0' }), { type: 'genStart' }]);
    expect(s.ready).toBe(true);
    expect(s.screen).toBe('loading');
    s = run([msg({ type: 'PROGRESS', reqId: 1, stage: 'progress.worldgen', pct: 40 }), msg(world)], s);
    expect(s.screen).toBe('birthplace');
    expect(s.progress).toBeNull();
    s = run([{ type: 'select', id: birthplaceId('r0/c1') }, { type: 'newLifeStart' }, msg({ type: 'LOG', reqId: 2, entries: [entry] }), msg(state)], s);
    expect(s.screen).toBe('life');
    expect(s.log).toHaveLength(1);
  });

  it('tải save: WORLD đến trước STATE nhưng không dừng ở màn chọn nơi sinh', () => {
    let s = run([{ type: 'loadStart' }, msg(world)]);
    expect(s.screen).toBe('loading');
    s = run([msg(state)], s);
    expect(s.screen).toBe('life');
    expect(s.loadingSave).toBe(false);
  });

  it('có biến thì dừng tua liên tục; chết thì sang tổng kết', () => {
    let s = run([{ type: 'run', on: true }]);
    expect(s.running).toBe(true);
    s = run([msg({ type: 'INTERRUPT', reqId: 3, entry })], s);
    expect(s.running).toBe(false);
    expect(s.interrupt).toEqual(entry);
    s = run([{ type: 'run', on: true }], s);
    expect(s.interrupt).toBeNull();
    s = run([msg({ type: 'INTERRUPT', reqId: 5, entry }), { type: 'advanceStart' }], s);
    expect(s.interrupt).toBeNull();
    const summary = { config: { worldSeed: 's', regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c1') }, name: 'A', birthTick: 0, deathTick: 9, ageYears: 0, cause: 'illness' as const, causeDetail: 'illness.cold', birthplaceId: birthplaceId('r0/c1'), milestones: [], estate: { money: 0, grain: 0, landMu: 0, tenure: 'none' as const }, hungerYears: 0, legacy: { spouse: null, children: [], friends: 0, enemies: 0, reputation: 'unknown' as const, factions: [] }, digest: 'x' };
    s = run([{ type: 'hasSave', value: true }, msg({ type: 'DIED', reqId: 4, summary })], s);
    expect(s.screen).toBe('summary');
    expect(s.running).toBe(false);
    expect(s.hasSave).toBe(false);
  });

  it('lỗi khi đang sinh thế giới thì về màn chính và hiện lỗi', () => {
    const s = run([{ type: 'genStart' }, msg({ type: 'ERROR', reqId: 1, code: 'INTERNAL', message: 'x' })]);
    expect(s.screen).toBe('menu');
    expect(s.error).toContain('INTERNAL');
  });
});
