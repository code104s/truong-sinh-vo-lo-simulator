// Sức khỏe, lão hóa, bệnh, tai nạn, tử vong (ADR 0005). Toàn số nguyên.
import { ageYearsAt, seasonOf, type DeathCause, type LogEntry, type Tick } from '@tsvl/shared';
import { clamp, idiv, lerpTable, mulDiv } from '../core/math';
import type { Rng } from '../core/rng';
import { hasCondition, healthBandOf, lifespanCap, traitDef, type CharacterState, type Condition } from './character';
import { hungerDamage, hungerRecoveryPct, isStarving } from './household';
import { fatiguePct } from './stamina';
import { skillRiskPct } from './skills';
import {
  ACCIDENT_BY_AGE, ACCIDENT_FATAL_PPM, HEALTH_MAX_BY_AGE_RATIO, HEALTH_MAX_FLOOR, ILLNESS_BY_BACKGROUND, ILLNESS_BY_SEASON,
  ILLNESS_ONSET_BY_AGE, ILLNESS_WEAK_PCT, ILLNESS_WEAK_THRESHOLD, ILLNESSES, INJURIES, MEDICINE_BY_BACKGROUND,
  RECOVERY_BASE, RECOVERY_BY_BACKGROUND, RECOVERY_PER_CONSTITUTION, RECOVERY_WHILE_ILL, type IllnessDef, type InjuryDef,
} from './params';

export interface Death {
  tick: Tick;
  cause: DeathCause;
  detail: string;
}

type Log = (e: Omit<LogEntry, 'tick'>) => void;

/** Hệ số mắc bệnh khi quận có dịch mà chưa phòng (%). */
export const EPIDEMIC_ILLNESS_PCT = 300;

/** Tỉ lệ tuổi / thọ nguyên (‰). */
export function ageRatio(c: CharacterState, tick: Tick): number {
  return idiv((tick - c.birthTick) * 1000, lifespanCap(c));
}

/** Giá trị theo bậc tuổi: bậc cuối có tuổi tối thiểu ≤ tuổi. */
const byAge = (table: readonly (readonly [number, number])[], age: number) => {
  let v = table[0]![1];
  for (const [min, x] of table) if (age >= min) v = x;
  return v;
};

const traitPct = (c: CharacterState, key: 'illnessPct' | 'accidentPct') =>
  traitProduct(c.traits, key);

function traitProduct(traits: readonly string[], key: 'illnessPct' | 'accidentPct'): number {
  let p = 100;
  for (const t of traits) p = mulDiv(p, traitDef(t)[key] ?? 100, 100);
  return p;
}

export function computeHealthMax(c: CharacterState, tick: Tick): number {
  let m = Math.min(1000, lerpTable(HEALTH_MAX_BY_AGE_RATIO, ageRatio(c, tick)) + idiv(c.skillXp.martial, 1000) * 5) - c.scars;
  for (const t of c.traits) m += traitDef(t).healthMaxDelta ?? 0;
  // Trần 1000 cả khi có nét cộng (thân thể tầng 1, v0.8 S7 sửa lỗi S5: sức khỏe vượt 1000 thì save bị từ chối)
  return Math.max(HEALTH_MAX_FLOOR, Math.min(1000, m));
}

/** Pha "Hậu quả", nhịp năm: lão hóa (ADR 0002). Cũng gọi lúc sinh để đặt trần ban đầu. */
export function agingPhase(c: CharacterState, tick: Tick): void {
  c.healthMax = computeHealthMax(c, tick);
  if (c.health > c.healthMax) c.health = c.healthMax;
}

export function startCondition(c: CharacterState, def: IllnessDef | InjuryDef, kind: Condition['kind'], r: Rng, log: Log, age: number) {
  c.conditions.push({ id: `${kind}.${def.id}`, kind, severity: def.severity, weeksLeft: r.int(def.weeks[0], def.weeks[1]) });
  log({ key: `log.${kind}.onset`, params: { [kind]: `${kind}.${def.id}`, age }, importance: def.severity === 'mild' ? 'minor' : 'major' });
}

/** Xác suất (ppm) xảy ra ít nhất một lần trong `weeks` tuần, khi mỗi tuần là `ppm`: 1 − (1 − p)^tuần, số nguyên. */
export function compoundPpm(ppm: number, weeks: number): number {
  if (weeks <= 1) return ppm;
  const q = 1_000_000 - Math.min(1_000_000, ppm);
  let none = 1_000_000;
  for (let w = 0; w < weeks; w++) none = mulDiv(none, q, 1_000_000);
  return 1_000_000 - none;
}

/** Xác suất (ppm) khởi phát bệnh trong một tuần, khi đang không bệnh. `epidemic`: quận có dịch mà chưa phòng — gấp ba. */
export function illnessPpm(c: CharacterState, tick: Tick, epidemic = false): number {
  const age = ageYearsAt(c.birthTick, tick);
  const season = seasonOf(tick);
  let ppm = byAge(ILLNESS_ONSET_BY_AGE, age);
  ppm = mulDiv(ppm, ILLNESS_BY_SEASON[season], 100);
  ppm = mulDiv(ppm, ILLNESS_BY_BACKGROUND[c.background], 100);
  ppm = mulDiv(ppm, 160 - c.constitution * 10, 100);
  ppm = mulDiv(ppm, traitPct(c, 'illnessPct'), 100);
  ppm = mulDiv(ppm, fatiguePct(c, tick), 100);
  // Đói tính như sức khỏe yếu (ADR 0013)
  if (c.health < ILLNESS_WEAK_THRESHOLD || c.household.hunger > 0) ppm = mulDiv(ppm, ILLNESS_WEAK_PCT, 100);
  if (epidemic) ppm = mulDiv(ppm, EPIDEMIC_ILLNESS_PCT, 100);
  return ppm;
}

/** Bệnh nào khi đã khởi phát: theo tỉ lệ tuổi, mùa, loại nơi sinh. */
export function pickIllness(c: CharacterState, tick: Tick, r: Rng): IllnessDef {
  const season = seasonOf(tick);
  const ratio = ageRatio(c, tick);
  const pool = ILLNESSES.filter((d) => ratio >= (d.minAgeRatio ?? 0));
  const w = pool.map((d) => mulDiv(mulDiv(d.weight * 100, d.season[season], 100), d.place[c.birthplaceKind], 100));
  return pool[r.weighted(w)]!;
}

/** Xác suất (ppm) gặp tai nạn trong một tuần. */
export function accidentPpm(c: CharacterState, tick: Tick): number {
  return mulDiv(mulDiv(byAge(ACCIDENT_BY_AGE, ageYearsAt(c.birthTick, tick)), traitPct(c, 'accidentPct'), 100), fatiguePct(c, tick), 100);
}

export const pickInjury = (r: Rng): InjuryDef => INJURIES[r.weighted(INJURIES.map((d) => d.weight))]!;
export const accidentFatalPpm = (c: CharacterState): number => mulDiv(ACCIDENT_FATAL_PPM, skillRiskPct(c, 'martial'), 100);

/** Pha "Sự kiện", nhịp tuần: khởi phát bệnh và tai nạn. Trả về cái chết nếu tai nạn chết ngay. */
/** `epidemic`: quận đang đứng có dịch và chưa phòng (S6) — dễ mắc bệnh gấp ba. */
export function eventsPhase(c: CharacterState, tick: Tick, illnessRng: Rng, accidentRng: Rng, log: Log, epidemic = false): Death | null {
  const age = ageYearsAt(c.birthTick, tick);
  // Bệnh: mỗi lúc tối đa một bệnh
  if (!hasCondition(c, 'illness') && illnessRng.chance(illnessPpm(c, tick, epidemic))) {
    startCondition(c, pickIllness(c, tick, illnessRng), 'illness', illnessRng, log, age);
  }
  // Tai nạn
  if (accidentRng.chance(accidentPpm(c, tick))) {
    if (accidentRng.chance(accidentFatalPpm(c))) return { tick, cause: 'accident', detail: 'accident.fatal' };
    if (!hasCondition(c, 'injury')) startCondition(c, pickInjury(accidentRng), 'injury', accidentRng, log, age);
  }
  return null;
}

const ILLNESS_BY_ID: ReadonlyMap<string, IllnessDef> = new Map(ILLNESSES.map((d) => [`illness.${d.id}`, d]));
const INJURY_BY_ID: ReadonlyMap<string, InjuryDef> = new Map(INJURIES.map((d) => [`injury.${d.id}`, d]));
const defOf = (x: Condition): IllnessDef | InjuryDef => {
  const d = x.kind === 'illness' ? ILLNESS_BY_ID.get(x.id) : INJURY_BY_ID.get(x.id);
  if (!d) throw new Error(`bệnh/thương tật lạ: ${x.id}`);
  return d;
};

/**
 * Pha "Hậu quả", nhịp tuần: diễn tiến bệnh, hồi phục, kiểm tra tử vong (cuối pha).
 * Trả về cái chết nếu có.
 */
export function consequencesPhase(c: CharacterState, tick: Tick, healthRng: Rng, log: Log, carePct = 0): Death | null {
  const age = ageYearsAt(c.birthTick, tick);
  const bandBefore = healthBandOf(c);
  let worst: { id: string; damage: number } | null = null;

  // Hồi phục: đủ khi khỏe, một phần khi đang bệnh (theo mức nặng nhất)
  let recovery = RECOVERY_BASE + RECOVERY_PER_CONSTITUTION * c.constitution + RECOVERY_BY_BACKGROUND[c.background];
  for (const x of c.conditions) recovery = Math.min(recovery, mulDiv(recovery, RECOVERY_WHILE_ILL[x.severity], 100));
  recovery = mulDiv(recovery, hungerRecoveryPct(c.household), 100);
  c.health = Math.min(c.healthMax, c.health + recovery);

  // Đói (ADR 0013): đói lả mất sức khỏe, kiệt có thể để lại di chứng
  const scarsBefore = c.scars;
  c.health -= hungerDamage(c, healthRng);
  if (c.scars !== scarsBefore) c.healthMax = computeHealthMax(c, tick);

  if (c.conditions.length > 0) {
    const still: Condition[] = [];
    for (const x of c.conditions) {
      const def = defOf(x);
      const damage = mulDiv(mulDiv(healthRng.int(def.damage[0], def.damage[1]), 100 - MEDICINE_BY_BACKGROUND[c.background], 100), 100 - carePct, 100);
      c.health -= damage;
      if (!worst || damage > worst.damage) worst = { id: x.id, damage };
      x.weeksLeft -= 1;
      if (x.weeksLeft > 0) {
        still.push(x);
        continue;
      }
      let scar = 0;
      if (healthRng.chance(def.scarPpm)) scar = healthRng.int(def.scar[0], def.scar[1]);
      if (c.health > 0) {
        c.scars += scar;
        log({ key: `log.${x.kind}.recovered`, params: { [x.kind]: x.id, scar: scar > 0 ? 1 : 0, age }, importance: x.severity === 'mild' && scar === 0 ? 'minor' : 'major' });
      }
    }
    c.conditions = still;
    if (c.scars > 0) c.healthMax = computeHealthMax(c, tick);
    c.health = Math.min(c.health, c.healthMax);
  }

  // Tử vong (ADR 0005): trần thọ nguyên → sức khỏe cạn
  if (tick - c.birthTick >= lifespanCap(c)) return { tick, cause: 'old_age', detail: 'old_age.natural' };
  if (c.health <= 0) {
    c.health = 0;
    if (isStarving(c.household)) return { tick, cause: 'starvation', detail: 'hunger.starved' };
    if (worst) return { tick, cause: worst.id.startsWith('injury.') ? 'accident' : 'illness', detail: worst.id };
    if (c.stamina === 0) return { tick, cause: 'illness', detail: 'illness.exhaustion' };
    return { tick, cause: 'old_age', detail: 'old_age.natural' };
  }

  const bandAfter = healthBandOf(c);
  const rank = ['robust', 'healthy', 'weak', 'ill', 'dying'];
  if (bandAfter !== bandBefore && rank.indexOf(bandAfter) >= rank.indexOf('ill') && rank.indexOf(bandAfter) > rank.indexOf(bandBefore)) {
    log({ key: 'log.health.worse', params: { band: `health.${bandAfter}`, age }, importance: 'major' });
  }
  c.health = clamp(c.health, 0, c.healthMax);
  return null;
}
