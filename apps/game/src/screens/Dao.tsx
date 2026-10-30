import { t } from '@tsvl/content';
import type { CultivationView, FactionView, LogEntry } from '@tsvl/shared';
import { useEffect, useState } from 'preact/hooks';
import { daoBlock, type BreakthroughOutcome } from '../app/cultivation';
import { logText } from '../app/format';
import { FACTION_CHAR } from '../app/factions';
import { Seal } from '../ui/ink';

/** Khối "Đạo" ở hồ sơ (v0.8 F1): linh căn đã kiểm hay chưa, đường tu, cảnh giới, linh khí, nghĩa vụ tông môn. */
export function DaoPanel({ cultivation, factions }: { cultivation: CultivationView; factions: FactionView[] }) {
  const b = daoBlock(cultivation, factions);
  return (
    <div class="dossier-block dao-block">
      <span class="dossier-k">{t('ui.dao.title')}</span>
      <dl class="attrs dao-attrs">
        <dt>{t('ui.dao.root')}</dt><dd class={cultivation.root ? '' : 'muted'}>{t(b.root)}</dd>
        {b.path && <>
          <dt>{t('ui.dao.path')}</dt>
          <dd>
            {t(`cultivation.path.${b.path}`)}
            {b.sect && <> · <Seal char={FACTION_CHAR.sect} tone="ink" /> {t(b.sect.key, b.sect.params)}</>}
          </dd>
          <dt>{t('ui.dao.realm')}</dt><dd>{t(`realm.${b.realm}`)}</dd>
          {b.qi && <><dt>{t('ui.dao.qi')}</dt><dd>{t(b.qi)}</dd></>}
        </>}
      </dl>
      {b.ceiling && <p class="small muted">{t('ui.dao.ceiling')}</p>}
      {b.expelled && <p class="small tone-warn">{t('ui.dao.expelled')}</p>}
      {b.duty.length > 0 && (
        <div class="dao-duty">
          <span class="dossier-k">{t('ui.dao.duty')}</span>
          {b.duty.map((d) => <p key={d.key} class={`small tone-${d.tone}`}>{t(d.key, d.params)}</p>)}
        </div>
      )}
    </div>
  );
}

/** Nhịp chờ trước khi hiện kết quả đột phá (mili giây). */
export const BREAKTHROUGH_BEAT_MS = 2400;
const OUTCOME_SEAL: Record<BreakthroughOutcome, { char: string; tone: 'jade' | 'red' }> = { ok: { char: '成', tone: 'jade' }, failed: { char: '逆', tone: 'red' }, severe: { char: '傷', tone: 'red' } };

/**
 * Cảnh đột phá có dựng (đề xuất "cuốn hơn" mục 7.3, 9.5): màn tối, khí dồn về đan điền, chờ một nhịp rồi mới hiện
 * kết quả. Chỉ là cách hiện; kết quả đã có trong biên niên từ sim.
 */
export function BreakthroughScene({ entry, outcome, onClose }: { entry: LogEntry; outcome: BreakthroughOutcome; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), BREAKTHROUGH_BEAT_MS);
    return () => clearTimeout(id);
  }, [entry]);
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, onClose]);
  const seal = OUTCOME_SEAL[outcome];
  return (
    <div class={`bt-scene${shown ? ` shown outcome-${outcome}` : ''}`} role="dialog" aria-modal="true" aria-label={t('ui.bt.title')}>
      <div class="bt-scene-core" aria-hidden="true"><span class="bt-scene-ring" /></div>
      {!shown
        ? <p class="bt-scene-text" role="status">{t('ui.bt.scene_gather')}</p>
        : <div class="bt-scene-result" role="status">
            <span class="bt-scene-seal"><Seal char={seal.char} tone={seal.tone} /></span>
            <h2>{t(`ui.bt.scene_${outcome}`)}</h2>
            <p>{logText(entry)}</p>
            <button type="button" class="btn" onClick={onClose}>{t('ui.bt.scene_close')}</button>
          </div>}
    </div>
  );
}
