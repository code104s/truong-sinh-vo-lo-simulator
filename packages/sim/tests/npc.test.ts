// v0.4: khung NPC (Bước 0) và dân số ban đầu (S1) — ADR 0015, 0016.
import { ageYearsAt, birthplaceId, HIDDEN_CHARACTER_KEYS, regionId, vNpcId, vNpcView } from '@tsvl/shared';
import { buildRegion, type RegionLogic } from '@tsvl/worldgen';
import { describe, expect, it } from 'vitest';
import { earnPlan, Life, needsPlan, Rng, simulateWorld, STREAMS, workChoice, type BrainInput } from '../src/index';
import { autoAdvance, lastChoice } from './auto';
import { allocateNpc, newNpcWorld, npcSeed } from '../src/npc/state';
import { vLifeSnapshot } from '../src/life/validate';
import { NPC_QUOTA, PHYSICIAN_PERSONALITIES } from '../src/npc/population';
import { countyMoney, createEconomy } from '../src/economy/market';

const region: RegionLogic = {
  kmPerCellMilli: 6000,
  counties: [0, 1].map((worldIndex) => ({ worldIndex, area: 100, seat: { x: worldIndex, y: 0 }, name: `Quận ${worldIndex}` })),
  settlementKind: ['village', 'town'], adjacency: [[0, 1]], terrainPct: [100], fertilityPct: [100, 100], seatKm: [[0, 60], [60, 0]],
};
const life = () => Life.create({ worldSeed: 'npc', regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }, region);

describe('khung NPC (v0.4 Bước 0)', () => {
  it('id cấp theo thứ tự, đúng dạng hợp đồng, không dùng lại', () => {
    const w = newNpcWorld();
    const ids = [1, 2, 3].map(() => allocateNpc(w, 42).id);
    expect(ids).toEqual(['n1', 'n2', 'n3']);
    for (const id of ids) expect(vNpcId.check(id, '$')).toBeNull();
    expect(w.nextId).toBe(4);
  });

  it('mỗi NPC một luồng RNG riêng, tất định theo seed gốc của đời và id', () => {
    expect(npcSeed(42, 'n1')).toBe(npcSeed(42, 'n1'));
    expect(npcSeed(42, 'n1')).not.toBe(npcSeed(42, 'n2'));
    expect(npcSeed(42, 'n1')).not.toBe(npcSeed(43, 'n1'));
    // Luồng của n2 không phụ thuộc n1 đã rút bao nhiêu số
    const a = newNpcWorld(), b = newNpcWorld();
    allocateNpc(a, 42); const a2 = allocateNpc(a, 42);
    const b1 = allocateNpc(b, 42); Rng.fromState(b1.rng).int(0, 9); const b2 = allocateNpc(b, 42);
    expect(a2).toEqual(b2);
  });

  it('snapshot có danh sách NPC và luồng npc-world; qua schema; lưu, tải cùng digest', () => {
    const l = life();
    const s = l.snapshot();
    // Hạn mức 12 + 20; từ v0.5 có thể thêm người dựng làm cha mẹ người chơi (id sau hạn mức)
    const extra = s.npcs.nextId - 33;
    expect(extra).toBeGreaterThanOrEqual(0);
    expect(extra).toBeLessThanOrEqual(2);
    expect(s.npcs.people).toHaveLength(12 + 20 + extra);
    expect(Object.keys(s.rng.streams)).toContain('npc-world');
    expect(STREAMS).toContain('npc-world');
    expect(vLifeSnapshot.check(s, '$')).toBeNull();
    expect(vLifeSnapshot.check({ ...s, npcs: { nextId: 0, people: [] } }, '$')).not.toBeNull();
    expect(Life.restore(s, [], region).digest()).toBe(l.digest());
  });

  it('thế giới tự chạy: có dân số ban đầu, tất định, sổ cái gồm túi NPC giữ nguyên', () => {
    const a = simulateWorld(region, 20, 'w'), b = simulateWorld(region, 20, 'w');
    expect(a).toEqual(b);
    expect(a.moneyEnd).toBe(a.moneyStart);
    expect(a).toMatchObject({ years: 20, counties: 2, ticks: 20 * 36, npcStart: 32 });
    // Từ S3 mọi NPC đều sống (L1 theo tháng): có người mất, chưa có sinh tới S4
    // Từ S4 có sinh: số người sống = ban đầu + sinh − mất
    expect(a.births).toBeGreaterThan(0);
    expect(a.npcEnd).toBe(32 + a.births - Object.values(a.deaths).reduce((x, y) => x + y, 0));
  });
});

describe('dân số ban đầu (v0.4 S1, ADR 0016)', () => {
  const lives = (n: number) => Array.from({ length: n }, (_, i) => Life.create({ worldSeed: `pop-${i}`, regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }, region));
  // Dân số ban đầu theo hạn mức (id 1..32); từ v0.5 S1, người dựng thêm làm cha mẹ người chơi có id sau đó
  const seeded = NPC_QUOTA.village + NPC_QUOTA.town;
  const people = (l: Life) => l.snapshot().npcs.people.filter((n) => Number(n.id.slice(1)) <= seeded);

  it('đủ hạn mức mỗi quận (làng 12, trấn 20); id theo thứ tự quận; dân nền trừ đi hạn mức', () => {
    const l = life();
    const ps = people(l);
    expect(ps.filter((n) => n.character.home === 0)).toHaveLength(NPC_QUOTA.village);
    expect(ps.filter((n) => n.character.home === 1)).toHaveLength(NPC_QUOTA.town);
    expect(ps.map((n) => n.id)).toEqual(ps.map((_, i) => `n${i + 1}`));
    const fresh = createEconomy(region, 0);
    // Người dựng thêm làm cha mẹ người chơi cũng trừ khỏi dân nền quận sinh
    const extra = l.snapshot().npcs.nextId - 1 - (NPC_QUOTA.village + NPC_QUOTA.town);
    expect(l.snapshot().economy.counties.map((c) => c.mouths)).toEqual(fresh.counties.map((c, i) => c.mouths - [12 + extra, 20][i]!));
    for (const n of ps) expect(n.character.location).toBe(n.character.home);
    // Quận người chơi ở tầng L0, quận khác L1
    expect(new Set(ps.filter((n) => n.character.home === 0).map((n) => n.tier))).toEqual(new Set(['L0']));
    expect(new Set(ps.filter((n) => n.character.home === 1).map((n) => n.tier))).toEqual(new Set(['L1']));
  });

  it('sổ cái: phần chia của người lớn lấy từ quỹ quận, tổng tiền không đổi', () => {
    const l = life();
    const s = l.snapshot();
    expect(l.totalMoney()).toBe(countyMoney(createEconomy(region, s.character.birthTick)) + s.character.household.money);
    expect(people(l).some((n) => n.character.household.money > 0)).toBe(true);
  });

  it('tháp tuổi, xuất thân, thọ nguyên trên 40 đời', () => {
    const all = lives(40).flatMap((l) => people(l).map((n) => ({ n, age: ageYearsAt(n.character.birthTick, l.snapshot().character.birthTick) })));
    expect(all).toHaveLength(40 * 32);
    const under16 = all.filter((x) => x.age < 16).length / all.length;
    expect(under16).toBeGreaterThan(0.28);
    expect(under16).toBeLessThan(0.42);
    for (const { n, age } of all) {
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(70);
      expect(age * 36).toBeLessThan(n.character.lifespanBase); // không ai sinh ra đã quá thọ
      expect(n.character.alive).toBe(true);
      expect(n.character.health).toBe(n.character.healthMax);
    }
    expect(all.some((x) => x.age >= 60)).toBe(true);
    // Xuất thân theo trọng số nơi sinh: làng nhiều bần cùng hơn trấn
    const poorShare = (home: number) => { const xs = all.filter((x) => x.n.character.home === home); return xs.filter((x) => x.n.character.background === 'destitute').length / xs.length; };
    expect(poorShare(0)).toBeGreaterThan(poorShare(1));
  });

  it('nghề theo tuổi và nơi; kỹ năng khớp nghề; người lớn ra riêng, trẻ ở nhà', () => {
    for (const l of lives(30)) {
      const born = l.snapshot().character.birthTick;
      const ps = people(l);
      expect(ps.filter((n) => n.occupation === 'physician').length).toBeLessThanOrEqual(1);
      for (const n of ps) {
        const age = ageYearsAt(n.character.birthTick, born);
        const h = n.character.household;
        if (age < 16) { expect(n.occupation).toBe('child'); expect(h.independent).toBe(false); continue; }
        expect(h.independent).toBe(true);
        expect(n.occupation === 'farmer' || n.occupation === 'hunter' ? 0 : 1).toBe(n.character.home); // làng: nông, săn; trấn: nghề khác
        if (n.occupation === 'physician') { expect(PHYSICIAN_PERSONALITIES).toContain(n.character.personality); expect(age).toBeGreaterThanOrEqual(30); }
        if (n.occupation === 'merchant') expect(n.character.background).not.toBe('destitute');
        if (n.occupation !== 'farmer' && n.occupation !== 'laborer' && n.occupation !== 'child') {
          expect(n.character.skillXp[n.occupation === 'hunter' ? 'hunting' : n.occupation === 'merchant' ? 'trade' : 'literacy']).toBeGreaterThanOrEqual(1000);
        }
      }
    }
  });

  it('tất định: cùng cấu hình cùng dân số; khác seed khác dân số', () => {
    expect(people(life())).toEqual(people(life()));
    const [a, b] = lives(2);
    expect(people(a!).map((n) => n.character.name)).not.toEqual(people(b!).map((n) => n.character.name));
  });

  it('người chơi thấy người ở quận đang đứng: đúng hợp đồng, theo id, không lộ thuộc tính ẩn', () => {
    const l = life();
    const vs = l.people();
    const here = l.snapshot().npcs.people.filter((n) => n.character.home === 0);
    expect(vs).toHaveLength(here.length);
    expect(vs.map((v) => v.id)).toEqual(here.map((n) => n.id));
    for (const v of vs) {
      expect(vNpcView.check(v, '$')).toBeNull();
      expect(v.portrait.key).toBe(v.id);
      expect(v.portrait.ageBand).toBe(v.ageYears < 16 ? 'child' : v.ageYears < 30 ? 'young' : v.ageYears < 55 ? 'adult' : 'old');
      for (const key of HIDDEN_CHARACTER_KEYS) expect(Object.keys(v)).not.toContain(key);
    }
  });
});

describe('tầng L0 tuần (v0.4 S2, ADR 0015)', () => {
  const base: BrainInput = {
    ageYears: 30, healthPct: 100, sick: false, independent: true, money: 0, grain: 1_000, month: 3,
    usable: (id) => ['action.farm', 'action.hunt', 'action.forage', 'action.rest'].includes(id), market: { buyPrice: 40, maxBuy: 10_000, maxSell: 10_000, supply: 'normal' },
  };
  const acts = (p: { slots: { action: string }[] }) => p.slots.map((s) => s.action);

  it('bộ não: nghề là việc chính khi làm được; túng thì làm cả ô thứ ba; người chơi máy điều độ giữ hai ô', () => {
    expect(workChoice(base, 'action.hunt').work).toBe('action.hunt');
    expect(workChoice(base, 'action.hire').work).toBe('action.farm'); // ở làng không có làm thuê
    const poor = { ...base, grain: 50 };
    expect(acts(needsPlan(poor, workChoice(poor)))).toEqual(['action.hunt', 'action.hunt', 'action.hunt']);
    expect(acts(earnPlan(workChoice(poor)))).toEqual(['action.hunt', 'action.hunt', 'action.rest']);
    expect(acts(needsPlan(base, workChoice(base)))).toEqual(['action.farm', 'action.farm', 'action.rest']);
  });

  /** Đời ở quận làng; NPC cùng quận chạy L0, quận trấn L1. */
  const advance = (l: Life, weeks: number) => { for (let k = 0; k < weeks && l.alive; k++) autoAdvance(l, 'week', lastChoice); };

  it('NPC quận người chơi sống mỗi tuần (L0); quận khác chỉ đổi ở tuần đầu tháng (L1); sổ cái gồm túi NPC không đổi', () => {
    const l = life();
    const total = l.totalMoney();
    const byTier = (tier: string) => JSON.stringify(l.snapshot().npcs.people.filter((n) => n.tier === tier));
    for (let k = 0; k < 72 && l.alive; k++) {
      const mid = l.snapshot().tick % 3 !== 0;
      const [l0, l1] = [byTier('L0'), byTier('L1')];
      autoAdvance(l, 'week', lastChoice);
      expect(l.totalMoney()).toBe(total);
      if (mid) expect(byTier('L1')).toBe(l1); // giữa tháng: L1 đứng yên
      if (k > 0) expect(byTier('L0')).not.toBe(l0);
    }
  });

  it('nông dân NPC làm ruộng, gặt đầu tháng Chín; kỹ năng tăng; người lớn có kế hoạch tháng', () => {
    const l = life();
    const farmers = () => l.snapshot().npcs.people.filter((n) => n.tier === 'L0' && n.occupation === 'farmer' && !n.death);
    const xp0 = new Map(farmers().map((n) => [n.id, n.character.skillXp.farming]));
    advance(l, 2 * 36);
    const fs = farmers();
    expect(fs.length).toBeGreaterThan(0);
    expect(fs.some((n) => n.character.skillXp.farming > xp0.get(n.id)!)).toBe(true);
    for (const n of fs) expect(n.plan?.slots).toHaveLength(3);
  });

  it('mất: của về quỹ, kho quận nhà; ghi nguyên nhân; không còn trong người quanh đây', () => {
    const l = life();
    const s = l.snapshot();
    const n = s.npcs.people.find((x) => x.tier === 'L0' && x.character.household.independent)!;
    n.character.health = 1; n.character.healthMax = 1; n.character.household.grain = 0; n.character.household.money = 0; n.character.household.hunger = 19;
    // Hồi quy: chết già đúng tuần sức khỏe cạn thì sức khỏe không được âm (save bị từ chối)
    n.character.lifespanBase = s.tick - n.character.birthTick;
    const r = Life.restore(s, [], region);
    const total = r.totalMoney();
    advance(r, 4);
    const dead = r.snapshot().npcs.people.find((x) => x.id === n.id)!;
    expect(dead.death).not.toBeNull();
    expect(dead.character.alive).toBe(false);
    expect([dead.character.household.money, dead.character.household.grain]).toEqual([0, 0]);
    expect(r.people().some((v) => v.id === n.id)).toBe(false);
    expect(r.totalMoney()).toBe(total);
    expect(dead.character.health).toBeGreaterThanOrEqual(0);
    expect(vLifeSnapshot.check(r.snapshot(), '$')).toBeNull();
  });

  it('thế giới tự chạy trên vùng thật (tsvl-01), mọi NPC ở L0, 5 lượt × 30 năm: chết đói trong năm thường ≤ 5%; sổ cái giữ nguyên', () => {
    const real = buildRegion('tsvl-01').logic;
    let died = 0, starvedNormal = 0;
    for (let i = 0; i < 5; i++) {
      const s = simulateWorld(real, 30, `s2-${i}`, { allL0: true });
      expect(s.moneyEnd).toBe(s.moneyStart);
      died += Object.values(s.deaths).reduce((a, b) => a + b, 0);
      starvedNormal += s.starvationNormalYears;
    }
    expect(died).toBeGreaterThan(200);
    expect(starvedNormal / died).toBeLessThanOrEqual(0.05);
  }, 180_000);
});

describe('tầng L1 tháng, đổi tầng (v0.4 S3, ADR 0015)', () => {
  it('tương đương: cùng vùng thật, cùng dân số ban đầu, chạy toàn L0 và toàn L1 100 năm (có sinh từ S4) — tuổi lúc mất lệch ≤ 1 năm, mỗi nguyên nhân lệch ≤ 3 điểm, chết đói ≤ 2 điểm', () => {
    const real = buildRegion('tsvl-01').logic;
    const run = (allL0: boolean) => {
      const deaths: Record<string, number> = {}; let ages = 0;
      for (let i = 0; i < 15; i++) {
        const s = simulateWorld(real, 100, `eq-${i}`, { allL0 });
        for (const [k, v] of Object.entries(s.deaths)) deaths[k] = (deaths[k] ?? 0) + v;
        ages += s.deathAgeSum;
      }
      const n = Object.values(deaths).reduce((a, b) => a + b, 0);
      return { n, age: ages / n, pct: (k: string) => (100 * (deaths[k] ?? 0)) / n };
    };
    const l0 = run(true), l1 = run(false);
    expect(l0.n).toBeGreaterThanOrEqual(2000);
    expect(Math.abs(l0.age - l1.age)).toBeLessThanOrEqual(1);
    for (const cause of ['old_age', 'illness', 'accident']) expect(Math.abs(l0.pct(cause) - l1.pct(cause)), cause).toBeLessThanOrEqual(3);
    expect(Math.abs(l0.pct('starvation') - l1.pct('starvation'))).toBeLessThanOrEqual(2);
  }, 300_000);

  it('đổi tầng ở đầu tháng theo quận người chơi đang đứng', () => {
    const s = life().snapshot();
    // Người chơi sang quận trấn (1): từ đầu tháng sau, NPC ở đó lên L0, NPC làng về L1
    s.character.location = 1;
    const l = Life.restore(s, [], region);
    while (l.snapshot().tick % 3 !== 0) autoAdvance(l, 'week', lastChoice);
    autoAdvance(l, 'week', lastChoice);
    for (const n of l.snapshot().npcs.people.filter((x) => !x.death)) expect(n.tier).toBe(n.character.location === 1 ? 'L0' : 'L1');
  });

  it('lưu giữa tháng khi có NPC ở cả hai tầng → tải → cùng digest khi chạy tiếp', () => {
    const l = life();
    for (let k = 0; k < 40; k++) autoAdvance(l, 'week', lastChoice);
    while (l.snapshot().tick % 3 === 0) autoAdvance(l, 'week', lastChoice);
    const s = l.snapshot();
    expect(new Set(s.npcs.people.map((n) => n.tier))).toEqual(new Set(['L0', 'L1']));
    const r = Life.restore(s, [...l.log], region);
    expect(r.digest()).toBe(l.digest());
    for (let k = 0; k < 10; k++) { autoAdvance(l, 'week', lastChoice); autoAdvance(r, 'week', lastChoice); }
    expect(r.digest()).toBe(l.digest());
  });
});

describe('vòng đời dân số (v0.4 S4, ADR 0016)', () => {
  it('thế giới tự chạy 100 năm trên vùng thật: mỗi quận 70–130% hạn mức mọi năm; 25–45% dưới 16 tuổi; thầy thuốc, thương nhân nảy ra, mỗi quận tối đa một thầy thuốc', () => {
    const real = buildRegion('tsvl-02').logic;
    for (let i = 0; i < 3; i++) {
      const s = simulateWorld(real, 100, `s4-${i}`);
      expect(s.minQuotaPct).toBeGreaterThanOrEqual(70);
      expect(s.maxQuotaPct).toBeLessThanOrEqual(130);
      expect(s.childrenPermille).toBeGreaterThanOrEqual(250);
      expect(s.childrenPermille).toBeLessThanOrEqual(450);
      expect(s.yearsWithPhysician).toBeGreaterThanOrEqual(80);
      expect(s.yearsWithMerchant).toBeGreaterThanOrEqual(80);
      expect(s.maxPhysiciansPerCounty).toBeLessThanOrEqual(1);
      expect(s.moneyEnd).toBe(s.moneyStart);
    }
  }, 300_000);

  it('người đã mất được dọn khỏi snapshot sau một năm; id không dùng lại', () => {
    const s = life().snapshot();
    const n = s.npcs.people.find((x) => x.character.household.independent)!;
    n.death = { tick: s.tick - 1, cause: 'illness', detail: 'illness.cold' }; n.character.alive = false;
    const l = Life.restore(s, [], region);
    while (l.snapshot().npcs.people.some((x) => x.id === n.id)) autoAdvance(l, 'week', lastChoice);
    expect(l.snapshot().tick - (s.tick - 1)).toBeGreaterThan(36);
    expect(l.snapshot().tick - (s.tick - 1)).toBeLessThanOrEqual(36 * 2 + 1);
    const ids = l.snapshot().npcs.people.map((x) => Number(x.id.slice(1)));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lập thân NPC lúc 16 tuổi: ra riêng (có nghề) hoặc hẹn ở lại tới 20; ở lại thì nộp nửa túi mỗi năm rồi ra riêng', () => {
    let left = 0, stayed = 0;
    for (let i = 0; i < 12; i++) {
      const l0 = Life.create({ worldSeed: `coa-${i}`, regionId: regionId('r0'), birthplaceId: birthplaceId('r0/c0') }, { id: birthplaceId('r0/c0'), name: 'Làng', nameHan: '村', kind: 'village', cell: { x: 0, y: 0 }, county: 0 }, region);
      const s = l0.snapshot();
      // Hai đứa sắp 16 tuổi ở quận người chơi, một nhà bần cùng
      const kids = s.npcs.people.filter((x) => x.tier === 'L0').slice(0, 2);
      kids.forEach((k, j) => { k.character.birthTick = s.tick - 16 * 36 + 2; k.character.household = { ...k.character.household, independent: false, money: 0, grain: 0 }; k.occupation = 'child'; if (j === 0) k.character.background = 'destitute'; });
      const l = Life.restore(s, [], region);
      for (let k = 0; k < 12; k++) autoAdvance(l, 'week', lastChoice);
      for (const k of kids) {
        const n = l.snapshot().npcs.people.find((x) => x.id === k.id)!;
        if (n.death) continue;
        if (n.character.household.independent) { left++; expect(n.occupation).not.toBe('child'); }
        else { stayed++; expect(n.character.household.stayUntil).toBe(20); }
      }
    }
    expect(left).toBeGreaterThan(0);
    expect(stayed).toBeGreaterThan(0);
  });
});


describe('kinh tế có NPC (v0.4 S5, ADR 0016)', () => {
  it('đời người chơi trên vùng thật 30 năm: sổ cái (quỹ quận + túi người chơi + túi NPC) không đổi ở mọi tuần, qua sinh, tử, lập thân, đổi nghề', () => {
    const b = buildRegion('tsvl-01');
    const bp = b.birthplaces.find((p) => p.kind === 'village')!;
    const l = Life.create({ worldSeed: 'tsvl-01', regionId: b.summary.id, birthplaceId: bp.id, lifeSeed: 5 }, bp, b.logic);
    const total = l.totalMoney();
    const firstId = l.snapshot().npcs.nextId;
    let deaths = 0, planned = false;
    for (let k = 0; k < 30 * 36 && l.alive; k++) {
      if (!planned && l.view().canAct) { l.setPlan({ slots: [{ action: 'action.farm' }, { action: 'action.forage' }, { action: 'action.rest' }] }); planned = true; }
      // Mua bán qua lệnh TRADE cũng phải giữ sổ cái
      if (k % 36 === 0 && l.view().household.independent && l.view().household.grain > 200) l.trade(-100);
      autoAdvance(l, 'week', lastChoice);
      expect(l.totalMoney()).toBe(total);
      deaths = Math.max(deaths, l.snapshot().npcs.people.filter((n) => n.death).length);
    }
    const s = l.snapshot();
    expect(s.npcs.nextId).toBeGreaterThan(firstId); // có trẻ sinh
    expect(deaths).toBeGreaterThan(0);
    expect(s.npcs.people.some((n) => n.occupation !== 'child' && Number(n.id.slice(1)) >= firstId)).toBe(true); // trẻ sinh sau đã lập thân
  }, 300_000);

  it('thế giới tự chạy có NPC giữ tiêu chí kinh tế v0.3: sổ cái từng tick, kho không âm, giá 70–500%', () => {
    const real = buildRegion('tsvl-03').logic;
    const s = simulateWorld(real, 100, 's5');
    expect(s.ledgerBreaks).toBe(0);
    expect(s.minGrain).toBeGreaterThanOrEqual(0);
    expect(s.minPricePct).toBeGreaterThanOrEqual(70);
    expect(s.maxPricePct).toBeLessThanOrEqual(500);
    expect(s.lowMoneyMonthsPermille).toBeLessThanOrEqual(50);
  }, 300_000);
});

describe('tin sinh, mất trong nhật ký (v0.4 S6)', () => {
  const weeks = (l: Life, n: number) => { for (let k = 0; k < n && l.alive; k++) autoAdvance(l, 'week', lastChoice); };
  /** Một người lớn ở quận người chơi sắp chết già; `met`: người chơi đã gặp trong sự kiện. */
  function dying(met: boolean): { l: Life; id: string; name: string } {
    const s = life().snapshot();
    const n = s.npcs.people.find((x) => x.tier === 'L0' && x.character.household.independent)!;
    n.character.health = 1; n.character.healthMax = 1; n.character.lifespanBase = s.tick - n.character.birthTick;
    if (met) s.events.met.push(n.id);
    return { l: Life.restore(s, [], region), id: n.id, name: n.character.name };
  }

  it('người trong quận mất thì có tin, đúng tuần mất; người đã gặp là tin quan trọng', async () => {
    const { t } = await import('@tsvl/content');
    for (const met of [false, true]) {
      const { l, id, name } = dying(met);
      weeks(l, 4);
      const dead = l.snapshot().npcs.people.find((x) => x.id === id)!;
      const news = l.log.filter((e) => e.key === 'log.npc.death');
      expect(news).toHaveLength(1);
      expect(news[0]).toMatchObject({ tick: dead.death!.tick, importance: met ? 'major' : 'minor', params: { name, cause: `death.${dead.death!.cause}` } });
      expect(t('log.npc.death', news[0]!.params)).not.toMatch(/⟨|\{\w+\}/);
    }
  });

  it('người đã gặp mất ở quận khác vẫn có tin (quan trọng); người chưa gặp ở quận khác thì không (F4)', () => {
    for (const met of [false, true]) {
      const s = life().snapshot();
      const n = s.npcs.people.find((x) => x.tier === 'L0' && x.character.household.independent)!;
      n.character.location = 1; n.character.home = 1;
      n.character.health = 1; n.character.healthMax = 1; n.character.lifespanBase = s.tick - n.character.birthTick;
      if (met) s.events.met.push(n.id);
      const l = Life.restore(s, [], region);
      weeks(l, 40);
      expect(l.snapshot().npcs.people.find((x) => x.id === n.id)?.death ?? null, 'đã mất').not.toBeNull();
      const news = l.log.filter((e) => e.key === 'log.npc.death' && e.params.name === n.character.name);
      expect(news.map((e) => e.importance)).toEqual(met ? ['major'] : []);
    }
  });

  it('trẻ sinh ở quận nhà có tin (thường), mỗi trẻ một lần', async () => {
    const { t } = await import('@tsvl/content');
    const l = life();
    weeks(l, 6 * 36);
    const news = l.log.filter((e) => e.key === 'log.npc.birth');
    expect(news.length).toBeGreaterThan(0);
    const people = l.snapshot().npcs.people;
    for (const e of news) {
      expect(e.importance).toBe('minor');
      expect(e.tick % 36).toBe(0); // trẻ sinh đầu năm (S4)
      expect(people.some((n) => n.character.name === e.params.name && n.character.home === 0)).toBe(true);
      expect(t('log.npc.birth', e.params)).not.toMatch(/⟨|\{\w+\}/);
    }
    expect(new Set(news.map((e) => e.params.name)).size).toBe(news.length);
  });
});
