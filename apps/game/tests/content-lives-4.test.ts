// Chuỗi nội dung phủ hết đầu ra của sim, đời 225–299 trong 300 (contentLives.ts).
import { describe, it } from 'vitest';
import { checkLives, LIVES_PER_FILE, LIVES_TIMEOUT } from './contentLives';

describe('chuỗi nội dung phủ hết đầu ra của sim', () => {
  it('đời 225–299: mọi câu nhật ký, mọi trường view, mọi tổng kết đều dịch được', () => checkLives(3 * LIVES_PER_FILE, 4 * LIVES_PER_FILE), LIVES_TIMEOUT);
});
