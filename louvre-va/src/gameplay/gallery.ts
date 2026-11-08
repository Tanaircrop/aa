export interface Stroke { tool: 'A' | 'V' | 'dot'; pts: [number, number][] }

export interface PhotoMeta {
  group: string;
  pos: [number, number];
  altitude: number;
  cameraHeight: number;
  compassDeg: number;
  pitchDeg: number;
  focal: number;
  aspect: string;
  mode: 'walk' | 'fly';
  label: string; // "drone, độ cao 23 m" | "chụp được ngoài đời"
  preset: string;
  takenAt: string;
  width: number;
  height: number;
  hasA?: boolean;
  hasV?: boolean;
  stars?: number;
  points?: number;
}

export interface PhotoRecord {
  id: string;
  group: string;
  blob: Blob;
  meta: PhotoMeta;
  strokes: Stroke[];
  note: string;
  createdAt: number;
}

const DB = 'louvre-va'; const STORE = 'photos'; const REFS = 'references';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) { const s = db.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('group', 'group'); }
      if (!db.objectStoreNames.contains(REFS)) db.createObjectStore(REFS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode); const r = fn(t.objectStore(store));
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  }));
}

export const gallery = {
  async list(group: string): Promise<PhotoRecord[]> {
    const all = await tx<PhotoRecord[]>(STORE, 'readonly', (s) => s.index('group').getAll(group));
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },
  async count(group: string): Promise<number> { return (await this.list(group)).length; },
  async add(rec: PhotoRecord): Promise<void> { await tx(STORE, 'readwrite', (s) => s.put(rec)); },
  async update(rec: PhotoRecord): Promise<void> { await tx(STORE, 'readwrite', (s) => s.put(rec)); },
  async remove(id: string): Promise<void> { await tx(STORE, 'readwrite', (s) => s.delete(id)); },
  async get(id: string): Promise<PhotoRecord | undefined> { return tx<PhotoRecord | undefined>(STORE, 'readonly', (s) => s.get(id)); },
  async setReference(id: string, blob: Blob): Promise<void> { await tx(REFS, 'readwrite', (s) => s.put({ id, blob })); },
  async getReference(id: string): Promise<Blob | undefined> { const r = await tx<{ id: string; blob: Blob } | undefined>(REFS, 'readonly', (s) => s.get(id)); return r?.blob; },
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
