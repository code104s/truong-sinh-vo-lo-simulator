import { t } from '@tsvl/content';
import type { AdvanceMode, CalendarDate, CharacterView, LogEntry, MonthPlan, ActionOption, ActionProgress, TravelOption, TravelPreview } from '@tsvl/shared';
import { useEffect, useState } from 'preact/hooks';
import { logText } from '../app/format';
import { defaultPlan, planDirty, planInvalid } from '../app/plan';
import type { WorldInfo } from '../app/state';
import { KIND_CHAR } from '../ui/icons';
import { InkLandscape, Scroll, Seal } from '../ui/ink';
import { ActionPlanner } from './ActionPlanner';
import { Chronicle } from './Chronicle';
import { StatusBar } from './StatusBar';
import { TravelDialog } from './TravelDialog';

export { LogLine } from './Chronicle';

interface Props {
  world: WorldInfo | null;
  date: CalendarDate;
  character: CharacterView;
  log: LogEntry[];
  interrupt: LogEntry | null;
  running: boolean;
  busy: boolean;
  saved: boolean;
  onAdvance: (mode: AdvanceMode) => void;
  onRun: () => void;
  onPause: () => void;
  plan: MonthPlan | null; active: ActionProgress | null; actions: ActionOption[]; travel: TravelOption[]; travelPreview: TravelPreview | null;
  onPlan: (plan: MonthPlan) => void; onPreview: (county: number) => void;
}

const copyPlan = (p: MonthPlan | null): MonthPlan => (p ? { slots: p.slots.map((s) => ({ ...s })) as MonthPlan['slots'] } : defaultPlan());

/** Thân thế: những gì không đổi hoặc ít đổi. Đặt bên phải để thanh trạng thái và biên niên được chỗ (đề xuất P0). */
function Dossier({ c, world }: { c: CharacterView; world: WorldInfo | null }) {
  const place = world?.birthplaces.find((b) => b.id === c.birthplaceId);
  return (
    <aside class="dossier">
      <span class="section-title">{t('ui.life.dossier')}</span>
      {place && <p class="small"><Seal char={KIND_CHAR[place.kind]} tone="ink" /> {t('ui.life.born', { place: `${place.name} (${t(`kind.${place.kind}`)})` })}</p>}
      <dl class="attrs">
        <dt>{t('ui.life.background')}</dt><dd class="cap">{t(c.background)}</dd>
        <dt>{t('ui.life.personality')}</dt><dd>{t(c.personality)}</dd>
        <dt>{t('ui.life.constitution')}</dt><dd>{t(c.constitution)}</dd>
        <dt>{t('ui.life.aptitude')}</dt><dd>{t(c.aptitude)}</dd>
        <dt>{t('ui.life.traits')}</dt>
        <dd>{c.traits.length ? c.traits.map((x) => t(x)).join(' · ') : <span class="muted">{t('ui.life.traits_none')}</span>}</dd>
      </dl>
      <div class="dossier-block">
        <span class="dossier-k">{t('ui.life.skills')}</span>
        {c.skills.length ? <ul class="skill-list">{c.skills.map((s) => <li key={s.id}><span>{t(s.id)}</span><span class="muted">{t(s.rank)}</span></li>)}</ul> : <p class="muted small">{t('ui.life.skills_none')}</p>}
      </div>
      <div class="dossier-block">
        <span class="dossier-k">{t('ui.life.conditions')}</span>
        {c.conditions.length
          ? <p>{c.conditions.map((x) => <span key={x.id} class={`condition sev-${x.severity}`}>{t(x.id)} ({t(`severity.${x.severity}`)}) </span>)}</p>
          : <p class="muted small">{t('ui.life.conditions_none')}</p>}
      </div>
    </aside>
  );
}

export function LifeScreen({ world, date, character: c, log, interrupt, running, busy, saved, onAdvance, onRun, onPause, plan, active, actions, travel, travelPreview, onPlan, onPreview }: Props) {
  const [travelOpen, setTravelOpen] = useState(false);
  const [draft, setDraft] = useState<MonthPlan>(copyPlan(plan));
  // Mỗi STATE mang một object kế hoạch mới; chỉ đặt lại bản nháp khi kế hoạch thật sự đổi.
  const planKey = JSON.stringify(plan);
  useEffect(() => setDraft(copyPlan(plan)), [planKey]);
  const lock = running || busy;
  const dirty = c.canAct && planDirty(draft, plan);
  const applicable = dirty && !planInvalid(draft, actions, travel);
  /** Bấm tua khi đang sửa dở: áp dụng bản nháp trước (worker xử lý lệnh theo thứ tự). */
  const withDraft = (go: () => void) => () => { if (applicable) onPlan(draft); go(); };

  return (
    <div class="screen ink-screen full">
      <InkLandscape />
      <Scroll className="wide">
        <div class="life">
          <StatusBar c={c} date={date} saved={saved} world={world} />
          <div class="life-body">
            <main class="chronicle">
              {c.canAct
                ? <ActionPlanner plan={plan} draft={draft} active={active} slotIndex={date.tenDay} actions={actions} travel={travel} world={world} locked={lock}
                    onDraft={setDraft} onApply={() => onPlan(draft)} onUndo={() => setDraft(copyPlan(plan))} />
                : <p class="hint childhood-hint">{t('ui.plan.childhood')}</p>}
              {interrupt && (
                <div class="interrupt" role="status">
                  <Seal char="變" /> <strong>{t('ui.interrupt')}:</strong> {logText(interrupt)}
                </div>
              )}
              <Chronicle log={log} birthTick={c.birthTick} />
              <footer class="controls">
                <button class="btn ghost" disabled={!running} onClick={onPause}>{t('ui.ctrl.pause')}</button>
                <button class="btn" disabled={lock} onClick={withDraft(() => onAdvance('week'))}>{t('ui.ctrl.week')}</button>
                <button class="btn" disabled={lock} onClick={withDraft(() => onAdvance('month'))}>{t('ui.ctrl.month')}</button>
                <button class="btn" disabled={lock} onClick={withDraft(() => onAdvance('year'))}>{t('ui.ctrl.year')}</button>
                <button class="btn primary" disabled={lock} onClick={withDraft(onRun)}>{t('ui.ctrl.until')}</button>
                <button class="btn ghost" disabled={lock || !c.canAct || !!active || !!actions.find((a) => a.id === 'action.travel')?.locked} onClick={() => setTravelOpen(true)}>{t('ui.travel.open')}</button>
                {running && <span class="muted running">{t('ui.ctrl.running')}</span>}
              </footer>
            </main>
            <Dossier c={c} world={world} />
          </div>
        </div>
      </Scroll>
      {travelOpen && world && <TravelDialog world={world} location={c.location} slotIndex={date.tenDay} plan={plan} options={travel} preview={travelPreview} onPreview={onPreview} onPlan={onPlan} onClose={() => setTravelOpen(false)} />}
    </div>
  );
}
