// Chân dung nhân vật (nhập bằng tools/portraits/import.mjs). Chỉ để hiển thị, không phải luật game:
// mỗi đời gắn cố định một gương mặt cùng giới tính, chọn bằng băm các trường ổn định của nhân vật.
import type { CharacterView, EventFigure } from '@tsvl/shared';
import index from '../assets/portraits/index.json';
import npcIndex from '../assets/portraits-npc/index.json';

/** Dưới tuổi này vẫn hiện bóng người bằng mực; chân dung trong gói là người đã trưởng thành. */
export const PORTRAIT_MIN_AGE = 15;

const urls = import.meta.glob<string>('../assets/portraits/*.webp', { eager: true, query: '?url', import: 'default' });
const byGender = {
  male: index.filter((p) => p.gender === 'male'),
  female: index.filter((p) => p.gender === 'female'),
};

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** URL chân dung của một đời; null nếu không có ảnh phù hợp. */
export function portraitOf(c: Pick<CharacterView, 'gender' | 'name' | 'birthplaceId' | 'birthTick'>): string | null {
  const pool = byGender[c.gender];
  if (!pool.length) return null;
  const pick = pool[hash(`${c.birthplaceId}|${c.name}|${c.birthTick}`) % pool.length]!;
  return urls[`../assets/portraits/${pick.id}.webp`] ?? null;
}

// —— Người vô danh trong sự kiện (kho portraits-npc, nhập bằng tools/portraits/import.mjs --role npc) ——
const npcUrls = import.meta.glob<string>('../assets/portraits-npc/*.webp', { eager: true, query: '?url', import: 'default' });
const AGE_BAND: Record<EventFigure['ageBand'], [number, number]> = { child: [0, 15], young: [16, 29], adult: [30, 59], old: [60, 200] };
const CLASS_STATUS: Record<EventFigure['class'], readonly string[]> = { poor: ['destitute'], common: ['commoner'], rich: ['comfortable', 'wealthy'], official: ['elite'] };

/**
 * Chân dung cho người trong sự kiện theo giới, lứa tuổi, tầng lớp; kho không có đúng thì nới dần (bỏ tầng lớp, rồi tuổi).
 * Cùng `key` (vd. số thứ tự sự kiện) luôn ra cùng gương mặt. Chỉ để trình bày, không vào sim.
 */
export function npcPortraitOf(figure: EventFigure, key: string): string | null {
  const [lo, hi] = AGE_BAND[figure.ageBand];
  const tiers = [
    npcIndex.filter((p) => p.gender === figure.gender && p.age >= lo && p.age <= hi && CLASS_STATUS[figure.class].includes(p.socialStatus)),
    npcIndex.filter((p) => p.gender === figure.gender && p.age >= lo && p.age <= hi),
    npcIndex.filter((p) => p.gender === figure.gender),
  ];
  const pool = tiers.find((t) => t.length > 0);
  if (!pool) return null;
  const pick = pool[hash(key) % pool.length]!;
  return npcUrls[`../assets/portraits-npc/${pick.id}.webp`] ?? null;
}
