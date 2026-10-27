import { t } from '@tsvl/content';
import { ACTION_GROUPS, type ActionOption, type ActionProgress, type MonthPlan, type PlanSlot, type TravelOption } from '@tsvl/shared';
import { useEffect, useState } from 'preact/hooks';
import { planDirty, planInvalid } from '../app/plan';
import type { WorldInfo } from '../app/state';
import { ACTION_CHAR } from '../ui/icons';
import { Seal } from '../ui/ink';

interface Props {
  plan: MonthPlan | null; draft: MonthPlan; active: ActionProgress | null; slotIndex: number;
  actions: ActionOption[]; travel: TravelOption[]; world: WorldInfo | null; locked: boolean;
  onDraft: (plan: MonthPlan) => void; onApply: () => void; onUndo: () => void;
}

const sealOf = (id: string) => ACTION_CHAR[id] ?? { char: '行', tone: 'ink' as const };

/** Chip giá: thể lực, rủi ro, tiền. Mức "không" bỏ đi cho gọn, trừ tiền (để thấy việc nào không tốn tiền). */
function CostChips({ option, risk, slots }: { option: ActionOption; risk?: string; slots?: number }) {
  const r = risk ?? option.cost.risk;
  return (
    <span class="chips">
      {option.cost.stamina !== 'cost.none' && <span class="chip">{t(option.cost.stamina)}</span>}
      {r !== 'risk.none' && <span class={`chip${r === 'risk.high' ? ' hi' : ''}`}>{t(r)}</span>}
      <span class={`chip${option.cost.money === 'money.none' ? ' ok' : ' hi'}`}>{t(option.cost.money)}</span>
      {(slots ?? option.slots) > 1 && <span class="chip">{t('ui.plan.slots', { count: slots ?? option.slots })}</span>}
    </span>
  );
}

/**
 * Kế hoạch tháng dạng thẻ tuần (đề xuất giao diện P0). Bấm thẻ mở bảng chọn. Chỉ chặn kế hoạch sai về ý nghĩa
 * (hành động không có, đi mà không có đích); khóa của lúc này chỉ cảnh báo vì sim xét lại từng ô khi chạy (ADR 0008).
 * Bản nháp do màn Đời người giữ, để bấm tua là áp dụng luôn.
 */
export function ActionPlanner({ plan, draft, active, slotIndex, actions, travel, world, locked, onDraft, onApply, onUndo }: Props) {
  const [picking, setPicking] = useState<number | null>(null);
  useEffect(() => { if (locked) setPicking(null); }, [locked]);
  const dirty = planDirty(draft, plan);
  const invalid = planInvalid(draft, actions, travel);
  const name = (county: number | undefined) => (county === undefined ? '' : world?.map.counties[county]?.name ?? '');
  const choose = (i: number, slot: PlanSlot) => {
    onDraft({ slots: draft.slots.map((s, k) => (k === i ? slot : s)) as MonthPlan['slots'] });
    setPicking(null);
  };

  return (
    <section class="planner" aria-label={t('ui.plan.title')}>
      <div class="planner-head"><span class="section-title">{t('ui.plan.title')}</span><span class="muted small">{t('ui.plan.repeat')}</span></div>
      {active && <p class="small active-action" role="status">{t('ui.plan.active', { action: t(active.action), remaining: active.remaining, total: active.total })}</p>}
      <div class="weeks">
        {draft.slots.map((slot, i) => {
          const occupied = !!active && i >= slotIndex && i < slotIndex + active.remaining;
          const shown = occupied && active ? { action: active.action, target: active.target } : slot;
          const option = actions.find((a) => a.id === shown.action);
          const journey = shown.action === 'action.travel' ? travel.find((p) => p.county === shown.target) : null;
          const seal = sealOf(shown.action);
          const state = i < slotIndex ? 'past' : i === slotIndex ? 'now' : 'next';
          const disabled = locked || occupied;
          return (
            <button key={i} type="button" class={`week week-${state}${occupied ? ' occupied' : ''}`} disabled={disabled} onClick={() => setPicking(i)}
              aria-label={`${t(`tenday.${i}`)}: ${t(shown.action)}. ${t('ui.plan.change')}`}>
              <span class="week-t"><span>{t(`tenday.${i}`)}</span><span>{occupied ? t('ui.plan.occupied') : t(`ui.plan.week_${state}`)}</span></span>
              <span class="week-a"><Seal char={seal.char} tone={seal.tone} />{t(shown.action)}{shown.action === 'action.travel' && shown.target !== undefined && <span class="week-to">{t('ui.plan.to', { place: name(shown.target) })}</span>}</span>
              {option && <CostChips option={option} risk={journey?.risk} slots={journey?.slots} />}
              {option && option.gains.length > 0 && <span class="week-gain">{option.gains.map((g) => t(g)).join(' · ')}</span>}
              {option?.locked && !occupied && <span class="week-warn">{t('ui.plan.locked_now', { reason: t(option.locked) })}</span>}
              {shown.action === 'action.travel' && !journey && !occupied && <span class="week-warn">{t('lock.route')}</span>}
            </button>
          );
        })}
      </div>
      {dirty && (
        <div class={`plan-dirty${invalid ? ' invalid' : ''}`} role="status">
          <span>{t(invalid ? 'ui.plan.dirty_invalid' : 'ui.plan.dirty')}</span>
          <span class="row">
            <button class="btn ghost small-btn" type="button" disabled={locked} onClick={onUndo}>{t('ui.plan.undo')}</button>
            <button class="btn small-btn" type="button" disabled={locked || invalid} onClick={onApply}>{t('ui.plan.apply_short')}</button>
          </span>
        </div>
      )}
      {picking !== null && (
        <ActionPalette week={picking} current={draft.slots[picking]!} actions={actions} travel={travel} name={name}
          onPick={(slot) => choose(picking, slot)} onClose={() => setPicking(null)} />
      )}
    </section>
  );
}

/** Bảng chọn hành động gom theo nhóm của GDD 3.2 E; đi lại thì chọn luôn điểm đến. */
function ActionPalette({ week, current, actions, travel, name, onPick, onClose }: {
  week: number; current: PlanSlot; actions: ActionOption[]; travel: TravelOption[]; name: (c: number) => string;
  onPick: (slot: PlanSlot) => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="palette-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="palette" role="dialog" aria-modal="true" aria-label={t('ui.plan.pick', { week: t(`tenday.${week}`) })}>
        <div class="palette-head">
          <span class="section-title">{t('ui.plan.pick', { week: t(`tenday.${week}`) })}</span>
          <button class="close" type="button" onClick={onClose} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
        </div>
        <p class="small muted">{t('ui.plan.pick_hint')}</p>
        {ACTION_GROUPS.map((group) => {
          const list = actions.filter((a) => a.group === group);
          if (!list.length || (group === 'travel' && !travel.length)) return null;
          return (
            <div key={group} class="palette-group">
              <span class="group-k">{t(`group.${group}`)}</span>
              <div class="tiles">
                {group === 'travel'
                  ? travel.map((p) => (
                    <button key={p.county} type="button" class={`tile${current.action === 'action.travel' && current.target === p.county ? ' chosen' : ''}`} onClick={() => onPick({ action: 'action.travel', target: p.county })}>
                      <span class="tile-a"><Seal char="行" tone="red" />{name(p.county)}</span>
                      <CostChips option={list[0]!} risk={p.risk} slots={p.slots} />
                      {list[0]!.locked && <span class="tile-why">{t(list[0]!.locked)}</span>}
                    </button>
                  ))
                  : list.map((a) => {
                    const seal = sealOf(a.id);
                    return (
                      <button key={a.id} type="button" class={`tile${a.locked ? ' locked' : ''}${current.action === a.id ? ' chosen' : ''}`} onClick={() => onPick({ action: a.id })}>
                        <span class="tile-a"><Seal char={seal.char} tone={seal.tone} />{t(a.id)}</span>
                        <CostChips option={a} />
                        {a.gains.length > 0 && <span class="tile-gain">{a.gains.map((g) => t(g)).join(' · ')}</span>}
                        {a.locked && <span class="tile-why">{t(a.locked)}</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
