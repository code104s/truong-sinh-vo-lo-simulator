// Bản đồ vùng chơi: AtlasViewer (vector, nét ở mọi mức phóng) + lớp SVG cho nơi sinh (ADR 0006).
import { t } from '@tsvl/content';
import type { Birthplace, BirthplaceId, RegionMapData, RegionSummary } from '@tsvl/shared';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { setLang } from '../cartographer/i18n';
import { ensureFonts } from '../cartographer/render/atlas';
import { buildAtlasVector } from '../cartographer/render/atlas/svg/vector';
import { AtlasViewer } from '../cartographer/render/atlas/svg/viewer';
import { smoothRivers } from '../cartographer/render/rivers';
import { KIND_CHAR } from '../ui/icons';
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
}

interface View {
  x: number;
  y: number;
  k: number;
}

export function MapView({ map, region, seed, birthplaces, selected, onSelect }: Props) {
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

  // Dựng danh sách vẽ vector một lần cho mỗi bản đồ
  useEffect(() => {
    const el = host.current!;
    let cancelled = false;
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
      const k = Math.min(el.clientWidth / list.width, el.clientHeight / list.height) * 0.98;
      const next = { x: (el.clientWidth - list.width * k) / 2, y: (el.clientHeight - list.height * k) / 2, k };
      v.setView(next.x, next.y, next.k);
      setView(next);
      setReady(true);
    })();
    return () => {
      cancelled = true;
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
            <path d={lines} class="county-line" />
            <path d={outline} class="region-line" />
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
                <rect x={-markerW(b) / 2 - 0.25} y={-markerW(b) / 2 - 0.25} width={markerW(b) + 0.5} height={markerW(b) + 0.5} class="bp-ring" />
                <rect x={-markerW(b) / 2} y={-markerW(b) / 2} width={markerW(b)} height={markerW(b)} rx={0.12} class={`bp-mark seal-${b.kind === 'city' ? 'red' : 'ink'}`} />
                <text y={markerW(b) * 0.3} class="bp-char" style={{ fontSize: `${markerW(b) * 0.8}px` }}>{KIND_CHAR[b.kind]}</text>
                <text y={-markerW(b) / 2 - 0.45} class="bp-label">{b.name}</text>
              </g>
            ))}
          </g>
        </g>
      </svg>
      {hovered && (
        <div class="map-tip" style={{ left: `${toScreen(hovered).x}px`, top: `${toScreen(hovered).y}px` }}>
          <strong>{hovered.name}</strong> <span class="han">{hovered.nameHan}</span>
          <div>{t(`kind.${hovered.kind}`)}</div>
        </div>
      )}
      {!ready && <div class="map-wait">…</div>}
    </div>
  );
}
