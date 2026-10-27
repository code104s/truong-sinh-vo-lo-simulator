import { ageYearsAt, isYearStart, TICKS_PER_MONTH, TICKS_PER_YEAR, type LogEntry, type MonthPlan, type PlanSlot, type Tick, type TravelPreview } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import type { RngStreams } from '../core/rng';
import { mulDiv } from '../core/math';
import { ACTION_MIN_AGE, actionDef, slotLock, type ActionDef } from './actions';
import type { CharacterState } from './character';
import { type Death } from './health';
import { ACCIDENT_FATAL_PPM } from './params';
import { gainSkill, skillRiskPct } from './skills';
import { fatiguePct, recoverStamina, spendStamina } from './stamina';
import { previewTravel, routeTerrainPct } from './travel';

export interface ActiveAction { slot: PlanSlot; remaining: number; total: number; preview: TravelPreview | null }
export interface PlayerState {
  plan: MonthPlan | null;
  active: ActiveAction | null;
  /** Đã báo kế hoạch hỏng (ngắt tua) chưa; chỉ báo một lần cho tới khi sửa kế hoạch hoặc đổi nơi ở. */
  planWarned: boolean;
}
type Log = (e: Omit<LogEntry, 'tick'>) => void;

const REST: PlanSlot = { action: 'action.rest' };
/**
 * Khóa tạm thời: tự hết theo mùa hoặc khi hồi sức. Ô đó nghỉ, không ngắt tua, chuyến đi dở giữ nguyên.
 * Các khóa khác (sai nơi, không có đường) là kế hoạch hỏng: nghỉ và ngắt tua một lần để người chơi sửa.
 */
export const TRANSIENT_LOCKS: ReadonlySet<string> = new Set(['lock.winter', 'lock.stamina', 'lock.health']);

/** Pha 5. Mỗi ô chỉ trừ giá một lần; hành động đang dở tiếp tục qua ranh tháng. */
export function playerPhase(s: PlayerState, c: CharacterState, tick: Tick, logic: RegionLogic, rng: RngStreams, log: Log): { death: Death | null; carePct: number } {
  const age = ageYearsAt(c.birthTick, tick);
  if (age < ACTION_MIN_AGE) {
    if (age >= 5 && isYearStart(tick)) {
      const educated = c.background === 'comfortable' || c.background === 'wealthy';
      gainSkill(c, educated ? 'literacy' : 'farming', tick, 8);
      if (!educated) spendStamina(c, 20);
      log({ key: educated ? 'log.child.study' : 'log.child.help', params: { age }, importance: 'minor' });
    }
    recoverStamina(c, tick);
    return { death: null, carePct: 0 };
  }
  if (tick - c.birthTick === ACTION_MIN_AGE * TICKS_PER_YEAR) log({ key: 'log.adulthood', params: { age }, importance: 'major' });

  const planned = s.active?.slot ?? s.plan?.slots[tick % TICKS_PER_MONTH] ?? REST;
  const lock = slotLock(planned, c, tick, logic);
  if (lock && !TRANSIENT_LOCKS.has(lock)) {
    if (!s.planWarned) log({ key: 'log.plan.invalid', params: { action: planned.action, reason: lock }, importance: 'minor' });
    s.planWarned = true;
    s.active = null;
  }
  // Khóa tạm thời mà đang đi dở: nghỉ ô này, chuyến đi chờ ô sau.
  if (lock) return perform(actionDef(REST.action)!, null, c, tick, logic, rng, log, age);

  const d = actionDef(planned.action)!;
  if (!s.active) {
    const preview = d.group === 'travel' ? previewTravel(logic, c.location, planned.target!) : null;
    const total = preview?.slots ?? d.slots;
    s.active = { slot: { ...planned }, total, remaining: total, preview };
  }
  const active = s.active;
  const result = perform(d, active.preview, c, tick, logic, rng, log, age);
  if (result.death) return result;
  active.remaining--;
  if (active.remaining === 0) {
    s.active = null;
    if (active.preview) arrive(s, c, active.preview.county, logic, log);
  } else log({ key: 'log.travel.progress', params: { remaining: active.remaining }, importance: 'minor' });
  return result;
}

/** Tới nơi: ô di chuyển tới đây trong kế hoạch thành nghỉ (đi một lần, không lặp), và kế hoạch được xét lại ở nơi mới. */
function arrive(s: PlayerState, c: CharacterState, county: number, logic: RegionLogic, log: Log): void {
  c.location = county;
  if (s.plan) {
    s.plan = { slots: s.plan.slots.map((p) => (p.action === 'action.travel' && p.target === county ? { ...REST } : p)) as MonthPlan['slots'] };
  }
  s.planWarned = false;
  log({ key: 'log.travel.arrived', params: { county: logic.counties[county]!.name ?? 'place.unknown' }, importance: 'minor' });
}

/** Trừ giá, cho kết quả và tính rủi ro của một ô. Việc thường ngày không ghi nhật ký. */
function perform(d: ActionDef, route: TravelPreview | null, c: CharacterState, tick: Tick, logic: RegionLogic, rng: RngStreams, log: Log, age: number): { death: Death | null; carePct: number } {
  const tired = fatiguePct(c, tick);
  if (spendStamina(c, d.stamina)) log({ key: 'log.exhaustion', params: {}, importance: 'minor' });
  if (d.skill) gainSkill(c, d.skill, tick);
  let carePct = 0;
  if (d.group === 'rest') { c.health = Math.min(c.healthMax, c.health + 18); carePct = 10; }
  if (d.group === 'heal') {
    c.health = Math.min(c.healthMax, c.health + 100); carePct = 50;
    for (const condition of c.conditions) condition.weeksLeft = Math.max(1, condition.weeksLeft - 1);
  }
  // Mỗi hệ thống dùng luồng riêng; nguy hiểm đường tính trên dữ liệu nguyên đã lưu.
  const r = rng.get(d.group === 'travel' ? 'travel' : 'actions');
  const terrain = route ? routeTerrainPct(logic, route.route) : 100;
  let ppm = mulDiv(mulDiv(d.riskPpm, terrain, 100), tired, 100);
  if (d.skill) ppm = mulDiv(ppm, skillRiskPct(c, d.skill), 100);
  if (d.riskPpm > 0 && r.chance(ppm)) {
    if (r.chance(mulDiv(ACCIDENT_FATAL_PPM, skillRiskPct(c, 'martial'), 100))) return { death: { tick, cause: 'accident', detail: d.group === 'travel' ? 'accident.travel' : 'accident.action' }, carePct };
    if (!c.conditions.some((x) => x.kind === 'injury')) {
      c.conditions.push({ id: 'injury.wound', kind: 'injury', severity: 'mild', weeksLeft: r.int(1, 3) });
      log({ key: 'log.injury.onset', params: { injury: 'injury.wound', age }, importance: 'major' });
    }
  }
  recoverStamina(c, tick, d.group === 'rest');
  return { death: null, carePct };
}
