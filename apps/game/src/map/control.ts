// Lớp "ai kiểm soát" trên bản đồ (v0.6 F1): màu theo thế lực giữ quận, đường bị cướp, thương hội giữ, chú giải.
// Chỉ đọc STATE.factions, STATE.control; không có luật game. Phần thuần ở đây; phần vẽ ở MapView.
import type { FactionId, FactionKind, FactionName, FactionView, RegionMapData } from '@tsvl/shared';

export type Rgb = readonly [number, number, number];

/** Quan phủ: son nhạt như dấu triện nha môn; băng cướp: đỏ thẫm; gia tộc: bảng màu mực theo thứ tự id. */
export const GOVERNMENT_RGB: Rgb = [150, 120, 70];
export const BANDITS_RGB: Rgb = [160, 40, 30];
export const CLAN_RGB: readonly Rgb[] = [[60, 110, 85], [55, 85, 135], [115, 70, 115], [140, 100, 40], [70, 120, 130], [105, 80, 60]];
/** Độ đậm phủ quận (0–255): quận quan phủ giữ nhạt để quận cát cứ nổi lên. */
// Tông môn (v0.8) ở ngoài vùng, không giữ quận nào
export const FILL_ALPHA: Record<FactionKind, number> = { government: 40, clan: 110, guild: 110, bandits: 120, sect: 0 };

export interface LegendEntry {
  id: FactionId;
  kind: FactionKind;
  name: FactionName;
  rgb: Rgb;
  /** Số quận đang giữ. */
  counties: number;
}

export interface ControlLayer {
  /** Màu từng quận (theo chỉ số quận); null là chưa ai giữ. */
  fill: ({ rgb: Rgb; alpha: number } | null)[];
  legend: LegendEntry[];
  /** Đường băng cướp giữ, đường thương hội giữ (không có cướp), mỗi đường một cặp quận. */
  banditRoads: [number, number][];
  guildRoads: [number, number][];
}

const KIND_ORDER: Record<FactionKind, number> = { government: 0, clan: 1, bandits: 2, guild: 3, sect: 4 };
const idNum = (id: string) => Number(id.slice(1));
const key = ([a, b]: readonly [number, number]) => `${a}-${b}`;

/** Dựng lớp từ thế lực còn sống và người giữ mỗi quận. Thứ tự chú giải: quan phủ, gia tộc, băng cướp; trong loại theo id. */
export function controlLayer(factions: readonly FactionView[], control: readonly (FactionId | null)[]): ControlLayer {
  const byId = new Map(factions.map((f) => [f.id, f]));
  const holders = [...new Set(control.filter((id): id is FactionId => id !== null && byId.has(id)))].map((id) => byId.get(id)!)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || idNum(a.id) - idNum(b.id));
  const colorOf = new Map<FactionId, Rgb>();
  let clan = 0;
  for (const f of holders) colorOf.set(f.id, f.kind === 'government' ? GOVERNMENT_RGB : f.kind === 'bandits' ? BANDITS_RGB : CLAN_RGB[clan++ % CLAN_RGB.length]!);
  const fill = control.map((id) => {
    const f = id === null ? undefined : byId.get(id);
    return f ? { rgb: colorOf.get(f.id)!, alpha: FILL_ALPHA[f.kind] } : null;
  });
  const legend = holders.map((f) => ({ id: f.id, kind: f.kind, name: f.name, rgb: colorOf.get(f.id)!, counties: control.filter((c) => c === f.id).length }));
  const roadsOf = (kind: FactionKind) => factions.filter((f) => f.kind === kind).flatMap((f) => f.roads ?? []);
  const bandit = new Set(roadsOf('bandits').map(key));
  const uniq = (xs: [number, number][]) => [...new Map(xs.map((r) => [key(r), r])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { fill, legend, banditRoads: uniq(roadsOf('bandits')), guildRoads: uniq(roadsOf('guild').filter((r) => !bandit.has(key(r)))) };
}

/** Điểm ảnh RGBA mỗi ô (W × H × 4) tô theo quận; ngoài vùng chơi trong suốt. */
export function controlPixels(map: Pick<RegionMapData, 'W' | 'H' | 'county'>, fill: ControlLayer['fill']): Uint8ClampedArray {
  const px = new Uint8ClampedArray(map.W * map.H * 4);
  for (let i = 0; i < map.W * map.H; i++) {
    const c = map.county[i]!;
    const f = c >= 0 ? fill[c] : null;
    if (!f) continue;
    px.set([f.rgb[0], f.rgb[1], f.rgb[2], f.alpha], i * 4);
  }
  return px;
}

export const rgbCss = (rgb: Rgb, alpha = 1) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
