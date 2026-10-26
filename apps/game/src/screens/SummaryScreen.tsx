import { t } from '@tsvl/content';
import type { CharacterView, LifeSummary } from '@tsvl/shared';
import { shortDate } from '../app/format';
import type { WorldInfo } from '../app/state';
import { BrushLabel, InkLandscape, Portrait, Scroll, Seal } from '../ui/ink';
import { PORTRAIT_MIN_AGE, portraitOf } from '../ui/portraits';
import { LogLine } from './LifeScreen';

export function SummaryScreen({ summary: s, character, world, onBack }: { summary: LifeSummary; character: CharacterView | null; world: WorldInfo | null; onBack: () => void }) {
  const place = world?.birthplaces.find((b) => b.id === s.birthplaceId);
  return (
    <div class="screen ink-screen full summary">
      <InkLandscape />
      <Scroll title={t('ui.summary.title')} onClose={onBack} className="wide">
        <div class="two-col">
          <aside class="epitaph">
            <Portrait src={character && s.ageYears >= PORTRAIT_MIN_AGE ? portraitOf(character) : null} alt={s.name} />
            <h1 class="epitaph-name">{s.name}</h1>
            <p class="lived">{t('ui.summary.lived', { age: s.ageYears })} <Seal char="終" /></p>
            <p>{t('ui.summary.span', { from: shortDate(s.birthTick), to: shortDate(s.deathTick) })}</p>
            <p>{t('ui.summary.cause', { cause: `death.${s.cause}`, detail: s.causeDetail })}</p>
            {place && <p>{t('ui.summary.place', { place: `${place.name} (${t(`kind.${place.kind}`)})` })}</p>}
            <p class="muted tiny">{t('ui.summary.digest', { digest: s.digest })}</p>
            <button class="btn primary" onClick={onBack}>{t('ui.back')}</button>
          </aside>
          <main class="chronicle">
            <header class="date-bar">
              <BrushLabel>{t('ui.summary.milestones')}</BrushLabel>
            </header>
            <div class="log">
              {s.milestones.map((e, i) => <LogLine key={i} e={e} forceMajor />)}
            </div>
          </main>
        </div>
      </Scroll>
    </div>
  );
}
