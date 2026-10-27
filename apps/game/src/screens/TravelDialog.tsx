import { t } from '@tsvl/content';
import { birthplaceId, type MonthPlan, type TravelOption, type TravelPreview } from '@tsvl/shared';
import { useState } from 'preact/hooks';
import type { WorldInfo } from '../app/state';
import { MapView } from '../map/MapView';
import { Scroll } from '../ui/ink';

interface Props { world: WorldInfo; location: number; slotIndex: number; plan: MonthPlan | null; options: TravelOption[]; preview: TravelPreview | null; onPreview: (county: number) => void; onPlan: (plan: MonthPlan) => void; onClose: () => void }
export function TravelDialog({ world, location, slotIndex, plan, options, preview, onPreview, onPlan, onClose }: Props) {
  const [target, setTarget] = useState<number | null>(null);
  const points = world.map.counties.map((c, county) => ({ id: birthplaceId(`${world.region.id}/c${county}`), name: c.name, nameHan: c.nameHan, cell: c.seat, county, kind: world.birthplaces.find((p) => p.county === county && p.kind !== 'village')?.kind ?? 'village' as const }));
  const choose = (county: number) => { if (county !== location && options.some((p) => p.county === county)) { setTarget(county); onPreview(county); } };
  const current = preview?.county === target ? preview : null;
  return <div class="travel-modal" role="dialog" aria-modal="true" aria-label={t('ui.travel.title')}>
    <Scroll title={t('ui.travel.title')} onClose={onClose} className="travel-scroll">
      <div class="birthplace">
        <div class="map-frame"><MapView map={world.map} region={world.region} seed={world.seed} birthplaces={points} selected={points.find((p) => p.county === target)?.id ?? null} onSelect={(id) => choose(points.find((p) => p.id === id)!.county)} location={location} route={current?.route ?? []} /></div>
        <aside class="side">
          <strong>{t('ui.travel.here', { place: world.map.counties[location]?.name ?? '' })}</strong>
          <p class="hint">{t('ui.travel.hint')}</p>
          <div class="bp-list">{options.map((o) => <button key={o.county} class={`bp-item${o.county === target ? ' is-selected' : ''}`} onClick={() => choose(o.county)}>{world.map.counties[o.county]?.name}<span class="small muted">{t('ui.plan.slots', { count: o.slots })}</span></button>)}</div>
          {current && <div class="confirm">
            <p>{current.route.map((i) => world.map.counties[i]?.name).join(' → ')}</p>
            <p>{t('ui.travel.cost', { days: current.days, slots: current.slots, risk: current.risk })}</p>
            <button class="btn primary" onClick={() => {
              const next: MonthPlan = plan ? { slots: plan.slots.map((s) => ({ ...s })) as MonthPlan['slots'] } : { slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] };
              next.slots[slotIndex] = { action: 'action.travel', target: current.county }; onPlan(next); onClose();
            }}>{t('ui.travel.confirm')}</button>
          </div>}
        </aside>
      </div>
    </Scroll>
  </div>;
}
