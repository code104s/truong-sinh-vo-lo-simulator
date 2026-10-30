// Kiểm chuỗi nội dung bằng đời thật: mọi câu nhật ký, mọi trường view, mọi thẻ sự kiện, mọi tổng kết đều dịch được.
// 300 đời chia bốn tệp content-lives-*.test.ts (v0.8): một tệp chạy hơn 180 s, bốn tệp thì vitest chạy song song.
import { hasKey, t } from '@tsvl/content';
import { birthplaceId, regionId, type Birthplace, type SettlementKind } from '@tsvl/shared';
import { firstOpenChoice, Life } from '@tsvl/sim';
import { expect } from 'vitest';
import { logText } from '../src/app/format';

export const MISSING = /⟨|\{\w+\}/;
/** Mỗi tệp một phần tư của 300 đời. */
export const LIVES_PER_FILE = 75;
/** Giới hạn mỗi tệp: 75 đời chạy khoảng 50 s một mình, lâu hơn khi cả bộ chạy song song. */
export const LIVES_TIMEOUT = 180_000;

/** Chạy các đời `from` … `to − 1` (seed đời = số thứ tự, như bản 300 đời một tệp trước v0.8). */
export function checkLives(from: number, to: number): void {
  const kinds: SettlementKind[] = ['village', 'town', 'city'];
  const seen = new Set<string>();
  for (let i = from; i < to; i++) {
    const bp: Birthplace = { id: birthplaceId(`r0/c${i % 5}`), name: 'Phố Kỳ', nameHan: '浦岐', kind: kinds[i % 3]!, cell: { x: 0, y: 0 }, county: 0 };
    const life = Life.create({ worldSeed: 'content', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: i }, bp);
    while (life.alive) {
      const res = life.advance('year');
      // Thẻ sự kiện: tựa, lời kể, lựa chọn, giá, lý do khóa đều dịch được; rồi chọn như người chơi máy mặc định
      if (res.status === 'event') {
        const p = res.pending;
        const texts = [t(`${p.eventId}.title`, p.params), t(p.variant ? `${p.eventId}.body.${p.variant}` : `${p.eventId}.body`, p.params),
          ...p.choices.flatMap((c) => [t(`${p.eventId}.choice.${c.id}`, p.params), ...c.costs.map((tag) => t(`event.cost.${tag}`)), ...(c.locked ? [t(c.locked)] : [])])];
        for (const text of texts) expect(text, p.eventId).not.toMatch(MISSING);
        seen.add(p.eventId);
        life.choose(p.instance, firstOpenChoice(p));
      }
      const v = life.view();
      for (const id of [v.background, v.personality, v.constitution, v.aptitude, `health.${v.healthBand}`, `gender.${v.gender}`, `stamina.${v.staminaBand}`, ...v.skills.flatMap((s) => [s.id, s.rank]), ...v.traits, ...v.conditions.map((c) => c.id), ...v.conditions.map((c) => `severity.${c.severity}`)]) {
        expect(hasKey(id), id).toBe(true);
      }
      // Người trong quận (v0.4): nghề, dải sức khỏe dịch được
      for (const v of life.people()) for (const id of [v.occupation, `health.${v.healthBand}`]) expect(hasKey(id), id).toBe(true);
      for (const option of life.actions()) for (const id of [option.id, option.cost.stamina, option.cost.risk, option.cost.money, ...option.gains, ...(option.locked ? [option.locked] : [])]) expect(hasKey(id), id).toBe(true);
    }
    for (const e of life.log) {
      seen.add(e.key);
      const text = logText(e);
      expect(text, `${e.key} ${JSON.stringify(e.params)}`).not.toMatch(MISSING);
    }
    const s = life.summary();
    expect(hasKey(`death.${s.cause}`)).toBe(true);
    expect(hasKey(s.causeDetail), s.causeDetail).toBe(true);
  }
  expect([...seen].sort()).toEqual(expect.arrayContaining(['log.birth', 'log.death', 'log.illness.onset', 'log.illness.recovered', 'log.age.milestone']));
}
