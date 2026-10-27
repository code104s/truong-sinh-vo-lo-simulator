// Tuyển tập sự kiện. S5: ba sự kiện mẫu thử đủ các kiểu giá (tiền, lương thực, thể lực, thời gian, rủi ro);
// S6 viết đủ khoảng 30 (ADR 0014). Văn bản: packages/content, khóa event.<id>.*.
import { calendarOf, type EventFigure } from '@tsvl/shared';
import type { Rng } from '../core/rng';
import { HEAL_FEE } from '../economy/income';
import { loseGrain, occupy, payTo, spendStamina, wound } from './effects';
import { sortedCatalog, type EventContext, type EventDef } from './engine';

const figure = (rng: Rng, ageBand: EventFigure['ageBand'], cls: EventFigure['class']): EventFigure => ({ gender: rng.int(0, 1) === 0 ? 'male' : 'female', ageBand, class: cls });
const ill = (ctx: EventContext) => ctx.c.conditions.some((x) => x.kind === 'illness');
const kindHearted = (ctx: EventContext) => ctx.c.personality === 'kind' || ctx.c.personality === 'righteous';

/** Phí thầy thuốc giỏi đi ngang: bằng phí chữa bệnh nặng ở trấn, nhưng tới tận nơi. */
export const WANDERING_PHYSICIAN_FEE = HEAL_FEE.serious + 50;
export const BEGGAR_GIFT = 10;
export const BEGGAR_MEAL = 30;

const beggar: EventDef = {
  id: 'event.beggar',
  category: 'daily',
  // Người xin ăn chỉ tới nhà có cái ăn; mùa đông đói rét nên tới nhiều hơn
  weight: (ctx) => (ctx.age >= 12 && ctx.c.household.grain >= BEGGAR_GIFT ? (calendarOf(ctx.tick).season === 'winter' ? 20_000 : 10_000) : 0),
  cooldownTicks: 72,
  variant: (ctx) => (calendarOf(ctx.tick).season === 'winter' ? 'winter' : null),
  figure: (_ctx, rng) => figure(rng, rng.int(0, 1) === 0 ? 'old' : 'child', 'poor'),
  choices: [
    { id: 'give', costs: ['grain'], apply: (ctx) => ({ result: 'give', params: { lost: loseGrain(ctx, BEGGAR_GIFT) } }) },
    {
      id: 'share_meal', costs: ['grain', 'stamina'],
      // Nấu cho bữa nóng, giữ lại qua đêm: chỉ người hiền hậu hay chính trực mới làm
      available: (ctx) => (kindHearted(ctx) ? null : 'lock.personality'),
      apply: (ctx) => { const lost = loseGrain(ctx, BEGGAR_MEAL); spendStamina(ctx, 40); return { result: 'share_meal', params: { lost } }; },
    },
    {
      id: 'refuse', costs: ['risk'],
      apply: (ctx, rng) => (rng.chance(200_000) ? { result: 'refuse_stolen', params: { lost: loseGrain(ctx, 5) } } : { result: 'refuse' }),
    },
  ],
};

const wanderingPhysician: EventDef = {
  id: 'event.wandering_physician',
  category: 'health',
  // Thầy thuốc giỏi chỉ đi ngang làng; ở trấn, thành thì đã có thầy thuốc
  weight: (ctx) => (ctx.age >= 12 && ill(ctx) && ctx.logic.settlementKind[ctx.c.location] === 'village' ? 60_000 : 0),
  cooldownTicks: 108,
  params: () => ({ fee: WANDERING_PHYSICIAN_FEE }),
  figure: (_ctx, rng) => figure(rng, rng.int(0, 1) === 0 ? 'adult' : 'old', 'common'),
  choices: [
    {
      id: 'pay', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= WANDERING_PHYSICIAN_FEE ? null : 'lock.money'),
      apply: (ctx) => {
        payTo(ctx, ctx.c.location, WANDERING_PHYSICIAN_FEE);
        ctx.c.conditions = ctx.c.conditions.filter((x) => x.kind !== 'illness');
        ctx.c.health = Math.min(ctx.c.healthMax, ctx.c.health + 50);
        return { result: 'pay' };
      },
    },
    {
      id: 'herbs', costs: ['risk'],
      // Tự hái lá thuốc theo lời chỉ: hên thì đỡ, xui thì nặng thêm
      apply: (ctx, rng) => {
        if (rng.chance(500_000)) {
          for (const x of ctx.c.conditions) if (x.kind === 'illness') x.weeksLeft = Math.max(1, x.weeksLeft - 2);
          return { result: 'herbs_ok' };
        }
        ctx.c.health = Math.max(1, ctx.c.health - 30);
        return { result: 'herbs_bad' };
      },
    },
  ],
};

const taxCollector: EventDef = {
  id: 'event.tax_collector',
  category: 'economy',
  // Còn nợ thuế đinh (S4) thì quan sai sớm muộn cũng tới
  weight: (ctx) => (ctx.c.household.independent && ctx.c.household.taxDebt > 0 ? 150_000 : 0),
  cooldownTicks: 12,
  params: (ctx) => ({ amount: ctx.c.household.taxDebt }),
  figure: (_ctx, rng) => figure(rng, 'adult', 'official'),
  choices: [
    {
      id: 'pay', costs: ['money'],
      available: (ctx) => (ctx.c.household.money >= ctx.c.household.taxDebt ? null : 'lock.money'),
      apply: (ctx) => { payTo(ctx, ctx.c.home, ctx.c.household.taxDebt); ctx.c.household.taxDebt = 0; return { result: 'pay' }; },
    },
    {
      id: 'corvee', costs: ['time', 'stamina'],
      // Đi phu trừ thuế: không đi được khi đang dở một chuyến đi hay việc dài
      available: (ctx) => (ctx.player.active ? 'lock.busy' : null),
      apply: (ctx) => { ctx.c.household.taxDebt = 0; occupy(ctx, 'action.corvee'); return { result: 'corvee' }; },
    },
    {
      id: 'flee', costs: ['risk', 'opportunity'],
      // Trốn: phúc duyên cao thì dễ thoát; bị bắt thì ăn đòn, nợ vẫn còn, quan sai sẽ quay lại
      apply: (ctx, rng) => {
        if (rng.chance(600_000 - ctx.c.luck * 40_000)) { wound(ctx, 2); return { result: 'flee_caught' }; }
        return { result: 'flee_escaped' };
      },
    },
  ],
};

export const EVENTS: readonly EventDef[] = sortedCatalog([beggar, taxCollector, wanderingPhysician]);
