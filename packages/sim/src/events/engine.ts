// Khung sự kiện có lựa chọn (ADR 0014): kích hoạt theo trạng thái, chờ người chơi chọn, áp hậu quả có sổ cái.
// Tất định: duyệt định nghĩa theo id đã sắp, mọi ngẫu nhiên trên luồng `events`.
import { ageYearsAt, MAX_CHOICES, MIN_CHOICES, type ContentId, type EventCostTag, type EventFigure, type LogEntry, type PendingEvent, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import type { Rng } from '../core/rng';
import type { CharacterState } from '../life/character';
import type { PlayerState } from '../life/player';
import type { EconomyState } from '../economy/market';
import { newNpcWorld, type NpcState, type NpcWorldState } from '../npc/state';
import type { Bond } from '../social/bonds';
import { shiftBond } from '../social/actions';
import { addReputation, repAt } from '../social/reputation';

/** Mọi thứ một sự kiện được đọc và (qua hàm có sổ cái ở effects.ts) được đổi. */
export interface EventContext {
  c: CharacterState;
  /** Trạng thái sự kiện của đời (cờ để lại). */
  events: EventsState;
  player: PlayerState;
  eco: EconomyState;
  logic: RegionLogic;
  tick: Tick;
  age: number;
  /** Người có tên quanh người chơi (v0.4, ADR 0016); rỗng thì sự kiện dùng người vô danh như v0.3. */
  npcs: NpcWorldState;
  /** Người thật trong chuyện, nếu sự kiện đã chọn được (`cast`); null là người vô danh. */
  npc: NpcState | null;
  /** Quan hệ của người chơi (v0.5 S4): lựa chọn với người thật đổi quan hệ với người ấy. */
  bonds: Bond[];
  /** Tiếng tăm của người chơi theo quận (v0.5 S6): lựa chọn có gắn tiếng cộng vào quận đang đứng. */
  reputation: number[];
}

export interface ChoiceOutcome {
  /** Đuôi khóa kết quả: văn bản là `<id sự kiện>.result.<result>`, vd. event.beggar.result.give. */
  result: string;
  params?: Record<string, string | number>;
}

export interface ChoiceDef {
  id: string;
  /** Lựa chọn tốn gì; ít nhất một giá (ADR 0014). */
  costs: EventCostTag[];
  /** null nếu chọn được; khóa nội dung nếu không (thiếu tiền, tính cách không cho…). */
  available?: (ctx: EventContext) => ContentId | null;
  apply: (ctx: EventContext, rng: Rng) => ChoiceOutcome;
}

export const EVENT_CATEGORIES = ['daily', 'economy', 'disaster', 'road', 'health', 'opportunity'] as const;

export interface EventDef {
  id: string;
  category: (typeof EVENT_CATEGORIES)[number];
  /** Xác suất mỗi tuần (ppm) theo trạng thái; 0 = không xảy ra. */
  weight: (ctx: EventContext) => number;
  /** Số tick tối thiểu giữa hai lần. */
  cooldownTicks: number;
  oncePerLife?: boolean;
  variant?: (ctx: EventContext) => string | null;
  params?: (ctx: EventContext) => Record<string, string | number>;
  figure?: (ctx: EventContext, rng: Rng) => EventFigure | null;
  /**
   * Chọn người thật trong chuyện khi có người hợp (ADR 0016, S6). Chạy trước `variant`, `params`, `figure` (chúng đọc
   * `ctx.npc`). Không có người hợp thì null: sự kiện dùng người vô danh như v0.3.
   */
  cast?: (ctx: EventContext, rng: Rng) => NpcState | null;
  /** Kết quả → tiếng tăm ở quận đang đứng (v0.5 S6, Q9): cứu người, giúp làng (+); trốn thuế, gây gổ, bỏ mặc (−). */
  reputation?: Readonly<Record<string, number>>;
  /** Kết quả → đổi quan hệ với người thật trong chuyện (v0.5 S4, ADR 0017); người vô danh thì không có gì. */
  bonds?: Readonly<Record<string, Partial<Omit<Bond, 'id'>>>>;
  /** 2–4 lựa chọn; lựa chọn cuối là lối ra, không bao giờ bị khóa. */
  choices: ChoiceDef[];
}

export interface PendingState {
  instance: number;
  eventId: string;
  tick: Tick;
  variant: string | null;
  params: Record<string, string | number>;
  figure: EventFigure | null;
  /** Người thật trong chuyện (id NPC), null là người vô danh. */
  npcId: string | null;
}

export interface EventsState {
  pending: PendingState | null;
  nextInstance: number;
  /** Tick lần cuối mỗi sự kiện xảy ra (để tính thời gian chờ). */
  lastFired: Record<string, number>;
  /** Sự kiện chỉ một lần đời đã xảy ra. */
  once: string[];
  /** Tick của sự kiện có lựa chọn gần nhất: mỗi tháng tối đa một (ADR 0014). */
  lastChoiceTick: number;
  /** Dấu vết sự kiện để lại cho về sau, vd. "heard_immortal" (v0.8 cửa ngõ tu tiên dùng). */
  flags: string[];
  /** NPC người chơi đã gặp trong sự kiện: tin người ấy mất là tin lớn (S6). */
  met: string[];
}

export const newEventsState = (): EventsState => ({ pending: null, nextInstance: 0, lastFired: {}, once: [], lastChoiceTick: -1_000, flags: [], met: [] });

const PPM = 1_000_000;
const TICKS_PER_MONTH = 3;

/** Tuyển tập sắp theo id: thứ tự duyệt không phụ thuộc thứ tự khai báo. */
export function sortedCatalog(defs: readonly EventDef[]): EventDef[] {
  return [...defs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** `npcs`: người có tên của đời (Life truyền vào); bỏ trống thì mọi sự kiện dùng người vô danh. */
export function makeContext(c: CharacterState, events: EventsState, player: PlayerState, eco: EconomyState, logic: RegionLogic, tick: Tick, npcs: NpcWorldState = newNpcWorld(), bonds: Bond[] = [], reputation: number[] = []): EventContext {
  return { c, events, player, eco, logic, tick, age: ageYearsAt(c.birthTick, tick), npcs, npc: null, bonds, reputation };
}

/** Ngữ cảnh kèm người thật của sự kiện đang chờ (đọc lại theo id, kể cả người đã mất). */
function withPending(ctx: EventContext, p: PendingState): EventContext {
  return p.npcId ? { ...ctx, npc: ctx.npcs.people.find((n) => n.id === p.npcId) ?? null } : ctx;
}

/**
 * Pha Sự kiện, sau bệnh và tai nạn: rút tối đa một sự kiện. Chỉ rút RNG khi có ứng viên, để tuần yên ổn không đổi luồng.
 * Trả về sự kiện vừa đặt chờ, hoặc null.
 */
export function rollEvent(state: EventsState, catalog: readonly EventDef[], ctx: EventContext, rng: Rng): PendingState | null {
  if (state.pending || !ctx.c.alive) return null;
  if (Math.floor(state.lastChoiceTick / TICKS_PER_MONTH) === Math.floor(ctx.tick / TICKS_PER_MONTH)) return null;
  const candidates: [EventDef, number][] = [];
  let total = 0;
  for (const def of catalog) {
    if (def.oncePerLife && state.once.includes(def.id)) continue;
    const last = state.lastFired[def.id];
    if (last !== undefined && ctx.tick - last < def.cooldownTicks) continue;
    const w = Math.max(0, Math.min(PPM, def.weight(ctx)));
    if (w > 0) { candidates.push([def, w]); total += w; }
  }
  if (!candidates.length) return null;
  // Tổng vượt 1 triệu thì co lại theo tỉ lệ; luôn tối đa một sự kiện mỗi tuần
  const roll = rng.int(0, Math.max(PPM, total) - 1);
  let acc = 0;
  for (const [def, w] of candidates) {
    acc += w;
    if (roll >= acc) continue;
    const npc = def.cast?.(ctx, rng) ?? null;
    const cast = npc ? { ...ctx, npc } : ctx;
    const pending: PendingState = {
      instance: state.nextInstance++,
      eventId: def.id,
      tick: ctx.tick,
      variant: def.variant?.(cast) ?? null,
      params: def.params?.(cast) ?? {},
      figure: def.figure?.(cast, rng) ?? null,
      npcId: npc?.id ?? null,
    };
    if (npc && !state.met.includes(npc.id)) state.met.push(npc.id);
    state.pending = pending;
    state.lastFired[def.id] = ctx.tick;
    state.lastChoiceTick = ctx.tick;
    if (def.oncePerLife) state.once.push(def.id);
    return pending;
  }
  return null;
}

export function defOf(catalog: readonly EventDef[], id: string): EventDef {
  const def = catalog.find((d) => d.id === id);
  if (!def) throw new Error(`sự kiện lạ: ${id}`);
  return def;
}

/** Sự kiện chờ như người chơi thấy (hợp đồng PendingEvent). Khóa tính theo trạng thái lúc này. */
export function pendingView(state: EventsState, catalog: readonly EventDef[], ctx: EventContext): PendingEvent | null {
  const p = state.pending;
  if (!p) return null;
  const def = defOf(catalog, p.eventId);
  ctx = withPending(ctx, p);
  return {
    instance: p.instance, eventId: p.eventId, variant: p.variant, params: { ...p.params }, figure: p.figure ? { ...p.figure } : null,
    choices: def.choices.map((ch) => ({ id: ch.id, costs: [...ch.costs], locked: ch.available?.(ctx) ?? null })),
  };
}

type Log = (e: Omit<LogEntry, 'tick'>) => void;

/** Lệnh CHOOSE. Trả lý do từ chối, hoặc null khi đã áp hậu quả và ghi nhật ký. */
export function choose(state: EventsState, catalog: readonly EventDef[], ctx: EventContext, instance: number, choiceId: string, rng: Rng, log: Log): string | null {
  const p = state.pending;
  if (!p) return 'không có sự kiện nào đang chờ';
  if (p.instance !== instance) return 'sự kiện đã đổi';
  const def = defOf(catalog, p.eventId);
  const choice = def.choices.find((ch) => ch.id === choiceId);
  if (!choice) return 'không có lựa chọn này';
  ctx = withPending(ctx, p);
  const lock = choice.available?.(ctx) ?? null;
  if (lock) return `lựa chọn đang bị khóa (${lock})`;
  const out = choice.apply(ctx, rng);
  const shift = def.bonds?.[out.result];
  if (shift && ctx.npc && !ctx.npc.death) shiftBond(ctx.bonds, ctx.npc.id, shift, repAt(ctx.reputation, ctx.c.location));
  addReputation(ctx.reputation, ctx.c.location, def.reputation?.[out.result] ?? 0);
  state.pending = null;
  log({ key: `${def.id}.result.${out.result}`, params: { ...p.params, ...out.params }, importance: 'major' });
  return null;
}

/** Kiểm tuyển tập lúc nạp: 2–4 lựa chọn, mỗi lựa chọn có giá, lựa chọn cuối là lối ra không có điều kiện. */
export function checkCatalog(defs: readonly EventDef[]): string | null {
  const ids = new Set<string>();
  for (const d of defs) {
    if (ids.has(d.id)) return `id trùng: ${d.id}`;
    ids.add(d.id);
    if (d.choices.length < MIN_CHOICES || d.choices.length > MAX_CHOICES) return `${d.id}: cần ${MIN_CHOICES}–${MAX_CHOICES} lựa chọn`;
    if (d.choices.some((ch) => ch.costs.length === 0)) return `${d.id}: lựa chọn không có giá`;
    if (d.choices.at(-1)!.available) return `${d.id}: lựa chọn cuối phải là lối ra không điều kiện`;
  }
  return null;
}
