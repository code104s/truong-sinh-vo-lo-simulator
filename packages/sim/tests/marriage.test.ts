// v0.5 S5: gia đình người chơi — cưới hỏi, con chào đời ăn vào kho nhà, góa, cha mẹ già ốm, tang — ADR 0018 Q8.
import { ageYearsAt, birthplaceId, regionId, type MonthPlan } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice } from './auto';
import { createEconomy } from '../src/economy/market';
import { BRIDE_PRICE_BY_BACKGROUND, BRIDE_PRICE_KEEP, payBridePrice } from '../src/economy/income';
import { EVENTS } from '../src/events/catalog';
import { makeContext } from '../src/events/engine';
import { createCharacter, type CharacterState } from '../src/life/character';
import { vLifeSnapshot } from '../src/life/validate';
import { couplesFor, kinRole, lookup, PLAYER_ID, playerStandIn, single } from '../src/npc/family';
import { npcYearStart, wedPlayer } from '../src/npc/lifecycle';
import { npcPhase } from '../src/npc/phase';
import { spawnNpc } from '../src/npc/population';
import { newNpcWorld, type NpcState } from '../src/npc/state';
import { bondOf } from '../src/social/bonds';
import { socialAct, socialLock, type SocialWorld } from '../src/social/actions';
import type { LifeSnapshot } from '../src/life/life';

const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const age = (s: LifeSnapshot, x: { birthTick: number }) => ageYearsAt(x.birthTick, s.tick);
/** RNG giả: nhận lời khi xác suất từ một nửa trở lên. */
const half = { chance: (ppm: number) => ppm >= 500_000 } as unknown as Rng;

/** Người chơi 25 tuổi, đã ra riêng, giới định sẵn; một người khác giới hợp tuổi, chưa có gia đình, cùng quận. */
function adult(gender: 'male' | 'female', seed = 'marry') {
  const s = Life.create({ worldSeed: seed, regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  s.tick = 30 * 36 + 1;
  const c = s.character;
  c.birthTick = s.tick - 25 * 36; c.gender = gender;
  Object.assign(c.household, { independent: true, money: 5_000, grain: 600, landMu: 6, tenure: 'owner' });
  c.health = c.healthMax = 1000; c.stamina = 900; c.conditions = [];
  s.events.once.push('event.coming_of_age');
  const byId = lookup(s.npcs);
  // Người khác giới, không phải người thân, ở quận 0; không có ai chưa vợ/chồng thì gỡ liên kết của một người
  const pool = s.npcs.people.filter((n) => !n.death && n.character.location === 0 && n.character.gender !== gender && !kinRole(c, n));
  const other = pool.find((n) => n.character.household.independent && single(n, byId)) ?? pool[0]!;
  const was = other.character.kin.spouse === null ? undefined : byId.get(other.character.kin.spouse);
  if (was) was.character.kin.spouse = null;
  other.character.kin.spouse = null;
  other.character.household.independent = true;
  other.character.birthTick = s.tick - 24 * 36;
  return { s, c, other };
}
const world = (s: LifeSnapshot, rng: Rng = half): SocialWorld => ({ npcs: s.npcs, bonds: s.bonds, rng, tick: s.tick, logic: region });
const propose = (n: NpcState) => ({ action: 'action.propose', person: n.id });
const befriend = (s: LifeSnapshot, n: NpcState, closeness = 90, trust = 90) => {
  s.bonds.push({ id: n.id, closeness, trust, hostility: 0, owed: 0 });
  s.bonds.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
};

describe('cưới hỏi (v0.5 S5)', () => {
  it('khóa: chưa ra riêng, đã có vợ/chồng, cùng giới, người thân, quá tuổi, chưa đủ thân', () => {
    const { s, c, other } = adult('male');
    const w = world(s);
    expect(socialLock(propose(other), c, w)).toBe('lock.not_close');
    befriend(s, other);
    expect(socialLock(propose(other), c, w)).toBeNull();
    c.household.independent = false;
    expect(socialLock(propose(other), c, w)).toBe('lock.dependent');
    c.household.independent = true;
    other.character.birthTick = s.tick - 40 * 36;
    expect(socialLock(propose(other), c, w)).toBe('lock.no_match');
    other.character.birthTick = s.tick - 24 * 36;
    other.character.gender = 'male';
    expect(socialLock(propose(other), c, w)).toBe('lock.no_match');
    other.character.gender = 'female';
    const mother = s.npcs.people.find((n) => n.id === c.kin.mother)!;
    expect(socialLock(propose(mother), c, w)).not.toBeNull();
    c.kin.spouse = other.id; other.character.kin.spouse = PLAYER_ID;
    expect(socialLock(propose(other), c, w)).toBe('lock.married');
    // Góa: vợ mất thì cưới lại được (người khác)
    other.death = { tick: s.tick - 1, cause: 'old_age', detail: 'old_age.natural' };
    expect(single(playerStandIn(c), lookup(s.npcs))).toBe(true);
  });

  it('nhận lời: nên vợ chồng hai phía; nhà trai đưa sính lễ sang túi vợ; quan hệ gần hơn; sổ cái giữ; lưu/tải được', () => {
    const { s, other } = adult('male');
    befriend(s, other);
    const l = Life.restore(s, [], region);
    const total = l.totalMoney(), money = s.character.household.money, hers = other.character.household.money;
    expect(l.setPlan({ slots: [propose(other), propose(other), propose(other)] } as MonthPlan)).toBe(true);
    autoAdvance(l, 'week', lastChoice);
    const after = l.snapshot();
    const wife = after.npcs.people.find((n) => n.id === other.id)!;
    expect(after.character.kin.spouse).toBe(other.id);
    expect(wife.character.kin.spouse).toBe(PLAYER_ID);
    const price = BRIDE_PRICE_BY_BACKGROUND[after.character.background];
    expect(money - after.character.household.money).toBeGreaterThanOrEqual(price);
    expect(wife.character.household.money - hers).toBeGreaterThanOrEqual(price);
    expect(bondOf(after.bonds, other.id)).toMatchObject({ closeness: 100, trust: 100 });
    expect(l.log.some((e) => e.key === 'log.marry.wed_groom')).toBe(true);
    expect(l.totalMoney()).toBe(total);
    expect(l.view().spouse).toBe(other.id);
    expect(l.circle().find((v) => v.id === other.id)).toMatchObject({ kin: 'spouse' });
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(after)), '$')).toBeNull();
    // Vợ của người chơi không bị ghép với người khác ở đầu năm
    expect(single(wife, lookup(after.npcs))).toBe(false);
  });

  it('bị từ chối: thân thiết −5, có tin', () => {
    const { s, c, other } = adult('female');
    befriend(s, other, 55, 0);
    const log: string[] = [];
    socialAct(propose(other), c, world(s), (e) => log.push(e.key));
    expect(log).toEqual(['log.marry.refused']);
    expect(bondOf(s.bonds, other.id)!.closeness).toBe(50);
    expect(c.kin.spouse).toBeNull();
  });

  it('khác quận nhà: người ít ruộng hơn chuyển; người chơi chuyển thì đổi quận nhà, vẫn đứng nơi đang đứng', () => {
    const { s, c, other } = adult('female');
    other.character.home = 1;
    c.household.landMu = 0; other.character.household.landMu = 6;
    const r = wedPlayer(s.npcs, playerStandIn(c), other, region);
    expect(r.mover).toBe('player');
    expect([c.home, c.location]).toEqual([1, 0]);
    const b = adult('male', 'marry-b');
    b.other.character.home = 1;
    b.other.character.household.landMu = 0;
    expect(wedPlayer(b.s.npcs, playerStandIn(b.c), b.other, region).mover).toBe('spouse');
    expect([b.other.character.home, b.other.character.location]).toEqual([0, 0]);
  });

  it('sính lễ: nhà trai giữ lại 1.000 văn, không đủ thì chỉ đưa phần dư (cùng luật NPC)', () => {
    const groom = createCharacter({ birthTick: 0, birthplaceId: bp.id, birthplaceKind: 'village', county: 0, background: 'wealthy' }, Rng.fromSeed(1), Rng.fromSeed(2));
    const bride = createCharacter({ birthTick: 0, birthplaceId: bp.id, birthplaceKind: 'village', county: 0, background: 'commoner' }, Rng.fromSeed(3), Rng.fromSeed(4));
    groom.household.money = 1_500; bride.household.money = 0;
    expect(payBridePrice(groom, bride)).toBe(500);
    expect([groom.household.money, bride.household.money]).toEqual([BRIDE_PRICE_KEEP, 500]);
    expect(payBridePrice(groom, bride)).toBe(0);
    groom.household.money = 10_000;
    expect(payBridePrice(groom, bride)).toBe(BRIDE_PRICE_BY_BACKGROUND.wealthy);
  });
});

describe('con của người chơi (v0.5 S5)', () => {
  /** Thế giới nhỏ: người chơi (nữ, 25) lấy một người chồng NPC ở quận 0, quận chỉ có hai vợ chồng. */
  function couple(root: number) {
    const w = newNpcWorld(root, regionId('r0'));
    const eco = createEconomy(region, 30 * 36);
    const t = 30 * 36;
    const husband = spawnNpc(w, eco, region, Rng.fromSeed(root), t, 0, null, { gender: 'male', age: 27 });
    const c: CharacterState = createCharacter({ birthTick: t - 25 * 36, birthplaceId: bp.id, birthplaceKind: 'village', county: 0, background: husband.character.background, gender: 'female' }, Rng.fromSeed(7), Rng.fromSeed(8));
    Object.assign(c.household, { independent: true, money: 3_000, grain: 2_000 });
    Object.assign(husband.character.household, { money: 3_000, grain: 2_000 });
    c.kin.spouse = husband.id; husband.character.kin.spouse = PLAYER_ID;
    return { w, eco, t, husband, c };
  }

  it('người chơi có vợ/chồng là một cặp nhận con; con mang họ cha, là con trai/gái của người chơi', () => {
    const { w, eco, t, husband, c } = couple(1);
    const me = playerStandIn(c);
    expect(couplesFor(w, lookup(w), 0, t, me)).toEqual([[me, husband]]);
    const player = { c, inherited: [], death: null };
    npcYearStart(w, eco, region, t, 0, { world: w, player, me });
    const kid = w.people.find((n) => n.character.kin.mother === PLAYER_ID)!;
    expect(kid.character.kin.father).toBe(husband.id);
    expect(kid.character.name.split(' ')[0]).toBe(husband.character.name.split(' ')[0]);
    expect(kinRole(c, kid)).toBe(kid.character.gender === 'male' ? 'son' : 'daughter');
  });

  it('sinh khó khi người chơi là mẹ: cái chết ghi cho đời người chơi, không qua `die` của NPC', () => {
    let found = 0;
    for (let root = 1; root < 3000 && !found; root++) {
      const { w, eco, t, c } = couple(root);
      const player = { c, inherited: [], death: null as null | { detail: string } };
      npcYearStart(w, eco, region, t, 0, { world: w, player, me: playerStandIn(c) });
      if (player.death) { found = root; expect(player.death.detail).toBe('illness.childbirth'); expect(c.alive).toBe(true); }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('con dưới 16 ăn vào phần dư của kho người chơi (trên một năm ăn); người chơi không dư thì không lấy', () => {
    const { w, eco, t, husband, c } = couple(2);
    const player = { c, inherited: [], death: null };
    npcYearStart(w, eco, region, t, 0, { world: w, player, me: playerStandIn(c) });
    const kid = w.people.find((n) => n.character.kin.mother === PLAYER_ID)!;
    Object.assign(kid.character.household, { grain: 0, money: 0 });
    Object.assign(husband.character.household, { grain: 0, money: 0 });
    const grain = c.household.grain;
    npcPhase(w, eco, region, t + 1, 0, { player });
    expect(grain - c.household.grain).toBe(5);
    expect(kid.character.household.hunger).toBe(0);
    c.household.grain = 360;
    npcPhase(w, eco, region, t + 2, 0, { player });
    expect(c.household.grain).toBe(360);
  });

  it('người chơi đói được con đã ra riêng cùng quận giúp; vợ/chồng NPC đói được người chơi giúp', () => {
    const { w, eco, t, husband, c } = couple(3);
    Object.assign(husband.character.household, { grain: 0, money: 0, hunger: 2 });
    c.household.grain = 1_000;
    // Đầu tháng: người thân đang đói được chia lương
    const monthStart = t + 3 - ((t + 3) % 3);
    npcPhase(w, eco, region, monthStart, 0, { player: { c, inherited: [] } });
    expect(husband.character.household.grain).toBeGreaterThan(0);
    expect(c.household.grain).toBeLessThan(1_000);
  });
});

describe('góa, cha mẹ già, tang (v0.5 S5)', () => {
  it('vợ mất: người chơi nhận hết của, tin ghi "Vợ"', () => {
    const { s, other } = adult('male', 'widow');
    s.character.kin.spouse = other.id; other.character.kin.spouse = PLAYER_ID;
    Object.assign(other.character.household, { money: 777, grain: 0, landMu: 0 });
    other.character.health = -1; other.character.conditions = [{ id: 'illness.fever', kind: 'illness', severity: 'grave', weeksLeft: 4 }];
    other.character.location = s.character.location;
    const l = Life.restore(s, [], region);
    const money = l.snapshot().character.household.money;
    for (let k = 0; k < 6 && !l.log.some((e) => e.key === 'log.kin.death'); k++) autoAdvance(l, 'week', lastChoice);
    const death = l.log.find((e) => e.key === 'log.kin.death')!;
    expect(death.params.role).toBe('kin.wife');
    // Vợ còn sống được mấy tuần, túi có thể đổi: người chơi nhận đúng phần ghi trong tin
    const got = l.log.find((e) => e.key === 'log.kin.inherit' && e.params.name === other.character.name)!;
    expect(got).toBeDefined();
    expect(l.snapshot().npcs.people.find((n) => n.id === other.id)!.character.household.money).toBe(0);
    expect(Number(got.params.money)).toBeGreaterThan(0);
    expect(l.snapshot().character.household.money).toBeGreaterThan(money);
  });

  it('cha mẹ già ốm: chăm thì tốn hai ô, bệnh lui nhanh; mời thầy thuốc thì tốn tiền, bệnh dứt; bỏ đi thì nhạt', () => {
    const { s, c } = adult('male', 'elder');
    const mother = s.npcs.people.find((n) => n.id === c.kin.mother)!;
    mother.character.location = c.location; mother.character.birthTick = s.tick - 60 * 36;
    const def = EVENTS.find((d) => d.id === 'event.parent_ill')!;
    const ctxOf = () => { const ctx = makeContext(c, s.events, s, s.economy, region, s.tick, s.npcs, s.bonds); ctx.npc = def.cast!(ctx, Rng.fromSeed(1)); return ctx; };
    expect(def.weight(ctxOf())).toBe(0);
    mother.character.conditions = [{ id: 'illness.fever', kind: 'illness', severity: 'serious', weeksLeft: 6 }];
    expect(def.weight(ctxOf())).toBeGreaterThan(0);
    def.choices.find((x) => x.id === 'nurse')!.apply(ctxOf(), Rng.fromSeed(1));
    expect(mother.character.conditions[0]!.weeksLeft).toBe(3);
    expect(s.active).toMatchObject({ slot: { action: 'action.nurse' }, total: 2 });
    const money = c.household.money;
    def.choices.find((x) => x.id === 'physician')!.apply(ctxOf(), Rng.fromSeed(1));
    expect(mother.character.conditions).toEqual([]);
    expect(money - c.household.money).toBe(100);
  });

  it('tang người thân mới mất ở nơi mình đứng: lo chu đáo tốn tiền gấp mười quà, tiền vào quỹ quận', () => {
    const { s, c } = adult('female', 'funeral');
    const father = s.npcs.people.find((n) => n.id === c.kin.father)!;
    father.character.location = c.location;
    const def = EVENTS.find((d) => d.id === 'event.kin_funeral')!;
    const ctxOf = () => { const ctx = makeContext(c, s.events, s, s.economy, region, s.tick, s.npcs, s.bonds); ctx.npc = def.cast!(ctx, Rng.fromSeed(1)); return ctx; };
    expect(def.weight(ctxOf())).toBe(0);
    father.death = { tick: s.tick - 2, cause: 'old_age', detail: 'old_age.natural' };
    expect(ctxOf().npc?.id).toBe(father.id);
    const fund = s.economy.counties[c.location]!.money, money = c.household.money;
    expect(def.choices.find((x) => x.id === 'proper')!.apply(ctxOf(), Rng.fromSeed(1)).result).toBe('proper');
    const cost = money - c.household.money;
    expect(cost).toBeGreaterThan(0);
    expect(s.economy.counties[c.location]!.money - fund).toBe(cost);
    father.death.tick = s.tick - 10;
    expect(def.weight(ctxOf())).toBe(0);
  });
});
