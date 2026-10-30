// Thế lực (v0.6, ADR 0019). S1: khung và quan phủ — lập, thu phần thuế, chi nha môn, sổ cái, lưu tải. S2: gia tộc. S3: thương hội. S4: băng cướp. S5: quan phủ sống.
// S6: tác động lên người chơi và NPC — thuế, rủi ro đường, an ninh, việc làm, tin đồn.
import { describe, expect, it } from 'vitest';
import { birthplaceId, isQuarterStart, regionId, vLifeSummary } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { Life } from '../src/index';
import { autoAdvance, lastChoice } from './auto';
import { createEconomy, countyMoney, economyMonth, type EconomyState } from '../src/economy/market';
import { banditsQuarter, BANDIT_FOUND_PERMILLE, BANDIT_GRAIN_PER_MEMBER, BANDIT_RAID_PERMILLE, hardCounty, lairSite } from '../src/factions/bandits';
import { guildsQuarter, GUILD_MIN_MERCHANTS, GUILD_WAGE_PCT, GUILD_DUES, GUILD_LOSS_QUARTERS, GUILD_MARGIN_PCT, GUILD_RESERVE_QUARTERS, GUILD_UPKEEP } from '../src/factions/guilds';
import { headTax, headTaxOf, HEAD_TAX, HIRE_WAGE, moneyLock, settleAction, wageOf } from '../src/economy/income';
import { harvestPlayer, landTax } from '../src/economy/farming';
import {
  baseTaxPermille, CAMPAIGN_COST, CLAN_REVOLT_MULT, foundGovernment, governmentAuthority, governmentForce, governmentRule, governmentSeat, governmentSpend, governmentTaxes,
  GOV_SPEND_PCT, GOV_TAX_SHARE_PCT, MAGISTRATE_TERM_YEARS, OFFICIAL_WAGE, setTaxRates, taxPctOf,
} from '../src/factions/government';
import { BANDIT_NEAR_THEFT_PCT, BANDIT_ROAD_PCT, banditsNear, GUILD_ROAD_PCT, roadRisk, routeDanger, routeRiskPct } from '../src/factions/impact';
import { factionMark, factionNews, factionRumors } from '../src/factions/news';
import { fateOf, legacyFactions, trackSeen, type FactionSeen } from '../src/factions/seen';
import { previewTravel } from '../src/life/travel';
import { slotEffects } from '../src/life/player';
import { actionDef } from '../src/life/actions';
import { makeContext, newEventsState } from '../src/events/engine';
import { highwayRobbers } from '../src/events/defs/road';
import { granaryTheft } from '../src/events/defs/economy';
import { controlOf, factionMoney, factionPhase, factionViews, newFactionWorld, type FactionState, type FactionWorldState } from '../src/factions/state';
import { newNpcWorld, type NpcState } from '../src/npc/state';
import { adopt, seedFamilies } from '../src/npc/family';
import { clansQuarter, CLAN_END_ADULTS, CLAN_MIN_ADULTS, CLAN_MIN_MONEY, CLAN_SMALL_ADULTS, KIN_ATTITUDE, MU_VALUE, PERSON_VALUE } from '../src/factions/clans';
import { Rng } from '../src/core/rng';
import { vLifeSnapshot } from '../src/life/validate';

/** Ba quận thẳng hàng: làng — thành — làng. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1, 2].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'city', 'village'], adjacency: [[0, 1], [1, 2]], terrainPct: [100, 100], fertilityPct: [100, 100, 100],
  seatKm: [[0, 60, 120], [60, 0, 60], [120, 60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const QUARTER = 36 * 10; // đầu năm 11: đầu quý
const grainOf = (eco: EconomyState) => eco.counties.reduce((s, c) => s + c.grain, 0);

describe('quan phủ: lập (v0.6 S1, Q7)', () => {
  it('một quan phủ, trị sở ở thành, giữ mọi quận, kho trống; id "f1", tên theo trị sở', () => {
    const fw = newFactionWorld();
    const g = foundGovernment(fw, region, 0);
    expect(g).toMatchObject({ id: 'f1', kind: 'government', seat: 1, counties: [0, 1, 2], members: [], money: 0, grain: 0, ended: null });
    expect(g.name).toEqual({ key: 'faction.government.name', params: { place: 'Quận 1' } });
    expect(controlOf(fw, 3)).toEqual(['f1', 'f1', 'f1']);
    expect(factionViews(fw, region)).toEqual([{ id: 'f1', kind: 'government', name: g.name, seat: 1, counties: [0, 1, 2], strength: 'dominant', members: 0, attitude: 'neutral' }]);
  });

  it('vùng không có thành: trị sở ở trấn đầu tiên, không có trấn thì quận 0', () => {
    expect(governmentSeat({ ...region, settlementKind: ['village', 'village', 'town'] })).toBe(2);
    expect(governmentSeat({ ...region, settlementKind: ['village', 'village', 'village'] })).toBe(0);
  });
});

describe('quan phủ: thuế và chi nha môn (Q3)', () => {
  it('thuế đinh và thuế điền ghi vào quận thu', () => {
    const s = Life.create({ worldSeed: 'tax', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
    const eco = s.economy;
    const c = s.character;
    c.birthTick = 0;
    Object.assign(c.household, { independent: true, money: 1_000, tenure: 'owner', landMu: 5, farmWeeks: 10, farmCounty: 0 });
    c.home = 0;
    expect(headTax(c, eco.counties[0]!, 20 * 36)).toBe(HEAD_TAX);
    expect(eco.counties[0]!.taxMoney).toBe(HEAD_TAX);
    const crop = harvestPlayer(c, eco, region);
    expect(crop.tax).toBeGreaterThan(0);
    expect(eco.counties[0]!.taxGrain).toBe(crop.tax);
  });

  it('đầu quý: lấy một nửa thuế quận giữ, chi một phần tư kho ở trị sở; tiền và lương không sinh không mất', () => {
    const eco = createEconomy(region, 0);
    const fw = newFactionWorld();
    const g = foundGovernment(fw, region, 0);
    Object.assign(eco.counties[0]!, { taxMoney: 1_000, taxGrain: 0 });
    Object.assign(eco.counties[2]!, { taxMoney: 0, taxGrain: 400 });
    const [money, grain] = [countyMoney(eco), grainOf(eco)];
    const [m0, g2, seatM, seatG] = [eco.counties[0]!.money, eco.counties[2]!.grain, eco.counties[1]!.money, eco.counties[1]!.grain];
    governmentTaxes(g, eco, QUARTER + 9); governmentSpend(g, eco);
    const took = (1_000 * GOV_TAX_SHARE_PCT) / 100;
    const tookGrain = (400 * GOV_TAX_SHARE_PCT) / 100;
    expect(eco.counties[0]!.money).toBe(m0 - took);
    expect(eco.counties[2]!.grain).toBe(g2 - tookGrain);
    expect(eco.counties[1]!.money).toBe(seatM + (took * GOV_SPEND_PCT) / 100);
    expect(eco.counties[1]!.grain).toBe(seatG + (tookGrain * GOV_SPEND_PCT) / 100);
    expect([g.money, g.grain]).toEqual([took - (took * GOV_SPEND_PCT) / 100, tookGrain - (tookGrain * GOV_SPEND_PCT) / 100]);
    expect([countyMoney(eco) + factionMoney(fw), grainOf(eco) + g.grain]).toEqual([money, grain]);
  });

  it('quỹ quận cạn thì lấy được bao nhiêu hay bấy nhiêu', () => {
    const eco = createEconomy(region, 0);
    const fw = newFactionWorld();
    const g = foundGovernment(fw, region, 0);
    Object.assign(eco.counties[0]!, { taxMoney: 1_000, money: 120 });
    governmentTaxes(g, eco, QUARTER + 9); governmentSpend(g, eco);
    expect(eco.counties[0]!.money).toBe(0);
    expect(g.money + (eco.counties[1]!.money - createEconomy(region, 0).counties[1]!.money)).toBe(120);
  });

  it('pha Thế lực chỉ chạy đầu quý; xong thì số thuế ghi mọi quận về 0, quận không ai giữ thì quỹ quận giữ cả', () => {
    const eco = createEconomy(region, 0);
    const fw = newFactionWorld();
    const g = foundGovernment(fw, region, 0);
    g.counties = [0];
    for (const ce of eco.counties) Object.assign(ce, { taxMoney: 600, taxGrain: 60 });
    const before = eco.counties.map((c) => c.money);
    // Quý giữa năm: chưa có thuế dân nền (đầu năm, S5)
    factionPhase(fw, eco, newNpcWorld(1, regionId('r0')), region, QUARTER + 10, Rng.fromSeed(1));
    expect(eco.counties.map((c) => c.taxMoney)).toEqual([600, 600, 600]);
    factionPhase(fw, eco, newNpcWorld(1, regionId('r0')), region, QUARTER + 9, Rng.fromSeed(1));
    expect(eco.counties.map((c) => [c.taxMoney, c.taxGrain])).toEqual([[0, 0], [0, 0], [0, 0]]);
    expect(eco.counties[0]!.money).toBe(before[0]! - 300);
    expect(eco.counties[2]!.money).toBe(before[2]);
  });
});

describe('quan phủ trong đời người chơi', () => {
  it('STATE thấy quan phủ giữ mọi quận; sổ cái gồm kho quan phủ không đổi qua từng tick hai năm; lưu, tải cùng digest', () => {
    const l = Life.create({ worldSeed: 'gov', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region);
    // v0.8 S3: tông môn ngoài vùng lập cùng lúc với quan phủ (không giữ quận nào)
    expect(l.factions().map((f) => [f.kind, f.strength, f.counties.length])).toEqual([['government', 'dominant', region.counties.length], ['sect', 'strong', 0]]);
    expect(l.control()).toEqual(['f1', 'f1', 'f1']);
    const total = l.totalMoney();
    for (let i = 0; i < 72; i++) {
      autoAdvance(l, 'week');
      expect(l.totalMoney()).toBe(total);
    }
    const snap = JSON.parse(JSON.stringify(l.snapshot()));
    expect(vLifeSnapshot.check(snap, '$')).toBeNull();
    const back = Life.restore(snap, JSON.parse(JSON.stringify(l.log)), region);
    expect(back.digest()).toBe(l.digest());
    for (let i = 0; i < 20; i++) { autoAdvance(l, 'week'); autoAdvance(back, 'week'); }
    expect(back.digest()).toBe(l.digest());
  });
});

// —— Gia tộc (v0.6 S2, Q4) ——
const T = 36 * 30; // đầu năm 31: đầu quý
const template = Life.create({ worldSeed: 'clan', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot().npcs.people[0]!;
interface P { surname?: string; gender?: 'male' | 'female'; age?: number; home?: number; lineage?: string | null; father?: string | null; spouse?: string | null; money?: number; land?: number }
function person(id: string, o: P = {}): NpcState {
  const n = structuredClone(template);
  n.id = id; n.death = null;
  const home = o.home ?? 0;
  Object.assign(n.character, { name: `${o.surname ?? 'Lương'} Văn ${id}`, gender: o.gender ?? 'male', birthTick: T - (o.age ?? 30) * 36, home, location: home });
  n.character.kin = { father: o.father ?? null, mother: null, spouse: o.spouse ?? null, lineage: o.lineage ?? null };
  Object.assign(n.character.household, { independent: true, money: o.money ?? 1_000, landMu: o.land ?? 6 });
  return n;
}
/** Dòng họ Lương ở quận 0: ông tổ n1 (60 tuổi) và bốn con trai, mỗi người 6 mẫu (đủ 30 mẫu; S8: lập từ 5 người lớn). */
function lineage(): NpcState[] {
  return [person('n1', { age: 60 }), ...['n2', 'n3', 'n4', 'n5'].map((id, i) => person(id, { age: 30 + i, father: 'n1', lineage: 'n1' }))];
}
/** Một dòng họ khác (họ, quận, ids; người đầu là tổ). */
const otherLine = (surname: string, ids: string[], o: P = {}) => ids.map((id, i) => person(id, { surname, age: 40 + i, lineage: i ? ids[0]! : null, father: i ? ids[0]! : null, ...o }));
function worldOf(people: NpcState[]) {
  const npcs = newNpcWorld(1, regionId('r0'));
  npcs.people = people;
  npcs.nextId = 100;
  const fw = newFactionWorld();
  foundGovernment(fw, region, 0);
  return { npcs, fw };
}
const clansIn = (fw: ReturnType<typeof newFactionWorld>) => fw.list.filter((f) => f.kind === 'clan');

describe('gia tộc: dòng cha (v0.6 S2)', () => {
  it('con nhận tổ dòng cha: con của người đầu dòng mang id người ấy, cháu mang tiếp', () => {
    const grand = person('n1'), mother = person('n9', { gender: 'female' });
    const son = person('n2');
    adopt(son.character, grand, mother);
    expect(son.character.kin.lineage).toBe('n1');
    const grandson = person('n3');
    adopt(grandson.character, son, mother);
    expect(grandson.character.kin.lineage).toBe('n1');
  });
});

describe('gia tộc: lập, trưởng họ, đứng đầu quận (Q4)', () => {
  it('đủ 5 người lớn cùng dòng, cùng quận, đủ ruộng thì lập; trưởng họ là nam lớn tuổi nhất; tên theo họ và trị sở', () => {
    const { npcs, fw } = worldOf(lineage());
    clansQuarter(fw, npcs, region, T);
    const [c] = clansIn(fw);
    expect(c).toMatchObject({ id: 'f2', kind: 'clan', seat: 0, members: ['n1', 'n2', 'n3', 'n4', 'n5'], leader: 'n1', counties: [0], money: 0, grain: 0 });
    expect(c!.name).toEqual({ key: 'faction.clan.name', params: { surname: 'Lương', place: 'Quận 0' } });
    expect(c!.power).toBe(5 * (1_000 + 6 * MU_VALUE + PERSON_VALUE));
    // Gia tộc chỉ đứng đầu quận, không cai quản: quan phủ vẫn giữ mọi quận
    expect(controlOf(fw, 3)).toEqual(['f1', 'f1', 'f1']);
  });

  it('thiếu người hay thiếu của thì chưa lập', () => {
    const three = worldOf(lineage().slice(0, CLAN_MIN_ADULTS - 1));
    clansQuarter(three.fw, three.npcs, region, T);
    expect(clansIn(three.fw)).toEqual([]);
    const poor = worldOf(lineage().map((n) => { n.character.household.landMu = 0; return n; }));
    clansQuarter(poor.fw, poor.npcs, region, T);
    expect(clansIn(poor.fw)).toEqual([]);
    const rich = worldOf(lineage().map((n) => { n.character.household.landMu = 0; n.character.household.money = CLAN_MIN_MONEY / 5; return n; }));
    clansQuarter(rich.fw, rich.npcs, region, T);
    expect(clansIn(rich.fw)).toHaveLength(1);
  });

  it('con của nam trong họ vào họ ở quý sau; họ uy thế lớn hơn đứng đầu quận', () => {
    const other = otherLine('Trần', ['n6', 'n7', 'n8', 'n9', 'n10'], { land: 20 });
    const { npcs, fw } = worldOf([...lineage(), ...other]);
    clansQuarter(fw, npcs, region, T);
    const [luong, tran] = clansIn(fw);
    expect([luong!.counties, tran!.counties]).toEqual([[], [0]]);
    npcs.people.push(person('n11', { age: 1, father: 'n2', lineage: 'n1' }));
    clansQuarter(fw, npcs, region, T + 9);
    expect(luong!.members).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n11']);
  });
});

describe('gia tộc: dòng họ dựng sẵn lúc dựng vùng (v0.6 S8)', () => {
  it('người nam nhiều ruộng nhất 45–75 tuổi nhận người lớn chưa có cha, hợp tuổi làm con: mang họ cha, chung dòng; đủ người thì lập gia tộc ngay quý đầu; không thêm người', () => {
    const elder = person('n1', { surname: 'Đỗ', age: 62, land: 12 });
    const poorElder = person('n2', { surname: 'Vũ', age: 58, land: 1 });
    const young = ['n3', 'n4', 'n5', 'n6'].map((id, i) => person(id, { surname: ['Lý', 'Hà', 'Phan', 'Mai'][i], age: 26 + 3 * i, land: 4 }));
    const daughters = ['n7', 'n8'].map((id) => person(id, { surname: 'Tô', gender: 'female', age: 30, land: 0 }));
    const { npcs, fw } = worldOf([elder, poorElder, ...young, ...daughters]);
    seedFamilies(npcs, region, Rng.fromSeed(5), T);
    expect(npcs.people).toHaveLength(8);
    const line = npcs.people.filter((n) => n.character.kin.lineage === 'n1');
    expect(line.length).toBeGreaterThanOrEqual(CLAN_MIN_ADULTS);
    for (const n of line.filter((x) => x.id !== 'n1')) {
      expect(n.character.kin.father).toBe('n1');
      if (n.character.gender === 'male') expect(n.character.name.startsWith('Đỗ ')).toBe(true);
    }
    expect(poorElder.character.kin.father).toBeNull();
    clansQuarter(fw, npcs, region, T);
    expect(clansIn(fw).map((c) => [c.name.params.surname, c.leader])).toEqual([['Đỗ', 'n1']]);
  });

  it('không đủ người lớn hợp tuổi để lập gia tộc thì không dựng dòng', () => {
    const { npcs } = worldOf([person('n1', { age: 62, land: 12 }), person('n2', { surname: 'Lý', age: 30 }), person('n3', { surname: 'Hà', age: 28 })]);
    seedFamilies(npcs, region, Rng.fromSeed(5), T);
    expect(npcs.people.map((n) => n.character.kin.father)).toEqual([null, null, null]);
  });
});

describe('gia tộc: tàn, nhập, tách', () => {
  it('người lớn ở trị sở dưới ngưỡng thì tàn; tàn quá một năm thì dọn khỏi danh sách', () => {
    const { npcs, fw } = worldOf(lineage());
    clansQuarter(fw, npcs, region, T);
    for (const id of ['n1', 'n2', 'n3']) npcs.people.find((n) => n.id === id)!.death = { tick: T, cause: 'illness', detail: 'x' };
    clansQuarter(fw, npcs, region, T + 9);
    const [c] = clansIn(fw);
    expect(c).toMatchObject({ ended: T + 9, members: [], counties: [], leader: null });
    expect(CLAN_END_ADULTS).toBe(3);
    factionPhase(fw, createEconomy(region, 0), npcs, region, T + 9 + 36, Rng.fromSeed(1));
    expect(clansIn(fw)).toEqual([]);
  });

  it('hai họ nhỏ cùng quận thông gia thì họ ít người nhập vào họ đông hơn, hai bên thân nhau', () => {
    const tran = otherLine('Trần', ['n6', 'n7', 'n8', 'n9', 'n10', 'n11']);
    const { npcs, fw } = worldOf([...lineage(), ...tran]);
    clansQuarter(fw, npcs, region, T);
    const [luong, tr] = clansIn(fw);
    // n2 (Lương) lấy n11 (Trần) — cả hai họ dưới ngưỡng họ nhỏ
    npcs.people.find((n) => n.id === 'n2')!.character.kin.spouse = 'n11';
    npcs.people.find((n) => n.id === 'n11')!.character.kin.spouse = 'n2';
    clansQuarter(fw, npcs, region, T + 9);
    expect(luong!.ended).toBe(T + 9);
    expect(tr!.members).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'n11']);
    expect(tr!.relations).toEqual([{ other: luong!.id, attitude: KIN_ATTITUDE }]);
    expect(CLAN_SMALL_ADULTS).toBeGreaterThan(6);
  });

  it('một chi đủ người lớn ở quận khác thì tách thành họ riêng, cùng họ, thân với họ gốc', () => {
    const branch = ['n6', 'n7', 'n8', 'n9', 'n10'].map((id, i) => person(id, { age: 25 + i, father: 'n2', lineage: 'n1', home: 2 }));
    const { npcs, fw } = worldOf(lineage());
    clansQuarter(fw, npcs, region, T);
    npcs.people.push(...branch);
    clansQuarter(fw, npcs, region, T + 9);
    const [root, b] = clansIn(fw);
    expect(root!.members).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    expect(b).toMatchObject({ seat: 2, members: ['n6', 'n7', 'n8', 'n9', 'n10'], name: { key: 'faction.clan.name', params: { surname: 'Lương', place: 'Quận 2' } } });
    expect(b!.relations).toEqual([{ other: root!.id, attitude: KIN_ATTITUDE }]);
  });
});

describe('gia tộc trong đời người chơi', () => {
  it('người trong họ mang id gia tộc ở STATE.people; dải thế theo uy thế so với các họ khác', () => {
    const l = Life.create({ worldSeed: 'clan-life', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region);
    const s = l.snapshot();
    const here = s.npcs.people.filter((n) => n.death === null && n.character.location === s.character.location).slice(0, 2);
    s.factions.list.push({ id: 'f9', kind: 'clan', name: { key: 'faction.clan.name', params: { surname: 'Lương', place: 'Quận 0' } }, seat: 0, counties: [0], roads: [], members: here.map((n) => n.id), leader: here[0]!.id, power: 100, losses: 0, relations: [], money: 0, grain: 0, founded: 0, ended: null });
    s.factions.nextId = 10;
    const back = Life.restore(JSON.parse(JSON.stringify(s)), [], region);
    expect(back.people().filter((p) => p.faction === 'f9').map((p) => p.id)).toEqual(here.map((n) => n.id));
    expect(back.factions().find((f) => f.id === 'f9')).toMatchObject({ kind: 'clan', members: 2, leader: here[0]!.id });
  });
});

// —— Thương hội (v0.6 S3, Q5) ——
/** Làng 0 — thành 1 — trấn 2: đường 0 (0–1) chạm thành, đường 1 (1–2) nối hai trị sở. */
const trade: RegionLogic = { ...region, settlementKind: ['village', 'city', 'town'] };
const merchant = (id: string, home: number, money = 5_000) => { const n = person(id, { home, money }); n.occupation = 'merchant'; return n; };
function market(people: NpcState[]) {
  const { npcs, fw } = worldOf(people);
  const eco = createEconomy(trade, 0);
  return { npcs, fw, eco };
}
const guildsIn = (fw: ReturnType<typeof newFactionWorld>) => fw.list.filter((f) => f.kind === 'guild');
const total = (eco: EconomyState, fw: ReturnType<typeof newFactionWorld>, npcs: { people: NpcState[] }) =>
  countyMoney(eco) + factionMoney(fw) + npcs.people.reduce((s, n) => s + n.character.household.money, 0);

describe('thương hội: dòng lương ghi lời buôn (v0.6 S3)', () => {
  it('mỗi tháng ghi lời lái buôn (chênh giá trừ phí chở) vào đường, theo quận mua; ghi không làm đổi tiền', () => {
    const eco = createEconomy(trade, 36 + 9);
    eco.counties[0]!.grain *= 4;
    eco.counties[2]!.grain = 0;
    const money = countyMoney(eco);
    economyMonth(eco, trade, 36 + 9);
    expect(countyMoney(eco)).toBe(money);
    // Thành 1 mua từ làng 0 (đường 0, bên b), trấn 2 mua từ thành (đường 1, bên b)
    expect(eco.tradeMargin[0]![1]).toBeGreaterThan(0);
    expect(eco.tradeMargin[0]![0]).toBe(0);
  });
});

describe('thương hội: lập, đường, thu, chia lãi (Q5)', () => {
  it('trấn, thành có 2 thương nhân thì lập (S8: 3 → 2); mỗi người góp vốn; làng không lập; 1 người chưa lập', () => {
    expect(GUILD_MIN_MERCHANTS).toBe(2);
    const { npcs, fw, eco } = market([merchant('n1', 1), merchant('n2', 1), merchant('n3', 1), merchant('n4', 2), merchant('n6', 0), merchant('n7', 0), merchant('n8', 0)]);
    guildsQuarter(fw, eco, npcs, trade, T);
    const [g] = guildsIn(fw);
    expect(guildsIn(fw)).toHaveLength(1);
    expect(g).toMatchObject({ kind: 'guild', seat: 1, counties: [1], members: ['n1', 'n2', 'n3'], money: 3 * GUILD_DUES, name: { key: 'faction.guild.name', params: { place: 'Quận 1' } } });
    expect(npcs.people[0]!.character.household.money).toBe(5_000 - GUILD_DUES);
  });

  it('giữ mọi đường chạm trị sở; đường nối hai trị sở thì hai hội cùng giữ, chia đôi; lấy phần lời từ quận mua; tiền không sinh không mất', () => {
    const { npcs, fw, eco } = market(['n1', 'n2', 'n3'].map((id) => merchant(id, 1)).concat(['n4', 'n5', 'n6'].map((id) => merchant(id, 2))));
    guildsQuarter(fw, eco, npcs, trade, T);
    const [city, town] = guildsIn(fw);
    eco.tradeMargin = [[0, 8_000], [4_000, 0]];
    const [m0, m1, m2] = eco.counties.map((c) => c.money);
    const before = total(eco, fw, npcs);
    const [cityMoney, townMoney] = [city!.money, town!.money];
    guildsQuarter(fw, eco, npcs, trade, T + 9);
    expect([city!.roads, town!.roads]).toEqual([[0, 1], [1]]);
    const share = (x: number) => (x * GUILD_MARGIN_PCT) / 100;
    // Đường 0: thành mua (bên b) → thành hội lấy cả phần; đường 1: thành mua (bên a) → hai hội chia đôi
    // Phí hội quán vào quỹ quận trị sở của từng hội
    expect(eco.counties[1]!.money).toBe(m1! - share(8_000) - share(4_000) + GUILD_UPKEEP);
    expect([eco.counties[0]!.money, eco.counties[2]!.money]).toEqual([m0, m2! + GUILD_UPKEEP]);
    expect(city!.money).toBe(cityMoney + share(8_000) + share(4_000) / 2 - GUILD_UPKEEP);
    expect(town!.money).toBe(townMoney + share(4_000) / 2 - GUILD_UPKEEP);
    expect(total(eco, fw, npcs)).toBe(before);
  });

  it('kho vượt mức giữ lại thì chia nửa phần vượt cho hội viên', () => {
    const { npcs, fw, eco } = market(['n1', 'n2', 'n3'].map((id) => merchant(id, 1)));
    guildsQuarter(fw, eco, npcs, trade, T);
    const [g] = guildsIn(fw);
    const reserve = GUILD_RESERVE_QUARTERS * GUILD_UPKEEP;
    g!.money = reserve + GUILD_UPKEEP + 6_000;
    const purse = npcs.people[0]!.character.household.money;
    guildsQuarter(fw, eco, npcs, trade, T + 9);
    expect(npcs.people[0]!.character.household.money).toBe(purse + 1_000);
    expect(g!.money).toBe(reserve + 3_000);
  });

  it('pha Thế lực xóa lời buôn đã ghi sau khi chia', () => {
    const { npcs, fw, eco } = market([]);
    eco.tradeMargin = [[5, 6], [7, 8]];
    factionPhase(fw, eco, npcs, trade, T, Rng.fromSeed(1));
    expect(eco.tradeMargin).toEqual([[0, 0], [0, 0]]);
  });
});

describe('thương hội: tan', () => {
  it('lỗ liền nhiều quý (không ai buôn, phí hội quán ăn hết kho) thì tan; một năm sau mới lập lại', () => {
    const { npcs, fw, eco } = market(['n1', 'n2', 'n3'].map((id) => merchant(id, 1)));
    guildsQuarter(fw, eco, npcs, trade, T);
    const [g] = guildsIn(fw);
    g!.money = GUILD_UPKEEP * 2 + 30;
    let t = T;
    for (let q = 0; q < GUILD_LOSS_QUARTERS - 1; q++) { t += 9; guildsQuarter(fw, eco, npcs, trade, t); expect(g!.ended).toBeNull(); }
    t += 9;
    guildsQuarter(fw, eco, npcs, trade, t);
    expect(g).toMatchObject({ ended: t, members: [], roads: [], money: 0 });
    guildsQuarter(fw, eco, npcs, trade, t + 9);
    expect(guildsIn(fw).filter((f) => f.ended === null)).toEqual([]);
    factionPhase(fw, eco, npcs, trade, t + 36, Rng.fromSeed(1));
    expect(guildsIn(fw).filter((f) => f.ended === null)).toHaveLength(1);
  });

  it('hội viên dưới 2 (thương nhân bỏ nghề) thì tan; kho chia cho người còn lại, phần lẻ vào quỹ quận trị sở', () => {
    const { npcs, fw, eco } = market(['n1', 'n2', 'n3'].map((id) => merchant(id, 1)));
    guildsQuarter(fw, eco, npcs, trade, T);
    const [g] = guildsIn(fw);
    g!.money = 5_000;
    npcs.people[0]!.occupation = 'laborer';
    npcs.people[1]!.occupation = 'laborer';
    const before = total(eco, fw, npcs);
    const purse = npcs.people[2]!.character.household.money;
    guildsQuarter(fw, eco, npcs, trade, T + 9);
    expect(g).toMatchObject({ ended: T + 9, money: 0 });
    expect(npcs.people[2]!.character.household.money).toBe(purse + 5_000 - GUILD_UPKEEP);
    expect(total(eco, fw, npcs)).toBe(before);
  });
});

// —— Băng cướp (v0.6 S4, Q6, Q9) ——
/** Thành 0 — làng 1 — làng 2 — làng 3: làng 2, 3 không kề trị sở; đường 2–3 là núi. */
const hills: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1, 2, 3].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['city', 'village', 'village', 'village'], adjacency: [[0, 1], [1, 2], [2, 3]], terrainPct: [100, 100, 200], fertilityPct: [100, 100, 100, 100],
  seatKm: [[0, 60, 120, 180], [60, 0, 60, 120], [120, 60, 0, 60], [180, 120, 60, 0]],
};
const poor = (id: string, home: number, personality = 'hot_tempered') => {
  const n = person(id, { home, money: 100, land: 0 });
  n.occupation = 'farmer';
  n.character.personality = personality;
  return n;
};
/** Rng luôn rút trúng (0) hay không bao giờ trúng (999). */
const always = { int: (lo: number) => lo } as unknown as Rng;
const never = { int: (_lo: number, hi: number) => hi } as unknown as Rng;
function hillWorld(people: NpcState[], hard: number[]) {
  const npcs = newNpcWorld(1, regionId('r0'));
  npcs.people = people;
  const fw = newFactionWorld();
  foundGovernment(fw, hills, 0);
  const eco = createEconomy(hills, 0);
  for (const c of hard) eco.counties[c]!.disaster = 'drought';
  return { npcs, fw, eco };
}
const bandsIn = (fw: ReturnType<typeof newFactionWorld>) => fw.list.filter((f) => f.kind === 'bandits');

describe('băng cướp: nơi lập, năm khó (v0.6 S4)', () => {
  it('sào huyệt: không phải trị sở; không kề trị sở, hoặc có đường núi', () => {
    expect([0, 1, 2, 3].map((c) => lairSite(hills, c, 0))).toEqual([false, false, true, true]);
    expect(lairSite({ ...hills, terrainPct: [100, 200, 100] }, 1, 0)).toBe(true);
  });

  it('năm khó: có tai họa, đói kém hay khan lương', () => {
    const eco = createEconomy(hills, 0);
    expect(hardCounty(eco.counties[2]!)).toBe(false);
    eco.counties[2]!.disaster = 'flood';
    expect(hardCounty(eco.counties[2]!)).toBe(true);
    eco.counties[3]!.grain = 0;
    expect(hardCounty(eco.counties[3]!)).toBe(true);
  });
});

describe('băng cướp: lập, cướp, chia (Q6)', () => {
  it('năm khó ở nơi hợp, đủ 3 người không ruộng, nghèo quanh đó thì nổi đảng; người nóng nảy theo trước, người hiền không theo; đổi nghề cướp', () => {
    const people = [poor('n1', 2), poor('n2', 3, 'cunning'), poor('n3', 2, 'calm'), poor('n4', 2, 'calm'), poor('n5', 2, 'kind'), person('n6', { home: 2, land: 6 })];
    const { npcs, fw, eco } = hillWorld(people, [2]);
    banditsQuarter(fw, eco, npcs, hills, T, always);
    const [b] = bandsIn(fw);
    expect(b).toMatchObject({ kind: 'bandits', seat: 2, members: ['n1', 'n2', 'n3'], roads: [1, 2], counties: [], name: { key: 'faction.bandits.name', params: { place: 'Quận 2' } } });
    expect(people.map((n) => n.occupation)).toEqual(['bandit', 'bandit', 'bandit', 'farmer', 'farmer', template.occupation]);
    // Gia tộc, thương hội, cướp chưa cai quản quận: quan phủ vẫn giữ (cát cứ ở S5)
    expect(controlOf(fw, 4)).toEqual(['f1', 'f1', 'f1', 'f1']);
  });

  it('không năm khó, hay quận kề trị sở, hay thiếu người thì không nổi đảng', () => {
    const three = () => [poor('n1', 1), poor('n2', 1), poor('n3', 1)];
    for (const [people, hard] of [[three(), [1]], [three().map((n) => { n.character.home = 2; return n; }), []], [three().slice(0, 2).map((n) => { n.character.home = 2; return n; }), [2]]] as const) {
      const { npcs, fw, eco } = hillWorld([...people], [...hard]);
      banditsQuarter(fw, eco, npcs, hills, T, always);
      expect(bandsIn(fw)).toEqual([]);
    }
  });

  it('mỗi quý cướp kho, quỹ quận sào huyệt và quận kề (không quá 50‰ mỗi quận), chia hết lương, nửa tiền cho người trong đảng; sổ cái giữ', () => {
    const people = [poor('n1', 2), poor('n2', 2), poor('n3', 2)];
    const { npcs, fw, eco } = hillWorld(people, [2]);
    banditsQuarter(fw, eco, npcs, hills, T, always);
    const [b] = bandsIn(fw);
    const grain = () => eco.counties.reduce((s, c) => s + c.grain, 0) + b!.grain + people.reduce((s, n) => s + n.character.household.grain, 0);
    const money = () => countyMoney(eco) + factionMoney(fw) + people.reduce((s, n) => s + n.character.household.money, 0);
    const [g0, m0, lair] = [grain(), money(), eco.counties[2]!.grain];
    const purse = people[0]!.character.household.grain;
    banditsQuarter(fw, eco, npcs, hills, T + 9, never);
    expect([grain(), money()]).toEqual([g0, m0]);
    expect(eco.counties[2]!.grain).toBe(lair - Math.min(3 * BANDIT_GRAIN_PER_MEMBER, Math.floor((lair * BANDIT_RAID_PERMILLE) / 1000)));
    expect(people[0]!.character.household.grain).toBe(purse + BANDIT_GRAIN_PER_MEMBER);
    expect(eco.counties[0]!.grain).toBe(createEconomy(hills, 0).counties[0]!.grain);
  });
});

describe('băng cướp: tăng năm khó, tan năm thường', () => {
  it('năm khó dụ thêm người quanh sào huyệt; năm thường người bỏ về nghề cũ, dưới 3 người thì tan, kho về họ', () => {
    const people = [poor('n1', 2), poor('n2', 2), poor('n3', 2)];
    const { npcs, fw, eco } = hillWorld(people, [2]);
    banditsQuarter(fw, eco, npcs, hills, T, always);
    const [b] = bandsIn(fw);
    npcs.people.push(poor('n4', 3));
    banditsQuarter(fw, eco, npcs, hills, T + 9, always);
    expect(b!.members).toEqual(['n1', 'n2', 'n3', 'n4']);
    eco.counties[2]!.disaster = null;
    banditsQuarter(fw, eco, npcs, hills, T + 18, always);
    expect(b).toMatchObject({ ended: T + 18, members: [], roads: [], money: 0, grain: 0 });
    expect(npcs.people.map((n) => n.occupation)).toEqual(['farmer', 'farmer', 'farmer', 'farmer']);
  });

  it('người theo cướp mất hay bị gỡ nghề thì không còn trong đảng; dưới 3 người thì tan', () => {
    const people = [poor('n1', 2), poor('n2', 2), poor('n3', 2)];
    const { npcs, fw, eco } = hillWorld(people, [2]);
    banditsQuarter(fw, eco, npcs, hills, T, always);
    people[0]!.death = { tick: T, cause: 'accident', detail: 'x' };
    banditsQuarter(fw, eco, npcs, hills, T + 9, never);
    expect(bandsIn(fw)[0]!.ended).toBe(T + 9);
  });
});

// —— Quan phủ sống (v0.6 S5, Q7, Q8) ——
/** Rng giả theo hàng đợi: mỗi lần rút lấy số kế (0 = trúng, 1 = trượt), tính trong [lo, hi]; hết hàng thì trúng. */
function scripted(seq: number[]): Rng {
  // Thương vong trận (v0.7 S4) rút bằng `chance`: ở đây không ai bị thương
  return { int: (lo: number, hi: number) => (seq.shift() ?? 0) === 0 ? lo : hi, chance: () => false } as unknown as Rng;
}
function govWorld(people: NpcState[] = [], logic: RegionLogic = hills) {
  const npcs = newNpcWorld(1, regionId('r0'));
  npcs.people = people;
  const fw = newFactionWorld();
  const g = foundGovernment(fw, logic, 0);
  const eco = createEconomy(logic, 0);
  return { npcs, fw, g, eco };
}
const worker = (id: string, home: number, literacy = 0) => { const n = person(id, { home, age: 25 }); n.occupation = 'laborer'; n.character.skillXp.literacy = literacy; return n; };

describe('quan phủ: thuế dân nền, quan (v0.6 S5)', () => {
  it('đầu năm thu thêm thuế dân nền theo độ tham (7‰ thanh liêm nhất, 15‰ tham nhất) từ quận quan phủ giữ; quý khác không thu', () => {
    expect([baseTaxPermille(0), baseTaxPermille(50), baseTaxPermille(100)]).toEqual([7, 11, 15]);
    const { g, eco } = govWorld();
    g.greed = 100;
    g.counties = [0, 1];
    const before = eco.counties.map((c) => c.money);
    governmentTaxes(g, eco, T + 9);
    expect(eco.counties.map((c) => c.money)).toEqual(before);
    governmentTaxes(g, eco, T);
    expect(eco.counties.map((c) => c.money)).toEqual([before[0]! - Math.floor((before[0]! * 15) / 1000), before[1]! - Math.floor((before[1]! * 15) / 1000), before[2], before[3]]);
  });

  it('hết nhiệm kỳ thì thay quan: độ tham mới 0–100, nhiệm kỳ 6–12 năm; chưa hết thì giữ', () => {
    const { npcs, fw, g, eco } = govWorld();
    governmentRule(g, fw, eco, npcs, hills, T, scripted([1, 0]));
    expect([g.greed, g.termEnds]).toEqual([100, T + MAGISTRATE_TERM_YEARS[0] * 36]);
    governmentRule(g, fw, eco, npcs, hills, T + 9, scripted([0, 0]));
    expect(g.greed).toBe(100);
  });
});

describe('quan phủ: sai dịch, phát chẩn', () => {
  it('kho đủ thì tuyển sai dịch ở trị sở (người biết chữ trước), trả lương quý; kho cạn thì cho nghỉ', () => {
    const people = [worker('n1', 0, 100), worker('n2', 0, 900), worker('n3', 1)];
    const { npcs, fw, g, eco } = govWorld(people);
    g.money = 100_000;
    governmentRule(g, fw, eco, npcs, hills, T, scripted([0, 0]));
    // Giữ 4 quận: một người cho trị sở cộng một mỗi 3 quận = 2 người
    expect(g.members).toEqual(['n1', 'n2']);
    expect(g.leader).toBe('n2');
    expect(people.map((n) => n.occupation)).toEqual(['official', 'official', 'laborer']);
    expect(people[1]!.character.household.money).toBe(1_000 + OFFICIAL_WAGE);
    g.money = OFFICIAL_WAGE + 10;
    governmentRule(g, fw, eco, npcs, hills, T + 9, scripted([]));
    // Người kém nhất nghỉ trước (v0.7 S4)
    expect(g.members).toEqual(['n2']);
    expect(people[0]!.occupation).not.toBe('official');
  });

  it('quận đói kém được quan phủ mua lương ở quận rẻ nhất chở sang; tiền, lương không sinh không mất; quan càng tham chẩn càng ít', () => {
    const relief = (greed: number) => {
      const { npcs, fw, g, eco } = govWorld();
      g.money = 100_000; g.greed = greed; g.termEnds = T + 1_000;
      eco.counties[3]!.grain = 0;
      const [m, gr] = [countyMoney(eco) + g.money, eco.counties.reduce((s, c) => s + c.grain, 0) + g.grain];
      governmentRule(g, fw, eco, npcs, hills, T + 9, scripted([]));
      expect([countyMoney(eco) + g.money, eco.counties.reduce((s, c) => s + c.grain, 0) + g.grain]).toEqual([m, gr]);
      return eco.counties[3]!.grain;
    };
    const [honest, middling, greedy] = [relief(0), relief(50), relief(100)];
    expect(honest).toBeGreaterThan(middling);
    expect(middling).toBeGreaterThan(0);
    expect(greedy).toBe(0);
  });
});

describe('quan phủ: tiễu phỉ, cát cứ (Q8)', () => {
  function banditAndOfficials() {
    const officials = [worker('n1', 0, 500), worker('n2', 0, 400)];
    const robbers = [poor('n5', 2), poor('n6', 2), poor('n7', 2), poor('n8', 2)];
    const { npcs, fw, g, eco } = govWorld([...officials, ...robbers]);
    eco.counties[2]!.disaster = 'drought';
    banditsQuarter(fw, eco, npcs, hills, T, always);
    g.money = 100_000; g.termEnds = T + 1_000;
    return { npcs, fw, g, eco, b: bandsIn(fw)[0]!, robbers };
  }

  it('thắng thì bắt nửa đảng về nghề cũ, tịch thu kho cướp', () => {
    const { npcs, fw, g, eco, b, robbers } = banditAndOfficials();
    b.money = 777;
    const before = g.money;
    const report = governmentRule(g, fw, eco, npcs, hills, T + 9, scripted([0, 0]));
    expect(report).toMatchObject({ campaigns: 1, wins: 1 });
    expect(b.members).toHaveLength(2);
    expect(robbers.filter((n) => n.occupation === 'bandit')).toHaveLength(2);
    expect(b.money).toBe(0);
    expect(g.money).toBeGreaterThan(before - 2 * OFFICIAL_WAGE - 2 * CAMPAIGN_COST - 100_000);
  });

  it('thua thì mất một sai dịch; cướp thế gấp đôi thì chiếm quận sào huyệt, bản đồ đổi người giữ; thắng lại thì lấy về', () => {
    const { npcs, fw, g, eco, b } = banditAndOfficials();
    g.money = 2 * OFFICIAL_WAGE * 4; // ít kho: thế quan phủ nhỏ
    b.power = 10 * governmentForce({ ...g, members: ['n1', 'n2'] }, new Map(npcs.people.map((n) => [n.id, n])));
    governmentRule(g, fw, eco, npcs, hills, T + 9, scripted([0, 1]));
    expect(g.members).toHaveLength(1);
    expect(b.holds).toEqual([2]);
    expect(controlOf(fw, 4)).toEqual(['f1', 'f1', b.id, 'f1']);
    expect(g.counties).toEqual([0, 1, 3]);
    governmentRule(g, fw, eco, npcs, hills, T + 18, scripted([0, 0]));
    expect(b.holds).toEqual([]);
    expect(controlOf(fw, 4)).toEqual(['f1', 'f1', 'f1', 'f1']);
  });

  it('quan tham nhất không đi tiễu', () => {
    const { npcs, fw, g, eco } = banditAndOfficials();
    g.greed = 100;
    expect(governmentRule(g, fw, eco, npcs, hills, T + 9, scripted([0, 0])).campaigns).toBe(0);
  });

  it('gia tộc đứng đầu quận vượt hẳn sức quan phủ thì cát cứ; uy thế tụt dưới nửa ngưỡng thì quan phủ lấy lại', () => {
    const { npcs, fw, g, eco } = govWorld(lineage());
    clansQuarter(fw, npcs, hills, T);
    const [c] = clansIn(fw);
    const threshold = CLAN_REVOLT_MULT * governmentAuthority(g, new Map());
    c!.power = threshold + 1;
    governmentRule(g, fw, eco, npcs, hills, T, scripted([]));
    expect(c!.holds).toEqual([0]);
    expect(controlOf(fw, 4)[0]).toBe(c!.id);
    expect(g.counties).toEqual([1, 2, 3]);
    c!.power = Math.floor(threshold / 2) - 1;
    governmentRule(g, fw, eco, npcs, hills, T + 9, scripted([]));
    expect(c!.holds).toEqual([]);
    expect(g.counties).toEqual([0, 1, 2, 3]);
  });
});

describe('quan phủ và cướp: nguyên nhân (Q12)', () => {
  it('quan tham thì dân dễ nổi cướp hơn: cùng lần rút, quan thanh liêm không nổi đảng, quan tham nổi', () => {
    const roll = BANDIT_FOUND_PERMILLE + 10; // trượt với quan thanh liêm, trúng khi xác suất × (100 + độ tham)%
    const at = { int: (lo: number, hi: number) => (hi === 999 ? roll : lo) } as unknown as Rng;
    for (const [greed, bands] of [[0, 0], [100, 1]] as const) {
      const { npcs, fw, eco, g } = govWorld([poor('n1', 2), poor('n2', 2), poor('n3', 2)]);
      g.greed = greed;
      eco.counties[2]!.disaster = 'drought';
      banditsQuarter(fw, eco, npcs, hills, T, at);
      expect(bandsIn(fw)).toHaveLength(bands);
    }
  });

  it('họ đứng đầu quận giữ làng: đọ thắng thì cướp không lấy được gì ở quận ấy, đảng mất một người', () => {
    const robbers = [poor('n5', 2), poor('n6', 2), poor('n7', 2), poor('n8', 2)];
    const clan = otherLine('Trần', ['n11', 'n12', 'n13', 'n14', 'n15'], { home: 1, land: 20 });
    const { npcs, fw, eco } = govWorld([...robbers, ...clan]);
    eco.counties[2]!.disaster = 'drought';
    banditsQuarter(fw, eco, npcs, hills, T, always);
    clansQuarter(fw, npcs, hills, T);
    const b = bandsIn(fw)[0]!;
    eco.counties[2]!.grain = 0; eco.counties[2]!.money = 0; eco.counties[3]!.grain = 0; eco.counties[3]!.money = 0;
    const village = eco.counties[1]!.grain;
    banditsQuarter(fw, eco, npcs, hills, T + 9, always);
    expect(eco.counties[1]!.grain).toBe(village);
    expect(b.members).toHaveLength(3);
  });
});

// —— Tác động lên người chơi và NPC (v0.6 S6, Q10) ——
function faction(fw: FactionWorldState, kind: FactionState['kind'], seat: number, o: Partial<FactionState> = {}): FactionState {
  const f: FactionState = {
    id: `f${fw.nextId++}`, kind, name: { key: `faction.${kind}.name`, params: { place: `Quận ${seat}` } }, seat, counties: [], holds: [], roads: [], members: [], leader: null,
    power: 0, losses: 0, greed: 0, termEnds: 0, relations: [], money: 0, grain: 0, founded: 0, ended: null, ...o,
  };
  fw.list.push(f);
  return f;
}
const stub = { get: () => always };
const silent = () => {};

describe('thuế theo quan phủ (v0.6 S6, Q7)', () => {
  it('quan phủ đặt mức thuế 50 + độ tham ở quận mình giữ; quận cát cứ giữ lệ cũ; pha Thế lực đặt mỗi quý', () => {
    const { g, eco, fw, npcs } = govWorld();
    g.counties = [0, 1, 2];
    for (const [greed, pct] of [[0, 50], [50, 100], [100, 150]] as const) {
      g.greed = greed;
      setTaxRates(g, eco);
      expect(eco.counties.map((c) => c.taxPct)).toEqual([pct, pct, pct, 100]);
    }
    expect(taxPctOf(17)).toBe(67);
    // Quan đầu tiên rút độ tham 0 (rng luôn trúng): quý sau mọi quận thuế nhẹ nhất
    factionPhase(fw, eco, npcs, hills, T, always);
    expect([g.greed, eco.counties.map((c) => c.taxPct)]).toEqual([0, [50, 50, 50, 50]]);
  });

  it('thuế đinh 100–300 văn theo mức thuế (thiếu thì ghi nợ đúng mức); thuế điền 7,5–12,5% quanh lệ 10%', () => {
    const eco = createEconomy(hills, 0);
    const c = structuredClone(template.character);
    c.birthTick = 0;
    Object.assign(c.household, { independent: true, money: 1_000, taxDebt: 0 });
    eco.counties[0]!.taxPct = 150;
    expect([headTaxOf(eco.counties[0]!), headTax(c, eco.counties[0]!, 20 * 36), c.household.money, eco.counties[0]!.taxMoney]).toEqual([300, 300, 700, 300]);
    eco.counties[0]!.taxPct = 50;
    expect(headTaxOf(eco.counties[0]!)).toBe(100);
    c.household.money = 40;
    expect([headTax(c, eco.counties[0]!, 21 * 36), c.household.taxDebt]).toEqual([40, 60]);
    expect([50, 100, 150].map((taxPct) => landTax(1_000, { ...eco.counties[0]!, taxPct }))).toEqual([75, 100, 125]);
  });
});

describe('rủi ro đường theo cướp, thương hội (S6, Q5, Q6)', () => {
  it('đường cướp giữ ×2, đường thương hội giữ ×0,75, cướp đè thương hội; lộ trình lấy chặng nguy nhất theo địa hình × người giữ', () => {
    const fw = newFactionWorld();
    faction(fw, 'guild', 0, { roads: [0, 1] });
    const b = faction(fw, 'bandits', 3, { roads: [2] });
    const roads = roadRisk(fw, 3);
    expect(roads).toEqual([GUILD_ROAD_PCT, GUILD_ROAD_PCT, BANDIT_ROAD_PCT]);
    expect(routeRiskPct(hills, [0, 1, 2], roads)).toBe(GUILD_ROAD_PCT);
    expect(routeRiskPct(hills, [0, 1, 2], null)).toBe(100);
    expect(routeRiskPct(hills, [1, 2, 3], roads)).toBe(400); // núi 200% × cướp 200%
    expect([routeDanger(fw, hills, [0, 1, 2]), routeDanger(fw, hills, [2, 3])]).toEqual([null, b.id]);
    expect(previewTravel(hills, 0, 1, roads)!.risk).toBe('risk.low');
    expect(previewTravel(hills, 0, 1, roadRisk(newFactionWorld(), 3))!.risk).toBe('risk.low');
    const bandit = roadRisk(newFactionWorld(), 3);
    bandit[0] = BANDIT_ROAD_PCT;
    expect(previewTravel(hills, 0, 1, bandit)!.risk).toBe('risk.high');
  });

  it('ô đi đường qua đường cướp giữ: rủi ro thân thể gấp đôi; đường thương hội bớt một phần tư', () => {
    const preview = previewTravel(hills, 0, 1)!;
    const travel = actionDef('action.travel')!;
    const ppm = (roads: number[] | null) => {
      const c = structuredClone(template.character);
      c.household.money = 1_000;
      return slotEffects(travel, preview, c, T, hills, createEconomy(hills, 0).counties[0]!, stub, silent, null, roads).ppm;
    };
    const base = ppm(null);
    expect(base).toBeGreaterThan(0);
    expect(ppm([BANDIT_ROAD_PCT, 100, 100])).toBe(2 * base);
    expect(ppm([GUILD_ROAD_PCT, 100, 100])).toBeLessThan(base);
  });

  it('người chơi thấy đường có cướp (TravelOption.danger, rủi ro cao)', () => {
    const s = Life.create({ worldSeed: 'danger', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
    const b = faction(s.factions, 'bandits', 1, { roads: [1], members: [], founded: s.tick });
    const l = Life.restore(s, [], region);
    expect(l.travel().map((o) => [o.county, o.risk, o.danger ?? null])).toEqual([[1, 'risk.low', null], [2, 'risk.high', b.id]]);
    expect(l.previewTravel(2)!.risk).toBe('risk.high');
  });
});

describe('an ninh: sự kiện theo cướp gần (S6, Q10)', () => {
  function ctxAt(fw: FactionWorldState, active: boolean) {
    const c = structuredClone(template.character);
    c.birthTick = 0; c.location = 0; c.household.grain = 1_000;
    const player = { plan: null, active: active ? { slot: { action: 'action.travel', target: 1 }, remaining: 1, total: 1, preview: previewTravel(hills, 0, 1) } : null, planWarned: false };
    return makeContext(c, newEventsState(), player, createEconomy(hills, 0), hills, 20 * 36, newNpcWorld(), [], [], fw);
  }

  it('cướp đường: đường cướp giữ gấp đôi, đường thương hội giữ còn ba phần tư', () => {
    const plain = newFactionWorld(), robbed = newFactionWorld(), guarded = newFactionWorld();
    faction(robbed, 'bandits', 1, { roads: [0, 1] });
    faction(guarded, 'guild', 0, { roads: [0] });
    expect([plain, robbed, guarded].map((fw) => highwayRobbers.weight(ctxAt(fw, true)))).toEqual([20_000, 40_000, 15_000]);
    expect(highwayRobbers.weight(ctxAt(robbed, false))).toBe(0);
  });

  it('mất trộm: ở sào huyệt hay quận kề sào huyệt thì gấp ba; xa hơn thì như cũ; băng đã tan thì thôi', () => {
    const near = newFactionWorld(), far = newFactionWorld(), gone = newFactionWorld();
    faction(near, 'bandits', 1, { roads: [0, 1] });
    faction(far, 'bandits', 3, { roads: [2] });
    faction(gone, 'bandits', 1, { roads: [0, 1], ended: 0 });
    expect([newFactionWorld(), near, far, gone].map((fw) => granaryTheft.weight(ctxAt(fw, false)))).toEqual([8_000, 8_000 * BANDIT_NEAR_THEFT_PCT / 100, 8_000, 8_000]);
    expect([0, 1, 2, 3].map((c) => banditsNear(far, hills, c))).toEqual([false, false, true, true]);
  });
});

describe('việc làm theo thương hội (S6, Q10)', () => {
  it('trấn có thương hội đủ kho: lương làm thuê 125%, quỹ quận ứng phần thêm, đầu quý thương hội hoàn lại; tiền không sinh không mất', () => {
    const members = ['n1', 'n2', 'n3'].map((id) => merchant(id, 1));
    const { npcs, fw, eco } = market(members);
    guildsQuarter(fw, eco, npcs, trade, T);
    // Mới lập, kho góp 3.000 dưới mức giữ lại: chưa thuê thêm
    expect(eco.counties[1]!.wagePct).toBe(100);
    const [g] = fw.list.filter((f) => f.kind === 'guild');
    g!.money = 10_000;
    guildsQuarter(fw, eco, npcs, trade, T + 9);
    expect(eco.counties.map((c) => c.wagePct)).toEqual([100, GUILD_WAGE_PCT, 100]);
    expect([wageOf(eco.counties[1]!), wageOf(eco.counties[0]!)]).toEqual([HIRE_WAGE * GUILD_WAGE_PCT / 100, HIRE_WAGE]);
    const c = structuredClone(template.character);
    c.household.money = 0; c.skillXp.crafting = 0;
    const total = () => countyMoney(eco) + factionMoney(fw) + members.reduce((s, n) => s + n.character.household.money, 0) + c.household.money;
    const before = total();
    settleAction('action.hire', c, T + 10, eco.counties[1]!, always);
    expect([c.household.money, eco.counties[1]!.wageBonus]).toEqual([75, 15]);
    const seat = eco.counties[1]!.money;
    guildsQuarter(fw, eco, npcs, trade, T + 18);
    expect(eco.counties[1]!.money).toBe(seat + GUILD_UPKEEP + 15);
    expect(total()).toBe(before);
    // Quỹ quận không đủ lương thì không có việc
    eco.counties[1]!.money = wageOf(eco.counties[1]!) - 1;
    expect(moneyLock('action.hire', c, eco.counties[1]!)).toBe('lock.no_work');
  });
});

describe('tin đồn thế lực (S6, Q10)', () => {
  it('quận kề đổi người giữ, quan mới về: tin đồn nghe sau một tháng; quận không kề thì không nghe', () => {
    const l0 = Life.create({ worldSeed: 'rumor-f', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region);
    for (let i = 0; i < 12 || !isQuarterStart(l0.tick); i++) autoAdvance(l0, 'week', lastChoice);
    const s = l0.snapshot();
    const gov = s.factions.list.find((f) => f.kind === 'government')!;
    gov.termEnds = s.tick; // hết nhiệm kỳ đúng quý này
    gov.counties = [0];
    // Hai họ cát cứ quận 1 (kề) và quận 2 (không kề); không còn ai nên tàn ngay quý này, quan phủ lấy lại
    faction(s.factions, 'clan', 1, { counties: [1], holds: [1], founded: s.tick - 36 });
    faction(s.factions, 'clan', 2, { counties: [2], holds: [2], founded: s.tick - 36 });
    const l = Life.restore(s, [], region);
    expect(l.control()).not.toEqual(['f1', 'f1', 'f1']);
    autoAdvance(l, 'week', lastChoice);
    expect(l.control()).toEqual(['f1', 'f1', 'f1']);
    expect(l.snapshot().rumors.map((r) => [r.key, r.params.county ?? r.params.temper, r.tick])).toEqual([
      ['log.rumor.retaken', 'Quận 1', s.tick + 3],
      ['log.rumor.magistrate', expect.stringMatching(/^rumor\.magistrate\./), s.tick + 3],
    ]);
    while (l.tick <= s.tick + 3) autoAdvance(l, 'week', lastChoice);
    expect(l.log.filter((e) => e.key.startsWith('log.rumor.')).map((e) => [e.key, e.importance])).toEqual([['log.rumor.retaken', 'minor'], ['log.rumor.magistrate', 'minor']]);
  });

  it('băng cướp mới tụ, cướp hay họ lớn chiếm quận kề thì có tin; quận không kề, băng cũ thì không; quan đầu tiên lúc dựng vùng không thành tin', () => {
    const { fw, g } = govWorld();
    const old = faction(fw, 'bandits', 2, { roads: [1, 2] });
    const mark = factionMark(fw, 4);
    expect(mark.termEnds).toBeNull();
    const fresh = faction(fw, 'bandits', 1, { roads: [0, 1] });
    faction(fw, 'bandits', 3, { roads: [2] });
    fresh.holds = [1];
    old.holds = [2];
    g.termEnds = T + 360; g.greed = 80; // quan đầu tiên nhậm chức
    const news = (here: number) => factionRumors(fw, hills, mark, here, T).map((e) => [e.key, e.params.county ?? e.params.temper, e.tick]);
    expect(news(0)).toEqual([['log.rumor.bandits', 'Quận 1', T + 3], ['log.rumor.seized_bandits', 'Quận 1', T + 3]]);
    expect(news(1)).toEqual([['log.rumor.seized_bandits', 'Quận 2', T + 3]]);
    // Quan đổi lần sau thì cả vùng nghe, kèm lời đồn độ tham; họ lớn cát cứ quận kề
    const again = factionMark(fw, 4);
    g.termEnds = T + 720;
    old.holds = [];
    const clan = faction(fw, 'clan', 2, { counties: [2], holds: [2] });
    expect(factionRumors(fw, hills, again, 3, T + 9).map((e) => [e.key, e.params.county ?? e.params.temper])).toEqual([['log.rumor.seized_clan', 'Quận 2'], ['log.rumor.magistrate', 'rumor.magistrate.greedy']]);
    expect(clan.id).toBe(controlOf(fw, 4)[2]);
  });
});

describe('tin thế sự ở quận đang đứng (v0.6 F3)', () => {
  it('băng cướp tụ ở đây, quận bị cướp chiếm là việc lớn; họ lớn tàn, tiễu phỉ ở quận kề là việc thường; quận khác không có tin', async () => {
    const { t } = await import('@tsvl/content');
    const { fw, g } = govWorld();
    const clan = faction(fw, 'clan', 2, { name: { key: 'faction.clan.name', params: { surname: 'Đỗ', place: 'Quận 2' } }, counties: [2] });
    const mark = factionMark(fw, 4);
    const band = faction(fw, 'bandits', 2, { roads: [1, 2], holds: [2] });
    clan.ended = T;
    g.counties = [0, 1, 3];
    const report = { campaigns: 1, wins: 1, reliefGrain: 0, battles: [{ band: band.id, seat: 3, won: true }] };
    const news = factionNews(fw, hills, mark, 2, report);
    expect(news.map((e) => [e.key, e.importance])).toEqual([
      ['log.faction.clan_ended', 'minor'], ['log.faction.bandits_founded', 'major'], ['log.faction.seized_bandits', 'major'], ['log.faction.campaign_won', 'minor'],
    ]);
    for (const e of news) expect(t(e.key, e.params), e.key).not.toMatch(/⟨|\{\w+\}/);
    expect(t(news[0]!.key, news[0]!.params)).toContain('Đỗ');
    // Quận 0 không kề quận 2, 3: không có tin
    expect(factionNews(fw, hills, mark, 0, report)).toEqual([]);
  });

  it('báo cáo quan phủ ghi từng trận tiễu phỉ: băng nào, sào huyệt ở đâu, thắng hay thua', () => {
    const { npcs, fw, g, eco, b } = (() => {
      const officials = [worker('n1', 0, 500), worker('n2', 0, 400)];
      const robbers = [poor('n5', 2), poor('n6', 2), poor('n7', 2), poor('n8', 2)];
      const w = govWorld([...officials, ...robbers]);
      w.eco.counties[2]!.disaster = 'drought';
      banditsQuarter(w.fw, w.eco, w.npcs, hills, T, always);
      w.g.money = 100_000; w.g.termEnds = T + 1_000;
      return { ...w, b: bandsIn(w.fw)[0]! };
    })();
    const report = governmentRule(g, fw, eco, npcs, hills, T + 9, scripted([0, 0]));
    expect(report.battles).toEqual([{ band: b.id, seat: 2, won: true }]);
  });
});

describe('thế sự một đời (v0.6 F4)', () => {
  it('ghi thế lực đặt chân ở quận đang đứng (quan phủ luôn thấy); thế lực đã thấy thì theo tới khi tan, dù ở đâu', () => {
    const { fw, g } = govWorld();
    const here = faction(fw, 'bandits', 1, { members: ['n1', 'n2', 'n3'] });
    const far = faction(fw, 'guild', 3, { power: 5_000 });
    const seen: FactionSeen[] = [];
    trackSeen(seen, fw, hills, 1);
    expect(seen.map((x) => [x.id, x.first])).toEqual([[g.id, 4], [here.id, 3]]);
    // Đi xa: băng cướp đã thấy vẫn được theo; thương hội ở quận khác thì chưa thấy
    here.members = ['n1', 'n2', 'n3', 'n4', 'n5'];
    g.counties = [0, 1];
    trackSeen(seen, fw, hills, 0);
    expect(seen.map((x) => [x.id, x.last, x.ended])).toEqual([[g.id, 2, false], [here.id, 5, false]]);
    expect(seen.some((x) => x.id === far.id)).toBe(false);
    here.ended = T;
    trackSeen(seen, fw, hills, 0);
    fw.list = fw.list.filter((f) => f.id !== here.id);
    trackSeen(seen, fw, hills, 0);
    expect(legacyFactions(seen).map((x) => [x.kind, x.fate])).toEqual([['government', 'fell'], ['bandits', 'gone']]);
  });

  it('số phận: tan thì tan rã; lên gấp rưỡi thì thịnh; còn hai phần ba trở xuống thì suy; còn lại vẫn đứng', () => {
    const at = (first: number, last: number, ended = false): FactionSeen => ({ id: 'f2', kind: 'clan', name: { key: 'faction.clan.name', params: {} }, first, last, ended });
    expect([at(10, 15), at(10, 14), at(9, 6), at(9, 7), at(10, 30, true), at(0, 1), at(0, 0)].map(fateOf)).toEqual(['rose', 'endured', 'fell', 'endured', 'gone', 'rose', 'endured']);
  });

  it('tổng kết đời có thế sự một đời, đúng hợp đồng; lưu tải giữ danh sách đã thấy', () => {
    const l = Life.create({ worldSeed: 'seen', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region);
    for (let i = 0; i < 40; i++) autoAdvance(l, 'week', lastChoice);
    const snap = JSON.parse(JSON.stringify(l.snapshot()));
    expect(vLifeSnapshot.check(snap, '$')).toBeNull();
    expect(snap.factionsSeen.map((x: FactionSeen) => x.kind)).toContain('government');
    l.runToDeath();
    const legacy = l.summary().legacy.factions;
    expect(legacy[0]).toMatchObject({ kind: 'government', name: { key: 'faction.government.name' } });
    expect(vLifeSummary.check(l.summary(), '$')).toBeNull();
  });
});
