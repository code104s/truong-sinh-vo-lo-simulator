import { t } from '@tsvl/content';
import type { CultivationView, FactionView } from '@tsvl/shared';
import { daoBlock } from '../app/cultivation';
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
