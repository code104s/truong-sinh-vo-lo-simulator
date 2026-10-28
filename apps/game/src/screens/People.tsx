import { t } from '@tsvl/content';
import type { FactionView, NpcView } from '@tsvl/shared';
import { useEffect, useState } from 'preact/hooks';
import { memberLabel } from '../app/factions';
import { circleRows, healthTone, kinKey, peopleRows, relationKeys, relationTone } from '../app/people';
import { Portrait } from '../ui/ink';
import { personPortraitOf } from '../ui/portraits';

/**
 * Người trong quận (v0.4 F1, ADR 0016): người có tên ở quận đang đứng, chân dung cố định theo người, tên, tuổi, nghề,
 * sức khỏe; v0.5 thêm vai, quan hệ với mình; v0.6 F2 thêm thế lực người ấy thuộc về. Bấm một người thì xem nhanh.
 */
export function PeoplePanel({ people, place, factions = [] }: { people: NpcView[]; place: string; factions?: FactionView[] }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { shown, hidden } = peopleRows(people, expanded);
  const selected = people.find((p) => p.id === open) ?? null;
  return (
    <div class="dossier-block people-panel">
      <span class="dossier-k">{t('ui.people.title', { place, count: people.length })}</span>
      {people.length === 0 ? <p class="muted small">{t('ui.people.none')}</p> : (
        <ul class="people-list">
          {shown.map((p) => <PersonRow key={p.id} p={p} factions={factions} onOpen={() => setOpen(p.id)} />)}
        </ul>
      )}
      {(hidden > 0 || expanded) && (
        <button type="button" class="btn ghost small-btn people-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? t('ui.people.less') : t('ui.people.more', { count: people.length })}
        </button>
      )}
      {selected && <PersonCard p={selected} place={place} factions={factions} onClose={() => setOpen(null)} />}
    </div>
  );
}

/**
 * Người thân, người quen (v0.5 F1, ADR 0017, 0018): ở mọi quận, còn sống — cha mẹ, vợ/chồng, con, anh chị em, rồi người
 * đã qua lại. Người không ở quận đang đứng ghi "ở nơi khác" (người chơi không biết họ đang ở đâu).
 */
export function CirclePanel({ circle, people, place, factions = [] }: { circle: NpcView[]; people: NpcView[]; place: string; factions?: FactionView[] }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { shown, hidden } = circleRows(circle, expanded);
  const here = new Set(people.map((p) => p.id));
  const selected = circle.find((p) => p.id === open) ?? null;
  return (
    <div class="dossier-block people-panel circle-panel">
      <span class="dossier-k">{t('ui.circle.title', { count: circle.length })}</span>
      {circle.length === 0 ? <p class="muted small">{t('ui.circle.none')}</p> : (
        <ul class="people-list">
          {shown.map((p) => <PersonRow key={p.id} p={p} factions={factions} away={!here.has(p.id)} onOpen={() => setOpen(p.id)} />)}
        </ul>
      )}
      {(hidden > 0 || expanded) && (
        <button type="button" class="btn ghost small-btn people-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? t('ui.people.less') : t('ui.people.more', { count: circle.length })}
        </button>
      )}
      {selected && <PersonCard p={selected} place={here.has(selected.id) ? place : null} factions={factions} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Một dòng người: chân dung, tên, vai hay quan hệ, tuổi, nghề, thế lực (F2), sức khỏe. */
function PersonRow({ p, factions, away = false, onOpen }: { p: NpcView; factions: FactionView[]; away?: boolean; onOpen: () => void }) {
  const relations = relationKeys(p);
  const member = memberLabel(p, factions);
  return (
    <li>
      <button type="button" class="person" onClick={onOpen} aria-label={t('ui.people.view', { name: p.name })}>
        <Portrait src={personPortraitOf(p)} age={p.ageYears} />
        <span class="person-text">
          <strong>{p.name}</strong>
          {relations.length > 0 && (
            <span class="small person-relation">
              {relations.map((k, i) => <span key={k} class={relationTone(k) ? `tone-${relationTone(k)}` : undefined}>{i > 0 ? ' · ' : ''}{t(k)}</span>)}
            </span>
          )}
          <span class="small muted">{t('ui.people.age', { age: p.ageYears })} · {t(p.occupation)}{member ? ` · ${t(member.key, member.params)}` : ''}{away ? ` · ${t('ui.circle.away')}` : ''}</span>
          <span class={`small tone-${healthTone(p.healthBand)}`}>{t(`health.${p.healthBand}`)}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * Xem nhanh một người: chân dung lớn, những gì người ngoài nhìn thấy được, và quan hệ với mình (dải chữ, không có số).
 * `place` null: người ấy không ở quận đang đứng.
 */
function PersonCard({ p, place, factions, onClose }: { p: NpcView; place: string | null; factions: FactionView[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const kin = kinKey(p), b = p.bond;
  const f = p.faction ? factions.find((x) => x.id === p.faction) : undefined;
  return (
    <div class="palette-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="palette person-card" role="dialog" aria-modal="true" aria-label={p.name}>
        <div class="palette-head">
          <span class="section-title">{p.name}</span>
          <button class="close" type="button" onClick={onClose} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
        </div>
        <div class="person-card-body">
          <Portrait src={personPortraitOf(p)} age={p.ageYears} />
          <dl class="attrs">
            {kin && <><dt>{t('ui.circle.role')}</dt><dd>{t(kin)}</dd></>}
            <dt>{t('ui.people.gender')}</dt><dd>{t(`gender.${p.gender}`)}</dd>
            <dt>{t('ui.people.age_k')}</dt><dd>{t('ui.people.age', { age: p.ageYears })}</dd>
            <dt>{t('ui.people.occupation')}</dt><dd>{t(p.occupation)}</dd>
            {f && <><dt>{t('ui.people.faction')}</dt><dd>{t(f.name.key, f.name.params)}</dd></>}
            <dt>{t('ui.people.health')}</dt><dd class={`tone-${healthTone(p.healthBand)}`}>{t(`health.${p.healthBand}`)}</dd>
            <dt>{t('ui.people.place')}</dt><dd>{place ?? t('ui.circle.away')}</dd>
          </dl>
        </div>
        {b ? (
          <dl class="attrs relation-attrs">
            <dt>{t('ui.circle.closeness')}</dt><dd>{t(`bond.closeness.${b.closeness}`)}</dd>
            <dt>{t('ui.circle.trust')}</dt><dd>{t(`bond.trust.${b.trust}`)}</dd>
            <dt>{t('ui.circle.hostility')}</dt><dd class={b.hostility !== 'none' ? 'tone-bad' : undefined}>{t(`bond.hostility.${b.hostility}`)}</dd>
            <dt>{t('ui.circle.owed')}</dt><dd class={b.owed === 'i_owe' ? 'tone-warn' : undefined}>{t(`bond.owed.${b.owed}`)}</dd>
          </dl>
        ) : <p class="small muted">{t('ui.circle.no_bond')}</p>}
      </div>
    </div>
  );
}
