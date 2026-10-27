// Nhạc nền: một bản lặp xuyên suốt game. Trình duyệt chặn tự phát âm thanh, nên nhạc bắt đầu ở tương tác đầu tiên.
// Lựa chọn bật/tắt và âm lượng là tiện ích riêng của người xem, lưu trong localStorage (không thuộc save).
import trackMp3 from '../assets/music/bamboo-flute-guzheng-128.mp3';
import trackOpus from '../assets/music/bamboo-flute-guzheng.webm';

const KEY = 'tsvl.music';

/** Opus 96 kbps (~2,7 MB) khi trình duyệt hỗ trợ; trình duyệt cũ (Safari trước 17) dùng MP3 128 kbps (~3,1 MB). */
function pickTrack(): string {
  const probe = document.createElement('audio');
  return probe.canPlayType('audio/webm; codecs="opus"') ? trackOpus : trackMp3;
}

const FADE_MS = 2500;

export interface MusicPrefs {
  on: boolean;
  /** 0..1 */
  volume: number;
}

function loadPrefs(): MusicPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<MusicPrefs>;
      return { on: p.on !== false, volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : 0.4 };
    }
  } catch {
    // localStorage có thể bị chặn: dùng mặc định
  }
  return { on: true, volume: 0.4 };
}

class Music {
  private audio: HTMLAudioElement | null = null;
  private prefs = loadPrefs();
  private fadeRaf = 0;
  private unlocked = false;
  private listeners = new Set<(p: MusicPrefs) => void>();

  get state(): MusicPrefs {
    return { ...this.prefs };
  }

  subscribe(fn: (p: MusicPrefs) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Gắn một lần khi khởi động: chờ tương tác đầu tiên rồi mới phát. */
  install(): void {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      for (const ev of ['pointerdown', 'keydown'] as const) removeEventListener(ev, unlock, true);
      if (this.prefs.on) void this.start();
    };
    for (const ev of ['pointerdown', 'keydown'] as const) addEventListener(ev, unlock, true);
    // Tạm lặng khi tab ẩn để không phát nhạc nền khi người chơi đang làm việc khác
    document.addEventListener('visibilitychange', () => {
      if (!this.audio || !this.prefs.on) return;
      if (document.hidden) this.audio.pause();
      else void this.audio.play().catch(() => {});
    });
  }

  toggle(): void {
    this.set({ on: !this.prefs.on });
  }

  setVolume(volume: number): void {
    this.set({ volume: Math.min(1, Math.max(0, volume)) });
  }

  private set(patch: Partial<MusicPrefs>): void {
    const wasOn = this.prefs.on;
    this.prefs = { ...this.prefs, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs));
    } catch {
      // bỏ qua: chỉ là tiện ích
    }
    if (this.prefs.on && !wasOn) {
      this.unlocked = true;
      void this.start();
    } else if (!this.prefs.on && wasOn) {
      this.fadeTo(0, 600, () => this.audio?.pause());
    } else if (this.audio && this.prefs.on) {
      cancelAnimationFrame(this.fadeRaf);
      this.audio.volume = this.prefs.volume;
    }
    for (const l of this.listeners) l(this.state);
  }

  private async start(): Promise<void> {
    if (!this.audio) {
      this.audio = new Audio(pickTrack());
      this.audio.loop = true;
      this.audio.preload = 'auto';
    }
    this.audio.volume = 0;
    try {
      await this.audio.play();
      this.fadeTo(this.prefs.volume, FADE_MS);
    } catch {
      // Trình duyệt vẫn chặn (chưa đủ tương tác): thử lại ở lần bấm sau
      this.unlocked = false;
      this.install();
    }
  }

  private fadeTo(target: number, ms: number, done?: () => void): void {
    const a = this.audio;
    if (!a) return;
    cancelAnimationFrame(this.fadeRaf);
    const from = a.volume;
    const t0 = performance.now();
    const step = (now: number) => {
      // RAF có thể mang thời điểm đầu khung hình, sớm hơn t0 vài phần mili giây.
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      a.volume = from + (target - from) * k;
      if (k < 1) this.fadeRaf = requestAnimationFrame(step);
      else done?.();
    };
    this.fadeRaf = requestAnimationFrame(step);
  }
}

export const music = new Music();
