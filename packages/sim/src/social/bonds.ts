// Quan hệ của người chơi với người có tên (v0.5, ADR 0017): kho thưa, chỉ có mục khi đã có tương tác; bốn trục số
// nguyên. Người chơi chỉ thấy dải chữ (BondView). Thuần, tất định.
import type { BondView } from '@tsvl/shared';
import { firstImpression } from './reputation';

export interface Bond {
  id: string;
  /** Thân thiết, tin cậy, thù hận: 0..100. */
  closeness: number;
  trust: number;
  hostility: number;
  /** Nợ ơn: dương là người ấy nợ ơn mình, âm là mình nợ ơn người ấy (−100..100). */
  owed: number;
}

export const BOND_MAX = 100;
/** Cha mẹ lúc người chơi chào đời: thân thiết, tin cậy sẵn (dải "thân thiết", "tin cậy"). */
export const PARENT_CLOSENESS = 80;
export const PARENT_TRUST = 70;

/** Ngưỡng dải: thân thiết 20/50/80; tin cậy 30/70; thù hận 30/70; nợ ơn từ ±20. */
const CLOSENESS_AT = [20, 50, 80] as const;
const TRUST_AT = [30, 70] as const;
const HOSTILITY_AT = [30, 70] as const;
const OWED_AT = 20;

const idNum = (id: string) => Number(id.slice(1));

export function bondOf(bonds: readonly Bond[], id: string): Bond | null {
  for (const b of bonds) if (b.id === id) return b;
  return null;
}

/**
 * Mục quan hệ với một người, tạo mới nếu chưa có; giữ kho sắp theo id. Mới quen thì tin cậy, hiềm khích theo tiếng tăm
 * của mình ở quận ấy (`rep`, v0.5 S6); các trục khác 0.
 */
export function ensureBond(bonds: Bond[], id: string, rep = 0): Bond {
  const found = bondOf(bonds, id);
  if (found) return found;
  const b: Bond = { id, closeness: 0, ...firstImpression(rep), owed: 0 };
  const at = bonds.findIndex((x) => idNum(x.id) > idNum(id));
  if (at < 0) bonds.push(b); else bonds.splice(at, 0, b);
  return b;
}

export function bondView(b: Bond): BondView {
  return {
    closeness: b.closeness >= CLOSENESS_AT[2] ? 'close' : b.closeness >= CLOSENESS_AT[1] ? 'friend' : b.closeness >= CLOSENESS_AT[0] ? 'acquaintance' : 'stranger',
    trust: b.trust >= TRUST_AT[1] ? 'trusted' : b.trust >= TRUST_AT[0] ? 'neutral' : 'wary',
    hostility: b.hostility >= HOSTILITY_AT[1] ? 'enemy' : b.hostility >= HOSTILITY_AT[0] ? 'grudge' : 'none',
    owed: b.owed >= OWED_AT ? 'they_owe' : b.owed <= -OWED_AT ? 'i_owe' : 'none',
  };
}
