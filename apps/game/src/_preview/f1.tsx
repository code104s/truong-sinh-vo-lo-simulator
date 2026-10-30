import { render } from 'preact';
import '../styles.css';
import { birthplaceId, regionId } from '@tsvl/shared';
import { Life } from '@tsvl/sim';
import { DaoPanel } from '../screens/Dao';
import { StatusBar } from '../screens/StatusBar';

const bp = { id: birthplaceId('r0/c0'), name: 'Phố Kỳ', nameHan: '浦岐', kind: 'village' as const, cell: { x: 0, y: 0 }, county: 0 };
const life = Life.create({ worldSeed: 'f1', regionId: regionId('r0'), birthplaceId: bp.id, lifeSeed: 3 }, bp);
for (let i = 0; i < 18 && life.alive; i++) { const r = life.advance('year'); if (r.status === 'event') life.choose(r.pending.instance, r.pending.choices.find((c) => !c.locked)!.id); }
const base = life.view();
const sect = { id: 'f9', kind: 'sect' as const, name: { key: 'faction.sect.name', params: { name: 'Thanh Vân' } }, seat: 2, counties: [], strength: 'modest' as const, members: 0 };
const cases = [
  { title: 'Người phàm chưa kiểm', c: { ...base, cultivation: { realm: 'mortal' as const, root: null, path: null, qi: null } } },
  { title: 'Đệ tử ký danh, bỏ nghĩa vụ một năm', c: { ...base, cultivation: { realm: 'mortal' as const, root: 'good' as const, path: 'sect' as const, qi: 'half' as const, duty: { weeks: 2, need: 6, missed: 1, expelAt: 2, fee: 600 } } } },
  { title: 'Tán tu tầng một, tới đỉnh', c: { ...base, cultivation: { realm: 'qi1' as const, root: 'fair' as const, path: 'rogue' as const, qi: 'peak' as const } } },
  { title: 'Bị gạch tên', c: { ...base, cultivation: { realm: 'qi1' as const, root: 'mixed' as const, path: 'sect' as const, qi: 'low' as const } } },
];
render(<div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
  {cases.map((x) => <section key={x.title}>
    <h3>{x.title}</h3>
    <StatusBar c={x.c} date={{ year: 3, month: 4, tenDay: 1, season: 'spring' } as never} saved={false} world={null} />
    <aside class="dossier" style={{ maxWidth: '340px' }}><DaoPanel cultivation={x.c.cultivation} factions={[sect]} /></aside>
  </section>)}
</div>, document.getElementById('app')!);
