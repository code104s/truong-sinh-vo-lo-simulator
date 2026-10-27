import { describe, expect, it } from 'vitest';
import { birthplaceId, regionId, vPendingEvent, type WorkerMessage } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { Life, Rng, SimHost, replaySave } from '../src/index';
import { EVENTS, WANDERING_PHYSICIAN_FEE } from '../src/events/catalog';
import { checkCatalog, makeContext, newEventsState, rollEvent, type EventDef } from '../src/events/engine';
import type { CharacterState } from '../src/life/character';
import type { LifeSnapshot } from '../src/life/life';

const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};

function snap(patch: (c: CharacterState, s: LifeSnapshot) => void = () => {}, seed = 'events'): LifeSnapshot {
  const l = Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }, region);
  const s = l.snapshot();
  s.character.birthTick = 0; s.tick = 20 * 36 + 3;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  s.character.personality = 'calm';
  patch(s.character, s);
  return s;
}
/** Đời đang chờ một sự kiện cụ thể. */
function pendingLife(eventId: string, patch: (c: CharacterState, s: LifeSnapshot) => void = () => {}): Life {
  const s = snap(patch);
  s.events.pending = { instance: 0, eventId, tick: s.tick - 1, variant: null, params: eventId === 'event.tax_collector' ? { amount: s.character.household.taxDebt } : {}, figure: null };
  s.events.nextInstance = 1;
  return Life.restore(s, [], region);
}

describe('tuyển tập sự kiện (ADR 0014)', () => {
  it('2–4 lựa chọn, mỗi lựa chọn có giá, lựa chọn cuối là lối ra không điều kiện, id duy nhất, sắp theo id', () => {
    expect(checkCatalog(EVENTS)).toBeNull();
    expect(EVENTS.map((d) => d.id)).toEqual([...EVENTS.map((d) => d.id)].sort());
    const bad: EventDef = { ...EVENTS[0]!, id: 'event.bad', choices: [EVENTS[0]!.choices[0]!] };
    expect(checkCatalog([bad])).toContain('2–4');
  });

  it('mỗi lựa chọn có giá thật: áp lên trạng thái mẫu thì mất một thứ gì đó hoặc tiêu một lần rút rủi ro', () => {
    for (const def of EVENTS) {
      for (const choice of def.choices) {
        const s = snap((c) => {
          c.personality = 'kind';
          c.household = { ...c.household, independent: true, money: 5_000, grain: 500, taxDebt: 200 };
          c.conditions = [{ id: 'illness.fever', kind: 'illness', severity: 'serious', weeksLeft: 4 }];
        });
        const before = JSON.stringify([s.character.household.money, s.character.household.grain, s.character.health, s.character.stamina, s.character.conditions.length, s.active]);
        const ctx = makeContext(s.character, s, s.economy, region, s.tick);
        expect(choice.available?.(ctx) ?? null, `${def.id}/${choice.id}`).toBeNull();
        const rng = Rng.fromSeed(3);
        const rngBefore = JSON.stringify(rng.state());
        choice.apply(ctx, rng);
        const c = s.character;
        const lost = c.household.money < 5_000 || c.household.grain < 500 || c.health < 1000 || c.stamina < 900 || s.active !== null;
        const rolled = JSON.stringify(rng.state()) !== rngBefore;
        expect(lost || rolled, `${def.id}/${choice.id}`).toBe(true);
        expect(JSON.stringify([c.household.money, c.household.grain, c.health, c.stamina, c.conditions.length, s.active]) !== before || rolled).toBe(true);
      }
    }
  });
});

describe('máy kích hoạt', () => {
  const always = (id: string): EventDef => ({ id, category: 'daily', weight: () => 1_000_000, cooldownTicks: 30, choices: EVENTS[0]!.choices });
  const ctxAt = (tick: number) => { const s = snap(); return makeContext(s.character, s, s.economy, region, tick); };

  it('không có ứng viên thì không rút RNG (tuần yên ổn không đổi luồng)', () => {
    const rng = Rng.fromSeed(1), before = rng.state();
    expect(rollEvent(newEventsState(), [{ ...always('event.x'), weight: () => 0 }], ctxAt(100), rng)).toBeNull();
    expect(rng.state()).toEqual(before);
  });

  it('đang chờ thì không rút thêm; mỗi tháng tối đa một sự kiện; tôn trọng thời gian chờ; chỉ-một-lần', () => {
    const st = newEventsState(), rng = Rng.fromSeed(1);
    const defs = [always('event.a'), always('event.b')];
    expect(rollEvent(st, defs, ctxAt(99), rng)?.eventId).toBe('event.a');
    expect(rollEvent(st, defs, ctxAt(100), rng)).toBeNull(); // đang chờ
    st.pending = null;
    expect(rollEvent(st, defs, ctxAt(101), rng)).toBeNull(); // cùng tháng (tick 99–101)
    expect(rollEvent(st, defs, ctxAt(102), rng)?.eventId).toBe('event.b'); // a còn trong thời gian chờ
    st.pending = null;
    expect(rollEvent(st, [{ ...always('event.once'), oncePerLife: true }], ctxAt(150), rng)?.eventId).toBe('event.once');
    st.pending = null;
    expect(rollEvent(st, [{ ...always('event.once'), oncePerLife: true }], ctxAt(300), rng)).toBeNull();
  });

  it('cùng trạng thái, cùng RNG thì cùng sự kiện (tất định)', () => {
    const run = () => { const st = newEventsState(); const rng = Rng.fromSeed(9); const out: string[] = []; for (let t = 0; t < 400; t += 3) { const p = rollEvent(st, EVENTS, ctxAt(t), rng); if (p) { out.push(`${t}:${p.eventId}`); st.pending = null; } } return out; };
    expect(run()).toEqual(run());
  });
});

describe('chờ và chọn trong đời', () => {
  it('đang chờ thì không tua được; chọn sai sự kiện hay lựa chọn đang khóa thì bị từ chối; chọn xong thì tua tiếp', () => {
    const l = pendingLife('event.beggar', (c) => { c.household.grain = 100; });
    expect(vPendingEvent.check(l.pendingEvent(), '$')).toBeNull();
    expect(() => l.advance('week')).toThrow();
    expect(l.choose(5, 'give')).toBe('sự kiện đã đổi');
    expect(l.choose(0, 'steal')).toBe('không có lựa chọn này');
    expect(l.pendingEvent()!.choices.find((c) => c.id === 'share_meal')!.locked).toBe('lock.personality');
    expect(l.choose(0, 'share_meal')).toContain('lock.personality');
    expect(l.choose(0, 'give')).toBeNull();
    expect(l.character.household.grain).toBe(90);
    expect(l.log.at(-1)).toMatchObject({ key: 'event.beggar.result.give', importance: 'major' });
    expect(l.pendingEvent()).toBeNull();
    expect(l.advance('week').status).not.toBe('event');
  });

  it('tính cách mở lựa chọn: người hiền hậu được nấu cơm giữ lại qua đêm', () => {
    const l = pendingLife('event.beggar', (c) => { c.household.grain = 100; c.personality = 'kind'; });
    expect(l.pendingEvent()!.choices.find((c) => c.id === 'share_meal')!.locked).toBeNull();
  });

  it('quan sai đòi thuế: thiếu tiền thì khóa nộp; đi phu chiếm hai ô và xóa nợ; tổng tiền không đổi khi nộp', () => {
    const broke = pendingLife('event.tax_collector', (c) => { c.household = { ...c.household, independent: true, taxDebt: 200, money: 50, grain: 500 }; });
    expect(broke.pendingEvent()!.choices.map((c) => [c.id, c.locked])).toEqual([['pay', 'lock.money'], ['corvee', null], ['flee', null]]);
    expect(broke.choose(0, 'corvee')).toBeNull();
    expect(broke.character.household.taxDebt).toBe(0);
    expect(broke.active).toMatchObject({ slot: { action: 'action.corvee' }, remaining: 2 });
    const stamina = broke.character.stamina;
    broke.advance('week'); broke.advance('week');
    expect(broke.active).toBeNull();
    expect(broke.character.stamina).toBeLessThan(stamina + 200);
    const rich = pendingLife('event.tax_collector', (c) => { c.household = { ...c.household, independent: true, taxDebt: 200, money: 500, grain: 500 }; });
    const total = rich.totalMoney();
    expect(rich.choose(0, 'pay')).toBeNull();
    expect([rich.character.household.money, rich.character.household.taxDebt, rich.totalMoney()]).toEqual([300, 0, total]);
  });

  it('trốn thuế: phúc duyên cao thì ít bị bắt hơn', () => {
    const caught = (luck: number) => {
      let n = 0;
      for (let i = 0; i < 200; i++) {
        const s = snap((c) => { c.luck = luck; c.household = { ...c.household, independent: true, taxDebt: 200 }; }, `flee-${i}`);
        const ctx = makeContext(s.character, s, s.economy, region, s.tick);
        if (EVENTS.find((d) => d.id === 'event.tax_collector')!.choices.at(-1)!.apply(ctx, Rng.fromSeed(i)).result === 'flee_caught') n++;
      }
      return n;
    };
    expect(caught(10)).toBeLessThan(caught(1));
  });

  it('thầy thuốc qua làng: trả tiền thì dứt bệnh, tiền vào quỹ quận', () => {
    const l = pendingLife('event.wandering_physician', (c) => {
      c.household.money = 1_000;
      c.conditions = [{ id: 'illness.fever', kind: 'illness', severity: 'serious', weeksLeft: 5 }];
    });
    const total = l.totalMoney();
    expect(l.choose(0, 'pay')).toBeNull();
    expect(l.character.conditions).toEqual([]);
    expect(l.character.household.money).toBe(1_000 - WANDERING_PHYSICIAN_FEE);
    expect(l.totalMoney()).toBe(total);
  });

  it('lưu khi đang chờ → tải → vẫn chờ, chọn giống nhau thì cùng digest', () => {
    const a = pendingLife('event.beggar', (c) => { c.household.grain = 100; });
    const b = Life.restore(JSON.parse(JSON.stringify(a.snapshot())), [], region);
    expect(b.pendingEvent()).toEqual(a.pendingEvent());
    a.choose(0, 'refuse'); b.choose(0, 'refuse');
    a.runToDeath(); b.runToDeath();
    expect(b.digest()).toBe(a.digest());
  });

  it('sự kiện xảy ra thật trong đời: người có lương trong túi sớm muộn gặp người xin ăn', () => {
    const l = Life.restore(snap((c) => { c.household.grain = 5_000; }), [], region);
    let seen = false;
    for (let k = 0; k < 40 && l.alive && !seen; k++) {
      const res = l.advance('year');
      if (res.status === 'event') { seen = res.pending.eventId === 'event.beggar'; l.choose(res.pending.instance, res.pending.choices.at(-1)!.id); }
    }
    expect(seen).toBe(true);
  });
});

describe('SimHost: EVENT, CHOOSE, phát lại', () => {
  it('ADVANCE khi đang chờ trả EVENT_PENDING, không vào nhật ký lệnh; CHOOSE vào nhật ký lệnh và phát lại cùng digest', () => {
    const out: WorkerMessage[] = [];
    // Vùng hai quận dựng tay; đời đi qua host thật để có nhật ký lệnh đầy đủ cho phát lại
    const bundle = { worldSeed: 'events', summary: { id: regionId('r0'), name: 'Làng', nameHan: '村', realmName: 'Lương', kmPerCell: 6, landKm2: 1000 }, map: { W: 1, H: 1, origin: { x: 0, y: 0 }, kmPerCell: 6, elevation: new Float32Array(1), water: new Float32Array(1), coastDist: new Float32Array(1), flow: new Float32Array(1), temperature: new Float32Array(1), biome: new Uint8Array(1), mask: new Uint8Array(1), county: new Int16Array(1), counties: [{ name: 'Làng', nameHan: '村', seat: { x: 0, y: 0 } }, { name: 'Trấn', nameHan: '鎮', seat: { x: 0, y: 0 } }], rivers: [], roads: [], labels: [] }, birthplaces: [{ id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 }], logic: region, placeVariant: 0, worldMs: 0 };
    const h = new SimHost((m) => out.push(m), { buildRegion: () => bundle });
    let id = 0;
    const send = (c: Record<string, unknown>) => { const from = out.length; h.handle({ ...c, reqId: ++id } as never); return out.slice(from); };
    send({ type: 'GEN_WORLD', worldSeed: 'events' });
    send({ type: 'NEW_LIFE', config: { worldSeed: 'events', regionId: 'r0', birthplaceId: 'r0/c0' } });
    // Tới 12 tuổi rồi hái lượm: túi có lương, người xin ăn sẽ tới
    while (!h.current.life!.view().canAct) send({ type: 'ADVANCE', mode: 'year' });
    send({ type: 'SET_PLAN', plan: { slots: [{ action: 'action.forage' }, { action: 'action.forage' }, { action: 'action.forage' }] } });
    let ev: Extract<WorkerMessage, { type: 'EVENT' }> | undefined;
    for (let k = 0; k < 60 && !ev; k++) ev = send({ type: 'ADVANCE', mode: 'year' }).find((m): m is Extract<WorkerMessage, { type: 'EVENT' }> => m.type === 'EVENT');
    expect(ev).toBeDefined();
    const state = out.filter((m) => m.type === 'STATE').at(-1) as Extract<WorkerMessage, { type: 'STATE' }>;
    expect(state.pending).toEqual(ev!.pending);
    const before = (send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>).save;
    expect(send({ type: 'ADVANCE', mode: 'week' })).toMatchObject([{ type: 'ERROR', code: 'EVENT_PENDING' }]);
    expect((send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>).save.commandLog).toEqual(before.commandLog);
    expect(replaySave(before)).toBe(before.digest); // phát lại được cả khi đang chờ
    const choice = ev!.pending.choices.at(-1)!.id;
    const res = send({ type: 'CHOOSE', instance: ev!.pending.instance, choice });
    expect(res.map((m) => m.type)).toEqual(['LOG', 'STATE']);
    expect((res[1] as Extract<WorkerMessage, { type: 'STATE' }>).pending).toBeNull();
    const after = (send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>).save;
    expect(after.commandLog.at(-1)!.cmd).toEqual({ type: 'CHOOSE', instance: ev!.pending.instance, choice });
    expect(replaySave(after)).toBe(after.digest);
    expect(send({ type: 'CHOOSE', instance: ev!.pending.instance, choice })).toMatchObject([{ type: 'ERROR', code: 'BAD_COMMAND' }]);
  });
});

describe('văn bản sự kiện', () => {
  it('mọi khóa mà tuyển tập có thể sinh ra đều có trong vi.ts (hồi quy: từng ghép thành event.event.…)', async () => {
    const { hasKey: has } = await import('@tsvl/content');
    for (const d of EVENTS) {
      expect(has(`${d.id}.title`), d.id).toBe(true);
      expect(has(`${d.id}.body`), d.id).toBe(true);
      expect(has(`event.cat.${d.category}`), d.id).toBe(true);
      for (const ch of d.choices) expect(has(`${d.id}.choice.${ch.id}`), `${d.id}/${ch.id}`).toBe(true);
    }
    // Khóa kết quả: chạy mọi lựa chọn trên nhiều seed để gặp đủ nhánh
    for (const d of EVENTS) for (const ch of d.choices) for (let i = 0; i < 40; i++) {
      const s = snap((c) => { c.personality = 'kind'; c.household = { ...c.household, independent: true, money: 5_000, grain: 500, taxDebt: 200 }; c.conditions = [{ id: 'illness.fever', kind: 'illness', severity: 'serious', weeksLeft: 4 }]; });
      const out = ch.apply(makeContext(s.character, s, s.economy, region, s.tick), Rng.fromSeed(i));
      expect(has(`${d.id}.result.${out.result}`), `${d.id}.result.${out.result}`).toBe(true);
    }
  });
});
