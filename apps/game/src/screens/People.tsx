import { t } from '@tsvl/content';
import type { NpcView } from '@tsvl/shared';
import { useEffect, useState } from 'preact/hooks';
import { healthTone, peopleRows } from '../app/people';
import { Portrait } from '../ui/ink';
import { personPortraitOf } from '../ui/portraits';

/**
 * Người trong quận (v0.4 F1, ADR 0016): người có tên ở quận đang đứng, chân dung cố định theo người, tên, tuổi, nghề,
 * sức khỏe. Bấm một người thì xem nhanh. Chưa qua lại được (v0.5).
 */
export function PeoplePanel({ people, place }: { people: NpcView[]; place: string }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { shown, hidden } = peopleRows(people, expanded);
  const selected = people.find((p) => p.id === open) ?? null;
  return (
    <div class="dossier-block people-panel">
      <span class="dossier-k">{t('ui.people.title', { place, count: people.length })}</span>
      {people.length === 0 ? <p class="muted small">{t('ui.people.none')}</p> : (
        <ul class="people-list">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" class="person" onClick={() => setOpen(p.id)} aria-label={t('ui.people.view', { name: p.name })}>
                <Portrait src={personPortraitOf(p)} age={p.ageYears} />
                <span class="person-text">
                  <strong>{p.name}</strong>
                  <span class="small muted">{t('ui.people.age', { age: p.ageYears })} · {t(p.occupation)}</span>
                  <span class={`small tone-${healthTone(p.healthBand)}`}>{t(`health.${p.healthBand}`)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(hidden > 0 || expanded) && (
        <button type="button" class="btn ghost small-btn people-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? t('ui.people.less') : t('ui.people.more', { count: people.length })}
        </button>
      )}
      {selected && <PersonCard p={selected} place={place} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Xem nhanh một người: chân dung lớn, những gì người ngoài nhìn thấy được. Không có thuộc tính ẩn. */
function PersonCard({ p, place, onClose }: { p: NpcView; place: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
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
            <dt>{t('ui.people.gender')}</dt><dd>{t(`gender.${p.gender}`)}</dd>
            <dt>{t('ui.people.age_k')}</dt><dd>{t('ui.people.age', { age: p.ageYears })}</dd>
            <dt>{t('ui.people.occupation')}</dt><dd>{t(p.occupation)}</dd>
            <dt>{t('ui.people.health')}</dt><dd class={`tone-${healthTone(p.healthBand)}`}>{t(`health.${p.healthBand}`)}</dd>
            <dt>{t('ui.people.place')}</dt><dd>{place}</dd>
          </dl>
        </div>
        <p class="small muted">{t('ui.people.no_interaction')}</p>
      </div>
    </div>
  );
}
