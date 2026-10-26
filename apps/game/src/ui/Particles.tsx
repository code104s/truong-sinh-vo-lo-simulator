// Hiệu ứng hạt cho màn chính: cánh hoa mai trôi xuống và đốm linh khí bay lên. Chỉ trang trí.
import { useEffect, useRef } from 'preact/hooks';

interface Petal { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; sway: number; phase: number }
interface Mote { x: number; y: number; vy: number; r: number; phase: number; hue: number }

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    if (reducedMotion()) return;
    const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now();
    const petals: Petal[] = [];
    const motes: Mote[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    const newPetal = (anywhere: boolean): Petal => ({
      x: anywhere ? rnd(-0.1, 1) * w : rnd(-0.3, 0.6) * w,
      y: anywhere ? rnd(0, h) : rnd(-60, -10),
      vx: rnd(18, 45),
      vy: rnd(22, 48),
      r: rnd(3, 6.5),
      rot: rnd(0, Math.PI * 2),
      vr: rnd(-1.6, 1.6),
      sway: rnd(10, 26),
      phase: rnd(0, Math.PI * 2),
    });
    const newMote = (anywhere: boolean): Mote => ({
      x: rnd(0, w),
      y: anywhere ? rnd(0, h) : h + rnd(5, 40),
      vy: rnd(8, 22),
      r: rnd(0.8, 2.2),
      phase: rnd(0, Math.PI * 2),
      hue: Math.random() < 0.6 ? 45 : 170,
    });

    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const nPetals = Math.round((w * h) / 52000);
      const nMotes = Math.round((w * h) / 30000);
      while (petals.length < nPetals) petals.push(newPetal(true));
      petals.length = nPetals;
      while (motes.length < nMotes) motes.push(newMote(true));
      motes.length = nMotes;
    };

    const drawPetal = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.rot * 1.3)));
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.62, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 250, 246, 0.92)';
      ctx.shadowColor = 'rgba(255, 200, 210, 0.6)';
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const time = now / 1000;
      for (const m of motes) {
        m.y -= m.vy * dt;
        m.x += Math.sin(time * 0.6 + m.phase) * 6 * dt;
        if (m.y < -10) Object.assign(m, newMote(false));
        const a = 0.35 + 0.35 * Math.sin(time * 2 + m.phase);
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 5);
        g.addColorStop(0, `hsla(${m.hue}, 90%, 85%, ${a})`);
        g.addColorStop(1, `hsla(${m.hue}, 90%, 85%, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(m.x - m.r * 5, m.y - m.r * 5, m.r * 10, m.r * 10);
      }
      for (const p of petals) {
        p.x += (p.vx + Math.sin(time * 1.1 + p.phase) * p.sway) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y > h + 20 || p.x > w + 30) Object.assign(p, newPetal(false));
        drawPetal(p);
      }
      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas class="particles" ref={ref} aria-hidden="true" />;
}
