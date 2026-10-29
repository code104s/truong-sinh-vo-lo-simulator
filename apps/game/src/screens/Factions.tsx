import { t } from '@tsvl/content';
import type { FactionId, FactionView, NpcView } from '@tsvl/shared';
import { useEffect, useState } from 'preact/hooks';
import { attitudeTone, FACTION_CHAR, factionsHere, leaderOf, roleKey } from '../app/factions';
import { Seal } from '../ui/ink';

interface Props {
  factions: FactionView[];
  control: (FactionId | null)[];
  location: number;
  place: string;
  /** Tên quận theo chỉ số (trị sở của thế lực). */
  countyName: (county: number) => string;
  people: NpcView[];
  circle: NpcView[];
}

/**
 * Thế lực ở {nơi} (v0.6 F2, ADR 0019): quan phủ (giữ hay đã mất đất này), gia tộc đứng đầu hay đặt nhà thờ họ ở đây,
 * thương hội có hội quán, băng cướp có sào huyệt hay giữ đường qua đây. Bấm một dòng thì xem nhanh.
 */
export function FactionPanel({ factions, control, location, place, countyName, people, circle }: Props) {
  const [open, setOpen] = useState<FactionId | null>(null);
  const rows = factionsHere(factions, control, location);
  const selected = rows.find((r) => r.f.id === open)?.f ?? null;
  return (
    <div class="dossier-block faction-panel">
      <span class="dossier-k">{t('ui.factions.title', { place })}</span>
      {rows.length === 0 ? <p class="muted small">{t('ui.factions.none')}</p> : (
        <ul class="faction-list">
          {rows.map(({ f, roles }) => (
            <li key={f.id}>
              <button type="button" class={`faction faction-${f.kind}`} onClick={() => setOpen(f.id)} aria-label={t('ui.factions.view', { name: t(f.name.key, f.name.params) })}>
                <Seal char={FACTION_CHAR[f.kind]} tone={f.kind === 'bandits' || roles.includes('lost') ? 'red' : 'ink'} />
                <span class="person-text">
                  <strong>{t(f.name.key, f.name.params)}</strong>
                  {roles.length > 0 && <span class={`small${roles.includes('lost') || f.kind === 'bandits' ? ' tone-bad' : ''}`}>{roles.map((r) => t(roleKey(f, r))).join(' · ')}</span>}
                  <span class="small muted">
                    {t(`faction.kind.${f.kind}`)} · {t(`faction.strength.${f.strength}`)}
                    {/* Thái độ với mình (v0.7 F3) */}
                    {f.attitude && <>{' · '}<span class={`attitude tone-${attitudeTone(f.attitude)}`} title={t(`ui.factions.attitude_hint.${f.attitude}`)}>{t('ui.factions.attitude_tag', { band: `faction.attitude.${f.attitude}` })}</span></>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && <FactionCard f={selected} countyName={countyName} leader={leaderOf(selected, people, circle)} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Xem nhanh một thế lực: loại, người cầm đầu, thế, người, đất, đường, thái độ với mình (dải chữ, không có số kho). */
function FactionCard({ f, countyName, leader, onClose }: { f: FactionView; countyName: (county: number) => string; leader: NpcView | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const name = t(f.name.key, f.name.params);
  const roads = f.roads?.length ?? 0;
  return (
    <div class="palette-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="palette person-card faction-card" role="dialog" aria-modal="true" aria-label={name}>
        <div class="palette-head">
          <span class="section-title"><Seal char={FACTION_CHAR[f.kind]} tone={f.kind === 'bandits' ? 'red' : 'ink'} /> {name}</span>
          <button class="close" type="button" onClick={onClose} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
        </div>
        <dl class="attrs">
          <dt>{t('ui.factions.kind')}</dt><dd>{t(`faction.kind.${f.kind}`)}</dd>
          <dt>{t('ui.factions.leader')}</dt><dd>{leader ? leader.name : f.leader ? t('ui.factions.leader_away') : t('ui.factions.leader_none')}</dd>
          <dt>{t('ui.factions.strength')}</dt><dd>{t(`faction.strength.${f.strength}`)}</dd>
          <dt>{t('ui.factions.members')}</dt><dd>{t('ui.factions.members_n', { count: f.members })}</dd>
          <dt>{t('ui.factions.seat')}</dt><dd>{countyName(f.seat)}</dd>
          {/* Thương hội không cai quản đất (quận của nó là quận hội quán): chỉ ghi trị sở, đường */}
          {f.kind !== 'guild' && <><dt>{t('ui.factions.land')}</dt><dd>{f.kind === 'clan' ? (f.counties.length ? t('ui.factions.land_lead', { place: f.counties.map(countyName).join(', ') }) : t('ui.factions.land_none')) : f.counties.length ? t('ui.factions.land_counties', { count: f.counties.length }) : t('ui.factions.land_none')}</dd></>}
          {roads > 0 && <><dt>{t('ui.factions.roads')}</dt><dd>{t('ui.factions.roads_n', { count: roads })}</dd></>}
          <dt>{t('ui.factions.attitude')}</dt><dd class={f.attitude ? `tone-${attitudeTone(f.attitude)}` : ''}>{f.attitude ? t(`faction.attitude.${f.attitude}`) : t('ui.factions.attitude_unknown')}</dd>
        </dl>
        <p class="small muted">{t(`ui.factions.about.${f.kind}`)}</p>
        {f.attitude && <p class="small">{t(`ui.factions.attitude_hint.${f.attitude}`)}</p>}
      </div>
    </div>
  );
}
