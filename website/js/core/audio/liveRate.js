/**
 * Canlı konuşma hızı kestirimi (hece/sn) — kayıt sırasında, transkript beklemeden.
 *
 * Yöntem: ses düzeyi (dBFS) dizisinde hece çekirdekleri yerel tepe olarak aranır.
 *  - tepe, iki yanındaki en düşük değerden en az `prominence` dB yüksek olmalı
 *  - ardışık tepeler arasında en az `minGapSec` olmalı (Türkçede hece ≈ 120–300 ms)
 *  - yalnız konuşma düzeyindeki (gürültü tabanının `floorMargin` dB üstü) tepeler sayılır
 * Hız = son `windowSec` saniyedeki tepe sayısı / pencere içindeki konuşma süresi (duraksamalar hariç tutulmaz
 * seçeneğiyle: "konuşma hızı"; hariç tutulursa "artikülasyon hızı").
 * Düzey dizisi 50 ms adımlı olduğundan çok hızlı konuşmada heceler birleşir ve hız olduğundan düşük çıkar;
 * değer bir kestirimdir, kesin hız kayıttan sonra transkriptteki hece sayısından hesaplanır.
 */
export class LiveSyllableRate {
  constructor({ prominence = 3, minGapSec = 0.1, floorMargin = 8, keepSec = 30 } = {}) {
    this.o = { prominence, minGapSec, floorMargin, keepSec };
    this.t = 0;
    this.samples = []; // {t, db}
    this.peaks = [];   // tepe zamanları
    this.floor = -60;
    this._lastMin = Infinity;
    this._cand = null; // {t, db} yükselen aday tepe
  }

  /** @param {number} db düzey (dBFS)  @param {number} dt adım süresi (sn) */
  push(db, dt = 0.05) {
    this.t += dt;
    const { prominence, minGapSec, floorMargin, keepSec } = this.o;
    this.samples.push({ t: this.t, db });
    // Gürültü tabanı: yavaşça alçak değerlere yaklaşır
    this.floor = db < this.floor ? db * 0.3 + this.floor * 0.7 : this.floor * 0.995 + db * 0.005;
    const c = this._cand;
    if (!c || db > c.db) {
      // Yükseliyor: yeni aday (önceki çukurdan yeterince yüksekse)
      if (db - this._lastMin >= prominence && db > this.floor + floorMargin) this._cand = { t: this.t, db };
      else if (!c) this._lastMin = Math.min(this._lastMin, db);
    } else if (c.db - db >= prominence) {
      // Adaydan yeterince düştü: aday bir tepedir
      const last = this.peaks[this.peaks.length - 1];
      if (last == null || c.t - last >= minGapSec) this.peaks.push(c.t);
      this._cand = null;
      this._lastMin = db;
    }
    if (!this._cand) this._lastMin = Math.min(this._lastMin, db);
    while (this.samples.length && this.samples[0].t < this.t - keepSec) this.samples.shift();
    while (this.peaks.length && this.peaks[0] < this.t - keepSec) this.peaks.shift();
  }

  /** Son `windowSec` saniyenin hızı (hece/sn); yeterli veri yoksa null. */
  rate(windowSec = 5) {
    const from = this.t - windowSec;
    if (this.t < Math.min(windowSec, 2)) return null;
    const n = this.peaks.filter((p) => p >= from).length;
    const span = Math.min(windowSec, this.t);
    return n / span;
  }

  get total() { return this.peaks.length; }
}

/** Yaş grubu ve konuşma türüne göre hız bantları (hece/sn). Değerler yaklaşık klinik aralıklardır; ayarlardan değiştirilebilir. */
export const RATE_BANDS = {
  child: { speech: [2.5, 4.5], reading: [2.5, 4.5], label: 'Çocuk' },
  adult: { speech: [3.5, 5.5], reading: [4.0, 6.0], label: 'Genç / yetişkin' },
  older: { speech: [3.0, 5.0], reading: [3.5, 5.5], label: 'Yaşlı' },
};
export function rateBand(rate, group = 'adult', kind = 'speech') {
  if (rate == null) return null;
  const [lo, hi] = (RATE_BANDS[group] || RATE_BANDS.adult)[kind] || RATE_BANDS.adult.speech;
  return rate < lo ? 'slow' : rate > hi ? 'fast' : 'normal';
}
