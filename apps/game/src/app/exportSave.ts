import { encodeSave, type SaveFile } from '@tsvl/shared';

export function downloadSave(save: SaveFile): void {
  const url = URL.createObjectURL(new Blob([encodeSave(save)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `tsvl-${save.worldSeed}-${(save.sim as { tick: number }).tick}.json`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
