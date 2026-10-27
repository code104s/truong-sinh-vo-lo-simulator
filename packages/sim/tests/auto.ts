// Tiện ích test: tua như người chơi máy mặc định — gặp sự kiện có lựa chọn thì chọn lựa chọn đầu tiên đang mở (ADR 0014),
// giống Life.runToDeath, để chạy từng bước và chạy liền mạch cho cùng digest.
import type { AdvanceMode, WorkerMessage } from '@tsvl/shared';
import { firstOpenChoice, type AdvanceResult, type Life } from '../src/index';

export function autoAdvance(life: Life, mode: AdvanceMode): AdvanceResult {
  const res = life.advance(mode);
  if (res.status === 'event') {
    const refused = life.choose(res.pending.instance, firstOpenChoice(res.pending));
    if (refused) throw new Error(refused);
  }
  return res;
}

/** Như autoAdvance nhưng qua SimHost: gửi ADVANCE, gặp tin EVENT thì gửi CHOOSE. Trả mọi tin nhận được. */
export function hostAdvance(send: (c: Record<string, unknown>) => WorkerMessage[], mode: AdvanceMode): WorkerMessage[] {
  const msgs = send({ type: 'ADVANCE', mode });
  const ev = msgs.find((m) => m.type === 'EVENT');
  if (ev?.type === 'EVENT') msgs.push(...send({ type: 'CHOOSE', instance: ev.pending.instance, choice: firstOpenChoice(ev.pending) }));
  return msgs;
}
