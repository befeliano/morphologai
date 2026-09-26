/**
 * Akustik çözümleme (16 kHz mono) — Web Worker içinde çalışır, DOM kullanmaz.
 *
 *  Konuşma / sessizlik bölütleme (enerji tabanlı VAD):
 *    - 25 ms pencere, 10 ms adımla RMS enerji (dBFS)
 *    - Gürültü tabanı = enerji dağılımının 10. yüzdeliği; konuşma düzeyi = 95. yüzdelik
 *    - Eşik = gürültü + max(8 dB, 0,25 × dinamik aralık) (+ kullanıcı ayarı), 3 dB histerezis
 *    - < 60 ms enerji adacıkları atılır; < minPause (250 ms) boşluklar birleştirilir
 *    - Duraksama = ilk sesten son sese kadar olan aralıktaki sessiz bölümler
 *  Temel frekans (F0): YIN algoritması (de Cheveigné & Kawahara, 2002), 8 kHz'e
 *    indirgenmiş sinyalde 40 ms pencere; oktav hatası düzeltmesi ve medyan süzgeç.
 *  Kayıt kalitesi: tepe düzeyi, kırpılma oranı, sinyal-gürültü oranı tahmini.
 */

export const ACOUSTIC_VERSION = 'acoustic-1.0';

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.round(p * (sortedArr.length - 1))));
  return sortedArr[idx];
}

/** 10 ms adımlı enerji (dB) dizisi. */
export function frameEnergies(x, sr, hopMs = 10, winMs = 25) {
  const hop = Math.round((sr * hopMs) / 1000);
  const win = Math.round((sr * winMs) / 1000);
  const n = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * hop;
    let sum = 0;
    for (let j = 0; j < win; j++) {
      const v = x[s + j];
      sum += v * v;
    }
    db[i] = 20 * Math.log10(Math.sqrt(sum / win) + 1e-9);
  }
  return { db, hopSec: hop / sr };
}

/**
 * Enerji dizisinden konuşma bölütleri ve duraksamalar.
 * @param {Float32Array|Int16Array} db  dB (Int16Array ise ×10 ölçeklenmiş)
 */
export function segmentFrames(dbIn, hopSec, { minPauseMs = 250, vadOffsetDb = 0, minSpeechMs = 60 } = {}) {
  const scale = dbIn instanceof Int16Array ? 0.1 : 1;
  const n = dbIn.length;
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) db[i] = dbIn[i] * scale;
  const sorted = Array.from(db).filter((v) => v > -150).sort((a, b) => a - b);
  const noiseDb = percentile(sorted, 0.1);
  const speechDb = percentile(sorted, 0.95);
  const range = speechDb - noiseDb;
  let thr = noiseDb + Math.max(8, 0.25 * range) + vadOffsetDb;
  if (range < 10) thr = noiseDb + Math.max(3, range * 0.5) + vadOffsetDb;
  thr = Math.min(thr, speechDb - 4);

  // Histerezisli sınıflama
  const speech = new Uint8Array(n);
  let on = false;
  for (let i = 0; i < n; i++) {
    if (!on && db[i] > thr) on = true;
    else if (on && db[i] < thr - 3) on = false;
    speech[i] = on ? 1 : 0;
  }
  // Bölütler
  let segs = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const v = i < n ? speech[i] : 0;
    if (v && start < 0) start = i;
    if (!v && start >= 0) {
      segs.push([start, i]);
      start = -1;
    }
  }
  const minSpeech = Math.round(minSpeechMs / 1000 / hopSec);
  segs = segs.filter(([a, b]) => b - a >= minSpeech);
  const minGap = Math.round(minPauseMs / 1000 / hopSec);
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s[0] - last[1] < minGap) last[1] = s[1];
    else merged.push([s[0], s[1]]);
  }
  const toSec = (f) => Number((f * hopSec).toFixed(3));
  const speechSegments = merged.map(([a, b]) => ({ start: toSec(a), end: toSec(b) }));
  const pauses = [];
  for (let i = 1; i < speechSegments.length; i++) {
    const a = speechSegments[i - 1].end;
    const b = speechSegments[i].start;
    pauses.push({ start: a, end: b, dur: Number((b - a).toFixed(3)) });
  }
  const durationSec = n * hopSec;
  const first = speechSegments[0];
  const last = speechSegments[speechSegments.length - 1];
  const speakingTimeSec = speechSegments.reduce((s, g) => s + (g.end - g.start), 0);
  // Konuşma bölütlerindeki enerji istatistiği
  let sum = 0;
  let sum2 = 0;
  let cnt = 0;
  for (const [a, b] of merged) {
    for (let i = a; i < b; i++) { sum += db[i]; sum2 += db[i] * db[i]; cnt++; }
  }
  const meanDb = cnt ? sum / cnt : null;
  return {
    noiseDb: Number(noiseDb.toFixed(1)),
    speechDb: Number(speechDb.toFixed(1)),
    thresholdDb: Number(thr.toFixed(1)),
    snrDb: Number(range.toFixed(1)),
    speechSegments,
    pauses,
    runs: speechSegments.length,
    speechSpanSec: first ? Number((last.end - first.start).toFixed(2)) : 0,
    speakingTimeSec: Number(speakingTimeSec.toFixed(2)),
    leadingSilenceSec: first ? first.start : durationSec,
    trailingSilenceSec: last ? Number((durationSec - last.end).toFixed(2)) : 0,
    intensity: cnt ? { meanDb: Number(meanDb.toFixed(1)), sdDb: Number(Math.sqrt(Math.max(0, sum2 / cnt - meanDb * meanDb)).toFixed(1)) } : null,
    params: { minPauseMs, vadOffsetDb, minSpeechMs },
  };
}

// ---------------------------------------------------------------------------
// F0 — YIN
// ---------------------------------------------------------------------------
function lowpassDecimate2(x) {
  // 31 dokunuşlu Hamming pencereli sinc alçak geçiren (kesim ≈ 3,6 kHz @16k), ardından 1/2 örnekleme
  const N = 31;
  const fc = 0.225;
  const h = new Float32Array(N);
  let hs = 0;
  for (let i = 0; i < N; i++) {
    const m = i - (N - 1) / 2;
    const sinc = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
    h[i] = sinc * w;
    hs += h[i];
  }
  for (let i = 0; i < N; i++) h[i] /= hs;
  const out = new Float32Array(Math.floor(x.length / 2));
  const half = (N - 1) / 2;
  for (let o = 0; o < out.length; o++) {
    const c = o * 2;
    let acc = 0;
    for (let k = 0; k < N; k++) {
      const idx = c + k - half;
      if (idx >= 0 && idx < x.length) acc += h[k] * x[idx];
    }
    out[o] = acc;
  }
  return out;
}

function yinFrame(x, start, W, tauMin, tauMax, d, cmnd) {
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = x[start + j] - x[start + j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  let running = 0;
  cmnd[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < 0.15) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.3) return { f0: 0, ap: cmnd[best] };
    tau = best;
  }
  // parabolik ara değerleme
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const s0 = cmnd[tau - 1];
    const s1 = cmnd[tau];
    const s2 = cmnd[tau + 1];
    const den = 2 * (2 * s1 - s2 - s0);
    if (den !== 0) better = tau + (s2 - s0) / den;
  }
  return { f0: better > 0 ? 1 / better : 0, ap: cmnd[tau] };
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * @param {Float32Array} x16  16 kHz sinyal
 * @param {Array} segments konuşma bölütleri (sn)
 */
export function f0Track(x16, segments, { f0Min = 60, f0Max = 500, hopMs = 10, onProgress } = {}) {
  const x = lowpassDecimate2(x16);
  const sr = 8000;
  const W = Math.round(0.04 * sr);
  const tauMin = Math.floor(sr / f0Max);
  const tauMax = Math.ceil(sr / f0Min);
  const hop = Math.round((sr * hopMs) / 1000);
  const d = new Float32Array(tauMax + 2);
  const cmnd = new Float32Array(tauMax + 2);
  const times = [];
  const values = [];
  const totalFrames = segments.reduce((n, s) => n + Math.max(0, Math.floor(((s.end - s.start) * sr) / hop)), 0) || 1;
  let done = 0;
  for (const seg of segments) {
    const a = Math.floor(seg.start * sr);
    const b = Math.floor(seg.end * sr);
    for (let s = a; s + W + tauMax < x.length && s < b; s += hop) {
      // sessiz çerçeveyi atla
      let e = 0;
      for (let j = 0; j < W; j += 4) e += x[s + j] * x[s + j];
      if (e < 1e-7) { done++; continue; }
      const { f0 } = yinFrame(x, s, W, tauMin, tauMax, d, cmnd);
      const hz = f0 * sr;
      times.push((s + W / 2) / sr);
      values.push(hz >= f0Min && hz <= f0Max ? hz : 0);
      done++;
      if (onProgress && done % 2000 === 0) onProgress(done / totalFrames);
    }
  }
  // Oktav hatası düzeltme ve medyan süzgeç
  const voiced = values.filter((v) => v > 0);
  const m = median(voiced);
  const fixed = values.map((v) => {
    if (!v || !m) return v;
    if (v > 1.85 * m && v / 2 >= f0Min) return v / 2;
    if (v < 0.55 * m && v * 2 <= f0Max) return v * 2;
    return v;
  });
  const smooth = fixed.map((v, i) => {
    if (!v) return 0;
    const win = [];
    for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < fixed.length && fixed[k] > 0) win.push(fixed[k]);
    return win.length >= 3 ? median(win) : v;
  });
  return { times, values: smooth };
}

function f0Stats(track, speechFrames) {
  const v = track.values.filter((x) => x > 0);
  if (v.length < 10) return null;
  const s = [...v].sort((a, b) => a - b);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
  const p5 = percentile(s, 0.05);
  const p95 = percentile(s, 0.95);
  // yarım ton cinsinden SS (prozodik değişkenlik)
  const st = v.map((x) => 12 * Math.log2(x / 100));
  const stMean = st.reduce((a, b) => a + b, 0) / st.length;
  const stSd = Math.sqrt(st.reduce((a, b) => a + (b - stMean) ** 2, 0) / (st.length - 1));
  return {
    mean: Number(mean.toFixed(1)),
    median: Number(percentile(s, 0.5).toFixed(1)),
    sd: Number(sd.toFixed(1)),
    p5: Number(p5.toFixed(1)),
    p95: Number(p95.toFixed(1)),
    rangeSt: Number((12 * Math.log2(p95 / p5)).toFixed(1)),
    sdSt: Number(stSd.toFixed(2)),
    voicedRatio: speechFrames ? Number(Math.min(1, v.length / speechFrames).toFixed(2)) : null,
  };
}

/** Grafik için 100 ms'lik bölmelere sıkıştırılmış F0 izi. */
function compressTrack(track, binSec = 0.1) {
  const t = [];
  const hz = [];
  let bin = -1;
  let acc = [];
  const flush = () => {
    if (acc.length) {
      t.push(Number(((bin + 0.5) * binSec).toFixed(2)));
      hz.push(Number(median(acc).toFixed(1)));
    }
    acc = [];
  };
  for (let i = 0; i < track.times.length; i++) {
    const b = Math.floor(track.times[i] / binSec);
    if (b !== bin) { flush(); bin = b; }
    if (track.values[i] > 0) acc.push(track.values[i]);
  }
  flush();
  return { t, hz };
}

/** Dalga biçimi için min/max tepe dizisi. */
export function computePeaks(x, buckets = 2000) {
  const n = Math.min(buckets, x.length);
  const out = new Float32Array(n * 2);
  const size = x.length / n;
  for (let b = 0; b < n; b++) {
    const a = Math.floor(b * size);
    const e = Math.min(x.length, Math.floor((b + 1) * size));
    let mn = 1;
    let mx = -1;
    for (let i = a; i < e; i++) {
      const v = x[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    out[2 * b] = mn === 1 ? 0 : mn;
    out[2 * b + 1] = mx === -1 ? 0 : mx;
  }
  return out;
}

/**
 * Tam akustik çözümleme.
 * @param {Float32Array} x 16 kHz mono
 * @param {number} sr
 * @param {object} params { minPauseMs, vadOffsetDb }
 */
export function analyzeAcoustic(x, sr, params = {}, onProgress = () => {}) {
  const durationSec = x.length / sr;
  onProgress(0.02, 'Enerji hesaplanıyor');
  const { db, hopSec } = frameEnergies(x, sr);
  const seg = segmentFrames(db, hopSec, params);
  onProgress(0.15, 'Temel frekans (F0) çıkarılıyor');
  const long = durationSec > 360;
  const track = f0Track(x, seg.speechSegments, { hopMs: long ? 20 : 10, onProgress: (p) => onProgress(0.15 + 0.75 * p, 'Temel frekans (F0) çıkarılıyor') });
  const speechFrames = Math.round(seg.speakingTimeSec / (long ? 0.02 : 0.01));
  onProgress(0.92, 'Kalite ölçülüyor');
  let peak = 0;
  let clip = 0;
  let sum2 = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    if (a >= 0.985) clip++;
    sum2 += x[i] * x[i];
  }
  const peakDb = 20 * Math.log10(peak + 1e-9);
  const rmsDb = 20 * Math.log10(Math.sqrt(sum2 / Math.max(1, x.length)) + 1e-9);
  const clippingRatio = clip / Math.max(1, x.length);
  const notes = [];
  let level = 'iyi';
  if (seg.snrDb < 15) { level = 'zayıf'; notes.push('Arka plan gürültüsü yüksek (düşük SNR); duraksama ölçümü etkilenebilir.'); }
  else if (seg.snrDb < 25) { level = 'orta'; notes.push('Orta düzey arka plan gürültüsü.'); }
  if (clippingRatio > 0.001) { level = level === 'iyi' ? 'orta' : level; notes.push('Kırpılma (clipping) saptandı; kayıt düzeyi yüksek olabilir.'); }
  if (peakDb < -30) { notes.push('Kayıt düzeyi çok düşük; mikrofonu yaklaştırın veya kazancı artırın.'); if (level === 'iyi') level = 'orta'; }
  const frames = new Int16Array(db.length);
  for (let i = 0; i < db.length; i++) frames[i] = Math.max(-32000, Math.round(db[i] * 10));
  onProgress(1, 'Tamamlandı');
  return {
    version: ACOUSTIC_VERSION,
    sampleRate: sr,
    durationSec: Number(durationSec.toFixed(2)),
    ...seg,
    f0: f0Stats(track, speechFrames),
    f0Track: compressTrack(track),
    quality: {
      peakDb: Number(peakDb.toFixed(1)),
      rmsDb: Number(rmsDb.toFixed(1)),
      clippingRatio: Number(clippingRatio.toFixed(5)),
      snrDb: seg.snrDb,
      level,
      notes,
    },
    hopSec,
    frames,
    peaks: computePeaks(x),
  };
}

/** Kayıtlı enerji dizisinden farklı eşik/duraksama ayarıyla yeniden bölütleme (anlık). */
export function resegment(acoustic, params) {
  const seg = segmentFrames(acoustic.frames, acoustic.hopSec, params);
  return { ...acoustic, ...seg };
}
