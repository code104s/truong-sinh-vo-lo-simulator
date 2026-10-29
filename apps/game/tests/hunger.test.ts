import { hasKey } from '@tsvl/content';
import type { ActionOption, HouseholdView } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { hungerAlert } from '../src/app/hunger';

const h = (patch: Partial<HouseholdView>): HouseholdView => ({
  independent: true, money: 0, grain: 100, landMu: 0, tenure: 'none', hungerBand: 'fed', foodWeeksBand: 'season', grainWeeks: 10, foodWeeks: 10, goods: [], goodsCap: 1000, ...patch,
});
const opt = (id: string, locked: string | null = null): ActionOption => ({ id, group: 'livelihood', slots: 1, cost: { stamina: 'cost.medium', risk: 'risk.low', money: 'money.none' }, gains: [], locked });
/** Ở làng: không có việc làm thuê; đói lả thì săn (việc nặng) bị khóa. */
const village = [opt('action.farm'), opt('action.hire', 'lock.place'), opt('action.hunt'), opt('action.forage'), opt('action.rest')];
const starvingVillage = [opt('action.farm', 'lock.hunger'), opt('action.hire', 'lock.place'), opt('action.hunt', 'lock.hunger'), opt('action.forage')];

describe('cảnh báo đói (F1)', () => {
  it('no và còn lương thì không cảnh báo; cạn kho thì báo trước khi đói', () => {
    expect(hungerAlert(h({}), true, village)).toBeNull();
    expect(hungerAlert(h({ grain: 0, grainWeeks: 0, foodWeeks: 0, foodWeeksBand: 'none' }), true, village)).toMatchObject({ key: 'ui.hunger.empty', tone: 'warn', market: true });
  });

  it('mức đói tăng thì cảnh báo nặng dần; chỉ khuyên việc kiếm ăn đang làm được ở nơi này', () => {
    expect(hungerAlert(h({ hungerBand: 'hungry' }), true, village)).toEqual({ key: 'ui.hunger.hungry', tone: 'warn', advice: { key: 'ui.hunger.advice', actions: ['action.hunt', 'action.forage'] }, market: true });
    expect(hungerAlert(h({ hungerBand: 'starving' }), true, starvingVillage)).toEqual({ key: 'ui.hunger.starving', tone: 'bad', advice: { key: 'ui.hunger.advice', actions: ['action.forage'] }, market: true });
    expect(hungerAlert(h({ hungerBand: 'famished' }), true, [opt('action.forage', 'lock.health')])).toMatchObject({ key: 'ui.hunger.famished', tone: 'bad', advice: { key: 'ui.hunger.advice_market', actions: [] } });
  });

  it('còn ở nhà: đói là vì đói kém, không có nút chợ (mua vào túi riêng cũng không ăn được)', () => {
    expect(hungerAlert(h({ independent: false, grain: 0, foodWeeks: 0 }), true, village)).toBeNull();
    expect(hungerAlert(h({ independent: false, hungerBand: 'starving' }), false, [])).toEqual({ key: 'ui.hunger.starving', tone: 'bad', advice: { key: 'ui.hunger.advice_child', actions: [] }, market: false });
  });

  it('mọi câu cảnh báo có chuỗi hiển thị', () => {
    for (const key of ['ui.hunger.hungry', 'ui.hunger.starving', 'ui.hunger.famished', 'ui.hunger.empty', 'ui.hunger.advice', 'ui.hunger.advice_market', 'ui.hunger.advice_child', 'ui.hunger.to_market', 'action.hire', 'action.hunt', 'action.forage']) expect(hasKey(key), key).toBe(true);
  });
});
