import { t } from '@tsvl/content';
import { GRAIN_PER_DOU, type CalendarDate, type CharacterView, type FoodWeeksBand, type HungerBand, type StaminaBand } from '@tsvl/shared';
import type { ComponentChildren } from 'preact';
import { dateText } from '../app/format';
import type { WorldInfo } from '../app/state';
import { KIND_CHAR, SEASON_CHAR } from '../ui/icons';
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
  const land = h.landMu > 0 ? `${t('ui.hud.mu', { mu: h.landMu })} · ${t(`tenure.${h.tenure}`)}` : h.tenure === 'tenant' ? t('tenure.tenant') : t('ui.hud.no_land');
  return (
    <header class="status-bar">
      <div class="who">
        <Portrait src={c.ageYears >= PORTRAIT_MIN_AGE ? portraitOf(c) : null} alt={c.name} age={c.ageYears} />
        <div class="who-text">
          <h2 class="char-name">{c.name}</h2>
          <p class="muted">{t(`gender.${c.gender}`)} · {t('ui.life.age', { age: c.ageYears })}</p>
          <p class="small">
            {place && <Seal char={KIND_CHAR[place.kind]} tone="ink" />} {t('ui.life.here', { place: world?.map.counties[c.location]?.name ?? '' })}
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
