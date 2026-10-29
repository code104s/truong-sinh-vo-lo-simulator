// Hành động, kế hoạch tháng, di chuyển và nhật ký lệnh (ADR 0008, 0009, 0011; v0.3: ADR 0012, 0014). Chỉ kiểu và validate, không có luật.
import { CAREERS, type CareerId } from './careers';
import { vChoiceId, vContentId, vNpcId, type ChoiceId, type ContentId, type NpcId } from './contentId';
import { GOODS, type GoodId } from './economy';
import { int, lit, nat, nullable, obj, oneOf, opt, tagged, type Validator } from './schema';
import { vNewLifeConfig, type NewLifeConfig } from './world';

export const ADVANCE_MODES = ['week', 'month', 'year', 'untilEvent'] as const;
export type AdvanceMode = (typeof ADVANCE_MODES)[number];

/** Id hành động, vd. "action.farm". */
export type ActionId = string;
/** Chỉ số quận trong RegionMapData.counties. */
export type CountyIndex = number;

/** Id thế lực (định nghĩa đầy đủ ở `factions.ts`; lặp lại ở đây để không vòng import). */
const vFactionRef: Validator<string> = {
  check: (u, p) => (typeof u === 'string' && /^f[1-9][0-9]*$/.test(u) ? null : `${p}: cần id thế lực dạng "f3"`),
};

export const vActionId: Validator<ActionId> = {
  check: (u, p) => (typeof u === 'string' && /^action\.[a-z0-9_]+$/.test(u) ? null : `${p}: cần id hành động dạng "action.ten"`),
};

export interface PlanSlot {
  action: ActionId;
  /** Quận đích, chỉ khi di chuyển. */
  target?: CountyIndex;
  /** Người được nhắm tới, chỉ cho hành động xã giao (v0.5, ADR 0017). */
  person?: NpcId;
  /** Hàng chở, chỉ cho chuyến buôn (v0.7 S3b, ADR 0021); không có là lương thực. */
  cargo?: Cargo;
}

/** Hàng của một chuyến buôn: lương thực hay một món hàng. */
export const CARGOS = ['grain', ...GOODS] as const;
export type Cargo = 'grain' | GoodId;

/** Ba ô của một tháng (thượng, trung, hạ tuần). Kế hoạch tự lặp cho tới khi người chơi sửa. */
export interface MonthPlan {
  slots: [PlanSlot, PlanSlot, PlanSlot];
}

export const ACTION_GROUPS = ['livelihood', 'study', 'social', 'rest', 'heal', 'travel'] as const;
export type ActionGroup = (typeof ACTION_GROUPS)[number];

/** Hành động khả dụng ở nơi đang đứng, sim tính sẵn. FE chỉ hiển thị, không chứa luật. */
export interface ActionOption {
  id: ActionId;
  group: ActionGroup;
  /** Độ dài (số ô). */
  slots: number;
  /** Mức chữ, vd. stamina "cost.high", risk "risk.low", money "cost.money.low" hoặc "cost.none". */
  cost: { stamina: ContentId; risk: ContentId; money: ContentId };
  /** Kết quả chính, vd. "skill.farming". */
  gains: ContentId[];
  /** Lý do bị khóa, vd. "lock.winter"; null nếu làm được. */
  locked: ContentId | null;
  /** Việc riêng của một nghề (v0.7 F1): chỉ người làm nghề ấy, đủ bậc, mới làm được. */
  career?: CareerId;
  /** Ô làm việc này tính vào năm làm nghề người chơi đang làm (v0.7 F1). */
  careerWork?: true;
}

export interface TravelOption {
  county: CountyIndex;
  slots: number;
  risk: ContentId;
  /** Băng cướp giữ đường đi qua (v0.6), nếu có. Id thế lực dạng "f3"; kiểm ở `factions.ts`. */
  danger?: string;
}

/**
 * Một chuyến buôn đi được từ quận đang đứng (v0.7 F3b), sim tính sẵn theo giá niêm yết hai chợ lúc này; chỉ gửi khi người
 * chơi là thương nhân. Sim xét lại khóa lúc khởi hành.
 */
export interface HaulOption {
  county: CountyIndex;
  cargo: Cargo;
  /** Số ô cả đi lẫn về. */
  slots: number;
  /** Lời mỗi đấu lương hay mỗi phần hàng (văn), đã trừ phí chở; âm là lỗ. */
  margin: number;
  /** Lời cả chuyến nếu đường êm (văn), theo vốn bậc nghề, kho nơi mua, quỹ nơi bán; chưa trừ phần nộp hội. */
  profit: number;
  /** Rủi ro thân thể đi đường, như di chuyển. */
  risk: ContentId;
  /** Băng cướp giữ đường đi qua: dễ mất cả hàng. */
  danger?: string;
  locked: ContentId | null;
}

export interface TravelPreview {
  county: CountyIndex;
  /** Các quận đi qua, gồm điểm đầu và điểm cuối. */
  route: CountyIndex[];
  days: number;
  slots: number;
  risk: ContentId;
}

/** Tiến độ để giao diện khóa các ô của hành động đang dở. */
export interface ActionProgress { action: ActionId; remaining: number; total: number; target?: CountyIndex }
export const vActionProgress = obj<ActionProgress>({ action: vActionId, remaining: nat, total: nat, target: opt(nat) });

export const STAMINA_BANDS = ['fresh', 'tired', 'exhausted'] as const;
export type StaminaBand = (typeof STAMINA_BANDS)[number];

export interface SkillView {
  id: ContentId;
  rank: ContentId;
}

/** Lệnh đổi trạng thái đời, đã bỏ reqId, để phát lại (ADR 0011). */
export type RecordedCommand =
  | { type: 'NEW_LIFE'; config: NewLifeConfig }
  | { type: 'SET_PLAN'; plan: MonthPlan }
  | { type: 'ADVANCE'; mode: AdvanceMode }
  | { type: 'TRADE'; grain: number }
  | { type: 'CHOOSE'; instance: number; choice: ChoiceId }
  /** Rời nghề (v0.7 S1, ADR 0020): mất bậc, thầy phật lòng. */
  | { type: 'LEAVE_CAREER' }
  /** Mua (> 0) hoặc bán (< 0) hàng, đơn vị phân (v0.7 S3b, ADR 0021). */
  | { type: 'TRADE_GOODS'; good: GoodId; qty: number };

/** Lượng lương thực của lệnh TRADE (thăng), lượng hàng của TRADE_GOODS (phân): > 0 mua, < 0 bán, khác 0 (ADR 0012). */
export const vTradeGrain: Validator<number> = {
  check: (u, p) => (Number.isSafeInteger(u) && u !== 0 ? null : `${p}: cần số nguyên khác 0`),
};

export interface CommandRecord {
  /** Tăng dần từ 0, chống áp dụng trùng. */
  seq: number;
  /** Tick lúc lệnh được áp. */
  tick: number;
  cmd: RecordedCommand;
}

export const vPlanSlot = obj<PlanSlot>({ action: vActionId, target: opt(nat), person: opt(vNpcId), cargo: opt(oneOf(CARGOS)) });

export const vMonthPlan: Validator<MonthPlan> = (() => {
  const base = obj<MonthPlan>({ slots: { check: (u, p) => (Array.isArray(u) && u.length === 3 ? null : `${p}: cần đúng 3 ô`) } });
  return {
    check: (u, p) => {
      const e = base.check(u, p);
      if (e) return e;
      const slots = (u as MonthPlan).slots;
      for (let i = 0; i < 3; i++) {
        const se = vPlanSlot.check(slots[i], `${p}.slots[${i}]`);
        if (se) return se;
      }
      return null;
    },
  };
})();

export const vActionOption = obj<ActionOption>({
  id: vActionId,
  group: oneOf(ACTION_GROUPS),
  slots: nat,
  cost: obj<ActionOption['cost']>({ stamina: vContentId, risk: vContentId, money: vContentId }),
  gains: { check: (u, p) => (Array.isArray(u) ? u.map((g, i) => vContentId.check(g, `${p}[${i}]`)).find((e) => e) ?? null : `${p}: cần mảng`) },
  locked: nullable(vContentId),
  career: opt(oneOf(CAREERS)),
  careerWork: opt(lit(true)),
});

export const vTravelOption = obj<TravelOption>({ county: nat, slots: nat, risk: vContentId, danger: opt(vFactionRef) });

export const vHaulOption = obj<HaulOption>({
  county: nat, cargo: oneOf(CARGOS), slots: nat, margin: int, profit: int, risk: vContentId, danger: opt(vFactionRef), locked: nullable(vContentId),
});

export const vTravelPreview = obj<TravelPreview>({
  county: nat,
  route: { check: (u, p) => (Array.isArray(u) && u.length >= 1 ? u.map((c, i) => nat.check(c, `${p}[${i}]`)).find((e) => e) ?? null : `${p}: cần ít nhất 1 quận`) },
  days: nat,
  slots: nat,
  risk: vContentId,
});

export const vSkillView = obj<SkillView>({ id: vContentId, rank: vContentId });

type R<K extends RecordedCommand['type']> = Extract<RecordedCommand, { type: K }>;
export const vRecordedCommand: Validator<RecordedCommand> = tagged<RecordedCommand>({
  NEW_LIFE: obj<R<'NEW_LIFE'>>({ type: lit('NEW_LIFE'), config: vNewLifeConfig }),
  SET_PLAN: obj<R<'SET_PLAN'>>({ type: lit('SET_PLAN'), plan: vMonthPlan }),
  ADVANCE: obj<R<'ADVANCE'>>({ type: lit('ADVANCE'), mode: oneOf(ADVANCE_MODES) }),
  TRADE: obj<R<'TRADE'>>({ type: lit('TRADE'), grain: vTradeGrain }),
  CHOOSE: obj<R<'CHOOSE'>>({ type: lit('CHOOSE'), instance: nat, choice: vChoiceId }),
  LEAVE_CAREER: obj<R<'LEAVE_CAREER'>>({ type: lit('LEAVE_CAREER') }),
  TRADE_GOODS: obj<R<'TRADE_GOODS'>>({ type: lit('TRADE_GOODS'), good: oneOf(GOODS), qty: vTradeGrain }),
});

export const vCommandRecord = obj<CommandRecord>({ seq: nat, tick: nat, cmd: vRecordedCommand });
