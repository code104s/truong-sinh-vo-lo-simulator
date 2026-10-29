// Sự kiện thế lực (v0.6 S7, ADR 0019 Q10): quan phủ bắt phu, sách nhiễu, phát chẩn; băng cướp dụ người, về làng cướp,
// bị tố cáo; thương hội thuê theo đoàn buôn; họ lớn kiện ruộng, dạm hỏi thông gia. Mỗi sự kiện gọi thế lực thật và
// người thật của nó; tiền, lương đi qua kho thế lực hay túi người ấy. Dựng không có thế lực (test văn bản) thì đi vào
// quỹ, kho quận như người vô danh. Văn phong: docs/van-phong.md.
import { GRAIN_PER_DOU } from '@tsvl/shared';
import { idiv, mulDiv } from '../../core/math';
import { GREEDY_FROM } from '../../factions/government';
import { BANDIT_POOR_MONEY } from '../../factions/bandits';
import { headTaxOf, GIFT_BY_BACKGROUND } from '../../economy/income';
import { supplyOf } from '../../economy/market';
import { baseOccupation } from '../../npc/lifecycle';
import type { NpcState } from '../../npc/state';
import type { CareerWorld } from '../../life/career';
import type { PlayerState } from '../../life/player';
import { joinBand } from '../../life/wayward';
import { isHostile } from '../../factions/attitude';
import { addFlag, giveLandTo, moveGrain, moveGrainFaction, occupy, payFaction, payNpc, payTo, receiveFromFaction, spendStamina, wound } from '../effects';
import type { EventContext, EventDef } from '../engine';
import { matchCandidates } from './relations';
import { FIGHT_MARTIAL_XP } from './road';
import {
  bandNear, castOr, clanSurname, government, govRules, guildAt, here, leadClan, leaderOf, man, membersOf, month, npcName, percentOf, personality, pickOne, seatName,
} from './common';

const dou = (grain: number) => idiv(grain, GRAIN_PER_DOU);
const named = (ctx: EventContext) => (ctx.npc ? 'named' : null);
/** Trả tiền cho người trong chuyện; không có người (dựng thử) thì vào quỹ quận. */
const payPerson = (ctx: EventContext, amount: number) => (ctx.npc ? payNpc(ctx, ctx.npc, amount) : payTo(ctx, ctx.c.location, amount));
const adult = (ctx: EventContext, lo = 16, hi = 50) => ctx.age >= lo && ctx.age <= hi;
/** Thưởng báo quan bắt cướp (văn), từ kho quan phủ. */
export const REPORT_REWARD = 300;

// —— Quan phủ bắt phu (Q7, Q10) ——
/** Nộp tiền miễn phu: gấp đôi thuế đinh ở quận nhà (theo mức thuế quan đặt, 200–600 văn); lót tay sai dịch nửa số ấy. */
export const CORVEE_FEE_X = 2;
/** Lót tay thành: (300 + 5 × độ tham)‰ — quan càng tham, sai dịch càng dễ nhận. */
const BRIBE_BASE_PPM = 300_000;
const BRIBE_GREED_PPM = 5_000;
const CORVEE_MONTHS: readonly number[] = [11, 12, 1, 2];
const corveeFee = (ctx: EventContext) => CORVEE_FEE_X * headTaxOf(ctx.eco.counties[ctx.c.home]!);
export const corveeLevy: EventDef = {
  id: 'event.corvee_levy',
  factions: (ctx) => ({ government: government(ctx) }),
  tone: { government: 'grudge' },
  attitude: { pay_off: { government: 3 }, bribe_failed: { government: -10 }, go: { government: 5 } },
  category: 'economy',
  // Mùa khô sau gặt, quan phủ bắt đinh đắp đê, sửa thành: chỉ quận quan phủ giữ; đang dở chuyến đi hay việc dài thì thoát.
  // Quan càng tham, thuế càng nặng, càng hay bắt
  weight: (ctx) => {
    const g = govRules(ctx, ctx.c.home);
    return g && ctx.c.gender === 'male' && adult(ctx, 18, 50) && ctx.c.household.independent && !ctx.player.active && CORVEE_MONTHS.includes(month(ctx))
      ? mulDiv(12_000, ctx.eco.counties[ctx.c.home]!.taxPct, 100) : 0;
  },
  cooldownTicks: 108,
  // Người thật (S7): một sai dịch của quan phủ
  cast: (ctx, rng) => pickOne(membersOf(ctx, government(ctx)), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), fee: corveeFee(ctx), bribe: idiv(corveeFee(ctx), 2) }),
  figure: castOr(() => man('adult', 'official')),
  choices: [
    {
      id: 'pay_off', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= corveeFee(ctx) ? null : 'lock.money'),
      apply: (ctx) => ({ result: 'pay_off', params: { money: payFaction(ctx, government(ctx), ctx.c.home, corveeFee(ctx)) } }),
    },
    {
      id: 'bribe', costs: ['money', 'risk'],
      available: (ctx) => (ctx.c.household.money >= idiv(corveeFee(ctx), 2) ? null : 'lock.money'),
      apply: (ctx, rng) => {
        payPerson(ctx, idiv(corveeFee(ctx), 2));
        if (rng.chance(BRIBE_BASE_PPM + BRIBE_GREED_PPM * (government(ctx)?.greed ?? 0))) return { result: 'bribe_ok' };
        occupy(ctx, 'action.corvee');
        return { result: 'bribe_failed' };
      },
    },
    { id: 'go', costs: ['time', 'stamina'], apply: (ctx) => { occupy(ctx, 'action.corvee'); return { result: 'go' }; } },
  ],
};

// —— Quan tham sách nhiễu (Q7) ——
/** Lệ phí đặt ra: 5% túi, từ 30 tới 500 văn. */
const levyOf = (ctx: EventContext) => Math.max(30, Math.min(500, idiv(ctx.c.household.money * 50, 1000)));
export const greedyLevy: EventDef = {
  id: 'event.greedy_levy',
  factions: (ctx) => ({ government: government(ctx) }),
  tone: { government: 'grudge' },
  attitude: { pay: { government: 3 }, plead_ok: { government: -2 }, refuse_beaten: { government: -15 }, refuse_left: { government: -10 } },
  category: 'economy',
  // Chỉ dưới quan tham, ở quận quan phủ giữ; nhà có của mới bị để ý
  weight: (ctx) => {
    const g = govRules(ctx, ctx.c.home);
    return g && g.greed >= GREEDY_FROM && ctx.c.household.independent && ctx.c.household.money >= 200 && ctx.c.location === ctx.c.home ? 15_000 : 0;
  },
  cooldownTicks: 72,
  reputation: { refuse_beaten: 3 },
  cast: (ctx, rng) => pickOne(membersOf(ctx, government(ctx)), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), amount: levyOf(ctx), half: idiv(levyOf(ctx), 2) }),
  figure: castOr(() => man('adult', 'official')),
  choices: [
    { id: 'pay', costs: ['money'], apply: (ctx) => ({ result: 'pay', params: { money: payFaction(ctx, government(ctx), ctx.c.home, levyOf(ctx)) } }) },
    {
      id: 'plead', costs: ['money', 'risk'],
      // Kêu nghèo: phúc duyên giúp được giảm một nửa; không thì nộp đủ
      apply: (ctx, rng) => {
        const full = levyOf(ctx);
        const ok = rng.chance(400_000 + ctx.c.luck * 30_000);
        return { result: ok ? 'plead_ok' : 'plead_failed', params: { money: payFaction(ctx, government(ctx), ctx.c.home, ok ? idiv(full, 2) : full) } };
      },
    },
    {
      id: 'refuse', costs: ['risk', 'health'],
      apply: (ctx, rng) => {
        if (rng.chance(500_000)) { wound(ctx, 2); return { result: 'refuse_beaten' }; }
        return { result: 'refuse_left' };
      },
    },
  ],
};

// —— Phát chẩn (Q7) ——
export const RELIEF_GRAIN = 60;
export const RELIEF_BRIBE = 30;
export const RELIEF_BRIBE_GRAIN = 150;
export const reliefLine: EventDef = {
  id: 'event.relief_line',
  factions: (ctx) => ({ government: government(ctx) }),
  tone: { government: 'favor' },
  attitude: { queue: { government: 2 }, bribe_clerk: { government: -3 } },
  category: 'economy',
  // Quận đang đứng đói kém, quan phủ giữ và không tham: lương chẩn đổ về kho quận, sân đình phát gạo
  weight: (ctx) => {
    const g = govRules(ctx, ctx.c.location);
    return g && g.greed < GREEDY_FROM && ctx.age >= 12 && ctx.c.household.grain < 100 && supplyOf(here(ctx)) === 'famine' ? 100_000 : 0;
  },
  cooldownTicks: 36,
  reputation: { yield: 5 },
  figure: () => man('adult', 'official'),
  params: () => ({ dou: dou(RELIEF_GRAIN), more: dou(RELIEF_BRIBE_GRAIN), bribe: RELIEF_BRIBE }),
  choices: [
    {
      id: 'queue', costs: ['time', 'stamina'],
      apply: (ctx) => { spendStamina(ctx, 40); return { result: 'queue', params: { got: dou(moveGrain(ctx, ctx.c.location, RELIEF_GRAIN)) } }; },
    },
    {
      id: 'bribe_clerk', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= RELIEF_BRIBE ? null : 'lock.money'),
      apply: (ctx) => {
        payFaction(ctx, government(ctx), ctx.c.location, RELIEF_BRIBE);
        return { result: 'bribe_clerk', params: { got: dou(moveGrain(ctx, ctx.c.location, RELIEF_BRIBE_GRAIN)) } };
      },
    },
    { id: 'yield', costs: ['opportunity'], apply: () => ({ result: 'yield' }) },
  ],
};

// —— Bị dụ theo cướp (Q6, Q10) ——
export const LURE_GRAIN = 100;
/** Người cùng đường: nghèo, không ruộng, túng đói, ở nơi băng cướp với tới. */
const lured = (ctx: EventContext) => {
  const h = ctx.c.household;
  return adult(ctx, 16, 45) && h.independent && h.money < BANDIT_POOR_MONEY && h.landMu === 0 && (h.hunger > 0 || h.grain < 100);
};
export const banditLure: EventDef = {
  id: 'event.bandit_lure',
  factions: (ctx) => ({ bandits: bandNear(ctx), government: government(ctx) }),
  tone: { bandits: 'favor' },
  attitude: {
    take_share: { bandits: 15, government: -5 }, tip_off: { bandits: -30, government: 10 }, tip_off_found: { bandits: -40, government: 10 }, refuse: { bandits: -5 },
  },
  category: 'daily',
  weight: (ctx) => (lured(ctx) && bandNear(ctx) ? 30_000 : 0),
  cooldownTicks: 108,
  reputation: { take_share: -10, tip_off: 5, join: -20 },
  bonds: { take_share: { closeness: 10, trust: 10 }, tip_off: { hostility: 40 }, tip_off_found: { hostility: 60 }, join: { closeness: 15, trust: 15 }, refuse: { closeness: -5 } },
  // Người thật: một người trong băng
  cast: (ctx, rng) => pickOne(membersOf(ctx, bandNear(ctx)), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), dou: dou(LURE_GRAIN) }),
  figure: castOr(() => man('young', 'poor')),
  choices: [
    {
      id: 'take_share', costs: ['risk'],
      // Nhận gạo, chỉ đường cho băng: không theo hẳn (v0.7 mới có nghề cướp cho người chơi), nhưng tiếng xấu
      apply: (ctx) => { addFlag(ctx, 'bandit_helper'); return { result: 'take_share', params: { got: dou(moveGrainFaction(ctx, bandNear(ctx), ctx.c.location, LURE_GRAIN)) } }; },
    },
    {
      id: 'tip_off', costs: ['risk'],
      // Người xảo trá: nhận gạo rồi báo quan lấy thưởng; lộ thì ăn đòn
      available: (ctx) => (personality(ctx, 'cunning', 'greedy') ? null : 'lock.personality'),
      apply: (ctx, rng) => {
        const got = dou(moveGrainFaction(ctx, bandNear(ctx), ctx.c.location, LURE_GRAIN));
        const reward = receiveFromFaction(ctx, government(ctx), ctx.c.location, REPORT_REWARD);
        if (rng.chance(400_000)) { wound(ctx, 3); return { result: 'tip_off_found', params: { got, reward } }; }
        return { result: 'tip_off', params: { got, reward } };
      },
    },
    {
      // Theo họ lên núi (v0.7 S6, Q8): vào băng thật, sống bằng chia của; tiếng xấu, người thân xa lánh
      id: 'join', costs: ['risk', 'opportunity'],
      available: (ctx) => (!bandNear(ctx) || !('careers' in ctx.player) ? 'lock.no_band' : ctx.player.career?.id === 'outlaw' ? 'lock.member' : isHostile(bandNear(ctx)) ? 'lock.hostile' : null),
      apply: (ctx) => {
        const band = bandNear(ctx)!;
        // Thân phận nghề nằm trong snapshot đời (ctx.player): đổi qua một bản tạm rồi chép lại, không thêm trường vào snapshot
        const p = ctx.player as PlayerState & CareerWorld;
        const w = { career: p.career ?? null, careers: p.careers, bonds: ctx.bonds, npcs: ctx.npcs, tick: ctx.tick, factions: ctx.factions };
        joinBand(ctx.c, band, w);
        p.career = w.career;
        return { result: 'join', params: { place: ctx.logic.counties[band.seat]!.name ?? 'place.unknown' } };
      },
    },
    { id: 'refuse', costs: ['opportunity'], apply: () => ({ result: 'refuse' }) },
  ],
};

// —— Cướp về làng (Q6, Q8) ——
export const RAID_PCT = 20;
export const HIDE_PCT = 5;
/** Họ đứng đầu làng gọi trai tráng giữ làng: cộng chừng ấy ppm vào cơ hội đánh lui. */
const CLAN_DEFENSE_PPM = 200_000;
export const banditRaid: EventDef = {
  id: 'event.bandit_raid',
  factions: (ctx) => ({ bandits: bandNear(ctx) }),
  tone: { bandits: 'grudge' },
  attitude: { defend_won: { bandits: -20 }, defend_lost: { bandits: -10 }, hand_over: { bandits: 5 } },
  category: 'disaster',
  weight: (ctx) => (ctx.age >= 14 && ctx.c.household.grain >= 300 && bandNear(ctx) ? 15_000 : 0),
  cooldownTicks: 72,
  reputation: { defend_won: 8, defend_lost: 3 },
  cast: (ctx) => leaderOf(ctx, bandNear(ctx)),
  variant: (ctx) => (leadClan(ctx, ctx.c.location) ? (ctx.npc ? 'named_clan' : 'clan') : named(ctx)),
  params: (ctx) => ({ ...npcName(ctx), clan: clanSurname(leadClan(ctx, ctx.c.location)), pct: RAID_PCT }),
  figure: castOr(() => man('adult', 'poor')),
  choices: [
    {
      id: 'hide', costs: ['stamina', 'grain'],
      apply: (ctx) => { spendStamina(ctx, 60); return { result: 'hide', params: { lost: dou(moveGrainFaction(ctx, bandNear(ctx), ctx.c.location, -percentOf(ctx.c.household.grain, HIDE_PCT))) } }; },
    },
    {
      id: 'defend', costs: ['health', 'risk'],
      // Có võ, hay có họ lớn đứng ra giữ làng, mới dám chống
      available: (ctx) => (ctx.c.skillXp.martial >= FIGHT_MARTIAL_XP || leadClan(ctx, ctx.c.location) ? null : 'lock.skill'),
      apply: (ctx, rng) => {
        const ppm = 300_000 + mulDiv(ctx.c.skillXp.martial, 300_000, 10_000) + (leadClan(ctx, ctx.c.location) ? CLAN_DEFENSE_PPM : 0);
        if (rng.chance(ppm)) return { result: 'defend_won' };
        wound(ctx, 3);
        return { result: 'defend_lost', params: { lost: dou(moveGrainFaction(ctx, bandNear(ctx), ctx.c.location, -percentOf(ctx.c.household.grain, RAID_PCT))) } };
      },
    },
    {
      id: 'hand_over', costs: ['grain'],
      apply: (ctx) => ({ result: 'hand_over', params: { lost: dou(moveGrainFaction(ctx, bandNear(ctx), ctx.c.location, -percentOf(ctx.c.household.grain, RAID_PCT))) } }),
    },
  ],
};

// —— Tố cáo cướp (Q8, Q10) ——
/** Báo quan: quan phủ bắt được người bị tố với xác suất này (ppm); băng biết chuyện mà trả thù với xác suất kia. */
const REPORT_CATCH_PPM = 500_000;
const REPORT_REVENGE_PPM = 250_000;
export const reportBandits: EventDef = {
  id: 'event.report_bandits',
  factions: (ctx) => ({ government: government(ctx), bandits: bandNear(ctx) }),
  tone: { government: 'favor' },
  attitude: { report_caught: { government: 15, bandits: -30 }, report_missed: { government: 5, bandits: -20 }, report_hurt: { government: 5, bandits: -20 } },
  category: 'daily',
  weight: (ctx) => (ctx.age >= 16 && government(ctx) && bandNear(ctx) ? 8_000 : 0),
  cooldownTicks: 108,
  reputation: { report_caught: 5, report_missed: 2, report_hurt: 2 },
  bonds: { report_caught: { hostility: 50 }, report_missed: { hostility: 40 }, report_hurt: { hostility: 40 } },
  cast: (ctx, rng) => pickOne(membersOf(ctx, bandNear(ctx)), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), reward: REPORT_REWARD, place: seatName(ctx, government(ctx)) }),
  figure: castOr(() => man('young', 'poor')),
  choices: [
    {
      id: 'report', costs: ['time', 'risk'],
      apply: (ctx, rng) => {
        spendStamina(ctx, 30);
        const band = bandNear(ctx);
        if (rng.chance(REPORT_REVENGE_PPM)) { wound(ctx, 2); return { result: 'report_hurt' }; }
        if (!rng.chance(REPORT_CATCH_PPM)) return { result: 'report_missed' };
        // Bị bắt: rời băng, về nghề cũ (như người bị bắt khi tiễu phỉ, S5); băng dưới 3 người tan ở quý sau
        if (ctx.npc && band) {
          band.members = band.members.filter((id) => id !== ctx.npc!.id);
          if (band.leader === ctx.npc.id) band.leader = band.members[0] ?? null;
          ctx.npc.occupation = baseOccupation(ctx.npc.character, ctx.logic);
        }
        return { result: 'report_caught', params: { reward: receiveFromFaction(ctx, government(ctx), ctx.c.location, REPORT_REWARD) } };
      },
    },
    { id: 'keep_quiet', costs: ['opportunity'], apply: () => ({ result: 'keep_quiet' }) },
  ],
};

// —— Theo đoàn buôn (Q5, Q10) ——
export const CARAVAN_PAY = 300;
export const ESCORT_PAY = 600;
export const CARAVAN_WEEKS = 3;
const AMBUSH_PPM = 250_000;
export const joinCaravan: EventDef = {
  id: 'event.join_caravan',
  factions: (ctx) => ({ guild: guildAt(ctx, ctx.c.location) }),
  tone: { guild: 'favor' },
  attitude: { porter: { guild: 5 }, escort: { guild: 10 }, escort_hurt: { guild: 10 }, decline: { guild: -2 } },
  category: 'opportunity',
  // Ở trấn có thương hội đủ kho trả công; rảnh tay (không dở việc dài)
  weight: (ctx) => {
    const g = guildAt(ctx, ctx.c.location);
    return g && g.money >= 2 * ESCORT_PAY && adult(ctx, 16, 50) && !ctx.player.active ? 15_000 : 0;
  },
  cooldownTicks: 72,
  bonds: { porter: { closeness: 5, trust: 5 }, escort: { closeness: 5, trust: 10 }, escort_hurt: { trust: 10 } },
  // Người thật: hội trưởng
  cast: (ctx) => leaderOf(ctx, guildAt(ctx, ctx.c.location)),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), pay: CARAVAN_PAY, escort: ESCORT_PAY, place: seatName(ctx, guildAt(ctx, ctx.c.location)) }),
  figure: castOr(() => man('adult', 'rich')),
  choices: [
    {
      id: 'porter', costs: ['time', 'stamina'],
      apply: (ctx) => {
        occupy(ctx, 'action.toil', CARAVAN_WEEKS);
        return { result: 'porter', params: { money: receiveFromFaction(ctx, guildAt(ctx, ctx.c.location), ctx.c.location, CARAVAN_PAY) } };
      },
    },
    {
      id: 'escort', costs: ['time', 'risk'],
      available: (ctx) => (ctx.c.skillXp.martial >= FIGHT_MARTIAL_XP ? null : 'lock.skill'),
      apply: (ctx, rng) => {
        const money = receiveFromFaction(ctx, guildAt(ctx, ctx.c.location), ctx.c.location, ESCORT_PAY);
        occupy(ctx, 'action.toil', CARAVAN_WEEKS);
        if (rng.chance(AMBUSH_PPM)) { wound(ctx, 3); return { result: 'escort_hurt', params: { money } }; }
        return { result: 'escort', params: { money } };
      },
    },
    { id: 'decline', costs: ['opportunity'], apply: () => ({ result: 'decline' }) },
  ],
};

// —— Họ lớn kiện ruộng (Q4, Q8) ——
export const SUIT_FEE = 200;
export const SETTLE_PRICE = 500;
/** Thắng kiện: (700 − 4 × độ tham)‰ — quan thanh liêm xử theo sổ ruộng, quan tham nghiêng về nhà có thế. */
const SUIT_WIN_PPM = 700_000;
const SUIT_GREED_PPM = 4_000;
const disputable = (ctx: EventContext) => {
  const h = ctx.c.household;
  return (h.tenure === 'owner' || h.tenure === 'landlord') && h.landMu >= 2 && ctx.c.location === ctx.c.home;
};
export const landSuit: EventDef = {
  id: 'event.land_suit',
  factions: (ctx) => ({ clan: leadClan(ctx, ctx.c.home) }),
  tone: { clan: 'grudge' },
  attitude: { sue_won: { clan: -20 }, sue_lost: { clan: -10 }, settle: { clan: 5 }, yield: { clan: 10 } },
  category: 'economy',
  weight: (ctx) => (disputable(ctx) && leadClan(ctx, ctx.c.home) ? 6_000 : 0),
  cooldownTicks: 216,
  bonds: { sue_won: { hostility: 30 }, sue_lost: { hostility: 20 }, settle: { trust: 5 }, yield: { closeness: 5 } },
  // Người thật: trưởng họ đứng đầu quận
  cast: (ctx) => leaderOf(ctx, leadClan(ctx, ctx.c.home)),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), clan: clanSurname(leadClan(ctx, ctx.c.home)), fee: SUIT_FEE, price: SETTLE_PRICE }),
  figure: castOr(() => man('old', 'rich')),
  choices: [
    {
      id: 'sue', costs: ['money', 'risk'],
      available: (ctx) => (ctx.c.household.money < SUIT_FEE ? 'lock.money' : null),
      apply: (ctx, rng) => {
        payFaction(ctx, government(ctx), ctx.c.home, SUIT_FEE);
        if (rng.chance(SUIT_WIN_PPM - SUIT_GREED_PPM * (government(ctx)?.greed ?? 0))) return { result: 'sue_won' };
        return { result: 'sue_lost', params: { land: giveLandTo(ctx, ctx.npc, 1) } };
      },
    },
    {
      id: 'settle', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= SETTLE_PRICE ? null : 'lock.money'),
      apply: (ctx) => { payPerson(ctx, SETTLE_PRICE); return { result: 'settle' }; },
    },
    { id: 'yield', costs: ['opportunity'], apply: (ctx) => ({ result: 'yield', params: { land: giveLandTo(ctx, ctx.npc, 1) } }) },
  ],
};

// —— Họ lớn dạm hỏi (Q4, Q10: thông gia họ lớn) ——
/** Lễ dạm gấp bốn quà thăm hỏi (mai mối thường gấp đôi); gặp mặt thì thân hơn, tin hơn mai mối thường. */
export const CLAN_MATCH_FEE_X = 4;
const clanMatches = (ctx: EventContext): NpcState[] => {
  const clan = leadClan(ctx, ctx.c.location);
  if (!clan) return [];
  const ids = new Set(clan.members);
  return matchCandidates(ctx).filter((n) => ids.has(n.id));
};
export const clanMatch: EventDef = {
  id: 'event.clan_match',
  factions: (ctx) => ({ clan: leadClan(ctx, ctx.c.location) }),
  tone: { clan: 'favor' },
  attitude: { meet: { clan: 10 }, decline: { clan: -3 } },
  category: 'daily',
  weight: (ctx) => (ctx.age >= 18 && leadClan(ctx, ctx.c.location) && clanMatches(ctx).length ? 8_000 : 0),
  cooldownTicks: 108,
  bonds: { meet: { closeness: 40, trust: 20 } },
  cast: (ctx, rng) => pickOne(clanMatches(ctx), rng),
  variant: named,
  params: (ctx) => ({ ...npcName(ctx), clan: clanSurname(leadClan(ctx, ctx.c.location)), fee: GIFT_BY_BACKGROUND[ctx.c.background] * CLAN_MATCH_FEE_X }),
  figure: castOr(() => ({ gender: 'female', ageBand: 'old', class: 'rich' })),
  choices: [
    {
      id: 'meet', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= GIFT_BY_BACKGROUND[ctx.c.background] * CLAN_MATCH_FEE_X ? null : 'lock.money'),
      apply: (ctx) => { payPerson(ctx, GIFT_BY_BACKGROUND[ctx.c.background] * CLAN_MATCH_FEE_X); return { result: 'meet' }; },
    },
    { id: 'decline', costs: ['opportunity'], apply: () => ({ result: 'decline' }) },
  ],
};

export const FACTION_EVENTS: readonly EventDef[] = [corveeLevy, greedyLevy, reliefLine, banditLure, banditRaid, reportBandits, joinCaravan, landSuit, clanMatch];
