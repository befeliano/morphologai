/**
 * Öngörü çalışması istatistikleri (protokol bölüm 8):
 *  - Tahmin başarısı: doğruluk, duyarlılık, özgüllük (eşik %50), Brier skoru, AUC (Mann–Whitney)
 *  - Uyum: program–DKT ağırlıklı Cohen kappa (kuadratik, 0–3 maddeler), DKT'ler arası Fleiss kappa
 *  - Venn: yalnız DKT, ortak, yalnız program bulguları (madde puanı ≥ 2 "bulgu" sayılır)
 */

/** @param {Array<{p:number, y:boolean}>} rows */
export function predictionMetrics(rows) {
  const d = rows.filter((r) => r.p != null && typeof r.y === 'boolean');
  const n = d.length;
  if (!n) return { n: 0 };
  let tp = 0; let tn = 0; let fp = 0; let fn = 0;
  for (const r of d) {
    const pred = r.p >= 0.5;
    if (pred && r.y) tp++; else if (!pred && !r.y) tn++; else if (pred) fp++; else fn++;
  }
  const brier = d.reduce((s, r) => s + (r.p - (r.y ? 1 : 0)) ** 2, 0) / n;
  const pos = d.filter((r) => r.y).map((r) => r.p);
  const neg = d.filter((r) => !r.y).map((r) => r.p);
  let auc = null;
  if (pos.length && neg.length) {
    let s = 0;
    for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0;
    auc = s / (pos.length * neg.length);
  }
  return {
    n, tp, tn, fp, fn,
    accuracy: (tp + tn) / n,
    sensitivity: tp + fn ? tp / (tp + fn) : null,
    specificity: tn + fp ? tn / (tn + fp) : null,
    brier, auc,
  };
}

/** Kuadratik ağırlıklı Cohen kappa (kategoriler 0..k-1). @param {Array<[number,number]>} pairs */
export function weightedKappa(pairs, k = 4) {
  const d = pairs.filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b));
  const n = d.length;
  if (n < 2) return null;
  const O = Array.from({ length: k }, () => new Array(k).fill(0));
  const ra = new Array(k).fill(0);
  const rb = new Array(k).fill(0);
  for (const [a, b] of d) { O[a][b]++; ra[a]++; rb[b]++; }
  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = ((i - j) ** 2) / ((k - 1) ** 2);
      num += w * O[i][j] / n;
      den += w * (ra[i] / n) * (rb[j] / n);
    }
  }
  return den === 0 ? (num === 0 ? 1 : null) : 1 - num / den;
}

/** Fleiss kappa. @param {Array<Array<number>>} ratings  her konu için puan listesi (aynı sayıda değerlendirici) */
export function fleissKappa(ratings, k = 4) {
  const counts = new Map();
  for (const r of ratings) counts.set(r.length, (counts.get(r.length) || 0) + 1);
  const m = [...counts.entries()].filter(([len]) => len >= 2).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!m) return null;
  const subj = ratings.filter((r) => r.length === m);
  const N = subj.length;
  if (N < 2) return null;
  const table = subj.map((r) => { const c = new Array(k).fill(0); r.forEach((x) => { c[x]++; }); return c; });
  const pj = new Array(k).fill(0).map((_, j) => table.reduce((s, c) => s + c[j], 0) / (N * m));
  const Pi = table.map((c) => (c.reduce((s, x) => s + x * x, 0) - m) / (m * (m - 1)));
  const Pbar = Pi.reduce((s, x) => s + x, 0) / N;
  const Pe = pj.reduce((s, x) => s + x * x, 0);
  return Pe === 1 ? null : { kappa: (Pbar - Pe) / (1 - Pe), raters: m, subjects: N };
}

/** Kappa yorumu (Landis & Koch, 1977). */
export function kappaLabel(k) {
  if (k == null) return '—';
  if (k < 0) return 'uyum yok';
  if (k < 0.21) return 'çok zayıf';
  if (k < 0.41) return 'zayıf';
  if (k < 0.61) return 'orta';
  if (k < 0.81) return 'iyi';
  return 'çok iyi';
}

/** Pearson r. */
export function pearson(xs, ys) {
  const d = xs.map((x, i) => [x, ys[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = d.length;
  if (n < 3) return null;
  const mx = d.reduce((s, [a]) => s + a, 0) / n;
  const my = d.reduce((s, [, b]) => s + b, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const [a, b] of d) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
