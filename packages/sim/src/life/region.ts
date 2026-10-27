import { arr, intRange, nat, obj, oneOf, opt, str, SETTLEMENT_KINDS, type SaveFile, type Validator } from '@tsvl/shared';
import { FERTILITY_MAX, FERTILITY_MIN, type RegionLogic } from '@tsvl/worldgen';
import { canonical } from '../core/digest';
import { validatePlan } from './actions';
import { STREAMS, type LifeSnapshot } from './life';
import { previewTravel } from './travel';

const edge: Validator<[number, number]> = { check: (u, p) => Array.isArray(u) && u.length === 2 ? arr(nat).check(u, p) : `${p}: cần cặp quận` };
const validator = obj<RegionLogic>({
  kmPerCellMilli: intRange(1, 1_000_000),
  counties: arr(obj<RegionLogic['counties'][number]>({ worldIndex: nat, area: nat, seat: obj({ x: nat, y: nat }), name: opt(str) })),
  settlementKind: arr(oneOf(SETTLEMENT_KINDS)), adjacency: arr(edge), terrainPct: arr(oneOf([100, 150, 200, 300] as const)) as Validator<number[]>, seatKm: arr(arr(nat)),
  fertilityPct: arr(intRange(FERTILITY_MIN, FERTILITY_MAX)),
});

export function checkSavedLogic(logic: RegionLogic, save: SaveFile, snap: LifeSnapshot): string | null {
  const invalid = validator.check(logic, '$save.region.logic'); if (invalid) return invalid;
  const n = logic.counties.length;
  if (n === 0 || n !== save.region.map.counties.length || logic.settlementKind.length !== n || logic.seatKm.length !== n || logic.fertilityPct.length !== n || logic.terrainPct.length !== logic.adjacency.length) return 'kích thước lớp logic vùng không khớp';
  for (let i = 0; i < n; i++) {
    if (logic.seatKm[i]!.length !== n || logic.seatKm[i]![i] !== 0) return 'ma trận khoảng cách không hợp lệ';
    for (let j = 0; j < n; j++) if (logic.seatKm[i]![j] !== logic.seatKm[j]?.[i]) return 'khoảng cách không đối xứng';
  }
  let last = -1;
  for (const [a, b] of logic.adjacency) {
    const key = a * 65536 + b;
    if (a >= b || b >= n || key <= last) return 'cạnh đường không hợp lệ hoặc trùng';
    last = key;
  }
  const c = snap.character;
  const bp = save.region.birthplaces.find((p) => p.id === snap.config.birthplaceId);
  if (!bp || bp.county !== c.home || c.location >= n || c.home >= n || snap.tick <= c.birthTick || c.alive !== (snap.death === null)) return 'trạng thái nhân vật không khớp vùng';
  if (STREAMS.some((name) => !snap.rng.streams[name])) return 'thiếu luồng RNG';
  if (snap.plan && !validatePlan(snap.plan, logic)) return 'kế hoạch lưu không hợp lệ';
  if (snap.active) {
    const a = snap.active;
    if (a.remaining > a.total) return 'tiến độ hành động không hợp lệ';
    if (a.slot.action === 'action.travel') {
      const actual = previewTravel(logic, c.location, a.slot.target ?? -1);
      if (!actual || canonical(actual) !== canonical(a.preview) || actual.slots !== a.total) return 'chuyến đi lưu không khớp đường';
    } else return 'hành động một ô không được lưu dở';
  }
  if (!save.commandLog.length || save.commandLog[0]!.cmd.type !== 'NEW_LIFE') return 'thiếu lệnh bắt đầu đời';
  let tick = c.birthTick;
  for (let i = 0; i < save.commandLog.length; i++) {
    const r = save.commandLog[i]!;
    if (r.seq !== i || r.tick < tick || r.tick > snap.tick || (i > 0 && r.cmd.type === 'NEW_LIFE')) return 'thứ tự nhật ký lệnh không hợp lệ';
    if (r.cmd.type === 'SET_PLAN' && !validatePlan(r.cmd.plan, logic)) return 'nhật ký chứa kế hoạch không hợp lệ';
    tick = r.tick;
  }
  const first = save.commandLog[0]!.cmd;
  if (first.type !== 'NEW_LIFE' || canonical(first.config) !== canonical(snap.config)) return 'cấu hình đời trong nhật ký không khớp';
  return null;
}
