import { t } from '@tsvl/content';
import { calendarOf, type LogEntry, type Tick } from '@tsvl/shared';
import { useMemo, useState } from 'preact/hooks';
import { groupByYear, visibleItems, type ChronicleFilter } from '../app/chronicle';
import { logText, shortDate } from '../app/format';
import { logSeal } from '../ui/icons';
import { Seal } from '../ui/ink';

/** Một dòng nhật ký. Trong biên niên đã gom theo năm thì chỉ ghi tháng; ở màn tổng kết ghi cả năm. */
export function LogLine({ e, forceMajor = false, monthOnly = false }: { e: LogEntry; forceMajor?: boolean; monthOnly?: boolean }) {
  const seal = logSeal(e);
  return (
    <p class={`entry ${forceMajor ? 'major' : e.importance}`}>
      <span class="entry-date">{monthOnly ? t(`month.${calendarOf(e.tick).month}`) : shortDate(e.tick)}</span>
      <span class="entry-seal">{seal && <Seal char={seal.char} tone={seal.tone} />}</span>
      <span>{logText(e)}</span>
    </p>
  );
}

/**
 * Biên niên theo năm (đề xuất giao diện P0): năm mới nhất ở trên, kèm tuổi; việc thường ngày của năm cũ gập lại;
 * lọc "Chuyện lớn". Không có luật game: mọi dòng đến từ nhật ký của sim.
 */
export function Chronicle({ log, birthTick }: { log: LogEntry[]; birthTick: Tick }) {
  const [filter, setFilter] = useState<ChronicleFilter>('all');
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const years = useMemo(() => groupByYear(log, birthTick), [log, birthTick]);
  const toggle = (year: number) => setOpen((s) => { const n = new Set(s); if (n.has(year)) n.delete(year); else n.add(year); return n; });
  return (
    <section class="chronicle-list" aria-label={t('ui.life.log')}>
      <div class="chronicle-head">
        <span class="section-title">{t('ui.life.chronicle')}</span>
        <span class="tabs" role="tablist">
          {(['all', 'major'] as const).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} class={`tab${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{t(`ui.chron.${f}`)}</button>
          ))}
        </span>
      </div>
      <div class="log">
        {years.length === 0 && <p class="muted small">{t('ui.chron.empty')}</p>}
        {years.map((g, k) => {
          const { items, folded } = visibleItems(g, filter, k === 0, open.has(g.year));
          if (!items.length && !folded && filter === 'major') return null;
          // Năm chỉ có việc thường ngày: gộp số việc vào dòng tiêu đề, khỏi thêm một dòng gập riêng
          const quiet = !items.length && folded > 0;
          const foldButton = folded > 0 && <button type="button" class="fold" onClick={() => toggle(g.year)}>{t('ui.chron.folded', { count: folded })} · {t('ui.chron.unfold')}</button>;
          return (
            <div key={g.year} class={`year${quiet ? ' quiet' : ''}`}>
              <h3 class="year-head">
                {t('ui.chron.year', { year: g.year })}
                <small>{g.ageFrom === g.ageTo ? t('ui.chron.age', { age: g.ageFrom }) : t('ui.chron.ages', { from: g.ageFrom, to: g.ageTo })}</small>
                {quiet && foldButton}
              </h3>
              {items.map((it) => <LogLine key={it.index} e={it.entry} monthOnly />)}
              {!quiet && foldButton}
              {filter === 'all' && k > 0 && open.has(g.year) && g.minorCount > 0 && <button type="button" class="fold" onClick={() => toggle(g.year)}>{t('ui.chron.fold')}</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
