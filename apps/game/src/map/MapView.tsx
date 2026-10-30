// Bản đồ vùng chơi: AtlasViewer (vector, nét ở mọi mức phóng) + lớp SVG cho nơi sinh (ADR 0006), lớp "ai kiểm soát" (v0.6 F1).
import { t } from '@tsvl/content';
import type { Birthplace, BirthplaceId, RegionMapData, RegionSummary, SiteView } from '@tsvl/shared';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { setLang } from '../cartographer/i18n';
import { ensureFonts } from '../cartographer/render/atlas';
import { buildAtlasVector } from '../cartographer/render/atlas/svg/vector';
import { AtlasViewer } from '../cartographer/render/atlas/svg/viewer';
import { smoothRivers } from '../cartographer/render/rivers';
import { KIND_CHAR, SITE_CHAR } from '../ui/icons';
import { controlPixels, rgbCss, type ControlLayer } from './control';
import { countyLines, maskOutline, outsideMaskUrl, regionWorld } from './regionWorld';

/** Điểm ảnh của bản đồ cho mỗi ô ở mức phóng 1. */
const S = 8;
const STYLE = 'ink' as const;
/** Sông mảnh hơn bản đồ lục địa: vùng chơi được phóng rất lớn. */
const RIVER_WIDTH = 0.4;

interface Props {
  map: RegionMapData;
  region: RegionSummary;
  seed: string;
  birthplaces: Birthplace[];
  selected: BirthplaceId | null;
  onSelect: (id: BirthplaceId) => void;
  location?: number;
  route?: number[];
  /** Lớp "ai kiểm soát" (F1): màu quận theo người giữ, đường bị cướp, thương hội giữ, chú giải. */
  layer?: ControlLayer | null;
  /** Đường bị cướp giữ, vẽ cả khi tắt lớp (F3: bản đồ di chuyển ghi đường nguy hiểm). */
  dangerRoads?: [number, number][];
  /** Di tích, miếu đã biết (v0.8 F3): triện nhỏ cạnh trị sở quận. */
  sites?: SiteView[];
}

interface View {
  x: number;
  y: number;
  k: number;
}

export function MapView({ map, region, seed, birthplaces, selected, onSelect, location, route = [], layer = null, dangerRoads = [], sites = [] }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const viewer = useRef<AtlasViewer | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<BirthplaceId | null>(null);
  // Không khung (furniture: false) nên không có lề giấy
  const M = 0;
  const outline = useMemo(() => maskOutline(map), [map]);
  const lines = useMemo(() => countyLines(map), [map]);
  const shade = useMemo(() => outsideMaskUrl(map, [60, 50, 30, 110]), [map]);
  const fillKey = layer ? JSON.stringify(layer.fill) : '';
  const controlUrl = useMemo(() => (layer ? pixelsUrl(map.W, map.H, controlPixels(map, layer.fill)) : null), [map, fillKey]);
  const seatAt = (i: number) => `${map.counties[i]!.seat.x + 0.5},${map.counties[i]!.seat.y + 0.5}`;

  // Dựng danh sách vẽ vector một lần cho mỗi bản đồ
  useEffect(() => {
    const el = host.current!;
    let cancelled = false;
    let resize: ResizeObserver | null = null;
    setReady(false);
    setLang('en');
    const world = regionWorld(map, region, seed);
    (async () => {
      await ensureFonts(world, STYLE);
      if (cancelled) return;
      const measurer = document.createElement('canvas').getContext('2d')!;
      const list = buildAtlasVector(world, smoothRivers(world), STYLE, { labels: true, contours: false, graticule: false, furniture: false, riverWidth: RIVER_WIDTH }, measurer, S);
      const v = (viewer.current ??= new AtlasViewer(canvasHost.current!));
      v.setList(list);
      const fit = () => {
        const k = Math.min(el.clientWidth / list.width, el.clientHeight / list.height) * 0.98;
        const next = { x: (el.clientWidth - list.width * k) / 2, y: (el.clientHeight - list.height * k) / 2, k };
        v.setView(next.x, next.y, next.k); setView(next);
      };
      fit(); resize = new ResizeObserver(fit); resize.observe(el);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      resize?.disconnect();
    };
  }, [map]);

  const apply = (next: View) => {
    viewer.current?.setView(next.x, next.y, next.k);
    setView(next);
  };

  // Phóng to quanh con trỏ
  useEffect(() => {
    const el = host.current!;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      const px = ev.clientX - r.left, py = ev.clientY - r.top;
      setView((v) => {
        const nk = Math.min(12, Math.max(0.1, v.k * Math.exp(-ev.deltaY * 0.0015)));
        const next = { x: px - ((px - v.x) / v.k) * nk, y: py - ((py - v.y) / v.k) * nk, k: nk };
        viewer.current?.setView(next.x, next.y, next.k);
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onPointerDown = (ev: PointerEvent) => {
    drag.current = { x: ev.clientX - view.x, y: ev.clientY - view.y, moved: false };
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const nx = ev.clientX - d.x, ny = ev.clientY - d.y;
    if (Math.abs(nx - view.x) + Math.abs(ny - view.y) > 3) d.moved = true;
    if (d.moved) apply({ ...view, x: nx, y: ny });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // Toạ độ ô → toạ độ danh sách vẽ (trước biến đổi khung nhìn)
  const g = `translate(${view.x} ${view.y}) scale(${view.k})`;
  const cell = `translate(${M} ${M}) scale(${S})`;
  const hovered = birthplaces.find((b) => b.id === hover);
  // Ấn triện nơi sinh (đơn vị ô): thành lớn hơn trấn, trấn lớn hơn làng
  const markerW = (b: Birthplace) => (b.kind === 'city' ? 2 : b.kind === 'town' ? 1.5 : 1.15);
  const toScreen = (b: Birthplace) => ({ x: view.x + view.k * (M + (b.cell.x + 0.5) * S), y: view.y + view.k * (M + (b.cell.y + 0.5) * S) });

  return (
    <div class="map" ref={host} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div class="map-canvas" ref={canvasHost} />
      <svg class="map-overlay" width="100%" height="100%">
        <g transform={g}>
          <g transform={cell}>
            <image href={shade} x={0} y={0} width={map.W} height={map.H} preserveAspectRatio="none" />
            {controlUrl && <image href={controlUrl} x={0} y={0} width={map.W} height={map.H} preserveAspectRatio="none" class="control-fill" />}
            <path d={lines} class="county-line" />
            {layer?.guildRoads.map(([a, b]) => <polyline key={`g${a}-${b}`} class="road-guild" points={`${seatAt(a)} ${seatAt(b)}`} />)}
            {(layer?.banditRoads ?? dangerRoads).map(([a, b]) => <polyline key={`b${a}-${b}`} class="road-bandit" points={`${seatAt(a)} ${seatAt(b)}`} />)}
            <path d={outline} class="region-line" />
            {route.length > 1 && <polyline class="travel-route" points={route.map((i) => `${map.counties[i]!.seat.x + 0.5},${map.counties[i]!.seat.y + 0.5}`).join(' ')} />}
            {birthplaces.map((b) => (
              <g
                key={b.id}
                class={`bp bp-${b.kind}${b.id === selected ? ' is-selected' : ''}${b.id === hover ? ' is-hover' : ''}`}
                transform={`translate(${b.cell.x + 0.5} ${b.cell.y + 0.5})`}
                onPointerEnter={() => setHover(b.id)}
                onPointerLeave={() => setHover((h) => (h === b.id ? null : h))}
                onPointerUp={() => {
                  if (!drag.current?.moved) onSelect(b.id);
                }}
                onPointerDown={(ev) => ev.stopPropagation()}
              >
                <circle r={markerW(b) * 0.95} class="bp-hit" />
                {b.county === location && <circle r={markerW(b) * 1.4} class="location-ring" />}
                <rect x={-markerW(b) / 2 - 0.25} y={-markerW(b) / 2 - 0.25} width={markerW(b) + 0.5} height={markerW(b) + 0.5} class="bp-ring" />
                <rect x={-markerW(b) / 2} y={-markerW(b) / 2} width={markerW(b)} height={markerW(b)} rx={0.12} class={`bp-mark seal-${b.kind === 'city' ? 'red' : 'ink'}`} />
                <text y={markerW(b) * 0.3} class="bp-char" style={{ fontSize: `${markerW(b) * 0.8}px` }}>{KIND_CHAR[b.kind]}</text>
                <text y={-markerW(b) / 2 - 0.45} class="bp-label">{b.name}</text>
              </g>
            ))}
            {sites.map((x, i) => {
              // Bên phải triện trị sở (vẽ sau nơi sinh để tên quận không đè); quận có cả hai chốn thì miếu đứng cạnh di tích
              const seat = map.counties[x.county]?.seat;
              if (!seat) return null;
              const second = i > 0 && sites[i - 1]!.county === x.county;
              return (
                <g key={`${x.county}-${x.kind}`} class={`site site-${x.kind}`} transform={`translate(${seat.x + 0.5 + (second ? 3.3 : 1.75)} ${seat.y + 0.5})`}>
                  <title>{t(`site.${x.kind}_note`)}</title>
                  <rect x={-0.7} y={-0.7} width={1.4} height={1.4} rx={0.12} class="site-mark" />
                  <text y={0.4} class="site-char">{SITE_CHAR[x.kind]}</text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      {hovered && (
        <div class="map-tip" style={{ left: `${toScreen(hovered).x}px`, top: `${toScreen(hovered).y}px` }}>
          <strong>{hovered.name}</strong> <span class="han">{hovered.nameHan}</span>
          <div>{t(`kind.${hovered.kind}`)}</div>
        </div>
      )}
      {layer && <ControlLegend layer={layer} />}
      {!ready && <div class="map-wait">…</div>}
    </div>
  );
}

/** Chú giải lớp "ai kiểm soát": người giữ đất (màu, tên, số quận) và hai loại đường. */
function ControlLegend({ layer }: { layer: ControlLayer }) {
  return (
    <div class="map-legend" onPointerDown={(ev) => ev.stopPropagation()}>
      <strong>{t('ui.map.legend')}</strong>
      <ul>
        {layer.legend.map((e) => (
          <li key={e.id}><span class="swatch" style={{ background: rgbCss(e.rgb, e.kind === 'government' ? 0.35 : 0.7) }} />{t(e.name.key, e.name.params)}<span class="muted"> · {t('ui.map.counties', { count: e.counties })}</span></li>
        ))}
        {layer.banditRoads.length > 0 && <li><span class="swatch road road-bandit" />{t('ui.map.road_bandits')}</li>}
        {layer.guildRoads.length > 0 && <li><span class="swatch road road-guild" />{t('ui.map.road_guild')}</li>}
      </ul>
    </div>
  );
}

/** Ảnh mỗi ô một điểm ảnh (trình duyệt làm mịn khi phóng). */
function pixelsUrl(w: number, h: number, px: Uint8ClampedArray): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  img.data.set(px);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
