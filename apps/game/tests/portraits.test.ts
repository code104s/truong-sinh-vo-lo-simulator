// Chân dung cố định theo người (v0.4 F3): thẻ sự kiện và khối "Người ở…" ra cùng gương mặt cho cùng một NPC.
import { birthplaceId, regionId, type EventFigure } from '@tsvl/shared';
import { Life } from '@tsvl/sim';
import { describe, expect, it } from 'vitest';
import { figurePortraitOf, personPortraitOf } from '../src/ui/portraits';

describe('chân dung người thật (F3)', () => {
  const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
  const people = Life.create({ worldSeed: 'portraits', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: 2 }, bp).people();

  it('NPC trong thẻ sự kiện cùng gương mặt với khối người trong quận, bất kể số thứ tự sự kiện', () => {
    const adults = people.filter((p) => p.portrait.ageBand !== 'child');
    expect(adults.length).toBeGreaterThan(3);
    for (const p of adults) {
      const figure: EventFigure = { gender: p.gender, ageBand: p.portrait.ageBand, class: p.portrait.class, npcId: p.id };
      const face = figurePortraitOf(figure, 'event.beggar#1');
      expect(face).not.toBeNull();
      expect(face).toBe(personPortraitOf(p));
      expect(figurePortraitOf(figure, 'event.market_brawl#7')).toBe(face);
    }
  });

  it('trẻ con vẽ bóng mực (không có ảnh), cả người thật lẫn vô danh', () => {
    expect(figurePortraitOf({ gender: 'female', ageBand: 'child', class: 'poor' }, 'event.beggar#3')).toBeNull();
    const kid = people.find((p) => p.portrait.ageBand === 'child');
    if (kid) expect(personPortraitOf(kid)).toBeNull();
  });
});
