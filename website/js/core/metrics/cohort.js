/**
 * Grup (kohort) analizi — demografik değişkenlere göre ölçüt karşılaştırması.
 *
 * Gizlilik: çıktıda kişi adı, danışan kodu ya da kimliği bulunmaz; yalnızca grup etiketleri
 * ("Kadın · 30–39", "Lise") ve özet istatistikler döner. Varsayılan olarak 3'ten az
 * danışanı olan gruplar gizlenir (küçük grup üzerinden kişinin tanınmasını önlemek için).
 *
 * Varsayılan olarak her danışanın seansları önce kendi içinde ortalanır; böylece çok seansı
 * olan danışan grubun ortalamasını tek başına belirlemez.
 */
import { computeFluency } from './fluency.js';

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
const NA = 'Belirtilmemiş';

// ---------------------------------------------------------------------------
// Demografik değişkenler
// ---------------------------------------------------------------------------
export function ageAt(patient, session) {
  if (!patient?.birthYear) return null;
  const y = new Date(session?.recordedAt || Date.now()).getFullYear();
  const age = y - Number(patient.birthYear);
  return age >= 0 && age < 120 ? age : null;
}

export function ageGroup(age) {
  if (age == null) return NA;
  if (age < 18) return '18 altı';
  if (age < 30) return '18–29';
  const lo = Math.min(70, Math.floor(age / 10) * 10);
  return lo >= 70 ? '70 ve üstü' : `${lo}–${lo + 9}`;
}

export function educationLevel(years) {
  if (years == null || years === '' || !Number.isFinite(Number(years))) return NA;
  const y = Number(years);
  if (y <= 5) return 'İlkokul';
  if (y <= 8) return 'Ortaokul';
  if (y <= 12) return 'Lise';
  if (y <= 16) return 'Üniversite';
  return 'Lisansüstü';
}

const SEX = { K: 'Kadın', E: 'Erkek', D: 'Diğer' };
const HAND = { 'sağ': 'Sağ elli', sol: 'Sol elli', iki: 'İki elli' };

/**
 * @param {object} lookups { diagnosis(id)->label, etiology(id)->label, group(id)->label, module(id)->label, task(id)->label }
 */
export function dimensions(lookups = {}) {
  const L = (fn, v) => (v ? fn?.(v) || v : NA);
  return [
    { id: 'ageGroup', label: 'Yaş grubu', get: (p, s) => ageGroup(ageAt(p, s)), order: ['18 altı', '18–29', '30–39', '40–49', '50–59', '60–69', '70 ve üstü', NA] },
    { id: 'sex', label: 'Cinsiyet', get: (p) => SEX[p?.sex] || NA, order: ['Kadın', 'Erkek', 'Diğer', NA] },
    { id: 'education', label: 'Eğitim düzeyi', get: (p) => educationLevel(p?.education), order: ['İlkokul', 'Ortaokul', 'Lise', 'Üniversite', 'Lisansüstü', NA] },
    { id: 'handedness', label: 'El tercihi', get: (p) => HAND[p?.handedness] || NA, order: ['Sağ elli', 'Sol elli', 'İki elli', NA] },
    { id: 'diagnosis', label: 'Tanı', get: (p) => L(lookups.diagnosis, p?.diagnosis) },
    { id: 'etiology', label: 'Etiyoloji', get: (p) => L(lookups.etiology, p?.etiology) },
    { id: 'group', label: 'Danışan / kontrol', get: (p) => L(lookups.group, p?.group || 'patient') },
    { id: 'module', label: 'Klinik modül', get: (p, s) => L(lookups.module, s?.module || 'aphasia') },
    { id: 'task', label: 'Görev türü', get: (p, s) => L(lookups.task, s?.taskType) },
  ];
}

// ---------------------------------------------------------------------------
// Ölçütler
// ---------------------------------------------------------------------------
/** Transkripti olmayan seanslarda da akustik akıcılık (duraksama, konuşma oranı) hesaplanır. */
export function sessionFluency(s) {
  return s?.analysis?.fluency || s?.fluency || (s?.acoustic ? computeFluency(s.acoustic, null, {}) : null);
}

export const METRIC_GROUPS = [
  { id: 'fluency', label: 'Akıcılık ve hız' },
  { id: 'voice', label: 'Ses frekansı (F0)' },
  { id: 'language', label: 'Dil' },
  { id: 'stutter', label: 'Kekemelik' },
  { id: 'phonation', label: 'Ses kalitesi' },
  { id: 'motor', label: 'Motor konuşma' },
];

export const COHORT_METRICS = [
  // Akıcılık (her ses kaydında; sözcük/hece ölçütleri transkript gerektirir)
  { id: 'wpm', group: 'fluency', label: 'Sözcük / dakika', unit: 'sözcük/dk', decimals: 0, get: (s) => sessionFluency(s)?.wpm },
  { id: 'sps', group: 'fluency', label: 'Konuşma hızı', unit: 'hece/sn', decimals: 2, get: (s) => sessionFluency(s)?.sps },
  { id: 'articulationRate', group: 'fluency', label: 'Artikülasyon hızı', unit: 'hece/sn', decimals: 2, get: (s) => sessionFluency(s)?.articulationRate },
  { id: 'pausesPerMin', group: 'fluency', label: 'Duraksama sıklığı', unit: '/dk', decimals: 1, get: (s) => sessionFluency(s)?.pausesPerMin },
  { id: 'meanPause', group: 'fluency', label: 'Ortalama duraksama süresi', unit: 'sn', decimals: 2, get: (s) => sessionFluency(s)?.meanPause },
  { id: 'longPausesPerMin', group: 'fluency', label: 'Uzun duraksama (≥ 2 sn)', unit: '/dk', decimals: 2, get: (s) => sessionFluency(s)?.longPausesPerMin },
  { id: 'speakingRatio', group: 'fluency', label: 'Konuşma oranı', unit: '%', decimals: 0, get: (s) => { const f = sessionFluency(s); return f && f.pauseRatio != null ? 100 * (1 - f.pauseRatio) : null; } },
  { id: 'mlrSyll', group: 'fluency', label: 'Ortalama akış uzunluğu', unit: 'hece', decimals: 1, get: (s) => sessionFluency(s)?.mlrSyll },
  // Ses frekansı (her ses kaydında)
  { id: 'f0Mean', group: 'voice', label: 'F0 ortalama', unit: 'Hz', decimals: 0, get: (s) => s?.acoustic?.f0?.mean },
  { id: 'f0Median', group: 'voice', label: 'F0 ortanca', unit: 'Hz', decimals: 0, get: (s) => s?.acoustic?.f0?.median },
  { id: 'f0RangeSt', group: 'voice', label: 'F0 aralığı', unit: 'yarım ton', decimals: 1, get: (s) => s?.acoustic?.f0?.rangeSt },
  { id: 'f0SdSt', group: 'voice', label: 'Tonlama değişkenliği (F0 SS)', unit: 'yarım ton', decimals: 2, get: (s) => s?.acoustic?.f0?.sdSt },
  // Dil
  { id: 'mluM', group: 'language', label: 'MLU-m', unit: 'biçimbirim', decimals: 2, get: (s) => s?.analysis?.language?.mluM },
  { id: 'mluW', group: 'language', label: 'MLU-w', unit: 'sözcük', decimals: 2, get: (s) => s?.analysis?.language?.mluW },
  { id: 'mattr', group: 'language', label: 'Sözcük çeşitliliği (MATTR)', unit: '', decimals: 3, get: (s) => s?.analysis?.language?.mattrForm ?? s?.analysis?.language?.ttrForm },
  { id: 'finitePerUtt', group: 'language', label: 'Sözce başına çekimli fiil', unit: '', decimals: 2, get: (s) => s?.analysis?.language?.verbs?.finitePerUtterance },
  { id: 'nounVerb', group: 'language', label: 'İsim / fiil oranı', unit: '', decimals: 2, get: (s) => s?.analysis?.language?.nounVerbRatio },
  { id: 'errRate', group: 'language', label: 'Parafazi', unit: '/100 sözcük', decimals: 1, get: (s) => s?.analysis?.language?.errors?.rate },
  { id: 'fillerRate', group: 'language', label: 'Dolgu ve söylem belirleyici', unit: '/100 sözcük', decimals: 1, get: (s) => s?.analysis?.language?.disfluency?.fillerRate },
  { id: 'emptyRate', group: 'language', label: 'Boş sözcük (şey, o…)', unit: '/100 sözcük', decimals: 1, get: (s) => s?.analysis?.language?.lexical?.emptyRate },
  { id: 'screen', group: 'language', label: 'Afazi tarama göstergesi', unit: '/100', decimals: 0, get: (s) => (s?.analysis?.screening?.available ? s.analysis.screening.overall : null) },
  // Kekemelik
  { id: 'pss', group: 'stutter', label: '%SS (takılmalı hece)', unit: '%', decimals: 1, get: (s) => s?.analysis?.stuttering?.percentSS },
  { id: 'sld', group: 'stutter', label: 'Kekemelik benzeri takılma', unit: '/100 hece', decimals: 1, get: (s) => s?.analysis?.stuttering?.sldPer100 },
  // Ses kalitesi (ses modülü)
  { id: 'hnr', group: 'phonation', label: 'HNR', unit: 'dB', decimals: 1, get: (s) => (s?.voice?.ok ? s.voice.hnr : null) },
  { id: 'jitter', group: 'phonation', label: 'Jitter (local)', unit: '%', decimals: 2, get: (s) => (s?.voice?.ok ? s.voice.jitterLocal : null) },
  { id: 'shimmer', group: 'phonation', label: 'Shimmer (local)', unit: '%', decimals: 2, get: (s) => (s?.voice?.ok ? s.voice.shimmerLocal : null) },
  { id: 'cpp', group: 'phonation', label: 'CPP', unit: 'dB', decimals: 1, get: (s) => (s?.voice?.ok ? s.voice.cpp : null) },
  { id: 'mpt', group: 'phonation', label: 'Maksimum fonasyon süresi', unit: 'sn', decimals: 1, get: (s) => s?.voice?.mptSec ?? s?.mpt ?? null },
  // Motor konuşma
  { id: 'ddk', group: 'motor', label: 'DDK hızı', unit: 'hece/sn', decimals: 2, get: (s) => (s?.ddk?.ok ? s.ddk.rate : null) },
  { id: 'ddkCv', group: 'motor', label: 'DDK düzensizliği (CV)', unit: '%', decimals: 1, get: (s) => (s?.ddk?.ok ? s.ddk.cv : null) },
];

export const metricById = (id) => COHORT_METRICS.find((m) => m.id === id);

// ---------------------------------------------------------------------------
// İstatistik
// ---------------------------------------------------------------------------
export function stats(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { n: 0, mean: null, sd: null, median: null, min: null, max: null };
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : null;
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  return { n, mean, sd, median, min: v[0], max: v[n - 1] };
}

/** Pearson r ve doğrusal eğilim (en küçük kareler). */
export function linearFit(points) {
  const p = points.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
  const n = p.length;
  if (n < 3) return null;
  const mx = p.reduce((s, q) => s + q.x, 0) / n;
  const my = p.reduce((s, q) => s + q.y, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const q of p) { sxy += (q.x - mx) * (q.y - my); sxx += (q.x - mx) ** 2; syy += (q.y - my) ** 2; }
  if (!sxx || !syy) return null;
  const slope = sxy / sxx;
  return { n, slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy) };
}

// ---------------------------------------------------------------------------
// Toplama
// ---------------------------------------------------------------------------
/**
 * Seansları (danışan bilgisiyle) satırlara çevirir.
 * @returns {Array<{pid, date, age, keys:{dimId:label}, values:{metricId:number}}>}
 */
export function buildRows(sessions, patientsById, dims) {
  const rows = [];
  for (const s of sessions) {
    const p = patientsById.get(s.patientId);
    if (!p) continue;
    const keys = {};
    for (const d of dims) keys[d.id] = d.get(p, s);
    const values = {};
    for (const m of COHORT_METRICS) {
      const v = m.get(s);
      if (v != null && Number.isFinite(Number(v))) values[m.id] = Number(v);
    }
    rows.push({ pid: p.id, date: new Date(s.recordedAt || s.createdAt), age: ageAt(p, s), keys, values });
  }
  return rows;
}

const groupKey = (row, dimA, dimB) => (dimB ? `${row.keys[dimA]} · ${row.keys[dimB]}` : row.keys[dimA]);

/** Grup sırası: değişkenin doğal sırası, sonra alfabetik; "Belirtilmemiş" en sonda. */
export function orderGroups(labels, dimA, dimB, dims) {
  const oa = dims.find((d) => d.id === dimA)?.order || [];
  const ob = dimB ? dims.find((d) => d.id === dimB)?.order || [] : [];
  const rank = (order, v) => { const i = order.indexOf(v); return i === -1 ? (v === NA ? 999 : 500) : i; };
  return [...labels].sort((x, y) => {
    const [xa, xb = ''] = x.split(' · ');
    const [ya, yb = ''] = y.split(' · ');
    return rank(oa, xa) - rank(oa, ya) || xa.localeCompare(ya, 'tr') || rank(ob, xb) - rank(ob, yb) || xb.localeCompare(yb, 'tr');
  });
}

/**
 * Gruplara göre ölçüt özetleri.
 * @returns {{groups: Array<{label, patients, sessions, metrics:{id: stats}}>, hidden: number}}
 */
export function aggregate(rows, { dimA, dimB = null, perPatient = true, minN = 3, dims = [] } = {}) {
  const byGroup = new Map();
  for (const r of rows) {
    const g = groupKey(r, dimA, dimB);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(r);
  }
  const groups = [];
  let hidden = 0;
  for (const label of orderGroups([...byGroup.keys()], dimA, dimB, dims)) {
    const list = byGroup.get(label);
    const patients = new Set(list.map((r) => r.pid));
    if (patients.size < minN) { hidden++; continue; }
    const metrics = {};
    for (const m of COHORT_METRICS) {
      let vals;
      if (perPatient) {
        const per = new Map();
        for (const r of list) {
          if (r.values[m.id] == null) continue;
          if (!per.has(r.pid)) per.set(r.pid, []);
          per.get(r.pid).push(r.values[m.id]);
        }
        vals = [...per.values()].map((a) => a.reduce((s, x) => s + x, 0) / a.length);
      } else {
        vals = list.map((r) => r.values[m.id]);
      }
      metrics[m.id] = stats(vals);
    }
    groups.push({ label, patients: patients.size, sessions: list.length, metrics });
  }
  return { groups, hidden };
}

/** Aylık eğilim: her grup için ay başına ortalama (en çok danışanı olan ilk `maxSeries` grup). */
export function monthlyTrend(rows, metricId, { dimA, dimB = null, maxSeries = 5, minN = 3 } = {}) {
  const byGroup = new Map();
  for (const r of rows) {
    if (r.values[metricId] == null) continue;
    const g = groupKey(r, dimA, dimB);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(r);
  }
  const eligible = [...byGroup.entries()].filter(([, list]) => new Set(list.map((r) => r.pid)).size >= minN)
    .sort((a, b) => new Set(b[1].map((r) => r.pid)).size - new Set(a[1].map((r) => r.pid)).size)
    .slice(0, maxSeries);
  return eligible.map(([label, list]) => {
    const byMonth = new Map();
    for (const r of list) {
      const k = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(r.values[metricId]);
    }
    const points = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => {
      const [y, mo] = k.split('-').map(Number);
      return { x: new Date(y, mo - 1, 15), y: round(v.reduce((s, x) => s + x, 0) / v.length, 3), n: v.length };
    });
    return { label, points };
  });
}

/** Yaş–ölçüt saçılımı (danışan başına ortalama; kimlik bilgisi yok). */
export function ageScatter(rows, metricId) {
  const per = new Map();
  for (const r of rows) {
    if (r.age == null || r.values[metricId] == null) continue;
    if (!per.has(r.pid)) per.set(r.pid, { ages: [], vals: [] });
    const e = per.get(r.pid);
    e.ages.push(r.age);
    e.vals.push(r.values[metricId]);
  }
  const pts = [...per.values()].map((e) => ({ x: Math.round(e.ages.reduce((s, x) => s + x, 0) / e.ages.length), y: e.vals.reduce((s, x) => s + x, 0) / e.vals.length }));
  // Kimliği gizlemek için sıralamayı karıştır (giriş sırası danışan sırasını yansıtmasın)
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  return pts;
}

/** İki değişkenin çapraz sayımı (danışan sayısı). */
export function crossCounts(rows, dimA, dimB) {
  const seen = new Set();
  const table = new Map();
  for (const r of rows) {
    const k = `${r.pid}|${r.keys[dimA]}|${r.keys[dimB]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const a = r.keys[dimA];
    const b = r.keys[dimB];
    if (!table.has(a)) table.set(a, new Map());
    table.get(a).set(b, (table.get(a).get(b) || 0) + 1);
  }
  return table;
}
