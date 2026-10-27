import { t } from '@tsvl/content';
import { GRAIN_PER_DOU, type CharacterView, type LifeSummary } from '@tsvl/shared';
import { useState } from 'preact/hooks';
import { logText, shortDate } from '../app/format';
import type { WorldInfo } from '../app/state';
import { turningPoints } from '../app/summary';
import { BrushLabel, InkLandscape, Portrait, Scroll, Seal } from '../ui/ink';
import { PORTRAIT_MIN_AGE, portraitOf } from '../ui/portraits';
import { LogLine } from './LifeScreen';

type Tab = 'turning' | 'milestones';

/**
 * Màn tổng kết (F5): bia đời bên trái — tuổi, nguyên do, của cải lúc nhắm mắt, số năm phải nhịn đói; bên phải các ngã
 * rẽ (lựa chọn sự kiện) và những mốc lớn.
 */
export function SummaryScreen({ summary: s, character, world, onBack }: { summary: LifeSummary; character: CharacterView | null; world: WorldInfo | null; onBack: () => void }) {
  const place = world?.birthplaces.find((b) => b.id === s.birthplaceId);
  const turns = turningPoints(s.milestones, s.birthTick);
  const [tab, setTab] = useState<Tab>(turns.length ? 'turning' : 'milestones');
  const e = s.estate;
  const land = e.landMu > 0 ? `${t('ui.hud.mu', { mu: e.landMu })} · ${t(`tenure.${e.tenure}`)}` : e.tenure === 'tenant' ? t('tenure.tenant') : t('ui.hud.no_land');
  return (
    <div class="screen ink-screen full summary">
      <InkLandscape />
      <Scroll title={t('ui.summary.title')} onClose={onBack} className="wide">
        <div class="two-col">
          <aside class="epitaph">
            <Portrait src={character && s.ageYears >= PORTRAIT_MIN_AGE ? portraitOf(character) : null} alt={s.name} age={s.ageYears} />
            <h1 class="epitaph-name">{s.name}</h1>
            <p class="lived">{t('ui.summary.lived', { age: s.ageYears })} <Seal char="終" /></p>
            <p>{t('ui.summary.span', { from: shortDate(s.birthTick), to: shortDate(s.deathTick) })}</p>
            <p>{t('ui.summary.cause', { cause: `death.${s.cause}`, detail: s.causeDetail })}</p>
            {place && <p>{t('ui.summary.place', { place: `${place.name} (${t(`kind.${place.kind}`)})` })}</p>}
            <div class="estate">
              <span class="dossier-k">{t('ui.summary.estate')}</span>
              <dl class="attrs">
                <dt>{t('ui.hud.money')}</dt><dd>{t('ui.hud.coin', { coin: e.money })}</dd>
                <dt>{t('ui.hud.food')}</dt><dd>{t('ui.hud.dou', { dou: Math.floor(e.grain / GRAIN_PER_DOU) })}</dd>
                <dt>{t('ui.hud.land')}</dt><dd>{land}</dd>
                <dt>{t('ui.summary.hunger')}</dt>
                <dd class={s.hungerYears > 0 ? 'hungry' : ''}>{s.hungerYears > 0 ? t('ui.summary.hunger_years', { count: s.hungerYears }) : t('ui.summary.hunger_none')}</dd>
                <dt>{t('ui.summary.turning')}</dt><dd>{t('ui.summary.turning_count', { count: turns.length })}</dd>
              </dl>
            </div>
            <p class="muted tiny">{t('ui.summary.digest', { digest: s.digest })}</p>
            <button class="btn primary" onClick={onBack}>{t('ui.back')}</button>
          </aside>
          <main class="chronicle">
            <header class="date-bar">
              <BrushLabel>{t(tab === 'turning' ? 'ui.summary.turning' : 'ui.summary.milestones')}</BrushLabel>
              <span class="tabs" role="tablist">
                {(['turning', 'milestones'] as const).map((x) => (
                  <button key={x} type="button" role="tab" aria-selected={tab === x} class={`tab${tab === x ? ' on' : ''}`} onClick={() => setTab(x)}>
                    {t(x === 'turning' ? 'ui.summary.turning' : 'ui.summary.milestones')}
                  </button>
                ))}
              </span>
            </header>
            <div class="log">
              {tab === 'milestones'
                ? s.milestones.map((x, i) => <LogLine key={i} e={x} forceMajor />)
                : turns.length
                  ? turns.map((p, i) => (
                    <p key={i} class="entry major turn">
                      <span class="entry-date">{shortDate(p.entry.tick)}<br /><span class="muted small">{t('ui.summary.at_age', { age: p.age })}</span></span>
                      <span class="entry-seal"><Seal char="變" /></span>
                      <span><strong class="turn-title">{t(`${p.eventId}.title`, p.entry.params)}</strong> {logText(p.entry)}</span>
                    </p>
                  ))
                  : <p class="muted">{t('ui.summary.turning_none')}</p>}
            </div>
          </main>
        </div>
      </Scroll>
    </div>
  );
}
