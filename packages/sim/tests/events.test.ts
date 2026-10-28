import { describe, expect, it } from 'vitest';
import { ageYearsAt, birthplaceId, regionId, vPendingEvent, type WorkerMessage } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { Life, Rng, SimHost, replaySave } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import { EVENTS, WANDERING_PHYSICIAN_FEE } from '../src/events/catalog';
import { checkCatalog, makeContext, newEventsState, rollEvent, type EventDef } from '../src/events/engine';
import type { CharacterState } from '../src/life/character';
import type { LifeSnapshot } from '../src/life/life';
import type { FactionState } from '../src/factions/state';
import { kinRole, PLAYER_ID } from '../src/npc/family';
import type { Bond } from '../src/social/bonds';

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
  pastComingOfAge(s);
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

  it('mỗi lựa chọn có giá thật: đổi trạng thái hoặc rút một lần rủi ro; nếu không thì giá khai báo là "mất cơ hội"', () => {
    for (const def of EVENTS) {
      for (const choice of def.choices) {
        const found = openFixture(def.id, choice.id);
        expect(found, `${def.id}/${choice.id}: không có trạng thái mẫu nào mở được`).not.toBeNull();
        const { s } = found!;
        const before = JSON.stringify([s.character, s.active, s.economy, s.events.flags]);
        const ctx = ctxOf(s);
        const rng = Rng.fromSeed(3);
        const rngBefore = JSON.stringify(rng.state());
        choice.apply(ctx, rng);
        const changed = JSON.stringify([s.character, s.active, s.economy, s.events.flags]) !== before;
        const rolled = JSON.stringify(rng.state()) !== rngBefore;
        expect(changed || rolled || choice.costs.includes('opportunity'), `${def.id}/${choice.id}`).toBe(true);
      }
    }
  });
});

/** Trạng thái mẫu cho phép mọi sự kiện xảy ra và mọi lựa chọn được thử: có tiền, lương, nợ, bệnh, ruộng, võ, chữ. */
function richSnap(personalityId: string, onRoad: boolean): LifeSnapshot {
  return snap((c, s) => {
    c.personality = personalityId;
    c.household = { ...c.household, independent: true, money: 5_000, grain: 500, taxDebt: 200, farmWeeks: 10, farmCounty: 0, tenure: 'tenant' };
    c.conditions = [{ id: 'illness.fever', kind: 'illness', severity: 'serious', weeksLeft: 4 }];
    c.skillXp.martial = 2_000; c.skillXp.literacy = 500; c.skillXp.hunting = 500;
    if (onRoad) s.active = { slot: { action: 'action.travel', target: 1 }, total: 2, remaining: 2, preview: { county: 1, route: [0, 1], days: 6, slots: 2, risk: 'risk.low' } };
    withFactions(s);
  });
}

/**
 * Thế lực mẫu (v0.6 S7): quan tham giữ cả hai quận, có một sai dịch ở quận 1; băng cướp sào huyệt quận 1 giữ đường 0–1;
 * thương hội ở quận 0; họ Trần đứng đầu quận 0. Người cầm đầu lấy từ cuối danh sách người lớn để người trong chuyện của
 * các sự kiện cũ (người đầu danh sách) không trùng.
 */
function withFactions(s: LifeSnapshot): void {
  const adults = (county: number) => s.npcs.people.filter((n) => !n.death && n.character.location === county && ageYearsAt(n.character.birthTick, s.tick) >= 20 && kinRole(s.character, n) === null);
  const fw = s.factions;
  const gov = fw.list.find((f) => f.kind === 'government')!;
  const official = adults(1)[0]!;
  official.occupation = 'official';
  Object.assign(gov, { counties: [0, 1], members: [official.id], leader: official.id, greed: 80, termEnds: s.tick + 360, money: 50_000, grain: 2_000 });
  const add = (o: Partial<FactionState> & Pick<FactionState, 'kind' | 'seat'>) => fw.list.push({
    id: `f${fw.nextId++}`, name: { key: `faction.${o.kind}.name`, params: { place: `Quận ${o.seat}` } }, counties: [], holds: [], roads: [], members: [], leader: null,
    power: 0, losses: 0, greed: 0, termEnds: 0, relations: [], money: 0, grain: 0, founded: 0, ended: null, ...o,
  });
  const robbers = adults(1).slice(1, 4);
  for (const n of robbers) n.occupation = 'bandit';
  add({ kind: 'bandits', seat: 1, roads: [0], members: robbers.map((n) => n.id), leader: robbers[0]!.id, money: 1_000, grain: 2_000 });
  const [head, merchant] = adults(0).slice(-2);
  add({ kind: 'guild', seat: 0, counties: [0], roads: [0], members: [merchant!.id], leader: merchant!.id, money: 20_000 });
  add({ kind: 'clan', seat: 0, name: { key: 'faction.clan.name', params: { surname: 'Trần', place: 'Quận 0' } }, counties: [0], members: [head!.id], leader: head!.id });
}
const ctxOf = (s: LifeSnapshot) => makeContext(s.character, s.events, s, s.economy, region, s.tick, s.npcs, s.bonds, s.reputation, s.factions);
const PERSONALITIES_TRY = ['calm', 'kind', 'hot_tempered', 'ambitious', 'cunning'];
/** Trạng thái mẫu đầu tiên mà lựa chọn đang mở. */
function openFixture(eventId: string, choiceId: string): { s: LifeSnapshot } | null {
  const def = EVENTS.find((d) => d.id === eventId)!;
  const choice = def.choices.find((c) => c.id === choiceId)!;
  for (const onRoad of [false, true]) for (const p of PERSONALITIES_TRY) {
    const s = richSnap(p, onRoad);
    if ((choice.available?.(ctxOf(s)) ?? null) === null) return { s };
  }
  return null;
}

describe('máy kích hoạt', () => {
  const always = (id: string): EventDef => ({ id, category: 'daily', weight: () => 1_000_000, cooldownTicks: 30, choices: EVENTS[0]!.choices });
  const ctxAt = (tick: number) => { const s = snap(); return makeContext(s.character, s.events, s, s.economy, region, tick); };

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
        const ctx = makeContext(s.character, s.events, s, s.economy, region, s.tick);
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
  it('mọi khóa mà tuyển tập có thể sinh ra đều có trong chuỗi nội dung (hồi quy: từng ghép thành event.event.…)', async () => {
    const { hasKey: has, t } = await import('@tsvl/content');
    const MISSING = /⟨|\{\w+\}/;
    for (const d of EVENTS) {
      expect(has(`${d.id}.title`), d.id).toBe(true);
      expect(has(`event.cat.${d.category}`), d.id).toBe(true);
      // Lời kể: mọi biến thể có thể ra trên các trạng thái mẫu
      for (const p of PERSONALITIES_TRY) for (const onRoad of [false, true]) {
        const s = richSnap(p, onRoad);
        const ctx = ctxOf(s);
        const v = d.variant?.(ctx) ?? null;
        const body = t(v ? `${d.id}.body.${v}` : `${d.id}.body`, d.params?.(ctx) ?? {});
        expect(body, `${d.id} ${v}`).not.toMatch(MISSING);
      }
      for (const ch of d.choices) {
        const s = richSnap('calm', false);
        expect(t(`${d.id}.choice.${ch.id}`, d.params?.(ctxOf(s)) ?? {}), `${d.id}/${ch.id}`).not.toMatch(MISSING);
        // Kết quả: chạy trên nhiều seed để gặp đủ nhánh
        for (let i = 0; i < 40; i++) {
          const f = openFixture(d.id, ch.id)!;
          const ctx = ctxOf(f.s);
          const params = d.params?.(ctx) ?? {};
          const out = ch.apply(ctx, Rng.fromSeed(i));
          const text = t(`${d.id}.result.${out.result}`, { ...params, ...out.params });
          expect(text, `${d.id}.result.${out.result}`).not.toMatch(MISSING);
        }
      }
    }
  });

  it('văn bản theo văn phong (docs/van-phong.md): không gọi người chơi, không sáo ngữ văn dịch, lựa chọn ≤ 10 chữ', async () => {
    const { VI } = await import('@tsvl/content');
    const BANNED = [/\bbạn\b/i, /\bngươi\b/i, /\bhắn\b/, /\bnàng\b/, /một tia/, /khẽ cười/, /thầm nghĩ/, /khóe miệng/, /vẻ mặt/, /không khỏi/];
    for (const [key, text] of Object.entries(VI)) {
      if (!key.startsWith('event.') || key.startsWith('event.cat.') || key.startsWith('event.cost.')) continue;
      for (const re of BANNED) expect(text, `${key}: ${re}`).not.toMatch(re);
      if (key.includes('.choice.')) expect(text.split(/\s+/).length, key).toBeLessThanOrEqual(10);
    }
  });
});

describe('người thật trong sự kiện (v0.4 S6)', () => {
  /** Dựng trạng thái mẫu để sự kiện gọi được người thật; trả trạng thái và người được chọn sẵn (theo `cast`). */
  function namedFixture(eventId: string): { s: LifeSnapshot; ctx: ReturnType<typeof makeContext>; def: EventDef } {
    const def = EVENTS.find((d) => d.id === eventId)!;
    const s = richSnap('calm', false);
    const alive = (county: number) => s.npcs.people.filter((n) => !n.death && n.character.location === county && ageYearsAt(n.character.birthTick, s.tick) >= 20);
    if (eventId === 'event.beggar') { const h = alive(0)[0]!.character.household; h.independent = true; h.hunger = 2; h.grain = 0; h.money = 0; }
    if (eventId === 'event.market_brawl') s.character.location = 1;
    // Cướp đường (v0.6 S7): đang đi trên đường băng cướp giữ
    if (eventId === 'event.highway_robbers') s.active = { slot: { action: 'action.travel', target: 1 }, total: 2, remaining: 2, preview: { county: 1, route: [0, 1], days: 6, slots: 2, risk: 'risk.high' } };
    if (eventId === 'event.village_funeral') { const n = alive(0)[0]!; n.character.alive = false; n.death = { tick: s.tick - 5, cause: 'old_age', detail: 'old_age.natural' }; }
    if (eventId === 'event.wandering_physician') alive(1)[0]!.occupation = 'physician';
    if (eventId === 'event.grain_broker') { const n = alive(1)[0]!; n.occupation = 'merchant'; n.character.household.money = 100_000; }
    // Gia đình (v0.5 S5): mẹ người chơi già, ốm ở cùng quận; hay vừa mất
    const mother = s.npcs.people.find((n) => n.id === s.character.kin.mother)!;
    if (eventId === 'event.parent_ill' || eventId === 'event.kin_funeral') { mother.character.location = s.character.location; mother.character.birthTick = s.tick - 60 * 36; }
    if (eventId === 'event.parent_ill') mother.character.conditions = [{ id: 'illness.fever', kind: 'illness', severity: 'serious', weeksLeft: 6 }];
    if (eventId === 'event.kin_funeral') { mother.character.alive = false; mother.death = { tick: s.tick - 2, cause: 'old_age', detail: 'old_age.natural' }; }
    // Quan hệ (v0.5 S7): một người lạ cùng quận (không phải người thân) đóng vai người trong chuyện
    const n = alive(0).find((x) => kinRole(s.character, x) === null)!;
    const bond = (b: Partial<Bond>) => { s.bonds.push({ id: n.id, closeness: 0, trust: 0, hostility: 0, owed: 0, ...b }); s.bonds.sort((a, b2) => Number(a.id.slice(1)) - Number(b2.id.slice(1))); };
    const unwed = () => { const sp = s.npcs.people.find((x) => x.id === n.character.kin.spouse); if (sp) sp.character.kin.spouse = null; n.character.kin.spouse = null; };
    if (eventId === 'event.granary_theft') { n.character.household.hunger = 2; n.character.birthTick = s.tick - 30 * 36; }
    if (eventId === 'event.neighbor_harvest') n.occupation = 'farmer';
    if (eventId === 'event.matchmaker') {
      unwed(); s.character.kin.spouse = null;
      Object.assign(n.character, { gender: s.character.gender === 'male' ? 'female' : 'male', birthTick: s.character.birthTick });
      n.character.household.independent = true;
    }
    if (eventId === 'event.village_wedding') Object.assign(n.character, { gender: 'female', birthTick: s.tick - 19 * 36 }), n.character.kin.spouse = 'n9999';
    if (eventId === 'event.friend_brings_rice') { bond({ closeness: 60 }); n.character.household.grain = 1_000; }
    if (eventId === 'event.enemy_revenge') bond({ hostility: 50 });
    if (eventId === 'event.child_ill') {
      Object.assign(n.character, { birthTick: s.tick - 8 * 36, conditions: [{ id: 'illness.fever', kind: 'illness', severity: 'serious', weeksLeft: 4 }] });
      // Con chỉ sinh từ cặp vợ chồng (S5): người chơi đã có vợ/chồng
      n.character.kin.father = PLAYER_ID; s.character.kin.spouse = 'n9999';
    }
    if (eventId === 'event.debt_called') bond({ owed: -30 });
    if (eventId === 'event.estate_dispute') {
      mother.character.alive = false; mother.death = { tick: s.tick - 4, cause: 'old_age', detail: 'old_age.natural' }; mother.character.kin.spouse = null;
      n.character.kin.mother = mother.id; n.character.household.independent = true;
    }
    if (eventId === 'event.friend_in_need') { bond({ closeness: 30 }); n.character.household.hunger = 2; }
    if (eventId === 'event.spouse_quarrel') { unwed(); s.character.kin.spouse = n.id; n.character.kin.spouse = PLAYER_ID; }
    if (eventId === 'event.clan_match') {
      unwed(); s.character.kin.spouse = null;
      Object.assign(n.character, { gender: s.character.gender === 'male' ? 'female' : 'male', birthTick: s.character.birthTick });
      n.character.household.independent = true;
      s.factions.list.find((f) => f.kind === 'clan')!.members.push(n.id);
    }
    const ctx = ctxOf(s);
    ctx.npc = def.cast!(ctx, Rng.fromSeed(1));
    return { s, ctx, def };
  }
  const NAMED = [
    'event.bandit_lure', 'event.bandit_raid', 'event.beggar', 'event.child_ill', 'event.clan_match', 'event.corvee_levy', 'event.debt_called', 'event.enemy_revenge',
    'event.estate_dispute', 'event.friend_brings_rice', 'event.friend_in_need', 'event.grain_broker', 'event.granary_theft', 'event.greedy_levy', 'event.highway_robbers',
    'event.join_caravan', 'event.kin_funeral', 'event.land_suit', 'event.market_brawl', 'event.matchmaker', 'event.neighbor_harvest', 'event.parent_ill', 'event.rent_hike',
    'event.report_bandits', 'event.spouse_quarrel', 'event.tax_collector', 'event.village_festival', 'event.village_funeral', 'event.village_wedding', 'event.wandering_physician',
  ];
  /** Biến thể có tên khác "named" ở trạng thái mẫu: họ Trần đứng đầu làng (S7). */
  const NAMED_VARIANT: Record<string, string> = { 'event.bandit_raid': 'named_clan', 'event.village_festival': 'clan' };

  it('ba mươi sự kiện gọi người thật (v0.5 S5 cha mẹ ốm, tang; S7 chín sự kiện quan hệ; v0.6 S7 sự kiện thế lực và sáu sự kiện cũ nối vào thế lực): biến thể có tên, thẻ là người ấy, mọi khóa văn bản đủ', async () => {
    const { t } = await import('@tsvl/content');
    const MISSING = /⟨|\{\w+\}/;
    expect(EVENTS.filter((d) => d.cast).map((d) => d.id)).toEqual(NAMED);
    for (const id of NAMED) {
      const { ctx, def } = namedFixture(id);
      const npc = ctx.npc!;
      expect(npc, id).not.toBeNull();
      const variant = NAMED_VARIANT[id] ?? 'named';
      expect(def.variant!(ctx), id).toBe(variant);
      const params = def.params!(ctx);
      expect(params.name, id).toBe(npc.character.name);
      expect(t(`${id}.body.${variant}`, params), id).not.toMatch(MISSING);
      expect(t(`${id}.body.${variant}`, params), id).toContain(npc.character.name);
      expect(def.figure!(ctx, Rng.fromSeed(2))?.npcId, id).toBe(npc.id);
      for (const ch of def.choices) {
        expect(t(`${id}.choice.${ch.id}`, params), `${id}/${ch.id}`).not.toMatch(MISSING);
        for (let i = 0; i < 20; i++) {
          const f = namedFixture(id);
          const out = ch.apply(f.ctx, Rng.fromSeed(i));
          expect(t(`${id}.result.${out.result}`, { ...params, ...out.params }), `${id}.result.${out.result}`).not.toMatch(MISSING);
        }
      }
    }
  });

  it('không có người hợp thì sự kiện về người vô danh như v0.3', () => {
    const s = richSnap('calm', false);
    const ctx = makeContext(s.character, s.events, s, s.economy, region, s.tick, s.npcs);
    for (const id of ['event.village_funeral', 'event.grain_broker']) {
      const def = EVENTS.find((d) => d.id === id)!;
      expect(def.cast!(ctx, Rng.fromSeed(1)), id).toBeNull();
      expect(def.variant?.(ctx) ?? null, id).toBeNull();
    }
  });

  it('lựa chọn tác động lên người thật: gạo, bạc qua tay người ấy, tiền không sinh ra mất đi; lảng đi thì người ấy bị thương', () => {
    const money = (f: { s: LifeSnapshot }) => f.s.character.household.money + f.s.npcs.people.reduce((a, n) => a + n.character.household.money, 0) + f.s.economy.counties.reduce((a, c) => a + c.money, 0);
    // Cho người xin ăn: gạo sang kho người ấy
    let f = namedFixture('event.beggar');
    const grain0 = f.ctx.npc!.character.household.grain, mine = f.s.character.household.grain;
    EVENTS.find((d) => d.id === 'event.beggar')!.choices.find((c) => c.id === 'give')!.apply(f.ctx, Rng.fromSeed(1));
    expect(f.ctx.npc!.character.household.grain - grain0).toBe(mine - f.s.character.household.grain);
    expect(f.ctx.npc!.character.household.grain).toBeGreaterThan(grain0);
    // Bán cho thương lái: bạc từ túi thương nhân, lúa vào kho thương nhân, quỹ quận không đổi
    f = namedFixture('event.grain_broker');
    const before = money(f), purse = f.ctx.npc!.character.household.money, county = f.s.economy.counties[0]!.money;
    const out = EVENTS.find((d) => d.id === 'event.grain_broker')!.choices.find((c) => c.id === 'sell')!.apply(f.ctx, Rng.fromSeed(1));
    expect(out.params!.money).toBeGreaterThan(0);
    expect(purse - f.ctx.npc!.character.household.money).toBe(out.params!.money);
    expect(f.s.economy.counties[0]!.money).toBe(county);
    expect(money(f)).toBe(before);
    // Ẩu đả: lảng đi thì người ấy bị đánh
    f = namedFixture('event.market_brawl');
    expect(EVENTS.find((d) => d.id === 'event.market_brawl')!.choices.find((c) => c.id === 'walk_away')!.apply(f.ctx, Rng.fromSeed(1)).result).toBe('walk_away_named');
    expect(f.ctx.npc!.character.conditions.some((c) => c.kind === 'injury')).toBe(true);
  });

  it('sự kiện chờ ghi id người thật, người ấy vào danh sách đã gặp; tải lại vẫn đọc ra người ấy, chọn xong nhật ký có tên', () => {
    const { s, ctx, def } = namedFixture('event.village_funeral');
    // Trọng số dưới một triệu: thử vài seed tới khi sự kiện ra
    let p = null;
    for (let i = 0; !p; i++) p = rollEvent(s.events, [def], ctx, Rng.fromSeed(i));
    expect(p.npcId).toBe(ctx.npc!.id);
    expect(p.figure?.npcId).toBe(ctx.npc!.id);
    expect(s.events.met).toEqual([ctx.npc!.id]);
    const l = Life.restore(s, [], region);
    expect(vPendingEvent.check(l.pendingEvent(), '$')).toBeNull();
    expect(l.pendingEvent()!.figure?.npcId).toBe(ctx.npc!.id);
    expect(l.choose(p.instance, 'stay_away')).toBeNull();
    expect(l.log.at(-1)).toMatchObject({ key: 'event.village_funeral.result.stay_away' });
    expect(l.log.at(-1)!.params.name).toBe(ctx.npc!.character.name);
  });
});

describe('sự kiện thế lực (v0.6 S7, Q10)', () => {
  const def = (id: string) => EVENTS.find((d) => d.id === id)!;
  const choice = (id: string, c: string) => def(id).choices.find((x) => x.id === c)!;
  const factionOf = (s: LifeSnapshot, kind: string) => s.factions.list.find((f) => f.kind === kind)!;
  /** Sổ cái: quỹ quận + túi người chơi + túi NPC + kho thế lực. */
  const ledger = (s: LifeSnapshot) => s.character.household.money + s.npcs.people.reduce((a, n) => a + n.character.household.money, 0)
    + s.economy.counties.reduce((a, c) => a + c.money, 0) + s.factions.list.reduce((a, f) => a + f.money, 0);
  const FACTION_IDS = ['event.bandit_lure', 'event.bandit_raid', 'event.clan_match', 'event.corvee_levy', 'event.greedy_levy', 'event.join_caravan', 'event.land_suit', 'event.relief_line', 'event.report_bandits'];

  it('chín sự kiện mới; mỗi lựa chọn của chúng và của sáu sự kiện cũ nối thế lực giữ sổ cái (tiền chuyển qua kho thế lực, túi người thật)', () => {
    expect(EVENTS.filter((d) => FACTION_IDS.includes(d.id)).length).toBe(9);
    const linked = ['event.grain_broker', 'event.highway_robbers', 'event.rent_hike', 'event.tax_collector', 'event.usurer', 'event.village_festival'];
    for (const id of [...FACTION_IDS, ...linked]) for (const ch of def(id).choices) for (let i = 0; i < 10; i++) {
      const f = openFixture(id, ch.id)!;
      const ctx = ctxOf(f.s);
      ctx.npc = def(id).cast?.(ctx, Rng.fromSeed(i)) ?? null;
      const before = ledger(f.s);
      ch.apply(ctx, Rng.fromSeed(i));
      expect(ledger(f.s), `${id}/${ch.id}`).toBe(before);
    }
  });

  it('điều kiện theo thế lực thật: không có quan phủ, cướp, thương hội, họ lớn thì không xảy ra; quan tham mới sách nhiễu, quan thanh liêm mới phát chẩn', () => {
    const s = richSnap('calm', false);
    s.character.gender = 'male';
    Object.assign(s.character.household, { money: 1_000, grain: 50, landMu: 0, tenure: 'owner', hunger: 2 });
    s.tick = 20 * 36 + 3 * 11 + 1; // tháng Mười hai: mùa bắt phu
    s.active = null;
    const w = (id: string, snap = s) => def(id).weight(ctxOf(snap));
    expect(w('event.corvee_levy')).toBeGreaterThan(0);
    expect(w('event.greedy_levy')).toBeGreaterThan(0);
    expect(w('event.bandit_lure')).toBeGreaterThan(0);
    expect(w('event.join_caravan')).toBeGreaterThan(0);
    // Đói kém ở quận đang đứng: quan tham không chẩn, quan thanh liêm chẩn
    s.economy.counties[0]!.grain = 0;
    expect(w('event.relief_line')).toBe(0);
    factionOf(s, 'government').greed = 10;
    expect(w('event.relief_line')).toBeGreaterThan(0);
    expect(w('event.greedy_levy')).toBe(0);
    // Không còn thế lực nào: không sự kiện thế lực nào xảy ra
    const bare = structuredClone(s);
    bare.factions.list = [];
    for (const id of FACTION_IDS) expect(w(id, bare), id).toBe(0);
    // Quận cát cứ: quan phủ không bắt phu ở đó
    factionOf(s, 'government').counties = [1];
    expect(w('event.corvee_levy')).toBe(0);
  });

  it('tiền đi đúng chỗ: nộp miễn phu vào kho quan phủ; mãi lộ trên đường cướp vào kho băng; nộp nợ thuế ghi vào thuế quận', () => {
    let f = openFixture('event.corvee_levy', 'pay_off')!;
    const gov = factionOf(f.s, 'government'), g0 = gov.money;
    const out = choice('event.corvee_levy', 'pay_off').apply(ctxOf(f.s), Rng.fromSeed(1));
    expect(gov.money - g0).toBe(out.params!.money);
    expect(out.params!.money).toBe(2 * 200 * f.s.economy.counties[0]!.taxPct / 100);
    f = { s: richSnap('calm', true) };
    const band = factionOf(f.s, 'bandits'), b0 = band.money;
    const paid = choice('event.highway_robbers', 'pay').apply(ctxOf(f.s), Rng.fromSeed(1)).params!.money as number;
    expect(paid).toBeGreaterThan(0);
    expect(band.money - b0).toBe(paid);
    f = openFixture('event.tax_collector', 'pay')!;
    const debt = f.s.character.household.taxDebt, tax0 = f.s.economy.counties[0]!.taxMoney;
    choice('event.tax_collector', 'pay').apply(ctxOf(f.s), Rng.fromSeed(1));
    expect(f.s.economy.counties[0]!.taxMoney - tax0).toBe(debt);
  });

  it('tố cáo cướp: bắt được thì người ấy rời băng, về nghề cũ; được thưởng từ kho quan phủ', () => {
    for (let i = 0; i < 40; i++) {
      const s = richSnap('calm', false);
      const ctx = ctxOf(s);
      ctx.npc = def('event.report_bandits').cast!(ctx, Rng.fromSeed(i));
      const band = factionOf(s, 'bandits'), gov = factionOf(s, 'government'), g0 = gov.money;
      const out = choice('event.report_bandits', 'report').apply(ctx, Rng.fromSeed(i));
      if (out.result !== 'report_caught') continue;
      expect(band.members).not.toContain(ctx.npc!.id);
      expect(ctx.npc!.occupation).not.toBe('bandit');
      expect(g0 - gov.money).toBe(out.params!.reward);
      return;
    }
    throw new Error('40 lần không bắt được ai');
  });

  it('vay thương hội: tiền từ kho hội, ghi chủ nợ; tới hạn trả về kho hội; tổng tiền không đổi', () => {
    const s = richSnap('calm', false);
    Object.assign(s.character.household, { money: 0, grain: 0, hunger: 1, loan: 0 });
    const guild = factionOf(s, 'guild'), m0 = guild.money;
    const ctx = ctxOf(s);
    expect(def('event.usurer').variant!(ctx)).toBe('guild');
    choice('event.usurer', 'borrow').apply(ctx, Rng.fromSeed(1));
    expect([m0 - guild.money, s.character.household.money, s.character.household.lender]).toEqual([300, 300, guild.id]);
    // Tới hạn ngay tuần đầu tháng này (không phải đầu quý): đủ tiền trả thì trả về kho hội, xóa chủ nợ
    Object.assign(s.character.household, { money: 1_000, loanDue: s.tick });
    s.events.pending = null;
    const l = Life.restore(s, [], region);
    const total = l.totalMoney(), m1 = guild.money;
    autoAdvance(l, 'week', lastChoice);
    const after = l.snapshot();
    expect([after.character.household.loan, after.character.household.lender]).toEqual([0, null]);
    expect(after.factions.list.find((f) => f.id === guild.id)!.money - m1).toBe(300 * 136 / 100);
    expect(l.totalMoney()).toBe(total);
  });
});
