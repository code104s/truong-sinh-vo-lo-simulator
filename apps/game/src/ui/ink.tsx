// Bộ giao diện thủy mặc tự vẽ bằng SVG/CSS (không dùng tài sản của game khác): núi mờ, cuộn giấy, nét cọ, ấn triện.
import { t } from '@tsvl/content';
import type { ComponentChildren } from 'preact';

/** Nhiễu giá trị 1 chiều cố định (chỉ trang trí): cùng tham số luôn ra cùng dáng núi. */
function ridge(seed: number, width: number, base: number, amp: number, steps: number): string {
  const hash = (i: number) => {
    const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const smooth = (x: number) => {
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    return hash(i) * (1 - u) + hash(i + 1) * u;
  };
  // Vài khối núi lớn + chi tiết nhỏ dần; đỉnh nhọn hơn nhờ lũy thừa
  const pts: [number, number][] = [];
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const h = 0.55 * smooth(u * 3 + seed * 3) + 0.3 * smooth(u * 8 + seed * 5) + 0.15 * smooth(u * 21 + seed * 7);
    pts.push([u * width, base - amp * Math.pow(h, 1.6)]);
  }
  // Catmull-Rom → Bézier bậc ba: đường cong đi qua mọi điểm, không vọt như lệnh T
  let d = `M0 1000 L${pts[0]![0]} ${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)]!;
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[i + 1]!;
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 2)]!;
    d += ` C${(x1 + (x2 - x0) / 6).toFixed(1)} ${(y1 + (y2 - y0) / 6).toFixed(1)} ${(x2 - (x3 - x1) / 6).toFixed(1)} ${(y2 - (y3 - y1) / 6).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return `${d} L${width} 1000 Z`;
}

const LAYERS = [
  { seed: 1, base: 620, amp: 340, tone: '#a19d94', alpha: 0.4 },
  { seed: 2, base: 760, amp: 300, tone: '#7d7a72', alpha: 0.45 },
  { seed: 3, base: 880, amp: 260, tone: '#5f5c56', alpha: 0.55 },
  { seed: 4, base: 1000, amp: 210, tone: '#3e3c38', alpha: 0.75 },
];

/** Nền núi thủy mặc phủ kín màn hình, có sương giữa các lớp. */
export function InkLandscape() {
  return (
    <svg class="ink-landscape" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="ink-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#efece4" />
          <stop offset="1" stop-color="#ddd8cc" />
        </linearGradient>
        <filter id="ink-soft"><feGaussianBlur stdDeviation="2.2" /></filter>
        {LAYERS.map((l) => (
          <linearGradient key={l.seed} id={`ink-fade-${l.seed}`} x1="0" y1={l.base - l.amp * 1.3} x2="0" y2={l.base + 40} gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color={l.tone} stop-opacity={l.alpha} />
            <stop offset="0.55" stop-color={l.tone} stop-opacity={l.alpha * 0.85} />
            <stop offset="1" stop-color="#ece8df" stop-opacity="0" />
          </linearGradient>
        ))}
      </defs>
      <rect width="1600" height="1000" fill="url(#ink-sky)" />
      <circle cx="1240" cy="210" r="70" fill="#c9b9a2" opacity="0.35" />
      {LAYERS.map((l) => (
        <path key={l.seed} d={ridge(l.seed, 1600, l.base, l.amp, 64)} fill={`url(#ink-fade-${l.seed})`} filter="url(#ink-soft)" />
      ))}
    </svg>
  );
}

/** Cuộn giấy có trục gỗ hai bên; `title` hiện thành nhãn nét cọ ở góc trên. */
export function Scroll({ title, onClose, className = '', children }: { title?: string; onClose?: () => void; className?: string; children: ComponentChildren }) {
  return (
    <div class={`scroll ${className}`}>
      <div class="scroll-rod" />
      <div class="scroll-paper">
        {title && <BrushLabel className="scroll-title">{title}</BrushLabel>}
        {onClose && (
          <button class="close" onClick={onClose} aria-label={t('ui.close')} title={t('ui.close')}>
            ✕
          </button>
        )}
        {children}
      </div>
      <div class="scroll-rod" />
    </div>
  );
}

/**
 * Tranh treo (卷軸 dọc) cho bản đồ: trục gỗ ngang trên và dưới, viền gấm, giấy lụa ngả vàng, tờ đề tựa ở góc.
 * Khác hẳn cuộn ngang (trục hai bên) của màn Đời người để nhìn qua là biết đang xem dư đồ. Mở ra thì trải từ trên xuống.
 */
export function HangingScroll({ title, han, onClose, className = '', children }: { title: string; han: string; onClose?: () => void; className?: string; children: ComponentChildren }) {
  return (
    <div class={`hanging ${className}`}>
      <div class="hanging-rod hanging-rod-top" aria-hidden="true" />
      <div class="hanging-mount">
        <div class="hanging-slip"><span class="slip-han">{han}</span><span class="slip-vi">{title}</span></div>
        {onClose && (
          <button class="close" onClick={onClose} aria-label={t('ui.close')} title={t('ui.close')}>
            ✕
          </button>
        )}
        <div class="hanging-silk">{children}</div>
      </div>
      <div class="hanging-rod hanging-rod-bottom" aria-hidden="true" />
    </div>
  );
}

/** Nhãn chữ sáng trên nét cọ mực. */
export function BrushLabel({ children, className = '' }: { children: ComponentChildren; className?: string }) {
  return <span class={`brush-label ${className}`}>{children}</span>;
}

/** Ấn triện vuông có một chữ Hán; tone chu sa, mực, ngọc (lành) hoặc hoàng thổ (cảnh báo). */
export function Seal({ char, tone = 'red', title }: { char: string; tone?: 'red' | 'ink' | 'jade' | 'ochre'; title?: string }) {
  return (
    <span class={`seal seal-${tone}`} title={title} aria-hidden={title ? undefined : true}>
      {char}
    </span>
  );
}

/** Vòng cọ (ensō) có chữ ở giữa, dùng cho mùa. */
export function Enso({ char, label }: { char: string; label: string }) {
  return (
    <span class="enso" title={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M78 22 C62 6 28 8 15 32 C2 56 18 88 48 91 C76 94 94 70 88 46 C85 34 80 28 74 25" fill="none" stroke="#1f1f1f" stroke-width="7" stroke-linecap="round" opacity="0.85" />
      </svg>
      <span class="enso-char">{char}</span>
    </span>
  );
}

/**
 * Dáng người bằng mực khi chưa có ảnh (đề xuất giao diện Q3): lớn dần theo tuổi — bọc tã, trẻ nhỏ búi tóc trái đào,
 * thiếu niên, người lớn. Thay bằng ảnh thật khi có bộ chân dung trẻ.
 */
function InkFigure({ age }: { age: number }) {
  const ink = '#2c2b29';
  if (age < 3) {
    return <g fill={ink} opacity="0.85">
      <ellipse cx="50" cy="120" rx="30" ry="24" />
      <circle cx="50" cy="88" r="17" />
      <path d="M33 82 C36 70 64 70 67 82 C60 77 40 77 33 82 Z" fill="#111" />
    </g>;
  }
  if (age < 12) {
    return <g fill={ink} opacity="0.85">
      <path d="M14 150 C18 124 32 114 50 114 C68 114 82 124 86 150 Z" />
      <ellipse cx="50" cy="90" rx="17" ry="19" />
      <circle cx="37" cy="70" r="7" fill="#111" /><circle cx="63" cy="70" r="7" fill="#111" />
    </g>;
  }
  const scale = age < 15 ? 0.9 : 1;
  return <g fill={ink} opacity="0.85" transform={`translate(${50 * (1 - scale)} ${150 * (1 - scale)}) scale(${scale})`}>
    <path d="M0 150 C6 112 28 100 50 100 C72 100 94 112 100 150 Z" />
    <ellipse cx="50" cy="66" rx="19" ry="23" />
    <path d="M28 56 C30 32 70 32 72 56 C65 46 35 46 28 56 Z" fill="#111" />
  </g>;
}

/** Khung chân dung viền vàng (tỉ lệ 2:3). Có ảnh thì hiện ảnh; chưa có thì vẽ dáng người bằng mực theo tuổi. */
export function Portrait({ src, alt = '', caption, age = 30 }: { src?: string | null; alt?: string; caption?: string; age?: number }) {
  return (
    <figure class="portrait">
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <svg viewBox="0 0 100 150" aria-hidden="true">
          <rect width="100" height="150" fill="#d9d3c5" />
          <InkFigure age={age} />
        </svg>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
