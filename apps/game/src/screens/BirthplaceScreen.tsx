import { t } from '@tsvl/content';
import type { BirthplaceId, SettlementKind } from '@tsvl/shared';
import type { WorldInfo } from '../app/state';
import { MapView } from '../map/MapView';
import { KIND_CHAR } from '../ui/icons';
import { BrushLabel, InkLandscape, Scroll, Seal } from '../ui/ink';

interface Props {
  world: WorldInfo;
  selected: BirthplaceId | null;
  onSelect: (id: BirthplaceId) => void;
  onConfirm: () => void;
  onBack: () => void;
}

const KINDS: SettlementKind[] = ['city', 'town', 'village'];

export function BirthplaceScreen({ world, selected, onSelect, onConfirm, onBack }: Props) {
  const chosen = world.birthplaces.find((b) => b.id === selected) ?? null;
  return (
    <div class="screen ink-screen full">
      <InkLandscape />
      <Scroll title={t('ui.birthplace.title')} onClose={onBack} className="wide">
        <div class="birthplace">
          <div class="map-frame">
            <MapView map={world.map} region={world.region} seed={world.seed} birthplaces={world.birthplaces} selected={selected} onSelect={onSelect} />
          </div>
          <aside class="side">
            <p class="region-name">{world.region.name} <span class="han">{world.region.nameHan}</span></p>
            <p class="muted small">
              {t('ui.region.realm', { realm: world.region.realmName })} · {t('ui.region.area', { km2: world.region.landKm2.toLocaleString('vi-VN') })}
              <br />
              {t('ui.region.seed', { seed: world.seed })}
            </p>
            <p class="hint">{t('ui.birthplace.hint')}</p>
            <div class="bp-list">
              {KINDS.map((k) => (
                <section key={k}>
                  <BrushLabel className="small-label">{t(`kind.${k}`)}</BrushLabel>
                  {world.birthplaces.filter((b) => b.kind === k).map((b) => (
                    <button key={b.id} class={`bp-item${b.id === selected ? ' is-selected' : ''}`} onClick={() => onSelect(b.id)}>
                      <Seal char={KIND_CHAR[b.kind]} tone={b.kind === 'city' ? 'red' : 'ink'} /> {b.name} <span class="han">{b.nameHan}</span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
            <div class="confirm">
              <p class="muted small">{t('ui.birthplace.fate')}</p>
              <button class="btn primary" disabled={!chosen} onClick={onConfirm}>
                {chosen ? t('ui.birthplace.confirm', { name: chosen.name }) : t('ui.birthplace.none')}
              </button>
            </div>
          </aside>
        </div>
      </Scroll>
    </div>
  );
}
