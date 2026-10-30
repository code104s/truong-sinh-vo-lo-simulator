// Tiếp xúc với tu tiên (v0.8 S1, ADR 0022 Q3): những gì người đi tìm cơ duyên gặp, và tu sĩ lưu lạc ghé qua. Không cho
// sức mạnh: chỉ để lại dấu vết dẫn tới chỗ kiểm linh căn (S2). Đọc các cờ dấu vết từ v0.3–v0.7 (`heard_immortal`,
// `knows_cave`, `half_map`, `met_hermit`, `hermit_gift`, `temple_prayer`, `road_friend`).
import { mulDiv } from '../../core/math';
import { lookup } from '../../npc/family';
import type { NpcState } from '../../npc/state';
import { sectOf } from '../../factions/sect';
import { QI_PEAK } from '../../life/cultivation';
import { MERIDIAN_ILLNESS } from '../../life/rogue';
import { mindOf } from '../../life/cultivate';
import { calendarOf } from '@tsvl/shared';
import { hasSite, newCultivation, testRoot } from '../../life/cultivation';
import { CRUDE_MANUAL, MANUAL_LITERACY_XP } from '../../life/rogue';
import { mountainCounty } from '../../life/wayward';
import { addFlag, moveGrain, occupy, payFaction, payNpc, payTo, spendStamina, wound } from '../effects';
import type { EventContext, EventDef } from '../engine';
import { castOr, doingNow, man, npcAge } from './common';

/** Cờ dẫn tới chỗ kiểm linh căn ngoài kỳ tuyển (S2): đá thử trong hang, tu sĩ lưu lạc, ẩn sĩ có viên đá. */
export const ROOT_TEST_LEADS = ['found_ruin', 'met_cultivator', 'hermit_stone'] as const;

export const SHRINE_DONATION = 50;
export const TREAT_PRICE = 30;
const PROVISIONS = 10;

const flag = (ctx: EventContext, f: string) => ctx.events.flags.includes(f);
const seeking = (ctx: EventContext) => doingNow(ctx) === 'action.seek';
/** Nhân trọng số theo cờ: có cờ thì nhân `pct`%. */
const boost = (w: number, on: boolean, pct: number) => (on ? mulDiv(w, pct, 100) : w);

export const seekCave: EventDef = {
  id: 'event.seek_cave',
  category: 'cultivation',
  // Vào núi ở quận có di tích, chưa từng vào hang. Biết chỗ hang (chuyện tiên nhân, bản đồ) thì tìm trúng hơn
  weight: (ctx) => {
    if (!seeking(ctx) || !hasSite(ctx.logic, ctx.c.location, 'ruin') || flag(ctx, 'found_ruin')) return 0;
    return boost(boost(150_000, flag(ctx, 'knows_cave'), 300), flag(ctx, 'half_map'), 200);
  },
  cooldownTicks: 6,
  choices: [
    {
      id: 'enter', costs: ['risk', 'stamina'],
      apply: (ctx, rng) => {
        spendStamina(ctx, 60);
        addFlag(ctx, 'found_ruin');
        if (rng.chance(150_000)) { wound(ctx, 2); return { result: 'enter_hurt' }; }
        return { result: 'enter' };
      },
    },
    { id: 'mark', costs: ['time'], apply: (ctx) => { addFlag(ctx, 'knows_cave'); return { result: 'mark' }; } },
    { id: 'leave', costs: ['opportunity'], apply: () => ({ result: 'leave' }) },
  ],
};

export const seekLost: EventDef = {
  id: 'event.seek_lost',
  category: 'cultivation',
  weight: (ctx) => (seeking(ctx) && mountainCounty(ctx.logic, ctx.c.location) ? 80_000 : 0),
  cooldownTicks: 36,
  params: () => ({ grain: PROVISIONS }),
  choices: [
    {
      id: 'climb', costs: ['risk', 'stamina'],
      apply: (ctx, rng) => {
        spendStamina(ctx, 80);
        if (rng.chance(200_000)) { wound(ctx, 3); return { result: 'climb_fall' }; }
        // Đứng trên cao nhìn thấy cửa hang: lần sau tìm trúng hơn
        if (rng.chance(250_000)) { addFlag(ctx, 'knows_cave'); return { result: 'climb_saw' }; }
        return { result: 'climb' };
      },
    },
    {
      id: 'wait', costs: ['grain'],
      available: (ctx) => (ctx.c.household.grain >= PROVISIONS ? null : 'lock.grain'),
      apply: (ctx) => { moveGrain(ctx, ctx.c.location, -PROVISIONS); return { result: 'wait' }; },
    },
    { id: 'stream', costs: ['time'], apply: (ctx) => { occupy(ctx, 'action.toil', 1); return { result: 'stream' }; } },
  ],
};

export const wanderingCultivator: EventDef = {
  id: 'event.wandering_cultivator',
  category: 'cultivation',
  // Người lạ đeo kiếm ghé qua: hiếm với người thường; người đang tìm cơ duyên, người đã nghe chuyện tiên, kẻ lang bạt
  // quen đường, người hay khấn miếu gặp nhiều hơn
  weight: (ctx) => {
    if (ctx.age < 12 || flag(ctx, 'met_cultivator')) return 0;
    let w = seeking(ctx) ? 10_000 : 400;
    w = boost(w, flag(ctx, 'heard_immortal'), 400);
    w = boost(w, flag(ctx, 'road_friend'), 300);
    return boost(w, flag(ctx, 'temple_prayer'), 200);
  },
  cooldownTicks: 360,
  params: () => ({ price: TREAT_PRICE }),
  figure: () => man('adult', 'common'),
  choices: [
    {
      id: 'treat', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= TREAT_PRICE ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, TREAT_PRICE); addFlag(ctx, 'met_cultivator'); return { result: 'treat' }; },
    },
    {
      id: 'ask', costs: ['time', 'risk'],
      apply: (ctx, rng) => {
        spendStamina(ctx, 40);
        // Đã nghe chuyện tiên thì biết hỏi cho trúng; người ngơ ngác dễ bị gạt đi
        if (flag(ctx, 'heard_immortal') || rng.chance(400_000)) { addFlag(ctx, 'met_cultivator'); return { result: 'ask' }; }
        return { result: 'ask_ignored' };
      },
    },
    { id: 'avoid', costs: ['opportunity'], apply: () => ({ result: 'avoid' }) },
  ],
};

export const shrineKeeper: EventDef = {
  id: 'event.shrine_keeper',
  category: 'cultivation',
  // Thăm miếu (tìm cơ duyên ở quận có miếu); người từng khấn miếu được ông từ nhớ mặt
  weight: (ctx) => (seeking(ctx) && hasSite(ctx.logic, ctx.c.location, 'shrine') ? boost(200_000, flag(ctx, 'temple_prayer'), 200) : 0),
  cooldownTicks: 36,
  params: () => ({ price: SHRINE_DONATION }),
  figure: () => man('old', 'poor'),
  choices: [
    {
      id: 'donate', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= SHRINE_DONATION ? null : 'lock.money'),
      // Ông từ kể chuyện hang tiên trên núi, và chuyện tiên môn mấy năm lại xuống thành chọn người
      apply: (ctx) => {
        payTo(ctx, ctx.c.location, SHRINE_DONATION);
        for (const f of ['heard_immortal', 'knows_cave', 'heard_trial']) addFlag(ctx, f);
        return { result: 'donate' };
      },
    },
    {
      id: 'sweep', costs: ['time', 'stamina'],
      apply: (ctx) => { spendStamina(ctx, 60); addFlag(ctx, 'heard_immortal'); addFlag(ctx, 'heard_trial'); return { result: 'sweep' }; },
    },
    { id: 'bow', costs: ['opportunity'], apply: () => ({ result: 'bow' }) },
  ],
};

export const hermitHint: EventDef = {
  id: 'event.hermit_hint',
  category: 'cultivation',
  // Gặp lại ẩn sĩ (ẩn dật, v0.7) khi vào núi; người từng biếu quà được ông chịu nói chuyện
  weight: (ctx) => (seeking(ctx) && mountainCounty(ctx.logic, ctx.c.location) && flag(ctx, 'met_hermit') && !flag(ctx, 'hermit_stone')
    ? boost(150_000, flag(ctx, 'hermit_gift'), 200) : 0),
  cooldownTicks: 36,
  params: () => ({ grain: PROVISIONS }),
  figure: () => man('old', 'poor'),
  choices: [
    {
      id: 'serve', costs: ['grain'],
      available: (ctx) => (ctx.c.household.grain >= PROVISIONS ? null : 'lock.grain'),
      apply: (ctx) => { moveGrain(ctx, ctx.c.location, -PROVISIONS); addFlag(ctx, 'hermit_stone'); return { result: 'serve' }; },
    },
    {
      id: 'ask', costs: ['time'],
      apply: (ctx) => {
        spendStamina(ctx, 20);
        if (!flag(ctx, 'hermit_gift')) return { result: 'ask_refused' };
        addFlag(ctx, 'hermit_stone');
        return { result: 'ask' };
      },
    },
    { id: 'leave', costs: ['opportunity'], apply: () => ({ result: 'leave' }) },
  ],
};

// —— Kiểm linh căn (S2, Q4): ba lối ngoài kỳ tuyển. Kết quả theo linh căn ẩn, không đổi theo cách kiểm; phúc duyên chỉ
// làm dễ gặp dịp kiểm hơn. Biết rồi thì nhớ cả đời. Người không có linh căn mang cờ ám ảnh (`haunted`, Q10) ——

/** Phí tu sĩ lưu lạc đòi để xem linh căn (văn), hay làm đỡ việc cho người ấy hai tuần. */
export const CULTIVATOR_TEST_FEE = 300;

const untested = (ctx: EventContext) => (ctx.player.cultivation?.root ?? null) === null;
/** Phúc duyên 1–10 đổi dịp gặp: 60–150%. */
const luckPct = (ctx: EventContext) => 50 + ctx.c.luck * 10;

/** Kiểm thật: ghi dải vào đường tu; không có linh căn thì để lại ám ảnh. Kết quả sự kiện là chính dải ấy. */
function test(ctx: EventContext): { result: string } {
  ctx.player.cultivation ??= newCultivation();
  const band = testRoot(ctx.player.cultivation, ctx.c.spiritRoot);
  if (band === 'none') addFlag(ctx, 'haunted');
  return { result: band };
}

export const ruinStone: EventDef = {
  id: 'event.ruin_stone',
  category: 'cultivation',
  // Trở lại hang đã vào (S1) khi tìm cơ duyên ở quận có di tích
  weight: (ctx) => (seeking(ctx) && hasSite(ctx.logic, ctx.c.location, 'ruin') && flag(ctx, 'found_ruin') && untested(ctx) ? mulDiv(400_000, luckPct(ctx), 100) : 0),
  cooldownTicks: 6,
  choices: [
    { id: 'touch', costs: ['time', 'stamina'], apply: (ctx) => { spendStamina(ctx, 40); return test(ctx); } },
    { id: 'leave', costs: ['opportunity'], apply: () => ({ result: 'leave' }) },
  ],
};

export const cultivatorTest: EventDef = {
  id: 'event.cultivator_test',
  category: 'cultivation',
  // Tu sĩ lưu lạc hẹn "lúc trăng tròn" (S1): gặp lại vào trung tuần (có rằm), ở bất cứ đâu người ấy tìm tới
  weight: (ctx) => (flag(ctx, 'met_cultivator') && untested(ctx) && calendarOf(ctx.tick).tenDay === 1 ? mulDiv(60_000, luckPct(ctx), 100) : 0),
  cooldownTicks: 12,
  params: () => ({ price: CULTIVATOR_TEST_FEE }),
  figure: () => man('adult', 'common'),
  choices: [
    {
      id: 'pay', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= CULTIVATOR_TEST_FEE ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, CULTIVATOR_TEST_FEE); return test(ctx); },
    },
    { id: 'work', costs: ['time'], apply: (ctx) => { occupy(ctx, 'action.toil', 2); return test(ctx); } },
    { id: 'decline', costs: ['opportunity'], apply: () => ({ result: 'decline' }) },
  ],
};

export const hermitStoneTest: EventDef = {
  id: 'event.hermit_stone',
  category: 'cultivation',
  // Lên núi gặp ẩn sĩ đã trao viên đá (S1)
  weight: (ctx) => (seeking(ctx) && mountainCounty(ctx.logic, ctx.c.location) && flag(ctx, 'hermit_stone') && untested(ctx) ? mulDiv(300_000, luckPct(ctx), 100) : 0),
  cooldownTicks: 6,
  figure: () => man('old', 'poor'),
  choices: [
    { id: 'hold', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 20); return test(ctx); } },
    { id: 'leave', costs: ['opportunity'], apply: () => ({ result: 'leave' }) },
  ],
};

// —— Tán tu (S4, Q6): hai lối tới công pháp thô. Có công pháp rồi mới tự dẫn khí được (`action.induce`, life/rogue.ts) ——

/** Tu sĩ lưu lạc đòi chừng này để chỉ điểm khẩu quyết dẫn khí (văn), hay theo làm việc cho người ấy bốn tuần. */
export const TEACH_FEE = 1_500;
export const TEACH_WEEKS = 4;

/** Chưa có đường tu, chưa có công pháp thô. */
const noManual = (ctx: EventContext) => !flag(ctx, CRUDE_MANUAL) && (ctx.player.cultivation?.path ?? null) === null;

export const ruinScroll: EventDef = {
  id: 'event.ruin_scroll',
  category: 'cultivation',
  // Lục trong hang đã vào (S1): một cuộn tàn quyển; đọc được hay không là ở chữ nghĩa
  weight: (ctx) => (seeking(ctx) && hasSite(ctx.logic, ctx.c.location, 'ruin') && flag(ctx, 'found_ruin') && noManual(ctx) ? mulDiv(120_000, luckPct(ctx), 100) : 0),
  cooldownTicks: 36,
  choices: [
    {
      id: 'read', costs: ['time', 'stamina'],
      available: (ctx) => (ctx.c.skillXp.literacy >= MANUAL_LITERACY_XP ? null : 'lock.literacy'),
      apply: (ctx) => { spendStamina(ctx, 40); addFlag(ctx, CRUDE_MANUAL); return { result: 'read' }; },
    },
    { id: 'leave', costs: ['opportunity'], apply: () => ({ result: 'leave' }) },
  ],
};

export const cultivatorTeach: EventDef = {
  id: 'event.cultivator_teach',
  category: 'cultivation',
  // Đã được tu sĩ lưu lạc xem cho là có linh căn mà chưa có đường vào: lại gặp lúc trăng tròn, xin chỉ điểm
  weight: (ctx) => {
    const root = ctx.player.cultivation?.root ?? null;
    return flag(ctx, 'met_cultivator') && root !== null && root !== 'none' && noManual(ctx) && calendarOf(ctx.tick).tenDay === 1 ? mulDiv(40_000, luckPct(ctx), 100) : 0;
  },
  cooldownTicks: 36,
  params: () => ({ price: TEACH_FEE, weeks: TEACH_WEEKS }),
  figure: () => man('adult', 'common'),
  choices: [
    {
      id: 'pay', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= TEACH_FEE ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.location, TEACH_FEE); addFlag(ctx, CRUDE_MANUAL); return { result: 'pay' }; },
    },
    { id: 'serve', costs: ['time'], apply: (ctx) => { occupy(ctx, 'action.toil', TEACH_WEEKS); addFlag(ctx, CRUDE_MANUAL); return { result: 'serve' }; } },
    { id: 'decline', costs: ['opportunity'], apply: () => ({ result: 'decline' }) },
  ],
};

// —— Giá với phàm giới, ám ảnh, đời tu (S6, Q10). Người đã dẫn khí: sự kiện kể bằng chữ người tu ("linh khí", "kinh
// mạch"); người chưa bước qua (ám ảnh) vẫn kể bằng chữ phàm nhân ——

const cultOf = (ctx: EventContext) => ctx.player.cultivation ?? null;
/** Đã dẫn khí (đệ tử ký danh hay tán tu). */
const onPath = (ctx: EventContext) => (cultOf(ctx)?.path ?? null) !== null;
/** Năm nay đã ngồi tu từ chừng này ô: người nhà bắt đầu thấy vắng. */
export const SECLUDED_SLOTS = 6;
const secluded = (ctx: EventContext) => onPath(ctx) && cultOf(ctx)!.secluded >= SECLUDED_SLOTS;
const cultivatingNow = (ctx: EventContext) => doingNow(ctx) === 'action.cultivate';
/** Thêm, bớt linh khí trong giới hạn đỉnh tầng đang tu (người chưa có đường tu thì không có gì). */
function shiftQi(ctx: EventContext, d: number): void {
  const cult = cultOf(ctx);
  if (!cult?.path) return;
  cult.qi = Math.max(0, Math.min(QI_PEAK.qi1, cult.qi + d));
}

/** Cha hay mẹ còn sống, ở cùng quận, từ 50 tuổi (cha trước). */
function agedParentHere(ctx: EventContext): NpcState | null {
  const byId = lookup(ctx.npcs);
  for (const id of [ctx.c.kin.father, ctx.c.kin.mother]) {
    const n = id === null ? undefined : byId.get(id);
    if (n && !n.death && n.character.location === ctx.c.location && npcAge(ctx, n) >= 50) return n;
  }
  return null;
}
/** Vợ hay chồng còn sống, ở cùng quận. */
function spouseHere(ctx: EventContext): NpcState | null {
  const id = ctx.c.kin.spouse;
  const n = id === null ? undefined : lookup(ctx.npcs).get(id);
  return n && !n.death && n.character.location === ctx.c.location ? n : null;
}
const named = (ctx: EventContext): Record<string, string> => (ctx.npc ? { name: ctx.npc.character.name } : {});

export const PARENT_GIFT = 200;
export const parentFar: EventDef = {
  id: 'event.parent_far',
  category: 'cultivation',
  // Ngồi tu nhiều trong năm mà cha mẹ già ở ngay bên (Q10: người thân dần xa)
  weight: (ctx) => (secluded(ctx) && agedParentHere(ctx) ? 60_000 : 0),
  cooldownTicks: 72,
  cast: (ctx) => agedParentHere(ctx),
  variant: (ctx) => (ctx.npc ? 'named' : null),
  bonds: { visit: { closeness: 10 }, gift: { closeness: 4, trust: 3 }, stay: { closeness: -10 } },
  params: (ctx) => ({ ...named(ctx), price: PARENT_GIFT }),
  figure: castOr(() => man('old', 'common')),
  choices: [
    { id: 'visit', costs: ['time', 'stamina'], apply: (ctx) => { spendStamina(ctx, 40); occupy(ctx, 'action.nurse', 1); return { result: 'visit' }; } },
    {
      id: 'gift', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= PARENT_GIFT ? null : 'lock.money'),
      apply: (ctx) => { if (ctx.npc) payNpc(ctx, ctx.npc, PARENT_GIFT); else payTo(ctx, ctx.c.location, PARENT_GIFT); return { result: 'gift' }; },
    },
    { id: 'stay', costs: ['opportunity'], apply: () => ({ result: 'stay' }) },
  ],
};

export const spouseCold: EventDef = {
  id: 'event.spouse_cold',
  category: 'cultivation',
  weight: (ctx) => (secluded(ctx) && spouseHere(ctx) ? 60_000 : 0),
  cooldownTicks: 72,
  cast: (ctx) => spouseHere(ctx),
  variant: (ctx) => (ctx.npc ? 'named' : null),
  bonds: { talk: { closeness: 8, trust: 4 }, share: { trust: 6 }, ignore: { closeness: -15, hostility: 5 } },
  params: (ctx) => named(ctx),
  figure: castOr(() => man('adult', 'common')),
  choices: [
    { id: 'talk', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 20); occupy(ctx, 'action.nurse', 1); return { result: 'talk' }; } },
    // Chia linh thạch cho người nhà mang đi bán? Không: linh thạch không đổi ra tiền (Q11). Hứa bớt ngồi tu: mất linh khí
    { id: 'share', costs: ['opportunity', 'time'], available: (ctx) => (onPath(ctx) ? null : 'lock.no_path'), apply: (ctx) => { shiftQi(ctx, -300); return { result: 'share' }; } },
    { id: 'ignore', costs: ['opportunity'], apply: () => ({ result: 'ignore' }) },
  ],
};

/** Ám ảnh (Q10): đã biết mình không có linh căn, hay trượt kỳ tuyển, mà chưa buông. Chọn buông thì hết. */
const haunted = (ctx: EventContext) => flag(ctx, 'haunted') && !onPath(ctx);
function letGo(ctx: EventContext): void {
  const i = ctx.events.flags.indexOf('haunted');
  if (i >= 0) ctx.events.flags.splice(i, 1);
  addFlag(ctx, 'let_go');
}

export const ELIXIR_PRICE = 800;
export const fakeElixir: EventDef = {
  id: 'event.fake_elixir',
  category: 'cultivation',
  weight: (ctx) => (haunted(ctx) && ctx.age >= 16 ? 6_000 : 0),
  cooldownTicks: 180,
  params: () => ({ price: ELIXIR_PRICE }),
  figure: () => man('adult', 'common'),
  choices: [
    {
      id: 'buy', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= ELIXIR_PRICE ? null : 'lock.money'),
      // Viên thuốc là bột gạo vo tròn: tiền mất vào chợ, không có gì đổi lại
      apply: (ctx) => { payTo(ctx, ctx.c.location, ELIXIR_PRICE); return { result: 'buy' }; },
    },
    { id: 'let_go', costs: ['opportunity'], apply: (ctx) => { letGo(ctx); return { result: 'let_go' }; } },
    { id: 'walk', costs: ['opportunity'], apply: () => ({ result: 'walk' }) },
  ],
};

export const hauntedDream: EventDef = {
  id: 'event.haunted_dream',
  category: 'cultivation',
  weight: (ctx) => (haunted(ctx) && ctx.age >= 16 ? 5_000 : 0),
  cooldownTicks: 180,
  choices: [
    // Bỏ việc lên núi tìm lại: mất một tháng, mệt, đường núi
    { id: 'go', costs: ['time', 'risk'], apply: (ctx, rng) => { occupy(ctx, 'action.toil', 3); if (rng.chance(100_000)) { wound(ctx, 2); return { result: 'go_hurt' }; } return { result: 'go' }; } },
    { id: 'let_go', costs: ['opportunity'], apply: (ctx) => { letGo(ctx); return { result: 'let_go' }; } },
    { id: 'sleep', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 60); return { result: 'sleep' }; } },
  ],
};

export const immortalRumor: EventDef = {
  id: 'event.immortal_rumor',
  category: 'cultivation',
  // Ở trấn, thành: người kể chuyện tiên nhân bay qua; ai chưa nghe chuyện tiên dễ dừng lại nghe
  weight: (ctx) => (ctx.age >= 12 && ctx.logic.settlementKind[ctx.c.location] !== 'village' && !flag(ctx, 'heard_immortal') ? 4_000 : 0),
  cooldownTicks: 360,
  params: () => ({ price: 10 }),
  figure: () => man('old', 'poor'),
  choices: [
    { id: 'pay', costs: ['money'], available: (ctx) => (ctx.c.household.money >= 10 ? null : 'lock.money'), apply: (ctx) => { payTo(ctx, ctx.c.location, 10); addFlag(ctx, 'heard_immortal'); addFlag(ctx, 'heard_trial'); return { result: 'pay' }; } },
    { id: 'listen', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 10); addFlag(ctx, 'heard_immortal'); return { result: 'listen' }; } },
    { id: 'pass', costs: ['opportunity'], apply: () => ({ result: 'pass' }) },
  ],
};

export const FELLOW_GRAIN = 10;
export const fellowCultivator: EventDef = {
  id: 'event.fellow_cultivator',
  category: 'cultivation',
  // Đồng đạo: người cũng mới dẫn khí, gặp khi vào núi hay ngồi tu ở chốn linh khí
  weight: (ctx) => (onPath(ctx) && (seeking(ctx) || cultivatingNow(ctx)) ? 20_000 : 0),
  cooldownTicks: 72,
  params: () => ({ grain: FELLOW_GRAIN }),
  figure: () => man('adult', 'common'),
  choices: [
    { id: 'discuss', costs: ['time', 'stamina'], apply: (ctx) => { spendStamina(ctx, 60); shiftQi(ctx, 400); return { result: 'discuss' }; } },
    {
      id: 'share_food', costs: ['grain'],
      available: (ctx) => (ctx.c.household.grain >= FELLOW_GRAIN ? null : 'lock.grain'),
      apply: (ctx) => { moveGrain(ctx, ctx.c.location, -FELLOW_GRAIN); addFlag(ctx, 'fellow_friend'); return { result: 'share_food' }; },
    },
    { id: 'avoid', costs: ['opportunity'], apply: () => ({ result: 'avoid' }) },
  ],
};

export const cultivatorRobber: EventDef = {
  id: 'event.cultivator_robber',
  category: 'cultivation',
  // Kẻ cướp đoạt cấp thấp: người tu mất đường, chặn người có linh thạch nơi núi vắng
  weight: (ctx) => (onPath(ctx) && cultOf(ctx)!.stones > 0 && (seeking(ctx) || mountainCounty(ctx.logic, ctx.c.location)) ? 6_000 : 0),
  cooldownTicks: 180,
  figure: () => man('adult', 'poor'),
  choices: [
    { id: 'hand_over', costs: ['opportunity'], available: (ctx) => ((cultOf(ctx)?.stones ?? 0) > 0 ? null : 'lock.no_stones'), apply: (ctx) => { cultOf(ctx)!.stones = 0; return { result: 'hand_over' }; } },
    {
      id: 'flee', costs: ['risk', 'stamina'],
      apply: (ctx, rng) => {
        spendStamina(ctx, 100);
        if (rng.chance(400_000)) { wound(ctx, 3); const cult = cultOf(ctx); if (cult) cult.stones = Math.max(0, cult.stones - 1); return { result: 'flee_caught' }; }
        return { result: 'flee' };
      },
    },
    { id: 'beg', costs: ['health'], apply: (ctx) => { const cult = cultOf(ctx); if (cult) cult.stones = Math.max(0, cult.stones - 1); ctx.c.health = Math.max(1, ctx.c.health - 60); return { result: 'beg' }; } },
  ],
};

export const qiDeviation: EventDef = {
  id: 'event.qi_deviation',
  category: 'cultivation',
  // Tẩu hỏa: ngồi tu khi tâm cảnh không yên (đói, bệnh, tang, tính nóng)
  weight: (ctx) => {
    const cult = cultOf(ctx);
    if (!cult?.path || !cultivatingNow(ctx) || ctx.c.conditions.some((x) => x.id === MERIDIAN_ILLNESS)) return 0;
    const mind = mindOf(ctx.c, cult, ctx.tick, false);
    return mind === 'troubled' ? 20_000 : mind === 'shaken' ? 50_000 : 2_000;
  },
  cooldownTicks: 72,
  choices: [
    { id: 'stop', costs: ['opportunity'], apply: (ctx) => { shiftQi(ctx, -500); return { result: 'stop' }; } },
    {
      id: 'push', costs: ['risk'],
      apply: (ctx, rng) => {
        if (rng.chance(500_000)) {
          if (!ctx.c.conditions.some((x) => x.kind === 'illness')) ctx.c.conditions.push({ id: MERIDIAN_ILLNESS, kind: 'illness', severity: 'serious', weeksLeft: 8 });
          shiftQi(ctx, -1_000);
          return { result: 'push_hurt' };
        }
        shiftQi(ctx, 300);
        return { result: 'push' };
      },
    },
    { id: 'rest', costs: ['time'], apply: (ctx) => { occupy(ctx, 'action.shelter', 1); shiftQi(ctx, -200); return { result: 'rest' }; } },
  ],
};

export const cultivationInsight: EventDef = {
  id: 'event.cultivation_insight',
  category: 'cultivation',
  weight: (ctx) => (onPath(ctx) && cultivatingNow(ctx) ? mulDiv(4_000, 50 + ctx.c.aptitude * 10, 100) : 0),
  cooldownTicks: 180,
  choices: [
    { id: 'sit', costs: ['time', 'stamina'], apply: (ctx) => { spendStamina(ctx, 80); occupy(ctx, 'action.toil', 1); shiftQi(ctx, 800); return { result: 'sit' }; } },
    { id: 'note', costs: ['stamina'], apply: (ctx) => { spendStamina(ctx, 30); shiftQi(ctx, 200); return { result: 'note' }; } },
    { id: 'rise', costs: ['opportunity'], apply: () => ({ result: 'rise' }) },
  ],
};

export const ERRAND_FEE = 300;
export const sectErrand: EventDef = {
  id: 'event.sect_errand',
  category: 'cultivation',
  // Đệ tử ký danh còn tên: tông môn gửi tin nhờ việc (hái thuốc, đưa thư); làm thì tính vào tuần tạp dịch năm nay
  weight: (ctx) => (cultOf(ctx)?.duty ? 15_000 : 0),
  cooldownTicks: 108,
  params: () => ({ price: ERRAND_FEE }),
  choices: [
    { id: 'go', costs: ['time', 'stamina'], apply: (ctx) => { spendStamina(ctx, 60); occupy(ctx, 'action.toil', 2); const d = cultOf(ctx)?.duty; if (d) d.weeks += 2; return { result: 'go' }; } },
    {
      id: 'pay', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= ERRAND_FEE ? null : 'lock.money'),
      apply: (ctx) => { payFaction(ctx, sectOf(ctx.factions), ctx.c.location, ERRAND_FEE); const d = cultOf(ctx)?.duty; if (d) d.weeks += 1; return { result: 'pay' }; },
    },
    { id: 'ignore', costs: ['opportunity'], apply: () => ({ result: 'ignore' }) },
  ],
};

export const sectSenior: EventDef = {
  id: 'event.sect_senior',
  category: 'cultivation',
  // Sư huynh trên núi xuống: xem tiến độ; người đã tích được nhiều được chỉ thêm, kẻ đòi "lễ" thì lấy linh thạch
  weight: (ctx) => (cultOf(ctx)?.path === 'sect' && cultOf(ctx)!.duty ? 8_000 : 0),
  cooldownTicks: 180,
  figure: () => man('adult', 'rich'),
  choices: [
    {
      id: 'gift', costs: ['opportunity'],
      available: (ctx) => ((cultOf(ctx)?.stones ?? 0) > 0 ? null : 'lock.no_stones'),
      apply: (ctx) => { cultOf(ctx)!.stones--; shiftQi(ctx, 600); return { result: 'gift' }; },
    },
    { id: 'ask', costs: ['time'], apply: (ctx) => { spendStamina(ctx, 30); shiftQi(ctx, 200); return { result: 'ask' }; } },
    { id: 'bow', costs: ['opportunity'], apply: () => ({ result: 'bow' }) },
  ],
};

export const CULTIVATION_EVENTS: readonly EventDef[] = [
  seekCave, seekLost, wanderingCultivator, shrineKeeper, hermitHint, ruinStone, cultivatorTest, hermitStoneTest, ruinScroll, cultivatorTeach,
  parentFar, spouseCold, fakeElixir, hauntedDream, immortalRumor, fellowCultivator, cultivatorRobber, qiDeviation, cultivationInsight, sectErrand, sectSenior,
];
export const CULTIVATION_EVENT_IDS: readonly string[] = CULTIVATION_EVENTS.map((d) => d.id);
