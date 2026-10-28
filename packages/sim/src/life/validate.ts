// Validate snapshot sim khi tải save (ADR 0004): save hỏng hoặc bị sửa tay thì từ chối trước khi chạy.
import {
  arr, bool, intRange, lit, nat, nonEmpty, nullable, obj, oneOf, opt, record, str, vNpcId, vRegionId, type EventFigure,
  DEATH_CAUSES, FIGURE_AGES, FIGURE_CLASSES, GENDERS, SETTLEMENT_KINDS, TENURES, int, union, vBirthplaceId, vNewLifeConfig, vMonthPlan, vPlanSlot, vTravelPreview, vLogEntry, type Validator,
} from '@tsvl/shared';
import type { RngState, RngStreamsSnapshot } from '../core/rng';
import type { CharacterState, Condition, KinLinks, SpiritRoot } from './character';
import type { Bond } from '../social/bonds';
import type { Inheritance } from '../npc/lifecycle';
import type { Death } from './health';
import { SIM_VERSION, type LifeSnapshot } from './life';
import { BACKGROUNDS, ELEMENTS, PERSONALITIES, TRAITS } from './params';
import type { Skill } from './skills';
import type { ActiveAction } from './player';
import { HUNGER_MAX, type HouseholdState } from './household';
import { DISASTERS, type CountyEconomy, type EconomyState } from '../economy/market';
import type { EventsState, PendingState } from '../events/engine';
import { NPC_TIERS, OCCUPATIONS, type NpcState, type NpcWorldState } from '../npc/state';
import { PLAYER_ID } from '../npc/family';

/** Liên kết ruột thịt: id NPC, hoặc "n0" là người chơi (vợ/chồng, cha mẹ của con người chơi; v0.5 S5). */
const vKinId: Validator<string> = { check: (u, p) => (u === PLAYER_ID ? null : vNpcId.check(u, p)) };

const skillRecord = (value: Validator<number>) => obj<Record<Skill, number>>({ farming: value, hunting: value, crafting: value, literacy: value, martial: value, trade: value });

const u32 = intRange(0, 0xffffffff);
const vRngState: Validator<RngState> = {
  check: (u, p) => (Array.isArray(u) && u.length === 4 ? arr(u32).check(u, p) : `${p}: cần 4 số u32`),
};
const severity = oneOf(['mild', 'serious', 'grave'] as const);

const vCharacter = obj<CharacterState>({
  name: nonEmpty,
  gender: oneOf(GENDERS),
  // NPC già sinh trước năm 1 của lịch thế giới: tick sinh âm (ADR 0016)
  birthTick: int,
  birthplaceId: vBirthplaceId,
  birthplaceKind: oneOf(SETTLEMENT_KINDS),
  home: nat,
  location: nat,
  stamina: intRange(0, 1000),
  skillXp: skillRecord(intRange(0, 10_000)),
  skillLastUsed: skillRecord(int),
  background: oneOf(BACKGROUNDS),
  personality: oneOf(PERSONALITIES) as Validator<string>,
  constitution: intRange(1, 10),
  aptitude: intRange(1, 10),
  luck: intRange(1, 10),
  traits: arr(oneOf(TRAITS.map((t) => t.id))),
  spiritRoot: nullable(obj<SpiritRoot>({ elements: arr(oneOf(ELEMENTS)), purity: intRange(1, 100) })),
  lifespanBase: nat,
  lifespanBonus: nat,
  health: intRange(0, 1000),
  healthMax: intRange(0, 1000),
  scars: nat,
  conditions: arr(obj<Condition>({ id: nonEmpty, kind: oneOf(['illness', 'injury'] as const), severity, weeksLeft: nat })),
  household: obj<HouseholdState>({ independent: bool, money: nat, grain: nat, landMu: nat, tenure: oneOf(TENURES), hunger: intRange(0, HUNGER_MAX),
    farmWeeks: intRange(0, 36), farmCounty: intRange(-1, 10_000), taxDebt: nat,
    loan: nat, loanDue: int, reliefPct: intRange(0, 100), rentHikePct: intRange(0, 50), shieldUntil: int, stayUntil: intRange(0, 200),
    hungerYears: intRange(0, 200), lastHungerYear: intRange(-1, 200) }),
  alive: bool,
  kin: obj<KinLinks>({ father: nullable(vKinId), mother: nullable(vKinId), spouse: nullable(vKinId) }),
});

const vDeath = obj<Death>({ tick: nat, cause: oneOf(DEATH_CAUSES), detail: str });
const vActive = obj<ActiveAction>({ slot: vPlanSlot, remaining: intRange(1, 1000), total: intRange(1, 1000), preview: nullable(vTravelPreview) });

export const vLifeSnapshot = obj<LifeSnapshot>({
  simVersion: lit(SIM_VERSION) as Validator<string>,
  config: vNewLifeConfig,
  tick: nat,
  character: vCharacter,
  economy: obj<EconomyState>({
    regionWeatherPct: intRange(0, 200),
    counties: arr(obj<CountyEconomy>({
      mouths: intRange(1, Number.MAX_SAFE_INTEGER), grain: nat, money: nat, weatherPct: intRange(0, 200), price: nat, prevPrice: nat,
      disaster: nullable(oneOf(DISASTERS)), disasterMonth: intRange(0, 12), epidemicFrom: int, epidemicUntil: int,
    })),
  }),
  events: obj<EventsState>({
    pending: nullable(obj<PendingState>({
      instance: nat, eventId: nonEmpty, tick: nat, variant: nullable(nonEmpty), params: record(union(str, int)),
      figure: nullable(obj<EventFigure>({ gender: oneOf(GENDERS), ageBand: oneOf(FIGURE_AGES), class: oneOf(FIGURE_CLASSES), npcId: opt(vNpcId) })),
      npcId: nullable(vNpcId),
    })),
    nextInstance: nat, lastFired: record(int), once: arr(nonEmpty), lastChoiceTick: int, flags: arr(nonEmpty), met: arr(vNpcId),
  }),
  npcs: obj<NpcWorldState>({
    root: u32, regionId: vRegionId,
    nextId: intRange(1, Number.MAX_SAFE_INTEGER),
    people: arr(obj<NpcState>({
      id: vNpcId, character: vCharacter, occupation: oneOf(OCCUPATIONS), tier: oneOf(NPC_TIERS), rng: vRngState, death: nullable(vDeath),
      plan: nullable(vMonthPlan), active: nullable(vActive), planWarned: bool,
    })),
  }),
  bonds: arr(obj<Bond>({ id: vNpcId, closeness: intRange(0, 100), trust: intRange(0, 100), hostility: intRange(0, 100), owed: intRange(-100, 100) })),
  bequests: arr(obj<Inheritance>({ from: vNpcId, name: nonEmpty, tick: int, money: nat, grain: nat, landMu: nat })),
  reputation: arr(intRange(-100, 100)),
  rumors: arr(vLogEntry),
  rng: obj<RngStreamsSnapshot>({ root: u32, streams: record(vRngState) }),
  death: nullable(vDeath),
  plan: nullable(vMonthPlan),
  active: nullable(vActive),
  planWarned: bool,
});
