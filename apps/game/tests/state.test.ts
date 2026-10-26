import { birthplaceId, regionId, type CharacterView, type WorkerMessage } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { initialState, reduce, type Action, type AppState } from '../src/app/state';

const run = (actions: Action[], from: AppState = initialState) => actions.reduce(reduce, from);
const msg = (m: WorkerMessage): Action => ({ type: 'msg', m });

const map = { W: 1, H: 1, origin: { x: 0, y: 0 }, kmPerCell: 6, elevation: new Float32Array(1), water: new Float32Array(1), coastDist: new Float32Array(1), flow: new Float32Array(1), temperature: new Float32Array(1), biome: new Uint8Array(1), mask: new Uint8Array(1), county: new Int16Array(1), counties: [], rivers: [], roads: [], labels: [] };
const region = { id: regionId('r0'), name: 'Vị Kinh Châu', nameHan: '渭京州', realmName: 'Lương', kmPerCell: 6, landKm2: 1 };
const world: WorkerMessage = { type: 'WORLD', reqId: 1, worldSeed: 's', region, map, birthplaces: [] };
const character = { name: 'A', alive: true } as CharacterView;
const state: WorkerMessage = { type: 'STATE', reqId: 2, date: { tick: 1, year: 1, month: 1, tenDay: 1, season: 'spring' }, character, running: false, plan: null, slotIndex: 1, actions: [], travel: [] };
const entry = { tick: 1, key: 'log.birth', params: {}, importance: 'major' as const };

describe('máy trạng thái màn', () => {
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
    const summary = { config: { worldSeed: 's', regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c1') }, name: 'A', birthTick: 0, deathTick: 9, ageYears: 0, cause: 'illness' as const, causeDetail: 'illness.cold', birthplaceId: birthplaceId('r0/c1'), milestones: [], digest: 'x' };
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
