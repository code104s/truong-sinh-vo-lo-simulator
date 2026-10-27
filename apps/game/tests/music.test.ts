import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('khung RAF sớm hơn lúc bắt đầu fade không tạo âm lượng âm', async () => {
  const frames: FrameRequestCallback[] = [];
  let volume = 0, audio: { volume: number } | undefined;
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => '' }) });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockReturnValue(100);
  vi.stubGlobal('Audio', class {
    constructor() { audio = this; }
    get volume() { return volume; }
    set volume(v: number) { if (v < 0 || v > 1) throw new RangeError('volume'); volume = v; }
    play() { return Promise.resolve(); }
  });
  const { music } = await import('../src/app/music');
  music.toggle(); music.toggle(); await Promise.resolve();
  expect(frames).toHaveLength(1);
  expect(() => frames[0]!(99)).not.toThrow(); expect(audio!.volume).toBe(0);
  frames[1]!(2600); expect(audio!.volume).toBeCloseTo(0.4);
});
