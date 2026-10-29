// Lính — sai dịch nha môn (v0.7 S4, ADR 0020 Q5): ứng tuyển ở trị sở quan phủ theo cùng luật tuyển sai dịch NPC (chữ +
// võ; còn chỗ thì nhận, đủ chỗ thì thay người kém hơn hẳn). Lương quý, nợ lương, theo trận tiễu phỉ ở pha Thế lực
// (`factions/government.ts`). Thuần, tất định, không rút RNG.
import { ageYearsAt, type LogEntry, type Tick } from '@tsvl/shared';
import type { RegionLogic } from '@tsvl/worldgen';
import type { CharacterState } from './character';
import { enterCareer, leaveCareer, type CareerWorld } from './career';
import { canHire, isSoldierOf, OFFICIAL_AGE, OFFICIAL_REPLACE_MARGIN, officialScore, releaseOfficial, weakestOfficial } from '../factions/government';
import type { FactionState, FactionWorldState } from '../factions/state';
import { isHostile, JOIN_ATTITUDE, shiftAttitude } from '../factions/attitude';
import { lookup } from '../npc/family';
import type { NpcWorldState } from '../npc/state';
import type { Bond } from '../social/bonds';

type Log = (e: Omit<LogEntry, 'tick'>) => void;

export interface EnlistWorld extends CareerWorld {
  factions: FactionWorldState;
  npcs: NpcWorldState;
  bonds: Bond[];
  logic: RegionLogic;
  tick: Tick;
}

const governmentOf = (fw: FactionWorldState): FactionState | null => fw.list.find((f) => f.kind === 'government' && f.ended === null) ?? null;

/** Ứng tuyển được không: ở trị sở, đúng tuổi, chưa là sai dịch; còn chỗ (kho đủ) hay hơn sai dịch kém nhất từ `OFFICIAL_REPLACE_MARGIN`. */
export function enlistLock(c: CharacterState, w: EnlistWorld): string | null {
  const f = governmentOf(w.factions);
  if (!f || c.location !== f.seat) return 'lock.not_seat';
  // Quan phủ ghét thì không nhận (S7, Q9)
  if (isHostile(f)) return 'lock.hostile';
  const age = ageYearsAt(c.birthTick, w.tick);
  if (age < OFFICIAL_AGE[0] || age > OFFICIAL_AGE[1]) return 'lock.age';
  if (isSoldierOf(f, { character: c, career: w.career, log: () => {} })) return 'lock.member';
  const byId = lookup(w.npcs);
  const alive = f.members.filter((id) => byId.get(id)?.death === null).length;
  if (canHire(f, alive)) return null;
  const weak = weakestOfficial(f, byId);
  return weak && officialScore(c) >= officialScore(weak.character) + OFFICIAL_REPLACE_MARGIN ? null : 'lock.no_post';
}

/**
 * Một ô ứng tuyển (khóa đã xét lúc đầu tuần): còn chỗ thì vào; đủ chỗ thì thay sai dịch kém nhất (người ấy về nghề cũ).
 * Vào nghề lính ở bậc học việc, nơi nhận là quan phủ; đang làm nghề khác thì rời. Lương từ quý sau.
 */
export function enlist(c: CharacterState, w: EnlistWorld, log: Log): void {
  if (enlistLock(c, w)) return;
  const f = governmentOf(w.factions)!;
  const byId = lookup(w.npcs);
  const alive = f.members.filter((id) => byId.get(id)?.death === null).length;
  if (!canHire(f, alive)) {
    const weak = weakestOfficial(f, byId)!;
    releaseOfficial(f, weak, w.logic);
    log({ key: 'log.soldier.replace', params: { name: weak.character.name }, importance: 'minor' });
  }
  const old = leaveCareer(w, w.bonds, w.npcs);
  enterCareer(w, 'soldier', w.tick, { faction: f.id });
  shiftAttitude(f, JOIN_ATTITUDE);
  log(old ? { key: 'log.soldier.enlist_change', params: { old: `career.${old.id}` }, importance: 'major' } : { key: 'log.soldier.enlist', params: {}, importance: 'major' });
}
