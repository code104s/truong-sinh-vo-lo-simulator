// "Lint" bằng test (ADR 0003, Q8): chặn API phá tất định và import phụ thuộc môi trường trong sim.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Bỏ chú thích để không bắt nhầm chữ trong comment. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const FORBIDDEN: [RegExp, string][] = [
  [/\bMath\.random\b/, 'Math.random'],
  [/\bDate\.now\b/, 'Date.now'],
  [/\bnew\s+Date\b/, 'new Date'],
  [/\bperformance\b/, 'performance'],
  [/\bcrypto\b/, 'crypto'],
  [/\bsetTimeout\b|\bsetInterval\b/, 'timer'],
  [/\bfrom\s+['"](react|preact|node:[^'"]*|fs|path)['"]/, 'import môi trường'],
  [/\b(window|document|self|indexedDB|Worker|postMessage)\b/, 'API trình duyệt'],
];
const ALLOWED_MATH = new Set(['imul', 'clz32', 'min', 'max', 'abs', 'trunc', 'floor', 'sign']);

describe('sim không dùng API cấm', () => {
  const all = files(SRC);

  it('có file để kiểm tra', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it.each(all.map((f) => [relative(SRC, f), f]))('%s', (_name, file) => {
    const code = stripComments(readFileSync(file, 'utf8'));
    const problems: string[] = [];
    code.split('\n').forEach((line, i) => {
      for (const [re, what] of FORBIDDEN) if (re.test(line)) problems.push(`dòng ${i + 1}: ${what}`);
      for (const m of line.matchAll(/\bMath\.(\w+)/g)) if (!ALLOWED_MATH.has(m[1]!)) problems.push(`dòng ${i + 1}: Math.${m[1]}`);
    });
    expect(problems).toEqual([]);
  });

  it('tự kiểm tra: bộ lọc bắt được vi phạm', () => {
    const bad = 'const x = Math.random(); const y = Math.sin(1); const t = Date.now();';
    const hits = FORBIDDEN.filter(([re]) => re.test(bad)).length + [...bad.matchAll(/\bMath\.(\w+)/g)].filter((m) => !ALLOWED_MATH.has(m[1]!)).length;
    expect(hits).toBe(4);
  });
});
