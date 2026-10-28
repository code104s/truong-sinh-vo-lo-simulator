// Tiếng tăm của người chơi theo từng quận (v0.5 S6, ADR 0017 Q9): việc làm có gắn tiếng ở quận nơi xảy ra, đầu tháng
// lan sang quận kề, đầu năm phai dần về 0. Là thứ một quận "biết" về người chơi (chưa có tri thức từng người).
// Thuần, tất định, số nguyên.
import type { ReputationBand } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';

export const REP_MAX = 100;
/** Dải: "khét tiếng" ≤ −50, "bị chê" ≤ −15, "chưa ai biết" −14..14, "được trọng" ≥ 15, "nổi danh" ≥ 50. */
export const REP_KNOWN = 15;
export const REP_FAMOUS = 50;
/** Phai đầu năm: 10% (làm tròn lên, để tiếng nhỏ cũng phai hết). */
export const REP_FADE_PCT = 10;

const clamp = (x: number) => (x < -REP_MAX ? -REP_MAX : x > REP_MAX ? REP_MAX : x);

export const newReputation = (counties: number): number[] => Array<number>(counties).fill(0);
export const repAt = (rep: readonly number[], county: number): number => rep[county] ?? 0;

/** Việc làm có gắn tiếng ở một quận: cộng dồn, giữ trong −100..100. */
export function addReputation(rep: number[], county: number, delta: number): void {
  if (county < 0 || county >= rep.length || delta === 0) return;
  rep[county] = clamp(rep[county]! + delta);
}

export function reputationBand(v: number): ReputationBand {
  return v <= -REP_FAMOUS ? 'infamous' : v <= -REP_KNOWN ? 'disliked' : v >= REP_FAMOUS ? 'renowned' : v >= REP_KNOWN ? 'respected' : 'unknown';
}

/**
 * Đầu tháng: tiếng lan sang quận kề. Người quận kề nghe được một nửa tiếng của quận kề vang nhất (theo độ lớn; bằng nhau
 * thì quận số nhỏ). Nếu nửa ấy vang hơn tiếng ở quận này, quận này nhích một nửa phần chênh về phía nó. Tính trên bản
 * đầu tháng (mọi quận cùng lúc), nên xa một quận thì tiếng nhỏ đi một nửa và không bao giờ vượt nơi phát ra.
 */
export function spreadReputation(rep: number[], logic: RegionLogic): void {
  if (rep.every((v) => v === 0)) return;
  const old = [...rep];
  const loudest = Array<number>(rep.length).fill(-1);
  for (const [a, b] of logic.adjacency) {
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const cur = loudest[to]!;
      if (cur < 0 || Math.abs(old[from]!) > Math.abs(old[cur]!) || (Math.abs(old[from]!) === Math.abs(old[cur]!) && from < cur)) loudest[to] = from;
    }
  }
  for (let c = 0; c < rep.length; c++) {
    const src = loudest[c]!;
    if (src < 0) continue;
    const heard = Math.trunc(old[src]! / 2);
    if (Math.abs(heard) <= Math.abs(old[c]!)) continue;
    rep[c] = clamp(old[c]! + Math.trunc((heard - old[c]!) / 2));
  }
}

/** Đầu năm: phai 10% về 0, làm tròn lên. */
export function fadeReputation(rep: number[]): void {
  for (let c = 0; c < rep.length; c++) {
    const v = rep[c]!;
    if (v === 0) continue;
    const step = Math.floor((Math.abs(v) * REP_FADE_PCT + 99) / 100);
    rep[c] = v > 0 ? v - step : v + step;
  }
}

/**
 * Quan hệ lúc mới quen (Q9): người ở quận nghe tiếng tốt thì tin mình sẵn, tiếng xấu thì có sẵn hiềm khích — một nửa
 * tiếng tăm ở quận ấy.
 */
export function firstImpression(rep: number): { trust: number; hostility: number } {
  return { trust: Math.max(0, Math.trunc(rep / 2)), hostility: Math.max(0, Math.trunc(-rep / 2)) };
}
