// Chuỗi nội dung phủ hết đầu ra của sim, đời 75–149 trong 300 (contentLives.ts).
import { describe, it } from 'vitest';
import { checkLives, LIVES_PER_FILE, LIVES_TIMEOUT } from './contentLives';

describe('chuỗi nội dung phủ hết đầu ra của sim', () => {
  it('đời 75–149: mọi câu nhật ký, mọi trường view, mọi tổng kết đều dịch được', () => checkLives(1 * LIVES_PER_FILE, 2 * LIVES_PER_FILE), LIVES_TIMEOUT);
});
