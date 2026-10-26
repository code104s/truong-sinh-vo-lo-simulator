// SimHost: nhận Command, phát WorkerMessage (ADR 0001). Thuần, không dùng Worker API:
// worker trong apps/game và CLI trong tools/headless dùng chung ⇒ cùng chuỗi lệnh cho cùng digest.
import {
  PROTOCOL_VERSION, SAVE_FORMAT, SAVE_VERSION, calendarOf, parseCommand, parseWith,
  type Command, type ErrorCode, type SaveFile, type WorkerMessage, type WorldSeed,
} from '@tsvl/shared';
import { buildRegion as defaultBuildRegion, type RegionBundle, type RegionLogic, type RegionProgress } from '@tsvl/worldgen';
import { Life, SIM_VERSION } from './life/life';
import { vLifeSnapshot } from './life/validate';

export type Emit = (m: WorkerMessage) => void;

export interface HostOptions {
  /** Thay bộ sinh vùng (test, batch dùng cache). */
  buildRegion?: (seed: WorldSeed, progress: RegionProgress) => RegionBundle;
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

export class SimHost {
  private region: RegionBundle | null = null;
  private life: Life | null = null;
  private readonly build: NonNullable<HostOptions['buildRegion']>;

  constructor(private readonly emit: Emit, opts: HostOptions = {}) {
    this.build = opts.buildRegion ?? defaultBuildRegion;
  }

  ready(): void {
    this.emit({ type: 'READY', protocolVersion: PROTOCOL_VERSION, simVersion: SIM_VERSION });
  }

  /** Vùng và đời hiện tại (CLI, test). */
  get current(): { region: RegionBundle | null; life: Life | null } {
    return { region: this.region, life: this.life };
  }

  handle(u: unknown): void {
    const parsed = parseCommand(u);
    if (!parsed.ok) {
      const reqId = typeof u === 'object' && u !== null && Number.isSafeInteger((u as { reqId?: unknown }).reqId) ? (u as { reqId: number }).reqId : null;
      this.emit({ type: 'ERROR', reqId, code: 'BAD_COMMAND', message: parsed.error });
      return;
    }
    const cmd = parsed.value;
    try {
      this.dispatch(cmd);
    } catch (e) {
      const err = e instanceof HostError ? e : new HostError('INTERNAL', (e as Error).message ?? String(e));
      this.emit({ type: 'ERROR', reqId: cmd.reqId, code: err.code, message: err.message });
    }
  }

  private dispatch(cmd: Command): void {
    switch (cmd.type) {
      case 'GEN_WORLD': {
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
        this.life = Life.create(config, bp);
        this.emit({ type: 'LOG', reqId: cmd.reqId, entries: [...this.life.log] });
        this.emitState(cmd.reqId);
        return;
      }
      case 'ADVANCE': {
        const life = this.requireLife();
        if (!life.alive) throw new HostError('DEAD', 'nhân vật đã chết');
        const res = life.advance(cmd.mode);
        if (res.entries.length) this.emit({ type: 'LOG', reqId: cmd.reqId, entries: res.entries });
        if (res.status === 'stuck') throw new HostError('INTERNAL', `tua tới khi có biến vượt giới hạn an toàn ở tick ${life.tick}`);
        if (res.status === 'interrupted') this.emit({ type: 'INTERRUPT', reqId: cmd.reqId, entry: res.entry });
        this.emitState(cmd.reqId);
        if (res.status === 'died') this.emit({ type: 'DIED', reqId: cmd.reqId, summary: life.summary() });
        return;
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
    this.emit({ type: 'STATE', reqId, date: calendarOf(life.displayTick), character: life.view(), running: false });
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
      digest: life.digest(),
    };
  }

  /** Tải save: bản đồ lấy từ save, không sinh lại (GDD 10.2). */
  load(save: SaveFile): void {
    if (save.simVersion !== SIM_VERSION) throw new HostError('VERSION', `save của sim ${save.simVersion}, bản này là ${SIM_VERSION}`);
    const snap = parseWith(vLifeSnapshot, save.sim, '$save.sim');
    if (!snap.ok) throw new HostError('BAD_SAVE', snap.error);
    const life = Life.restore(snap.value, save.log);
    if (life.digest() !== save.digest) throw new HostError('BAD_SAVE', 'digest không khớp: save bị hỏng hoặc bị sửa');
    const saved = save.region.logic as SavedRegionLogic;
    if (!saved || typeof saved !== 'object' || !saved.logic || !Number.isSafeInteger(saved.placeVariant)) throw new HostError('BAD_SAVE', 'thiếu lớp logic vùng');
    if (snap.value.config.worldSeed !== save.worldSeed || snap.value.config.regionId !== save.region.summary.id) throw new HostError('BAD_SAVE', 'đời không thuộc vùng trong save');
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
  }
}
