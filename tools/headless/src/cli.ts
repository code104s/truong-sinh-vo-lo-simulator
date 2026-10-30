// CLI mô phỏng không giao diện (GDD 3.2 O). Dùng cùng SimHost với worker trong trình duyệt.
//   pnpm sim life --seed tsvl-01 --birthplace "Phố Kỳ" [--life-seed N] [--save-at TICK --out f.json] [--load f.json] [--quiet]
//   pnpm sim batch --seeds 1000 [--worlds 10] [--threads K] [--policy balanced|all] [--out report.json]   (K luồng sinh vùng và chạy đời; 1 = tuần tự)
//   pnpm sim replay --save file.json
//   pnpm sim regions --seeds 100 [--threads K] [--once]
//   pnpm sim economy --seeds 10 [--years 100] [--threads K]   (chợ quận không người chơi, ADR 0012)
//   pnpm sim world --seeds 10 [--years 100] [--threads K] [--all-l0]   (thế giới tự chạy có NPC, không người chơi; v0.4 Q11)
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { t } from '@tsvl/content';
import { calendarOf, decodeSave, encodeSave, type Birthplace, type Command, type LogEntry, type RegionId, type SettlementKind, type Tick, type WorkerMessage } from '@tsvl/shared';
import { digestOf, replaySave, SimHost, simulateEconomy, simulateWorld, type WorldRunStats } from '@tsvl/sim';
import { buildRegion, regionIdentity, type RegionLogic } from '@tsvl/worldgen';
import { runLife, runPolicyBatch, sequentialRunner, type BatchRegion, type LifeResult, type LifeRunner, type TravelCache } from './batch';
import type { Strategy } from './batch';

// —— Luồng phụ: sinh vùng, chạy đời trong batch ——
interface RegionJob { kind?: 'region'; seed: string }
/** Một đoạn đời [from, to) của một chiến lược; vùng gửi kèm (nhỏ: logic số nguyên và nơi sinh). */
interface LivesJob { kind: 'lives'; regions: BatchRegion[]; policy: Strategy; from: number; to: number }
/** Mỗi luồng giữ bộ đệm đích đi được riêng (thuần nên không đổi kết quả). */
const workerTravelCache: TravelCache = new Map();
function livesJob(j: LivesJob): LifeResult[] {
  const out: LifeResult[] = [];
  for (let i = j.from; i < j.to; i++) out.push(runLife(j.regions, j.policy, i, workerTravelCache));
  return out;
}

/**
 * Số đời mỗi việc: nhỏ để các luồng xong gần cùng lúc (đời dài ngắn khác nhau). v0.5 S8: 20 → 5 (1.000 đời chỉ thành 50
 * việc cho 15 luồng, vài đời dài cuối cùng giữ cả batch chờ).
 */
const LIVES_PER_JOB = 5;

/**
 * Chạy đời song song trên K luồng (v0.4: batch có NPC chậm 15 lần). Các đời độc lập nhau nên kết quả từng đời giống hệt
 * chạy tuần tự; gộp theo thứ tự đời nên báo cáo cũng giống hệt. K = 1 thì chạy tuần tự trên luồng chính.
 */
function parallelRunner(regions: BatchRegion[], threads: number): LifeRunner {
  if (threads <= 1) return sequentialRunner(regions);
  // Chỉ gửi phần cần cho mô phỏng, không gửi bản đồ
  const slim = regions.map((r) => ({ seed: r.seed, regionId: r.regionId, birthplaces: r.birthplaces, logic: r.logic }));
  return (policy, n) => new Promise<LifeResult[]>((resolveAll, reject) => {
    const jobs: LivesJob[] = [];
    for (let from = 0; from < n; from += LIVES_PER_JOB) jobs.push({ kind: 'lives', regions: slim, policy, from, to: Math.min(n, from + LIVES_PER_JOB) });
    const out: LifeResult[] = new Array(n);
    let next = 0, done = 0;
    const k = Math.max(1, Math.min(threads, jobs.length));
    for (let w = 0; w < k; w++) {
      const worker = new Worker(new URL(import.meta.url), { execArgv: process.execArgv });
      let current: LivesJob | null = null;
      const feed = () => {
        if (next >= jobs.length) { current = null; return void worker.terminate(); }
        current = jobs[next++]!;
        worker.postMessage(current);
      };
      worker.on('message', (rs: LifeResult[]) => {
        rs.forEach((x, i) => { out[current!.from + i] = x; });
        done++;
        process.stderr.write(`\r  ${policy}: ${Math.min(n, done * LIVES_PER_JOB)}/${n} đời`);
        if (done === jobs.length) { process.stderr.write('\n'); resolveAll(out); }
        feed();
      });
      worker.on('error', reject);
      feed();
    }
  });
}
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
      years: { type: 'string', default: '100' },
      'all-l0': { type: 'boolean', default: false },
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
    case 'economy':
      return economyCmd(Number(a.seeds), Number(a.years), Number(a.threads));
    case 'world':
      return worldCmd(Number(a.seeds), Number(a.years), Number(a.threads), a['all-l0'] ?? false);
    default:
      console.log('Dùng: pnpm sim life|batch|regions|replay|economy|world …  (xem đầu tools/headless/src/cli.ts)');
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

  /** Tua; gặp sự kiện có lựa chọn thì chọn lựa chọn đầu tiên đang mở như người chơi máy mặc định (ADR 0014). */
  const advance = (mode: 'week' | 'year') => {
    const ms = call({ type: 'ADVANCE', mode });
    collect(ms);
    for (const m of ms) if (m.type === 'EVENT') collect(call({ type: 'CHOOSE', instance: m.pending.instance, choice: m.pending.choices.find((c) => c.locked === null)!.id }));
    return ms;
  };
  const startTick = life.tick;
  const t1 = performance.now();
  if (a['save-at']) {
    const at = Number(a['save-at']);
    while (life.alive && life.tick < at) advance('week');
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
    for (const m of advance('year')) if (m.type === 'DIED') summary = m.summary;
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
  await runPolicyBatch(regions, n, policy, out, parallelRunner(regions, threads));
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
  const edges = ok.flatMap((r) => r.logic!.terrainPct);
  const pct = (k: number) => `${Math.round((100 * edges.filter((e) => e === k).length) / Math.max(1, edges.length))}%`;
  console.log(`Cạnh đường (${edges.length}): đồng bằng ${pct(100)} · qua sông ${pct(150)} · núi ${pct(200)} · núi + sông ${pct(300)}`);
  const fert = ok.flatMap((r) => r.logic!.fertilityPct).sort((x, y) => x - y);
  const at = (q: number) => fert[Math.min(fert.length - 1, Math.floor(q * fert.length))];
  console.log(`Độ phì (${fert.length} quận): ${fert[0]}–${fert.at(-1)} · p10 ${at(0.1)} · trung vị ${at(0.5)} · p90 ${at(0.9)} · chạm sàn ${fert.filter((f) => f === fert[0]).length}`);
  console.log(`Đo: sinh một vùng (gồm cả thế giới 1024×768) trung bình ${(ok.reduce((s, r) => s + r.ms, 0) / ok.length / 1000).toFixed(2)} s · tổng ${(wall / 1000).toFixed(1)} s`);
  const pass = fails.length === 0 && mismatch === 0;
  console.log(pass ? 'KẾT QUẢ: PASS' : 'KẾT QUẢ: FAIL');
  if (!pass) process.exitCode = 1;
}

// —— economy ——
/** Nghiệm thu chợ quận (v0.3 mục 6): 100 năm × N seed không người chơi. */
async function economyCmd(n: number, years: number, threads: number) {
  const seeds = Array.from({ length: n }, (_, i) => `tsvl-${String(i + 1).padStart(2, '0')}`);
  console.log(`Chợ quận ${years} năm × ${n} vùng, không người chơi`);
  const regions = await regionPool(seeds.map((seed) => ({ seed })), threads);
  let famines = 0, countyYears = 0, famineMonths = 0, scarceMonths = 0, lowMoney = 0, minPrice = Infinity, maxPrice = 0, ledgerBad = 0, negative = 0;
  for (const r of regions) {
    if (!r.ok) throw new Error(`${r.seed}: ${r.error}`);
    const s = simulateEconomy(r.logic!, years, r.seed);
    famines += s.famines; countyYears += s.counties * years;
    famineMonths += s.famineMonthsPermille * s.counties; scarceMonths += s.scarceMonthsPermille * s.counties; lowMoney += s.lowMoneyMonthsPermille * s.counties;
    minPrice = Math.min(minPrice, s.minPricePct); maxPrice = Math.max(maxPrice, s.maxPricePct);
    if (s.moneyStart !== s.moneyEnd) ledgerBad++;
    if (s.minGrain < 0) negative++;
    console.log(`  ${r.seed}: ${s.counties} quận · đói kém ${s.famines} lần · tháng đói kém ${s.famineMonthsPermille / 10}% · khan hiếm ${s.scarceMonthsPermille / 10}% · quỹ cạn ${s.lowMoneyMonthsPermille / 10}% · giá ${s.minPricePct}–${s.maxPricePct}% · tiền ${s.moneyStart === s.moneyEnd ? 'bảo toàn' : `LỆCH ${s.moneyEnd - s.moneyStart}`}`);
  }
  const counties = countyYears / years;
  const every = famines ? countyYears / famines : Infinity;
  console.log(`Đói kém: ${famines} lần trên ${counties} quận × ${years} năm → mỗi quận 1 lần / ${every.toFixed(1)} năm (mục tiêu 8–15)`);
  console.log(`Tháng đói kém ${(famineMonths / counties / 10).toFixed(1)}% · khan hiếm ${(scarceMonths / counties / 10).toFixed(1)}% · giá ${minPrice}–${maxPrice}% (mục tiêu trong 70–500)`);
  const lowMoneyPct = lowMoney / counties / 10;
  console.log(`Tháng-quận quỹ tiền dưới 10% ban đầu: ${lowMoneyPct.toFixed(1)}% (mục tiêu ≤ 5)`);
  const pass = ledgerBad === 0 && negative === 0 && minPrice >= 70 && maxPrice <= 500 && every >= 8 && every <= 15 && lowMoneyPct <= 5;
  console.log(`Sổ cái lệch: ${ledgerBad} vùng · kho âm: ${negative} vùng`);
  console.log(pass ? 'KẾT QUẢ: PASS' : 'KẾT QUẢ: FAIL');
  if (!pass) process.exitCode = 1;
}

// —— world ——
/**
 * Thế giới tự chạy (v0.4 Q11): đúng pha Thế giới và pha NPC của đời người chơi, không có người chơi. Bước 0: khung và
 * số đo nền; tiêu chí dân số NPC (mục 6 v0.4) thêm ở S7 khi đã có NPC.
 */
/** Tiêu chí thế giới tự chạy (nghiệm thu v0.4 mục 6). */
const WORLD_QUOTA_PCT = [70, 130] as const;
const WORLD_DEATH_AGE = [50, 65] as const;
const WORLD_CAUSES = ['illness', 'old_age', 'accident', 'starvation'];
const WORLD_STARVATION_MAX_PCT = 10;
const WORLD_UNDER16_PCT = [25, 45] as const;
const WORLD_SPECIALIST_YEARS_PCT = 80;
/**
 * Gia đình (nghiệm thu v0.5 mục 6): trẻ có cha mẹ thật, người 25–50 có vợ/chồng, số con mỗi phụ nữ có chồng đã qua 45
 * (chủ dự án chốt ở S2: số sinh giữ theo hạn mức nên tính trên người có chồng).
 */
const WORLD_BIRTHS_WITH_PARENTS_PCT = 60;
const WORLD_MARRIED_PCT = [50, 85] as const;
const WORLD_CHILDREN_PER_WOMAN = [2, 5] as const;

/**
 * Bản đồ thế lực (nghiệm thu v0.6 mục 6, Q12; S8). Đo trên 50 năm đầu của lượt, trừ ba mục chủ dự án chọn đo trên cả lượt
 * (S8): "họ đứng đầu đổi", "gia tộc lập và tàn" (dòng họ đổi theo thế hệ, khoảng 30 năm), "có nguyên nhân" (50 năm chỉ có
 * 0,1–0,3 người theo cướp mỗi năm mỗi vùng, tỉ lệ dao động theo nhiễu):
 * - sống: mỗi vùng luôn có quan phủ; số thế lực mỗi loại trong khoảng mọi năm (sau năm đầu dòng họ, hội buôn mới thành);
 * - đổi: mỗi vùng có quận đổi người giữ, có gia tộc lập và tàn; họ đứng đầu đổi ở đủ phần quận;
 * - không hỗn loạn: mỗi quận đổi người giữ không quá 3 lần mỗi 10 năm; không thế lực ngoài quan phủ giữ quá nửa vùng quá 10 năm liền;
 * - có nguyên nhân: cướp sau đói kém gấp 1,5 lần năm thường; quan tham nhiều cướp hơn quan thanh liêm; thương hội giữ
 *   nhiều đường hơn ở nửa số vùng nhiều cạnh kề.
 * Trả danh sách tiêu chí trượt.
 */
const FACTION_RANGES = { clans: [2, 10], guilds: [1, 4], bands: [0, 4] } as const;
/**
 * Phần vùng-năm tối thiểu trong khoảng (%), theo loại. Thương hội (S8, chủ dự án chọn): ≥ 95% — hội tan thì quận ấy chờ một
 * năm mới lập lại, vùng chỉ có một trấn hụt vài năm. Gia tộc, băng cướp: mọi năm.
 */
const FACTION_IN_RANGE_PCT = { clans: 100, guilds: 95, bands: 100 } as const;
const FACTION_WARMUP_YEARS = 10;
const FACTION_LEADER_CHANGED_PCT = 30;
const FACTION_CHANGES_PER_DECADE = 3;
const FACTION_MAJORITY_YEARS = 10;
const FACTION_FAMINE_RATIO = 1.5;
type FactionMap = { seed: string; edges: number; counties: number; yearly: WorldRunStats['yearly']; at50: WorldRunStats['at50']; all: WorldRunStats['at50'] };
function factionMapReport(maps: readonly FactionMap[]): string[] {
  const failed: string[] = [];
  const window = (m: FactionMap) => m.yearly.slice(FACTION_WARMUP_YEARS - 1, 50);
  console.log(`Bản đồ thế lực (nghiệm thu v0.6 mục 6, 50 năm đầu; "sống" từ năm ${FACTION_WARMUP_YEARS}):`);
  for (const kind of ['clans', 'guilds', 'bands'] as const) {
    const [lo, hi] = FACTION_RANGES[kind];
    let inside = 0, all = 0, min = Number.MAX_SAFE_INTEGER, max = 0;
    const off: string[] = [];
    for (const m of maps) {
      const ys = window(m);
      const ok = ys.filter((y) => y[kind] >= lo && y[kind] <= hi).length;
      inside += ok; all += ys.length;
      for (const y of ys) { min = Math.min(min, y[kind]); max = Math.max(max, y[kind]); }
      if (ok < ys.length) off.push(`${m.seed.slice(-2)} ${(100 * ok / Math.max(1, ys.length)).toFixed(0)}%`);
    }
    const share = (100 * inside) / Math.max(1, all), need = FACTION_IN_RANGE_PCT[kind];
    console.log(`  sống · ${kind}: ${min}–${max} mỗi vùng (mục tiêu ${lo}–${hi}) · vùng-năm trong khoảng ${share.toFixed(1)}% (≥ ${need})${off.length ? ` · vùng lệch: ${off.join(', ')}` : ''}`);
    if (share < need) failed.push(`${kind} trong ${lo}–${hi} ở ${share.toFixed(1)}% vùng-năm < ${need}%`);
  }
  const noGov = maps.filter((m) => m.yearly.slice(0, 50).some((y) => y.gov === 0)).length;
  if (noGov) failed.push(`${noGov} vùng có năm không có quan phủ`);
  const unchanged = maps.filter((m) => m.at50.controlChanges === 0).length;
  const noTurn = maps.filter((m) => m.all.clansFounded === 0 || m.all.clansEnded === 0).length;
  const counties = maps.reduce((s, m) => s + m.counties, 0), leaders = maps.reduce((s, m) => s + m.all.leaderChangedCounties, 0);
  const leaderPct = (100 * leaders) / Math.max(1, counties);
  console.log(`  sống, đổi · vùng luôn có quan phủ ${maps.length - noGov}/${maps.length} · vùng có quận đổi người giữ ${maps.length - unchanged}/${maps.length} · vùng có gia tộc lập và tàn ${maps.length - noTurn}/${maps.length} (cả lượt) · quận đổi họ đứng đầu ${leaderPct.toFixed(0)}% (cả lượt; ≥ ${FACTION_LEADER_CHANGED_PCT})`);
  if (unchanged) failed.push(`${unchanged} vùng không có quận nào đổi người giữ`);
  if (noTurn) failed.push(`${noTurn} vùng thiếu gia tộc lập hay tàn`);
  if (leaderPct < FACTION_LEADER_CHANGED_PCT) failed.push(`họ đứng đầu đổi ở ${leaderPct.toFixed(0)}% quận < ${FACTION_LEADER_CHANGED_PCT}%`);
  const perDecade = Math.max(...maps.map((m) => m.at50.maxChangesPerDecade)), majority = Math.max(...maps.map((m) => m.at50.longestNonGovMajorityYears));
  console.log(`  không hỗn loạn · một quận đổi người giữ nhiều nhất ${perDecade} lần/10 năm (≤ ${FACTION_CHANGES_PER_DECADE}) · ngoài quan phủ giữ quá nửa vùng dài nhất ${majority} năm (≤ ${FACTION_MAJORITY_YEARS})`);
  if (perDecade > FACTION_CHANGES_PER_DECADE) failed.push(`quận đổi người giữ ${perDecade} lần/10 năm`);
  if (majority > FACTION_MAJORITY_YEARS) failed.push(`thế lực ngoài quan phủ giữ quá nửa vùng ${majority} năm liền`);
  const sum = (k: keyof WorldRunStats['at50']) => maps.reduce((s, m) => s + m.all[k], 0);
  const after = sum('banditMembersAfterFamine') / Math.max(1, sum('yearsAfterFamine')), normal = sum('banditMembersNormal') / Math.max(1, sum('yearsNormal'));
  const greedy = sum('banditMembersGreedy') / Math.max(1, sum('yearsGreedy')), honest = sum('banditMembersHonest') / Math.max(1, sum('yearsHonest'));
  const sorted = [...maps].sort((a, b) => a.edges - b.edges || (a.seed < b.seed ? -1 : 1));
  const half = Math.floor(sorted.length / 2);
  const roads = (ms: readonly FactionMap[]) => ms.reduce((s, m) => { const ys = m.yearly; return s + ys.reduce((a, y) => a + y.guildRoads, 0) / Math.max(1, ys.length); }, 0) / Math.max(1, ms.length);
  const few = roads(sorted.slice(0, half)), many = roads(sorted.slice(sorted.length - half));
  console.log(`  có nguyên nhân (cả lượt) · người theo cướp sau đói kém ${after.toFixed(2)}/năm, năm thường ${normal.toFixed(2)} (gấp ${(after / Math.max(0.01, normal)).toFixed(1)}; ≥ ${FACTION_FAMINE_RATIO}) · quan tham ${greedy.toFixed(2)}, thanh liêm ${honest.toFixed(2)} · thương hội giữ đường: vùng nhiều cạnh kề ${many.toFixed(1)}, ít cạnh kề ${few.toFixed(1)}/năm`);
  if (after < FACTION_FAMINE_RATIO * normal) failed.push(`cướp sau đói kém chỉ gấp ${(after / Math.max(0.01, normal)).toFixed(1)} lần năm thường`);
  if (!(greedy > honest)) failed.push('quan tham không đi cùng nhiều cướp hơn quan thanh liêm');
  if (!(many > few)) failed.push('thương hội không lớn hơn ở vùng nhiều cạnh kề');
  return failed;
}

async function worldCmd(n: number, years: number, threads: number, allL0: boolean) {
  if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(years) || years <= 0) throw new Error('seeds/years phải là số nguyên dương');
  const seeds = Array.from({ length: n }, (_, i) => `tsvl-${String(i + 1).padStart(2, '0')}`);
  console.log(`Thế giới tự chạy ${years} năm × ${n} vùng, không người chơi${allL0 ? ' · mọi NPC ở tầng L0 (tuần)' : ''}`);
  const regions = await regionPool(seeds.map((seed) => ({ seed })), threads);
  let ledgerBad = 0, ticks = 0, ms = 0, deathAges = 0, starvedNormal = 0, minQ = Number.MAX_SAFE_INTEGER, maxQ = 0, kids = 0, physYears = 0, merchYears = 0, births = 0, withParents = 0, married = 0, mothers = 0, motherKids = 0, wives = 0, wifeKids = 0;
  let famines = 0, countyYears = 0, lowMoney = 0, minPrice = Number.MAX_SAFE_INTEGER, maxPrice = 0, negative = 0;
  let goodsStuck = 0, hideSell = 0, npcGoods = 0, sectRecruits = 0, npcStartSum = 0;
  // Phần tiền NPC nắm (‰): năm cuối thấp/cao nhất giữa các vùng, và cao nhất mọi năm (v0.5 S8: chi dùng chặn tiền dồn)
  let npcEndMin = Number.MAX_SAFE_INTEGER, npcEndMax = 0, npcPeak = 0;
  // Kho thế lực (v0.6 S1): tiền (văn), lương (thăng) năm cuối thấp/cao nhất giữa các vùng; tiền so với tổng tiền vùng (‱)
  // Gia tộc (v0.6 S2): theo từng vùng, rồi gộp
  const clanRows: string[] = [], guildRows: string[] = [];
  let guildMin = Number.MAX_SAFE_INTEGER, guildMax = 0, guildFounded = 0, guildEnded = 0;
  // Băng cướp (v0.6 S4)
  let banditFounded = 0, banditEnded = 0, banditPeak = 0, bAfter = 0, yAfter = 0, bNormal = 0, yNormal = 0;
  const banditRows: string[] = [], govRows: string[] = [];
  // Quan phủ (v0.6 S5)
  let bGreedy = 0, yGreedy = 0, bHonest = 0, yHonest = 0, campaigns = 0, wins = 0, maxPerDecade = 0, longestMajority = 0, changesAll = 0;
  let clanMin = Number.MAX_SAFE_INTEGER, clanMax = 0, clanFounded = 0, clanEnded = 0, clanSplit = 0, leaderChanged = 0, countiesAll = 0, regionsFoundEnd = 0;
  let facEndMin = Number.MAX_SAFE_INTEGER, facEndMax = 0, facPeak = 0, facGrainMin = Number.MAX_SAFE_INTEGER, facGrainMax = 0, facShareMax = 0;
  const deaths: Record<string, number> = {};
  // Bản đồ thế lực (v0.6 S8): chuỗi theo năm, số lần đổi người giữ của từng vùng
  const maps: FactionMap[] = [];
  for (const r of regions) {
    if (!r.ok) throw new Error(`${r.seed}: ${r.error}`);
    const t0 = performance.now();
    const s = simulateWorld(r.logic!, years, r.seed, { regionId: r.regionId, allL0 });
    const took = performance.now() - t0;
    ticks += s.ticks; ms += took;
    if (s.moneyStart !== s.moneyEnd || s.ledgerBreaks > 0) ledgerBad++;
    famines += s.famines; countyYears += s.counties * years; lowMoney += s.lowMoneyMonthsPermille * s.counties;
    minPrice = Math.min(minPrice, s.minPricePct); maxPrice = Math.max(maxPrice, s.maxPricePct); if (s.minGrain < 0) negative++;
    goodsStuck += s.goodsStuckPermille * s.counties; hideSell += s.hideVillageSellX100; npcGoods += s.npcGoodsEnd; sectRecruits += s.sectRecruits; npcStartSum += s.npcStart;
    for (const [k, v] of Object.entries(s.deaths)) deaths[k] = (deaths[k] ?? 0) + v;
    deathAges += s.deathAgeSum; starvedNormal += s.starvationNormalYears;
    minQ = Math.min(minQ, s.minQuotaPct); maxQ = Math.max(maxQ, s.maxQuotaPct); kids += s.childrenPermille; physYears += s.yearsWithPhysician; merchYears += s.yearsWithMerchant;
    clanMin = Math.min(clanMin, s.clansMin); clanMax = Math.max(clanMax, s.clansMax); clanFounded += s.clansFounded; clanEnded += s.clansEnded; clanSplit += s.clansSplit;
    leaderChanged += s.leaderChangedCounties; countiesAll += s.counties; if (s.clansFounded > 0 && s.clansEnded > 0) regionsFoundEnd++;
    guildMin = Math.min(guildMin, s.guildsMin); guildMax = Math.max(guildMax, s.guildsMax); guildFounded += s.guildsFounded; guildEnded += s.guildsEnded;
    banditFounded += s.banditsFounded; banditEnded += s.banditsEnded; banditPeak = Math.max(banditPeak, s.banditMembersMax);
    bAfter += s.banditMembersAfterFamine; yAfter += s.yearsAfterFamine; bNormal += s.banditMembersNormal; yNormal += s.yearsNormal;
    bGreedy += s.banditMembersGreedy; yGreedy += s.yearsGreedy; bHonest += s.banditMembersHonest; yHonest += s.yearsHonest; campaigns += s.campaigns; wins += s.campaignWins;
    maxPerDecade = Math.max(maxPerDecade, s.maxChangesPerDecade); longestMajority = Math.max(longestMajority, s.longestNonGovMajorityYears); changesAll += s.controlChanges;
    govRows.push(`${r.seed.slice(-2)}: kho ${s.govMoneyEnd} văn, ${s.officialsEnd} sai dịch · tiễu ${s.campaigns} trận thắng ${s.campaignWins} · chẩn ${s.reliefGrain} thăng · đổi người giữ ${s.controlChanges} lần (nhiều nhất ${s.maxChangesPerDecade}/10 năm) · ngoài quan phủ giữ ${s.nonGovCountyYearsPermille / 10}% quận-năm`);
    banditRows.push(`${r.seed.slice(-2)}: lập ${s.banditsFounded}, tan ${s.banditsEnded}, đông nhất ${s.banditMembersMax} người · sau đói kém ${(s.banditMembersAfterFamine / Math.max(1, s.yearsAfterFamine)).toFixed(1)} người/năm (${s.yearsAfterFamine} năm), năm thường ${(s.banditMembersNormal / Math.max(1, s.yearsNormal)).toFixed(1)} (${s.yearsNormal} năm)`);
    guildRows.push(`${r.seed.slice(-2)}: ${s.edges} cạnh kề · ${s.guildsMin}–${s.guildsMax} (cuối ${s.guildsEnd}), lập ${s.guildsFounded}, tan ${s.guildsEnded} · năm cuối giữ ${s.guildRoadsEnd} đường, ${s.guildMembersEnd} hội viên, kho ${s.guildMoneyEnd} văn`);
    clanRows.push(`${r.seed.slice(-2)}: ${s.clansMin}–${s.clansMax} (cuối ${s.clansEnd}), lập ${s.clansFounded}, tàn ${s.clansEnded}, tách ${s.clansSplit}, đổi họ đầu ${s.leaderChangedCounties}/${s.counties} quận`);
    facEndMin = Math.min(facEndMin, s.factionMoneyEnd); facEndMax = Math.max(facEndMax, s.factionMoneyEnd); facPeak = Math.max(facPeak, s.factionMoneyMax);
    facGrainMin = Math.min(facGrainMin, s.factionGrainEnd); facGrainMax = Math.max(facGrainMax, s.factionGrainEnd);
    facShareMax = Math.max(facShareMax, Math.floor((10_000 * s.factionMoneyMax) / Math.max(1, s.moneyEnd)));
    npcEndMin = Math.min(npcEndMin, s.npcMoneyPermilleEnd); npcEndMax = Math.max(npcEndMax, s.npcMoneyPermilleEnd); npcPeak = Math.max(npcPeak, s.npcMoneyPermilleMax);
    maps.push({ seed: r.seed, edges: s.edges, counties: s.counties, yearly: s.yearly, at50: s.at50, all: s });
    births += s.births; withParents += s.birthsWithParents; married += s.marriedPermille; mothers += s.mothersOver45; motherKids += s.childrenOfMothersOver45; wives += s.wivesOver45; wifeKids += s.childrenOfWivesOver45;
    console.log(`  ${r.seed}: ${s.counties} quận · NPC ${s.npcStart} → ${s.npcEnd} · dân số ${s.minQuotaPct}–${s.maxQuotaPct}% hạn mức · ${(took * 1000 / s.ticks).toFixed(1)} µs/tick · tiền ${s.moneyStart === s.moneyEnd ? 'bảo toàn' : `LỆCH ${s.moneyEnd - s.moneyStart}`}`);
  }
  const died = Object.values(deaths).reduce((x, y) => x + y, 0);
  console.log(`NPC mất: ${died} · tuổi trung bình lúc mất ${(deathAges / Math.max(1, died)).toFixed(1)} · nguyên nhân ${JSON.stringify(deaths)} · chết đói ${(100 * (deaths.starvation ?? 0) / Math.max(1, died)).toFixed(1)}% (năm thường ${(100 * starvedNormal / Math.max(1, died)).toFixed(1)}%)`);
  console.log(`Dân số: mỗi quận ${minQ}–${maxQ}% hạn mức (mục tiêu 70–130) · dưới 16 tuổi ${(kids / regions.length / 10).toFixed(1)}% (mục tiêu 25–45) · năm có thầy thuốc ${(100 * physYears / (regions.length * (years - 1))).toFixed(0)}% · có thương nhân ${(100 * merchYears / (regions.length * (years - 1))).toFixed(0)}%`);
  console.log(`Đo: ${ticks} tick · trung bình ${(ms * 1000 / ticks).toFixed(1)} µs/tick (pha Thế giới + pha NPC)`);
  const every = famines ? countyYears / famines : Infinity;
  const lowMoneyPct = lowMoney / (countyYears / years) / 10;
  console.log(`Kinh tế có NPC: đói kém mỗi quận 1 lần / ${every.toFixed(1)} năm (mục tiêu 8–15) · giá ${minPrice}–${maxPrice}% (70–500) · tháng-quận quỹ cạn ${lowMoneyPct.toFixed(1)}% (≤ 5) · kho âm ${negative} vùng`);
  const goodsStuckPct = goodsStuck / Math.max(1, countiesAll) / 10;
  console.log(`Tông môn (v0.8 S3): trẻ NPC được tuyển rời vùng ${sectRecruits} người trong ${regions.length} vùng (trung bình ${(sectRecruits / regions.length).toFixed(1)} mỗi vùng, ${(sectRecruits * 1000 / Math.max(1, npcStartSum)).toFixed(1)}‰ số NPC lúc đầu)`);
  console.log(`Chợ hàng (S3b): tháng-quận-món giá sát trần/đáy ${goodsStuckPct.toFixed(1)}% (≤ 20) · giá bán da ở chợ làng trung bình ${(hideSell / regions.length / 100).toFixed(1)} văn/phần (trước S3b trả ngay 20) · hàng NPC còn giữ cuối ${npcGoods} phân`);
  console.log(`Sổ cái lệch (kiểm từng tick): ${ledgerBad} vùng · NPC nắm ${npcEndMin / 10}–${npcEndMax / 10}% tổng tiền năm cuối (cao nhất mọi năm ${npcPeak / 10}%)`);
  console.log(`Gia tộc: còn sống ${clanMin}–${clanMax} mỗi vùng (mục tiêu 2–10) · lập sau năm đầu ${clanFounded}, tàn ${clanEnded} (gồm nhập), chi tách ${clanSplit} · vùng có cả lập lẫn tàn ${regionsFoundEnd}/${regions.length} · quận đổi họ đứng đầu ${(100 * leaderChanged / Math.max(1, countiesAll)).toFixed(0)}% (≥ 30)`);
  for (const row of clanRows) console.log(`  ${row}`);
  console.log(`Thương hội: còn sống ${guildMin}–${guildMax} mỗi vùng (mục tiêu 1–4) · lập ${guildFounded}, tan ${guildEnded}`);
  for (const row of guildRows) console.log(`  ${row}`);
  const perAfter = bAfter / Math.max(1, yAfter), perNormal = bNormal / Math.max(1, yNormal);
  console.log(`Băng cướp: lập ${banditFounded}, tan ${banditEnded}, đông nhất ${banditPeak} người một vùng · người theo cướp sau đói kém ${perAfter.toFixed(1)}/năm, năm thường ${perNormal.toFixed(1)}/năm (gấp ${(perAfter / Math.max(0.01, perNormal)).toFixed(1)} lần; mục tiêu ≥ 1,5)`);
  for (const row of banditRows) console.log(`  ${row}`);
  const perGreedy = bGreedy / Math.max(1, yGreedy), perHonest = bHonest / Math.max(1, yHonest);
  console.log(`Quan phủ: người theo cướp dưới quan tham ${perGreedy.toFixed(1)}/năm (${yGreedy} năm), quan thanh liêm ${perHonest.toFixed(1)}/năm (${yHonest} năm) · tiễu phỉ ${campaigns} trận, thắng ${wins} · quận đổi người giữ ${changesAll} lần, nhiều nhất ${maxPerDecade}/10 năm (≤ 3) · ngoài quan phủ giữ quá nửa vùng dài nhất ${longestMajority} năm (≤ 10)`);
  for (const row of govRows) console.log(`  ${row}`);
  console.log(`Kho thế lực năm cuối: ${facEndMin}–${facEndMax} văn, ${facGrainMin}–${facGrainMax} thăng lương · cao nhất mọi năm ${facPeak} văn (${facShareMax / 100}% tổng tiền vùng)`);
  // Tiêu chí nghiệm thu v0.4 mục 6 (docs/v0.4-giai-doan-a.md): dân số NPC, sổ cái, kinh tế v0.3
  const meanDeathAge = deathAges / Math.max(1, died), under16Pct = kids / regions.length / 10;
  const yearsPct = (k: number) => (100 * k) / (regions.length * (years - 1));
  const failed: string[] = [];
  if (goodsStuckPct > 20) failed.push(`giá hàng sát trần/đáy ${goodsStuckPct.toFixed(1)}% tháng-quận-món > 20%`);
  if (minQ < WORLD_QUOTA_PCT[0] || maxQ > WORLD_QUOTA_PCT[1]) failed.push(`dân số mỗi quận ${minQ}–${maxQ}% ngoài ${WORLD_QUOTA_PCT.join('–')}%`);
  if (meanDeathAge < WORLD_DEATH_AGE[0] || meanDeathAge > WORLD_DEATH_AGE[1]) failed.push(`tuổi trung bình lúc mất ${meanDeathAge.toFixed(1)} ngoài ${WORLD_DEATH_AGE.join('–')}`);
  const noCause = WORLD_CAUSES.filter((k) => !deaths[k]);
  if (noCause.length) failed.push(`thiếu nguyên nhân chết: ${noCause.join(', ')}`);
  if (100 * (deaths.starvation ?? 0) > WORLD_STARVATION_MAX_PCT * died) failed.push(`chết đói ${(100 * (deaths.starvation ?? 0) / Math.max(1, died)).toFixed(1)}% > ${WORLD_STARVATION_MAX_PCT}%`);
  if (under16Pct < WORLD_UNDER16_PCT[0] || under16Pct > WORLD_UNDER16_PCT[1]) failed.push(`dưới 16 tuổi ${under16Pct.toFixed(1)}% ngoài ${WORLD_UNDER16_PCT.join('–')}%`);
  if (yearsPct(physYears) < WORLD_SPECIALIST_YEARS_PCT) failed.push(`năm có thầy thuốc ${yearsPct(physYears).toFixed(0)}% < ${WORLD_SPECIALIST_YEARS_PCT}%`);
  if (yearsPct(merchYears) < WORLD_SPECIALIST_YEARS_PCT) failed.push(`năm có thương nhân ${yearsPct(merchYears).toFixed(0)}% < ${WORLD_SPECIALIST_YEARS_PCT}%`);
  const parentsPct = (100 * withParents) / Math.max(1, births), marriedPct = married / regions.length / 10, perWoman = wifeKids / Math.max(1, wives);
  console.log(`Gia đình: trẻ sinh có cha mẹ thật ${parentsPct.toFixed(1)}% (mục tiêu ≥ ${WORLD_BIRTHS_WITH_PARENTS_PCT}) · người 25–50 có vợ/chồng ${marriedPct.toFixed(1)}% (${WORLD_MARRIED_PCT.join('–')}) · phụ nữ có chồng đã qua 45: ${perWoman.toFixed(2)} con (${WORLD_CHILDREN_PER_WOMAN.join('–')}, ${wives} người; tính cả người không chồng ${(motherKids / Math.max(1, mothers)).toFixed(2)})`);
  if (parentsPct < WORLD_BIRTHS_WITH_PARENTS_PCT) failed.push(`trẻ có cha mẹ thật ${parentsPct.toFixed(1)}% < ${WORLD_BIRTHS_WITH_PARENTS_PCT}%`);
  if (marriedPct < WORLD_MARRIED_PCT[0] || marriedPct > WORLD_MARRIED_PCT[1]) failed.push(`có vợ/chồng ${marriedPct.toFixed(1)}% ngoài ${WORLD_MARRIED_PCT.join('–')}%`);
  if (perWoman < WORLD_CHILDREN_PER_WOMAN[0] || perWoman > WORLD_CHILDREN_PER_WOMAN[1]) failed.push(`số con mỗi phụ nữ có chồng ${perWoman.toFixed(2)} ngoài ${WORLD_CHILDREN_PER_WOMAN.join('–')}`);
  if (ledgerBad) failed.push(`sổ cái lệch ở ${ledgerBad} vùng`);
  if (negative || minPrice < 70 || maxPrice > 500 || every < 8 || every > 15 || lowMoneyPct > 5) failed.push('kinh tế ngoài tiêu chí v0.3');
  // Bản đồ thế lực (v0.6 S8): cần lượt từ 50 năm
  if (years >= 50) failed.push(...factionMapReport(maps));
  for (const f of failed) console.log(`  ✗ ${f}`);
  const pass = failed.length === 0;
  console.log(pass ? `KẾT QUẢ: PASS (dân số NPC, gia đình, sổ cái, kinh tế v0.3${years >= 50 ? ', bản đồ thế lực v0.6' : ''})` : 'KẾT QUẢ: FAIL');
  if (!pass) process.exitCode = 1;
}

// Khởi động ở cuối file: mọi hằng phía trên đã được khởi tạo
if (!isMainThread) {
  parentPort!.on('message', (job: RegionJob | LivesJob) => parentPort!.postMessage(job.kind === 'lives' ? livesJob(job) : regionJob(job)));
} else {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
