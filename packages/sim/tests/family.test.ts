// v0.5 S1: cha mẹ thật của người chơi, liên kết ruột thịt, kho quan hệ thưa — ADR 0017, 0018.
import { ageYearsAt, birthplaceId, regionId } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { buildRegion } from '@tsvl/worldgen';
import { Life, Rng, simulateWorld, tradeDecision } from '../src/index';
import { feedPhase, newHousehold, PARENT_KEEP_GRAIN, PARENT_KEEP_MONEY, rationOf } from '../src/life/household';
import type { NpcState } from '../src/npc/state';
import { autoAdvance, lastChoice } from './auto';
import { createCharacter } from '../src/life/character';
import { vLifeSnapshot } from '../src/life/validate';
import { countyMoney, createEconomy } from '../src/economy/market';
import { assignPlayerParents, FATHER_AGE, KIN_HELP_WEEKS, KIN_KEEP_GRAIN, kinHelp, kinRole, MOTHER_AGE } from '../src/npc/family';
import { newNpcWorld, npcMoney } from '../src/npc/state';
import { bondOf, bondView, ensureBond, PARENT_CLOSENESS, PARENT_TRUST } from '../src/social/bonds';

const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const life = (seed = 'family') => Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: bp.id }, bp, region);

describe('cha mẹ thật của người chơi (v0.5 S1, ADR 0018 Q2)', () => {
  it('40 đời: cha mẹ là một cặp vợ chồng người lớn ở quận sinh, cùng xuất thân; người chơi mang họ cha; thân thiết, tin cậy sẵn', () => {
    for (let i = 0; i < 40; i++) {
      const s = life(`family-${i}`).snapshot();
      const c = s.character, people = s.npcs.people;
      const father = people.find((n) => n.id === c.kin.father)!, mother = people.find((n) => n.id === c.kin.mother)!;
      expect(father.character.gender).toBe('male');
      expect(mother.character.gender).toBe('female');
      for (const [p, [lo, hi]] of [[father, FATHER_AGE], [mother, MOTHER_AGE]] as const) {
        const age = ageYearsAt(p.character.birthTick, c.birthTick);
        expect(age).toBeGreaterThanOrEqual(lo);
        expect(age).toBeLessThanOrEqual(hi);
        expect(p.death).toBeNull();
        expect(p.character.background).toBe(c.background);
        expect([p.character.home, p.character.location]).toEqual([c.home, c.home]);
        expect(p.character.household.independent).toBe(true);
        expect(bondView(bondOf(s.bonds, p.id)!)).toMatchObject({ closeness: 'close', trust: 'trusted', hostility: 'none' });
      }
      expect(father.character.kin.spouse).toBe(mother.id);
      expect(mother.character.kin.spouse).toBe(father.id);
      expect(c.name.split(' ')[0]).toBe(father.character.name.split(' ')[0]);
      // Tuổi thơ vẫn do hộ trừu tượng nuôi (ADR 0013)
      expect(c.household.independent).toBe(false);
    }
  });

  it('quận không có ai hợp thì dựng thêm cha mẹ: trừ dân nền một miệng ăn mỗi người, sổ cái không đổi', () => {
    const world = newNpcWorld(1, regionId('r0'));
    const eco = createEconomy(region, 0);
    const player = createCharacter({ birthTick: 0, birthplaceId: bp.id, birthplaceKind: 'village', county: 0 }, Rng.fromSeed(1), Rng.fromSeed(2));
    const mouths = eco.counties[0]!.mouths, money = countyMoney(eco) + npcMoney(world);
    const { father, mother } = assignPlayerParents(world, eco, region, Rng.fromSeed(3), 0, player);
    expect([father.id, mother.id].sort()).toEqual(['n1', 'n2']);
    expect(eco.counties[0]!.mouths).toBe(mouths - 2);
    expect(countyMoney(eco) + npcMoney(world)).toBe(money);
    expect([father.character.background, mother.character.background]).toEqual([player.background, player.background]);
    expect([father.character.gender, mother.character.gender]).toEqual(['male', 'female']);
    expect(kinRole(player, father)).toBe('father');
    expect(kinRole(player, mother)).toBe('mother');
  });

  it('tất định; lưu, tải cùng digest; liên kết hỏng bị schema từ chối', () => {
    const a = life('det'), b = life('det');
    expect(a.digest()).toBe(b.digest());
    const s = a.snapshot();
    expect(vLifeSnapshot.check(s, '$')).toBeNull();
    expect(Life.restore(s, [], region).digest()).toBe(a.digest());
    expect(vLifeSnapshot.check({ ...s, character: { ...s.character, kin: { ...s.character.kin, father: 'cha' } } }, '$')).not.toBeNull();
    expect(vLifeSnapshot.check({ ...s, bonds: [{ ...s.bonds[0]!, closeness: 101 }] }, '$')).not.toBeNull();
  });
});

describe('người thân, người quen (v0.5 S1)', () => {
  it('danh sách ở mọi quận: cha, mẹ trước, anh chị em, rồi người có quan hệ; người ở quận đang đứng mang vai', () => {
    const l = life('circle');
    const s = l.snapshot();
    // Một đứa trẻ cùng mẹ là anh chị em; một người ở quận khác có quan hệ
    const sib = s.npcs.people.find((n) => !n.death && n.character.home === 0 && n.id !== s.character.kin.father && n.id !== s.character.kin.mother)!;
    sib.character.kin.mother = s.character.kin.mother;
    const far = s.npcs.people.find((n) => !n.death && n.character.home === 1)!;
    ensureBond(s.bonds, far.id).closeness = 30;
    const r = Life.restore(s, [], region);
    expect(r.circle().map((p) => [p.id, p.kin ?? null])).toEqual([[s.character.kin.father, 'father'], [s.character.kin.mother, 'mother'], [sib.id, 'sibling'], [far.id, null]]);
    expect(r.circle().at(-1)!.bond).toMatchObject({ closeness: 'acquaintance' });
    expect(r.people().find((p) => p.id === s.character.kin.mother)?.kin).toBe('mother');
    expect(r.people().every((p) => p.kin === undefined || ['father', 'mother', 'sibling'].includes(p.kin))).toBe(true);
  });

  it('cha mẹ mất ở quận khác vẫn có tin quan trọng, ghi vai; người đã mất không còn trong danh sách', async () => {
    const { t } = await import('@tsvl/content');
    const s = life('kin-death').snapshot();
    const mother = s.npcs.people.find((n) => n.id === s.character.kin.mother)!;
    mother.character.location = 1;
    mother.character.health = 1; mother.character.healthMax = 1; mother.character.lifespanBase = s.tick - mother.character.birthTick;
    const l = Life.restore(s, [], region);
    for (let k = 0; k < 40 && l.alive; k++) autoAdvance(l, 'week', lastChoice);
    const news = l.log.filter((e) => e.key === 'log.kin.death');
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ importance: 'major', params: { role: 'kin.mother', name: mother.character.name } });
    expect(t('log.kin.death', news[0]!.params)).toMatch(/^Mẹ /);
    expect(l.circle().some((p) => p.id === mother.id)).toBe(false);
  });

  it('kho quan hệ thưa: chỉ có mục khi đã tương tác, sắp theo id; dải theo ngưỡng', () => {
    const bonds = [] as Parameters<typeof ensureBond>[0];
    ensureBond(bonds, 'n12'); ensureBond(bonds, 'n3'); ensureBond(bonds, 'n120'); ensureBond(bonds, 'n12');
    expect(bonds.map((b) => b.id)).toEqual(['n3', 'n12', 'n120']);
    const b = bonds[0]!;
    expect(bondView(b)).toEqual({ closeness: 'stranger', trust: 'wary', hostility: 'none', owed: 'none' });
    Object.assign(b, { closeness: PARENT_CLOSENESS, trust: PARENT_TRUST, hostility: 70, owed: -20 });
    expect(bondView(b)).toEqual({ closeness: 'close', trust: 'trusted', hostility: 'enemy', owed: 'i_owe' });
  });
});

describe('hôn nhân, trẻ có cha mẹ (v0.5 S2, ADR 0018 Q3, Q4)', () => {
  /** Đời người chơi chỉ nghỉ, chạy chừng ấy năm; trả mọi người đã từng có trong danh sách (cả người đã mất trong lúc chạy). */
  function run(years: number, seed = 'families') {
    const l = life(seed);
    const all = new Map<string, NpcState>();
    for (let y = 0; y < years && l.alive; y++) {
      for (let k = 0; k < 36 && l.alive; k++) autoAdvance(l, 'week', lastChoice);
      for (const n of l.snapshot().npcs.people) all.set(n.id, n);
    }
    return { l, all };
  }

  it('vợ chồng: một nam một nữ, liên kết hai chiều; mỗi người còn sống có nhiều nhất một vợ/chồng còn sống', () => {
    const { l } = run(12);
    const people = l.snapshot().npcs.people.filter((n) => !n.death);
    const byId = new Map(people.map((n) => [n.id, n]));
    let couples = 0;
    for (const n of people) {
      const s = n.character.kin.spouse === null ? undefined : byId.get(n.character.kin.spouse);
      if (!s) continue;
      couples++;
      expect(s.character.kin.spouse).toBe(n.id);
      expect(s.character.gender).not.toBe(n.character.gender);
    }
    expect(couples).toBeGreaterThan(0);
  });

  it('trẻ sinh trong lúc chạy: phần lớn có cha mẹ là một cặp vợ chồng, mang họ cha, cùng xuất thân với cha; mẹ 18–42 tuổi lúc sinh; nhà không quá 5 con nhỏ', () => {
    const { l, all } = run(12);
    // Trẻ sinh sau khi đời người chơi bắt đầu (dân số ban đầu sinh trước đó)
    const born = [...all.values()].filter((n) => n.character.birthTick > l.character.birthTick);
    const withParents = born.filter((n) => n.character.kin.mother !== null);
    expect(born.length).toBeGreaterThan(3);
    expect(withParents.length / born.length).toBeGreaterThanOrEqual(0.6);
    for (const k of withParents) {
      const m = all.get(k.character.kin.mother!)!, f = all.get(k.character.kin.father!)!;
      expect(m.character.kin.spouse).toBe(f.id);
      expect(k.character.name.split(' ')[0]).toBe(f.character.name.split(' ')[0]);
      expect(k.character.background).toBe(f.character.background);
      const age = ageYearsAt(m.character.birthTick, k.character.birthTick);
      expect(age).toBeGreaterThanOrEqual(MOTHER_AGE[0]);
      expect(age).toBeLessThanOrEqual(MOTHER_AGE[1]);
    }
    const s = l.snapshot(), t = s.tick;
    const small = new Map<string, number>();
    for (const n of s.npcs.people) if (!n.death && n.character.kin.mother && ageYearsAt(n.character.birthTick, t) < 16) small.set(n.character.kin.mother, (small.get(n.character.kin.mother) ?? 0) + 1);
    expect(Math.max(0, ...small.values())).toBeLessThanOrEqual(5);
    expect(vLifeSnapshot.check(s, '$')).toBeNull();
  }, 120_000);

  it('thế giới tự chạy 40 năm trên vùng thật: ≥ 60% trẻ sinh có cha mẹ thật; người 25–50 có vợ/chồng 50–85%; sổ cái giữ', () => {
    const s = simulateWorld(buildRegion('tsvl-01').logic, 40, 's2-family');
    expect(s.birthsWithParents / s.births).toBeGreaterThanOrEqual(0.6);
    expect(s.marriedPermille).toBeGreaterThanOrEqual(500);
    expect(s.marriedPermille).toBeLessThanOrEqual(850);
    expect(s.ledgerBreaks).toBe(0);
    expect(s.minQuotaPct).toBeGreaterThanOrEqual(70);
    expect(s.maxQuotaPct).toBeLessThanOrEqual(130);
  }, 300_000);
});

describe('con ăn vào kho cha mẹ, người thân giúp khi đói (v0.5 S2, chủ dự án chốt sau Bước 0; Q6)', () => {
  const eco = () => createEconomy(region, 0);
  const kid = (age: number) => createCharacter({ birthTick: 100 * 36 - age * 36, birthplaceId: bp.id, birthplaceKind: 'village', county: 0 }, Rng.fromSeed(age), Rng.fromSeed(9));
  const purse = (grain: number, money: number) => ({ ...newHousehold(), independent: true, grain, money });
  const t = 100 * 36;

  it('ăn kho mình trước, rồi phần trên một năm ăn của mẹ, của cha; mua bằng phần tiền trên mức giữ; thiếu nữa thì làng xóm cưu mang (năm thường)', () => {
    const c = kid(8), ration = rationOf(c, t);
    const own = { ...c.household, grain: 2 };
    c.household = own;
    const mother = purse(PARENT_KEEP_GRAIN + 1, 0), father = purse(PARENT_KEEP_GRAIN + 1, 0);
    feedPhase(c, t, 'normal', Rng.fromSeed(1), () => {}, null, { own, parents: [mother, father], market: eco().counties[0]! });
    expect([own.grain, mother.grain, father.grain]).toEqual([0, PARENT_KEEP_GRAIN, PARENT_KEEP_GRAIN]);
    expect(c.household.hunger).toBe(0); // 2 + 1 + 1 thiếu so với khẩu phần: phần còn lại làng xóm bù
    expect(ration).toBeGreaterThan(4);
    // Cha mẹ có tiền dư thì mua: tiền giảm, vẫn giữ mức giữ
    const rich = purse(0, PARENT_KEEP_MONEY + 500), market = eco().counties[0]!;
    feedPhase(c, t, 'normal', Rng.fromSeed(1), () => {}, null, { own: { ...newHousehold() }, parents: [rich], market });
    expect(rich.money).toBeLessThan(PARENT_KEEP_MONEY + 500);
    expect(rich.money).toBeGreaterThanOrEqual(PARENT_KEEP_MONEY);
  });

  it('năm đói kém cha mẹ hết cách thì trẻ có thể bị bỏ đói (như hộ trừu tượng)', () => {
    let hungry = 0;
    for (let i = 0; i < 50; i++) {
      const c = kid(6); c.background = 'destitute';
      feedPhase(c, t, 'famine', Rng.fromSeed(i), () => {}, null, { own: c.household, parents: [purse(0, 0)], market: eco().counties[0]! });
      if (c.household.hunger > 0) hungry++;
    }
    expect(hungry).toBeGreaterThan(0);
  });

  it('người thân cùng quận chia phần trên một năm ăn, tối đa 4 tuần mỗi lần; người ở quận khác, người không đói thì không', () => {
    const s = life('kin-help').snapshot();
    const [father, mother] = [s.character.kin.father!, s.character.kin.mother!].map((id) => s.npcs.people.find((n) => n.id === id)!);
    const me = createCharacter({ birthTick: 0, birthplaceId: bp.id, birthplaceKind: 'village', county: 0 }, Rng.fromSeed(5), Rng.fromSeed(6));
    me.household = purse(0, 0);
    father!.character.household.grain = KIN_KEEP_GRAIN + 100; mother!.character.household.grain = KIN_KEEP_GRAIN + 100;
    expect(kinHelp(me, [father!, mother!], 10)).toBe(0); // chưa đói
    me.household.hunger = 2;
    expect(kinHelp(me, [father!, mother!], 10)).toBe(10 * KIN_HELP_WEEKS);
    // Người đầu tiên đủ phần dư thì cho hết; người sau không phải cho
    expect([father!.character.household.grain, mother!.character.household.grain]).toEqual([KIN_KEEP_GRAIN + 60, KIN_KEEP_GRAIN + 100]);
    mother!.character.location = 1;
    father!.character.household.grain = KIN_KEEP_GRAIN;
    expect(kinHelp(me, [father!, mother!], 10)).toBe(0);
  });

  it('người chơi đang đói được cha mẹ mang gạo sang, có tin trong nhật ký', () => {
    const s = life('player-help').snapshot();
    s.character.birthTick = 0; s.tick = 20 * 36 - 1;
    s.character.household = purse(0, 0); s.character.household.hunger = 3;
    const father = s.npcs.people.find((n) => n.id === s.character.kin.father)!;
    father.character.household.grain = KIN_KEEP_GRAIN + 200; father.character.location = s.character.location;
    const l = Life.restore(s, [], region);
    for (let k = 0; k < 2 && l.alive; k++) autoAdvance(l, 'week', lastChoice);
    expect(l.log.some((e) => e.key === 'log.kin.help' && e.importance === 'major')).toBe(true);
  });

  it('bộ não tính theo miệng ăn cả nhà: nuôi thêm con thì giữ, bán theo năm ăn của cả nhà', () => {
    const b = { ageYears: 30, healthPct: 100, sick: false, independent: true, money: 100_000, grain: 400, month: 3, usable: () => true, market: { buyPrice: 40, maxBuy: 10_000, maxSell: 10_000, supply: 'normal' as const } };
    expect(tradeDecision(b)).toBe(0); // một người: giữ 360, bán trên 720
    expect(tradeDecision({ ...b, need: 20 })).toBe(320); // hai miệng ăn: giữ 720
    expect(tradeDecision({ ...b, grain: 1000 })).toBe(-280);
    expect(tradeDecision({ ...b, grain: 1000, need: 20 })).toBe(0); // bán trên 1.440
  });
});
