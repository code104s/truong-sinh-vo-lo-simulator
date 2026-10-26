import { t } from '@tsvl/content';
import { Enso, InkLandscape, Scroll } from '../ui/ink';

export function Loading({ stage, pct, seed }: { stage: string | null; pct: number; seed: string | null }) {
  return (
    <div class="screen ink-screen centered">
      <InkLandscape />
      <Scroll title={t('ui.loading.title')} className="dialog">
        <div class="stack center-text">
          <Enso char="天" label={t('ui.loading.title')} />
          <p>{stage ? t(stage) : '…'}</p>
          <div class="ink-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div class="ink-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          {seed && <p class="muted small">{t('ui.loading.seed', { seed })}</p>}
        </div>
      </Scroll>
    </div>
  );
}
