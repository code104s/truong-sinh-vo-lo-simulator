import { t } from '@tsvl/content';
import { GRAIN_PER_DOU, type CalendarDate, type CharacterView, type FoodWeeksBand, type HungerBand, type StaminaBand } from '@tsvl/shared';
import type { ComponentChildren } from 'preact';
import { careerLine } from '../app/career';
import { realmLine } from '../app/cultivation';
import { dateText } from '../app/format';
import { reputationTone } from '../app/people';
import type { WorldInfo } from '../app/state';
import { CAREER_CHAR, KIND_CHAR, SEASON_CHAR } from '../ui/icons';
import { Enso, Portrait, Seal } from '../ui/ink';
import { PORTRAIT_MIN_AGE, portraitOf } from '../ui/portraits';

const STAMINA_PIPS: Record<StaminaBand, number> = { fresh: 3, tired: 2, exhausted: 1 };
const HUNGER_PIPS: Record<HungerBand, number> = { fed: 4, hungry: 3, starving: 2, famished: 1 };
const FOOD_PIPS: Record<FoodWeeksBand, number> = { none: 0, short: 1, season: 2, year: 3 };
const dou = (grain: number) => Math.floor(grain / GRAIN_PER_DOU);

function Pips({ on, of, tone }: { on: number; of: number; tone: 'good' | 'warn' | 'bad' }) {
  return <span class={`pips tone-${tone}`} aria-hidden="true">{Array.from({ length: of }, (_, i) => <i key={i} class={i < on ? 'on' : ''} />)}</span>;
}

/** `detail`: câu đầy đủ khi giá trị hiện rút gọn (rê chuột, trình đọc màn hình). */
function Meter({ label, value, detail, children, tone = 'plain' }: { label: string; value: string; detail?: string; children?: ComponentChildren; tone?: string }) {
  return (
    <div class={`meter tone-${tone}`} title={detail ?? value}>
      <span class="meter-k">{label}</span>
      <span class="meter-v" aria-label={detail}>{value}</span>
      {children}
    </div>
  );
}

/**
 * Thanh trạng thái trên cùng màn Đời người (đề xuất giao diện P0): ai, ở đâu, khi nào, và những thứ đổi từng tuần
 * — sức khỏe, thể lực, bụng, lương thực, tiền, ruộng. Đọc trong một giây; thuộc tính không đổi nằm ở thẻ Thân thế.
 */
export function StatusBar({ c, date, saved, world }: { c: CharacterView; date: CalendarDate; saved: boolean; world: WorldInfo | null }) {
  const place = world?.birthplaces.find((b) => b.id === c.birthplaceId);
  const h = c.household;
  const healthTone = c.healthBand === 'robust' || c.healthBand === 'healthy' ? 'good' : c.healthBand === 'weak' ? 'warn' : 'bad';
  const staminaTone = c.staminaBand === 'fresh' ? 'good' : c.staminaBand === 'tired' ? 'warn' : 'bad';
  const hungerTone = h.hungerBand === 'fed' ? 'good' : h.hungerBand === 'hungry' ? 'warn' : 'bad';
  const foodTone = !h.independent ? 'plain' : h.foodWeeksBand === 'none' ? 'bad' : h.foodWeeksBand === 'short' ? 'warn' : 'good';
  // Ô hẹp (3 × 2 dưới 1500px): chỉ ghi số đấu, dải đủ ăn thành vạch như thể lực, bụng; câu đầy đủ ở detail
  const food = h.independent ? t('ui.hud.dou', { dou: dou(h.grain) }) : t('ui.hud.parents');
  const foodDetail = h.independent
    ? `${t('ui.hud.dou', { dou: dou(h.grain) })} · ${t(`food.${h.foodWeeksBand}`)}`
    : h.grain > 0 ? `${t('ui.hud.parents')} · ${t('ui.hud.pocket', { dou: dou(h.grain) })}` : t('ui.hud.parents');
  // Tiếng tăm ở quận đang đứng (v0.5 F3): đổi theo nơi mình đứng, nên đặt cạnh tên nơi ở
  const here = world?.map.counties[c.location]?.name ?? '';
  const rep = t(`reputation.${c.reputation}`);
  const job = careerLine(c.career, c.canAct);
  // Cảnh giới (v0.8 F1): chỉ hiện khi đã bước qua phàm nhân
  const realm = realmLine(c.cultivation);
  const land = h.landMu > 0 ? `${t('ui.hud.mu', { mu: h.landMu })} · ${t(`tenure.${h.tenure}`)}` : h.tenure === 'tenant' ? t('tenure.tenant') : t('ui.hud.no_land');
  return (
    <header class="status-bar">
      <div class="who">
        <Portrait src={c.ageYears >= PORTRAIT_MIN_AGE ? portraitOf(c) : null} alt={c.name} age={c.ageYears} />
        <div class="who-text">
          <h2 class="char-name">{c.name}</h2>
          <p class="muted">
            {t(`gender.${c.gender}`)} · {t('ui.life.age', { age: c.ageYears })}
            {job && <>{' · '}<span class={`career-tag${c.career ? '' : ' none'}`}>{c.career && <Seal char={CAREER_CHAR[c.career.id].char} tone={CAREER_CHAR[c.career.id].tone} />}{t(job.key, job.params)}</span></>}
            {realm && <>{' · '}<span class="realm-tag"><Seal char="道" tone="jade" />{t(`realm.${realm}`)}</span></>}
          </p>
          <p class="small">
            {place && <Seal char={KIND_CHAR[place.kind]} tone="ink" />} {t('ui.life.here', { place: here })}
            {' · '}<span class={`reputation tone-${reputationTone(c.reputation)}`} title={t('ui.hud.reputation', { place: here, band: rep })}>{rep}</span>
          </p>
        </div>
      </div>
      <div class="meters">
        <Meter label={t('ui.hud.health')} value={t(`health.${c.healthBand}`)} tone={healthTone}>
          <span class="ink-bar"><span class={`ink-bar-fill band-${c.healthBand}`} style={{ width: `${c.healthPct}%` }} /></span>
        </Meter>
        <Meter label={t('ui.hud.stamina')} value={t(`stamina.${c.staminaBand}`)} tone={staminaTone}>
          <Pips on={STAMINA_PIPS[c.staminaBand]} of={3} tone={staminaTone} />
        </Meter>
        <Meter label={t('ui.hud.belly')} value={t(`hunger.${h.hungerBand}`)} tone={hungerTone}>
          <Pips on={HUNGER_PIPS[h.hungerBand]} of={4} tone={hungerTone} />
        </Meter>
        <Meter label={t('ui.hud.food')} value={food} detail={foodDetail} tone={foodTone}>
          {h.independent && <Pips on={FOOD_PIPS[h.foodWeeksBand]} of={3} tone={foodTone === 'plain' ? 'good' : foodTone} />}
        </Meter>
        <Meter label={t('ui.hud.money')} value={t('ui.hud.coin', { coin: h.money })} />
        <Meter label={t('ui.hud.land')} value={land} />
      </div>
      <div class="clock">
        <Enso char={SEASON_CHAR[date.season]} label={t(`season.${date.season}`)} />
        <div>
          <div class="date">{dateText(date)}</div>
          <div class="muted small">{t(`season.${date.season}`)}{saved && <> · {t('ui.life.saved')}</>}</div>
        </div>
      </div>
    </header>
  );
}
