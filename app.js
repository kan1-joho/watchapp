import { VIEW_HALF, isHit, isNearBoundary, pointToWorld } from './geometry.js';
import { createStore, SHOTS, statsOf, totalStats } from './store.js';
import { openDb, loadShots, saveShots } from './db.js';

const MEMBERS = ['青木', '伊藤', '上田', '江口', '小野', '加藤'].map((n, i) => ({ id: 't' + (i + 1), name: n })); // テスト名簿
const $ = id => document.getElementById(id);
let flip = false, half = VIEW_HALF;
try { flip = localStorage.getItem('flip') === '1'; half = +localStorage.getItem('half') || VIEW_HALF; } catch {}
const view = () => ({ half, flip });
const say = (t, warn) => { $('msg').textContent = t; $('msg').className = warn ? 'warn' : ''; };
const info = r => !r ? { t: '未入力', s: '－' } : r.status === 'unlocated_miss' ? { t: '位置不明の外れ', s: '？' } : isHit(r.x, r.y) ? { t: '的中', s: '○' } : { t: '外れ', s: '×' };

// iPadにはデバッグ画面がないため、想定外のエラーも画面に出す
addEventListener('error', e => say(`エラー: ${e.message}`, true));
addEventListener('unhandledrejection', e => say(`エラー: ${e.reason && e.reason.message || e.reason}`, true));
let db = null, dbPending = true; // 保存領域の準備が終わるまでは記録しない（読み込み前の入力を上書きしないため）
const store = createStore(MEMBERS);
store.subscribe(render);
store.subscribe((s, dirty) => { if (dirty && db) saveShots(db, s.records).catch(() => say('保存に失敗しました', true)); });

function drawTarget(arr, sel) {
  const H = half, X = x => flip ? -x : x, u = H / 20, svg = $('target');
  const dash = `fill="none" stroke="#8a94a0" stroke-width="${u / 12}" stroke-dasharray="${u / 3} ${u / 3}"`;
  let g = `<rect x="${-H}" y="${-H}" width="${2 * H}" height="${2 * H}" fill="#e9edf1"/>
    <path d="M${-H} 0H${H}M0 ${-H}V${H}" stroke="#b7c0c9" stroke-width="${u / 8}"/>
    <circle r="1" fill="#fff" stroke="#1d2733" stroke-width="${u / 3}"/><circle r=".5" fill="none" stroke="#c4ccd4" stroke-width="${u / 8}"/>
    <circle r=".9" ${dash}/><circle r="1.1" ${dash}/>`;
  const lab = (x, y, t) => `<text x="${X(x)}" y="${y}" font-size="${u * 1.5}" fill="#4b5663" text-anchor="middle" dominant-baseline="middle">${t}</text>`;
  g += lab(0, -H * .9, '上') + lab(0, H * .9, '下') + lab(-H * .9, 0, '左') + lab(H * .9, 0, '右'); // 保存座標の向きで配置（反転時は画面上で左右が入れ替わる）
  arr.forEach((r, i) => {
    if (!r || r.status !== 'located') return; // 位置不明の外れは的の上に出さない
    const x = X(r.x), y = r.y, c = isHit(r.x, r.y) ? '#0b6bcb' : '#c4271d';
    if (isNearBoundary(r.x, r.y)) g += `<circle cx="${x}" cy="${y}" r="${u * 1.6}" fill="none" stroke="#1d2733" stroke-width="${u / 6}" stroke-dasharray="${u / 3} ${u / 4}"/>`;
    if (i === sel) g += `<circle cx="${x}" cy="${y}" r="${u * 2.1}" fill="none" stroke="#f0a000" stroke-width="${u / 2.5}"/>`;
    g += isHit(r.x, r.y)
      ? `<circle cx="${x}" cy="${y}" r="${u}" fill="${c}" stroke="#fff" stroke-width="${u / 4}"/>`
      : `<path d="M${x - u} ${y - u}L${x + u} ${y + u}M${x - u} ${y + u}L${x + u} ${y - u}" stroke="#fff" stroke-width="${u * .85}" stroke-linecap="round"/><path d="M${x - u} ${y - u}L${x + u} ${y + u}M${x - u} ${y + u}L${x + u} ${y - u}" stroke="${c}" stroke-width="${u * .45}" stroke-linecap="round"/>`;
    g += `<text x="${x}" y="${y - u * 2.7}" font-size="${u * 1.7}" font-weight="700" fill="#1d2733" text-anchor="middle" stroke="#fff" stroke-width="${u / 3}" paint-order="stroke">${i + 1}</text>`;
  });
  svg.setAttribute('viewBox', `${-H} ${-H} ${2 * H} ${2 * H}`);
  svg.innerHTML = g;
}

function render() {
  const s = store.state, last = s.members.length - 1, m = s.members[s.mi], arr = s.records[m.id], st = statsOf(arr), all = totalStats(s.records);
  $('who').textContent = `${m.name}（${s.mi + 1}/${s.members.length}人目）`;
  $('now').textContent = s.sel == null ? '4射とも入力済み' : `${s.sel + 1}射目を${arr[s.sel] ? '修正' : '入力'}中`;
  $('now').className = s.sel == null ? 'done' : '';
  drawTarget(arr, s.sel);
  $('chips').innerHTML = arr.map((r, i) => {
    const f = info(r), near = r && r.status === 'located' && isNearBoundary(r.x, r.y);
    return `<button data-i="${i}" class="chip${i === s.sel ? ' sel' : ''}"><b>${i + 1}射目</b><span class="sym">${f.s}</span><span>${f.t}</span>${near ? '<small>境界付近</small>' : ''}</button>`;
  }).join('');
  $('unloc').disabled = s.sel == null; $('del').disabled = s.sel == null || !arr[s.sel]; $('undo').disabled = !store.canUndo();
  $('prev').disabled = s.mi === 0; $('next').disabled = s.mi === last;
  $('next').textContent = s.mi === last ? '最後の部員です' : '次の部員へ ▶';
  $('jump').innerHTML = s.members.map((x, k) => `<option value="${k}"${k === s.mi ? ' selected' : ''}>${s.records[x.id].every(Boolean) ? '✓ ' : ''}${x.name}</option>`).join('');
  $('stats').textContent = `${m.name}：記録${st.recorded}射中${st.hits}中　／　全体：記録${all.recorded}射中${all.hits}中` + (all.recorded ? `（${(all.hits / all.recorded * 100).toFixed(1)}%）` : '');
  $('flip').checked = flip; $('half').value = String(half);
}

let drag = null;
const apply = e => { const w = pointToWorld(e.clientX, e.clientY, $('target').getBoundingClientRect(), view()); const r = store.place(drag.i, w.x, w.y); if (!r.ok) say(r.reason, true); return r.ok; };
const target = $('target');
target.addEventListener('pointerdown', e => {
  if (dbPending) return say('保存領域を準備中です。少しお待ちください', true);
  const s = store.state; if (s.sel == null) return say('4射とも入力済みです。修正する射の番号を選んでください', true);
  e.preventDefault(); target.setPointerCapture(e.pointerId);
  drag = { i: s.sel, before: store.snap() }; apply(e);
});
target.addEventListener('pointermove', e => { if (drag) apply(e); });
target.addEventListener('pointerup', () => {
  if (!drag) return; const { i, before } = drag; drag = null; store.settle(before);
  const f = info(store.state.records[store.state.members[store.state.mi].id][i]);
  say(`${i + 1}射目：${f.t}`);
});
target.addEventListener('pointercancel', () => { if (drag) { store.restore(drag.before); drag = null; } });
$('chips').onclick = e => { const b = e.target.closest('button'); if (b) { store.select(+b.dataset.i); say(''); } };
$('unloc').onclick = () => { const i = store.state.sel; store.unlocated(i); say(`${i + 1}射目：位置不明の外れ`); };
$('del').onclick = () => { const i = store.state.sel; store.remove(i); say(`${i + 1}射目を削除しました（取り消しで戻せます）`); };
$('undo').onclick = () => { store.undo(); say('直前の操作を取り消しました'); };
$('prev').onclick = () => { store.prev(); say(''); };
$('next').onclick = () => { store.next(); say(store.state.mi === store.state.members.length - 1 ? '最後の部員です' : ''); };
$('jump').onchange = e => { store.goto(+e.target.value); say(''); };
$('flip').onchange = e => { flip = e.target.checked; try { localStorage.setItem('flip', flip ? '1' : '0'); } catch {} render(); };
$('half').onchange = e => { half = +e.target.value; try { localStorage.setItem('half', half); } catch {} render(); };
render();

// 画面の描画とボタン登録を先に済ませ、IndexedDBは後から非同期で準備する（応答しなくても画面は動く）
const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('応答がありません')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
(async () => {
  say('保存領域を準備中…');
  try {
    const d = await withTimeout(openDb(), 4000), saved = await withTimeout(loadShots(d), 4000), recs = {};
    for (const m of MEMBERS) recs[m.id] = saved[m.id] || Array(SHOTS).fill(null);
    const k = recs[MEMBERS[0].id].indexOf(null);
    store.restore({ records: recs, mi: 0, sel: k < 0 ? null : k }); db = d; say('');
  } catch (e) { say(`保存領域を使えません（${e.name || ''} ${e.message || ''}）。記録は画面を閉じると消えます`, true); }
  dbPending = false;
})();
