// Chuỗi nội dung phủ hết đầu ra của sim, đời 0–74 trong 300 (contentLives.ts).
import { describe, it } from 'vitest';
import { checkLives, LIVES_PER_FILE, LIVES_TIMEOUT } from './contentLives';

describe('chuỗi nội dung phủ hết đầu ra của sim', () => {
  it('đời 0–74: mọi câu nhật ký, mọi trường view, mọi tổng kết đều dịch được', () => checkLives(0 * LIVES_PER_FILE, 1 * LIVES_PER_FILE), LIVES_TIMEOUT);
});
