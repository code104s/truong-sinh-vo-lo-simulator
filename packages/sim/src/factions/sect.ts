// Tông môn tối giản (v0.8 S3, ADR 0022 Q5): một tông môn ngoài vùng, chỉ có kỳ tuyển và đệ tử ký danh. Sơn môn không vẽ,
// không mô phỏng bên trong; sứ giả xuống trị sở mỗi ba năm, tháng Ba, kiểm linh căn trẻ 8–20 tuổi (người chơi và NPC cùng
// luật). Trẻ NPC đỗ thì rời vùng lên núi; của trong túi để lại cho cha mẹ. Không rút RNG.
import { ageYearsAt, calendarOf, type LogEntry, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import { hash32 } from '../core/hash';
import type { EconomyState } from '../economy/market';
import type { CharacterState } from '../life/character';
import { rootBand, testRoot, type CultivationState } from '../life/cultivation';
import { feedersOf, kinRole, lookup } from '../npc/family';
import type { NpcState, NpcWorldState } from '../npc/state';
import { governmentSeat } from './government';
import type { FactionState, FactionWorldState } from './state';

type Log = (e: Omit<LogEntry, 'tick'>) => void;

/** Kỳ tuyển: năm chia hết cho 3, tháng Ba; tin đồn báo trước từ tháng Giêng. */
export const SECT_TRIAL_EVERY_YEARS = 3;
export const SECT_TRIAL_MONTH = 3;
export const SECT_RUMOR_MONTH = 1;
/** Tuổi dự tuyển (Q5). Người chơi tự xếp việc từ 12 tuổi nên dự từ 12; trẻ NPC từ 8. */
export const SECT_AGE = [8, 20] as const;
/** Đỗ từ linh căn khá; kỳ nào ít hơn chừng này người khá, tốt thì nhận cả linh căn tạp (Q5). */
export const SECT_MIN_RECRUITS = 2;
/** Tên tông môn theo vùng (băm), khóa nội dung `sect.name.<k>`. */
export const SECT_NAMES = 6;

/** Tông môn của vùng (một, ngoài vùng); null nếu vùng không có. */
export const sectOf = (fw: FactionWorldState): FactionState | null => fw.list.find((f) => f.kind === 'sect' && f.ended === null) ?? null;

/** Lập tông môn lúc dựng vùng: trị sở là nơi sứ giả xuống tuyển (thành, không thì trấn); không giữ đất, không có kho. */
export function foundSect(fw: FactionWorldState, logic: RegionLogic, tick: Tick): FactionState {
  const name = hash32('sect', logic.counties[0]?.worldIndex ?? 0) % SECT_NAMES;
  const f: FactionState = {
    id: `f${fw.nextId++}`, kind: 'sect', name: { key: 'faction.sect.name', params: { name: `sect.name.${name}` } },
    seat: governmentSeat(logic), counties: [], holds: [], roads: [], members: [], leader: null, power: 1, losses: 0, greed: 0, termEnds: tick,
    relations: [], money: 0, grain: 0, founded: tick, ended: null,
  };
  fw.list.push(f);
  return f;
}

export const isTrialYear = (tick: Tick) => calendarOf(tick).year % SECT_TRIAL_EVERY_YEARS === 0;
/** Đang có kỳ tuyển (cả tháng Ba của năm tuyển). */
export const trialOpen = (tick: Tick) => isTrialYear(tick) && calendarOf(tick).month === SECT_TRIAL_MONTH;

/** Dải được nhận ở kỳ này. */
export function trialAccepts(f: FactionState, band: ReturnType<typeof rootBand>): boolean {
  return band === 'good' || band === 'fair' || (band === 'mixed' && !!f.trial?.takesMixed);
}

/** Trẻ NPC rời vùng lên núi: của trong túi về cha mẹ (không còn ai thì về quỹ quận), ra khỏi danh sách người. */
function depart(n: NpcState, npcs: NpcWorldState, eco: EconomyState, fw: FactionWorldState): void {
  const h = n.character.household;
  const parent = feedersOf(n, lookup(npcs))[0];
  const to = parent ? parent.character.household : null;
  if (to) { to.money += h.money; to.grain += h.grain; h.goods.forEach((q, g) => { to.goods[g]! += q; }); }
  else { const ce = eco.counties[n.character.location]!; ce.money += h.money; ce.grain += h.grain; h.goods.forEach((q, g) => { ce.goods[g]!.stock += q; }); }
  h.money = 0; h.grain = 0; h.goods = h.goods.map(() => 0);
  npcs.people = npcs.people.filter((x) => x.id !== n.id);
  for (const f of fw.list) if (f.members.includes(n.id)) f.members = f.members.filter((id) => id !== n.id);
}

/**
 * Đầu mỗi tháng (sau pha Thế lực): tháng Giêng năm tuyển báo tin cho người chơi; đầu tháng Ba sứ giả kiểm trẻ NPC 8–20
 * tuổi chưa ra riêng — người đỗ rời vùng. Ghi kỳ tuyển vào tông môn để người chơi dự trong tháng. Trả số trẻ NPC đỗ.
 */
export function sectPhase(fw: FactionWorldState, npcs: NpcWorldState, eco: EconomyState, logic: RegionLogic, tick: Tick, player: { c: CharacterState; log: Log } | null): number {
  const f = sectOf(fw);
  if (!f || tick % 3 !== 0 || !isTrialYear(tick)) return 0;
  const month = calendarOf(tick).month;
  const place = logic.counties[f.seat]?.name ?? 'place.unknown';
  if (month === SECT_RUMOR_MONTH && player) player.log({ key: 'log.sect.rumor', params: { sect: f.name.params.name!, place }, importance: 'major' });
  if (month !== SECT_TRIAL_MONTH) return 0;
  const kids = npcs.people.filter((n) => n.death === null && !n.character.household.independent && ageYearsAt(n.character.birthTick, tick) >= SECT_AGE[0] && ageYearsAt(n.character.birthTick, tick) <= SECT_AGE[1]);
  const bands = kids.map((n) => ({ n, band: rootBand(n.character.spiritRoot) }));
  const strong = bands.filter((x) => x.band === 'fair' || x.band === 'good').length;
  f.trial = { tick, takesMixed: strong < SECT_MIN_RECRUITS, taken: 0 };
  for (const { n, band } of bands) {
    if (!trialAccepts(f, band)) continue;
    // Con cháu, anh em người chơi được chọn: tin lớn của nhà mình
    if (player && kinRole(player.c, n)) player.log({ key: 'log.sect.kin_taken', params: { name: n.character.name, sect: f.name.params.name! }, importance: 'major' });
    depart(n, npcs, eco, fw);
    f.trial.taken++;
  }
  if (player && f.trial.taken > 0) player.log({ key: 'log.sect.took', params: { count: f.trial.taken, place, sect: f.name.params.name! }, importance: 'minor' });
  return f.trial.taken;
}

// —— Người chơi: dự kỳ tuyển, đệ tử ký danh (Q5) ——

/** Đỗ thì được dẫn khí nhập môn, công pháp nhập môn, ba khối linh thạch; mỗi năm còn tên trong sổ thì cấp thêm hai. */
export const SECT_STONES_JOIN = 3;
export const SECT_STONES_YEAR = 2;
/** Nghĩa vụ mỗi năm: sáu tuần tạp dịch; thiếu thì nộp 600 văn thay; không nộp nổi hai năm thì bị gạch tên. */
export const SECT_DUTY_WEEKS = 6;
export const SECT_DUTY_FEE = 600;
export const SECT_EXPEL_MISSED = 2;

/** Khóa của việc dự kỳ tuyển: có kỳ tuyển, ở trị sở, đúng tuổi, chưa có đường tu. */
export function trialLock(c: CharacterState, cult: CultivationState, fw: FactionWorldState, tick: Tick): string | null {
  const f = sectOf(fw);
  if (!f || !trialOpen(tick) || !f.trial || c.location !== f.seat) return 'lock.no_trial';
  if (ageYearsAt(c.birthTick, tick) > SECT_AGE[1]) return 'lock.trial_age';
  return cult.path ? 'lock.member' : null;
}

/** Một tuần dự tuyển: sứ giả kiểm linh căn (ghi dải); đỗ thì thành đệ tử ký danh, trượt thì mang ám ảnh. Trả có đỗ không. */
export function attendTrial(c: CharacterState, cult: CultivationState, fw: FactionWorldState, tick: Tick, flags: string[], log: Log): boolean {
  const f = sectOf(fw);
  if (!f || trialLock(c, cult, fw, tick)) return false;
  const band = testRoot(cult, c.spiritRoot);
  const sect = f.name.params.name!;
  if (!trialAccepts(f, band)) {
    if (!flags.includes('haunted')) flags.push('haunted');
    log({ key: band === 'none' ? 'log.sect.rejected_none' : 'log.sect.rejected', params: { sect, root: `root.${band}` }, importance: 'major' });
    return false;
  }
  cult.path = 'sect';
  cult.stones += SECT_STONES_JOIN;
  cult.duty = { weeks: 0, missed: 0, since: tick };
  f.trial!.taken++;
  log({ key: 'log.sect.joined', params: { sect, root: `root.${band}`, stones: SECT_STONES_JOIN }, importance: 'major' });
  return true;
}

/** Tạp dịch cho tông môn: chỉ đệ tử còn tên trong sổ. */
export const dutyLock = (cult: CultivationState): string | null => (cult.duty ? null : 'lock.not_disciple');

/**
 * Đầu năm (Q5): năm vừa qua đủ tuần tạp dịch thì thôi; thiếu thì nộp tiền thay vào kho tông môn; không nộp nổi thì ghi một
 * năm bỏ nghĩa vụ — hai năm thì bị gạch tên (mất cấp phát; công pháp đã học vẫn nhớ, đường tu giữ). Còn tên thì nhận linh
 * thạch. Năm mới vào (chưa đủ một năm) không xét.
 */
export function dutyYear(c: CharacterState, cult: CultivationState, fw: FactionWorldState, tick: Tick, log: Log): void {
  const d = cult.duty, f = sectOf(fw);
  if (!d || !f || tick - d.since < 36) return;
  const sect = f.name.params.name!;
  if (d.weeks < SECT_DUTY_WEEKS) {
    if (c.household.money >= SECT_DUTY_FEE) {
      c.household.money -= SECT_DUTY_FEE; f.money += SECT_DUTY_FEE;
      log({ key: 'log.sect.duty_paid', params: { sect, coin: SECT_DUTY_FEE }, importance: 'minor' });
      d.missed = 0;
    } else if (++d.missed >= SECT_EXPEL_MISSED) {
      cult.duty = null;
      log({ key: 'log.sect.expelled', params: { sect }, importance: 'major' });
      return;
    } else log({ key: 'log.sect.duty_missed', params: { sect }, importance: 'major' });
  } else d.missed = 0;
  d.weeks = 0;
  cult.stones += SECT_STONES_YEAR;
  log({ key: 'log.sect.stipend', params: { sect, stones: SECT_STONES_YEAR }, importance: 'minor' });
}
