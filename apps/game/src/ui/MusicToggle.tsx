import { t } from '@tsvl/content';
import { useEffect, useState } from 'preact/hooks';
import { music, type MusicPrefs } from '../app/music';

/** Theo dõi trạng thái nhạc nền trong component. */
export function useMusic(): MusicPrefs {
  const [state, setState] = useState(music.state);
  useEffect(() => music.subscribe(setState), []);
  return state;
}

/** Ấn tròn chữ 樂 ở góc màn hình: bấm để bật/tắt nhạc nền. */
export function MusicToggle() {
  const { on } = useMusic();
  const label = on ? t('ui.music.on') : t('ui.music.off');
  return (
    <button class={`music-toggle${on ? '' : ' is-off'}`} onClick={() => music.toggle()} aria-label={label} title={label} aria-pressed={on}>
      樂
    </button>
  );
}
