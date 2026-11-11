import test from 'node:test';
import assert from 'node:assert/strict';
import { isHit, isNearBoundary, validatePosition, pointToWorld, worldToPoint } from '../src/geometry.js';
import { createStore, statsOf, totalStats } from '../src/store.js';
const TOL = 1e-9; // 純粋関数の目標誤差
const near = (a, b, t = TOL) => assert.ok(Math.abs(a - b) < t, `${a} vs ${b}`);
const rects = [{ left: 0, top: 0, width: 400, height: 400 }, { left: 123.4, top: 56.7, width: 733.3, height: 733.3 }, { left: -20, top: 300.5, width: 97, height: 97 }];

test('座標変換: 往復誤差<1e-9（反転・表示範囲・矩形を網羅）', () => {
  for (const rect of rects) for (const flip of [false, true]) for (const half of [1.5, 2, 3])
    for (const [x, y] of [[0, 0], [1, 0], [-0.37, 0.81], [1.4, -1.9], [-1.49, 1.49]]) {
      const p = worldToPoint(x, y, rect, { half, flip }), w = pointToWorld(p.px, p.py, rect, { half, flip });
      near(w.x, x); near(w.y, y);
    }
});
test('回転・倍率相当（矩形サイズ/位置が変わっても同じ的上の点は同じ座標）', () => {
  const w = [0.3, -0.4];
  const res = rects.map(r => { const p = worldToPoint(...w, r, {}); return pointToWorld(p.px, p.py, r, {}); });
  res.forEach(r => { near(r.x, w[0]); near(r.y, w[1]); });
});
test('左右反転: 同じ画面位置は符号反転、保存座標の向きは不変', () => {
  const r = rects[0], a = pointToWorld(100, 200, r, { flip: false }), b = pointToWorld(100, 200, r, { flip: true });
  near(a.x, -b.x); near(a.y, b.y); near(a.x, -1); // 画面左1/4 → 保存x=-1（反転時は+1）
  const p = worldToPoint(0.5, 0.2, r, { flip: true }); // 保存座標(0.5,0.2)は反転表示では画面左側
  assert.ok(p.px < r.left + r.width / 2);
  const q = pointToWorld(p.px, p.py, r, { flip: true }); near(q.x, 0.5); near(q.y, 0.2);
  assert.ok(Object.is(pointToWorld(200, 200, r, { flip: true }).x, 0)); // -0を出さない
});
test('的中判定: 円周上は的中、わずかに外は外れ', () => {
  assert.ok(isHit(1, 0)); assert.ok(isHit(0, -1)); assert.ok(isHit(0.6, 0.8)); assert.ok(isHit(0, 0));
  assert.ok(!isHit(1.0001, 0)); assert.ok(!isHit(0.8, 0.61));
});
test('境界付近: |r-1.0|<=0.10 は注意表示のみで判定は変えない', () => {
  assert.ok(isNearBoundary(0.9, 0)); assert.ok(isNearBoundary(1.1, 0)); assert.ok(isNearBoundary(1, 0));
  assert.ok(!isNearBoundary(0.8999, 0)); assert.ok(!isNearBoundary(1.1001, 0));
  assert.ok(isHit(0.95, 0) && isNearBoundary(0.95, 0)); assert.ok(!isHit(1.05, 0) && isNearBoundary(1.05, 0));
});
test('入力検証: |x|,|y|>10 は拒否して理由を返す', () => {
  assert.ok(validatePosition(10, -10).ok);
  for (const [x, y] of [[10.0001, 0], [0, -10.5], [NaN, 0]]) { const v = validatePosition(x, y); assert.ok(!v.ok && v.reason); }
});

const M = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const put = (st, i, x, y) => { const b = st.snap(); st.place(i, x, y); st.settle(b); };
const cur = st => st.state.records[M[st.state.mi].id];
test('新規記録→次の空き射へ自動選択、Undoで元に戻る', () => {
  const st = createStore(M); assert.equal(st.state.sel, 0);
  put(st, 0, 0.1, 0.1); assert.equal(st.state.sel, 1); assert.equal(cur(st)[0].status, 'located');
  st.undo(); assert.equal(cur(st)[0], null); assert.equal(st.state.sel, 0); assert.ok(!st.canUndo());
});
test('位置修正のUndo', () => {
  const st = createStore(M); put(st, 0, 0.1, 0.1); st.select(0); put(st, 0, 0.5, 0.5);
  assert.equal(cur(st)[0].x, 0.5); st.undo(); assert.equal(cur(st)[0].x, 0.1);
});
test('位置不明の外れ: 座標なし・Undo可・的中率に外れとして数える', () => {
  const st = createStore(M); put(st, 0, 0, 0); st.unlocated(1);
  assert.deepEqual(cur(st)[1], { status: 'unlocated_miss' }); assert.deepEqual(statsOf(cur(st)), { recorded: 2, hits: 1 });
  st.undo(); assert.equal(cur(st)[1], null);
  put(st, 1, 0.5, 0); st.select(1); st.unlocated(1); st.undo(); assert.equal(cur(st)[1].x, 0.5); // 位置あり→位置不明のUndo
});
test('削除とUndo', () => {
  const st = createStore(M); put(st, 0, 0.2, 0.2); assert.ok(st.remove(0)); assert.equal(cur(st)[0], null); assert.ok(!st.remove(0));
  st.undo(); assert.equal(cur(st)[0].x, 0.2);
});
test('4射入力済みで選択なし（誤タップで上書きしない）', () => {
  const st = createStore(M); for (let i = 0; i < 4; i++) put(st, i, 2 - i, 0); assert.equal(st.state.sel, null);
});
test('部員移動: 名簿順・戻って修正・最後で止まる・記録保持・Undoは記録した部員へ戻る', () => {
  const st = createStore(M); put(st, 0, 0.1, 0); assert.ok(st.next()); put(st, 0, 0.2, 0);
  assert.ok(st.next()); assert.equal(st.state.mi, 2); assert.ok(!st.next()); assert.equal(st.state.mi, 2);
  assert.ok(st.prev()); assert.ok(st.prev()); assert.equal(cur(st)[0].x, 0.1); assert.equal(st.state.sel, 1);
  st.select(0); put(st, 0, 0.9, 0); assert.equal(cur(st)[0].x, 0.9); st.goto(1); assert.equal(cur(st)[0].x, 0.2);
  st.undo(); assert.equal(st.state.mi, 0); assert.equal(cur(st)[0].x, 0.1);
});
test('的中率の分母は記録済みのみ', () => {
  const st = createStore(M); put(st, 0, 0, 0); put(st, 1, 5, 5); st.unlocated(2);
  assert.deepEqual(statsOf(cur(st)), { recorded: 3, hits: 1 }); assert.deepEqual(totalStats(st.state.records), { recorded: 3, hits: 1 });
});
