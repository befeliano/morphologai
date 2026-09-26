/**
 * Sayısal sinyal işleme temel araçları (Praat benzeri çözümlemeler için).
 *  - FFT (radix-2, yerinde), pencere fonksiyonları
 *  - Spektrogram (STFT, dB)
 *  - LPC (otokorelasyon + Levinson-Durbin) ve kök bulma (Durand-Kerner) ile formantlar
 *  - Kepstral tepe belirginliği (CPP)
 */

export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

const winCache = new Map();
export function hann(n) {
  const key = `hann${n}`;
  let w = winCache.get(key);
  if (!w) {
    w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    winCache.set(key, w);
  }
  return w;
}

/** Praat'ın varsayılanına yakın Gauss penceresi. */
export function gaussian(n) {
  const key = `gauss${n}`;
  let w = winCache.get(key);
  if (!w) {
    w = new Float32Array(n);
    const mid = (n - 1) / 2;
    const sigma = n / 6;
    for (let i = 0; i < n; i++) w[i] = Math.exp(-0.5 * ((i - mid) / sigma) ** 2);
    winCache.set(key, w);
  }
  return w;
}

/** Yerinde karmaşık FFT (re, im uzunluğu 2'nin kuvveti). */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * Spektrogram: [zaman çerçevesi][frekans kutusu] dB (Float32Array satırları).
 * @param {Float32Array} x
 * @param {number} sr
 * @param {{t0, t1, winSec, stepSec, maxHz, preEmph}} o
 */
export function spectrogram(x, sr, o = {}) {
  const winSec = o.winSec || 0.005;              // geniş bant (Praat varsayılanı 5 ms)
  const t0 = Math.max(0, o.t0 || 0);
  const t1 = Math.min(x.length / sr, o.t1 || x.length / sr);
  const maxHz = o.maxHz || 5000;
  const nWin = Math.max(16, Math.round(winSec * sr * 2)); // Gauss pencere etkin uzunluğunun 2 katı
  const N = nextPow2(Math.max(nWin, 256));
  const cols = Math.max(1, o.columns || 600);
  const step = Math.max(1, Math.floor(((t1 - t0) * sr) / cols));
  const bins = Math.floor((maxHz / sr) * N);
  const w = gaussian(nWin);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const frames = [];
  const times = [];
  const pre = o.preEmph ?? 0.97;
  let maxDb = -Infinity;
  for (let s = Math.floor(t0 * sr); s < Math.floor(t1 * sr); s += step) {
    re.fill(0);
    im.fill(0);
    const a = s - Math.floor(nWin / 2);
    for (let i = 0; i < nWin; i++) {
      const k = a + i;
      const v = k > 0 && k < x.length ? x[k] - pre * x[k - 1] : 0;
      re[i] = v * w[i];
    }
    fft(re, im);
    const row = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      const p = re[b] * re[b] + im[b] * im[b];
      const db = 10 * Math.log10(p + 1e-12);
      row[b] = db;
      if (db > maxDb) maxDb = db;
    }
    frames.push(row);
    times.push(s / sr);
  }
  return { frames, times, maxDb, binHz: sr / N, maxHz, step: step / sr };
}

// ---------------------------------------------------------------------------
// LPC ve formantlar
// ---------------------------------------------------------------------------
export function autocorr(x, order) {
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) {
    let s = 0;
    for (let i = k; i < x.length; i++) s += x[i] * x[i - k];
    r[k] = s;
  }
  return r;
}

/** Levinson-Durbin: a[0]=1, a[1..p] */
export function levinson(r, p) {
  const a = new Float64Array(p + 1);
  a[0] = 1;
  let e = r[0];
  if (e <= 0) return { a, e: 0 };
  const tmp = new Float64Array(p + 1);
  for (let i = 1; i <= p; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / e;
    tmp.set(a);
    a[i] = k;
    for (let j = 1; j < i; j++) a[j] = tmp[j] + k * tmp[i - j];
    e *= 1 - k * k;
    if (e <= 0) break;
  }
  return { a, e };
}

/** Polinom kökleri (Durand-Kerner). coeffs: a0 x^n + a1 x^(n-1) + ... (a0 = 1) */
function polyRoots(coeffs) {
  const n = coeffs.length - 1;
  const rr = new Float64Array(n);
  const ri = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n + 0.4;
    rr[i] = 0.9 * Math.cos(ang);
    ri[i] = 0.9 * Math.sin(ang);
  }
  for (let iter = 0; iter < 200; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      // p(z)
      let pr = 1;
      let pi = 0;
      for (let k = 1; k <= n; k++) {
        const nr = pr * rr[i] - pi * ri[i] + coeffs[k];
        const ni = pr * ri[i] + pi * rr[i];
        pr = nr;
        pi = ni;
      }
      // Π (z_i - z_j)
      let dr = 1;
      let di = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const ar = rr[i] - rr[j];
        const ai = ri[i] - ri[j];
        const nr = dr * ar - di * ai;
        di = dr * ai + di * ar;
        dr = nr;
      }
      const den = dr * dr + di * di || 1e-30;
      const qr = (pr * dr + pi * di) / den;
      const qi = (pi * dr - pr * di) / den;
      rr[i] -= qr;
      ri[i] -= qi;
      maxDelta = Math.max(maxDelta, Math.abs(qr) + Math.abs(qi));
    }
    if (maxDelta < 1e-10) break;
  }
  const out = [];
  for (let i = 0; i < n; i++) out.push([rr[i], ri[i]]);
  return out;
}

/** Basit ara değerlemeyle yeniden örnekleme (formant analizi için 10–11 kHz). */
export function resampleLinear(x, srIn, srOut, start = 0, end = x.length) {
  const ratio = srIn / srOut;
  const n = Math.floor((end - start) / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const pos = start + i * ratio;
    const k = Math.floor(pos);
    const f = pos - k;
    out[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f;
  }
  return out;
}

/**
 * Bir çerçevede formantlar (Hz, bant genişliği).
 * @param {Float32Array} frame  (fs örnekleme hızında, ~25 ms)
 */
export function formantsOfFrame(frame, fs, nFormants = 4) {
  const p = 2 * nFormants + 2;
  const n = frame.length;
  const w = hann(n);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = (frame[i] - (i ? 0.97 * frame[i - 1] : 0)) * w[i];
  const r = autocorr(x, p);
  r[0] *= 1.0001;
  const { a } = levinson(r, p);
  const roots = polyRoots(Array.from(a));
  const out = [];
  for (const [re, im] of roots) {
    if (im <= 0) continue;
    const f = (Math.atan2(im, re) * fs) / (2 * Math.PI);
    const bw = (-Math.log(Math.hypot(re, im)) * fs) / Math.PI;
    if (f > 90 && f < fs / 2 - 50 && bw < 500) out.push({ f, bw });
  }
  out.sort((u, v) => u.f - v.f);
  return out.slice(0, nFormants);
}

/**
 * Zaman aralığında formant izleri.
 * @returns {{times:number[], f:[number[]], bw:[number[]]}} f[k][i] = k. formant, i. çerçeve
 */
export function formantTrack(x, sr, { t0 = 0, t1 = x.length / sr, maxFormantHz = 5500, step = 0.01, win = 0.025, nFormants = 4, segments = null } = {}) {
  const fs = maxFormantHz * 2;
  const a = Math.max(0, Math.floor(t0 * sr) - Math.floor(win * sr));
  const b = Math.min(x.length, Math.floor(t1 * sr) + Math.floor(win * sr));
  const y = resampleLinear(x, sr, fs, a, b);
  const off = a / sr;
  const n = Math.round(win * fs);
  const times = [];
  const f = Array.from({ length: nFormants }, () => []);
  const inSpeech = (t) => !segments || segments.some((s) => t >= s.start && t <= s.end);
  for (let s = 0; s + n < y.length; s += Math.round(step * fs)) {
    const t = off + (s + n / 2) / fs;
    if (t < t0 || t > t1) continue;
    times.push(t);
    if (!inSpeech(t)) { for (let k = 0; k < nFormants; k++) f[k].push(null); continue; }
    let e = 0;
    for (let i = 0; i < n; i++) e += y[s + i] * y[s + i];
    if (e / n < 1e-7) { for (let k = 0; k < nFormants; k++) f[k].push(null); continue; }
    const fr = formantsOfFrame(y.subarray(s, s + n), fs, nFormants);
    for (let k = 0; k < nFormants; k++) f[k].push(fr[k] ? fr[k].f : null);
  }
  return { times, f };
}

// ---------------------------------------------------------------------------
// Kepstral tepe belirginliği (CPP) — seste disfoni göstergesi
// ---------------------------------------------------------------------------
export function cppOfFrame(frame, sr, f0Min = 60, f0Max = 330) {
  const N = nextPow2(frame.length);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const w = hann(frame.length);
  for (let i = 0; i < frame.length; i++) re[i] = frame[i] * w[i];
  fft(re, im);
  // log güç spektrumu (dB)
  const lre = new Float32Array(N);
  const lim = new Float32Array(N);
  for (let i = 0; i < N; i++) lre[i] = 10 * Math.log10(re[i] * re[i] + im[i] * im[i] + 1e-12);
  fft(lre, lim); // gerçek kepstrum (ölçek sabit)
  const ceps = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) ceps[i] = 10 * Math.log10((lre[i] * lre[i] + lim[i] * lim[i]) / (N * N) + 1e-12);
  const qMin = Math.floor(sr / f0Max);
  const qMax = Math.min(N / 2 - 1, Math.ceil(sr / f0Min));
  let peak = qMin;
  for (let q = qMin; q <= qMax; q++) if (ceps[q] > ceps[peak]) peak = q;
  // doğrusal regresyon çizgisi (qMin..N/2)
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0; let cnt = 0;
  for (let q = Math.floor(sr / 1000); q < N / 2; q++) { sx += q; sy += ceps[q]; sxx += q * q; sxy += q * ceps[q]; cnt++; }
  const slope = (cnt * sxy - sx * sy) / (cnt * sxx - sx * sx || 1);
  const icpt = (sy - slope * sx) / cnt;
  return { cpp: ceps[peak] - (slope * peak + icpt), f0: sr / peak };
}
