/**
 * Afazi Tarama Göstergesi (deneysel, açıklanabilir)
 * =================================================
 *
 * Bu modül bir TANI ARACI DEĞİLDİR. Bağlamlı konuşma örneğinden çıkarılan
 * ölçütleri referans değerlerle karşılaştırarak afazide bozulan dört alanda
 * sapma derecesini ve genel bir "afazi ile uyumlu örüntü" göstergesi üretir:
 *
 *   Akıcılık        : konuşma hızı, akış uzunluğu, uzun duraksamalar, duraksama oranı
 *   Dilbilgisi      : MLU-m / MLU-w, sözce başına çekimli fiil, yüklemli sözce oranı,
 *                     sözcük başına biçimbirim, isim/fiil oranı (yüksek)
 *   Sözcük erişimi  : dolgu, boş sözcük ("şey"), kelime bulma yorumları, zamir/isim oranı,
 *                     sözcük çeşitliliği (MATTR), isim/fiil oranı (düşük)
 *   Parafazi/içerik : kodlanmış parafaziler, sözlükte olmayan sözcükler (olası neolojizm),
 *                     fonolojik aday sözcükler, tekrar/sebat
 *
 * Her ölçüt için z = (değer − ort) / SS, yalnızca bozulma yönünde; z → 0–1 şiddet.
 * Referanslar: varsayılan değerler yaklaşık yetişkin söylem değerleridir ve Türkçe için
 * standartlaştırılmamıştır. Ekip, "Kontrol grubu" olarak işaretlenen danışanların
 * seanslarıyla kendi normlarını oluşturabilir (aynı görev türü, en az 5 seans).
 */

export const DEFAULT_NORMS = {
  sps:                    { mean: 3.5,  sd: 0.8,  dir: 'low',  label: 'Konuşma hızı', unit: 'hece/sn' },
  articulationRate:       { mean: 5.0,  sd: 0.8,  dir: 'low',  label: 'Artikülasyon hızı', unit: 'hece/sn' },
  mlrSyll:                { mean: 9,    sd: 3.5,  dir: 'low',  label: 'Ortalama akış uzunluğu', unit: 'hece' },
  longPausesPerMin:       { mean: 1.0,  sd: 1.0,  dir: 'high', label: 'Uzun duraksama (≥2 sn)', unit: '/dk' },
  pauseRatio:             { mean: 0.25, sd: 0.10, dir: 'high', label: 'Duraksama oranı', unit: '' , pct: true },
  wpm:                    { mean: 105,  sd: 28,   dir: 'low',  label: 'Sözcük/dakika', unit: 'sözcük/dk' },
  mluM:                   { mean: 10.5, sd: 3.0,  dir: 'low',  label: 'MLU-m', unit: 'biçimbirim' },
  mluW:                   { mean: 5.5,  sd: 1.7,  dir: 'low',  label: 'MLU-w', unit: 'sözcük' },
  finitePerUtterance:     { mean: 1.1,  sd: 0.35, dir: 'low',  label: 'Sözce başına çekimli fiil', unit: '' },
  utterancesWithPredicate:{ mean: 0.9,  sd: 0.1,  dir: 'low',  label: 'Yüklemli sözce oranı', unit: '', pct: true },
  morphemesPerWord:       { mean: 1.9,  sd: 0.25, dir: 'low',  label: 'Sözcük başına biçimbirim', unit: '' },
  nounVerbRatioHigh:      { mean: 1.4,  sd: 0.5,  dir: 'high', label: 'İsim/fiil oranı (yüksek)', unit: '' },
  nounVerbRatioLow:       { mean: 1.4,  sd: 0.5,  dir: 'low',  label: 'İsim/fiil oranı (düşük)', unit: '' },
  mattrForm:              { mean: 0.74, sd: 0.06, dir: 'low',  label: 'Sözcük çeşitliliği (MATTR)', unit: '' },
  fillerRate:             { mean: 4,    sd: 3,    dir: 'high', label: 'Dolgu oranı', unit: '/100 sözcük' },
  emptyRate:              { mean: 1,    sd: 1.2,  dir: 'high', label: 'Boş sözcük oranı', unit: '/100 sözcük' },
  wordFindingPerMin:      { mean: 0.1,  sd: 0.3,  dir: 'high', label: 'Kelime bulma yorumu', unit: '/dk' },
  pronounNounRatio:       { mean: 0.35, sd: 0.2,  dir: 'high', label: 'Zamir/isim oranı', unit: '' },
  errorRate:              { mean: 0.3,  sd: 0.6,  dir: 'high', label: 'Kodlanmış parafazi', unit: '/100 sözcük' },
  unknownRate:            { mean: 0.8,  sd: 1.0,  dir: 'high', label: 'Sözlük dışı sözcük', unit: '/100 sözcük' },
  phonCandRate:           { mean: 0.5,  sd: 0.8,  dir: 'high', label: 'Fonolojik aday sözcük', unit: '/100 sözcük' },
  repetitionRate:         { mean: 2,    sd: 2,    dir: 'high', label: 'Tekrar/düzeltme', unit: '/100 sözcük' },
};

const DOMAINS = {
  fluency: {
    label: 'Akıcılık',
    features: { sps: 2, mlrSyll: 1.5, longPausesPerMin: 1.5, articulationRate: 0.8, pauseRatio: 1, wpm: 0.7 },
  },
  grammar: {
    label: 'Dilbilgisi',
    features: { mluM: 2, mluW: 1, finitePerUtterance: 1.5, utterancesWithPredicate: 1.5, morphemesPerWord: 1, nounVerbRatioHigh: 1 },
  },
  lexical: {
    label: 'Sözcük erişimi',
    features: { fillerRate: 1, emptyRate: 1.5, wordFindingPerMin: 1.5, pronounNounRatio: 1, mattrForm: 1, nounVerbRatioLow: 0.8 },
  },
  paraphasia: {
    label: 'Parafazi / içerik',
    features: { errorRate: 2, unknownRate: 1.5, phonCandRate: 1, repetitionRate: 1 },
  },
};

/** Bir analiz sonucundan tarama ölçütlerini düz nesne olarak çıkarır. */
export function extractFeatures(result) {
  const L = result.language || {};
  const F = result.fluency || {};
  const minutes = F.speechSpanSec ? F.speechSpanSec / 60
    : result.durationSec ? result.durationSec / 60
      : L.timing && L.timing.spanSec ? L.timing.spanSec / 60 : null;
  const words = L.words ? L.words.produced : 0;
  const per100 = (x) => (words ? (100 * x) / words : null);
  return {
    sps: F.sps ?? null,
    articulationRate: F.articulationRate ?? null,
    mlrSyll: F.mlrSyll ?? null,
    longPausesPerMin: F.longPausesPerMin ?? null,
    pauseRatio: F.pauseRatio ?? null,
    wpm: F.wpm ?? null,
    mluM: L.mluM ?? null,
    mluW: L.mluW ?? null,
    finitePerUtterance: L.verbs ? L.verbs.finitePerUtterance : null,
    utterancesWithPredicate: L.verbs ? L.verbs.utterancesWithPredicate : null,
    morphemesPerWord: L.morphemesPerWord ?? null,
    nounVerbRatioHigh: L.nounVerbRatio ?? null,
    nounVerbRatioLow: L.nounVerbRatio ?? null,
    mattrForm: L.mattrForm ?? null,
    fillerRate: L.disfluency ? L.disfluency.fillerRate : null,
    emptyRate: L.lexical ? L.lexical.emptyRate : null,
    wordFindingPerMin: L.lexical && minutes ? L.lexical.wordFindingComments / minutes : null,
    pronounNounRatio: L.pronounNounRatio ?? null,
    errorRate: L.errors ? L.errors.rate : null,
    unknownRate: L.errors ? L.errors.unknownRate : null,
    phonCandRate: L.errors ? per100(L.errors.phonologicalCandidates.length) : null,
    repetitionRate: L.disfluency ? L.disfluency.repetitionRate : null,
  };
}

const logistic = (x) => 1 / (1 + Math.exp(-x));
const BASE = logistic(-1.5 * 2.3);
/** z (bozulma yönünde) → 0..1 şiddet. z=1 → ~0,10; z=2 → ~0,37; z=3 → ~0,73; z=4 → ~0,93 */
function severity(z) {
  if (z <= 0) return 0;
  return Math.max(0, (logistic(1.5 * (z - 2.3)) - BASE) / (1 - BASE));
}

/**
 * Takım kontrol grubundan norm hesaplar.
 * @param {Array} results kontrol grubu seanslarının analiz sonuçları
 */
export function normsFromControls(results) {
  if (!results || results.length < 5) return null;
  const out = {};
  const feats = results.map(extractFeatures);
  for (const key of Object.keys(DEFAULT_NORMS)) {
    const vals = feats.map((f) => f[key]).filter((v) => v != null && Number.isFinite(v));
    if (vals.length < 5) continue;
    const m = vals.reduce((s, x) => s + x, 0) / vals.length;
    const s = Math.sqrt(vals.reduce((a, x) => a + (x - m) ** 2, 0) / (vals.length - 1));
    out[key] = { ...DEFAULT_NORMS[key], mean: m, sd: Math.max(s, DEFAULT_NORMS[key].sd * 0.25), n: vals.length };
  }
  return out;
}

export const BANDS = [
  { max: 20, key: 'typical', label: 'Tipik sınırlarda', tone: 'ok' },
  { max: 40, key: 'borderline', label: 'Sınırda — izlem önerilir', tone: 'info' },
  { max: 65, key: 'consistent', label: 'Afazi ile uyumlu bulgular', tone: 'warn' },
  { max: 101, key: 'marked', label: 'Belirgin afazik örüntü', tone: 'danger' },
];

export const PATTERNS = {
  typical: { label: 'Belirgin sapma yok', description: 'Ölçütler referans aralığına yakın.' },
  nonfluent: {
    label: 'Akıcı olmayan, agramatik örüntü',
    description: 'Yavaş, emek harcanan, kısa sözcelerle konuşma ve fiil çekiminde azalma. Broca tipi (akıcı olmayan) afazi ile uyumlu olabilir.',
  },
  fluentParaphasic: {
    label: 'Akıcı, parafazili örüntü',
    description: 'Hız ve akış korunmuşken sözcük hataları / sözlük dışı sözcükler belirgin. Wernicke tipi (akıcı) afazi ile uyumlu olabilir; anlama testleriyle doğrulanmalıdır.',
  },
  anomic: {
    label: 'Adlandırma güçlüğü (anomik) örüntü',
    description: 'Akıcılık ve dilbilgisi görece korunmuş; boş sözcük, dolgu ve kelime bulma yorumları artmış. Anomik afazi ile uyumlu olabilir.',
  },
  reducedFluency: {
    label: 'Akıcılıkta azalma',
    description: 'Duraksama ve yavaşlama belirgin, dilbilgisi görece korunmuş. Motor konuşma bozukluğu (apraksi/dizartri) ya da hafif akıcı olmayan afazi açısından değerlendirilmelidir.',
  },
  global: {
    label: 'Ağır / yaygın bozulma',
    description: 'Konuşma üretimi çok sınırlı ve tüm alanlarda belirgin sapma. Global afazi ile uyumlu olabilir.',
  },
  mixed: { label: 'Karma / belirsiz örüntü', description: 'Birden çok alanda sapma var; belirgin bir tip örüntüsü seçilemedi.' },
};

/**
 * @param {object} result analiz sonucu ({language, fluency, durationSec})
 * @param {object} [norms] kontrol grubu normları (yoksa varsayılanlar)
 */
export function computeScreening(result, norms = null) {
  const L = result.language;
  const F = result.fluency;
  const words = L ? L.words.produced : 0;
  const utts = L ? L.utterances.included : 0;
  const dur = F ? F.speechSpanSec : null;
  const adequacy = words >= 150 && utts >= 10 ? 'yeterli' : words >= 50 && utts >= 5 ? 'sınırlı' : 'yetersiz';
  if (!L || words < 15) {
    return {
      available: false,
      reason: 'Tarama için en az 15 sözcüklük bir konuşma örneği gerekir.',
      adequacy: { words, utterances: utts, durationSec: dur, level: 'yetersiz' },
    };
  }
  const N = { ...DEFAULT_NORMS, ...(norms || {}) };
  const f = extractFeatures(result);
  const features = [];
  const domains = {};
  for (const [dk, def] of Object.entries(DOMAINS)) {
    let wsum = 0;
    let ssum = 0;
    const list = [];
    for (const [key, w] of Object.entries(def.features)) {
      const v = f[key];
      const n = N[key];
      if (v == null || !Number.isFinite(v) || !n) continue;
      let z = n.dir === 'low' ? (n.mean - v) / n.sd : (v - n.mean) / n.sd;
      z = Math.max(0, z);
      const sev = severity(z);
      wsum += w;
      ssum += w * sev;
      const feat = { key, domain: dk, label: n.label, value: v, unit: n.unit, pct: !!n.pct, ref: { mean: n.mean, sd: n.sd, n: n.n || null }, dir: n.dir, z: Number(z.toFixed(2)), severity: Number(sev.toFixed(3)), weight: w };
      list.push(feat);
      features.push(feat);
    }
    domains[dk] = {
      label: def.label,
      score: wsum ? Math.round((100 * ssum) / wsum) : null,
      available: wsum > 0,
      features: list.sort((a, b) => b.severity - a.severity),
    };
  }
  const avail = Object.values(domains).filter((d) => d.available);
  const scores = avail.map((d) => d.score).sort((a, b) => b - a);
  const maxD = scores.length ? scores[0] : 0;
  // En çok etkilenen alan belirleyicidir; diğer alanlardaki sapmalar dörtte bir ağırlıkla eklenir
  let overall = Math.round(Math.min(100, maxD + 0.25 * scores.slice(1).reduce((s, x) => s + x, 0)));
  // Çok sınırlı üretim (dakikada 25 sözcükten az) tek başına belirgin bir işarettir
  if (F && F.wpm != null && F.wpm < 25) overall = Math.max(overall, 60);
  const band = BANDS.find((b) => overall < b.max);

  const d = (k) => (domains[k].available ? domains[k].score : 0);
  let pattern = 'mixed';
  const flu = domains.fluency.available ? d('fluency') : null;
  if (overall < 20) pattern = 'typical';
  else if ((flu == null || flu >= 55) && d('grammar') >= 55 && d('lexical') >= 50 && (F ? F.wpm < 35 : utts < 8)) pattern = 'global';
  else if (flu != null && flu >= 45 && d('grammar') >= 40) pattern = 'nonfluent';
  else if ((flu == null || flu < 40) && d('paraphasia') >= 45) pattern = 'fluentParaphasic';
  else if ((flu == null || flu < 45) && d('lexical') >= 40 && d('grammar') < 45 && d('paraphasia') < 45) pattern = 'anomic';
  else if (flu != null && flu >= 45 && d('grammar') < 40) pattern = 'reducedFluency';
  else if (flu == null && d('grammar') >= 50) pattern = 'nonfluent';

  const top = [...features].filter((x) => x.severity >= 0.2).sort((a, b) => b.severity * b.weight - a.severity * a.weight).slice(0, 6);
  const confidence = adequacy === 'yeterli' && avail.length === 4 ? 'orta' : 'düşük';

  return {
    available: true,
    version: 'screen-1.0',
    overall,
    band,
    pattern: { key: pattern, ...PATTERNS[pattern] },
    domains,
    features,
    topFindings: top,
    adequacy: { words, utterances: utts, durationSec: dur, level: adequacy },
    confidence,
    normsSource: norms && Object.keys(norms).length ? 'ekip kontrol grubu' : 'varsayılan referanslar',
    missingAcoustic: !F,
    disclaimer: 'Bu gösterge tanı koymaz; standart afazi testlerinin (ör. ADD, GAT, BDAE) yerine geçmez. '
      + 'Varsayılan referans değerler yaklaşık olup Türkçe için standartlaştırılmamıştır. Klinik karar, uzman değerlendirmesine dayanmalıdır.',
  };
}
