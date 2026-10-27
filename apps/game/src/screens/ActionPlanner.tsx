import { t } from '@tsvl/content';
import type { ActionOption, ActionProgress, MonthPlan, PlanSlot, TravelOption } from '@tsvl/shared';
import { useEffect, useState } from 'preact/hooks';
import { planInvalid } from '../app/plan';
import type { WorldInfo } from '../app/state';

interface Props { plan: MonthPlan | null; active: ActionProgress | null; slotIndex: number; actions: ActionOption[]; travel: TravelOption[]; world: WorldInfo | null; locked: boolean; onPlan: (plan: MonthPlan) => void }
const defaultPlan = (): MonthPlan => ({ slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] });

/**
 * Kế hoạch tháng. Chỉ chặn kế hoạch sai về ý nghĩa (hành động không có, đi mà không có đích).
 * Khóa của lúc này (mùa, nơi ở, thể lực…) chỉ là cảnh báo: kế hoạch áp cho các tuần sau, sim xét lại từng ô khi chạy.
 */
export function ActionPlanner({ plan, active, slotIndex, actions, travel, world, locked, onPlan }: Props) {
  const [draft, setDraft] = useState<MonthPlan>(plan ?? defaultPlan());
  useEffect(() => setDraft(plan ?? defaultPlan()), [plan]);
  const change = (i: number, slot: PlanSlot) => setDraft((p) => ({ slots: p.slots.map((s, k) => k === i ? slot : s) as MonthPlan['slots'] }));
  const invalid = planInvalid(draft, actions, travel);
  const name = (county: number | undefined) => (county === undefined ? '' : world?.map.counties[county]?.name ?? '');
  return (
    <section class="planner" aria-label={t('ui.plan.title')}>
      <div class="planner-head"><strong>{t('ui.plan.title')}</strong><span class="muted small">{t('ui.plan.repeat')}</span></div>
      {active && <p class="small active-action" role="status">{t('ui.plan.active', { action: active.action, remaining: active.remaining, total: active.total })}</p>}
      <div class="plan-slots">
        {draft.slots.map((slot, i) => {
          const occupied = !!active && i >= slotIndex && i < slotIndex + active.remaining;
          const shown = occupied && active ? { action: active.action, target: active.target } : slot;
          const option = actions.find((a) => a.id === shown.action);
          const journey = shown.action === 'action.travel' ? travel.find((p) => p.county === shown.target) : null;
          return <div key={i} class={`plan-slot${i === slotIndex ? ' current' : ''}`}>
            <label for={`plan-${i}`} class="small">{t(`tenday.${i}`)}{occupied ? ` · ${t('ui.plan.occupied')}` : ''}</label>
            <select id={`plan-${i}`} value={shown.action} disabled={locked || occupied} onChange={(e) => {
              const action = e.currentTarget.value;
              change(i, action === 'action.travel' && travel[0] ? { action, target: travel[0].county } : { action });
            }}>
              {actions.map((a) => <option key={a.id} value={a.id}>{t(a.id)}</option>)}
            </select>
            {shown.action === 'action.travel' && <select aria-label={t('ui.travel.destination')} value={shown.target ?? ''} disabled={locked || occupied} onChange={(e) => change(i, { action: slot.action, target: Number(e.currentTarget.value) })}>
              <option value="" disabled>{t('ui.travel.choose')}</option>
              {shown.target !== undefined && !journey && <option value={shown.target} disabled>{name(shown.target)}</option>}
              {travel.map((p) => <option key={p.county} value={p.county}>{name(p.county)} · {t('ui.plan.slots', { count: p.slots })}</option>)}
            </select>}
            {option && <p class="small muted">{t(option.cost.stamina)} · {t(journey?.risk ?? option.cost.risk)} · {t('ui.plan.slots', { count: journey?.slots ?? option.slots })}</p>}
            {option && <p class="small">{option.gains.map((g) => t(g)).join(' · ')}</p>}
            {option?.locked && !occupied && <p class="small plan-warning">{t('ui.plan.locked_now', { reason: option.locked })}</p>}
            {shown.action === 'action.travel' && !journey && !occupied && <p class="small plan-warning">{t('lock.route')}</p>}
          </div>;
        })}
      </div>
      <button class="btn small-btn" disabled={locked || invalid} onClick={() => onPlan(draft)}>{t('ui.plan.apply')}</button>
    </section>
  );
}
