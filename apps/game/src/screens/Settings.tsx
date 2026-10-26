import { t } from '@tsvl/content';
import { useState } from 'preact/hooks';
import { music } from '../app/music';
import { InkLandscape, Scroll } from '../ui/ink';
import { useMusic } from '../ui/MusicToggle';

interface Props {
  seed: string;
  onSeed: (s: string) => void;
  onClear: () => Promise<void>;
  onDone: () => void;
}

export function Settings({ seed, onSeed, onClear, onDone }: Props) {
  const [cleared, setCleared] = useState(false);
  const musicState = useMusic();
  return (
    <div class="screen ink-screen centered">
      <InkLandscape />
      <Scroll title={t('ui.settings.title')} onClose={onDone} className="dialog">
        <div class="stack">
          <label class="field">
            <span>{t('ui.settings.seed')}</span>
            <input value={seed} onInput={(e) => onSeed((e.currentTarget as HTMLInputElement).value.trim())} placeholder="tsvl-01" />
            <small class="muted">{t('ui.settings.seed_hint')}</small>
          </label>
          <div class="field">
            <span>{t('ui.settings.music')}</span>
            <div class="row">
              <button class="btn ghost" onClick={() => music.toggle()} aria-pressed={musicState.on}>
                {musicState.on ? t('ui.music.on') : t('ui.music.off')}
              </button>
              <label class="volume">
                <span class="muted small">{t('ui.settings.volume')}</span>
                <input
                  type="range" min={0} max={100} step={5}
                  value={Math.round(musicState.volume * 100)}
                  onInput={(e) => music.setVolume(Number((e.currentTarget as HTMLInputElement).value) / 100)}
                />
                <span class="small">{Math.round(musicState.volume * 100)}</span>
              </label>
            </div>
          </div>
          <div class="row">
            <button class="btn ghost" onClick={async () => { await onClear(); setCleared(true); }}>{t('ui.settings.clear')}</button>
            {cleared && <span class="muted small">{t('ui.settings.cleared')}</span>}
          </div>
          <button class="btn primary" onClick={onDone}>{t('ui.settings.done')}</button>
        </div>
      </Scroll>
    </div>
  );
}
