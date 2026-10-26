// Giao thức UI ↔ worker (ADR 0001).
import { vCharacterView, vLifeSummary, vLogEntry, type CharacterView, type LifeSummary, type LogEntry } from './character';
import { type CalendarDate } from './calendar';
import { vSaveFile, type SaveFile } from './save';
import { arr, bool, intRange, lit, nat, nonEmpty, nullable, obj, oneOf, parseWith, str, tagged, type Result, type Validator } from './schema';
import {
  vBirthplace, vNewLifeConfig, vRegionMapData, vRegionSummary, vWorldSeed,
  type Birthplace, type NewLifeConfig, type RegionMapData, type RegionSummary, type WorldSeed,
} from './world';

export const PROTOCOL_VERSION = 1;

export const ADVANCE_MODES = ['week', 'month', 'year', 'untilEvent'] as const;
export type AdvanceMode = (typeof ADVANCE_MODES)[number];

/** UI → worker. reqId do UI tăng dần; worker trả lại trong mọi tin phản hồi. */
export type Command =
  | { type: 'GEN_WORLD'; reqId: number; worldSeed: WorldSeed }
  | { type: 'NEW_LIFE'; reqId: number; config: NewLifeConfig }
  | { type: 'ADVANCE'; reqId: number; mode: AdvanceMode }
  | { type: 'PAUSE'; reqId: number }
  | { type: 'SAVE'; reqId: number }
  | { type: 'LOAD'; reqId: number; save: SaveFile };

export const ERROR_CODES = ['BAD_COMMAND', 'NO_WORLD', 'NO_LIFE', 'DEAD', 'BAD_SAVE', 'VERSION', 'INTERNAL'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** worker → UI. */
export type WorkerMessage =
  | { type: 'READY'; protocolVersion: number; simVersion: string }
  | { type: 'PROGRESS'; reqId: number; stage: string; pct: number }
  | { type: 'WORLD'; reqId: number; worldSeed: WorldSeed; region: RegionSummary; map: RegionMapData; birthplaces: Birthplace[] }
  | { type: 'STATE'; reqId: number; date: CalendarDate; character: CharacterView; running: boolean }
  | { type: 'LOG'; reqId: number; entries: LogEntry[] }
  | { type: 'INTERRUPT'; reqId: number; entry: LogEntry }
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
  PAUSE: obj<C<'PAUSE'>>({ type: lit('PAUSE'), reqId: nat }),
  SAVE: obj<C<'SAVE'>>({ type: lit('SAVE'), reqId: nat }),
  LOAD: obj<C<'LOAD'>>({ type: lit('LOAD'), reqId: nat, save: vSaveFile }),
});

type M<K extends WorkerMessage['type']> = Extract<WorkerMessage, { type: K }>;
export const vWorkerMessage: Validator<WorkerMessage> = tagged<WorkerMessage>({
  READY: obj<M<'READY'>>({ type: lit('READY'), protocolVersion: nat, simVersion: nonEmpty }),
  PROGRESS: obj<M<'PROGRESS'>>({ type: lit('PROGRESS'), reqId: nat, stage: nonEmpty, pct: intRange(0, 100) }),
  WORLD: obj<M<'WORLD'>>({ type: lit('WORLD'), reqId: nat, worldSeed: vWorldSeed, region: vRegionSummary, map: vRegionMapData, birthplaces: arr(vBirthplace) }),
  STATE: obj<M<'STATE'>>({ type: lit('STATE'), reqId: nat, date: vCalendarDate, character: vCharacterView, running: bool }),
  LOG: obj<M<'LOG'>>({ type: lit('LOG'), reqId: nat, entries: arr(vLogEntry) }),
  INTERRUPT: obj<M<'INTERRUPT'>>({ type: lit('INTERRUPT'), reqId: nat, entry: vLogEntry }),
  DIED: obj<M<'DIED'>>({ type: lit('DIED'), reqId: nat, summary: vLifeSummary }),
  SAVED: obj<M<'SAVED'>>({ type: lit('SAVED'), reqId: nat, save: vSaveFile }),
  ERROR: obj<M<'ERROR'>>({ type: lit('ERROR'), reqId: nullable(nat), code: oneOf(ERROR_CODES), message: str }),
});

export const parseCommand = (u: unknown): Result<Command> => parseWith(vCommand, u, '$cmd');
export const parseWorkerMessage = (u: unknown): Result<WorkerMessage> => parseWith(vWorkerMessage, u, '$msg');
