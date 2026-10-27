// Tạo nhân vật từ NewLifeConfig (GDD 3.2 A; thuộc tính theo bảng đã duyệt ở docs/v0.1-giai-doan-a.md mục 3).
import { GIVEN_FEMALE, GIVEN_MALE, SURNAMES } from '@tsvl/content';
import { TICKS_PER_YEAR, ageYearsAt, type BirthplaceId, type CharacterView, type Gender, type HealthBand, type SettlementKind, type Tick } from '@tsvl/shared';
import { clamp, idiv } from '../core/math';
import type { Rng } from '../core/rng';
import { staminaBand } from './stamina';
import { emptySkills, skillViews, type Skill } from './skills';
import { ACTION_MIN_AGE } from './actions';
import { householdView, newHousehold, type HouseholdState } from './household';
import {
  BACKGROUND_WEIGHTS, BACKGROUNDS, ELEMENTS, HEALTH_FULL, LIFESPAN_BASE_YEARS, LIFESPAN_BY_BACKGROUND, LIFESPAN_BY_CONSTITUTION,
  LIFESPAN_DICE, LIFESPAN_DIE_MAX, LIFESPAN_MAX_YEARS, LIFESPAN_MIN_YEARS, PERSONALITIES, SPIRIT_ROOT_COUNT_WEIGHTS, SPIRIT_ROOT_PPM,
  TRAIT_COUNT_WEIGHTS, TRAITS, type Background, type Element, type Severity,
} from './params';

export interface Condition {
  /** Id nội dung, vd. "illness.fever", "injury.fracture". */
  id: string;
  kind: 'illness' | 'injury';
  severity: Severity;
  /** Số tuần còn lại. */
  weeksLeft: number;
}

export interface SpiritRoot {
  elements: Element[];
  /** 1..100 */
  purity: number;
}

/** Trạng thái đầy đủ của nhân vật trong sim. Chỉ số nguyên, chuỗi, boolean, null. */
export interface CharacterState {
  name: string;
  gender: Gender;
  birthTick: Tick;
  birthplaceId: BirthplaceId;
  birthplaceKind: SettlementKind;
  /** Quận nhà (quận sinh) và quận đang ở (ADR 0009). */
  home: number;
  location: number;
  stamina: number;
  skillXp: Record<Skill, number>;
  skillLastUsed: Record<Skill, number>;
  background: Background;
  personality: string;
  /** 1..10 */
  constitution: number;
  /** 1..10 */
  aptitude: number;
  /** 1..10, ẩn */
  luck: number;
  /** Id thiên phú (không tiền tố), cả hiện và ẩn. */
  traits: string[];
  /** Ẩn; null = không có linh căn. */
  spiritRoot: SpiritRoot | null;
  /** Thọ nguyên gốc (tick), ẩn. */
  lifespanBase: number;
  /** Cộng thêm (Luyện Khí, GDD 3.2 L2); v0.1 = 0. */
  lifespanBonus: number;
  health: number;
  healthMax: number;
  /** Tổng di chứng vĩnh viễn, đã trừ vào healthMax. */
  scars: number;
  conditions: Condition[];
  /** Túi tiền, kho lương, ruộng, bộ đếm đói (ADR 0013). */
  household: HouseholdState;
  alive: boolean;
}

/** Số 1..10 dạng chuông: 1 + ba lần int(0..3). */
const bell10 = (r: Rng) => 1 + r.int(0, 3) + r.int(0, 3) + r.int(0, 3);

export function traitDef(id: string) {
  const t = TRAITS.find((d) => d.id === id);
  if (!t) throw new Error(`thiên phú lạ: ${id}`);
  return t;
}

export function createCharacter(
  input: { birthTick: Tick; birthplaceId: BirthplaceId; birthplaceKind: SettlementKind; county: number },
  r: Rng,
  names: Rng,
): CharacterState {
  const gender: Gender = r.int(0, 1) === 0 ? 'male' : 'female';
  const background = BACKGROUNDS[r.weighted(BACKGROUND_WEIGHTS[input.birthplaceKind])]!;
  const personality = r.pick(PERSONALITIES);
  const constitution = bell10(r);
  const aptitude = bell10(r);
  const luck = bell10(r);

  const traits: string[] = [];
  const nTraits = r.weighted(TRAIT_COUNT_WEIGHTS);
  for (let k = 0; k < nTraits; k++) {
    const pool = TRAITS.filter((t) => !traits.includes(t.id) && !traits.some((x) => traitDef(x).excludes === t.id));
    traits.push(pool[r.weighted(pool.map((t) => t.weight))]!.id);
  }

  let spiritRoot: SpiritRoot | null = null;
  if (r.chance(SPIRIT_ROOT_PPM)) {
    const count = 1 + r.weighted(SPIRIT_ROOT_COUNT_WEIGHTS);
    const pool = [...ELEMENTS];
    const elements: Element[] = [];
    for (let k = 0; k < count; k++) elements.push(pool.splice(r.int(0, pool.length - 1), 1)[0]!);
    elements.sort((a, b) => ELEMENTS.indexOf(a) - ELEMENTS.indexOf(b));
    spiritRoot = { elements, purity: r.int(1, 100) };
  }

  let years = LIFESPAN_BASE_YEARS;
  for (let k = 0; k < LIFESPAN_DICE; k++) years += r.int(0, LIFESPAN_DIE_MAX);
  years += LIFESPAN_BY_CONSTITUTION[constitution - 1]! + LIFESPAN_BY_BACKGROUND[background];
  for (const t of traits) years += traitDef(t).lifespanYears ?? 0;
  years = clamp(years, LIFESPAN_MIN_YEARS, LIFESPAN_MAX_YEARS);
  const lifespanBase = years * TICKS_PER_YEAR + r.int(0, TICKS_PER_YEAR - 1);

  const surname = SURNAMES[names.weighted(SURNAMES.map((s) => s[1]))]![0];
  const given = gender === 'male' ? GIVEN_MALE : GIVEN_FEMALE;
  const first = names.pick(given);
  // Một nửa tên hai chữ (tên lót + tên)
  let name = `${surname} ${first}`;
  if (names.int(0, 1) === 1) {
    let second = names.pick(given);
    while (second === first) second = names.pick(given);
    name = `${surname} ${second} ${first}`;
  }

  const c: CharacterState = {
    name, gender, birthTick: input.birthTick, birthplaceId: input.birthplaceId, birthplaceKind: input.birthplaceKind,
    home: input.county, location: input.county, stamina: 0, skillXp: emptySkills(), skillLastUsed: emptySkills(input.birthTick),
    background, personality, constitution, aptitude, luck, traits, spiritRoot,
    lifespanBase, lifespanBonus: 0, health: 0, healthMax: 0, scars: 0, conditions: [], household: newHousehold(), alive: true,
  };
  return c;
}

export const lifespanCap = (c: CharacterState) => c.lifespanBase + c.lifespanBonus;

const band5 = (v: number, ids: readonly [string, string, string, string, string]) => ids[clamp(idiv(v - 1, 2), 0, 4)]!;

export function healthBandOf(c: CharacterState): HealthBand {
  const grave = c.conditions.some((x) => x.severity === 'grave');
  const serious = c.conditions.some((x) => x.severity !== 'mild');
  if (c.health < 150 || (grave && c.health < 300)) return 'dying';
  if (serious || c.health < 350) return 'ill';
  if (c.health < 600) return 'weak';
  if (c.health >= 900) return 'robust';
  return 'healthy';
}

/** Chiếu sang những gì người chơi được thấy (ADR 0001). Không có linh căn, thọ nguyên, phúc duyên, thiên phú ẩn. */
/** `buyPricePerDou`: giá mua ở chợ đang đứng, để quy tiền ra số tuần đủ ăn. */
export function toView(c: CharacterState, tick: Tick, buyPricePerDou: number): CharacterView {
  const pct = idiv(c.health * 100, HEALTH_FULL);
  return {
    name: c.name,
    gender: c.gender,
    birthTick: c.birthTick,
    ageYears: ageYearsAt(c.birthTick, tick),
    birthplaceId: c.birthplaceId,
    background: `background.${c.background}`,
    personality: `personality.${c.personality}`,
    constitution: `constitution.${band5(c.constitution, ['frail', 'weak', 'average', 'sturdy', 'robust'])}`,
    aptitude: `aptitude.${band5(c.aptitude, ['dull', 'slow', 'average', 'bright', 'gifted'])}`,
    traits: c.traits.filter((t) => traitDef(t).visible).map((t) => `trait.${t}`),
    healthPct: clamp(idiv(pct + 2, 5) * 5, 0, 100),
    healthBand: healthBandOf(c),
    conditions: c.conditions.map((x) => ({ id: x.id, severity: x.severity })),
    alive: c.alive,
    location: c.location,
    home: c.home,
    staminaBand: staminaBand(c, tick),
    skills: skillViews(c),
    canAct: c.alive && ageYearsAt(c.birthTick, tick) >= ACTION_MIN_AGE,
    household: householdView(c, tick, buyPricePerDou),
  };
}
