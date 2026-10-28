// v0.5 S3: thừa kế (vợ/chồng → con → quỹ quận), phí thầy thuốc vào túi thầy thuốc — ADR 0018 Q5.
import { birthplaceId, regionId } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice } from './auto';
import { createEconomy, countyMoney } from '../src/economy/market';
import { HEAD_TAX, LIVING_SPEND_KEEP, settleAction, yearlySpending } from '../src/economy/income';
import { createCharacter } from '../src/life/character';
import { becomeIndependent, newHousehold } from '../src/life/household';
import { vLifeSnapshot } from '../src/life/validate';
import { bequeath, die, type DeathContext } from '../src/npc/lifecycle';
import { newNpcWorld, npcMoney, physicianIn, type NpcState } from '../src/npc/state';
import { spawnNpc } from '../src/npc/population';

const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const life = (seed = 'inherit') => Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: bp.id }, bp, region);
const purse = (money: number, grain: number, landMu: number, independent = true) => ({ ...newHousehold(), independent, money, grain, landMu, tenure: landMu > 0 ? 'owner' as const : 'tenant' as const });

/** Một thế giới nhỏ: người mất `dead`, các người khác dựng sẵn ở quận 0. */
function world(n: number) {
  const w = newNpcWorld(1, regionId('r0'));
  const eco = createEconomy(region, 100 * 36);
  const people: NpcState[] = [];
  for (let i = 0; i < n; i++) people.push(spawnNpc(w, eco, region, Rng.fromSeed(i + 1), 100 * 36, 0, null, { age: 30 + i }));
  return { w, eco, people };
}

describe('chia của (v0.5 S3)', () => {
  it('chia đều, phần lẻ cho người đầu; tá điền nhận ruộng thành tự canh; người chưa ra riêng giữ ruộng', () => {
    const from = purse(1001, 31, 5);
    const a = purse(0, 0, 0), b = purse(0, 0, 0, false), c = purse(10, 0, 0);
    const got = bequeath(from, [a, b, c]);
    expect(got.map((g) => [g.money, g.grain, g.landMu])).toEqual([[335, 11, 3], [333, 10, 1], [333, 10, 1]]);
    expect([a.money, b.money, c.money]).toEqual([335, 333, 343]);
    expect([a.tenure, b.tenure, c.tenure]).toEqual(['owner', 'tenant', 'owner']);
    expect(b.landMu).toBe(1);
  });

  it('lập thân: ruộng đã thừa kế lúc nhỏ được giữ, cộng phần chia; đường cũ (chưa thừa kế gì) không đổi', () => {
    const eco = createEconomy(region, 0);
    const kid = createCharacter({ birthTick: 0, birthplaceId: bp.id, birthplaceKind: 'village', county: 0, background: 'destitute' }, Rng.fromSeed(1), Rng.fromSeed(2));
    kid.household.landMu = 2;
    becomeIndependent(kid, eco.counties[0]!);
    expect([kid.household.landMu, kid.household.tenure]).toEqual([2, 'owner']);
    const plain = createCharacter({ birthTick: 0, birthplaceId: bp.id, birthplaceKind: 'village', county: 0, background: 'commoner' }, Rng.fromSeed(1), Rng.fromSeed(2));
    becomeIndependent(plain, eco.counties[0]!);
    expect([plain.household.landMu, plain.household.tenure]).toEqual([6, 'owner']);
  });
});

describe('thừa kế khi NPC mất (v0.5 S3, Q5)', () => {
  const death = { tick: 100 * 36, cause: 'old_age' as const, detail: 'old_age.natural' };

  it('vợ/chồng còn sống nhận hết; quỹ quận không đổi; sổ cái giữ', () => {
    const { w, eco, people: [dead, wife, son] } = world(3);
    dead!.character.kin.spouse = wife!.id; wife!.character.kin.spouse = dead!.id;
    son!.character.kin.father = dead!.id;
    Object.assign(dead!.character.household, { money: 900, grain: 50, landMu: 6 });
    const total = countyMoney(eco) + npcMoney(w), county = eco.counties[0]!.money;
    const before = { ...wife!.character.household };
    die(dead!, death, eco, { world: w, player: null });
    expect(wife!.character.household.money - before.money).toBe(900);
    expect(wife!.character.household.grain - before.grain).toBe(50);
    expect(wife!.character.household.landMu - before.landMu).toBe(6);
    expect(eco.counties[0]!.money).toBe(county);
    expect(countyMoney(eco) + npcMoney(w)).toBe(total);
    expect([dead!.character.household.money, dead!.character.household.grain, dead!.character.household.landMu]).toEqual([0, 0, 0]);
  });

  it('không có vợ/chồng: chia đều cho các con còn sống (cả người chơi), con lớn trước; người chơi nhận được ghi lại kèm tuần mất', () => {
    const { w, eco, people: [dead, elder, younger] } = world(3);
    elder!.character.kin.mother = dead!.id; younger!.character.kin.mother = dead!.id;
    elder!.character.birthTick = 10; younger!.character.birthTick = 900;
    const player = createCharacter({ birthTick: 500, birthplaceId: bp.id, birthplaceKind: 'village', county: 0 }, Rng.fromSeed(7), Rng.fromSeed(8));
    player.kin.mother = dead!.id;
    Object.assign(dead!.character.household, { money: 1000, grain: 0, landMu: 0 });
    const ctx: DeathContext = { world: w, player: { c: player, inherited: [] } };
    const m0 = [elder!, younger!].map((n) => n.character.household.money);
    die(dead!, death, eco, ctx);
    expect(elder!.character.household.money - m0[0]!).toBe(334);
    expect(player.household.money).toBe(333);
    expect(younger!.character.household.money - m0[1]!).toBe(333);
    expect(ctx.player!.inherited).toEqual([{ from: dead!.id, name: dead!.character.name, tick: death.tick, money: 333, grain: 0, landMu: 0 }]);
  });

  it('không có ai thừa kế: tiền, lương về quỹ, kho quận nhà như v0.4', () => {
    const { w, eco, people: [dead] } = world(1);
    Object.assign(dead!.character.household, { money: 700, grain: 40 });
    const county = eco.counties[0]!;
    const [m, g] = [county.money, county.grain];
    die(dead!, death, eco, { world: w, player: null });
    expect([county.money - m, county.grain - g]).toEqual([700, 40]);
  });
});

describe('người chơi thừa kế cha mẹ (v0.5 S3)', () => {
  /** Cha đã mất; mẹ sắp chết già ở quận `county`, có của. */
  function orphaning(county: number, seed: string) {
    const s = life(seed).snapshot();
    const [father, mother] = [s.character.kin.father!, s.character.kin.mother!].map((id) => s.npcs.people.find((n) => n.id === id)!);
    father!.death = { tick: Math.max(0, s.tick - 1), cause: 'illness', detail: 'illness.fever' }; father!.character.alive = false;
    // Các con khác của mẹ (nếu có) không còn: người chơi là người thừa kế duy nhất
    for (const n of s.npcs.people) if (n.character.kin.mother === mother!.id) n.character.kin.mother = null;
    Object.assign(mother!.character.household, { money: 1234, grain: 200 });
    mother!.character.location = county; mother!.character.home = county;
    mother!.character.health = 1; mother!.character.healthMax = 1; mother!.character.lifespanBase = s.tick + 5 - mother!.character.birthTick;
    return { s, mother: mother! };
  }

  it('mẹ mất ở quận khác (tầng L1, tính trước cả tháng): tin thừa kế đúng tuần mất, sau tin mẹ mất; tiền vào túi, sổ cái giữ', () => {
    const { s, mother } = orphaning(1, 'heir-l1');
    const l = Life.restore(s, [], region);
    const total = l.totalMoney(), money = l.character.household.money;
    for (let k = 0; k < 12 && l.alive; k++) autoAdvance(l, 'week', lastChoice);
    const dead = l.snapshot().npcs.people.find((n) => n.id === mother.id)!;
    expect(dead.death).not.toBeNull();
    const death = l.log.find((e) => e.key === 'log.kin.death')!, heir = l.log.find((e) => e.key === 'log.kin.inherit')!;
    expect(heir).toMatchObject({ tick: dead.death!.tick, importance: 'major', params: { name: mother.character.name } });
    // Người mẹ còn ăn, còn tiêu tới lúc mất: phần chia là của còn lại, không quá số ban đầu
    expect(Number(heir.params.money)).toBeGreaterThan(0);
    expect(Number(heir.params.money)).toBeLessThanOrEqual(1234 + 2000);
    expect(l.log.indexOf(heir)).toBeGreaterThan(l.log.indexOf(death));
    expect(l.character.household.money).toBeGreaterThan(money);
    expect(l.totalMoney()).toBe(total);
    expect(l.snapshot().bequests).toEqual([]);
  });

  it('lưu giữa lúc phần chia còn chờ tin → tải → cùng digest và cùng nhật ký như chạy liền', () => {
    const { s, mother } = orphaning(1, 'heir-save');
    // Mẹ ở tầng L1 chết già đúng tuần thứ ba của tháng tới: phần chia vào túi ở đầu tháng, tin chờ hai tuần
    const m0 = s.tick + ((3 - (s.tick % 3)) % 3);
    mother.character.health = mother.character.healthMax = 1000;
    mother.character.lifespanBase = m0 + 2 - mother.character.birthTick;
    const a = Life.restore(s, [], region);
    let saved: { snap: ReturnType<Life['snapshot']>; log: Life['log'] } | null = null;
    for (let k = 0; k < 12 && a.alive; k++) {
      autoAdvance(a, 'week', lastChoice);
      if (!saved && a.snapshot().bequests.length) saved = { snap: a.snapshot(), log: [...a.log] };
    }
    expect(saved).not.toBeNull();
    expect(saved!.snap.bequests[0]).toMatchObject({ from: mother.id, tick: m0 + 2 });
    expect(vLifeSnapshot.check(saved!.snap, '$')).toBeNull();
    const b = Life.restore(saved!.snap, saved!.log, region);
    while (b.tick < a.tick && b.alive) autoAdvance(b, 'week', lastChoice);
    expect(b.digest()).toBe(a.digest());
    expect(b.log).toEqual(a.log);
    expect(a.log.filter((e) => e.key === 'log.kin.inherit').map((e) => e.tick)).toEqual([m0 + 2]);
  });
});

describe('phí thầy thuốc vào túi thầy thuốc (v0.5 S3, Q5)', () => {
  it('chữa bệnh: có thầy thuốc thì phí vào túi người ấy, quỹ quận không đổi; không có thì vào quỹ', () => {
    const eco = createEconomy(region, 0), market = eco.counties[1]!;
    const sick = createCharacter({ birthTick: 0, birthplaceId: bp.id, birthplaceKind: 'town', county: 1 }, Rng.fromSeed(3), Rng.fromSeed(4));
    sick.household = purse(500, 0, 0); sick.conditions = [{ id: 'illness.fever', kind: 'illness', severity: 'serious', weeksLeft: 3 }];
    const doc = { money: 0 }, fund = market.money;
    settleAction('action.heal', sick, 100, market, Rng.fromSeed(1), doc);
    expect([doc.money, sick.household.money, market.money]).toEqual([100, 400, fund]);
    settleAction('action.heal', sick, 100, market, Rng.fromSeed(1));
    expect(market.money).toBe(fund + 100);
  });

  it('thầy thuốc ở quận: người có id nhỏ nhất, còn sống, đang ở quận', () => {
    const { w, people } = world(3);
    people[1]!.occupation = 'physician'; people[2]!.occupation = 'physician';
    expect(physicianIn(w, 0)?.id).toBe(people[1]!.id);
    people[1]!.death = { tick: 1, cause: 'illness', detail: 'x' };
    expect(physicianIn(w, 0)?.id).toBe(people[2]!.id);
    expect(physicianIn(w, 1)).toBeNull();
  });
});

describe('tin lập thân sau khi đã thừa kế ruộng (v0.5 S3, rà soát)', () => {
  it('becomeIndependent trả đúng phần chia; ruộng thừa kế không bị kể lại', () => {
    const eco = createEconomy(region, 0);
    const kid = createCharacter({ birthTick: 0, birthplaceId: bp.id, birthplaceKind: 'village', county: 0, background: 'commoner' }, Rng.fromSeed(1), Rng.fromSeed(2));
    kid.household.landMu = 3;
    const got = becomeIndependent(kid, eco.counties[0]!);
    expect(got.landMu).toBe(6);
    expect(kid.household.landMu).toBe(9);
  });
});

describe('chi dùng trong năm (v0.5 S3, chủ dự án chọn)', () => {
  it('người đã ra riêng tiêu 4% phần tiền trên 5.000 văn vào quỹ quận đang ở; dưới ngưỡng, chưa ra riêng thì không', () => {
    const eco = createEconomy(region, 0), here = eco.counties[1]!;
    const c = createCharacter({ birthTick: 0, birthplaceId: bp.id, birthplaceKind: 'village', county: 0 }, Rng.fromSeed(1), Rng.fromSeed(2));
    c.household = purse(LIVING_SPEND_KEEP + 10_000, 0, 0);
    const fund = here.money;
    expect(yearlySpending(c, here)).toBe(400);
    expect([c.household.money, here.money - fund]).toEqual([LIVING_SPEND_KEEP + 9_600, 400]);
    c.household.money = LIVING_SPEND_KEEP;
    expect(yearlySpending(c, here)).toBe(0);
    c.household = purse(50_000, 0, 0, false);
    expect(yearlySpending(c, here)).toBe(0);
  });

  it('người chơi giàu: đầu năm có tin chi dùng, tiền vào quỹ quận, sổ cái giữ', () => {
    const s = life('spend').snapshot();
    s.character.birthTick = 0; s.tick = 20 * 36 - 1;
    s.character.household = purse(25_000, 400, 0);
    const l = Life.restore(s, [], region);
    const total = l.totalMoney();
    // Tick 719 là tuần cuối năm 20, tick 720 là đầu năm 21
    for (let k = 0; k < 2; k++) autoAdvance(l, 'week', lastChoice);
    // Nộp thuế đinh (HEAD_TAX) trước, rồi chi dùng 4% phần trên 5.000 văn
    expect(l.log.find((e) => e.key === 'log.spend')?.params.coin).toBe(Math.floor(((25_000 - HEAD_TAX - LIVING_SPEND_KEEP) * 40) / 1000));
    expect(l.totalMoney()).toBe(total);
  });
});
