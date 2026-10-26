// Chân dung nhân vật (nhập bằng tools/portraits/import.mjs). Chỉ để hiển thị, không phải luật game:
// mỗi đời gắn cố định một gương mặt cùng giới tính, chọn bằng băm các trường ổn định của nhân vật.
import type { CharacterView } from '@tsvl/shared';
import index from '../assets/portraits/index.json';

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
