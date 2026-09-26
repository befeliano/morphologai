/**
 * Akıcılık ölçütleri: akustik çözümleme (konuşma/sessizlik bölütleri) ile
 * transkriptten gelen sözcük/hece sayılarını birleştirir.
 *
 *  Konuşma hızı (hece/sn)      = hece / konuşma aralığı süresi (ilk ses → son ses)
 *  Artikülasyon hızı (hece/sn) = hece / fonasyon süresi (duraksamalar hariç)
 *  Sözcük/dk                   = üretilen sözcük / konuşma aralığı (dk)
 *  Ortalama akış uzunluğu (MLR)= hece / konuşma akışı sayısı (duraksamalarla ayrılan bölüm)
 *  Duraksama                   = konuşma aralığı içindeki ≥ eşik (varsayılan 250 ms) sessizlik
 */
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));

export function computeFluency(acoustic, lang, settings = {}) {
  if (!acoustic || !acoustic.speechSpanSec) return null;
  const longMs = settings.longPauseMs || 2000;
  const span = acoustic.speechSpanSec;
  const speaking = acoustic.speakingTimeSec || span;
  const pauses = (acoustic.pauses || []).map((p) => p.dur);
  const words = lang ? lang.words.produced : 0;
  const syll = lang ? lang.words.syllables : 0;
  const minutes = span / 60;
  const sorted = [...pauses].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const bins = { short: 0, medium: 0, long: 0, veryLong: 0 };
  for (const d of pauses) {
    if (d < 1) bins.short++;
    else if (d < 2) bins.medium++;
    else if (d < 3) bins.long++;
    else bins.veryLong++;
  }
  const longPauses = pauses.filter((d) => d * 1000 >= longMs).length;
  const runs = acoustic.runs || acoustic.speechSegments?.length || 0;
  return {
    durationSec: round(acoustic.durationSec, 1),
    speechSpanSec: round(span, 1),
    speakingTimeSec: round(speaking, 1),
    pauseTimeSec: round(pauses.reduce((s, x) => s + x, 0), 1),
    pauseRatio: round(span ? 1 - speaking / span : 0, 3),
    pauseCount: pauses.length,
    pausesPerMin: round(minutes ? pauses.length / minutes : 0),
    meanPause: round(pauses.length ? pauses.reduce((s, x) => s + x, 0) / pauses.length : 0),
    medianPause: round(median),
    maxPause: round(pauses.length ? Math.max(...pauses) : 0),
    longPauseThresholdSec: longMs / 1000,
    longPauses,
    longPausesPerMin: round(minutes ? longPauses / minutes : 0),
    pauseBins: bins,
    wpm: round(minutes && words ? words / minutes : null, 1),
    sps: round(span && syll ? syll / span : null),
    articulationRate: round(speaking && syll ? syll / speaking : null),
    runs,
    mlrSyll: round(runs && syll ? syll / runs : null, 1),
    mlrWords: round(runs && words ? words / runs : null, 1),
    leadingSilenceSec: round(acoustic.leadingSilenceSec, 1),
  };
}
