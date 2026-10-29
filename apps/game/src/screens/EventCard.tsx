import { t } from '@tsvl/content';
import type { CalendarDate, PendingEvent } from '@tsvl/shared';
import { useEffect } from 'preact/hooks';
import { dateText } from '../app/format';
import { CAREER_CHAR } from '../ui/icons';
import { Portrait, Seal } from '../ui/ink';
import { figurePortraitOf } from '../ui/portraits';

/**
 * Thẻ sự kiện có lựa chọn (ADR 0014, F3): hiện giữa màn, thời gian dừng tới khi chọn. Không có nút đóng — phải chọn
 * một đường; lựa chọn bị khóa vẫn hiện, mờ đi kèm lý do, để người chơi thấy cái mình không với tới.
 */
export function EventCard({ pending, date, busy, onChoose }: { pending: PendingEvent; date: CalendarDate; busy: boolean; onChoose: (choice: string) => void }) {
  const key = pending.eventId;
  const params = pending.params;
  // Người thật (v0.4 F3): tên ghi dưới chân dung, như người quen mặt trong khối "Người ở…"
  const named = pending.figure?.npcId && typeof params.name === 'string' ? params.name : undefined;
  // Sự kiện riêng của nghề (v0.7 F3): triện nghề ở góc chân dung và cạnh ngày
  const job = pending.career ? CAREER_CHAR[pending.career] : null;
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
      <section class={`event-card${job ? ' career-event' : ''}`} role="dialog" aria-modal="true" aria-labelledby="event-title">
        <div class="event-figure">
          {pending.figure
            ? <Portrait src={figurePortraitOf(pending.figure, `${pending.eventId}#${pending.instance}`)} age={pending.figure.ageBand === 'child' ? 8 : 40}
                alt={named ?? ''} caption={named} />
            : <Seal char={job?.char ?? '變'} tone={job?.tone ?? 'red'} />}
          {job && pending.figure && <span class="event-career-seal"><Seal char={job.char} tone={job.tone} title={t(`career.${pending.career}`)} /></span>}
        </div>
        <div class="event-text">
          <span class="event-when">{dateText(date)}{pending.career && <span class="event-career"> · {t('ui.event.career', { career: `career.${pending.career}` })}</span>}</span>
          <h2 id="event-title" class="event-title"><Seal char={job?.char ?? '變'} tone={job?.tone ?? 'red'} />{t(`${key}.title`, params)}</h2>
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
