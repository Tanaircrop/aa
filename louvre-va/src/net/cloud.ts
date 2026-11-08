import { deviceId } from '../gameplay/gallery';
import type { PhotoRecord } from '../gameplay/gallery';

/**
 * Thin client for the classroom backend (Supabase, publishable key, insert/update only).
 * Devices publish their position every few seconds, every photo as a JPEG, and the final result.
 * Nothing is readable with this key: the teacher dashboard goes through the lva-admin edge function.
 */
export const CLOUD = {
  url: 'https://qknqhnotdxhjacdvjsxy.supabase.co',
  // publishable (anon) key: by design public; it can only call the three write functions and upload to the bucket
  key: 'sb_publishable_sZoANIz5bAjWRTefiNdi5Q_WQBr1080',
  bucket: 'lva-photos',
};

const headers = () => ({ apikey: CLOUD.key, Authorization: `Bearer ${CLOUD.key}`, 'Content-Type': 'application/json' });

/** Writes go through SECURITY DEFINER functions (lva_presence / lva_photo / lva_result): the tables themselves are closed to this key. */
async function rpc(fn: string, row: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch(`${CLOUD.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify({ p: row }) });
    return r.ok;
  } catch { return false; }
}

export interface Presence { group: string; x: number; y: number; alt: number; heading: number; mode: string; phase: string; remaining: number; photos: number; points: number; discovered: number; eggs: string[] }

export const cloud = {
  enabled: true,
  lastOk: 0,
  async presence(p: Presence) {
    if (!this.enabled) return;
    const ok = await rpc('lva_presence', { device_id: deviceId(), group_name: p.group, x: p.x, y: p.y, alt: p.alt, heading: p.heading, mode: p.mode, phase: p.phase, remaining: Math.round(p.remaining), photos: p.photos, points: p.points, discovered: p.discovered, eggs: p.eggs, user_agent: navigator.userAgent.slice(0, 200), updated_at: new Date().toISOString() });
    if (ok) this.lastOk = Date.now();
  },
  /** Upload a reduced JPEG of the photo plus its metadata. Fire and forget. */
  async photo(rec: PhotoRecord, canvas: HTMLCanvasElement) {
    if (!this.enabled) return;
    try {
      const w = 1200, h = Math.round((canvas.height / canvas.width) * w);
      const small = document.createElement('canvas'); small.width = w; small.height = h;
      small.getContext('2d')!.drawImage(canvas, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((res) => small.toBlob(res, 'image/jpeg', 0.82));
      if (!blob) return;
      const path = `${deviceId()}/${rec.id}.jpg`;
      const up = await fetch(`${CLOUD.url}/storage/v1/object/${CLOUD.bucket}/${path}`, { method: 'POST', headers: { apikey: CLOUD.key, Authorization: `Bearer ${CLOUD.key}`, 'Content-Type': 'image/jpeg' }, body: blob });
      if (!up.ok) return;
      await rpc('lva_photo', { id: rec.id, device_id: deviceId(), group_name: rec.group, path, meta: rec.meta, strokes: rec.strokes, note: rec.note, created_at: new Date(rec.createdAt).toISOString(), updated_at: new Date().toISOString() });
    } catch { /* offline: local copy stays in IndexedDB */ }
  },
  async annotation(rec: PhotoRecord) {
    if (!this.enabled) return;
    try {
      const path = `${deviceId()}/${rec.id}.jpg`;
      await rpc('lva_photo', { id: rec.id, device_id: deviceId(), group_name: rec.group, path, meta: rec.meta, strokes: rec.strokes, note: rec.note, created_at: new Date(rec.createdAt).toISOString() });
    } catch { /* ignore */ }
  },
  async result(r: { group: string; points: number; discovered: number; eggs: string[]; photos: number; annotated: number; answer: number | null; correct: boolean | null; hintUsed: boolean }) {
    if (!this.enabled) return;
    await rpc('lva_result', { device_id: deviceId(), group_name: r.group, points: r.points, discovered: r.discovered, eggs: r.eggs, photos: r.photos, annotated: r.annotated, answer: r.answer, answer_correct: r.correct, hint_used: r.hintUsed, finished_at: new Date().toISOString() });
  },
};
