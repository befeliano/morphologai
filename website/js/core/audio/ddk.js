/**
 * Diadokokinetik hız (DDK) çözümlemesi — "pa-pa-pa" (AMR) ve "pa-ta-ka" (SMR) görevleri.
 *  - 5 ms adımlı enerji zarfı, 25 ms yumuşatma
 *  - Hece çekirdekleri: yerel en yüksek noktalar; ≥ 4 dB belirginlik, ≥ 65 ms aralık
 *  - Hız = (hece − 1) / (son − ilk hece zamanı) ; düzenlilik = heceler arası sürelerin
 *    değişim katsayısı (CV); ilk ve son 5 saniye için ayrı hız (yorgunluk göstergesi)
 * Referans (yetişkin, genel literatür): AMR ≈ 5–7 hece/sn, SMR ≈ 5–7 hece/sn
 * (Türkçe normları için ekibinizin kontrol grubu verisi kullanılmalıdır).
 */
export function ddkAnalysis(x, sr, { t0 = 0, t1 = x.length / sr, minGapMs = 65, promDb = 4 } = {}) {
  const hop = Math.round(0.005 * sr);
  const win = Math.round(0.02 * sr);
  const a = Math.floor(t0 * sr);
  const b = Math.min(x.length, Math.floor(t1 * sr));
  const env = [];
  for (let s = a; s + win < b; s += hop) {
    let e = 0;
    for (let i = 0; i < win; i++) e += x[s + i] * x[s + i];
    env.push(10 * Math.log10(e / win + 1e-12));
  }
  // yumuşatma (5 nokta)
  const sm = env.map((_, i) => {
    let s = 0; let n = 0;
    for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < env.length) { s += env[k]; n++; }
    return s / n;
  });
  const sorted = [...sm].sort((p, q) => p - q);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -80;
  const top = sorted[Math.floor(sorted.length * 0.95)] ?? -20;
  const thr = floor + Math.max(8, 0.3 * (top - floor));
  const minGap = Math.round(minGapMs / 5);
  const peaks = [];
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] < thr || sm[i] < sm[i - 1] || sm[i] < sm[i + 1]) continue;
    // belirginlik: iki yandaki en düşük noktaya göre
    let l = i; let lmin = sm[i];
    while (l > 0 && i - l < 60) { l--; lmin = Math.min(lmin, sm[l]); if (sm[l] > sm[i]) break; }
    let r = i; let rmin = sm[i];
    while (r < sm.length - 1 && r - i < 60) { r++; rmin = Math.min(rmin, sm[r]); if (sm[r] > sm[i]) break; }
    if (sm[i] - Math.max(lmin, rmin) < promDb) continue;
    const last = peaks[peaks.length - 1];
    if (last != null && i - last < minGap) { if (sm[i] > sm[last]) peaks[peaks.length - 1] = i; continue; }
    peaks.push(i);
  }
  const times = peaks.map((i) => t0 + (i * hop + win / 2) / sr);
  if (times.length < 3) return { ok: false, reason: 'Yeterli hece saptanamadı (en az 3). Kaydın hızlı ve net tekrarlar içerdiğinden emin olun.', syllables: times.length, times };
  const ints = [];
  for (let i = 1; i < times.length; i++) ints.push(times[i] - times[i - 1]);
  const m = ints.reduce((s, v) => s + v, 0) / ints.length;
  const sd = Math.sqrt(ints.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, ints.length - 1));
  const span = times[times.length - 1] - times[0];
  const rateIn = (w0, w1) => {
    const ts = times.filter((t) => t >= w0 && t <= w1);
    return ts.length >= 3 ? (ts.length - 1) / (ts[ts.length - 1] - ts[0]) : null;
  };
  const r2 = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
  return {
    ok: true,
    syllables: times.length,
    durationSec: r2(span, 2),
    rate: r2((times.length - 1) / span),
    meanIntervalMs: r2(m * 1000, 0),
    sdIntervalMs: r2(sd * 1000, 0),
    cv: r2((sd / m) * 100, 1),
    rateFirst5: r2(rateIn(times[0], times[0] + 5)),
    rateLast5: r2(rateIn(times[times.length - 1] - 5, times[times.length - 1])),
    times: times.map((t) => r2(t, 3)),
  };
}
