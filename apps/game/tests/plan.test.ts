import type { ActionOption, MonthPlan, NpcView } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { planDirty, planInvalid, socialCandidates, socialLockOf } from '../src/app/plan';

const opt = (id: string, locked: string | null = null): ActionOption => ({ id, group: 'livelihood', slots: 1, cost: { stamina: 'cost.low', risk: 'risk.low', money: 'cost.none' }, gains: [], locked });
const actions = [opt('action.farm', 'lock.winter'), opt('action.study', 'lock.place'), opt('action.rest'), opt('action.travel')];
const travel = [{ county: 1, slots: 1, risk: 'risk.low' }];

describe('kế hoạch tháng phía giao diện (hồi quy: FE từng chặn theo khóa lúc này)', () => {
  it('khóa lúc này không chặn: lên trấn rồi học chữ, hoặc xếp làm ruộng trước khi hết đông', () => {
    const plan: MonthPlan = { slots: [{ action: 'action.travel', target: 1 }, { action: 'action.study' }, { action: 'action.farm' }] };
    expect(planInvalid(plan, actions, travel)).toBe(false);
  });
  it('vẫn chặn kế hoạch sai ý nghĩa', () => {
    expect(planInvalid({ slots: [{ action: 'action.fly' }, { action: 'action.rest' }, { action: 'action.rest' }] }, actions, travel)).toBe(true);
    expect(planInvalid({ slots: [{ action: 'action.travel', target: 7 }, { action: 'action.rest' }, { action: 'action.rest' }] }, actions, travel)).toBe(true);
    expect(planInvalid({ slots: [{ action: 'action.travel' }, { action: 'action.rest' }, { action: 'action.rest' }] }, actions, travel)).toBe(true);
  });
});

describe('ô xã giao chọn người (v0.5 F2)', () => {
  const social = (id: string): ActionOption => ({ ...opt(id), group: 'social' });
  const acts = [...actions, social('action.visit'), social('action.propose')];
  const rest = { action: 'action.rest' } as const;
  const npc = (id: number, ageYears: number, extra: Partial<NpcView> = {}): NpcView => ({
    id: `n${id}`, name: `Người ${id}`, gender: 'female', ageYears, occupation: 'occupation.farmer', healthBand: 'healthy',
    portrait: { ageBand: 'adult', class: 'common', key: `n${id}` }, ...extra,
  });

  it('ô xã giao phải nhắm vào một người; việc khác không nhắm vào ai', () => {
    expect(planInvalid({ slots: [{ action: 'action.visit', person: 'n3' }, rest, rest] }, acts, travel)).toBe(false);
    expect(planInvalid({ slots: [{ action: 'action.visit' }, rest, rest] }, acts, travel)).toBe(true);
    expect(planInvalid({ slots: [{ action: 'action.rest', person: 'n3' }, rest, rest] }, acts, travel)).toBe(true);
  });

  it('đổi người là đổi kế hoạch', () => {
    const a: MonthPlan = { slots: [{ action: 'action.visit', person: 'n3' }, rest, rest] };
    expect(planDirty({ slots: [{ action: 'action.visit', person: 'n4' }, rest, rest] }, a)).toBe(true);
    expect(planDirty({ slots: [{ action: 'action.visit', person: 'n3' }, rest, rest] }, a)).toBe(false);
  });

  it('khóa đọc từ người trong quận; người đã đi khỏi quận thì "không ở đây"', () => {
    const people = [npc(3, 30, { social: [{ action: 'action.visit', locked: null }, { action: 'action.propose', locked: 'lock.not_close' }] })];
    expect(socialLockOf({ action: 'action.visit', person: 'n3' }, people)).toBeNull();
    expect(socialLockOf({ action: 'action.propose', person: 'n3' }, people)).toBe('lock.not_close');
    expect(socialLockOf({ action: 'action.visit', person: 'n9' }, people)).toBe('lock.person_away');
  });

  it('người làm được trước, rồi người thân, người có quan hệ, rồi người già trước', () => {
    const open = (locked: string | null) => [{ action: 'action.visit', locked }];
    const people = [
      npc(1, 70, { social: open(null) }),
      npc(2, 30, { social: open(null), bond: { closeness: 'friend', trust: 'neutral', hostility: 'none', owed: 'none' } }),
      npc(3, 50, { social: open(null), kin: 'mother' }),
      npc(4, 80, { social: open('lock.money') }),
    ];
    expect(socialCandidates(people, 'action.visit').map((r) => r.p.id)).toEqual(['n3', 'n2', 'n1', 'n4']);
    expect(socialCandidates(people, 'action.visit').at(-1)!.locked).toBe('lock.money');
  });
});
