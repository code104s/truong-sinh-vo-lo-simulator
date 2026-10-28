// Lớp "ai kiểm soát" trên bản đồ (v0.6 F1): màu theo người giữ quận, chú giải, đường bị cướp, thương hội giữ.
import { hasKey, t } from '@tsvl/content';
import { birthplaceId, regionId, vFactionView, type FactionView } from '@tsvl/shared';
import { Life } from '@tsvl/sim';
import { describe, expect, it } from 'vitest';
import type { RegionLogic } from '@tsvl/worldgen';
import { BANDITS_RGB, CLAN_RGB, controlLayer, controlPixels, FILL_ALPHA, GOVERNMENT_RGB } from '../src/map/control';

const faction = (id: string, kind: FactionView['kind'], o: Partial<FactionView> = {}): FactionView => ({
  id, kind, name: { key: `faction.${kind}.name`, params: { place: 'Vị Kinh', surname: 'Lương' } }, seat: 0, counties: [], strength: 'modest', members: 3, ...o,
});

describe('lớp "ai kiểm soát" (v0.6 F1)', () => {
  it('mỗi quận tô theo người giữ: quan phủ nhạt, cát cứ đậm; chú giải theo loại rồi id, đếm số quận', () => {
    const fs = [faction('f1', 'government'), faction('f7', 'bandits', { roads: [[1, 2]] }), faction('f3', 'clan'), faction('f9', 'clan'), faction('f4', 'guild', { roads: [[0, 1], [1, 2]] })];
    const layer = controlLayer(fs, ['f1', 'f9', 'f7', 'f1', 'f3', null]);
    expect(layer.legend.map((e) => [e.id, e.counties])).toEqual([['f1', 2], ['f3', 1], ['f9', 1], ['f7', 1]]);
    expect(layer.legend.map((e) => e.rgb)).toEqual([GOVERNMENT_RGB, CLAN_RGB[0], CLAN_RGB[1], BANDITS_RGB]);
    expect(layer.fill.map((f) => f?.alpha ?? null)).toEqual([FILL_ALPHA.government, FILL_ALPHA.clan, FILL_ALPHA.bandits, FILL_ALPHA.government, FILL_ALPHA.clan, null]);
    expect(FILL_ALPHA.government).toBeLessThan(FILL_ALPHA.clan);
    // Đường cướp giữ đè đường thương hội; thương hội còn đường 0–1
    expect([layer.banditRoads, layer.guildRoads]).toEqual([[[1, 2]], [[0, 1]]]);
  });

  it('điểm ảnh theo ô: ô của quận mang màu người giữ, ngoài vùng chơi và quận chưa ai giữ trong suốt', () => {
    const layer = controlLayer([faction('f1', 'government'), faction('f2', 'bandits')], ['f1', 'f2', null]);
    const px = controlPixels({ W: 4, H: 1, county: Int16Array.from([0, 1, 2, -1]) }, layer.fill);
    expect([...px]).toEqual([...GOVERNMENT_RGB, FILL_ALPHA.government, ...BANDITS_RGB, FILL_ALPHA.bandits, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('chữ chú giải, hộp thoại có trong nội dung; tên thế lực dịch được', () => {
    for (const k of ['ui.map.open', 'ui.map.title', 'ui.map.title_han', 'ui.map.layer', 'ui.map.legend', 'ui.map.counties', 'ui.map.road_bandits', 'ui.map.road_guild', 'ui.map.held_by', 'ui.map.unheld', 'ui.map.hint']) expect(hasKey(k), k).toBe(true);
    expect(t('faction.clan.name', { surname: 'Lương', place: 'Vị Kinh' })).toBe('Họ Lương ở Vị Kinh');
  });

  it('STATE thật: thế lực có đường giữ gửi cặp quận [nhỏ, lớn]; lớp dựng được từ factions, control', () => {
    const region: RegionLogic = {
      kmPerCellMilli: 6000,
      counties: [0, 1, 2].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
      settlementKind: ['village', 'city', 'town'], adjacency: [[0, 1], [1, 2]], terrainPct: [100, 100], fertilityPct: [100, 100, 100],
      seatKm: [[0, 60, 120], [60, 0, 60], [120, 60, 0]],
    };
    const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
    const l = Life.create({ worldSeed: 'map-layer', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region);
    for (let i = 0; i < 40; i++) l.advance('week');
    const views = l.factions();
    for (const v of views) expect(vFactionView.check(v, '$')).toBeNull();
    const layer = controlLayer(views, l.control());
    expect(layer.legend[0]).toMatchObject({ kind: 'government', counties: 3 });
  });
});
