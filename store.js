import { isHit, validatePosition } from './geometry.js';
export const SHOTS = 4;
const clone = o => JSON.parse(JSON.stringify(o));
// 射レコード: null=未入力 / {status:'located',x,y} / {status:'unlocated_miss'}。的中/外れは座標から算出し保存しない
export function createStore(members, init = {}) {
  const s = { members, records: {}, mi: 0, sel: 0 };
  for (const m of members) s.records[m.id] = init[m.id] ? clone(init[m.id]) : Array(SHOTS).fill(null);
  const undoStack = [], subs = [];
  const emit = (dirty = false) => subs.forEach(f => f(s, dirty));
  const rec = () => s.records[members[s.mi].id];
  const firstEmpty = a => { const k = a.indexOf(null); return k < 0 ? null : k; };
  const snap = () => clone({ records: s.records, mi: s.mi, sel: s.sel });
  const push = p => { if (JSON.stringify(p.records) !== JSON.stringify(s.records)) undoStack.push(p); };
  s.sel = firstEmpty(rec());
  return {
    state: s, snap, canUndo: () => undoStack.length > 0,
    subscribe: f => subs.push(f),
    restore(p) { Object.assign(s, clone(p)); emit(true); },
    select(i) { s.sel = i; emit(); },
    place(i, x, y) { const v = validatePosition(x, y); if (!v.ok) return v; rec()[i] = { status: 'located', x, y }; emit(); return v; },
    settle(before) { push(before); s.sel = firstEmpty(rec()); emit(true); }, // タップ/ドラッグ確定。Undoは1件
    unlocated(i) { const p = snap(); rec()[i] = { status: 'unlocated_miss' }; push(p); s.sel = firstEmpty(rec()); emit(true); },
    remove(i) { if (!rec()[i]) return false; const p = snap(); rec()[i] = null; push(p); s.sel = i; emit(true); return true; },
    undo() { const p = undoStack.pop(); if (p) this.restore(p); return !!p; },
    goto(k) { if (k < 0 || k >= members.length) return false; s.mi = k; s.sel = firstEmpty(rec()); emit(); return true; },
    next() { return this.goto(s.mi + 1); }, prev() { return this.goto(s.mi - 1); },
  };
}
// 的中率の分母は記録済みの射数（未入力は含めない。位置不明の外れは含める）
export const statsOf = arr => { const d = arr.filter(Boolean); return { recorded: d.length, hits: d.filter(r => r.status === 'located' && isHit(r.x, r.y)).length }; };
export const totalStats = recs => Object.values(recs).map(statsOf).reduce((a, b) => ({ recorded: a.recorded + b.recorded, hits: a.hits + b.hits }), { recorded: 0, hits: 0 });
