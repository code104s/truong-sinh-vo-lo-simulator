import { t } from '@tsvl/content';
import type { CalendarDate, PendingEvent } from '@tsvl/shared';
import { useEffect } from 'preact/hooks';
import { dateText } from '../app/format';
import { Portrait, Seal } from '../ui/ink';
import { npcPortraitOf } from '../ui/portraits';

/**
 * Thẻ sự kiện có lựa chọn (ADR 0014, F3): hiện giữa màn, thời gian dừng tới khi chọn. Không có nút đóng — phải chọn
 * một đường; lựa chọn bị khóa vẫn hiện, mờ đi kèm lý do, để người chơi thấy cái mình không với tới.
 */
export function EventCard({ pending, date, busy, onChoose }: { pending: PendingEvent; date: CalendarDate; busy: boolean; onChoose: (choice: string) => void }) {
  const key = pending.eventId;
  const params = pending.params;
  // Phím số 1–4 chọn nhanh lựa chọn tương ứng (nếu đang mở)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      const choice = pending.choices[n - 1];
      if (!busy && choice && choice.locked === null) onChoose(choice.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, busy, onChoose]);
  return (
    <div class="event-backdrop">
      <section class="event-card" role="dialog" aria-modal="true" aria-labelledby="event-title">
        <div class="event-figure">
          {pending.figure
            ? <Portrait src={npcPortraitOf(pending.figure, `${pending.eventId}#${pending.instance}`)} age={pending.figure.ageBand === 'child' ? 8 : 40} />
            : <Seal char="變" />}
        </div>
        <div class="event-text">
          <span class="event-when">{dateText(date)}</span>
          <h2 id="event-title" class="event-title"><Seal char="變" />{t(`${key}.title`, params)}</h2>
          <p class="event-body">{t(pending.variant ? `${key}.body.${pending.variant}` : `${key}.body`, params)}</p>
          <span class="section-title">{t('ui.event.choose')}</span>
          <div class="event-choices">
            {pending.choices.map((c, i) => (
              <button key={c.id} type="button" class={`event-choice${c.locked ? ' locked' : ''}`} disabled={busy || c.locked !== null} onClick={() => onChoose(c.id)}>
                <span class="event-choice-text"><span class="event-key">{i + 1}</span>{t(`${key}.choice.${c.id}`, params)}</span>
                <span class="chips">
                  {c.costs.map((tag) => <span key={tag} class={`chip${tag === 'money' || tag === 'health' || tag === 'risk' ? ' hi' : ''}`}>{t(`event.cost.${tag}`)}</span>)}
                </span>
                {c.locked && <span class="event-why">{t('ui.event.locked', { reason: t(c.locked) })}</span>}
              </button>
            ))}
          </div>
          <span class="tiny muted">{t('ui.event.keys', { count: pending.choices.length })}</span>
        </div>
      </section>
    </div>
  );
}
