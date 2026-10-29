import { t } from '@tsvl/content';
import type { ActionOption, CareerEntryView, CareerView, FactionView, NpcView, PlanSlot } from '@tsvl/shared';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { careerBlock, entryStatus, leaveLosses, mentorStatus, sortMentors, switchNote } from '../app/career';
import { FACTION_CHAR } from '../app/factions';
import { shortDate } from '../app/format';
import { relationKeys } from '../app/people';
import { CAREER_CHAR } from '../ui/icons';
import { Portrait, Seal } from '../ui/ink';
import { personPortraitOf } from '../ui/portraits';

/**
 * Khối "Nghề" ở hồ sơ (v0.7 F1): nghề, bậc, lúc vào nghề, thầy, nơi nhận (thương hội, nha môn, băng cướp) và những việc
 * tính vào năm làm nghề. Chưa vào nghề thì một dòng. F2: mở bảng chọn nghề, rời nghề (hỏi lại trước).
 */
export function CareerPanel({ career, factions, actions, locked, onOpen, onLeave }: {
  career: CareerView | null; factions: FactionView[]; actions: ActionOption[]; locked: boolean; onOpen: () => void; onLeave: () => void;
}) {
  const b = careerBlock(career, factions, actions);
  return (
    <div class="dossier-block career-block">
      <span class="dossier-k">{t('ui.career.title')}</span>
      {!b ? <p class="muted small">{t('ui.career.none')}</p> : <>
        <p class="career-name"><Seal char={CAREER_CHAR[b.career.id].char} tone={CAREER_CHAR[b.career.id].tone} /> <strong>{t(`career.${b.career.id}`)}</strong></p>
        <dl class="attrs career-attrs">
          <dt>{t('ui.career.rank')}</dt><dd>{t(`career.rank.${b.career.rank}`)}</dd>
          <dt>{t('ui.career.since')}</dt><dd>{shortDate(b.career.since)}</dd>
          {b.career.mentor && <>
            <dt>{t('ui.career.mentor')}</dt>
            <dd class={b.career.mentor.alive ? '' : 'muted'}>{b.career.mentor.alive ? b.career.mentor.name : t('ui.career.mentor_dead', { name: b.career.mentor.name })}</dd>
          </>}
          {b.faction && <>
            <dt>{t('ui.career.faction')}</dt>
            <dd><Seal char={FACTION_CHAR[b.faction.kind]} tone="ink" /> {t(b.faction.name.key, b.faction.name.params)}</dd>
          </>}
        </dl>
        {b.works.length > 0 && <p class="small"><span class="muted">{t('ui.career.works')}:</span> {b.works.map((id) => t(id)).join(' · ')}</p>}
      </>}
      <span class="row career-actions">
        <button type="button" class="btn small-btn" disabled={locked} onClick={onOpen}>{t('ui.careers.open')}</button>
        {career && <button type="button" class="btn ghost small-btn" disabled={locked} onClick={onLeave}>{t('ui.leave.open')}</button>}
      </span>
    </div>
  );
}

/** Hộp nổi dùng chung: nền mờ, Esc hay bấm ra ngoài thì đóng. */
function Modal({ label, onClose, className = '', children }: { label: string; onClose: () => void; className?: string; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="palette-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class={`palette ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        <div class="palette-head">
          <span class="section-title">{label}</span>
          <button class="close" type="button" onClick={onClose} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Bảng chọn nghề ở quận đang đứng (v0.7 F2): chín nghề, cách vào, ai nhận học việc ở đây (lễ nhập môn, lý do khóa sim gửi),
 * vào nghề khác thì mất gì. Chọn là xếp việc vào nghề vào tuần sắp chạy; sim xét lại khi tuần ấy tới.
 */
export function CareerDialog({ board, career, people, place, week, busy, onPick, onClose }: {
  board: CareerEntryView[]; career: CareerView | null; people: NpcView[]; place: string;
  /** Tuần sắp chạy; `busy`: tuần ấy đang dở việc nhiều ô. */
  week: number; busy: boolean;
  onPick: (slot: PlanSlot) => void; onClose: () => void;
}) {
  const pick = (slot: PlanSlot, enabled: boolean) => (
    <button type="button" class="btn small-btn" disabled={busy || !enabled} onClick={() => onPick(slot)}>{t('ui.careers.pick', { week: t(`tenday.${week}`) })}</button>
  );
  return (
    <Modal label={t('ui.careers.title')} onClose={onClose} className="careers">
      <p class="small muted">{t('ui.careers.hint')}</p>
      {busy && <p class="small tile-why">{t('ui.careers.busy')}</p>}
      <div class="career-list">
        {board.map((e) => {
          const status = entryStatus(e, career);
          const note = status === 'current' ? null : switchNote(e, career);
          const seal = CAREER_CHAR[e.career];
          return (
            <section key={e.career} class={`career-entry entry-${status}`}>
              <div class="career-entry-head">
                <span class="tile-a"><Seal char={seal.char} tone={seal.tone} /><strong>{t(`career.${e.career}`)}</strong></span>
                <span class="chip">{t(`ui.careers.way.${e.way}`)}</span>
                {status === 'current' && <span class="chip ok">{t('ui.careers.current')}</span>}
              </div>
              <p class="small muted">{t(e.way === 'mentor' ? 'ui.careers.how.mentor' : `ui.careers.how.${e.career}`)}</p>
              {e.way === 'mentor' && e.mentors.length > 0 && (
                <ul class="people-list mentor-list">
                  {sortMentors(e.mentors, career).map((m) => {
                    const p = people.find((x) => x.id === m.id);
                    const ms = mentorStatus(m, career);
                    return (
                      <li key={m.id} class={`mentor-row${ms === 'locked' ? ' locked' : ''}`}>
                        {p && <Portrait src={personPortraitOf(p)} age={p.ageYears} />}
                        <span class="person-text">
                          <strong>{p?.name ?? m.id}</strong>
                          {p && <span class="small person-relation">{relationKeys(p).map((k) => t(k)).join(' · ') || t('bond.closeness.stranger')}</span>}
                          <span class="small muted">{m.gift > 0 ? t('ui.careers.gift', { coin: m.gift }) : t('ui.careers.no_gift')}</span>
                          {ms === 'current' && <span class="small tone-good">{t('ui.careers.studying')}</span>}
                          {ms === 'locked' && <span class="small tile-why">{t(m.locked!)}</span>}
                        </span>
                        {ms === 'open' && pick({ action: 'action.apprentice', person: m.id }, true)}
                      </li>
                    );
                  })}
                </ul>
              )}
              {e.locked && status !== 'current' && <p class="small tile-why">{t(e.locked, { place })}</p>}
              {note && status !== 'locked' && status !== 'event' && <p class="small career-switch">{t(note.key, note.params)}</p>}
              {e.way !== 'mentor' && e.action && status === 'open' && pick({ action: e.action }, true)}
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

/** Hỏi lại trước khi rời nghề (v0.7 F2): mất bậc, số năm, lòng thầy, thế lực nhận mình; ra băng thì chuộc tội hay trốn. */
export function LeaveDialog({ career, factions, busy, onConfirm, onClose }: {
  career: CareerView; factions: FactionView[]; busy: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal label={t('ui.leave.title', { career: `career.${career.id}` })} onClose={onClose} className="leave">
      <p>{t('ui.leave.lose')}</p>
      <ul class="leave-list">{leaveLosses(career, factions).map((l) => <li key={l.key}>{t(l.key, l.params)}</li>)}</ul>
      <span class="row leave-actions">
        <button type="button" class="btn ghost" onClick={onClose}>{t('ui.leave.cancel')}</button>
        <button type="button" class="btn primary" disabled={busy} onClick={onConfirm}>{t('ui.leave.confirm')}</button>
      </span>
    </Modal>
  );
}
