import { describe, expect, it } from 'vitest';
import { Life } from '../src/index';
import { birthplaceId, regionId } from '@tsvl/shared';
import { decaySkills, gainSkill, skillRiskPct, skillViews } from '../src/life/skills';

const character = () => Life.create({ worldSeed: 'skills', regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }).snapshot().character;
describe('kỹ năng', () => {
  it('ngộ tính và chữ tăng tốc học, mệt làm học chậm; giảm rủi ro cùng loại', () => {
    const a = character(), b = character(); a.aptitude = 1; b.aptitude = 10;
    gainSkill(a, 'hunting', a.birthTick); gainSkill(b, 'hunting', b.birthTick);
    expect(b.skillXp.hunting).toBeGreaterThan(a.skillXp.hunting);
    const c = { ...b, skillXp: { ...b.skillXp, hunting: 0, literacy: 10000 } };
    gainSkill(c, 'hunting', c.birthTick); expect(c.skillXp.hunting).toBeGreaterThan(b.skillXp.hunting);
    c.skillXp.hunting = 10000; expect(skillRiskPct(c, 'hunting')).toBeLessThan(skillRiskPct(a, 'hunting'));
    c.skillXp.hunting = 0; c.stamina = 0; gainSkill(c, 'hunting', c.birthTick);
    expect(c.skillXp.hunting).toBeLessThan(b.skillXp.hunting);
  });
  it('kỹ năng không dùng mai một; kỹ năng vừa dùng được giữ, chỉ hiện mức chữ', () => {
    const c = character(); gainSkill(c, 'farming', c.birthTick);
    const xp = c.skillXp.farming; decaySkills(c, c.birthTick + 35); expect(c.skillXp.farming).toBe(xp);
    decaySkills(c, c.birthTick + 36); expect(c.skillXp.farming).toBeLessThan(xp);
    expect(skillViews(c)).toEqual([{ id: 'skill.farming', rank: 'rank.novice' }]);
  });
});
