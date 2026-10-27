import { describe, expect, it } from 'vitest';
import type { RegionLogic } from '@tsvl/worldgen';
import { previewTravel } from '../src/life/travel';

export const travelFixture = (): RegionLogic => ({
  kmPerCellMilli: 6000,
  counties: [0, 1, 2, 3].map((worldIndex) => ({ worldIndex, area: 10, seat: { x: worldIndex, y: 0 } })),
  settlementKind: ['village', 'town', 'city', 'village'],
  adjacency: [[0, 1], [0, 2], [1, 2]], terrainPct: [100, 100, 100], fertilityPct: [100, 100, 100],
  seatKm: [[0, 60, 200, 300], [60, 0, 60, 300], [200, 60, 0, 300], [300, 300, 300, 0]],
});
describe('đường đi (ADR 0009)', () => {
  it('chọn tổng km ngắn nhất, tính ngày từng chặng rồi làm tròn lên ô', () => {
    expect(previewTravel(travelFixture(), 0, 2)).toEqual({ county: 2, route: [0, 1, 2], days: 4, slots: 1, risk: 'risk.low' });
  });
  it('núi và sông làm tăng thời gian/rủi ro; chuyến dài chiếm nhiều ô', () => {
    const r = travelFixture(); r.terrainPct = [300, 100, 300];
    expect(previewTravel(r, 0, 2)).toMatchObject({ days: 12, slots: 2, risk: 'risk.high' });
    expect(previewTravel(r, 2, 0)?.route).toEqual([2, 1, 0]);
  });
  it('từ chối đích ngoài vùng, cùng quận và quận cô lập', () => {
    for (const to of [-1, 0, 3, 4]) expect(previewTravel(travelFixture(), 0, to)).toBeNull();
  });
});
