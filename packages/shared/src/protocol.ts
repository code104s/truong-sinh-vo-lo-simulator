// Giao thức UI ↔ worker (ADR 0001).
import {
  ADVANCE_MODES, vActionOption, vActionProgress, vMonthPlan, vTradeGrain, vTravelOption, vTravelPreview,
  type ActionOption, type ActionProgress, type AdvanceMode, type CountyIndex, type MonthPlan, type TravelOption, type TravelPreview,
} from './actions';
import { vCharacterView, vLifeSummary, vLogEntry, type CharacterView, type LifeSummary, type LogEntry } from './character';
import { type CalendarDate } from './calendar';
import { vChoiceId, type ChoiceId } from './contentId';
import { vMarketView, type MarketView } from './economy';
import { vPendingEvent, type PendingEvent } from './events';
import { vNpcView, type NpcView } from './npc';
import { vFactionId, vFactionView, type FactionId, type FactionView } from './factions';
import { vSaveFile, type SaveFile } from './save';
import { arr, bool, intRange, lit, nat, nonEmpty, nullable, obj, oneOf, parseWith, str, tagged, type Result, type Validator } from './schema';
import type { TenDay } from './calendar';
import {
  vBirthplace, vNewLifeConfig, vRegionMapData, vRegionSummary, vWorldSeed,
  type Birthplace, type NewLifeConfig, type RegionMapData, type RegionSummary, type WorldSeed,
} from './world';

/**
 * 6: v0.6 — thế lực: STATE.factions, STATE.control, NpcView.faction, TravelOption.danger, LifeSummary.legacy.factions (ADR 0019).
 * 5: v0.5 — quan hệ, gia đình, tiếng tăm: STATE.circle, NpcView.kin/bond, CharacterView.reputation/spouse, LifeSummary.legacy,
 * PlanSlot.person (ADR 0017, 0018).
 * 4: v0.4 — STATE có người trong quận (ADR 0015, 0016). 3: v0.3 — chợ, mua bán, sự kiện có lựa chọn (ADR 0012–0014).
 */
export const PROTOCOL_VERSION = 6;

export { ADVANCE_MODES, type AdvanceMode } from './actions';

/** UI → worker. reqId do UI tăng dần; worker trả lại trong mọi tin phản hồi. */
export type Command =
  | { type: 'GEN_WORLD'; reqId: number; worldSeed: WorldSeed }
  | { type: 'NEW_LIFE'; reqId: number; config: NewLifeConfig }
  | { type: 'ADVANCE'; reqId: number; mode: AdvanceMode }
  /** Đặt kế hoạch tháng, áp từ ô kế tiếp và tự lặp các tháng sau (ADR 0008). */
  | { type: 'SET_PLAN'; reqId: number; plan: MonthPlan }
  /** Hỏi đường đi, thời gian, rủi ro tới một quận; không đổi trạng thái (ADR 0009). */
  | { type: 'PREVIEW_TRAVEL'; reqId: number; county: CountyIndex }
  /** Mua (> 0) hoặc bán (< 0) lương thực, đơn vị thăng, ở chợ quận đang đứng; không tốn ô (ADR 0012). */
  | { type: 'TRADE'; reqId: number; grain: number }
  /** Chọn một lựa chọn của sự kiện đang chờ; instance phải khớp (ADR 0014). */
  | { type: 'CHOOSE'; reqId: number; instance: number; choice: ChoiceId }
  | { type: 'PAUSE'; reqId: number }
  | { type: 'SAVE'; reqId: number }
  | { type: 'LOAD'; reqId: number; save: SaveFile };

/** EVENT_PENDING: ADVANCE khi còn sự kiện chờ chọn (ADR 0014). */
export const ERROR_CODES = ['BAD_COMMAND', 'NO_WORLD', 'NO_LIFE', 'DEAD', 'EVENT_PENDING', 'BAD_SAVE', 'VERSION', 'INTERNAL'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** worker → UI. */
export type WorkerMessage =
  | { type: 'READY'; protocolVersion: number; simVersion: string }
  | { type: 'PROGRESS'; reqId: number; stage: string; pct: number }
  | { type: 'WORLD'; reqId: number; worldSeed: WorldSeed; region: RegionSummary; map: RegionMapData; birthplaces: Birthplace[] }
  | {
      type: 'STATE'; reqId: number; date: CalendarDate; character: CharacterView; running: boolean;
      /** Kế hoạch đang áp, null khi chưa có hoặc chưa tới tuổi tự quyết. */
      plan: MonthPlan | null;
      active: ActionProgress | null;
      /** Ô sẽ chạy kế tiếp trong tháng. */
      slotIndex: TenDay;
      /** Hành động và đích đi được ở nơi đang đứng, sim tính sẵn. */
      actions: ActionOption[];
      travel: TravelOption[];
      /** Chợ quận đang đứng; null khi chưa có kinh tế (trước S2). */
      market: MarketView | null;
      /** Sự kiện đang chờ chọn; khác null thì ADVANCE bị từ chối. */
      pending: PendingEvent | null;
      /** NPC đang ở quận người chơi đứng, sắp theo id (ADR 0016, Q8); rỗng tới S1. */
      people: NpcView[];
      /** Người thân và người có quan hệ ở mọi quận, người thân trước (v0.5). */
      circle: NpcView[];
      /** Thế lực còn sống trong vùng, theo id (v0.6, ADR 0019). */
      factions: FactionView[];
      /** Thế lực giữ mỗi quận, theo chỉ số quận; null là chưa ai giữ (v0.6). */
      control: (FactionId | null)[];
    }
  | { type: 'TRAVEL_PREVIEW'; reqId: number; preview: TravelPreview }
  | { type: 'LOG'; reqId: number; entries: LogEntry[] }
  | { type: 'INTERRUPT'; reqId: number; entry: LogEntry }
  /** Tua dừng vì có sự kiện cần chọn (ADR 0014). */
  | { type: 'EVENT'; reqId: number; pending: PendingEvent }
  | { type: 'DIED'; reqId: number; summary: LifeSummary }
  | { type: 'SAVED'; reqId: number; save: SaveFile }
  | { type: 'ERROR'; reqId: number | null; code: ErrorCode; message: string };

const vCalendarDate = obj<CalendarDate>({
  tick: nat,
  year: intRange(1, Number.MAX_SAFE_INTEGER),
  month: intRange(1, 12),
  tenDay: oneOf([0, 1, 2] as const),
  season: oneOf(['spring', 'summer', 'autumn', 'winter'] as const),
});

type C<K extends Command['type']> = Extract<Command, { type: K }>;
export const vCommand: Validator<Command> = tagged<Command>({
  GEN_WORLD: obj<C<'GEN_WORLD'>>({ type: lit('GEN_WORLD'), reqId: nat, worldSeed: vWorldSeed }),
  NEW_LIFE: obj<C<'NEW_LIFE'>>({ type: lit('NEW_LIFE'), reqId: nat, config: vNewLifeConfig }),
  ADVANCE: obj<C<'ADVANCE'>>({ type: lit('ADVANCE'), reqId: nat, mode: oneOf(ADVANCE_MODES) }),
  SET_PLAN: obj<C<'SET_PLAN'>>({ type: lit('SET_PLAN'), reqId: nat, plan: vMonthPlan }),
  PREVIEW_TRAVEL: obj<C<'PREVIEW_TRAVEL'>>({ type: lit('PREVIEW_TRAVEL'), reqId: nat, county: nat }),
  TRADE: obj<C<'TRADE'>>({ type: lit('TRADE'), reqId: nat, grain: vTradeGrain }),
  CHOOSE: obj<C<'CHOOSE'>>({ type: lit('CHOOSE'), reqId: nat, instance: nat, choice: vChoiceId }),
  PAUSE: obj<C<'PAUSE'>>({ type: lit('PAUSE'), reqId: nat }),
  SAVE: obj<C<'SAVE'>>({ type: lit('SAVE'), reqId: nat }),
  LOAD: obj<C<'LOAD'>>({ type: lit('LOAD'), reqId: nat, save: vSaveFile }),
});

type M<K extends WorkerMessage['type']> = Extract<WorkerMessage, { type: K }>;
export const vWorkerMessage: Validator<WorkerMessage> = tagged<WorkerMessage>({
  READY: obj<M<'READY'>>({ type: lit('READY'), protocolVersion: nat, simVersion: nonEmpty }),
  PROGRESS: obj<M<'PROGRESS'>>({ type: lit('PROGRESS'), reqId: nat, stage: nonEmpty, pct: intRange(0, 100) }),
  WORLD: obj<M<'WORLD'>>({ type: lit('WORLD'), reqId: nat, worldSeed: vWorldSeed, region: vRegionSummary, map: vRegionMapData, birthplaces: arr(vBirthplace) }),
  STATE: obj<M<'STATE'>>({
    type: lit('STATE'), reqId: nat, date: vCalendarDate, character: vCharacterView, running: bool,
    plan: nullable(vMonthPlan), active: nullable(vActionProgress), slotIndex: oneOf([0, 1, 2] as const), actions: arr(vActionOption), travel: arr(vTravelOption),
    market: nullable(vMarketView), pending: nullable(vPendingEvent), people: arr(vNpcView), circle: arr(vNpcView),
    factions: arr(vFactionView), control: arr(nullable(vFactionId)),
  }),
  TRAVEL_PREVIEW: obj<M<'TRAVEL_PREVIEW'>>({ type: lit('TRAVEL_PREVIEW'), reqId: nat, preview: vTravelPreview }),
  LOG: obj<M<'LOG'>>({ type: lit('LOG'), reqId: nat, entries: arr(vLogEntry) }),
  INTERRUPT: obj<M<'INTERRUPT'>>({ type: lit('INTERRUPT'), reqId: nat, entry: vLogEntry }),
  EVENT: obj<M<'EVENT'>>({ type: lit('EVENT'), reqId: nat, pending: vPendingEvent }),
  DIED: obj<M<'DIED'>>({ type: lit('DIED'), reqId: nat, summary: vLifeSummary }),
  SAVED: obj<M<'SAVED'>>({ type: lit('SAVED'), reqId: nat, save: vSaveFile }),
  ERROR: obj<M<'ERROR'>>({ type: lit('ERROR'), reqId: nullable(nat), code: oneOf(ERROR_CODES), message: str }),
});

export const parseCommand = (u: unknown): Result<Command> => parseWith(vCommand, u, '$cmd');
export const parseWorkerMessage = (u: unknown): Result<WorkerMessage> => parseWith(vWorkerMessage, u, '$msg');
