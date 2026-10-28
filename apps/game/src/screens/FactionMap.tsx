// Bản đồ thế lực (v0.6 F1): bản đồ vùng với lớp "ai kiểm soát" — người giữ mỗi quận, đường bị cướp, thương hội giữ.
import { t } from '@tsvl/content';
import type { FactionId, FactionView } from '@tsvl/shared';
import { useMemo } from 'preact/hooks';
import type { WorldInfo } from '../app/state';
import { controlLayer } from '../map/control';
import { MapView } from '../map/MapView';
import { HangingScroll } from '../ui/ink';
import { countyPoints } from './TravelDialog';

interface Props { world: WorldInfo; location: number; factions: FactionView[]; control: (FactionId | null)[]; onClose: () => void }
export function FactionMapDialog({ world, location, factions, control, onClose }: Props) {
  const layer = useMemo(() => controlLayer(factions, control), [factions, control]);
  const points = countyPoints(world);
  const holder = factions.find((f) => f.id === control[location]);
  return <div class="travel-modal" role="dialog" aria-modal="true" aria-label={t('ui.map.title')}>
    <HangingScroll title={t('ui.map.title')} han={t('ui.map.title_han')} onClose={onClose}>
      <div class="birthplace">
        <div class="map-frame"><MapView map={world.map} region={world.region} seed={world.seed} birthplaces={points} selected={null} onSelect={() => {}} location={location} layer={layer} /></div>
        <aside class="side">
          <strong>{t('ui.travel.here', { place: world.map.counties[location]?.name ?? '' })}</strong>
          <p>{holder ? t('ui.map.held_by', { name: t(holder.name.key, holder.name.params) }) : t('ui.map.unheld')}</p>
          <p class="hint">{t('ui.map.hint')}</p>
        </aside>
      </div>
    </HangingScroll>
  </div>;
}
