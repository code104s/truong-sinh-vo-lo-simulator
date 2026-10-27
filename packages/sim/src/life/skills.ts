import { TICKS_PER_YEAR, type SkillView, type Tick } from '@tsvl/shared';
import { idiv, mulDiv } from '../core/math';
import type { CharacterState } from './character';
import { fatiguePct } from './stamina';

export const SKILLS = ['farming', 'hunting', 'crafting', 'literacy', 'martial'] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_XP_MAX = 10_000;
export const SKILL_BASE_GAIN = 35;
export const SKILL_ANNUAL_DECAY_PCT = 5;
export const emptySkills = (value = 0): Record<Skill, number> => ({ farming: value, hunting: value, crafting: value, literacy: value, martial: value });

export function gainSkill(c: CharacterState, skill: Skill, tick: Tick, base = SKILL_BASE_GAIN): void {
  let gain = mulDiv(base, 50 + c.aptitude * 10, 100);
  if (skill !== 'literacy') gain = mulDiv(gain, 100 + idiv(c.skillXp.literacy, 500), 100);
  gain = mulDiv(gain, 100, fatiguePct(c, tick));
  c.skillXp[skill] = Math.min(SKILL_XP_MAX, c.skillXp[skill] + Math.max(1, gain));
  c.skillLastUsed[skill] = tick;
}

export function decaySkills(c: CharacterState, tick: Tick): void {
  for (const skill of SKILLS) if (c.skillLastUsed[skill] <= tick - TICKS_PER_YEAR && c.skillXp[skill] > 0) {
    c.skillXp[skill] = Math.max(0, c.skillXp[skill] - Math.max(1, mulDiv(c.skillXp[skill], SKILL_ANNUAL_DECAY_PCT, 100)));
  }
}

export const skillRiskPct = (c: CharacterState, skill: Skill): number => 100 - mulDiv(c.skillXp[skill], 60, SKILL_XP_MAX);

export function skillViews(c: CharacterState): SkillView[] {
  return SKILLS.filter((s) => c.skillXp[s] > 0).map((s) => ({ id: `skill.${s}`, rank: `rank.${c.skillXp[s] < 1000 ? 'novice' : c.skillXp[s] < 4000 ? 'practiced' : c.skillXp[s] < 8000 ? 'skilled' : 'master'}` }));
}
