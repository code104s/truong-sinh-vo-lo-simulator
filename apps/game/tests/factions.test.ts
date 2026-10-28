// Khối "Thế lực ở {nơi}" (v0.6 F2): thế lực ở quận đang đứng, vai, thứ tự; nhãn thế lực của một người; người cầm đầu.
import { hasKey } from '@tsvl/content';
import { FACTION_KINDS, type FactionView, type NpcView } from '@tsvl/shared';
import { describe, expect, it } from 'vitest';
import { factionsHere, leaderOf, memberLabel, roleKey, type FactionRole } from '../src/app/factions';

const faction = (id: string, kind: FactionView['kind'], o: Partial<FactionView> = {}): FactionView => ({
  id, kind, name: { key: `faction.${kind}.name`, params: { place: 'Vị Kinh', surname: 'Lương' } }, seat: 0, counties: [], strength: 'modest', members: 3, ...o,
});
const person = (id: string, faction?: string): NpcView => ({
  id: id as NpcView['id'], name: `Người ${id}`, gender: 'male', ageYears: 40, occupation: 'occupation.farmer', healthBand: 'healthy',
  portrait: { ageBand: 'adult', class: 'common', key: id }, ...(faction ? { faction } : {}),
});

describe('thế lực ở quận đang đứng (v0.6 F2)', () => {
  const fs = [
    faction('f1', 'government', { seat: 3, counties: [0, 1, 3] }),
    faction('f5', 'clan', { seat: 1, counties: [] }), faction('f2', 'clan', { seat: 0, counties: [1] }),
    faction('f6', 'clan', { seat: 2, counties: [2] }),
    faction('f4', 'guild', { seat: 1, roads: [[0, 1], [1, 2]] }),
    faction('f7', 'bandits', { seat: 2, roads: [[1, 2], [2, 3]] }),
  ];
  const rows = (county: number, control: (string | null)[] = ['f1', 'f1', 'f7', 'f1']) => factionsHere(fs, control, county).map((r) => [r.f.id, r.roles]);

  it('quan phủ luôn có mặt; họ đứng đầu trước rồi theo id; thương hội có hội quán; băng cướp giữ đường qua đây', () => {
    expect(rows(1)).toEqual([['f1', ['holder']], ['f2', ['lead']], ['f5', ['seat']], ['f4', ['seat']], ['f7', ['near']]]);
  });

  it('quận bị cướp cát cứ: quan phủ đã mất đất này, băng cướp giữ đất và có sào huyệt ở đây', () => {
    expect(rows(2)).toEqual([['f1', ['lost']], ['f6', ['lead', 'seat']], ['f7', ['holder', 'seat']]]);
  });

  it('quận chưa ai giữ: quan phủ vẫn có mặt, không ghi vai; thế lực không dính quận này thì không có', () => {
    expect(rows(0, [null, 'f1', 'f7', 'f1'])).toEqual([['f1', []], ['f2', ['seat']]]);
  });

  it('mọi nhãn vai, nhãn người, lời giới thiệu có trong nội dung', () => {
    const roles: FactionRole[] = ['holder', 'lost', 'lead', 'seat', 'near'];
    for (const kind of FACTION_KINDS) {
      for (const r of roles) expect(hasKey(roleKey(faction('f1', kind), r)), `${kind}/${r}`).toBe(true);
      expect(hasKey(`ui.factions.member.${kind}`), kind).toBe(true);
      expect(hasKey(`ui.factions.about.${kind}`), kind).toBe(true);
    }
  });

  it('nhãn thế lực của một người theo loại (người họ …); người không thuộc thế lực nào thì không có', () => {
    expect(memberLabel(person('n1', 'f2'), fs)).toEqual({ key: 'ui.factions.member.clan', params: { place: 'Vị Kinh', surname: 'Lương' } });
    expect(memberLabel(person('n2'), fs)).toBeNull();
    expect(memberLabel(person('n3', 'f99'), fs)).toBeNull();
  });

  it('người cầm đầu: tìm ở người trong quận rồi người quen; không thấy thì null', () => {
    const f = faction('f2', 'clan', { leader: 'n9' as NpcView['id'] });
    expect(leaderOf(f, [person('n1')], [person('n9')])?.id).toBe('n9');
    expect(leaderOf(f, [person('n1')], [])).toBeNull();
    expect(leaderOf(faction('f3', 'guild'), [person('n1')], [])).toBeNull();
  });
});
