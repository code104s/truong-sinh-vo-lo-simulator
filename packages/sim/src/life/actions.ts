import { ageYearsAt, calendarOf, type ActionGroup, type ActionOption, type MonthPlan, type PlanSlot, type SettlementKind, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import type { CharacterState } from './character';
import { isStarving } from './household';
import type { Skill } from './skills';
import { previewTravel } from './travel';
import { moneyCost, moneyGains, moneyLock } from '../economy/income';
import type { CountyEconomy, EconomyState } from '../economy/market';

export const ACTION_MIN_AGE = 12;
export interface ActionDef {
  id: string; group: ActionGroup; slots: number; stamina: number; riskPpm: number;
  skill?: Skill; places?: readonly SettlementKind[]; minStamina?: number;
  /** Chỉ sự kiện đặt vào (vd. đi phu trừ thuế); không có trong bảng chọn, không xếp vào kế hoạch được. */
  hidden?: boolean;
}
export const ACTIONS: readonly ActionDef[] = [
  { id: 'action.farm', group: 'livelihood', slots: 1, stamina: 180, riskPpm: 100, skill: 'farming', places: ['village'] },
  { id: 'action.hire', group: 'livelihood', slots: 1, stamina: 120, riskPpm: 200, skill: 'crafting', places: ['town', 'city'] },
  { id: 'action.forage', group: 'livelihood', slots: 1, stamina: 130, riskPpm: 350, skill: 'hunting' },
  { id: 'action.hunt', group: 'livelihood', slots: 1, stamina: 200, riskPpm: 1400, skill: 'hunting', places: ['village'], minStamina: 60 },
  { id: 'action.trade', group: 'livelihood', slots: 1, stamina: 60, riskPpm: 0, skill: 'trade', places: ['town', 'city'] },
  { id: 'action.study', group: 'study', slots: 1, stamina: 30, riskPpm: 0, skill: 'literacy', places: ['town', 'city'] },
  { id: 'action.train', group: 'study', slots: 1, stamina: 240, riskPpm: 800, skill: 'martial', minStamina: 80 },
  { id: 'action.rest', group: 'rest', slots: 1, stamina: 0, riskPpm: 0 },
  { id: 'action.heal', group: 'heal', slots: 1, stamina: 20, riskPpm: 0, places: ['town', 'city'] },
  { id: 'action.travel', group: 'travel', slots: 1, stamina: 100, riskPpm: 300, minStamina: 30 },
  { id: 'action.corvee', group: 'livelihood', slots: 2, stamina: 180, riskPpm: 500, hidden: true },
];
export const actionDef = (id: string) => ACTIONS.find((a) => a.id === id);
/** Việc nặng: thể lực tốn từ mức "cao" trở lên. */
export const HEAVY_STAMINA = 160;

export const restPlan = (): MonthPlan => ({ slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] });

/** `market`: chợ quận đang đứng, để xét khóa tiền; bỏ trống khi chỉ xét luật không phụ thuộc tiền. */
export function actionLock(def: ActionDef, c: CharacterState, tick: Tick, kind: SettlementKind, market?: CountyEconomy): string | null {
  if (ageYearsAt(c.birthTick, tick) < ACTION_MIN_AGE) return 'lock.child';
  if (def.places && !def.places.includes(kind)) return 'lock.place';
  if (def.id === 'action.farm' && calendarOf(tick).season === 'winter') return 'lock.winter';
  if (def.group !== 'rest' && def.group !== 'heal' && (c.health < 200 || c.conditions.some((s) => s.severity === 'grave'))) return 'lock.health';
  if (c.stamina < (def.minStamina ?? 0)) return 'lock.stamina';
  // Đói lả không làm nổi việc nặng (ADR 0013)
  if (isStarving(c.household) && def.stamina >= HEAVY_STAMINA) return 'lock.hunger';
  return market ? moneyLock(def.id, c, market) : null;
}

export function actionOptions(c: CharacterState, tick: Tick, logic: RegionLogic, eco: EconomyState): ActionOption[] {
  const kind = logic.settlementKind[c.location]!;
  const market = eco.counties[c.location]!;
  return ACTIONS.filter((d) => !d.hidden).map((d) => ({
    id: d.id, group: d.group, slots: d.slots,
    cost: { stamina: d.stamina === 0 ? 'cost.none' : d.stamina < 80 ? 'cost.low' : d.stamina < HEAVY_STAMINA ? 'cost.medium' : 'cost.high', risk: d.riskPpm === 0 ? 'risk.none' : d.riskPpm < 300 ? 'risk.low' : d.riskPpm < 1000 ? 'risk.medium' : 'risk.high',
      money: moneyCost(d.id) },
    gains: [...moneyGains(d.id), ...(d.skill ? [`skill.${d.skill}`] : [d.group === 'rest' ? 'gain.recovery' : d.group === 'heal' ? 'gain.healing' : 'gain.location'])],
    locked: actionLock(d, c, tick, kind, market),
  }));
}

/** Điều kiện thời điểm chạy kiểm lại từng tick; ở đây chỉ chặn lệnh không hợp lệ về ý nghĩa. */
export function validatePlan(plan: MonthPlan, logic: RegionLogic): boolean {
  return plan.slots.every((s) => !!actionDef(s.action) && !actionDef(s.action)!.hidden && (s.action === 'action.travel'
    ? s.target !== undefined && s.target < logic.counties.length
    : s.target === undefined));
}

export function slotLock(slot: PlanSlot, c: CharacterState, tick: Tick, logic: RegionLogic, market?: CountyEconomy): string | null {
  const def = actionDef(slot.action);
  if (!def) return 'lock.action';
  const lock = actionLock(def, c, tick, logic.settlementKind[c.location]!, market);
  if (lock) return lock;
  if (def.group === 'travel' && (slot.target === undefined || !previewTravel(logic, c.location, slot.target))) return 'lock.route';
  return null;
}
