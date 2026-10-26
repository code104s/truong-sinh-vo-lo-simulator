import { t } from '@tsvl/content';
import { useEffect, useRef } from 'preact/hooks';
import background from '../assets/menu-bg.webp';
import { ClothWind, type WindRegion } from '../ui/ClothWind';
import { Seal } from '../ui/ink';
import { Particles } from '../ui/Particles';

interface Props {
  ready: boolean;
  hasSave: boolean;
  onNew: () => void;
  onContinue: () => void;
  onSettings: () => void;
}

/** Điểm trong tranh nền (theo % chiều rộng/cao của tranh) gắn hiệu ứng ánh sáng. */
const HALO = { x: 66.8, y: 15 };
const MOON = { x: 87.1, y: 8.6 };
const LANTERNS = [{ x: 12.2, y: 44.2 }, { x: 2.6, y: 49.4 }];

/** Nhân vật trên vách đá (điểm ảnh tranh gốc 1774×887): tóc, dải lụa, vạt áo bay theo gió thổi sang trái. */
const WIND: WindRegion = {
  imageW: 1774,
  imageH: 887,
  box: { x: 300, y: 400, w: 260, h: 260 },
  spine: [[452, 428], [456, 515]],
  shapes: [
    { w: 1, pts: [[447, 426], [458, 438], [462, 455], [460, 474], [452, 500], [432, 522], [404, 526], [380, 522], [372, 506], [384, 482], [392, 466], [384, 456], [388, 442], [410, 434], [430, 427]] },
    { w: 1, pts: [[322, 537], [342, 529], [380, 522], [420, 519], [446, 519], [449, 533], [420, 539], [380, 543], [346, 547], [326, 547]] },
    { w: 1, pts: [[444, 514], [470, 514], [482, 558], [481, 598], [474, 618], [430, 620], [408, 629], [384, 627], [366, 612], [357, 598], [357, 584], [374, 565], [408, 545], [430, 530]] },
    { w: 0.5, pts: [[468, 470], [486, 478], [490, 518], [485, 546], [476, 546], [471, 508]] },
  ],
  // Ghế gỗ phía sau dải lụa
  exclude: [[[300, 551], [350, 551], [352, 600], [300, 600]]],
};

export function MainMenu({ ready, hasSave, onNew, onContinue, onSettings }: Props) {
  const scene = useRef<HTMLDivElement>(null);

  // Parallax: nền và lớp sương dịch nhẹ theo con trỏ (biến CSS --px, --py trong khoảng -1..1)
  useEffect(() => {
    const el = scene.current!;
    let raf = 0, tx = 0, ty = 0, x = 0, y = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / innerWidth) * 2 - 1;
      ty = (e.clientY / innerHeight) * 2 - 1;
    };
    const tick = () => {
      x += (tx - x) * 0.05;
      y += (ty - y) * 0.05;
      el.style.setProperty('--px', x.toFixed(4));
      el.style.setProperty('--py', y.toFixed(4));
      raf = requestAnimationFrame(tick);
    };
    addEventListener('pointermove', onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const han = [...t('ui.title_han')];
  return (
    <div class="screen menu-scene" ref={scene}>
      <div class="stage-par">
        <div class="stage">
          <div class="stage-kb">
            <img class="stage-img" src={background} alt="" />
            <ClothWind src={background} region={WIND} />
            <span class="glow halo-glow" style={{ left: `${HALO.x}%`, top: `${HALO.y}%` }} />
            <span class="glow halo-ring" style={{ left: `${HALO.x}%`, top: `${HALO.y}%` }} />
            <span class="glow moon-glow" style={{ left: `${MOON.x}%`, top: `${MOON.y}%` }} />
            {LANTERNS.map((l, i) => (
              <span key={i} class="glow lantern" style={{ left: `${l.x}%`, top: `${l.y}%`, animationDelay: `${i * 0.7}s` }} />
            ))}
          </div>
        </div>
      </div>
      <div class="mist mist-far" />
      <div class="mist mist-near" />
      <Particles />
      <div class="vignette" />

      <div class="menu-panel">
        <h1 class="title-han" aria-label={t('ui.title_han')}>
          {han.map((c, i) => (
            <span key={i} style={{ animationDelay: `${0.5 + i * 0.28}s` }}>{c}</span>
          ))}
        </h1>
        <div class="title-side">
          <div class="title-vi">
            <span>{t('ui.title')}</span>
            <Seal char="命" />
          </div>
          <p class="subtitle">{t('ui.subtitle')}</p>
          <nav class="menu-list">
            <button class="menu-item" disabled={!ready} onClick={onNew}>{t('ui.menu.new')}</button>
            <button class="menu-item" disabled={!ready || !hasSave} onClick={onContinue} title={hasSave ? '' : t('ui.menu.continue_none')}>
              {t('ui.menu.continue')}
            </button>
            <button class="menu-item" disabled title={t('ui.menu.lives_soon')}>{t('ui.menu.lives')}</button>
            <button class="menu-item" onClick={onSettings}>{t('ui.menu.settings')}</button>
          </nav>
        </div>
      </div>
      <p class="version">{ready ? t('ui.version') : t('ui.menu.booting')}</p>
      <div class="intro-fade" />
    </div>
  );
}
