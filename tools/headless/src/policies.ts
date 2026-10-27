import type { ActionOption, CalendarDate, CharacterView, MonthPlan, PendingEvent, SettlementKind, TravelOption } from '@tsvl/shared';
import { hash32, Rng } from '@tsvl/sim';

export const POLICIES = ['lazy', 'balanced', 'overwork', 'scholar', 'wanderer'] as const;
export type PolicyName = (typeof POLICIES)[number];
export interface PolicyContext {
  character: CharacterView; date: CalendarDate; actions: ActionOption[]; travel: TravelOption[];
  settlements: readonly SettlementKind[]; seed: number; active: boolean;
}

/** Người chơi máy: chỉ đọc view và lựa chọn được sim công bố. */
export function policyPlan(name: PolicyName, c: PolicyContext): MonthPlan | null {
  if (!c.character.canAct || c.active) return null;
  const plan: MonthPlan = { slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] };
  const usable = (id: string) => c.actions.some((a) => a.id === id && !a.locked);
  const setAll = (action: string) => { plan.slots = [{ action }, { action }, { action }]; };
  const travelTo = (county: number) => { plan.slots[c.date.tenDay] = { action: 'action.travel', target: county }; };
  if (name === 'lazy') return plan;
  if (name !== 'overwork' && c.character.healthPct < 50) { if (usable('action.heal')) setAll('action.heal'); return plan; }
  const work = ['action.farm', 'action.hire', 'action.forage'].find(usable) ?? 'action.rest';
  if (name === 'balanced') plan.slots = [{ action: work }, { action: work }, { action: 'action.rest' }];
  if (name === 'overwork') setAll(work);
  if (name === 'scholar') {
    // v0.3: học phải trả học phí; một ô làm thuê tự nuôi việc học, hết tiền thì đi làm. Chỉ lên đường khi nơi này không có trường.
    const lock = c.actions.find((a) => a.id === 'action.study')?.locked;
    const earn = usable('action.hire') ? 'action.hire' : 'action.rest';
    if (usable('action.study')) plan.slots = [{ action: 'action.study' }, { action: 'action.study' }, { action: earn }];
    else if (lock === 'lock.money') setAll(earn);
    else if (usable('action.travel')) {
      const destination = c.travel.find((p) => c.settlements[p.county] !== 'village');
      if (destination) travelTo(destination.county);
    }
  }
  if (name === 'wanderer' && usable('action.travel') && c.travel.length) {
    const rng = Rng.fromSeed(hash32('policy', c.seed, c.date.tick));
    // Một ô nghỉ giữa các chuyến để hồi sức.
    if (c.date.tick % 3 !== 0) travelTo(c.travel[rng.int(0, c.travel.length - 1)]!.county);
  }
  return plan;
}

/**
 * Người chơi máy gặp sự kiện (ADR 0014): mặc định lựa chọn đầu tiên đang mở; "lười" luôn đi lối ra (lựa chọn cuối,
 * không bao giờ bị khóa) vì lối ra thường là từ chối, cam chịu.
 */
export function policyChoose(name: PolicyName, pending: PendingEvent): string {
  if (name === 'lazy') return pending.choices.at(-1)!.id;
  return pending.choices.find((c) => c.locked === null)!.id;
}
