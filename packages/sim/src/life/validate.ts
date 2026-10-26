// Validate snapshot sim khi tải save (ADR 0004): save hỏng hoặc bị sửa tay thì từ chối trước khi chạy.
import {
  arr, bool, intRange, lit, nat, nonEmpty, nullable, obj, oneOf, record, str,
  DEATH_CAUSES, GENDERS, SETTLEMENT_KINDS, vBirthplaceId, vNewLifeConfig, type Validator,
} from '@tsvl/shared';
import type { RngState, RngStreamsSnapshot } from '../core/rng';
import type { CharacterState, Condition, SpiritRoot } from './character';
import type { Death } from './health';
import { SIM_VERSION, type LifeSnapshot } from './life';
import { BACKGROUNDS, ELEMENTS, PERSONALITIES, TRAITS } from './params';

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
  alive: bool,
});

export const vLifeSnapshot = obj<LifeSnapshot>({
  simVersion: lit(SIM_VERSION) as Validator<string>,
  config: vNewLifeConfig,
  tick: nat,
  character: vCharacter,
  rng: obj<RngStreamsSnapshot>({ root: u32, streams: record(vRngState) }),
  death: nullable(obj<Death>({ tick: nat, cause: oneOf(DEATH_CAUSES), detail: str })),
});
