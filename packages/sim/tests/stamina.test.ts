import { describe, expect, it } from 'vitest';
import { birthplaceId, regionId } from '@tsvl/shared';
import { Life } from '../src/index';
import { fatiguePct, recoverStamina, spendStamina, staminaMax } from '../src/life/stamina';

export const testCharacter = () => Life.create({ worldSeed: 'stamina', regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }).snapshot().character;
describe('thể lực', () => {
  it('thể chất tốt tăng trần và hồi phục; tuổi già hồi chậm', () => {
    const a = testCharacter(), b = testCharacter(); a.constitution = 1; b.constitution = 10;
    const tick = a.birthTick + 25 * 36;
    expect(staminaMax(b, tick)).toBeGreaterThan(staminaMax(a, tick));
    a.stamina = b.stamina = 0; recoverStamina(a, tick); recoverStamina(b, tick);
    expect(b.stamina).toBeGreaterThan(a.stamina);
    const old = { ...b, stamina: 0 }; recoverStamina(old, old.birthTick + old.lifespanBase);
    expect(old.stamina).toBeLessThan(b.stamina);
  });
  it('lao lực mất sức khỏe, tăng rủi ro; nghỉ hồi nhiều nhưng không vượt trần', () => {
    const c = testCharacter(), t = c.birthTick; c.stamina = 10; const before = c.health;
    expect(spendStamina(c, 100)).toBe(true); expect(c.health).toBeLessThan(before); expect(fatiguePct(c, t)).toBe(140);
    recoverStamina(c, t, true); recoverStamina(c, t, true);
    expect(c.stamina).toBeLessThanOrEqual(staminaMax(c, t));
  });
});
