// SimHost: nhận Command, phát WorkerMessage (ADR 0001). Thuần, không dùng Worker API:
// worker trong apps/game và CLI trong tools/headless dùng chung ⇒ cùng chuỗi lệnh cho cùng digest.
import {
  PROTOCOL_VERSION, SAVE_FORMAT, SAVE_VERSION, calendarOf, parseCommand, parseWith,
  type Command, type CommandRecord, type RecordedCommand, type ErrorCode, type SaveFile, type WorkerMessage, type WorldSeed,
} from '@tsvl/shared';
import { buildRegion as defaultBuildRegion, type RegionBundle, type RegionLogic, type RegionProgress } from '@tsvl/worldgen';
import { Life, SIM_VERSION } from './life/life';
import { vLifeSnapshot } from './life/validate';
import { canonical } from './core/digest';
import { checkSavedLogic } from './life/region';

export type Emit = (m: WorkerMessage) => void;

export interface HostOptions {
  /** Thay bộ sinh vùng (test, batch dùng cache). */
  buildRegion?: (seed: WorldSeed, progress: RegionProgress) => RegionBundle;
}

/** Phát lại bằng bản đồ trong save, không sinh lại địa hình (ADR 0011). */
export function replaySave(save: SaveFile): string {
  const out: WorkerMessage[] = [];
  const source = new SimHost(() => {}); source.load(save);
  const region = source.current.region!;
  const host = new SimHost((m) => out.push(m), { buildRegion: () => region });
  let reqId = 0;
  host.handle({ type: 'GEN_WORLD', reqId: ++reqId, worldSeed: save.worldSeed });
  for (const record of save.commandLog) {
    if (record.cmd.type !== 'NEW_LIFE' && host.current.life?.tick !== record.tick) throw new Error(`tick phát lại lệch ở lệnh ${record.seq}`);
    out.length = 0;
    host.handle({ ...record.cmd, reqId: ++reqId });
    const error = out.find((m) => m.type === 'ERROR');
    if (error?.type === 'ERROR') throw new Error(`lệnh ${record.seq}: ${error.message}`);
    if (record.cmd.type === 'NEW_LIFE' && host.current.life?.tick !== record.tick) throw new Error('tick đời mới không khớp');
  }
  const digest = host.current.life!.digest();
  if (digest !== save.digest) throw new Error(`digest phát lại ${digest} không khớp ${save.digest}`);
  return digest;
}

class HostError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
  }
}

interface SavedRegionLogic {
  placeVariant: number;
  logic: RegionLogic;
}

/**
 * Số lệnh gần nhất được nhớ để chống áp dụng trùng khi UI gửi lại (cùng reqId).
 * UI tăng reqId đơn điệu và chỉ gửi lại lệnh vừa gửi, nên giữ cửa sổ ngắn là đủ; trước v0.3 bộ đệm không giới hạn.
 */
export const HANDLED_LIMIT = 256;

export class SimHost {
  private region: RegionBundle | null = null;
  private life: Life | null = null;
  private readonly build: NonNullable<HostOptions['buildRegion']>;
  private commandLog: CommandRecord[] = [];
  private readonly handled = new Map<number, { key: string; messages: WorkerMessage[] }>();
  private response: WorkerMessage[] | null = null;

  constructor(private readonly send: Emit, opts: HostOptions = {}) {
    this.build = opts.buildRegion ?? defaultBuildRegion;
  }

  private emit(m: WorkerMessage): void { this.response?.push(m); this.send(m); }
  private record(cmd: RecordedCommand): void { this.commandLog.push({ seq: this.commandLog.length, tick: this.requireLife().tick, cmd: JSON.parse(JSON.stringify(cmd)) as RecordedCommand }); }

  ready(): void {
    this.emit({ type: 'READY', protocolVersion: PROTOCOL_VERSION, simVersion: SIM_VERSION });
  }

  /** Vùng và đời hiện tại (CLI, test). */
  get current(): { region: RegionBundle | null; life: Life | null } {
    return { region: this.region, life: this.life };
  }

  /** Số lệnh đang nhớ để chống trùng (test). */
  get handledCount(): number {
    return this.handled.size;
  }

  handle(u: unknown): void {
    const parsed = parseCommand(u);
    if (!parsed.ok) {
      const reqId = typeof u === 'object' && u !== null && Number.isSafeInteger((u as { reqId?: unknown }).reqId) ? (u as { reqId: number }).reqId : null;
      this.emit({ type: 'ERROR', reqId, code: 'BAD_COMMAND', message: parsed.error });
      return;
    }
    const cmd = parsed.value;
    const mutates = cmd.type === 'NEW_LIFE' || cmd.type === 'SET_PLAN' || cmd.type === 'ADVANCE' || cmd.type === 'TRADE' || cmd.type === 'CHOOSE';
    const key = mutates ? canonical(cmd) : '';
    const cached = mutates ? this.handled.get(cmd.reqId) : undefined;
    if (cached) {
      if (cached.key !== key) this.emit({ type: 'ERROR', reqId: cmd.reqId, code: 'BAD_COMMAND', message: 'reqId đã dùng cho lệnh khác' });
      else for (const m of cached.messages) this.send(m);
      return;
    }
    try {
      this.response = [];
      this.dispatch(cmd);
      if (mutates) {
        this.handled.set(cmd.reqId, { key, messages: this.response });
        // Map giữ thứ tự chèn: phần tử đầu là lệnh cũ nhất
        if (this.handled.size > HANDLED_LIMIT) this.handled.delete(this.handled.keys().next().value!);
      }
    } catch (e) {
      const err = e instanceof HostError ? e : new HostError('INTERNAL', (e as Error).message ?? String(e));
      this.emit({ type: 'ERROR', reqId: cmd.reqId, code: err.code, message: err.message });
    } finally { this.response = null; }
  }

  private dispatch(cmd: Command): void {
    switch (cmd.type) {
      case 'GEN_WORLD': {
        this.handled.clear(); this.commandLog = [];
        this.life = null;
        this.region = null;
        const region = this.build(cmd.worldSeed, (stage, pct) => this.emit({ type: 'PROGRESS', reqId: cmd.reqId, stage: `progress.${stage}`, pct }));
        this.region = region;
        this.emitWorld(cmd.reqId);
        return;
      }
      case 'NEW_LIFE': {
        const r = this.region;
        const { config } = cmd;
        if (!r || r.worldSeed !== config.worldSeed || r.summary.id !== config.regionId) throw new HostError('NO_WORLD', 'chưa sinh thế giới/vùng khớp cấu hình');
        const bp = r.birthplaces.find((b) => b.id === config.birthplaceId);
        if (!bp) throw new HostError('BAD_COMMAND', `không có nơi sinh ${config.birthplaceId}`);
        this.life = Life.create(config, bp, r.logic);
        this.handled.clear(); this.commandLog = [];
        this.record({ type: 'NEW_LIFE', config });
        this.emit({ type: 'LOG', reqId: cmd.reqId, entries: [...this.life.log] });
        this.emitState(cmd.reqId);
        return;
      }
      case 'ADVANCE': {
        const life = this.requireLife();
        if (!life.alive) throw new HostError('DEAD', 'nhân vật đã chết');
        // Chưa chọn thì thời gian không trôi (ADR 0014); lệnh bị từ chối không vào nhật ký lệnh
        if (life.pendingEvent()) throw new HostError('EVENT_PENDING', 'còn sự kiện chờ chọn');
        this.record({ type: 'ADVANCE', mode: cmd.mode });
        const res = life.advance(cmd.mode);
        if (res.entries.length) this.emit({ type: 'LOG', reqId: cmd.reqId, entries: res.entries });
        if (res.status === 'stuck') throw new HostError('INTERNAL', `tua tới khi có biến vượt giới hạn an toàn ở tick ${life.tick}`);
        if (res.status === 'interrupted') this.emit({ type: 'INTERRUPT', reqId: cmd.reqId, entry: res.entry });
        if (res.status === 'event') this.emit({ type: 'EVENT', reqId: cmd.reqId, pending: res.pending });
        this.emitState(cmd.reqId);
        if (res.status === 'died') this.emit({ type: 'DIED', reqId: cmd.reqId, summary: life.summary() });
        return;
      }
      case 'SET_PLAN': {
        const life = this.requireLife();
        if (!life.setPlan(cmd.plan)) throw new HostError('BAD_COMMAND', 'chưa đủ tuổi hoặc kế hoạch không hợp lệ');
        this.record({ type: 'SET_PLAN', plan: cmd.plan });
        this.emitState(cmd.reqId); return;
      }
      case 'PREVIEW_TRAVEL': {
        const life = this.requireLife();
        if (!life.alive) throw new HostError('DEAD', 'nhân vật đã chết');
        const preview = life.previewTravel(cmd.county);
        if (!preview) throw new HostError('BAD_COMMAND', 'đích đi không hợp lệ');
        this.emit({ type: 'TRAVEL_PREVIEW', reqId: cmd.reqId, preview }); return;
      }
      case 'TRADE': {
        const life = this.requireLife();
        if (!life.alive) throw new HostError('DEAD', 'nhân vật đã chết');
        const refused = life.trade(cmd.grain);
        if (refused) throw new HostError('BAD_COMMAND', refused);
        this.record({ type: 'TRADE', grain: cmd.grain });
        this.emitState(cmd.reqId); return;
      }
      case 'CHOOSE': {
        const life = this.requireLife();
        if (!life.alive) throw new HostError('DEAD', 'nhân vật đã chết');
        const from = life.log.length;
        const refused = life.choose(cmd.instance, cmd.choice);
        if (refused) throw new HostError('BAD_COMMAND', refused);
        this.record({ type: 'CHOOSE', instance: cmd.instance, choice: cmd.choice });
        this.emit({ type: 'LOG', reqId: cmd.reqId, entries: life.log.slice(from) });
        this.emitState(cmd.reqId); return;
      }
      case 'PAUSE':
        // Tua chạy đồng bộ và xong trong vài mili giây, nên không có gì đang chạy để dừng.
        if (this.life) this.emitState(cmd.reqId);
        return;
      case 'SAVE':
        this.emit({ type: 'SAVED', reqId: cmd.reqId, save: this.save() });
        return;
      case 'LOAD':
        this.load(cmd.save);
        this.emitWorld(cmd.reqId);
        this.emit({ type: 'LOG', reqId: cmd.reqId, entries: [...this.life!.log] });
        this.emitState(cmd.reqId);
        if (!this.life!.alive) this.emit({ type: 'DIED', reqId: cmd.reqId, summary: this.life!.summary() });
        return;
    }
  }

  private requireLife(): Life {
    if (!this.life) throw new HostError('NO_LIFE', 'chưa có đời nào');
    return this.life;
  }

  private emitWorld(reqId: number): void {
    const r = this.region!;
    this.emit({ type: 'WORLD', reqId, worldSeed: r.worldSeed, region: r.summary, map: r.map, birthplaces: r.birthplaces });
  }

  private emitState(reqId: number): void {
    const life = this.requireLife();
    const a = life.active;
    this.emit({ type: 'STATE', reqId, date: calendarOf(life.displayTick), character: life.view(), running: false, plan: life.plan,
      active: a ? { action: a.slot.action, remaining: a.remaining, total: a.total, ...(a.slot.target === undefined ? {} : { target: a.slot.target }) } : null,
      slotIndex: calendarOf(life.displayTick).tenDay, actions: life.view().canAct ? life.actions() : [], travel: life.view().canAct ? life.travel() : [],
      market: life.market(), pending: life.pendingEvent() });
  }

  save(): SaveFile {
    const life = this.requireLife();
    const r = this.region!;
    const logic: SavedRegionLogic = { placeVariant: r.placeVariant, logic: r.logic };
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      simVersion: SIM_VERSION,
      worldSeed: r.worldSeed,
      region: { summary: r.summary, map: r.map, birthplaces: r.birthplaces, logic },
      sim: life.snapshot(),
      log: [...life.log],
      commandLog: this.commandLog.map((r) => ({ ...r, cmd: JSON.parse(JSON.stringify(r.cmd)) as RecordedCommand })),
      digest: life.digest(),
    };
  }

  /** Tải save: bản đồ lấy từ save, không sinh lại (GDD 10.2). */
  load(save: SaveFile): void {
    if (save.simVersion !== SIM_VERSION) throw new HostError('VERSION', `save của sim ${save.simVersion}, bản này là ${SIM_VERSION}`);
    const snap = parseWith(vLifeSnapshot, save.sim, '$save.sim');
    if (!snap.ok) throw new HostError('BAD_SAVE', snap.error);
    const saved = save.region.logic as SavedRegionLogic;
    if (!saved || typeof saved !== 'object' || !saved.logic || !Number.isSafeInteger(saved.placeVariant)) throw new HostError('BAD_SAVE', 'thiếu lớp logic vùng');
    if (snap.value.config.worldSeed !== save.worldSeed || snap.value.config.regionId !== save.region.summary.id) throw new HostError('BAD_SAVE', 'đời không thuộc vùng trong save');
    const error = checkSavedLogic(saved.logic, save, snap.value);
    if (error) throw new HostError('BAD_SAVE', error);
    const life = Life.restore(snap.value, save.log, saved.logic);
    if (life.digest() !== save.digest) throw new HostError('BAD_SAVE', 'digest không khớp: save bị hỏng hoặc bị sửa');
    this.region = {
      worldSeed: save.worldSeed,
      summary: save.region.summary,
      map: save.region.map,
      birthplaces: save.region.birthplaces,
      logic: saved.logic,
      placeVariant: saved.placeVariant,
      worldMs: 0,
    };
    this.life = life;
    this.commandLog = save.commandLog.map((r) => ({ ...r, cmd: JSON.parse(JSON.stringify(r.cmd)) as RecordedCommand }));
    this.handled.clear();
  }
}
