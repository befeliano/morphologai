/**
 * Ses (fonasyon) çözümlemesi — Praat "Voice report" ölçütlerinin karşılıkları.
 * Uzatılmış ünlü ("aaa") kaydında, yüksek örnekleme hızlı sinyal üzerinde çalışır.
 *
 *  Perde periyotları: YIN F0 izi yerel periyodu verir; ardışık glotal tepeler
 *  bu periyoda göre aranıp parabolik ara değerlemeyle alt-örnek hassasiyetinde bulunur.
 *  Jitter  (local, local-absolute, RAP, PPQ5)
 *  Shimmer (local, local-dB, APQ3, APQ5, APQ11)
 *  HNR     : normalize çapraz ilinti yöntemi, 10·log10(r / (1 − r))  (Boersma, 1993)
 *  CPP     : kepstral tepe belirginliği (dB)
 *  Ses kırılmaları, sessiz/sesli oran, maksimum fonasyon süresi (MPT)
 *
 * Referans eşikleri (Praat/MDVP'de yaygın kullanılan patoloji eşikleri; yetişkin, uzatılmış /a/):
 *  jitter local < %1,04 · RAP < %0,68 · PPQ5 < %0,84 · shimmer local < %3,81 · shimmer dB < 0,35 dB
 *  APQ3 < %3,07 · APQ5 < %4,23 · HNR > 20 dB
 */
import { f0Track } from './acoustic.js';
import { resampleLinear, cppOfFrame } from './dsp.js';

export const VOICE_NORMS = {
  jitterLocal: { max: 1.04, unit: '%', label: 'Jitter (local)' },
  jitterRap: { max: 0.68, unit: '%', label: 'Jitter (RAP)' },
  jitterPpq5: { max: 0.84, unit: '%', label: 'Jitter (PPQ5)' },
  shimmerLocal: { max: 3.81, unit: '%', label: 'Shimmer (local)' },
  shimmerDb: { max: 0.35, unit: 'dB', label: 'Shimmer (local, dB)' },
  shimmerApq3: { max: 3.07, unit: '%', label: 'Shimmer (APQ3)' },
  shimmerApq5: { max: 4.23, unit: '%', label: 'Shimmer (APQ5)' },
  hnr: { min: 20, unit: 'dB', label: 'HNR' },
};

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

function pqPerturbation(v, k) {
  // k noktalı perturbasyon bölümü: |v_i − ort(v_{i-h..i+h})| ortalaması / ort(v)
  const h = (k - 1) / 2;
  const out = [];
  for (let i = h; i < v.length - h; i++) {
    let s = 0;
    for (let j = i - h; j <= i + h; j++) s += v[j];
    out.push(Math.abs(v[i] - s / k));
  }
  return out.length ? mean(out) / mean(v) : NaN;
}

/**
 * @param {Float32Array} x mono sinyal (tercihen ≥ 22 kHz)
 * @param {number} sr
 * @param {{t0?:number, t1?:number, f0Min?:number, f0Max?:number}} o
 */
export function voiceReport(x, sr, o = {}) {
  const f0Min = o.f0Min || 75;
  const f0Max = o.f0Max || 500;
  const t0 = Math.max(0, o.t0 || 0);
  const t1 = Math.min(x.length / sr, o.t1 || x.length / sr);
  const s0 = Math.floor(t0 * sr);
  const s1 = Math.floor(t1 * sr);

  // 1) F0 izi (16 kHz üzerinde YIN)
  const x16 = sr === 16000 ? x.subarray(s0, s1) : resampleLinear(x, sr, 16000, s0, s1);
  const tr = f0Track(x16, [{ start: 0, end: x16.length / 16000 }], { f0Min, f0Max, hopMs: 10 });
  const f0At = (t) => {
    const rel = t - t0;
    let best = 0;
    let bd = 1;
    // en yakın sesli çerçeve (±30 ms)
    for (let i = Math.max(0, Math.floor(rel / 0.01) - 4); i < Math.min(tr.times.length, Math.floor(rel / 0.01) + 5); i++) {
      const d = Math.abs(tr.times[i] - rel);
      if (tr.values[i] > 0 && d < bd && d < 0.03) { bd = d; best = tr.values[i]; }
    }
    return best;
  };
  const voiced = tr.values.filter((v) => v > 0);
  if (voiced.length < 10) return { ok: false, reason: 'Yeterli sesli bölüm bulunamadı (uzatılmış bir ünlü kaydedin).' };
  const sortedF0 = [...voiced].sort((a, b) => a - b);
  const medF0 = sortedF0[Math.floor(sortedF0.length / 2)];

  // 2) Glotal tepe (pulse) bulma
  let pol = 0;
  for (let i = s0; i < s1; i++) pol += x[i] > 0 ? x[i] * x[i] : -x[i] * x[i];
  const sign = pol >= 0 ? 1 : -1;
  const val = (i) => sign * (x[i] || 0);
  const pulses = [];
  let t = t0;
  while (t < t1) {
    const f0 = f0At(t);
    if (!f0) { t += 0.005; continue; }
    const T = 1 / f0;
    let start;
    let end;
    if (pulses.length && t - pulses[pulses.length - 1] < 1.25 * T) {
      const prev = pulses[pulses.length - 1];
      start = Math.floor((prev + 0.8 * T) * sr);
      end = Math.ceil((prev + 1.2 * T) * sr);
    } else {
      start = Math.floor(t * sr);
      end = Math.ceil((t + T) * sr);
    }
    end = Math.min(end, s1 - 2);
    if (start >= end) break;
    let bi = start;
    for (let i = start; i <= end; i++) if (val(i) > val(bi)) bi = i;
    // parabolik ara değerleme
    const a = val(bi - 1);
    const b = val(bi);
    const c = val(bi + 1);
    const den = a - 2 * b + c;
    const offs = den !== 0 ? (0.5 * (a - c)) / den : 0;
    const tp = (bi + Math.max(-0.5, Math.min(0.5, offs))) / sr;
    if (!pulses.length || tp - pulses[pulses.length - 1] > 0.5 / f0Max) pulses.push(tp);
    t = tp + 0.5 * T;
  }

  // 3) Periyotlar (Praat ölçütleri: periyot aralığı ve en büyük periyot oranı 1,3)
  const periods = [];
  const amps = [];
  const minP = 1 / f0Max;
  const maxP = 1 / f0Min;
  let breaks = 0;
  let breakTime = 0;
  for (let i = 1; i < pulses.length; i++) {
    const p = pulses[i] - pulses[i - 1];
    if (p > 1.25 / f0Min) { breaks++; breakTime += p; continue; }
    if (p < minP || p > maxP) continue;
    if (periods.length && (p / periods[periods.length - 1] > 1.3 || periods[periods.length - 1] / p > 1.3)) { periods.push(NaN); amps.push(NaN); continue; }
    periods.push(p);
    // tepe-tepe genlik
    const a0 = Math.floor(pulses[i - 1] * sr);
    const a1 = Math.floor(pulses[i] * sr);
    let mx = -Infinity;
    let mn = Infinity;
    for (let k = a0; k <= a1; k++) { if (x[k] > mx) mx = x[k]; if (x[k] < mn) mn = x[k]; }
    amps.push(mx - mn);
  }
  // NaN'larla bölünmüş sürekli parçalar üzerinde hesapla
  const runs = [];
  let cur = [];
  let curA = [];
  periods.forEach((p, i) => {
    if (Number.isNaN(p)) { if (cur.length > 2) runs.push([cur, curA]); cur = []; curA = []; }
    else { cur.push(p); curA.push(amps[i]); }
  });
  if (cur.length > 2) runs.push([cur, curA]);
  const P = runs.flatMap((r) => r[0]);
  const A = runs.flatMap((r) => r[1]);
  if (P.length < 20) return { ok: false, reason: 'Güvenilir perde periyodu sayısı yetersiz (en az ~20 periyot gerekir).' };
  const diffAbs = (arr) => {
    const d = [];
    for (const [r] of runs) for (let i = 1; i < r.length; i++) d.push(Math.abs(r[i] - r[i - 1]));
    return d;
  };
  const dP = diffAbs(P);
  const meanP = mean(P);
  const jitterLocal = (mean(dP) / meanP) * 100;
  const jitterAbsUs = mean(dP) * 1e6;
  const rap = mean(runs.map(([r]) => pqPerturbation(r, 3)).filter(Number.isFinite)) * 100;
  const ppq5 = mean(runs.filter(([r]) => r.length >= 5).map(([r]) => pqPerturbation(r, 5)).filter(Number.isFinite)) * 100;
  const dA = [];
  const dAdb = [];
  for (const [, ra] of runs) {
    for (let i = 1; i < ra.length; i++) {
      dA.push(Math.abs(ra[i] - ra[i - 1]));
      if (ra[i] > 0 && ra[i - 1] > 0) dAdb.push(Math.abs(20 * Math.log10(ra[i] / ra[i - 1])));
    }
  }
  const meanA = mean(A);
  const shimmerLocal = (mean(dA) / meanA) * 100;
  const shimmerDb = mean(dAdb);
  const apq = (k) => mean(runs.filter(([, ra]) => ra.length >= k).map(([, ra]) => pqPerturbation(ra, k)).filter(Number.isFinite)) * 100;

  // 4) HNR (çapraz ilinti) — 10 ms adım, 3 periyotluk pencere
  const hnrVals = [];
  for (let tt = t0 + 0.02; tt < t1 - 0.05; tt += 0.01) {
    const f0 = f0At(tt);
    if (!f0) continue;
    const T = Math.round(sr / f0);
    const W = 2 * T;
    const a0 = Math.floor(tt * sr);
    if (a0 + W + T + 3 >= x.length) break;
    let best = 0;
    for (let lag = Math.floor(0.9 * T); lag <= Math.ceil(1.1 * T); lag++) {
      let sxy = 0; let sxx = 0; let syy = 0;
      for (let i = 0; i < W; i++) {
        const u = x[a0 + i];
        const v = x[a0 + i + lag];
        sxy += u * v; sxx += u * u; syy += v * v;
      }
      const r = sxy / Math.sqrt(sxx * syy + 1e-20);
      if (r > best) best = r;
    }
    if (best > 0 && best < 1) hnrVals.push(10 * Math.log10(best / (1 - best)));
  }

  // 5) CPP (40 ms çerçeveler)
  const cppVals = [];
  const cw = Math.round(0.04 * sr);
  for (let tt = t0; tt + 0.04 < t1; tt += 0.01) {
    if (!f0At(tt + 0.02)) continue;
    const a0 = Math.floor(tt * sr);
    cppVals.push(cppOfFrame(x.subarray(a0, a0 + cw), sr).cpp);
  }

  // 6) MPT: en uzun kesintisiz sesli bölüm
  let longest = 0;
  let run = 0;
  let prevT = null;
  for (let i = 0; i < tr.times.length; i++) {
    if (tr.values[i] > 0) {
      run += prevT == null ? 0.01 : Math.min(0.03, tr.times[i] - prevT);
      prevT = tr.times[i];
      if (run > longest) longest = run;
    } else if (prevT != null && tr.times[i] - prevT > 0.08) { run = 0; prevT = null; }
  }

  const dur = t1 - t0;
  const r2 = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);
  return {
    ok: true,
    t0: r2(t0, 3),
    t1: r2(t1, 3),
    durationSec: r2(dur, 2),
    f0: {
      median: r2(medF0, 1),
      mean: r2(mean(voiced), 1),
      sd: r2(Math.sqrt(mean(voiced.map((v) => (v - mean(voiced)) ** 2))), 1),
      min: r2(sortedF0[0], 1),
      max: r2(sortedF0[sortedF0.length - 1], 1),
    },
    pulses: pulses.length,
    periods: P.length,
    meanPeriodMs: r2(meanP * 1000, 3),
    jitterLocal: r2(jitterLocal, 3),
    jitterAbsUs: r2(jitterAbsUs, 1),
    jitterRap: r2(rap, 3),
    jitterPpq5: r2(ppq5, 3),
    shimmerLocal: r2(shimmerLocal, 3),
    shimmerDb: r2(shimmerDb, 3),
    shimmerApq3: r2(apq(3), 3),
    shimmerApq5: r2(apq(5), 3),
    shimmerApq11: r2(apq(11), 3),
    hnr: r2(mean(hnrVals), 2),
    cpp: r2(mean(cppVals), 2),
    voiceBreaks: breaks,
    degreeOfBreaks: r2((breakTime / dur) * 100, 2),
    unvoicedFraction: r2((1 - voiced.length / Math.max(1, tr.values.length)) * 100, 1),
    mptSec: r2(longest, 2),
  };
}

/** s/z oranı: iki uzatılmış süre (saniye). > 1,4 larinks patolojisi açısından anlamlı kabul edilir (Eckel & Boone, 1981). */
export function szRatio(sSec, zSec) {
  if (!sSec || !zSec) return null;
  return Number((sSec / zSec).toFixed(2));
}

/** Kayıttaki en uzun kesintisiz ses (sürtünmeli dahil) süresi — /s/, /z/ uzatma için enerji tabanlı. */
export function longestSoundSec(acoustic) {
  if (!acoustic || !acoustic.speechSegments) return null;
  return Math.max(0, ...acoustic.speechSegments.map((s) => s.end - s.start));
}
