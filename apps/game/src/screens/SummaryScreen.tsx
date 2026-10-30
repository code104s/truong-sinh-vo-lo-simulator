import { t } from '@tsvl/content';
import { GRAIN_PER_DOU, type CharacterView, type LifeSummary } from '@tsvl/shared';
import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { logText, shortDate } from '../app/format';
import type { WorldInfo } from '../app/state';
import { FACTION_CHAR } from '../app/factions';
import { REALM_SEAL, type RisenRealm } from '../app/cultivation';
import { affairsRows, careerRows, daoMilestones, daoReachLine, daoSummary, departedPeople, legacyRows, lifeCareer, turningPoints } from '../app/summary';
import { CAREER_CHAR } from '../ui/icons';
import { BrushLabel, InkLandscape, Portrait, Scroll, Seal } from '../ui/ink';
import { PORTRAIT_MIN_AGE, portraitOf } from '../ui/portraits';
import { LogLine } from './LifeScreen';

type Tab = 'turning' | 'departed' | 'affairs' | 'dao' | 'milestones';
const TABS: readonly Tab[] = ['turning', 'departed', 'affairs', 'dao', 'milestones'];
const TAB_LABEL: Record<Tab, string> = { turning: 'ui.summary.turning', departed: 'ui.summary.departed', affairs: 'ui.summary.affairs', dao: 'ui.summary.dao', milestones: 'ui.summary.milestones' };
/** Nhãn nút tab: năm tab chung một hàng nên "Thế sự một đời", "Đường tu" rút gọn (tiêu đề vẫn đủ chữ). */
const TAB_BUTTON: Record<Tab, string> = { ...TAB_LABEL, affairs: 'ui.summary.affairs_tab', dao: 'ui.summary.dao_tab' };

/**
 * Màn tổng kết (F5): bia đời bên trái — tuổi, nguyên do, của cải lúc nhắm mắt, số năm phải nhịn đói; bên phải các ngã
 * rẽ (lựa chọn sự kiện), người đã đi trước, thế sự một đời (v0.6 F4: thế lực đã thấy thịnh, suy, mất) và những mốc lớn.
 */
export function SummaryScreen({ summary: s, character, world, onBack }: { summary: LifeSummary; character: CharacterView | null; world: WorldInfo | null; onBack: () => void }) {
  const place = world?.birthplaces.find((b) => b.id === s.birthplaceId);
  const turns = turningPoints(s.milestones, s.birthTick);
  const departed = departedPeople(s.milestones, s.birthTick);
  const [tab, setTab] = useState<Tab>(turns.length ? 'turning' : 'milestones');
  const e = s.estate;
  const legacy = legacyRows(s.legacy, character?.gender ?? null);
  const affairs = affairsRows(s.legacy.factions);
  // Một đời làm nghề (v0.7 F4)
  const jobs = careerRows(s.legacy.careers);
  const main = lifeCareer(jobs);
  // Đường tu (v0.8 F4)
  const dao = daoSummary(s.legacy.cultivation, s.birthTick);
  const reach = daoReachLine(dao);
  const daoMarks = daoMilestones(s.milestones);
  const okCount = dao.attempts.filter((a) => a.ok).length;
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
            {dao.reach === 'risen' && <p class="life-career life-realm"><Seal char={REALM_SEAL[dao.realm as RisenRealm]} tone="jade" /> {t(`realm.${dao.realm}`)}</p>}
            {main && <p class="life-career"><Seal char={CAREER_CHAR[main.id].char} tone={CAREER_CHAR[main.id].tone} /> {t('ui.hud.career', { career: `career.${main.id}`, rank: `career.rank.${main.rank}` })}</p>}
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
                <dt>{t('ui.summary.departed')}</dt><dd>{t('ui.summary.departed_count', { count: departed.length })}</dd>
                <dt>{t('ui.summary.affairs')}</dt><dd>{t('ui.summary.affairs_count', { count: affairs.length, gone: affairs.filter((a) => a.fate === 'gone').length })}</dd>
              </dl>
            </div>
            <div class="estate legacy">
              <span class="dossier-k">{t('ui.summary.legacy')}</span>
              <dl class="attrs">
                {legacy.map((r) => (
                  <Fragment key={r.label}>
                    <dt>{t(r.label)}</dt>
                    <dd class={r.tone ? `tone-${r.tone}` : undefined}>
                      {t(r.value, r.params)}
                      {r.note && <span class="legacy-note muted small">{r.note}</span>}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </div>
            <div class="estate careers-life">
              <span class="dossier-k">{t('ui.summary.careers')}</span>
              {jobs.length === 0 ? <p class="muted small">{t('ui.summary.careers_none')}</p> : (
                <ul class="career-life-list">
                  {jobs.map((j) => (
                    <li key={j.id}>
                      <Seal char={CAREER_CHAR[j.id].char} tone={CAREER_CHAR[j.id].tone} />
                      <span class="person-text">
                        <strong>{t(`career.${j.id}`)}</strong>
                        <span class="small">{t('ui.summary.career_rank', { rank: `career.rank.${j.rank}` })} · {j.years > 0 ? t('ui.summary.career_years', { count: j.years }) : t('ui.summary.career_short')}</span>
                        {(j.stints > 1 || j.current) && <span class="small muted">{[j.stints > 1 ? t('ui.summary.career_stints', { count: j.stints }) : null, j.current ? t('ui.summary.career_current') : null].filter(Boolean).join(' · ')}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div class={`estate dao-life reach-${dao.reach}`}>
              <span class="dossier-k">{t('ui.summary.dao')}</span>
              <p class="small dao-reach">{t(reach.key, reach.params)}</p>
              <dl class="attrs">
                <dt>{t('ui.dao.root')}</dt><dd class={dao.reach === 'untested' ? 'muted' : undefined}>{t(dao.root)}</dd>
                <dt>{t('ui.dao.path')}</dt><dd class={dao.path === 'ui.summary.dao_no_path' ? 'muted' : undefined}>{t(dao.path)}</dd>
                <dt>{t('ui.dao.realm')}</dt><dd>{t(`realm.${dao.realm}`)}</dd>
                <dt>{t('ui.summary.dao_breaks')}</dt>
                <dd>
                  {dao.attempts.length
                    ? t('ui.summary.dao_breaks_count', { count: dao.attempts.length, ok: okCount, failed: dao.attempts.length - okCount })
                    : <span class="muted">{t('ui.summary.dao_breaks_none')}</span>}
                  {dao.attempts.length > 0 && <span class="legacy-note small">{dao.attempts.map((a, i) => <span key={i} class={a.ok ? 'tone-good' : 'tone-bad'}>{i > 0 ? ' · ' : ''}{t(a.ok ? 'ui.summary.dao_attempt_ok' : 'ui.summary.dao_attempt_failed', { age: a.age })}</span>)}</span>}
                </dd>
              </dl>
            </div>
            <p class="muted tiny">{t('ui.summary.digest', { digest: s.digest })}</p>
            <button class="btn primary" onClick={onBack}>{t('ui.back')}</button>
          </aside>
          <main class="chronicle">
            <header class="date-bar">
              <BrushLabel>{t(TAB_LABEL[tab])}</BrushLabel>
              <span class="tabs" role="tablist">
                {TABS.map((x) => (
                  <button key={x} type="button" role="tab" aria-selected={tab === x} class={`tab${tab === x ? ' on' : ''}`} onClick={() => setTab(x)}>
                    {t(TAB_BUTTON[x])}
                  </button>
                ))}
              </span>
            </header>
            <div class="log">
              {tab === 'affairs'
                ? affairs.length
                  ? affairs.map((a, i) => (
                    <p key={i} class={`entry major affair fate-${a.fate}`}>
                      <span class="entry-date">{t(`faction.fate.${a.fate}`)}</span>
                      <span class="entry-seal"><Seal char={FACTION_CHAR[a.kind]} tone={a.fate === 'gone' ? 'ink' : a.kind === 'bandits' ? 'red' : 'ochre'} /></span>
                      <span><strong>{t(a.name.key, a.name.params)}</strong> <span class="muted small">{t(`faction.kind.${a.kind}`)}</span></span>
                    </p>
                  ))
                  : <p class="muted">{t('ui.summary.affairs_none')}</p>
              : tab === 'dao'
                ? daoMarks.length ? daoMarks.map((x, i) => <LogLine key={i} e={x} forceMajor />) : <p class="muted">{t('ui.summary.dao_none')}</p>
              : tab === 'milestones'
                ? s.milestones.map((x, i) => <LogLine key={i} e={x} forceMajor />)
                : tab === 'departed'
                  ? departed.length
                    ? departed.map((d, i) => (
                      <p key={i} class="entry major departed">
                        <span class="entry-date">{shortDate(d.entry.tick)}<br /><span class="muted small">{t('ui.summary.at_age', { age: d.playerAge })}</span></span>
                        <span class="entry-seal"><Seal char="喪" tone="ink" /></span>
                        <span>{logText(d.entry)}</span>
                      </p>
                    ))
                    : <p class="muted">{t('ui.summary.departed_none')}</p>
                : turns.length
                  ? turns.map((p, i) => (
                    <p key={i} class="entry major turn">
                      <span class="entry-date">{shortDate(p.entry.tick)}<br /><span class="muted small">{t('ui.summary.at_age', { age: p.age })}</span></span>
                      <span class="entry-seal">{p.entry.career ? <Seal char={CAREER_CHAR[p.entry.career].char} tone={CAREER_CHAR[p.entry.career].tone} /> : <Seal char="變" />}</span>
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
