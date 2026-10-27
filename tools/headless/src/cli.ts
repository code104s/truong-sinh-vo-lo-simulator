// CLI mô phỏng không giao diện (GDD 3.2 O). Dùng cùng SimHost với worker trong trình duyệt.
//   pnpm sim life --seed tsvl-01 --birthplace "Phố Kỳ" [--life-seed N] [--save-at TICK --out f.json] [--load f.json] [--quiet]
//   pnpm sim batch --seeds 1000 [--worlds 10] [--threads K] [--policy balanced|all] [--out report.json]
//   pnpm sim replay --save file.json
//   pnpm sim regions --seeds 100 [--threads K] [--once]
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { t } from '@tsvl/content';
import { calendarOf, decodeSave, encodeSave, type Birthplace, type Command, type LogEntry, type RegionId, type SettlementKind, type Tick, type WorkerMessage } from '@tsvl/shared';
import { digestOf, replaySave, SimHost } from '@tsvl/sim';
import { buildRegion, regionIdentity, type RegionLogic } from '@tsvl/worldgen';
import { runPolicyBatch } from './batch';

// —— Luồng phụ: sinh vùng ——
interface RegionJob { seed: string }
interface RegionResult { logic: RegionLogic | null; seed: string; ok: boolean; error?: string; digest: string; regionId: RegionId; birthplaces: Birthplace[]; counties: number; landKm2: number; size: [number, number]; ms: number }

function regionJob({ seed }: RegionJob): RegionResult {
  const t0 = performance.now();
  try {
    const b = buildRegion(seed);
    const capital = b.birthplaces.find((p) => p.kind === 'city')!;
    const seen = new Set([capital.county]);
    for (let pass = 0; pass < b.logic.counties.length; pass++) for (const [a, c] of b.logic.adjacency) {
      if (seen.has(a)) seen.add(c);
      if (seen.has(c)) seen.add(a);
    }
    if (seen.size !== b.logic.counties.length || b.birthplaces.some((p) => !seen.has(p.county))) throw new Error('vùng không liên thông tới kinh đô');
    return { logic: b.logic, seed, ok: true, digest: digestOf(regionIdentity(b)), regionId: b.summary.id, birthplaces: b.birthplaces, counties: b.map.counties.length, landKm2: b.summary.landKm2, size: [b.map.W, b.map.H], ms: performance.now() - t0 };
  } catch (e) {
    return { logic: null, seed, ok: false, error: (e as Error).message, digest: '', regionId: 'r0' as RegionId, birthplaces: [], counties: 0, landKm2: 0, size: [0, 0], ms: performance.now() - t0 };
  }
}

/** Chạy các việc sinh vùng song song trên K luồng; giữ thứ tự kết quả theo đầu vào. */
async function regionPool(jobs: RegionJob[], threads: number): Promise<RegionResult[]> {
  const out: RegionResult[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const n = Math.max(1, Math.min(threads, jobs.length));
  await new Promise<void>((resolveAll, reject) => {
    for (let w = 0; w < n; w++) {
      const worker = new Worker(new URL(import.meta.url), { execArgv: process.execArgv });
      let current = -1;
      const feed = () => {
        if (next >= jobs.length) return void worker.terminate();
        current = next++;
        worker.postMessage(jobs[current]);
      };
      worker.on('message', (r: RegionResult) => {
        out[current] = r;
        done++;
        process.stderr.write(`\r  vùng ${done}/${jobs.length}`);
        if (done === jobs.length) {
          process.stderr.write('\n');
          resolveAll();
        }
        feed();
      });
      worker.on('error', reject);
      feed();
    }
  });
  return out;
}

// —— Tiện ích ——
const cwd = () => process.env.INIT_CWD ?? process.cwd();
const shortDate = (tick: Tick) => {
  const d = calendarOf(tick);
  return t('date.short', { year: d.year, month: `month.${d.month}` });
};
const logText = (e: LogEntry) => t(e.params.scar === 1 ? `${e.key}.scar` : e.key, e.params);

function makeHost() {
  let reqId = 0;
  let sink: WorkerMessage[] = [];
  const h = new SimHost((m) => sink.push(m));
  const call = (cmd: Record<string, unknown>) => {
    sink = [];
    h.handle({ ...cmd, reqId: ++reqId } as unknown as Command);
    const err = sink.find((m) => m.type === 'ERROR');
    if (err && err.type === 'ERROR') throw new Error(`${err.code}: ${err.message}`);
    return sink;
  };
  return { host: h, call };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values: a } = parseArgs({
    args: rest,
    options: {
      seed: { type: 'string', default: 'tsvl-01' },
      birthplace: { type: 'string' },
      'life-seed': { type: 'string' },
      'save-at': { type: 'string' },
      out: { type: 'string' },
      load: { type: 'string' },
      save: { type: 'string' },
      policy: { type: 'string', default: 'balanced' },
      quiet: { type: 'boolean', default: false },
      seeds: { type: 'string', default: '1000' },
      worlds: { type: 'string', default: '10' },
      threads: { type: 'string', default: String(Math.max(1, cpus().length - 1)) },
      once: { type: 'boolean', default: false },
    },
  });
  switch (cmd) {
    case 'life':
      return lifeCmd(a);
    case 'batch':
      return batchCmd(Number(a.seeds), Number(a.worlds), Number(a.threads), a.policy!, a.out);
    case 'replay': {
      if (!a.save) throw new Error('Dùng: pnpm sim replay --save file.json');
      const decoded = decodeSave(readFileSync(resolve(cwd(), a.save), 'utf8'));
      if (!decoded.ok) throw new Error(decoded.error);
      console.log(`KẾT QUẢ: PASS · replay digest ${replaySave(decoded.value)}`); return;
    }
    case 'regions':
      return regionsCmd(Number(a.seeds), Number(a.threads), a.once ?? false);
    default:
      console.log('Dùng: pnpm sim life|batch|regions|replay …  (xem đầu tools/headless/src/cli.ts)');
      process.exit(cmd ? 1 : 0);
  }
}

// —— life ——
function lifeCmd(a: { seed?: string; birthplace?: string; 'life-seed'?: string; 'save-at'?: string; out?: string; load?: string; quiet?: boolean }) {
  const { host, call } = makeHost();
  const log: LogEntry[] = [];
  const collect = (ms: WorkerMessage[]) => {
    for (const m of ms) if (m.type === 'LOG') log.push(...m.entries);
  };
  let worldMs = 0;
  if (a.load) {
    const decoded = decodeSave(readFileSync(resolve(cwd(), a.load), 'utf8'));
    if (!decoded.ok) throw new Error(`save hỏng: ${decoded.error}`);
    collect(call({ type: 'LOAD', save: decoded.value }));
    console.log(`Tải ${a.load} (không sinh lại bản đồ)`);
  } else {
    const seed = a.seed!;
    const t0 = performance.now();
    call({ type: 'GEN_WORLD', worldSeed: seed });
    worldMs = performance.now() - t0;
    const region = host.current.region!;
    const q = (a.birthplace ?? '').toLowerCase();
    const bp = region.birthplaces.find((b, i) => b.id === a.birthplace || b.name.toLowerCase() === q || String(i) === q) ?? (a.birthplace ? undefined : region.birthplaces[0]);
    if (!bp) {
      console.error(`Không có nơi sinh "${a.birthplace}". Các nơi sinh của ${seed}:`);
      region.birthplaces.forEach((b, i) => console.error(`  ${i}  ${b.id}  ${b.name} (${t(`kind.${b.kind}`)})`));
      process.exit(1);
    }
    const lifeSeed = a['life-seed'] === undefined ? undefined : Number(a['life-seed']);
    collect(call({ type: 'NEW_LIFE', config: { worldSeed: seed, regionId: region.summary.id, birthplaceId: bp.id, ...(lifeSeed === undefined ? {} : { lifeSeed }) } }));
    console.log(`Thế giới ${seed} · vùng ${region.summary.name} (${region.summary.id}) thuộc ${region.summary.realmName} · sinh ${worldMs.toFixed(0)} ms`);
    console.log(`Nơi sinh: ${bp.name} ${bp.nameHan} (${t(`kind.${bp.kind}`)}) ${bp.id}`);
  }
  const life = host.current.life!;
  const v = life.view();
  console.log(`Nhân vật: ${v.name} · ${t(`gender.${v.gender}`)} · xuất thân ${t(v.background)} · ${t(v.personality)} · thể chất ${t(v.constitution)} · ngộ tính ${t(v.aptitude)}${v.traits.length ? ` · ${v.traits.map((x) => t(x)).join(', ')}` : ''}`);

  const startTick = life.tick;
  const t1 = performance.now();
  if (a['save-at']) {
    const at = Number(a['save-at']);
    while (life.alive && life.tick < at) collect(call({ type: 'ADVANCE', mode: 'week' }));
    if (life.alive) {
      const saved = call({ type: 'SAVE' }).find((m) => m.type === 'SAVED');
      if (!saved || saved.type !== 'SAVED') throw new Error('không lưu được');
      const file = resolve(cwd(), a.out ?? `save-${life.tick}.json`);
      writeFileSync(file, encodeSave(saved.save));
      console.log(`Lưu ở tick ${life.tick} → ${file} (digest ${saved.save.digest})`);
    }
  }
  let summary = null;
  while (!summary) {
    const ms = call({ type: 'ADVANCE', mode: 'year' });
    collect(ms);
    for (const m of ms) if (m.type === 'DIED') summary = m.summary;
  }
  const lifeMs = performance.now() - t1;
  if (!a.quiet) for (const e of log) console.log(`  ${shortDate(e.tick).padEnd(22)} ${e.importance === 'major' ? '' : '· '}${logText(e)}`);
  const ticks = summary.deathTick - startTick;
  console.log(`Tổng kết: ${summary.name} sống ${summary.ageYears} năm · ${t(`death.${summary.cause}`)} (${t(summary.causeDetail)})`);
  console.log(`digest ${summary.digest}`);
  console.log(`Đo: sinh thế giới ${worldMs.toFixed(0)} ms · đời ${lifeMs.toFixed(1)} ms · ${ticks} tick · ${((lifeMs * 1000) / Math.max(1, ticks)).toFixed(1)} µs/tick (gồm vòng lệnh SimHost)`);
}

// —— batch ——
async function batchCmd(n: number, worldsWanted: number, threads: number, policy: string, out?: string) {
  if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(worldsWanted) || worldsWanted <= 0 || !Number.isInteger(threads) || threads <= 0) throw new Error('seeds/worlds/threads phải là số nguyên dương');
  const worlds = Math.min(worldsWanted, n);
  console.log(`Batch ${n} đời × ${policy} trên ${worlds} thế giới`);
  const regions = await regionPool(Array.from({ length: worlds }, (_, i) => ({ seed: `batch-${String(i + 1).padStart(2, '0')}` })), threads);
  const bad = regions.filter((r) => !r.ok);
  if (bad.length) throw new Error(`sinh vùng lỗi: ${bad.map((r) => `${r.seed}: ${r.error}`).join('; ')}`);
  runPolicyBatch(regions, n, policy, out);
}

// —— regions ——
async function regionsCmd(n: number, threads: number, once: boolean) {
  const seeds = Array.from({ length: n }, (_, i) => `tsvl-${String(i + 1).padStart(3, '0')}`);
  const jobs = once ? seeds.map((seed) => ({ seed })) : seeds.flatMap((seed) => [{ seed }, { seed }]);
  console.log(`Sinh vùng cho ${n} seed${once ? '' : ' × 2 lần độc lập'} trên ${threads} luồng`);
  const t0 = performance.now();
  const res = await regionPool(jobs, threads);
  const wall = performance.now() - t0;
  const fails = res.filter((r) => !r.ok);
  let mismatch = 0;
  if (!once) for (let i = 0; i < n; i++) if (res[2 * i]!.digest !== res[2 * i + 1]!.digest) mismatch++;
  const ok = res.filter((r) => r.ok);
  const stat = (f: (r: RegionResult) => number) => {
    const xs = ok.map(f).sort((x, y) => x - y);
    return `${xs[0]}–${xs.at(-1)} (trung vị ${xs[Math.floor(xs.length / 2)]})`;
  };
  const kinds = (k: SettlementKind) => stat((r) => r.birthplaces.filter((b) => b.kind === k).length);
  console.log(`Lỗi sinh vùng: ${fails.length}${fails.length ? ` (${fails.map((r) => r.seed).join(', ')})` : ''}`);
  if (!once) console.log(`Cùng seed khác digest vùng: ${mismatch}/${n}`);
  console.log(`Quận: ${stat((r) => r.counties)} · đất ${stat((r) => r.landKm2)} km² · hộp ${stat((r) => r.size[0])}×${stat((r) => r.size[1])} ô`);
  console.log(`Nơi sinh: thành ${kinds('city')} · trấn ${kinds('town')} · làng ${kinds('village')}`);
  console.log(`Đo: sinh một vùng (gồm cả thế giới 1024×768) trung bình ${(ok.reduce((s, r) => s + r.ms, 0) / ok.length / 1000).toFixed(2)} s · tổng ${(wall / 1000).toFixed(1)} s`);
  const pass = fails.length === 0 && mismatch === 0;
  console.log(pass ? 'KẾT QUẢ: PASS' : 'KẾT QUẢ: FAIL');
  if (!pass) process.exitCode = 1;
}

// Khởi động ở cuối file: mọi hằng phía trên đã được khởi tạo
if (!isMainThread) {
  parentPort!.on('message', (job: RegionJob) => parentPort!.postMessage(regionJob(job)));
} else {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
