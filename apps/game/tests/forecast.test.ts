import { hasKey } from '@tsvl/content';
import type { HouseholdView } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { foodForecast, LONG_WEEKS } from '../src/app/forecast';
import { inlineDate } from '../src/app/format';

const h = (grainWeeks: number, foodWeeks: number, independent = true): HouseholdView => ({
  independent, money: 0, grain: grainWeeks * 10, landMu: 0, tenure: 'none', hungerBand: 'fed', foodWeeksBand: 'season', grainWeeks, foodWeeks,
});
const JAN = 36 * 16; // thượng tuần tháng Giêng năm 17: còn 24 tuần tới mùa gặt

describe('dự báo đủ ăn (F4)', () => {
  it('chưa ra riêng thì không dự báo; câu chính theo kho và tiền', () => {
    expect(foodForecast(h(5, 5, false), JAN, false)).toBeNull();
    expect(foodForecast(h(0, 0), JAN, false)).toMatchObject({ key: 'ui.food.none', tone: 'bad' });
    expect(foodForecast(h(10, 10), JAN, false)).toMatchObject({ key: 'ui.food.until', foodUntil: JAN + 10, tone: 'warn' });
    expect(foodForecast(h(10, 30), JAN, false)).toMatchObject({ key: 'ui.food.until_money', grainUntil: JAN + 10, foodUntil: JAN + 30, tone: 'good' });
    expect(foodForecast(h(0, 20), JAN, false)).toMatchObject({ key: 'ui.food.money_only', tone: 'good' });
    expect(foodForecast(h(LONG_WEEKS, LONG_WEEKS), JAN, false)).toMatchObject({ key: 'ui.food.long' });
    expect(foodForecast(h(3, 3), JAN, false)?.tone).toBe('bad');
  });

  it('kế hoạch có làm ruộng: báo kịp hay không kịp mùa gặt', () => {
    const late = foodForecast(h(20, 20), JAN, true)!;
    expect(late.harvest).toEqual({ at: JAN + 24, inTime: false });
    expect(late.tone).toBe('warn');
    expect(foodForecast(h(30, 30), JAN, true)!.harvest).toEqual({ at: JAN + 24, inTime: true });
    expect(foodForecast(h(20, 20), JAN, false)!.harvest).toBeNull();
    expect(inlineDate(JAN + 24)).toBe('thượng tuần tháng Chín năm 17');
  });

  it('mọi câu dự báo có chuỗi hiển thị', () => {
    for (const key of ['ui.food.none', 'ui.food.until', 'ui.food.until_money', 'ui.food.money_only', 'ui.food.long', 'ui.food.harvest_ok', 'ui.food.harvest_short', 'date.inline']) expect(hasKey(key), key).toBe(true);
  });
});
