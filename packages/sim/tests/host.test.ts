import { decodeSave, encodeSave, parseWorkerMessage, type Command, type SaveFile, type WorkerMessage } from '@tsvl/shared';
import { buildRegion, type RegionBundle } from '@tsvl/worldgen';
import { beforeAll, describe, expect, it } from 'vitest';
import { SimHost } from '../src/index';

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
    const msgs = send({ type: 'ADVANCE', mode: 'year' });
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
    expect(out[0]).toMatchObject({ type: 'READY', protocolVersion: 2 });
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
    for (let k = 0; k < 20; k++) a.send({ type: 'ADVANCE', mode: 'year' });
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
    for (let k = 0; k < 5000 && !summary; k++) {
      out.length = 0;
      c.handle({ type: 'ADVANCE', reqId: 2 + k, mode: 'year' });
      const d = out.find((m) => m.type === 'DIED');
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

describe('SimHost — Bước 0 v0.2', () => {
  it('lệnh v0.2 hợp lệ về mặt hợp đồng nhưng chưa xử lý thì trả BAD_COMMAND, không làm đổi đời', () => {
    const { send } = host();
    newLife(send);
    const before = send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>;
    const plan = { slots: [{ action: 'action.farm' }, { action: 'action.rest' }, { action: 'action.rest' }] };
    expect(send({ type: 'SET_PLAN', plan })).toMatchObject([{ type: 'ERROR', code: 'BAD_COMMAND' }]);
    expect(send({ type: 'PREVIEW_TRAVEL', county: 0 })).toMatchObject([{ type: 'ERROR', code: 'BAD_COMMAND' }]);
    const after = send({ type: 'SAVE' })[0] as Extract<WorkerMessage, { type: 'SAVED' }>;
    expect(after.save.digest).toBe(before.save.digest);
    expect(after.save.version).toBe(2);
    expect(after.save.commandLog).toEqual([]);
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
});
