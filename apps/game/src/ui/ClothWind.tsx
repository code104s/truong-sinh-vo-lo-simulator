// Gió thổi vạt áo, dải lụa và tóc của nhân vật trong tranh nền màn chính.
// Một canvas WebGL nhỏ phủ đúng vùng nhân vật, vẽ lại chính phần tranh đó nhưng làm méo theo sóng gió.
// Ngoài vùng vải canvas trong suốt, nên ghép liền với tranh gốc. Chỉ trang trí.
import { useEffect, useRef } from 'preact/hooks';

/** Toạ độ theo điểm ảnh của tranh gốc. */
export interface WindRegion {
  imageW: number;
  imageH: number;
  /** Hộp chứa nhân vật, canvas phủ đúng hộp này. */
  box: { x: number; y: number; w: number; h: number };
  /** "Sống lưng": vải gần đoạn này đứng yên, càng xa càng bay. */
  spine: [[number, number], [number, number]];
  /** Vùng được bay; w là hệ số (1 = vải nhẹ, 0.5 = tay áo nặng). */
  shapes: { w: number; pts: [number, number][] }[];
  /** Vùng phải đứng yên dù nằm sát vải (vd. đồ vật phía sau). */
  exclude?: [number, number][][];
}

const VERT = `
attribute vec2 a;
varying vec2 v;
void main() { v = vec2(a.x, 1.0 - a.y); gl_Position = vec4(a * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 v;
uniform sampler2D img;
uniform sampler2D mask;
uniform vec2 size;      // kích thước hộp (điểm ảnh tranh)
uniform vec2 origin;    // góc trên trái của hộp trong tranh
uniform vec2 spineA;
uniform vec2 spineB;
uniform float t;
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * h);
}
void main() {
  vec2 p = origin + v * size;
  float m = texture2D(mask, v).r;
  float w = m * smoothstep(10.0, 120.0, segDist(p, spineA, spineB));
  // Gió thổi sang trái: sóng chạy từ thân ra đuôi vải; cơn gió mạnh yếu theo thời gian
  float gust = 0.75 + 0.2 * sin(t * 0.55) + 0.12 * sin(t * 1.7 + 2.0);
  float ph = p.x * 0.085 + p.y * 0.035 + t * 3.1;
  // Sóng nhỏ chạy dọc vải + nhịp đung đưa chậm của cả mảng
  vec2 d = vec2(
    0.55 * sin(p.y * 0.07 + p.x * 0.045 + t * 2.3 + 0.7) + 0.35 * sin(t * 1.1 + p.y * 0.015),
    sin(ph) + 0.4 * sin(p.x * 0.2 - p.y * 0.05 + t * 5.3 + 1.3) + 0.5 * sin(t * 1.3 + p.x * 0.02)
  ) * 4.6 * gust * w;
  vec4 c = texture2D(img, (p + d - origin) / size);
  float a = smoothstep(0.0, 0.18, m);
  gl_FragColor = vec4(c.rgb * a, a);
}`;

function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}

function texture(gl: WebGLRenderingContext, unit: number, src: TexImageSource) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ClothWind({ src, region }: { src: string; region: WindRegion }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { box, imageW, imageH } = region;

  useEffect(() => {
    if (reducedMotion()) return;
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return;
    let raf = 0;
    let disposed = false;
    let cleanup = () => {};
    const t0 = performance.now();

    const img = new Image();
    img.src = src;
    img.decode().then(() => {
      if (disposed) return;
      // Phần tranh trong hộp
      const crop = document.createElement('canvas');
      crop.width = box.w;
      crop.height = box.h;
      crop.getContext('2d')!.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      // Mặt nạ: nền đen đặc (để viền mờ ra xám thật, không bị coi là trắng khi lên GPU),
      // tô các vùng vải theo hệ số rồi tô đen các vùng loại trừ, đều làm mờ để mép chuyển mượt
      const mask = document.createElement('canvas');
      mask.width = box.w;
      mask.height = box.h;
      const mg = mask.getContext('2d')!;
      mg.fillStyle = '#000';
      mg.fillRect(0, 0, box.w, box.h);
      mg.filter = 'blur(5px)';
      const poly = (pts: [number, number][], fill: string) => {
        mg.fillStyle = fill;
        mg.beginPath();
        pts.forEach(([x, y], i) => (i ? mg.lineTo(x - box.x, y - box.y) : mg.moveTo(x - box.x, y - box.y)));
        mg.closePath();
        mg.fill();
      };
      for (const s of region.shapes) {
        const g = Math.round(255 * s.w);
        poly(s.pts, `rgb(${g},${g},${g})`);
      }
      for (const pts of region.exclude ?? []) poly(pts, '#000');

      const prog = gl.createProgram()!;
      gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      texture(gl, 0, crop);
      texture(gl, 1, mask);
      gl.uniform1i(gl.getUniformLocation(prog, 'img'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'mask'), 1);
      gl.uniform2f(gl.getUniformLocation(prog, 'size'), box.w, box.h);
      gl.uniform2f(gl.getUniformLocation(prog, 'origin'), box.x, box.y);
      gl.uniform2f(gl.getUniformLocation(prog, 'spineA'), ...region.spine[0]);
      gl.uniform2f(gl.getUniformLocation(prog, 'spineB'), ...region.spine[1]);
      const uT = gl.getUniformLocation(prog, 't');

      const resize = () => {
        const dpr = Math.min(2, devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);

      const frame = (now: number) => {
        gl.uniform1f(uT, (now - t0) / 1000);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        raf = requestAnimationFrame(frame);
      };
      const onVisibility = () => {
        cancelAnimationFrame(raf);
        if (!document.hidden) raf = requestAnimationFrame(frame);
      };
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(frame);
      cleanup = () => {
        ro.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }).catch(() => {});

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanup();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [src]);

  return (
    <canvas
      class="cloth-wind"
      ref={ref}
      aria-hidden="true"
      style={{ left: `${(box.x / imageW) * 100}%`, top: `${(box.y / imageH) * 100}%`, width: `${(box.w / imageW) * 100}%`, height: `${(box.h / imageH) * 100}%` }}
    />
  );
}
