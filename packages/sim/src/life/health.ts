// Sức khỏe, lão hóa, bệnh, tai nạn, tử vong (ADR 0005). Toàn số nguyên.
import { ageYearsAt, seasonOfMonth, calendarOf, type DeathCause, type LogEntry, type Tick } from '@tsvl/shared';
import { clamp, idiv, lerpTable, mulDiv } from '../core/math';
import type { Rng } from '../core/rng';
import { healthBandOf, lifespanCap, traitDef, type CharacterState, type Condition } from './character';
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
  c.traits.reduce((p, t) => mulDiv(p, traitDef(t)[key] ?? 100, 100), 100);

export function computeHealthMax(c: CharacterState, tick: Tick): number {
  let m = Math.min(1000, lerpTable(HEALTH_MAX_BY_AGE_RATIO, ageRatio(c, tick)) + idiv(c.skillXp.martial, 1000) * 5) - c.scars;
  for (const t of c.traits) m += traitDef(t).healthMaxDelta ?? 0;
  return Math.max(HEALTH_MAX_FLOOR, m);
}

/** Pha "Hậu quả", nhịp năm: lão hóa (ADR 0002). Cũng gọi lúc sinh để đặt trần ban đầu. */
export function agingPhase(c: CharacterState, tick: Tick): void {
  c.healthMax = computeHealthMax(c, tick);
  if (c.health > c.healthMax) c.health = c.healthMax;
}

function startCondition(c: CharacterState, def: IllnessDef | InjuryDef, kind: Condition['kind'], r: Rng, log: Log, age: number) {
  c.conditions.push({ id: `${kind}.${def.id}`, kind, severity: def.severity, weeksLeft: r.int(def.weeks[0], def.weeks[1]) });
  log({ key: `log.${kind}.onset`, params: { [kind]: `${kind}.${def.id}`, age }, importance: def.severity === 'mild' ? 'minor' : 'major' });
}

/** Pha "Sự kiện", nhịp tuần: khởi phát bệnh và tai nạn. Trả về cái chết nếu tai nạn chết ngay. */
export function eventsPhase(c: CharacterState, tick: Tick, illnessRng: Rng, accidentRng: Rng, log: Log): Death | null {
  const age = ageYearsAt(c.birthTick, tick);
  const ratio = ageRatio(c, tick);

  // Bệnh: mỗi lúc tối đa một bệnh
  if (!c.conditions.some((x) => x.kind === 'illness')) {
    const season = seasonOfMonth(calendarOf(tick).month);
    let ppm = byAge(ILLNESS_ONSET_BY_AGE, age);
    ppm = mulDiv(ppm, ILLNESS_BY_SEASON[season], 100);
    ppm = mulDiv(ppm, ILLNESS_BY_BACKGROUND[c.background], 100);
    ppm = mulDiv(ppm, 160 - c.constitution * 10, 100);
    ppm = mulDiv(ppm, traitPct(c, 'illnessPct'), 100);
    ppm = mulDiv(ppm, fatiguePct(c, tick), 100);
    // Đói tính như sức khỏe yếu (ADR 0013)
    if (c.health < ILLNESS_WEAK_THRESHOLD || c.household.hunger > 0) ppm = mulDiv(ppm, ILLNESS_WEAK_PCT, 100);
    if (illnessRng.chance(ppm)) {
      const pool = ILLNESSES.filter((d) => ratio >= (d.minAgeRatio ?? 0));
      const w = pool.map((d) => mulDiv(mulDiv(d.weight * 100, d.season[season], 100), d.place[c.birthplaceKind], 100));
      startCondition(c, pool[illnessRng.weighted(w)]!, 'illness', illnessRng, log, age);
    }
  }

  // Tai nạn
  const appm = mulDiv(mulDiv(byAge(ACCIDENT_BY_AGE, age), traitPct(c, 'accidentPct'), 100), fatiguePct(c, tick), 100);
  if (accidentRng.chance(appm)) {
    if (accidentRng.chance(mulDiv(ACCIDENT_FATAL_PPM, skillRiskPct(c, 'martial'), 100))) return { tick, cause: 'accident', detail: 'accident.fatal' };
    if (!c.conditions.some((x) => x.kind === 'injury')) {
      startCondition(c, INJURIES[accidentRng.weighted(INJURIES.map((d) => d.weight))]!, 'injury', accidentRng, log, age);
    }
  }
  return null;
}

const defOf = (x: Condition): IllnessDef | InjuryDef => {
  const short = x.id.slice(x.id.indexOf('.') + 1);
  const d = x.kind === 'illness' ? ILLNESSES.find((i) => i.id === short) : INJURIES.find((i) => i.id === short);
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
