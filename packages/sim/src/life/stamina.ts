import type { StaminaBand, Tick } from '@tsvl/shared';
import { clamp, idiv, lerpTable, mulDiv } from '../core/math';
import type { CharacterState } from './character';
import { hungerStaminaPct } from './household';

export const STAMINA_BASE = 600;
export const STAMINA_PER_CONSTITUTION = 35;
export const STAMINA_RECOVERY_BASE = 45;
export const STAMINA_RECOVERY_PER_CONSTITUTION = 4;
export const REST_STAMINA_BONUS = 240;
export const EXHAUSTION_DAMAGE = 24;
const AGE_FACTOR = [[0, 500], [200, 1000], [650, 1000], [1000, 500]] as const;

export function staminaMax(c: CharacterState, tick: Tick): number {
  const ratio = idiv((tick - c.birthTick) * 1000, c.lifespanBase + c.lifespanBonus);
  return clamp(mulDiv(STAMINA_BASE + c.constitution * STAMINA_PER_CONSTITUTION + idiv(c.skillXp.martial, 1000) * 8, lerpTable(AGE_FACTOR, ratio), 1000), 250, 1000);
}

export function staminaBand(c: CharacterState, tick: Tick): StaminaBand {
  const pct = idiv(c.stamina * 100, staminaMax(c, tick));
  return pct >= 60 ? 'fresh' : pct >= 20 ? 'tired' : 'exhausted';
}

export function fatiguePct(c: CharacterState, tick: Tick): number {
  const band = staminaBand(c, tick);
  return band === 'exhausted' ? 140 : band === 'tired' ? 130 : 100;
}

export function spendStamina(c: CharacterState, cost: number): boolean {
  c.stamina = Math.max(0, c.stamina - cost);
  if (cost > 0 && c.stamina === 0) { c.health = Math.max(0, c.health - EXHAUSTION_DAMAGE); return true; }
  return false;
}

export function recoverStamina(c: CharacterState, tick: Tick, rest = false): void {
  const cap = staminaMax(c, tick);
  const base = mulDiv(STAMINA_RECOVERY_BASE + c.constitution * STAMINA_RECOVERY_PER_CONSTITUTION, cap, 1000);
  // Đói thì hồi một nửa (ADR 0013)
  c.stamina = Math.min(cap, c.stamina + mulDiv(base + (rest ? REST_STAMINA_BONUS : 0), hungerStaminaPct(c.household), 100));
}
