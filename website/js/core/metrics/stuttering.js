/**
 * Akıcılık / kekemelik ölçütleri (transkript kodlamasından)
 * ========================================================
 * Yairi & Ambrose (1999) sınıflaması:
 *  Kekemeliğe özgü takılmalar (SLD):
 *    PWR  parça sözcük tekrarı        "b-b-bebek", [pwr]
 *    MWR  tek heceli sözcük tekrarı   "ben ben ben", "ben [/] ben"
 *    DP   ritim bozukluğu: uzatma ("s:u", "sssu", [pro]) ve blok ([blk])
 *  Diğer akıcısızlıklar (OD): dolgu (ııı, şey), düzeltme [//], çok heceli sözcük tekrarı,
 *    öbek tekrarı <...> [/], yarım bırakılan sözcük
 *
 *  %SS (takılmalı hece yüzdesi)   = SLD olay sayısı / toplam hece × 100
 *  SLD/100 hece, OD/100 hece
 *  Ağırlıklı SLD = (PWR + MWR) × ortalama tekrar birimi + 2 × DP
 *  Ölçüt: ≥ 3 SLD / 100 hece kekemelik ile uyumlu sıklık olarak kabul edilir.
 */
import { syllableCount } from '../text/normalize.js';

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));

export function computeStuttering(utterances) {
  const part = utterances.filter((u) => u.speaker !== 'examiner');
  const events = [];
  let syllables = 0;
  for (const u of part) {
    const toks = u.tokens;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.kind === 'word' && !t.excluded) syllables += syllableCount(t.text);
      if (t.kind === 'word' && t.stutter) {
        const type = t.stutter.type;
        if (type === 'PWR') events.push({ u: u.index, word: t.text, type: 'PWR', cls: 'SLD', units: t.stutter.units || 1 });
        else if (type === 'PRO') events.push({ u: u.index, word: t.text, type: 'PRO', cls: 'SLD', units: 1 });
        else if (type === 'BLK') events.push({ u: u.index, word: t.text, type: 'BLK', cls: 'SLD', units: 1 });
        else if (type === 'WWR') events.push({ u: u.index, word: t.text, type: syllableCount(t.text) <= 1 ? 'MWR' : 'MSWR', cls: syllableCount(t.text) <= 1 ? 'SLD' : 'OD', units: t.stutter.units || 1 });
      }
      if (t.kind === 'word' && (t.reason === 'repetition' || t.reason === 'auto-repetition')) {
        // Aynı öbeğin ardışık tekrarlarını tek olayda topla
        const n = t.repN || 1;
        const prev = events[events.length - 1];
        const key = `${u.index}:${t.norm}:${n}`;
        if (prev && prev.key === key) { prev.units++; continue; }
        if (n > 1) {
          events.push({ u: u.index, word: t.text, type: 'PR', cls: 'OD', units: 1, key });
          i += n - 1;
        } else {
          const mono = syllableCount(t.text) <= 1;
          events.push({ u: u.index, word: t.text, type: mono ? 'MWR' : 'MSWR', cls: mono ? 'SLD' : 'OD', units: 1, key });
        }
      } else if (t.reason === 'retrace') {
        events.push({ u: u.index, word: t.text, type: 'REV', cls: 'OD', units: 1 });
      } else if (t.kind === 'filler') {
        events.push({ u: u.index, word: t.text, type: 'INT', cls: 'OD', units: 1 });
      } else if (t.kind === 'fragment') {
        const next = toks.slice(i + 1).find((x) => x.kind === 'word');
        const isPwr = next && t.norm && next.norm.startsWith(t.norm);
        events.push({ u: u.index, word: t.text, type: isPwr ? 'PWR' : 'ABN', cls: isPwr ? 'SLD' : 'OD', units: 1 });
      }
    }
  }
  const count = (type) => events.filter((e) => e.type === type).length;
  const sld = events.filter((e) => e.cls === 'SLD');
  const od = events.filter((e) => e.cls === 'OD');
  const reps = events.filter((e) => e.type === 'PWR' || e.type === 'MWR');
  const ru = reps.length ? reps.reduce((s, e) => s + e.units, 0) / reps.length : 0;
  const dp = count('PRO') + count('BLK');
  const per100 = (n) => (syllables ? (100 * n) / syllables : 0);
  const pss = per100(sld.length);
  const band = pss < 3 ? { key: 'typical', label: 'Tipik aralık (<%3)', tone: 'ok' }
    : pss < 5 ? { key: 'mild', label: 'Hafif (%3–5)', tone: 'info' }
      : pss < 10 ? { key: 'moderate', label: 'Orta (%5–10)', tone: 'warn' }
        : { key: 'marked', label: 'Belirgin (≥%10)', tone: 'danger' };
  return {
    syllables,
    events,
    counts: {
      PWR: count('PWR'), MWR: count('MWR'), PRO: count('PRO'), BLK: count('BLK'),
      INT: count('INT'), REV: count('REV'), MSWR: count('MSWR'), PR: count('PR'), ABN: count('ABN'),
    },
    sld: sld.length,
    od: od.length,
    percentSS: round(pss),
    sldPer100: round(per100(sld.length)),
    odPer100: round(per100(od.length)),
    totalPer100: round(per100(events.length)),
    sldRatio: round(events.length ? sld.length / events.length : 0, 3),
    meanRepetitionUnits: round(ru),
    weightedSld: round((count('PWR') + count('MWR')) * ru + 2 * dp),
    meetsCriterion: per100(sld.length) >= 3,
    band,
  };
}

export const STUTTER_LABELS = {
  PWR: 'Parça sözcük tekrarı', MWR: 'Tek heceli sözcük tekrarı', PRO: 'Uzatma', BLK: 'Blok',
  INT: 'Dolgu (araya girme)', REV: 'Düzeltme', MSWR: 'Çok heceli sözcük tekrarı', PR: 'Öbek tekrarı', ABN: 'Yarım bırakılan sözcük',
};
