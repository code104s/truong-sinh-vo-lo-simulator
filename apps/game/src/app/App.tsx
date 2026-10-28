import { t } from '@tsvl/content';
import { SAVE_VERSION, type AdvanceMode, type WorkerMessage } from '@tsvl/shared';
import { useCallback, useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { BirthplaceScreen } from '../screens/BirthplaceScreen';
import { LifeScreen } from '../screens/LifeScreen';
import { Loading } from '../screens/Loading';
import { MainMenu } from '../screens/MainMenu';
import { Settings } from '../screens/Settings';
import { SummaryScreen } from '../screens/SummaryScreen';
import { MusicToggle } from '../ui/MusicToggle';
import type { SimClient } from './client';
import { randomSeed } from './format';
import { initialState, reduce } from './state';
import { storage } from './storage';
import { downloadSave } from './exportSave';

/** Khi tua liên tục: mỗi bước một tháng, cách nhau chừng này mili giây để người chơi kịp thấy đời trôi. */
const RUN_STEP_MS = 60;

type Kind = 'advance' | 'newLife' | 'plan' | 'export' | 'other';

export function App({ client }: { client: SimClient }) {
  const [s, dispatch] = useReducer(reduce, initialState);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const kinds = useRef(new Map<number, Kind>());
  const runRef = useRef(false);
  const deadRef = useRef(false);
  /** Thao tác kho chạy lần lượt: lưu dở không được ghi đè sau khi đã xóa ô vì chết. */
  const storeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const queue = (op: () => Promise<unknown>) => (storeQueue.current = storeQueue.current.then(op).catch((e: unknown) => console.error('kho lưu', e)));

  const send = useCallback((cmd: Parameters<SimClient['send']>[0], kind: Kind = 'other') => {
    const id = client.send(cmd);
    kinds.current.set(id, kind);
    if (kind === 'advance' || kind === 'plan') setBusy(true);
    return id;
  }, [client]);

  const advance = useCallback((mode: AdvanceMode) => {
    setSaved(false);
    dispatch({ type: 'advanceStart' });
    send({ type: 'ADVANCE', mode }, 'advance');
  }, [send]);

  // Mỗi lần về màn chính, đọc lại kho để nút "Tiếp tục" đúng
  useEffect(() => {
    if (s.screen !== 'menu') return;
    queue(() => storage.loadCurrent().then((sv) => dispatch({ type: 'hasSave', value: !!sv })));
  }, [s.screen]);

  useEffect(() => client.subscribe((m: WorkerMessage) => {
    dispatch({ type: 'msg', m });
    const kind = 'reqId' in m && m.reqId !== null ? kinds.current.get(m.reqId) : undefined;
    switch (m.type) {
      case 'INTERRUPT':
      case 'EVENT':
        runRef.current = false;
        break;
      case 'STATE':
        if (kind === 'advance' || kind === 'plan') setBusy(false);
        if (runRef.current && kind === 'advance') {
          setTimeout(() => {
            if (runRef.current && !deadRef.current) advance('month');
          }, RUN_STEP_MS);
        } else if (kind === 'advance' || kind === 'newLife' || kind === 'plan') {
          send({ type: 'SAVE' });
        }
        break;
      case 'SAVED':
        if (deadRef.current) break;
        queue(async () => {
          if (deadRef.current) return;
          await storage.saveCurrent(m.save);
          setSaved(true);
        });
        break;
      case 'DIED':
        runRef.current = false;
        deadRef.current = true;
        setBusy(false);
        queue(async () => {
          await storage.clearCurrent();
          await storage.addLife(m.summary);
        });
        break;
      case 'ERROR':
        runRef.current = false;
        setBusy(false);
        break;
    }
  }), [client, advance, send]);

  const onNew = () => {
    dispatch({ type: 'genStart' });
    send({ type: 'GEN_WORLD', worldSeed: s.seedInput || randomSeed() });
  };
  const onContinue = async () => {
    const save = await storage.loadCurrent();
    if (!save) return dispatch({ type: 'hasSave', value: false });
    // Save của bản cũ không tải được và không chuyển đổi (v0.3 Q9): báo rõ thay vì lỗi hợp đồng
    if (save.version !== SAVE_VERSION) return dispatch({ type: 'error', message: t('ui.save.outdated', { version: String(save.version) }) });
    deadRef.current = false;
    dispatch({ type: 'loadStart' });
    send({ type: 'LOAD', save });
  };
  const onConfirm = () => {
    if (!s.world || !s.selected) return;
    deadRef.current = false;
    dispatch({ type: 'newLifeStart' });
    send({ type: 'NEW_LIFE', config: { worldSeed: s.world.seed, regionId: s.world.region.id, birthplaceId: s.selected } }, 'newLife');
  };
  const onRun = () => {
    runRef.current = true;
    dispatch({ type: 'run', on: true });
    advance('month');
  };
  const onPause = () => {
    runRef.current = false;
    dispatch({ type: 'run', on: false });
    send({ type: 'PAUSE' });
  };

  return (
    <>
      {s.screen === 'menu' && <MainMenu ready={s.ready} hasSave={s.hasSave} onNew={onNew} onContinue={onContinue} onSettings={() => dispatch({ type: 'go', screen: 'settings' })} />}
      {s.screen === 'settings' && (
        <Settings
          seed={s.seedInput}
          onSeed={(value) => dispatch({ type: 'seedInput', value })}
          onClear={async () => { await queue(() => storage.clearCurrent()); dispatch({ type: 'hasSave', value: false }); }}
          onExport={async () => {
            const save = await storage.loadCurrent();
            if (save) downloadSave(save);
            return !!save;
          }}
          onDone={() => dispatch({ type: 'go', screen: 'menu' })}
        />
      )}
      {s.screen === 'loading' && <Loading stage={s.progress?.stage ?? null} pct={s.progress?.pct ?? 0} seed={s.loadingSave ? null : s.seedInput || null} />}
      {s.screen === 'birthplace' && s.world && (
        <BirthplaceScreen world={s.world} selected={s.selected} onSelect={(id) => dispatch({ type: 'select', id })} onConfirm={onConfirm} onBack={() => dispatch({ type: 'go', screen: 'menu' })} />
      )}
      {s.screen === 'life' && s.character && s.date && (
        <LifeScreen
          world={s.world} date={s.date} character={s.character} log={s.log} interrupt={s.interrupt}
          running={s.running} busy={busy} saved={saved} onAdvance={advance} onRun={onRun} onPause={onPause}
          plan={s.plan} active={s.active} actions={s.actions} travel={s.travel} travelPreview={s.travelPreview}
          onPlan={(plan) => { setSaved(false); send({ type: 'SET_PLAN', plan }, 'plan'); }}
          onPreview={(county) => send({ type: 'PREVIEW_TRAVEL', county })}
          pending={s.pending}
          onChoose={(instance, choice) => { setSaved(false); send({ type: 'CHOOSE', instance, choice }, 'plan'); }}
          market={s.market}
          onTrade={(grain) => { setSaved(false); send({ type: 'TRADE', grain }, 'plan'); }}
          people={s.people}
          circle={s.circle}
        />
      )}
      {s.screen === 'summary' && s.summary && <SummaryScreen summary={s.summary} character={s.character} world={s.world} onBack={() => dispatch({ type: 'go', screen: 'menu' })} />}
      <MusicToggle />
      {s.error && (
        <div class="toast" role="alert" onClick={() => dispatch({ type: 'dismissError' })}>
          {t('ui.error', { message: s.error })}
        </div>
      )}
    </>
  );
}
