// Kho IndexedDB (ADR 0004): một ô cho đời đang sống, và danh sách tóm tắt các đời đã khép lại.
import type { LifeSummary, SaveFile } from '@tsvl/shared';

const DB = 'tsvl';
const SLOTS = 'slots';
const LIVES = 'lives';
const CURRENT = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SLOTS)) db.createObjectStore(SLOTS);
      if (!db.objectStoreNames.contains(LIVES)) db.createObjectStore(LIVES, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const storage = {
  async loadCurrent(): Promise<SaveFile | null> {
    try {
      return ((await run(SLOTS, 'readonly', (s) => s.get(CURRENT))) as SaveFile | undefined) ?? null;
    } catch {
      return null;
    }
  },
  saveCurrent(save: SaveFile): Promise<unknown> {
    return run(SLOTS, 'readwrite', (s) => s.put(save, CURRENT));
  },
  clearCurrent(): Promise<unknown> {
    return run(SLOTS, 'readwrite', (s) => s.delete(CURRENT));
  },
  addLife(summary: LifeSummary): Promise<unknown> {
    return run(LIVES, 'readwrite', (s) => s.add(summary));
  },
};
