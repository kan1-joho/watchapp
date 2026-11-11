// 純粋関数のみ。座標系: 的中心が原点、的半径=1.0、右が+x、下が+y（射手から的を正面に見た向き）
export const HIT_RADIUS = 1.0, BOUNDARY_BAND = 0.10, MAX_ABS = 10, VIEW_HALF = 2.0;
const EPS = 1e-12;
export const radius = (x, y) => Math.hypot(x, y);
export const isHit = (x, y, hitR = HIT_RADIUS) => radius(x, y) <= hitR + EPS; // 円周を含む
export const isNearBoundary = (x, y, hitR = HIT_RADIUS) => Math.abs(radius(x, y) - hitR) <= BOUNDARY_BAND + EPS; // 注意表示のみ
export function validatePosition(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: '座標が数値ではないため保存しません' };
  if (Math.abs(x) > MAX_ABS || Math.abs(y) > MAX_ABS) return { ok: false, reason: `|x|または|y|が${MAX_ABS}を超えるため、誤入力防止で保存しません` };
  return { ok: true };
}
// 画面座標(px,py) → 保存座標。rectは正方形のSVG要素のgetBoundingClientRect()。flipは表示だけの左右反転
export function pointToWorld(px, py, rect, { half = VIEW_HALF, flip = false } = {}) {
  const sx = ((px - rect.left) / rect.width * 2 - 1) * half;
  return { x: flip ? 0 - sx : sx, y: ((py - rect.top) / rect.height * 2 - 1) * half };
}
export function worldToPoint(x, y, rect, { half = VIEW_HALF, flip = false } = {}) {
  const sx = flip ? 0 - x : x;
  return { px: rect.left + (sx / half + 1) / 2 * rect.width, py: rect.top + (y / half + 1) / 2 * rect.height };
}
