import { t } from '@tsvl/content';
import { birthplaceId, type Birthplace, type FactionId, type FactionView, type MonthPlan, type SiteView, type TravelOption, type TravelPreview } from '@tsvl/shared';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { WorldInfo } from '../app/state';
import { controlLayer } from '../map/control';
import { MapView } from '../map/MapView';
import { SITE_CHAR } from '../ui/icons';
import { HangingScroll } from '../ui/ink';

/** Trị sở mỗi quận như một điểm trên bản đồ (loại theo nơi sinh trấn, thành của quận ấy). */
export function countyPoints(world: WorldInfo): Birthplace[] {
  return world.map.counties.map((c, county) => ({ id: birthplaceId(`${world.region.id}/c${county}`), name: c.name, nameHan: c.nameHan, cell: c.seat, county, kind: world.birthplaces.find((p) => p.county === county && p.kind !== 'village')?.kind ?? 'village' as const }));
}

interface Props { world: WorldInfo; location: number; slotIndex: number; plan: MonthPlan | null; options: TravelOption[]; preview: TravelPreview | null; onPreview: (county: number) => void; onPlan: (plan: MonthPlan) => void; onClose: () => void; factions: FactionView[]; control: (FactionId | null)[];
  /** Di tích, miếu đã biết (v0.8 F3): triện trên bản đồ, ghi cạnh tên quận trong danh sách. */
  sites?: SiteView[];
  /** Chọn sẵn một quận khi mở (F3: nút "Xem đường đi" của dải kỳ tuyển). */
  focus?: number | null }
export function TravelDialog({ world, location, slotIndex, plan, options, preview, onPreview, onPlan, onClose, factions, control, sites = [], focus = null }: Props) {
  const [target, setTarget] = useState<number | null>(null);
  // Lớp "ai kiểm soát" (F1): bật khi muốn xem đường nào có cướp trước khi lên đường
  const [showControl, setShowControl] = useState(false);
  const layer = useMemo(() => (showControl ? controlLayer(factions, control) : null), [showControl, factions, control]);
  // Đường băng cướp giữ luôn vẽ (F3); băng chặn đường đi tới điểm đang chọn (TravelOption.danger)
  const dangerRoads = useMemo(() => controlLayer(factions, control).banditRoads, [factions, control]);
  const dangerOf = (county: number) => { const id = options.find((o) => o.county === county)?.danger; return id ? factions.find((f) => f.id === id) ?? null : null; };
  const points = countyPoints(world);
  const choose = (county: number) => { if (county !== location && options.some((p) => p.county === county)) { setTarget(county); onPreview(county); } };
  const current = preview?.county === target ? preview : null;
  useEffect(() => { if (focus !== null) choose(focus); }, [focus]);
  const siteTags = (county: number) => sites.filter((x) => x.county === county);
  return <div class="travel-modal" role="dialog" aria-modal="true" aria-label={t('ui.travel.title')}>
    <HangingScroll title={t('ui.travel.title')} han={t('ui.travel.title_han')} onClose={onClose}>
      <div class="birthplace">
        <div class="map-frame"><MapView map={world.map} region={world.region} seed={world.seed} birthplaces={points} selected={points.find((p) => p.county === target)?.id ?? null} onSelect={(id) => choose(points.find((p) => p.id === id)!.county)} location={location} route={current?.route ?? []} layer={layer} dangerRoads={dangerRoads} sites={sites} /></div>
        <aside class="side">
          <strong>{t('ui.travel.here', { place: world.map.counties[location]?.name ?? '' })}</strong>
          <p class="hint">{t('ui.travel.hint')}</p>
          <label class="map-toggle"><input type="checkbox" checked={showControl} onChange={(ev) => setShowControl((ev.currentTarget as HTMLInputElement).checked)} />{t('ui.map.layer')}</label>
          <div class="bp-list">{options.map((o) => <button key={o.county} class={`bp-item${o.county === target ? ' is-selected' : ''}`} onClick={() => choose(o.county)}>{world.map.counties[o.county]?.name}{o.danger && <span class="danger-tag">{t('ui.travel.danger_tag')}</span>}{siteTags(o.county).map((x) => <span key={x.kind} class="site-tag" title={t(`site.${x.kind}_note`)}>{SITE_CHAR[x.kind]} {t(`site.${x.kind}`)}</span>)}<span class="small muted">{t('ui.plan.slots', { count: o.slots })}</span></button>)}</div>
          {current && <div class="confirm">
            <p>{current.route.map((i) => world.map.counties[i]?.name).join(' → ')}</p>
            <p>{t('ui.travel.cost', { days: current.days, slots: current.slots, risk: current.risk })}</p>
            {target !== null && dangerOf(target) && <p class="tone-bad danger-note">{t('ui.travel.danger', { name: t(dangerOf(target)!.name.key, dangerOf(target)!.name.params) })}</p>}
            <button class="btn primary" onClick={() => {
              const next: MonthPlan = plan ? { slots: plan.slots.map((s) => ({ ...s })) as MonthPlan['slots'] } : { slots: [{ action: 'action.rest' }, { action: 'action.rest' }, { action: 'action.rest' }] };
              next.slots[slotIndex] = { action: 'action.travel', target: current.county }; onPlan(next); onClose();
            }}>{t('ui.travel.confirm')}</button>
          </div>}
        </aside>
      </div>
    </HangingScroll>
  </div>;
}
