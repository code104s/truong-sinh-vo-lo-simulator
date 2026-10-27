import { decodeSave, encodeSave, parseWorkerMessage, type Command, type SaveFile, type WorkerMessage } from '@tsvl/shared';
import { buildRegion, type RegionBundle } from '@tsvl/worldgen';
import { beforeAll, describe, expect, it } from 'vitest';
import { HANDLED_LIMIT, SimHost, replaySave, Rng } from '../src/index';
import { hostAdvance } from './auto';

let region: RegionBundle;
beforeAll(() => {
  region = buildRegion('tsvl-01');
}, 60_000);

function host() {
  const out: WorkerMessage[] = [];
  const h = new SimHost((m) => {
    const r = parseWorkerMessage(m);
    if (!r.ok) throw new Error(`tin sai hợp đồng: ${r.error}`);
    out.push(m);
  }, { buildRegion: (_seed, progress) => (progress('worldgen', 50), progress('region', 100), region) });
  let reqId = 0;
  const send = (c: Record<string, unknown>) => {
    const start = out.length;
    h.handle({ ...c, reqId: ++reqId } as unknown as Command);
    return out.slice(start);
  };
  return { h, out, send };
}

const newLife = (send: ReturnType<typeof host>['send'], bpIndex = 1) => {
  send({ type: 'GEN_WORLD', worldSeed: 'tsvl-01' });
  return send({ type: 'NEW_LIFE', config: { worldSeed: 'tsvl-01', regionId: region.summary.id, birthplaceId: region.birthplaces[bpIndex]!.id } });
};

/** Tua theo năm tới khi chết; trả về tóm tắt. */
function liveOut(send: ReturnType<typeof host>['send']) {
  for (let k = 0; k < 5000; k++) {
    const msgs = hostAdvance(send, 'year');
    const died = msgs.find((m) => m.type === 'DIED');
    if (died && died.type === 'DIED') return died.summary;
    expect(msgs.some((m) => m.type === 'ERROR')).toBe(false);
  }
  throw new Error('không chết');
}

describe('SimHost', () => {
  it('READY rồi luồng chuẩn: GEN_WORLD → WORLD, NEW_LIFE → LOG + STATE', () => {
    const { h, out, send } = host();
    h.ready();
    expect(out[0]).toMatchObject({ type: 'READY', protocolVersion: 4 });
    const w = send({ type: 'GEN_WORLD', worldSeed: 'tsvl-01' });
    expect(w.map((m) => m.type)).toEqual(['PROGRESS', 'PROGRESS', 'WORLD']);
    const n = send({ type: 'NEW_LIFE', config: { worldSeed: 'tsvl-01', regionId: region.summary.id, birthplaceId: region.birthplaces[0]!.id } });
    expect(n.map((m) => m.type)).toEqual(['LOG', 'STATE']);
  });

  it('đi hết một đời bằng ADVANCE năm, kết thúc bằng DIED', () => {
    const { send } = host();
    newLife(send);
    const s = liveOut(send);
    expect(s.ageYears).toBeGreaterThanOrEqual(0);
    expect(send({ type: 'ADVANCE', mode: 'week' })).toMatchObject([{ type: 'ERROR', code: 'DEAD' }]);
  });

  it('INTERRUPT đi kèm STATE và đúng mục quan trọng', () => {
    const { send } = host();
    newLife(send, 2);
    const msgs = send({ type: 'ADVANCE', mode: 'untilEvent' });
    const types = msgs.map((m) => m.type);
    expect(types[0]).toBe('LOG');
    expect(types).toContain('STATE');
    expect(types.includes('INTERRUPT') || types.includes('DIED')).toBe(true);
  });

  it('lệnh sai và thứ tự sai trả ERROR đúng mã', () => {
    const { h, out, send } = host();
    h.handle({ type: 'FLY', reqId: 9 });
    expect(out.at(-1)).toMatchObject({ type: 'ERROR', code: 'BAD_COMMAND', reqId: 9 });
    expect(send({ type: 'ADVANCE', mode: 'week' })).toMatchObject([{ type: 'ERROR', code: 'NO_LIFE' }]);
    expect(send({ type: 'NEW_LIFE', config: { worldSeed: 'tsvl-01', regionId: 'r0', birthplaceId: 'r0/c1' } })).toMatchObject([{ type: 'ERROR', code: 'NO_WORLD' }]);
    send({ type: 'GEN_WORLD', worldSeed: 'tsvl-01' });
    expect(send({ type: 'NEW_LIFE', config: { worldSeed: 'tsvl-01', regionId: region.summary.id, birthplaceId: `${region.summary.id}/c99999` } })).toMatchObject([{ type: 'ERROR', code: 'BAD_COMMAND' }]);
  });

  it('SAVE giữa đời → LOAD ở host mới (qua JSON) → chạy tiếp cùng digest; bản đồ lấy từ save', () => {
    const a = host();
    newLife(a.send, 3);
    for (let k = 0; k < 20; k++) hostAdvance(a.send, 'year');
    const saved = a.send({ type: 'SAVE' }).find((m) => m.type === 'SAVED') as Extract<WorkerMessage, { type: 'SAVED' }>;
    const text = encodeSave(saved.save);
    const whole = liveOut(a.send);

    const out: WorkerMessage[] = [];
    const c = new SimHost((m) => out.push(m), { buildRegion: () => { throw new Error('không được sinh lại bản đồ khi tải'); } });
    const decoded = decodeSave(text);
    expect(decoded.ok).toBe(true);
    c.handle({ type: 'LOAD', reqId: 1, save: (decoded as { value: SaveFile }).value });
    expect(out.map((m) => m.type)).toEqual(['WORLD', 'LOG', 'STATE']);
    let summary = null;
    let rid = 1;
    const csend = (cmd: Record<string, unknown>) => { const from = out.length; c.handle({ ...cmd, reqId: ++rid } as unknown as Command); return out.slice(from); };
    for (let k = 0; k < 5000 && !summary; k++) {
      const d = hostAdvance(csend, 'year').find((m) => m.type === 'DIED');
      if (d && d.type === 'DIED') summary = d.summary;
    }
    expect(summary!.digest).toBe(whole.digest);
    expect(summary!.deathTick).toBe(whole.deathTick);
  });

  it('save bị sửa thì bị từ chối', () => {
    const a = host();
    newLife(a.send, 4);
    a.send({ type: 'ADVANCE', mode: 'year' });
    const saved = (a.send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>).save;
    const tampered = JSON.parse(encodeSave(saved));
    tampered.sim.character.lifespanBase += 3600;
    const back = decodeSave(JSON.stringify(tampered));
    expect(back.ok).toBe(true);
    const out: WorkerMessage[] = [];
    new SimHost((m) => out.push(m)).handle({ type: 'LOAD', reqId: 1, save: (back as { value: SaveFile }).value });
    expect(out).toMatchObject([{ type: 'ERROR', code: 'BAD_SAVE' }]);
  });
});

describe('SimHost — v0.2', () => {
  it('trẻ chưa được đặt kế hoạch; xem trước đường không đổi đời hay nhật ký lệnh', () => {
    const { send } = host();
    newLife(send);
    const before = send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>;
    const plan = { slots: [{ action: 'action.farm' }, { action: 'action.rest' }, { action: 'action.rest' }] };
    expect(send({ type: 'SET_PLAN', plan })).toMatchObject([{ type: 'ERROR', code: 'BAD_COMMAND' }]);
    const county = (before.save.sim as { character: { location: number } }).character.location === 0 ? 1 : 0;
    expect(send({ type: 'PREVIEW_TRAVEL', county })).toMatchObject([{ type: 'TRAVEL_PREVIEW' }]);
    const after = send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>;
    expect(after.save.digest).toBe(before.save.digest);
    expect(after.save.version).toBe(4);
    expect(after.save.commandLog).toEqual(before.save.commandLog);
    expect(after.save.commandLog[0]!.cmd.type).toBe('NEW_LIFE');
  });

  it('STATE mang nơi ở = quận nơi sinh, kế hoạch rỗng', () => {
    const { send } = host();
    const msgs = newLife(send, 2);
    const st = msgs.find((m) => m.type === 'STATE') as Extract<WorkerMessage, { type: 'STATE' }>;
    expect(st.character.location).toBe(region.birthplaces[2]!.county);
    expect(st.character.home).toBe(region.birthplaces[2]!.county);
    expect(st.plan).toBeNull();
    expect(st.actions).toEqual([]);
  });

  it('cùng reqId không áp dụng ADVANCE hai lần, payload khác bị từ chối', () => {
    const a = host(); newLife(a.send);
    a.h.handle({ type: 'ADVANCE', reqId: 900, mode: 'week' });
    const before = a.h.save();
    a.h.handle({ type: 'ADVANCE', reqId: 900, mode: 'week' });
    expect(a.h.save().digest).toBe(before.digest); expect(a.h.save().commandLog).toEqual(before.commandLog);
    a.h.handle({ type: 'ADVANCE', reqId: 900, mode: 'year' });
    expect(a.out.at(-1)).toMatchObject({ type: 'ERROR', code: 'BAD_COMMAND' });
  });

  it('save/tải host giữa chuyến đi giữ tiến độ, vị trí và giá đã trả', () => {
    // Nơi sinh đầu tiên mà đời sống tới 12 tuổi và có đích cần nhiều ô đi (từ S2 có đời chết đói khi còn nhỏ)
    const a = host();
    let target: { county: number; slots: number } | undefined;
    for (let bp = 0; bp < region.birthplaces.length && !target; bp++) {
      newLife(a.send, bp);
      while (a.h.current.life!.alive && !a.h.current.life!.view().canAct) hostAdvance(a.send, 'year');
      if (a.h.current.life!.alive) target = a.h.current.life!.travel().find((p) => p.slots > 1);
    }
    expect(target).toBeDefined();
    const life = a.h.current.life!;
    const plan = { slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] as { action: string; target?: number }[] };
    plan.slots[life.tick % 3] = { action: 'action.travel', target: target!.county };
    a.send({ type: 'SET_PLAN', plan }); a.send({ type: 'ADVANCE', mode: 'week' });
    expect(life.active?.remaining).toBeGreaterThan(0);
    const decoded = decodeSave(encodeSave(a.h.save())); if (!decoded.ok) throw new Error(decoded.error);
    const b = new SimHost(() => {}); b.load(decoded.value);
    a.send({ type: 'ADVANCE', mode: 'week' }); b.handle({ type: 'ADVANCE', reqId: 1, mode: 'week' });
    expect(b.save().digest).toBe(a.h.save().digest); expect(b.current.life!.character.location).toBe(life.character.location);
  });

  // v0.3 mục 6: chiến lược có seed gồm TRADE và CHOOSE; 200 tuần từ 12 tuổi để đi qua cả lập thân (S7)
  it('10 seed: kế hoạch ngẫu nhiên có seed, mua bán, sự kiện, lưu/tải giữa tháng, phát lại cùng digest', () => {
    let cameOfAge = 0;
    for (let i = 0; i < 10; i++) {
      const worldSeed = `replay-${i}`;
      const local = { ...region, worldSeed };
      const got: WorkerMessage[] = [];
      const a = new SimHost((m) => { if (m.type === 'ERROR') throw new Error(m.message); got.push(m); }, { buildRegion: () => local });
      let id = 0;
      const call = (c: Record<string, unknown>) => { const from = got.length; a.handle({ ...c, reqId: ++id }); return got.slice(from); };
      call({ type: 'GEN_WORLD', worldSeed });
      call({ type: 'NEW_LIFE', config: { worldSeed, regionId: local.summary.id, birthplaceId: local.birthplaces[0]!.id, lifeSeed: i } });
      while (a.current.life!.alive && !a.current.life!.view().canAct) hostAdvance(call, 'year');
      const rng = Rng.fromSeed(i);
      let trades = 0;
      for (let k = 0; k < 200 && a.current.life!.alive; k++) {
        const life = a.current.life!;
        const choices = life.actions().filter((x) => !x.locked && x.id !== 'action.travel');
        call({ type: 'SET_PLAN', plan: { slots: [0, 1, 2].map(() => ({ action: choices[rng.int(0, choices.length - 1)]!.id })) } });
        // Mua bán một đấu khi chắc được nhận (lệnh bị từ chối thì không vào nhật ký lệnh, test này coi là lỗi)
        const h = life.character.household, m = life.market();
        if (rng.int(0, 3) === 0) {
          if (h.grain >= 10 && m.maxSell >= 10) { call({ type: 'TRADE', grain: -10 }); trades++; }
          else if (h.money >= m.buyPrice + 1 && m.maxBuy >= 10) { call({ type: 'TRADE', grain: 10 }); trades++; }
        }
        hostAdvance(call, 'week');
      }
      const saved = a.save(); expect(replaySave(saved)).toBe(saved.digest);
      expect(saved.commandLog.filter((r) => r.cmd.type === 'TRADE')).toHaveLength(trades);
      if (a.current.life!.log.some((e) => e.key.startsWith('event.coming_of_age.result'))) cameOfAge++;
      const decoded = decodeSave(encodeSave(saved)); if (!decoded.ok) throw new Error(decoded.error);
      const b = new SimHost(() => {}); b.load(decoded.value);
      if (a.current.life!.alive) { call({ type: 'ADVANCE', mode: 'year' }); b.handle({ type: 'ADVANCE', reqId: 1, mode: 'year' }); }
      expect(b.save().digest).toBe(a.save().digest);
      const broken = { ...saved, commandLog: saved.commandLog.map((r) => ({ ...r })) }; broken.commandLog[0]!.seq = 1;
      expect(() => b.load(broken)).toThrow(/thứ tự/);
    }
    expect(cameOfAge).toBeGreaterThan(0);
  });
});

describe('SimHost — v0.3 Bước 0', () => {
  it('STATE có chợ quận đang đứng, sự kiện chờ null tới S5; TRADE, CHOOSE chưa nhận và không đổi đời', () => {
    const { send } = host();
    const born = newLife(send);
    const st = born.find((m) => m.type === 'STATE');
    expect(st).toMatchObject({ pending: null, market: { county: region.birthplaces[1]!.county } });
    if (st?.type === 'STATE') expect(st.character.household).toMatchObject({ independent: false, money: 0, grain: 0 });
    const before = send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>;
    expect(send({ type: 'TRADE', grain: 10 })).toMatchObject([{ type: 'ERROR', code: 'BAD_COMMAND' }]);
    expect(send({ type: 'CHOOSE', instance: 0, choice: 'pay' })).toMatchObject([{ type: 'ERROR', code: 'BAD_COMMAND' }]);
    const after = send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>;
    expect(after.save.digest).toBe(before.save.digest);
    expect(after.save.commandLog).toEqual(before.save.commandLog);
  });

  it('bộ đệm chống trùng có giới hạn (nợ v0.2), lệnh gửi lại gần đây vẫn không áp hai lần', () => {
    const { h, out, send } = host();
    newLife(send, 3); // đời này sống tới 85 tuổi, đủ dài cho 306 tuần
    for (let i = 0; i < HANDLED_LIMIT + 50; i++) send({ type: 'ADVANCE', mode: 'week' });
    expect(h.handledCount).toBe(HANDLED_LIMIT);
    const tick = h.current.life!.tick;
    const last = { type: 'ADVANCE', reqId: 10_000, mode: 'week' } as const;
    h.handle(last);
    const n = out.length;
    h.handle(last);
    expect(h.current.life!.tick).toBe(tick + 1);
    expect(out.length - n).toBeGreaterThan(0); // trả lại phản hồi cũ
  });
});

describe('SimHost — v0.3 S4: lệnh TRADE', () => {
  it('mua bán được ghi vào nhật ký lệnh, phát lại cùng digest; lệnh bị từ chối không ghi, không đổi đời', () => {
    const { h, send } = host();
    newLife(send, 3);
    while (!h.current.life!.view().canAct) hostAdvance(send, 'year');
    // Làm thuê/hái lượm vài tháng để có tiền và lương trong túi
    const kind = region.logic.settlementKind[h.current.life!.character.location];
    const work = kind === 'village' ? 'action.forage' : 'action.hire';
    send({ type: 'SET_PLAN', plan: { slots: [{ action: work }, { action: work }, { action: work }] } });
    for (let i = 0; i < 4; i++) hostAdvance(send, 'month');
    const hh = h.current.life!.character.household;
    const before = (send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>).save;
    expect(send({ type: 'TRADE', grain: hh.grain + 1 })[0]).toMatchObject({ type: 'ERROR', code: 'BAD_COMMAND' });
    expect((send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>).save.commandLog).toEqual(before.commandLog);
    const amount = hh.grain > 0 ? -1 : 1;
    const ok = send({ type: 'TRADE', grain: amount });
    expect(ok.map((m) => m.type)).toEqual(['STATE']);
    const save = (send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>).save;
    expect(save.commandLog.at(-1)!.cmd).toEqual({ type: 'TRADE', grain: amount });
    expect(save.digest).not.toBe(before.digest);
    expect(replaySave(save)).toBe(save.digest);
  });
});
