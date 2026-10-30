// Validate snapshot sim khi tải save (ADR 0004): save hỏng hoặc bị sửa tay thì từ chối trước khi chạy.
import {
  arr, bool, intRange, lit, nat, nonEmpty, nullable, obj, oneOf, opt, record, str, vNpcId, vRegionId, type EventFigure,
  DEATH_CAUSES, GOODS, FIGURE_AGES, FIGURE_CLASSES, GENDERS, SETTLEMENT_KINDS, TENURES, int, union, vBirthplaceId, vNewLifeConfig, vMonthPlan, vPlanSlot, vTravelPreview, vLogEntry, vFactionId, vFactionName, FACTION_KINDS, CAREERS, CAREER_RANKS, CULTIVATION_PATHS, REALMS, ROOT_BANDS, vCareerRecord, type Validator,
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
import type { CultivationState } from './cultivation';
import { HUNGER_MAX, type HouseholdState } from './household';
import { DISASTERS, type CountyEconomy, type CountyGood, type EconomyState } from '../economy/market';
import type { EventsState, PendingState } from '../events/engine';
import { NPC_TIERS, OCCUPATIONS, type NpcState, type NpcWorldState } from '../npc/state';
import { PLAYER_ID } from '../npc/family';
import type { FactionState, FactionWorldState } from '../factions/state';
import type { FactionSeen } from '../factions/seen';
import type { CareerState } from './career';

/** Liên kết ruột thịt: id NPC, hoặc "n0" là người chơi (vợ/chồng, cha mẹ của con người chơi; v0.5 S5). */
const vKinId: Validator<string> = { check: (u, p) => (u === PLAYER_ID ? null : vNpcId.check(u, p)) };

const skillRecord = (value: Validator<number>) => obj<Record<Skill, number>>({ farming: value, hunting: value, crafting: value, literacy: value, martial: value, trade: value, medicine: value });

const u32 = intRange(0, 0xffffffff);
const vRngState: Validator<RngState> = {
  check: (u, p) => (Array.isArray(u) && u.length === 4 ? arr(u32).check(u, p) : `${p}: cần 4 số u32`),
};
const severity = oneOf(['mild', 'serious', 'grave'] as const);
/** Túi đồ (v0.7 S3b): đúng ba món, phân không âm. */
const vGoods: Validator<number[]> = {
  check: (u, p) => (Array.isArray(u) && u.length === GOODS.length ? arr(nat).check(u, p) : `${p}: cần đúng ${GOODS.length} món`),
};

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
    loan: nat, loanDue: int, lender: nullable(nonEmpty), reliefPct: intRange(0, 100), rentHikePct: intRange(0, 50), shieldUntil: int, stayUntil: intRange(0, 200),
    hungerYears: intRange(0, 200), lastHungerYear: intRange(-1, 200), goods: vGoods }),
  alive: bool,
  kin: obj<KinLinks>({ father: nullable(vKinId), mother: nullable(vKinId), spouse: nullable(vKinId), lineage: nullable(vKinId) }),
});

const vCountyGood = obj<CountyGood>({ stock: nat, price: intRange(1, Number.MAX_SAFE_INTEGER), prevPrice: intRange(1, Number.MAX_SAFE_INTEGER) });
const vCountyGoods: Validator<CountyGood[]> = {
  check: (u, p) => (Array.isArray(u) && u.length === GOODS.length ? arr(vCountyGood).check(u, p) : `${p}: cần đúng ${GOODS.length} món`),
};

const vDeath = obj<Death>({ tick: nat, cause: oneOf(DEATH_CAUSES), detail: str });
const vActive = obj<ActiveAction>({ slot: vPlanSlot, remaining: intRange(1, 1000), total: intRange(1, 1000), preview: nullable(vTravelPreview) });

/** Cặp số tự nhiên [a, b] (lời buôn theo hai chiều một đường, v0.6 S3). */
const tupleNat2: Validator<[number, number]> = {
  check: (u, p) => (Array.isArray(u) && u.length === 2 && u.every((x) => Number.isInteger(x) && x >= 0) ? null : `${p}: cần cặp số tự nhiên`),
};

/** Đường tu (v0.8, ADR 0022). */
const vCultivationState = obj<CultivationState>({
  realm: oneOf(REALMS), root: nullable(oneOf(ROOT_BANDS)), path: nullable(oneOf(CULTIVATION_PATHS)), qi: nat, entered: nullable(nat),
  breakthroughs: arr(obj<{ at: number; ok: boolean }>({ at: nat, ok: bool })),
  stones: nat,
  duty: nullable(obj<{ weeks: number; missed: number; since: number }>({ weeks: nat, missed: nat, since: nat })),
});
const vCareerState = obj<CareerState>({
  id: oneOf(CAREERS), rank: oneOf(CAREER_RANKS), since: nat, faction: nullable(vFactionId), mentor: nullable(vNpcId), years: nat, weeks: nat, idle: nat,
});

export const vLifeSnapshot = obj<LifeSnapshot>({
  simVersion: lit(SIM_VERSION) as Validator<string>,
  config: vNewLifeConfig,
  tick: nat,
  character: vCharacter,
  economy: obj<EconomyState>({
    regionWeatherPct: intRange(0, 200),
    tradeMargin: arr(tupleNat2),
    counties: arr(obj<CountyEconomy>({
      mouths: intRange(1, Number.MAX_SAFE_INTEGER), grain: nat, money: nat, weatherPct: intRange(0, 200), price: nat, prevPrice: nat,
      disaster: nullable(oneOf(DISASTERS)), disasterMonth: intRange(0, 12), epidemicFrom: int, epidemicUntil: int, taxMoney: nat, taxGrain: nat, taxPct: intRange(50, 150), wagePct: intRange(100, 200), wageBonus: nat, landSold: nat,
      goods: vCountyGoods,
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
      // Thân phận nghề chỉ người chơi có (v0.7); NPC để trống
      career: opt(nullable(vCareerState)),
      // Đường tu chỉ người chơi có (v0.8); NPC để trống
      cultivation: opt(vCultivationState),
    })),
  }),
  bonds: arr(obj<Bond>({ id: vNpcId, closeness: intRange(0, 100), trust: intRange(0, 100), hostility: intRange(0, 100), owed: intRange(-100, 100) })),
  bequests: arr(obj<Inheritance>({ from: vNpcId, name: nonEmpty, tick: int, money: nat, grain: nat, landMu: nat })),
  reputation: arr(intRange(-100, 100)),
  rumors: arr(vLogEntry),
  factions: obj<FactionWorldState>({
    nextId: intRange(1, Number.MAX_SAFE_INTEGER),
    list: arr(obj<FactionState>({
      id: vFactionId, kind: oneOf(FACTION_KINDS), name: vFactionName, seat: nat, counties: arr(nat), holds: arr(nat), members: arr(vNpcId), leader: nullable(vNpcId), power: nat, roads: arr(nat), losses: nat, greed: intRange(0, 100), termEnds: int,
      relations: arr(obj<{ other: string; attitude: number }>({ other: vFactionId, attitude: intRange(-100, 100) })),
      owed: opt(arr(obj<{ id: string; coin: number }>({ id: vNpcId, coin: nat }))),
      playerAttitude: opt(intRange(-100, 100)),
      trial: opt(obj<{ tick: number; takesMixed: boolean; taken: number }>({ tick: nat, takesMixed: bool, taken: nat })),
      money: nat, grain: nat, founded: int, ended: nullable(int),
    })),
  }),
  factionsSeen: arr(obj<FactionSeen>({ id: vFactionId, kind: oneOf(FACTION_KINDS), name: vFactionName, first: nat, last: nat, ended: bool })),
  career: nullable(vCareerState),
  careers: arr(vCareerRecord),
  cultivation: vCultivationState,
  rng: obj<RngStreamsSnapshot>({ root: u32, streams: record(vRngState) }),
  death: nullable(vDeath),
  plan: nullable(vMonthPlan),
  active: nullable(vActive),
  planWarned: bool,
});
