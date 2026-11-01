// ecosystem/stats.js v1.0.0
// Small statistics helpers shared by the tools: summary statistics for measured
// lab values (spec 03 §3.1), the quadratic least-squares fit of θ(t) for
// slow-motion video data (spec 04 §3.4) and medians for the Collector (spec 07
// §4.1, §6). Plain numbers in and out, no DOM.
const Stats = (function () {
  'use strict';
  const isNum = v => typeof v === 'number' && isFinite(v);
  const nums = xs => (xs || []).filter(isNum);

  function sum(xs) { let s = 0; for (const x of nums(xs)) s += x; return s; }
  function mean(xs) { const a = nums(xs); return a.length ? sum(a) / a.length : null; }
  function min(xs) { const a = nums(xs); return a.length ? Math.min.apply(null, a) : null; }
  function max(xs) { const a = nums(xs); return a.length ? Math.max.apply(null, a) : null; }

  // Quantile by linear interpolation between order statistics (the usual
  // spreadsheet method, R type 7). q = 0.5 gives the median.
  function quantile(xs, q) {
    const a = nums(xs).slice().sort((x, y) => x - y);
    if (!a.length || !(q >= 0 && q <= 1)) return null;
    const h = (a.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
    return a[lo] + (h - lo) * (a[hi] - a[lo]);
  }
  const median = xs => quantile(xs, 0.5);

  // Standard deviation. Sample (n − 1) by default, which is what a spreadsheet's
  // STDEV gives for a handful of lab trials; { sample: false } for population.
  function stdDev(xs, opts) {
    const a = nums(xs), sample = !(opts && opts.sample === false);
    const n = a.length;
    if (n === 0 || (sample && n < 2)) return null;
    const m = sum(a) / n;
    let ss = 0; for (const x of a) ss += (x - m) * (x - m);
    return Math.sqrt(ss / (sample ? n - 1 : n));
  }

  // Everything a measured-values table needs in one call.
  function summary(xs, opts) {
    const a = nums(xs);
    return { n: a.length, mean: mean(a), median: median(a), min: min(a), max: max(a), sd: stdDev(a, opts), range: a.length ? max(a) - min(a) : null };
  }

  // Solve a small dense linear system by Gaussian elimination with partial pivoting.
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-300) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x.every(isNum) ? x : null;
  }

  // Least-squares quadratic y = c0 + c1 t + c2 t² (spec 04 §3.4: θ(t) = θ₀ + ω₀t + ½αt²,
  // so θ₀ = c0, ω₀ = c1, α = 2·c2). The fit runs on t centred on its mean, which keeps the
  // normal equations well conditioned, then converts back.
  // Returns { c0, c1, c2, r2, residuals, fitted, n } or { error } with a student-facing reason.
  function polyfit2(ts, ys) {
    const pts = [];
    for (let i = 0; i < Math.min(ts.length, ys.length); i++) if (isNum(ts[i]) && isNum(ys[i])) pts.push([ts[i], ys[i]]);
    if (pts.length < 3) return { error: 'Add at least three data points to fit a curve.' };
    const distinct = new Set(pts.map(p => p[0])).size;
    if (distinct < 3) return { error: 'The data points need at least three different times to fit a curve.' };
    const tm = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    let S0 = 0, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
    for (const [t, y] of pts) {
      const u = t - tm, u2 = u * u;
      S0 += 1; S1 += u; S2 += u2; S3 += u2 * u; S4 += u2 * u2;
      T0 += y; T1 += u * y; T2 += u2 * y;
    }
    const x = solve([[S0, S1, S2], [S1, S2, S3], [S2, S3, S4]], [T0, T1, T2]);
    if (!x) return { error: 'These data points cannot be fitted. Check that the times are different.' };
    const [a, b, c] = x;
    const c2 = c, c1 = b - 2 * c * tm, c0 = a - b * tm + c * tm * tm;
    const fitted = pts.map(([t]) => c0 + c1 * t + c2 * t * t);
    const residuals = pts.map(([, y], i) => y - fitted[i]);
    return { c0, c1, c2, r2: rSquared(pts.map(p => p[1]), fitted), residuals, fitted, n: pts.length, ts: pts.map(p => p[0]), ys: pts.map(p => p[1]) };
  }

  // Coefficient of determination. 1 when the fit is exact; null when the data are all equal.
  function rSquared(ys, fitted) {
    const m = mean(ys);
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < ys.length; i++) { ssTot += (ys[i] - m) * (ys[i] - m); ssRes += (ys[i] - fitted[i]) * (ys[i] - fitted[i]); }
    if (ssTot === 0) return ssRes === 0 ? 1 : null;
    return 1 - ssRes / ssTot;
  }

  return { sum, mean, median, quantile, min, max, stdDev, summary, polyfit2, rSquared, solve };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Stats;
