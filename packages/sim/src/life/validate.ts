// Validate snapshot sim khi tải save (ADR 0004): save hỏng hoặc bị sửa tay thì từ chối trước khi chạy.
import {
  arr, bool, intRange, lit, nat, nonEmpty, nullable, obj, oneOf, record, str,
  DEATH_CAUSES, GENDERS, SETTLEMENT_KINDS, TENURES, vBirthplaceId, vNewLifeConfig, vMonthPlan, vPlanSlot, vTravelPreview, type Validator,
} from '@tsvl/shared';
import type { RngState, RngStreamsSnapshot } from '../core/rng';
import type { CharacterState, Condition, SpiritRoot } from './character';
import type { Death } from './health';
import { SIM_VERSION, type LifeSnapshot } from './life';
import { BACKGROUNDS, ELEMENTS, PERSONALITIES, TRAITS } from './params';
import type { Skill } from './skills';
import type { ActiveAction } from './player';
import { HUNGER_MAX, type HouseholdState } from './household';
import type { CountyEconomy, EconomyState } from '../economy/market';

const skillRecord = (value: Validator<number>) => obj<Record<Skill, number>>({ farming: value, hunting: value, crafting: value, literacy: value, martial: value });

const u32 = intRange(0, 0xffffffff);
const vRngState: Validator<RngState> = {
  check: (u, p) => (Array.isArray(u) && u.length === 4 ? arr(u32).check(u, p) : `${p}: cần 4 số u32`),
};
const severity = oneOf(['mild', 'serious', 'grave'] as const);

const vCharacter = obj<CharacterState>({
  name: nonEmpty,
  gender: oneOf(GENDERS),
  birthTick: nat,
  birthplaceId: vBirthplaceId,
  birthplaceKind: oneOf(SETTLEMENT_KINDS),
  home: nat,
  location: nat,
  stamina: intRange(0, 1000),
  skillXp: skillRecord(intRange(0, 10_000)),
  skillLastUsed: skillRecord(nat),
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
    farmWeeks: intRange(0, 36), farmCounty: intRange(-1, 10_000) }),
  alive: bool,
});

export const vLifeSnapshot = obj<LifeSnapshot>({
  simVersion: lit(SIM_VERSION) as Validator<string>,
  config: vNewLifeConfig,
  tick: nat,
  character: vCharacter,
  economy: obj<EconomyState>({
    regionWeatherPct: intRange(0, 200),
    counties: arr(obj<CountyEconomy>({ mouths: intRange(1, Number.MAX_SAFE_INTEGER), grain: nat, money: nat, weatherPct: intRange(0, 200), price: nat, prevPrice: nat })),
  }),
  rng: obj<RngStreamsSnapshot>({ root: u32, streams: record(vRngState) }),
  death: nullable(obj<Death>({ tick: nat, cause: oneOf(DEATH_CAUSES), detail: str })),
  plan: nullable(vMonthPlan),
  active: nullable(obj<ActiveAction>({ slot: vPlanSlot, remaining: intRange(1, 1000), total: intRange(1, 1000), preview: nullable(vTravelPreview) })),
  planWarned: bool,
});
