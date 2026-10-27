import { t } from '@tsvl/content';
import type { AdvanceMode, CalendarDate, CharacterView, LogEntry, MonthPlan, ActionOption, ActionProgress, TravelOption, TravelPreview } from '@tsvl/shared';
import { useEffect, useRef, useState } from 'preact/hooks';
import { dateText, logText, shortDate } from '../app/format';
import type { WorldInfo } from '../app/state';
import { KIND_CHAR, SEASON_CHAR, logSeal } from '../ui/icons';
import { BrushLabel, Enso, InkLandscape, Portrait, Scroll, Seal } from '../ui/ink';
import { PORTRAIT_MIN_AGE, portraitOf } from '../ui/portraits';
import { ActionPlanner } from './ActionPlanner';
import { TravelDialog } from './TravelDialog';

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

export function LogLine({ e, forceMajor = false }: { e: LogEntry; forceMajor?: boolean }) {
  const seal = logSeal(e);
  return (
    <p class={`entry ${forceMajor ? 'major' : e.importance}`}>
      <span class="entry-date">{shortDate(e.tick)}</span>
      <span class="entry-seal">{seal && <Seal char={seal.char} tone={seal.tone} />}</span>
      <span>{logText(e)}</span>
    </p>
  );
}

export function LifeScreen({ world, date, character: c, log, interrupt, running, busy, saved, onAdvance, onRun, onPause, plan, active, actions, travel, travelPreview, onPlan, onPreview }: Props) {
  const [travelOpen, setTravelOpen] = useState(false);
  const place = world?.birthplaces.find((b) => b.id === c.birthplaceId);
  const logEnd = useRef<HTMLDivElement>(null);
  useEffect(() => logEnd.current?.scrollIntoView({ block: 'end' }), [log.length]);
  const lock = running || busy;

  return (
    <div class="screen ink-screen full">
      <InkLandscape />
      <Scroll className="wide">
        <div class="two-col">
          <aside class="character">
            <BrushLabel>{t('ui.life.character')}</BrushLabel>
            <div class="char-head">
              <Portrait src={c.ageYears >= PORTRAIT_MIN_AGE ? portraitOf(c) : null} alt={c.name} />
              <div>
                <h2 class="char-name">{c.name}</h2>
                <p class="muted">{t(`gender.${c.gender}`)} · {t('ui.life.age', { age: c.ageYears })}</p>
                {place && (
                  <p class="small">
                    <Seal char={KIND_CHAR[place.kind]} tone="ink" /> {t('ui.life.born', { place: `${place.name} (${t(`kind.${place.kind}`)})` })}
                  </p>
                )}
              </div>
            </div>
            <dl class="attrs">
              <dt>{t('ui.life.background')}</dt><dd class="cap">{t(c.background)}</dd>
              <dt>{t('ui.life.personality')}</dt><dd>{t(c.personality)}</dd>
              <dt>{t('ui.life.constitution')}</dt><dd>{t(c.constitution)}</dd>
              <dt>{t('ui.life.aptitude')}</dt><dd>{t(c.aptitude)}</dd>
              <dt>{t('ui.life.location')}</dt><dd>{world?.map.counties[c.location]?.name}</dd>
              <dt>{t('ui.life.stamina')}</dt><dd class={`stamina-${c.staminaBand}`}>{t(`stamina.${c.staminaBand}`)}</dd>
              <dt>{t('ui.life.skills')}</dt><dd>{c.skills.length ? c.skills.map((s) => `${t(s.id)}: ${t(s.rank)}`).join(' · ') : t('ui.life.skills_none')}</dd>
              <dt>{t('ui.life.traits')}</dt>
              <dd>{c.traits.length ? c.traits.map((x) => t(x)).join(' · ') : <span class="muted">{t('ui.life.traits_none')}</span>}</dd>
            </dl>
            <div class="health">
              <div class="health-head">
                <span>{t('ui.life.health')}</span>
                <span class={`band band-${c.healthBand}`}>{t(`health.${c.healthBand}`)}</span>
              </div>
              <div class="ink-bar"><div class={`ink-bar-fill band-${c.healthBand}`} style={{ width: `${c.healthPct}%` }} /></div>
            </div>
            <p class="conditions">
              <span class="muted">{t('ui.life.conditions')}: </span>
              {c.conditions.length
                ? c.conditions.map((x) => <span key={x.id} class={`condition sev-${x.severity}`}>{t(x.id)} ({t(`severity.${x.severity}`)})</span>)
                : t('ui.life.conditions_none')}
            </p>
          </aside>

          <main class="chronicle">
            <header class="date-bar">
              <Enso char={SEASON_CHAR[date.season]} label={t(`season.${date.season}`)} />
              <div>
                <div class="date">{dateText(date)}</div>
                <div class="muted small">{t(`season.${date.season}`)}{saved && <> · {t('ui.life.saved')}</>}</div>
              </div>
              <BrushLabel className="right">{t('ui.life.chronicle')}</BrushLabel>
            </header>
            {c.canAct ? <ActionPlanner plan={plan} active={active} slotIndex={date.tenDay} actions={actions} travel={travel} world={world} locked={lock} onPlan={onPlan} /> : <p class="hint childhood-hint">{t('ui.plan.childhood')}</p>}
            {interrupt && (
              <div class="interrupt" role="status">
                <Seal char="變" /> <strong>{t('ui.interrupt')}:</strong> {logText(interrupt)}
              </div>
            )}
            <div class="log" aria-label={t('ui.life.log')}>
              {log.map((e, i) => <LogLine key={i} e={e} />)}
              <div ref={logEnd} />
            </div>
            <footer class="controls">
              <button class="btn ghost" disabled={!running} onClick={onPause}>{t('ui.ctrl.pause')}</button>
              <button class="btn" disabled={lock} onClick={() => onAdvance('week')}>{t('ui.ctrl.week')}</button>
              <button class="btn" disabled={lock} onClick={() => onAdvance('month')}>{t('ui.ctrl.month')}</button>
              <button class="btn" disabled={lock} onClick={() => onAdvance('year')}>{t('ui.ctrl.year')}</button>
              <button class="btn primary" disabled={lock} onClick={onRun}>{t('ui.ctrl.until')}</button>
              <button class="btn ghost" disabled={lock || !c.canAct || !!active || !!actions.find((a) => a.id === 'action.travel')?.locked} onClick={() => setTravelOpen(true)}>{t('ui.travel.open')}</button>
              {running && <span class="muted running">{t('ui.ctrl.running')}</span>}
            </footer>
          </main>
        </div>
      </Scroll>
      {travelOpen && world && <TravelDialog world={world} location={c.location} slotIndex={date.tenDay} plan={plan} options={travel} preview={travelPreview} onPreview={onPreview} onPlan={onPlan} onClose={() => setTravelOpen(false)} />}
    </div>
  );
}
