/**
 * Öngörü modeli — kaza resmi anlatımından 1 yıllık bilişsel-dilsel gerileme riski.
 *
 * Program (yapay zekâ) değerlendirmesi üç adımdır ve tamamen açıklanabilirdir:
 *  1. Her ölçüt referans değerle karşılaştırılır: z = bozulma yönündeki sapma / SS (0'ın altı 0 sayılır).
 *  2. Klinik formdaki 8 madde için 0–3 puan: ilgili ölçütlerin en yüksek iki z'sinin ortalaması
 *     (z < 1 → 0, < 2 → 1, < 3 → 2, ≥ 3 → 3). DKT formuyla aynı maddeler — uyum doğrudan ölçülür.
 *  3. Risk: bileşik şiddet (maddelerin ağırlıklı ortalama z'si) + yaş + eğitim → lojistik fonksiyon.
 *     Varsayılan katsayılar literatüre dayalı önsel değerlerdir (kalibre edilmemiştir). Ekipte yeterli
 *     izlem sonucu birikince model ekibin verisiyle yeniden eğitilir (bkz. fitTeamModel).
 * Referans değerler Türkçe için standartlaştırılmamış yaklaşık değerlerdir; ekibin kontrol grubu
 * örneklemleri (≥ 5) varsa onların ortalama ve SS'si kullanılır.
 */

export const FEATURE_DEFS = {
  totalWords: { label: 'Toplam sözcük', unit: 'sözcük', domain: 'L1', dir: 'low', mean: 180, sd: 70, d: 0, desc: 'Danışanın ürettiği sözcük sayısı' },
  mluW: { label: 'Ortalama sözce uzunluğu (MLU-w)', unit: 'sözcük', domain: 'L1', dir: 'low', mean: 6.0, sd: 1.8, d: 2 },
  wpm: { label: 'Konuşma hızı', unit: 'sözcük/dk', domain: 'L1', dir: 'low', mean: 105, sd: 28, d: 0, desc: 'Danışanın konuştuğu sürede dakikadaki sözcük' },
  pauseRatio: { label: 'Duraksama oranı', unit: '', domain: 'L1', dir: 'high', mean: 0.35, sd: 0.12, d: 2, pct: true },
  meanPause: { label: 'Ortalama duraksama', unit: 'sn', domain: 'L1', dir: 'high', mean: 0.9, sd: 0.35, d: 2 },
  longPausesPerMin: { label: 'Uzun duraksama (≥ 2 sn)', unit: '/dk', domain: 'L1', dir: 'high', mean: 1.2, sd: 1.0, d: 1 },
  mattr: { label: 'Sözcük çeşitliliği (MATTR)', unit: '', domain: 'L2', dir: 'low', mean: 0.72, sd: 0.05, d: 3 },
  mtld: { label: 'Sözcük çeşitliliği (MTLD)', unit: '', domain: 'L2', dir: 'low', mean: 55, sd: 16, d: 0 },
  nounVerbRatio: { label: 'İsim / fiil oranı', unit: '', domain: 'L2', dir: 'high', mean: 1.5, sd: 0.5, d: 2 },
  contentRatio: { label: 'İçerik sözcüğü oranı', unit: '', domain: 'L2', dir: 'low', mean: 0.55, sd: 0.07, d: 2, pct: true },
  repetitionRate: { label: 'Tekrar ve düzeltme', unit: '/100 sözcük', domain: 'L2', dir: 'high', mean: 2.0, sd: 2.0, d: 1 },
  fillerRate: { label: 'Dolgu sözcükleri (ıı, yani, işte)', unit: '/100 sözcük', domain: 'L3', dir: 'high', mean: 4.0, sd: 3.0, d: 1 },
  vagueRate: { label: 'Belirsiz ifadeler (şey, burada, orada)', unit: '/100 sözcük', domain: 'L3', dir: 'high', mean: 3.0, sd: 2.0, d: 1 },
  wordFindingRate: { label: 'Kelime bulma yorumları ("adı neydi")', unit: '/100 sözcük', domain: 'L3', dir: 'high', mean: 0.3, sd: 0.4, d: 1 },
  pronounRatio: { label: 'Zamir oranı', unit: '', domain: 'L4', dir: 'high', mean: 0.08, sd: 0.035, d: 2, pct: true },
  clauseDensity: { label: 'Sözce başına yüklem (clause density)', unit: '', domain: 'L5', dir: 'low', mean: 1.3, sd: 0.35, d: 2 },
  subordinateRatio: { label: 'Fiilimsi / yan cümle oranı', unit: '', domain: 'L5', dir: 'low', mean: 0.25, sd: 0.1, d: 2, pct: true },
  morphemesPerWord: { label: 'Sözcük başına biçimbirim', unit: '', domain: 'L5', dir: 'low', mean: 1.95, sd: 0.22, d: 2 },
  iuCoverage: { label: 'Bilgi birimi kapsamı', unit: '', domain: 'L6', dir: 'low', mean: 0.6, sd: 0.15, d: 0, pct: true },
  infoDensity: { label: 'Bilgi yoğunluğu', unit: 'IU/100 sözcük', domain: 'L6', dir: 'low', mean: 9, sd: 3.5, d: 1 },
  eventCoverage: { label: 'Olay kapsamı', unit: '', domain: 'L6', dir: 'low', mean: 0.55, sd: 0.2, d: 0, pct: true },
  connectivesPerUtt: { label: 'Bağlaç kullanımı (ve, sonra, çünkü…)', unit: '/sözce', domain: 'L7', dir: 'low', mean: 0.5, sd: 0.3, d: 2 },
  offTopicRatio: { label: 'Konu dışı adlar', unit: '', domain: 'L8', dir: 'high', mean: 0.12, sd: 0.1, d: 0, pct: true },
};

export const DOMAINS = {
  L1: 'Genel üretim', L2: 'Leksikal özellikler', L3: 'Kelime erişimi', L4: 'Referans (zamir)',
  L5: 'Morfosentaks', L6: 'Bilgi içeriği', L7: 'Söylem tutarlılığı', L8: 'Pragmatik / görsel uygunluk',
};

/** DKT klinik değerlendirme formu maddeleri (0–3) — program da aynı maddeleri puanlar. */
export const CLINICAL_ITEMS = [
  { id: 'anomia', label: 'Kelime bulma güçlüğü (anomi)', feats: ['fillerRate', 'vagueRate', 'wordFindingRate', 'longPausesPerMin', 'mattr'], w: 1.2 },
  { id: 'circumlocution', label: 'Dolambaçlı anlatım (circumlocution)', feats: ['wordFindingRate', 'vagueRate', 'infoDensity'], w: 0.8 },
  { id: 'syntax', label: 'Sözdizimsel karmaşıklık', feats: ['mluW', 'clauseDensity', 'subordinateRatio', 'morphemesPerWord'], w: 0.9 },
  { id: 'fluency', label: 'Akıcılık (duraksama, tekrar, düzeltme)', feats: ['wpm', 'pauseRatio', 'meanPause', 'repetitionRate'], w: 1.0 },
  { id: 'information', label: 'Bilgi içeriği ve olay sıralaması', feats: ['iuCoverage', 'eventCoverage', 'infoDensity', 'totalWords'], w: 1.3 },
  { id: 'coherence', label: 'Söylem tutarlılığı ve bütünlüğü', feats: ['connectivesPerUtt', 'offTopicRatio', 'mtld'], w: 0.8 },
  { id: 'reference', label: 'Referans açıklığı (zamir kullanımı)', feats: ['pronounRatio', 'vagueRate'], w: 0.7 },
  { id: 'overall', label: 'Genel dil profili (bilişsel gerilemeyle uyum)', feats: [], w: 0 },
];

export const SEVERITY = ['Yok', 'Hafif', 'Orta', 'Belirgin'];
export const severityOf = (z) => (z == null ? null : z < 1 ? 0 : z < 2 ? 1 : z < 3 ? 2 : 3);

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clip = (x, a, b) => Math.max(a, Math.min(b, x));

/** Varsayılan risk modeli (önsel katsayılar). */
export const DEFAULT_MODEL = { kind: 'default', b0: -2.6, bC: 1.25, bAge: 1, bEdu: 1, label: 'Varsayılan (literatüre dayalı önsel katsayılar)' };

export function ageTerm(age) { return age == null ? 0 : clip(0.035 * (age - 65), -0.7, 0.9); }
export function eduTerm(edu) { return edu == null || edu === '' ? 0 : clip(-0.04 * (Number(edu) - 8), -0.4, 0.3); }

/** Referans değerler: ekibin kontrol grubu (≥ 5 örneklem) varsa onlardan, yoksa varsayılan. */
export function buildNorms(controlFeatureSets = []) {
  const norms = {};
  const useTeam = controlFeatureSets.length >= 5;
  for (const [k, def] of Object.entries(FEATURE_DEFS)) {
    let mean = def.mean;
    let sd = def.sd;
    if (useTeam) {
      const v = controlFeatureSets.map((f) => f[k]).filter((x) => x != null && Number.isFinite(x));
      if (v.length >= 5) {
        const m = v.reduce((s, x) => s + x, 0) / v.length;
        const s = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
        mean = m;
        sd = Math.max(s, def.sd * 0.35); // çok küçük SS'nin z'yi şişirmesini önle
      }
    }
    norms[k] = { mean, sd };
  }
  return { norms, source: useTeam ? 'team' : 'default', n: controlFeatureSets.length };
}

/**
 * Bir örneklemi puanlar.
 * @param {object} features computeProtocolMeasures().features
 * @param {object} o { norms, age, education, model, verified }
 */
export function scoreSample(features, o = {}) {
  const norms = o.norms || buildNorms().norms;
  const z = {};
  for (const [k, def] of Object.entries(FEATURE_DEFS)) {
    const v = features[k];
    const n = norms[k];
    if (v == null || !Number.isFinite(v) || !n) { z[k] = null; continue; }
    const raw = def.dir === 'low' ? (n.mean - v) / n.sd : (v - n.mean) / n.sd;
    z[k] = clip(raw, -5, 6);
  }
  const bad = (k) => (z[k] == null ? null : Math.max(0, z[k]));
  const items = CLINICAL_ITEMS.filter((it) => it.id !== 'overall').map((it) => {
    const ev = it.feats.map((k) => ({ feat: k, value: features[k], z: z[k], bad: bad(k) })).filter((e) => e.bad != null);
    const top = [...ev].sort((a, b) => b.bad - a.bad).slice(0, 2);
    const iz = top.length ? top.reduce((s, e) => s + e.bad, 0) / top.length : null;
    return { id: it.id, label: it.label, z: iz, score: severityOf(iz), evidence: ev.sort((a, b) => b.bad - a.bad), w: it.w };
  });
  const scored = items.filter((i) => i.z != null);
  const wsum = scored.reduce((s, i) => s + i.w, 0);
  const composite = wsum ? scored.reduce((s, i) => s + i.w * i.z, 0) / wsum : null;
  items.push({ id: 'overall', label: CLINICAL_ITEMS.find((i) => i.id === 'overall').label, z: composite, score: severityOf(composite), evidence: [] });

  const model = o.model || DEFAULT_MODEL;
  const risk = composite == null ? null : riskFrom(composite, o.age, o.education, model);

  // Güven: örneklem büyüklüğü, konuşma süresi, transkript doğrulaması
  const words = features.totalWords || 0;
  const reasons = [];
  if (words < 60) reasons.push('danışan 60 sözcükten az üretti');
  if (features.speakingSec != null && features.speakingSec < 45) reasons.push('danışanın konuşma süresi 45 saniyenin altında');
  if (!o.verified) reasons.push('transkript henüz doğrulanmadı');
  const confidence = words >= 120 && o.verified && reasons.length === 0 ? 'Yüksek' : words >= 60 ? 'Orta' : 'Düşük';
  return { z, items, composite, risk, confidence, confidenceReasons: reasons, model: { kind: model.kind, label: model.label } };
}

export function riskFrom(composite, age, education, model = DEFAULT_MODEL) {
  const x = model.b0 + model.bC * composite + model.bAge * ageTerm(age) + model.bEdu * eduTerm(education);
  return sigmoid(x);
}

/** Aylık birikimli risk (sabit tehlike varsayımı): P(m) = 1 − (1 − P₁₂)^(m/12). */
export function monthlyProjection(p12) {
  if (p12 == null) return [];
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return { month: m, p: 1 - (1 - p12) ** (m / 12) };
  });
}

/** Risk düzeyine göre izlem takvimi. */
export function followUpPlan(p12) {
  if (p12 == null) return { level: '—', months: [12], text: '' };
  if (p12 >= 0.5) return { level: 'Yüksek', months: [3, 6, 9, 12], text: 'Üç ayda bir kısa anlatım örneği ve 12. ayda aynı resimle tam izlem; bilişsel tarama (ör. MoCA) ve nöroloji değerlendirmesi önerilir.' };
  if (p12 >= 0.25) return { level: 'Orta', months: [6, 12], text: '6. ayda ara değerlendirme ve 12. ayda aynı resimle izlem önerilir.' };
  return { level: 'Düşük', months: [12], text: 'Protokole uygun olarak 12. ayda aynı resimle izlem yeterlidir.' };
}

// ---------------------------------------------------------------------------
// Ekip verisiyle model eğitimi (lojistik regresyon, L2 düzenlileştirme)
// ---------------------------------------------------------------------------
function fitLogistic(X, y, lambda = 1, iters = 60) {
  const d = X[0].length;
  let w = new Array(d).fill(0);
  for (let it = 0; it < iters; it++) {
    const g = new Array(d).fill(0);
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    X.forEach((x, i) => {
      const p = sigmoid(x.reduce((s, v, j) => s + v * w[j], 0));
      for (let j = 0; j < d; j++) {
        g[j] += (p - y[i]) * x[j];
        for (let k = 0; k < d; k++) H[j][k] += p * (1 - p) * x[j] * x[k];
      }
    });
    for (let j = 1; j < d; j++) { g[j] += lambda * w[j]; H[j][j] += lambda; }
    // H · δ = g  (Gauss eleme)
    const A = H.map((row, i) => [...row, g[i]]);
    for (let c = 0; c < d; c++) {
      let p = c;
      for (let r = c + 1; r < d; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]];
      if (Math.abs(A[c][c]) < 1e-12) return w;
      for (let r = 0; r < d; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k <= d; k++) A[r][k] -= f * A[c][k];
      }
    }
    const delta = A.map((row, i) => row[d] / row[i]);
    w = w.map((v, j) => v - delta[j]);
    if (delta.every((x) => Math.abs(x) < 1e-6)) break;
  }
  return w;
}

/**
 * Ekip modeli: sonucu belli başlangıç örneklemleriyle (bileşik şiddet, yaş, eğitim) eğitilir.
 * En az 12 örneklem ve her sınıfta en az 4 kişi gerekir. Birini-dışarıda-bırak (LOO) doğruluğu
 * varsayılan modelden düşükse kullanılmaz.
 * @param {Array<{composite, age, education, developed:boolean}>} cases
 */
export function fitTeamModel(cases) {
  const data = cases.filter((c) => c.composite != null && typeof c.developed === 'boolean');
  const pos = data.filter((c) => c.developed).length;
  const neg = data.length - pos;
  const status = { n: data.length, pos, neg, used: false, model: DEFAULT_MODEL, looAccTeam: null, looAccDefault: null };
  if (data.length < 12 || pos < 4 || neg < 4) return { ...status, reason: `Ekip modeli için en az 12 sonuçlu örneklem ve her grupta 4 kişi gerekir (şu an ${data.length}; ${pos} gerileme, ${neg} gerileme yok).` };
  const row = (c) => [1, c.composite, ageTerm(c.age), eduTerm(c.education)];
  let okTeam = 0;
  let okDef = 0;
  data.forEach((c, i) => {
    const train = data.filter((_, j) => j !== i);
    const w = fitLogistic(train.map(row), train.map((t) => (t.developed ? 1 : 0)));
    const p = sigmoid(row(c).reduce((s, v, j) => s + v * w[j], 0));
    if ((p >= 0.5) === c.developed) okTeam++;
    if ((riskFrom(c.composite, c.age, c.education) >= 0.5) === c.developed) okDef++;
  });
  const w = fitLogistic(data.map(row), data.map((t) => (t.developed ? 1 : 0)));
  const looAccTeam = okTeam / data.length;
  const looAccDefault = okDef / data.length;
  const model = { kind: 'team', b0: w[0], bC: w[1], bAge: w[2], bEdu: w[3], label: `Ekip verisiyle eğitilmiş (n = ${data.length}, LOO doğruluk %${Math.round(looAccTeam * 100)})` };
  const used = looAccTeam >= looAccDefault;
  return { ...status, used, model: used ? model : DEFAULT_MODEL, looAccTeam, looAccDefault, reason: used ? null : 'Ekip modeli, birini-dışarıda-bırak doğrulamasında varsayılan modelden daha iyi değil; varsayılan kullanılıyor.' };
}

// ---------------------------------------------------------------------------
// Yorum paragrafı
// ---------------------------------------------------------------------------
const fmt = (v, d = 0) => (v == null ? '—' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
const pct = (v) => (v == null ? '—' : `%${fmt(v * 100, 0)}`);
const lvl = (z) => (z == null ? '' : z < 1 ? 'beklenen aralıkta' : z < 2 ? 'beklenenden hafif farklı' : z < 3 ? 'belirgin biçimde farklı' : 'çok belirgin biçimde farklı');

/**
 * Programın yorumu: bulgular, çıkarımlar ve risk.
 * @returns {{findings: string[], inference: string, riskText: string, caveat: string}}
 */
export function narrative(features, detail, scored, ctx = {}) {
  const f = features;
  const z = scored.z;
  const out = [];
  const dur = f.speakingSec == null ? 'anlatımında' : f.speakingSec < 60 ? `${fmt(f.speakingSec)} saniyelik konuşma süresinde` : `${fmt(f.speakingSec / 60, 1)} dakikalık konuşma süresinde`;
  out.push(`Katılımcı ${dur} ${fmt(f.totalWords)} sözcük üretti${f.wpm != null ? `; konuşma hızı dakikada ${fmt(f.wpm)} sözcük (${lvl(z.wpm)})` : ''}. Ortalama sözce uzunluğu ${fmt(f.mluW, 1)} sözcük${f.pauseRatio != null ? `, duraksama oranı ${pct(f.pauseRatio)}, ortalama duraksama ${fmt(f.meanPause, 1)} sn` : ''}.`);
  const missing = (detail.iuMissing || []).map((id) => ctx.iuLabel?.(id) || id);
  const keyMissing = missing.filter((l) => /ambulans|polis|yaralı|kaza|sedye|otobüs|araba/i.test(l)).slice(0, 4);
  out.push(`Resimdeki ${f.iuTotal} temel bilgi biriminden ${f.iuCount} tanesini (${pct(f.iuCoverage)}) aktardı; olayların ${pct(f.eventCoverage)} kadarını anlattı${keyMissing.length ? `. Değinilmeyen önemli öğeler: ${keyMissing.join(', ')}` : ''}. Bilgi içeriği ${lvl(Math.max(z.iuCoverage ?? 0, z.eventCoverage ?? 0))}.`);
  const wf = [];
  if (f.fillerRate != null) wf.push(`dolgu sözcükleri 100 sözcükte ${fmt(f.fillerRate, 1)}`);
  if (f.vagueRate != null) wf.push(`"şey, burada" gibi belirsiz ifadeler ${fmt(f.vagueRate, 1)}`);
  if (f.wordFindingRate) wf.push(`kelime bulma yorumları ${fmt(f.wordFindingRate, 1)}`);
  if (wf.length) out.push(`Sözcük erişiminde ${wf.join(', ')} (${lvl(Math.max(z.fillerRate ?? 0, z.vagueRate ?? 0, z.wordFindingRate ?? 0))}).`);
  const lex = [];
  if (f.mattr != null) lex.push(`MATTR ${fmt(f.mattr, 2)}`);
  if (f.mtld != null) lex.push(`MTLD ${fmt(f.mtld)}`);
  out.push(`${lex.length ? `Sözcük çeşitliliği ${lex.join(', ')} (${lvl(Math.max(z.mattr ?? 0, z.mtld ?? 0))}); z` : 'Sözcük çeşitliliği örnek 50 sözcükten kısa olduğu için hesaplanmadı; z'}amir oranı ${pct(f.pronounRatio)}, fiilimsi/yan cümle oranı ${pct(f.subordinateRatio)}.`);
  if (detail.offTopicWords?.length) out.push(`Resimde bulunmayan ya da konu dışı adlar: ${detail.offTopicWords.slice(0, 6).join(', ')}.`);

  const worst = scored.items.filter((i) => i.id !== 'overall' && i.score >= 1).sort((a, b) => b.z - a.z).slice(0, 3);
  const inference = worst.length
    ? `Bu örüntü özellikle ${worst.map((i) => `${i.label.split(' (')[0].toLocaleLowerCase('tr-TR')} (${SEVERITY[i.score].toLocaleLowerCase('tr-TR')})`).join(', ')} alanlarında referans değerlerden ayrışıyor. ${worst.some((i) => ['information', 'anomia'].includes(i.id)) ? 'Bilgi içeriğinde azalma ve sözcük erişiminde güçlük, bilişsel-dilsel gerilemenin erken belirtileri arasında sayılır.' : 'Ayrışma daha çok akıcılık ve yapı düzeyinde; tek başına bilişsel gerilemeye özgü değildir.'}`
    : 'Ölçütlerin tamamı referans aralığına yakın; bilişsel-dilsel gerilemeyi düşündüren belirgin bir örüntü görülmedi.';
  const p = scored.risk;
  const plan = followUpPlan(p);
  const riskText = p == null ? 'Risk hesaplanamadı (yetersiz örneklem).'
    : `Program, bu katılımcıda önümüzdeki 12 ay içinde konuşma-dil ya da bilişsel-dilsel gerileme olasılığını %${fmt(p * 100)} olarak tahmin ediyor (${plan.level.toLocaleLowerCase('tr-TR')} risk; güven: ${scored.confidence.toLocaleLowerCase('tr-TR')}). Sabit tehlike varsayımıyla birikimli olasılık 3. ayda %${fmt(monthlyProjection(p)[2].p * 100)}, 6. ayda %${fmt(monthlyProjection(p)[5].p * 100)}, 9. ayda %${fmt(monthlyProjection(p)[8].p * 100)}. ${plan.text}`;
  const caveat = `Bu çıktı tanı koymaz; ${scored.model.kind === 'team' ? 'ekip verisiyle eğitilmiş' : 'henüz kalibre edilmemiş, literatüre dayalı önsel katsayılar kullanan'} bir modelden gelir ve DKT değerlendirmesinin yerine geçmez.${scored.confidenceReasons.length ? ` Güveni düşüren etkenler: ${scored.confidenceReasons.join('; ')}.` : ''}`;
  return { findings: out, inference, riskText, caveat };
}
