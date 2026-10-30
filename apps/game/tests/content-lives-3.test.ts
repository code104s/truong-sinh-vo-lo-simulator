// Chuỗi nội dung phủ hết đầu ra của sim, đời 150–224 trong 300 (contentLives.ts).
import { describe, it } from 'vitest';
import { checkLives, LIVES_PER_FILE, LIVES_TIMEOUT } from './contentLives';

describe('chuỗi nội dung phủ hết đầu ra của sim', () => {
  it('đời 150–224: mọi câu nhật ký, mọi trường view, mọi tổng kết đều dịch được', () => checkLives(2 * LIVES_PER_FILE, 3 * LIVES_PER_FILE), LIVES_TIMEOUT);
});
