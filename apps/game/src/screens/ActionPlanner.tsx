import { t } from '@tsvl/content';
import { ACTION_GROUPS, type ActionOption, type ActionProgress, type BreakthroughPreview, type Cargo, type CareerView, type CultivationView, type HaulOption, type HouseholdView, type MonthPlan, type NpcView, type PlanSlot, type Tick, type TravelOption } from '@tsvl/shared';
import { useEffect, useState } from 'preact/hooks';
import { paletteSplit } from '../app/career';
import { breakthroughAsk, cultivationNote, needsConfirm } from '../app/cultivation';
import { foodForecast } from '../app/forecast';
import { haulRows } from '../app/goods';
import { inlineDate } from '../app/format';
import { isSocial, planDirty, planInvalid, socialCandidates, socialLockOf } from '../app/plan';
import { relationKeys } from '../app/people';
import { personPortraitOf } from '../ui/portraits';
import type { WorldInfo } from '../app/state';
import { ACTION_CHAR } from '../ui/icons';
import { Portrait, Seal } from '../ui/ink';

interface Props {
  plan: MonthPlan | null; draft: MonthPlan; active: ActionProgress | null; slotIndex: number;
  actions: ActionOption[]; travel: TravelOption[]; world: WorldInfo | null; locked: boolean;
  /** Hộ và tick hiện tại, cho dự báo "đủ ăn tới…" (F4). */
  household: HouseholdView; tick: Tick;
  /** Người trong quận (kèm khóa xã giao) và người thân, người quen ở mọi quận — cho ô xã giao (v0.5 F2). */
  people: NpcView[]; circle: NpcView[];
  /** Nghề đang làm (v0.7 F1): việc của nghề lên đầu, việc riêng nghề khác gom một dòng. */
  career: CareerView | null;
  /** Chuyến buôn đi được từ đây (v0.7 F3b), chỉ khi là thương nhân. */
  hauls: HaulOption[];
  /** Đường tu (v0.8 F2): linh khí nơi ở trên ô tu luyện, cơ hội trên ô đột phá, hỏi lại trước khi xếp đột phá. */
  cultivation: CultivationView;
  onDraft: (plan: MonthPlan) => void; onApply: () => void; onUndo: () => void;
}

const sealOf = (id: string) => ACTION_CHAR[id] ?? { char: '行', tone: 'ink' as const };

/** Chip giá: thể lực, rủi ro, tiền. Mức "không" bỏ đi cho gọn, trừ tiền (để thấy việc nào không tốn tiền). */
function CostChips({ option, risk, slots }: { option: ActionOption; risk?: string; slots?: number }) {
  const r = risk ?? option.cost.risk;
  return (
    <span class="chips">
      {option.cost.stamina !== 'cost.none' && <span class="chip">{t(option.cost.stamina)}</span>}
      {r !== 'risk.none' && <span class={`chip${r === 'risk.high' ? ' hi' : ''}`}>{t(r)}</span>}
      <span class={`chip${option.cost.money === 'money.none' ? ' ok' : ' hi'}`}>{t(option.cost.money)}</span>
      {(slots ?? option.slots) > 1 && <span class="chip">{t('ui.plan.slots', { count: slots ?? option.slots })}</span>}
      {option.careerWork && <span class="chip career" title={t('ui.plan.career_work_hint')}>{t('ui.plan.career_work')}</span>}
    </span>
  );
}

/**
 * Dự báo "đủ ăn tới…" (F4): kho riêng, rồi kho cộng tiền mua thêm ở giá chợ đang đứng. Kế hoạch có làm ruộng thì nói
 * thêm có kịp mùa gặt không. Theo bản nháp, nên đổi ô ruộng là thấy ngay.
 */
function FoodForecastLine({ household, tick, farming }: { household: HouseholdView; tick: Tick; farming: boolean }) {
  const f = foodForecast(household, tick, farming);
  if (!f) return null;
  return (
    <p class={`food-forecast tone-${f.tone}`} role="status">
      <Seal char="糧" tone={f.tone === 'good' ? 'jade' : f.tone === 'warn' ? 'ochre' : 'red'} />
      <span>
        {t(f.key, { grain: inlineDate(f.grainUntil), until: inlineDate(f.foodUntil), weeks: f.weeks })}
        {f.harvest && <> {t(f.harvest.inTime ? 'ui.food.harvest_ok' : 'ui.food.harvest_short', { harvest: inlineDate(f.harvest.at) })}</>}
      </span>
    </p>
  );
}

/**
 * Kế hoạch tháng dạng thẻ tuần (đề xuất giao diện P0). Bấm thẻ mở bảng chọn. Chỉ chặn kế hoạch sai về ý nghĩa
 * (hành động không có, đi mà không có đích); khóa của lúc này chỉ cảnh báo vì sim xét lại từng ô khi chạy (ADR 0008).
 * Bản nháp do màn Đời người giữ, để bấm tua là áp dụng luôn.
 */
export function ActionPlanner({ plan, draft, active, slotIndex, actions, travel, world, locked, household, tick, people, circle, career, hauls, cultivation, onDraft, onApply, onUndo }: Props) {
  const [picking, setPicking] = useState<number | null>(null);
  useEffect(() => { if (locked) setPicking(null); }, [locked]);
  const dirty = planDirty(draft, plan);
  const invalid = planInvalid(draft, actions, travel);
  const name = (county: number | undefined) => (county === undefined ? '' : world?.map.counties[county]?.name ?? '');
  // Người được nhắm tới: trong quận, hay người thân, người quen đã đi nơi khác (để còn đọc được tên)
  const personName = (id: string | undefined) => (id === undefined ? '' : (people.find((p) => p.id === id) ?? circle.find((p) => p.id === id))?.name ?? '');
  const choose = (i: number, slot: PlanSlot) => {
    onDraft({ slots: draft.slots.map((s, k) => (k === i ? slot : s)) as MonthPlan['slots'] });
    setPicking(null);
  };

  return (
    <section class="planner" aria-label={t('ui.plan.title')}>
      <div class="planner-head"><span class="section-title">{t('ui.plan.title')}</span><span class="muted small">{t('ui.plan.repeat')}</span></div>
      <FoodForecastLine household={household} tick={tick} farming={draft.slots.some((s) => s.action === 'action.farm')} />
      {active && <p class="small active-action" role="status">{t('ui.plan.active', { action: t(active.action), remaining: active.remaining, total: active.total })}</p>}
      <div class="weeks">
        {draft.slots.map((slot, i) => {
          const occupied = !!active && i >= slotIndex && i < slotIndex + active.remaining;
          const shown = occupied && active ? { action: active.action, target: active.target } : slot;
          const option = actions.find((a) => a.id === shown.action);
          const journey = shown.action === 'action.travel' ? travel.find((p) => p.county === shown.target) : null;
          // Chuyến buôn (F3b): giá, rủi ro, số ô đi về và khóa theo quận đích, hàng chở
          const cargo: Cargo = (shown as PlanSlot).cargo ?? 'grain';
          const trip = shown.action === 'action.haul' ? hauls.find((h) => h.county === shown.target && h.cargo === cargo) ?? null : null;
          const seal = sealOf(shown.action);
          const social = !occupied && isSocial(actions, shown.action);
          const why = social ? socialLockOf(slot, people) ?? option?.locked ?? null : trip ? trip.locked : option?.locked ?? null;
          const state = i < slotIndex ? 'past' : i === slotIndex ? 'now' : 'next';
          const disabled = locked || occupied;
          return (
            <button key={i} type="button" class={`week week-${state}${occupied ? ' occupied' : ''}`} disabled={disabled} onClick={() => setPicking(i)}
              aria-label={`${t(`tenday.${i}`)}: ${t(shown.action)}. ${t('ui.plan.change')}`}>
              <span class="week-t"><span>{t(`tenday.${i}`)}</span><span>{occupied ? t('ui.plan.occupied') : t(`ui.plan.week_${state}`)}</span></span>
              <span class="week-a"><Seal char={seal.char} tone={seal.tone} />{t(shown.action)}{(shown.action === 'action.travel' || shown.action === 'action.haul') && shown.target !== undefined && <span class="week-to">{t('ui.plan.to', { place: name(shown.target) })}</span>}{shown.action === 'action.haul' && <span class="week-to">{t('ui.haul.carry', { cargo: t(cargoKey(cargo)).toLowerCase() })}</span>}{social && slot.person !== undefined && <span class="week-to">{t('ui.plan.with', { name: personName(slot.person) })}</span>}</span>
              {option && <CostChips option={option} risk={journey?.risk ?? trip?.risk} slots={journey?.slots ?? trip?.slots} />}
              {option && option.gains.length > 0 && <span class="week-gain">{option.gains.map((g) => t(g)).join(' · ')}</span>}
              {why && !occupied && <span class="week-warn">{t('ui.plan.locked_now', { reason: t(why) })}</span>}
              {social && slot.person === undefined && <span class="week-warn">{t('ui.social.no_person')}</span>}
              {shown.action === 'action.travel' && !journey && !occupied && <span class="week-warn">{t('lock.route')}</span>}
              {shown.action === 'action.haul' && !trip && !occupied && <span class="week-warn">{t('lock.route')}</span>}
            </button>
          );
        })}
      </div>
      {dirty && (
        <div class={`plan-dirty${invalid ? ' invalid' : ''}`} role="status">
          <span>{t(invalid ? 'ui.plan.dirty_invalid' : 'ui.plan.dirty')}</span>
          <span class="row">
            <button class="btn ghost small-btn" type="button" disabled={locked} onClick={onUndo}>{t('ui.plan.undo')}</button>
            <button class="btn small-btn" type="button" disabled={locked || invalid} onClick={onApply}>{t('ui.plan.apply_short')}</button>
          </span>
        </div>
      )}
      {picking !== null && (
        <ActionPalette week={picking} current={draft.slots[picking]!} actions={actions} travel={travel} name={name} people={people} career={career} hauls={hauls} cultivation={cultivation}
          onPick={(slot) => choose(picking, slot)} onClose={() => setPicking(null)} />
      )}
    </section>
  );
}

/** Bảng chọn hành động gom theo nhóm của GDD 3.2 E; đi lại thì chọn luôn điểm đến. */
function ActionPalette({ week, current, actions, travel, name, people, career, hauls, cultivation, onPick, onClose }: {
  week: number; current: PlanSlot; actions: ActionOption[]; travel: TravelOption[]; name: (c: number) => string; people: NpcView[];
  career: CareerView | null; hauls: HaulOption[]; cultivation: CultivationView; onPick: (slot: PlanSlot) => void; onClose: () => void;
}) {
  // Đột phá (v0.8 F2): hỏi lại, nói rõ cơ hội và mất gì nếu hỏng, rồi mới xếp
  const [asking, setAsking] = useState<BreakthroughPreview | null>(null);
  // Chuyến buôn (F3b): chọn việc trước, rồi chọn quận đích và hàng
  const [trading, setTrading] = useState(false);
  const { shown, foreign } = paletteSplit(actions, career);
  // Xã giao (v0.5 F2): chọn việc trước, rồi chọn người trong quận
  const [social, setSocial] = useState<ActionOption | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="palette-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="palette" role="dialog" aria-modal="true" aria-label={t('ui.plan.pick', { week: t(`tenday.${week}`) })}>
        <div class="palette-head">
          <span class="section-title">{t('ui.plan.pick', { week: t(`tenday.${week}`) })}</span>
          <button class="close" type="button" onClick={onClose} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
        </div>
        {asking ? <BreakthroughConfirm preview={asking} onConfirm={() => onPick({ action: 'action.breakthrough' })} onBack={() => setAsking(null)} />
          : trading ? <HaulPicker hauls={hauls} current={current} name={name} onPick={onPick} onBack={() => setTrading(false)} />
          : social ? <PersonPicker action={social} current={current} people={people} onPick={onPick} onBack={() => setSocial(null)} /> : <>
        <p class="small muted">{t('ui.plan.pick_hint')}</p>
        {ACTION_GROUPS.map((group) => {
          const list = shown.filter((a) => a.group === group);
          // Nhóm đi lại bày theo điểm đến, giá và khóa của việc đi đường (chuyến buôn chọn ở chợ, F3b)
          const go = actions.find((a) => a.id === 'action.travel');
          const haul = group === 'travel' && hauls.length ? list.find((a) => a.id === 'action.haul') : undefined;
          if (!list.length || (group === 'travel' && (!travel.length || !go))) return null;
          return (
            <div key={group} class="palette-group">
              <span class="group-k">{t(`group.${group}`)}</span>
              <div class="tiles">
                {group === 'travel'
                  ? <>
                  {haul && (
                    <button type="button" class={`tile${haul.locked ? ' locked' : ''}${current.action === 'action.haul' ? ' chosen' : ''}`} onClick={() => setTrading(true)}>
                      <span class="tile-a"><Seal char={sealOf(haul.id).char} tone={sealOf(haul.id).tone} />{t(haul.id)}</span>
                      <CostChips option={haul} />
                      <span class="tile-gain">{t('ui.haul.pick_hint')}</span>
                      {haul.locked && <span class="tile-why">{t(haul.locked)}</span>}
                    </button>
                  )}
                  {travel.map((p) => (
                    <button key={p.county} type="button" class={`tile${current.action === 'action.travel' && current.target === p.county ? ' chosen' : ''}`} onClick={() => onPick({ action: 'action.travel', target: p.county })}>
                      <span class="tile-a"><Seal char="行" tone="red" />{name(p.county)}</span>
                      <CostChips option={go!} risk={p.risk} slots={p.slots} />
                      {go!.locked && <span class="tile-why">{t(go!.locked)}</span>}
                    </button>
                  ))}
                  </>
                  : list.map((a) => {
                    const seal = sealOf(a.id);
                    const note = cultivationNote(a.id, cultivation);
                    const pick = () => (group === 'social' ? setSocial(a)
                      : needsConfirm(a.id, a.locked) && cultivation.breakthrough ? setAsking(cultivation.breakthrough) : onPick({ action: a.id }));
                    return (
                      <button key={a.id} type="button" class={`tile${a.locked ? ' locked' : ''}${current.action === a.id ? ' chosen' : ''}`} onClick={pick}>
                        <span class="tile-a"><Seal char={seal.char} tone={seal.tone} />{t(a.id)}</span>
                        <CostChips option={a} />
                        {a.gains.length > 0 && <span class="tile-gain">{a.gains.map((g) => t(g)).join(' · ')}</span>}
                        {note && <span class="tile-gain tile-dao">{t(note.key, note.params)}</span>}
                        {a.locked && <span class="tile-why">{t(a.locked)}</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
        {foreign.length > 0 && (
          <p class="small muted other-careers">
            {t('ui.plan.other_careers')}: {foreign.map((a) => t('ui.plan.career_of', { action: t(a.id), career: `career.${a.career}` })).join(' · ')}
          </p>
        )}
        </>}
      </div>
    </div>
  );
}

/**
 * Chọn người cho một việc xã giao (v0.5 F2): người trong quận, kèm vai, quan hệ và lý do khóa sim gửi (người lạ, chưa đủ
 * thân, không hợp đôi…). Người đang bị khóa vẫn chọn được (sim xét lại khi ô chạy), như các việc khác.
 */
function PersonPicker({ action, current, people, onPick, onBack }: {
  action: ActionOption; current: PlanSlot; people: NpcView[]; onPick: (slot: PlanSlot) => void; onBack: () => void;
}) {
  const rows = socialCandidates(people, action.id);
  return (
    <div class="person-picker">
      <div class="row picker-head">
        <button type="button" class="btn ghost small-btn" onClick={onBack}>{t('ui.social.back')}</button>
        <span class="group-k">{t('ui.social.pick', { action: t(action.id) })}</span>
      </div>
      <p class="small muted">{t('ui.social.hint')}</p>
      {action.locked && <p class="small tile-why">{t(action.locked)}</p>}
      {rows.length === 0 ? <p class="small muted">{t('ui.social.none')}</p> : (
        <ul class="people-list">
          {rows.map(({ p, locked }) => (
            <li key={p.id}>
              <button type="button" class={`person${locked ? ' locked' : ''}${current.action === action.id && current.person === p.id ? ' chosen' : ''}`} onClick={() => onPick({ action: action.id, person: p.id })}>
                <Portrait src={personPortraitOf(p)} age={p.ageYears} />
                <span class="person-text">
                  <strong>{p.name}</strong>
                  <span class="small person-relation">{relationKeys(p).map((k) => t(k)).join(' · ') || t('bond.closeness.stranger')}</span>
                  <span class="small muted">{t('ui.people.age', { age: p.ageYears })} · {t(p.occupation)}</span>
                  {locked && <span class="small tile-why">{t(locked)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Hỏi lại trước khi xếp ô đột phá (v0.8 F2): cơ hội thành, tâm cảnh, linh thạch dùng, được gì, mất gì nếu hỏng. Dải chữ
 * theo cùng luật sim lúc này; ô chạy thật thì sim xét lại (tâm cảnh có thể đổi trước tuần ấy).
 */
function BreakthroughConfirm({ preview, onConfirm, onBack }: { preview: BreakthroughPreview; onConfirm: () => void; onBack: () => void }) {
  const a = breakthroughAsk(preview);
  return (
    <div class="bt-confirm">
      <div class="row picker-head">
        <button type="button" class="btn ghost small-btn" onClick={onBack}>{t('ui.social.back')}</button>
        <span class="group-k">{t('ui.bt.title')}</span>
      </div>
      <p class="small">{t('ui.bt.intro')}</p>
      <dl class="attrs">
        <dt>{t('ui.bt.chance')}</dt><dd class="cap">{t(a.chance)}</dd>
        <dt>{t('ui.bt.mind')}</dt><dd>{t(a.mind)}</dd>
      </dl>
      {a.mindWarn && <p class="small tone-warn">{t('ui.bt.mind_warn')}</p>}
      <p class="small">{t(a.stones.key, a.stones.params)}</p>
      <p class="small tone-good">{t('ui.bt.win')}</p>
      <p class="small tone-bad">{t('ui.bt.lose')} {a.losses.map((k) => t(k)).join(' ')}</p>
      <span class="row bt-actions">
        <button type="button" class="btn ghost small-btn" onClick={onBack}>{t('ui.bt.cancel')}</button>
        <button type="button" class="btn small-btn" onClick={onConfirm}>{t('ui.bt.confirm')}</button>
      </span>
    </div>
  );
}

/** Khóa nội dung tên hàng chở: lương thực hay một món hàng. */
const cargoKey = (cargo: Cargo) => (cargo === 'grain' ? 'ui.goods.grain' : `good.${cargo}`);

/**
 * Chọn chuyến buôn (v0.7 F3b): mỗi quận đích một dòng (quận lời nhất lên đầu), số ô đi về, rủi ro đường, băng giữ đường;
 * mỗi hàng một ô: lời mỗi đấu, mỗi phần và lời cả chuyến nếu đường êm, theo giá niêm yết lúc này; hàng lỗ thì ghi lý do.
 */
function HaulPicker({ hauls, current, name, onPick, onBack }: {
  hauls: HaulOption[]; current: PlanSlot; name: (c: number) => string; onPick: (slot: PlanSlot) => void; onBack: () => void;
}) {
  const rows = haulRows(hauls);
  return (
    <div class="haul-picker">
      <div class="row picker-head">
        <button type="button" class="btn ghost small-btn" onClick={onBack}>{t('ui.social.back')}</button>
        <span class="group-k">{t('ui.haul.title')}</span>
      </div>
      <p class="small muted">{t('ui.haul.hint')}</p>
      {rows.length === 0 ? <p class="small muted">{t('ui.haul.none')}</p> : rows.map((r) => {
        const first = r.options[0]!;
        return (
          <div key={r.county} class="haul-row">
            <div class="haul-head">
              <span class="tile-a"><Seal char="販" tone="red" />{name(r.county)}</span>
              <span class="chips">
                <span class="chip">{t('ui.plan.slots', { count: first.slots })}</span>
                {first.risk !== 'risk.none' && <span class={`chip${first.risk === 'risk.high' ? ' hi' : ''}`}>{t(first.risk)}</span>}
                {first.danger && <span class="chip hi">{t('ui.haul.danger')}</span>}
              </span>
            </div>
            <div class="tiles haul-cargos">
              {r.options.map((h) => (
                <button key={h.cargo} type="button" class={`tile${h.locked ? ' locked' : ''}${current.action === 'action.haul' && current.target === h.county && (current.cargo ?? 'grain') === h.cargo ? ' chosen' : ''}`}
                  onClick={() => onPick({ action: 'action.haul', target: h.county, cargo: h.cargo })}>
                  <span class="tile-a">{t(cargoKey(h.cargo))}</span>
                  <span class={`small${h.margin > 0 ? ' tone-good' : ' tone-bad'}`}>{t(h.cargo === 'grain' ? 'ui.haul.margin_dou' : 'ui.haul.margin_part', { coin: h.margin })}</span>
                  {h.profit > 0 && <span class="tile-gain">{t('ui.haul.profit', { coin: h.profit })}</span>}
                  {h.locked && <span class="tile-why">{t(h.locked)}</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
