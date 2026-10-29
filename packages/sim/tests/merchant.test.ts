// v0.7 S3: thương nhân — đi buôn chuyến chở lương ăn chênh giá, rủi ro vốn trên đường; hội viên thương hội (ADR 0020 Q4).
import { birthplaceId, regionId, type CareerRank, type MonthPlan } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { Life, Rng } from '../src/index';
import { autoAdvance, lastChoice, pastComingOfAge } from './auto';
import {
  CARAVAN_CUT_PCT, guildOf, HAUL_CAPITAL, HAUL_MISHAP_PPM, HAUL_ROBBED_PPM, haulLock, haulMargin, haulTrip, joinGuild, joinGuildLock, routeTransport,
  type GuildJoinWorld, type HaulWorld,
} from '../src/life/merchant';
import { createEconomy, type EconomyState } from '../src/economy/market';
import { GUILD_DUES, GUILD_RESERVE_QUARTERS, GUILD_UPKEEP, guildsQuarter } from '../src/factions/guilds';
import type { FactionState, FactionWorldState } from '../src/factions/state';
import { previewTravel } from '../src/life/travel';
import type { CareerState } from '../src/life/career';
import type { LifeSnapshot } from '../src/life/life';
import { vLifeSnapshot } from '../src/life/validate';
import { ensureBond } from '../src/social/bonds';

/** Quận 0 làng (lương rẻ), quận 1 trấn (lương đắt), kề nhau 60 km. */
const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const bp = { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const route = [0, 1];
const career = (rank: CareerRank, faction: string | null = null): CareerState => ({ id: 'merchant', rank, since: 0, faction, mentor: null, years: 0, weeks: 0, idle: 0 });
const always = { chance: () => true } as unknown as Rng;
const never = { chance: () => false } as unknown as Rng;
const noLog = () => {};

/** Người chơi 25 tuổi đã ra riêng, nhiều tiền; giá lương làng 30, trấn 60 văn/đấu. */
function adult(): LifeSnapshot {
  const s = Life.create({ worldSeed: 'merchant', regionId: regionId('r0'), birthplaceId: bp.id }, bp, region).snapshot();
  // Tuần giữa tháng: giá đặt tay giữ tới đầu tháng sau
  s.character.birthTick = 0; s.tick = 25 * 36 + 10;
  s.character.health = s.character.healthMax = 1000; s.character.stamina = 900; s.character.conditions = [];
  Object.assign(s.character.household, { independent: true, money: 20_000, grain: 500 });
  priced(s.economy);
  return pastComingOfAge(s);
}
function priced(eco: EconomyState): void {
  eco.counties[0]!.price = 30; eco.counties[1]!.price = 60;
  eco.counties[0]!.grain = 100_000; eco.counties[1]!.money = 1_000_000;
}
function guild(id = 'f9', members: string[] = []): FactionState {
  return { id, kind: 'guild', name: { key: 'faction.guild.name', params: { place: 'Quận 1' } }, seat: 1, counties: [1], holds: [], roads: [], members, leader: null, power: 0, losses: 0, greed: 0, termEnds: 0, relations: [], money: 0, grain: 0, founded: 0, ended: null };
}
const preview = () => previewTravel(region, 0, 1)!;
const world = (s: LifeSnapshot, k: CareerState | null, rng: Rng): HaulWorld => ({ eco: s.economy, logic: region, factions: s.factions, roads: null, career: k, rng });
const money = (s: LifeSnapshot) => s.character.household.money + s.economy.counties.reduce((x, ce) => x + ce.money, 0) + s.factions.list.reduce((x, f) => x + f.money, 0);

describe('đi buôn chuyến (v0.7 S3)', () => {
  it('lời mỗi đấu = giá nơi bán − nơi mua − phí chở; không lời hay thiếu vốn thì không đi', () => {
    const s = adult();
    expect(routeTransport(region, route)).toBe(3);
    expect(haulMargin(s.economy, region, route)).toBe(27);
    expect(haulLock(s.character, s.economy, route, region)).toBeNull();
    s.economy.counties[1]!.price = 33;
    expect(haulLock(s.character, s.economy, route, region)).toBe('lock.no_profit');
    s.economy.counties[1]!.price = 60; s.character.household.money = 100;
    expect(haulLock(s.character, s.economy, route, region)).toBe('lock.money');
  });

  it('lương đi đúng dòng (kho làng → kho trấn); lời khớp chênh giá trừ phí chở; sổ cái giữ', () => {
    const s = adult();
    const before = money(s), purse = s.character.household.money, g0 = s.economy.counties[0]!.grain, g1 = s.economy.counties[1]!.grain;
    const r = haulTrip(s.character, preview(), world(s, career('apprentice'), never), noLog);
    // Vốn học việc 1.000 văn, mỗi đấu tốn 30 + 3 phí chở
    expect(r.grain).toBe(Math.floor((HAUL_CAPITAL[0] * 10) / 33));
    expect(s.economy.counties[0]!.grain).toBe(g0 - r.grain);
    expect(s.economy.counties[1]!.grain).toBe(g1 + r.grain);
    expect(s.character.household.money - purse).toBe(Math.floor((r.grain * 60) / 10) - Math.floor((r.grain * 33) / 10));
    expect(money(s)).toBe(before);
  });

  it('bậc cao bỏ vốn lớn hơn (1.000 / 3.000 / 10.000 văn): lời to hơn', () => {
    const profit = (rank: CareerRank) => { const s = adult(), p = s.character.household.money; haulTrip(s.character, preview(), world(s, career(rank), never), noLog); return s.character.household.money - p; };
    expect(profit('journeyman')).toBeGreaterThan(profit('apprentice'));
    expect(profit('master')).toBeGreaterThan(profit('journeyman'));
  });

  it('đường cướp giữ: rủi ro 25%, mất cả hàng vào kho băng cướp; đường sạch: 3% theo địa hình, hỏng nửa hàng', () => {
    const s = adult();
    const band = { ...guild('f7'), kind: 'bandits' as const, roads: [0] };
    s.factions.list.push(band);
    const seen: number[] = [];
    const rob = { chance: (p: number) => { seen.push(p); return true; } } as unknown as Rng;
    const before = money(s), purse = s.character.household.money;
    const r = haulTrip(s.character, preview(), world(s, career('master'), rob), noLog);
    expect(seen).toEqual([HAUL_ROBBED_PPM]);
    expect(r).toMatchObject({ loss: 'robbed', revenue: 0 });
    expect(band.grain).toBe(r.grain);
    expect(s.character.household.money).toBe(purse - r.cost);
    expect(money(s)).toBe(before);
    // Đường sạch: hỏng nửa hàng
    const t = adult();
    const seen2: number[] = [];
    const spoil = { chance: (p: number) => { seen2.push(p); return true; } } as unknown as Rng;
    const r2 = haulTrip(t.character, preview(), world(t, career('master'), spoil), noLog);
    expect(seen2).toEqual([HAUL_MISHAP_PPM]);
    expect(r2.loss).toBe('spoiled');
    expect(r2.revenue).toBe(Math.floor(((r2.grain - Math.floor(r2.grain / 2)) * 60) / 10));
  });

  it('hội viên theo đoàn: rủi ro một nửa, nộp 25% phần lời vào kho hội', () => {
    const s = adult();
    const g = guild();
    s.factions.list.push(g);
    const seen: number[] = [];
    const rng = { chance: (p: number) => { seen.push(p); return false; } } as unknown as Rng;
    const before = money(s);
    const r = haulTrip(s.character, preview(), world(s, career('journeyman', g.id), rng), noLog);
    expect(seen).toEqual([HAUL_MISHAP_PPM / 2]);
    expect(r.cut).toBe(Math.floor(((r.revenue - r.cost) * CARAVAN_CUT_PCT) / 100));
    expect(g.money).toBe(r.cut);
    expect(money(s)).toBe(before);
  });

  it('trong kế hoạch: chuyến đi về gấp đôi đường, không đổi nơi ở; lời vào túi; lưu/tải giữa chuyến cùng digest', () => {
    const s = adult();
    s.career = career('journeyman');
    const l = Life.restore(s, [], region);
    const total = l.totalMoney(), purse = l.character.household.money;
    const haul = { action: 'action.haul', target: 1 };
    const plan: MonthPlan = { slots: [haul, haul, haul] };
    expect(l.setPlan(plan)).toBe(true);
    autoAdvance(l, 'week', lastChoice);
    expect(l.active).toMatchObject({ remaining: 1, total: 2 });
    expect(l.log.some((e) => e.key === 'log.haul.profit')).toBe(true);
    expect(l.character.household.money).toBeGreaterThan(purse);
    const mid = Life.restore(JSON.parse(JSON.stringify(l.snapshot())), [], region);
    expect(vLifeSnapshot.check(JSON.parse(JSON.stringify(l.snapshot())), '$')).toBeNull();
    autoAdvance(l, 'week', lastChoice); autoAdvance(mid, 'week', lastChoice);
    expect(l.active).toBeNull();
    expect(l.character.location).toBe(0);
    expect(mid.digest()).toBe(l.digest());
    expect(l.totalMoney()).toBe(total);
  });

  it('người không làm nghề buôn không đi buôn chuyến được', () => {
    const l = Life.restore(adult(), [], region);
    expect(l.actions().find((a) => a.id === 'action.haul')!.locked).toBe('lock.career');
  });
});

describe('hội viên thương hội (v0.7 S3)', () => {
  function setup() {
    const s = adult();
    const sponsor = s.npcs.people.find((n) => !n.death && n.character.household.independent && n.id !== s.character.kin.father && n.id !== s.character.kin.mother)!;
    sponsor.character.location = 0;
    const g = guild('f9', [sponsor.id]);
    s.factions.list.push(g);
    const w = (k: CareerState | null, rng: Rng = always): GuildJoinWorld => ({ npcs: s.npcs, bonds: s.bonds, factions: s.factions, reputation: s.reputation, career: k, tick: s.tick, rng });
    return { s, sponsor, g, w };
  }

  it('khóa: thương nhân từ bậc làm được, người bảo lãnh là hội viên, đã quen, đủ vốn góp', () => {
    const { s, sponsor, g, w } = setup();
    const slot = { action: 'action.join_guild', person: sponsor.id };
    expect(joinGuildLock(slot, s.character, w(null))).toBe('lock.career');
    expect(joinGuildLock(slot, s.character, w(career('apprentice')))).toBe('lock.career');
    expect(joinGuildLock(slot, s.character, w(career('journeyman')))).toBe('lock.stranger');
    ensureBond(s.bonds, sponsor.id).closeness = 30;
    expect(joinGuildLock(slot, s.character, w(career('journeyman')))).toBeNull();
    s.character.household.money = GUILD_DUES - 1;
    expect(joinGuildLock(slot, s.character, w(career('journeyman')))).toBe('lock.money');
    expect(joinGuildLock(slot, s.character, w(career('journeyman', g.id)))).toBe('lock.member');
    g.members = [];
    expect(joinGuildLock(slot, s.character, w(career('journeyman')))).toBe('lock.not_guild');
  });

  it('được nhận: góp vốn vào kho hội, thân phận nghề ghi hội; bị từ chối: thân thiết −2', () => {
    const { s, sponsor, g, w } = setup();
    ensureBond(s.bonds, sponsor.id).closeness = 30;
    const k = career('journeyman');
    joinGuild({ action: 'action.join_guild', person: sponsor.id }, s.character, w(k), noLog);
    expect(k.faction).toBe(g.id);
    expect(g.money).toBe(GUILD_DUES);
    expect(s.character.household.money).toBe(20_000 - GUILD_DUES);
    const k2 = career('journeyman');
    joinGuild({ action: 'action.join_guild', person: sponsor.id }, s.character, w(k2, never), noLog);
    expect(k2.faction).toBeNull();
    expect(s.bonds.find((b) => b.id === sponsor.id)!.closeness).toBe(28);
  });

  it('chia lãi theo quý như hội viên NPC; hội tan thì nhận phần chia, thân phận nghề không còn hội', () => {
    const { s, sponsor, g } = setup();
    const other = s.npcs.people.find((n) => !n.death && n.id !== sponsor.id && n.character.household.independent)!;
    // Chỉ hai thương nhân NPC ở trị sở hội
    for (const n of s.npcs.people) if (n.occupation === 'merchant') n.occupation = 'farmer';
    for (const n of [sponsor, other]) { n.occupation = 'merchant'; n.character.home = 1; }
    g.members = [sponsor.id, other.id];
    const reserve = GUILD_RESERVE_QUARTERS * GUILD_UPKEEP;
    g.money = reserve + GUILD_UPKEEP + 3_000;
    const fw: FactionWorldState = s.factions;
    const purse = s.character.household.money;
    guildsQuarter(fw, s.economy, s.npcs, region, s.tick, { household: s.character.household, guild: g.id });
    // Phí hội quán trước, rồi nửa phần vượt chia đều ba người (hai NPC, người chơi)
    expect(s.character.household.money - purse).toBe(Math.floor(1_500 / 3));
    expect(guildOf(fw, career('journeyman', g.id))).toBe(g);
    // Còn một hội viên NPC thì tan: kho chia cho hội viên còn lại, kể cả người chơi
    other.occupation = 'farmer';
    const left = s.character.household.money, kho = g.money;
    guildsQuarter(fw, s.economy, s.npcs, region, s.tick + 9, { household: s.character.household, guild: g.id });
    expect(g.ended).not.toBeNull();
    expect(s.character.household.money - left).toBe(Math.floor((kho - GUILD_UPKEEP) / 2));
    expect(guildOf(fw, career('journeyman', g.id))).toBeNull();
  });
});

describe('bảng chuyến buôn trên giao diện (v0.7 F3b)', () => {
  it('thương nhân: mỗi quận đích × mỗi hàng; số ô đi về; lời mỗi đấu như luật; lời cả chuyến khớp chuyến thật khi đường êm; khóa như lúc khởi hành', () => {
    const s = adult();
    s.career = career('journeyman');
    const l = Life.restore(s, [], region);
    const hauls = l.hauls();
    expect(hauls.map((h) => `${h.county}/${h.cargo}`)).toEqual(['1/grain', '1/hide', '1/wares', '1/herb']);
    const grain = hauls[0]!;
    expect(grain).toMatchObject({ slots: preview().slots * 2, margin: haulMargin(s.economy, region, route), locked: null });
    // Chuyến thật, đường êm: lời đúng bằng số ước
    const x = JSON.parse(JSON.stringify(s)) as LifeSnapshot;
    const res = haulTrip(x.character, preview(), world(x, x.career, never), noLog);
    expect(grain.profit).toBe(res.revenue - res.cost);
    expect(grain.profit).toBeGreaterThan(0);
    for (const h of hauls.slice(1)) expect(h.locked).toBe(h.margin > 0 ? null : 'lock.no_profit');
    // Hết vốn: khóa tiền; không phải thương nhân: không có bảng
    const poor = JSON.parse(JSON.stringify(s)) as LifeSnapshot;
    poor.character.household.money = 100;
    expect(Life.restore(poor, [], region).hauls()[0]!.locked).toBe('lock.money');
    const farmer = JSON.parse(JSON.stringify(s)) as LifeSnapshot;
    farmer.career = { ...career('master'), id: 'farmer' };
    expect(Life.restore(farmer, [], region).hauls()).toEqual([]);
  });
});
