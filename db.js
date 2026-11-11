import { SHOTS } from './store.js';
const NAME = 'kyudo-hit-position', VERSION = 1, SESSION = 'test-session';
const migrations = { 1(db) { db.createObjectStore('shots', { keyPath: 'id' }); db.createObjectStore('meta', { keyPath: 'key' }); } };
export const openDb = () => new Promise((res, rej) => {
  const q = indexedDB.open(NAME, VERSION);
  q.onupgradeneeded = e => { for (let v = e.oldVersion + 1; v <= e.newVersion; v++) migrations[v](q.result, q.transaction); };
  q.onblocked = () => rej(new Error('他のタブが使用中です')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
});
const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error); });
export async function loadShots(db) {
  const tx = db.transaction('shots'), q = tx.objectStore('shots').getAll(); await done(tx);
  const out = {};
  for (const r of q.result) if (r.sessionId === SESSION)
    (out[r.memberId] || (out[r.memberId] = Array(SHOTS).fill(null)))[r.shotIndex] = r.status === 'located' ? { status: 'located', x: r.x, y: r.y } : { status: 'unlocated_miss' };
  return out;
}
export async function saveShots(db, records) { // STEP 1: 単一セッションを全置換（STEP 2以降で練習日単位に拡張）
  const tx = db.transaction('shots', 'readwrite'), st = tx.objectStore('shots'), now = Date.now();
  st.clear();
  for (const [mid, arr] of Object.entries(records)) arr.forEach((r, i) => {
    if (r) st.put({ id: `${SESSION}:${mid}:${i}`, sessionId: SESSION, memberId: mid, shotIndex: i, status: r.status, ...(r.status === 'located' ? { x: r.x, y: r.y } : {}), updatedAt: now });
  });
  return done(tx);
}
