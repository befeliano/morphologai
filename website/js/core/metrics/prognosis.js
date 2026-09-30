/**
 * Öngörü modeli — kaza resmi anlatımından 1 yıllık bilişsel-dilsel gerileme riski.
 *
 * Program (yapay zekâ) değerlendirmesi üç adımdır ve tamamen açıklanabilirdir:
 *  1. Her ölçüt referans değerle karşılaştırılır: z = bozulma yönündeki sapma / SS (0'ın altı 0 sayılır).
 *  2. Klinik formdaki 8 madde için 0–3 puan: ilgili ölçütlerin en yüksek iki z'sinin ortalaması
 *     (z < 1 → 0, < 2 → 1, < 3 → 2, ≥ 3 → 3). DKT formuyla aynı maddeler — uyum doğrudan ölçülür.
 *  3. Risk: bileşik şiddet (en ağır madde z'si ile ağırlıklı ortalama z'nin ortalaması) + yaş + eğitim → lojistik.
 *  4. Alan öngörüsü: altı dil alanı (semantik, pragmatik, morfolojik, sözdizimsel, fonolojik, akıcılık) için
 *     ayrı olasılık, tümevarımsal gerekçe (gözlem → ara çıkarım → sonuç) ve alanların birlikteliğinden örüntü türü.
 *     Varsayılan katsayılar literatüre dayalı önsel değerlerdir (kalibre edilmemiştir). Ekipte yeterli
 *     izlem sonucu birikince model ekibin verisiyle yeniden eğitilir (bkz. fitTeamModel).
 * Referans değerler Türkçe için standartlaştırılmamış yaklaşık değerlerdir; ekibin kontrol grubu
 * örneklemleri (≥ 5) varsa onların ortalama ve SS'si kullanılır.
 */

export const FEATURE_DEFS = {
  totalWords: { label: 'Toplam sözcük', unit: 'sözcük', domain: 'L1', dir: 'low', mean: 180, sd: 70, d: 0, desc: 'Danışanın ürettiği sözcük sayısı' },
  mluW: { label: 'Ortalama sözce uzunluğu (MLU-w)', unit: 'sözcük', domain: 'L1', dir: 'low', mean: 6.0, sd: 1.8, d: 2, base: 'utts' },
  wpm: { label: 'Konuşma hızı', unit: 'sözcük/dk', domain: 'L1', dir: 'low', mean: 105, sd: 28, d: 0, base: 'secs', desc: 'Danışanın konuştuğu sürede dakikadaki sözcük' },
  pauseRatio: { label: 'Duraksama oranı', unit: '', domain: 'L1', dir: 'high', mean: 0.35, sd: 0.12, d: 2, pct: true, base: 'secs' },
  meanPause: { label: 'Ortalama duraksama', unit: 'sn', domain: 'L1', dir: 'high', mean: 0.9, sd: 0.35, d: 2, base: 'secs' },
  longPausesPerMin: { label: 'Uzun duraksama (≥ 2 sn)', unit: '/dk', domain: 'L1', dir: 'high', mean: 1.2, sd: 1.0, d: 1, base: 'secs' },
  mattr: { label: 'Sözcük çeşitliliği (MATTR)', unit: '', domain: 'L2', dir: 'low', mean: 0.72, sd: 0.05, d: 3 },
  mtld: { label: 'Sözcük çeşitliliği (MTLD)', unit: '', domain: 'L2', dir: 'low', mean: 55, sd: 16, d: 0 },
  nounVerbRatio: { label: 'İsim / fiil oranı', unit: '', domain: 'L2', dir: 'high', mean: 1.5, sd: 0.5, d: 2 },
  contentRatio: { label: 'İçerik sözcüğü oranı', unit: '', domain: 'L2', dir: 'low', mean: 0.55, sd: 0.07, d: 2, pct: true, base: 'wordsAvg' },
  repetitionRate: { label: 'Tekrar ve düzeltme', unit: '/100 sözcük', domain: 'L2', dir: 'high', mean: 2.0, sd: 2.0, d: 1, base: 'words' },
  fillerRate: { label: 'Dolgu sözcükleri (ıı, yani, işte)', unit: '/100 sözcük', domain: 'L3', dir: 'high', mean: 4.0, sd: 3.0, d: 1, base: 'words' },
  vagueRate: { label: 'Belirsiz ifadeler (şey, burada, orada)', unit: '/100 sözcük', domain: 'L3', dir: 'high', mean: 3.0, sd: 2.0, d: 1, base: 'words' },
  wordFindingRate: { label: 'Kelime bulma yorumları ("adı neydi")', unit: '/100 sözcük', domain: 'L3', dir: 'high', mean: 0.3, sd: 0.4, d: 1, base: 'words' },
  pronounRatio: { label: 'Zamir oranı', unit: '', domain: 'L4', dir: 'high', mean: 0.08, sd: 0.035, d: 2, pct: true, base: 'wordsAvg' },
  clauseDensity: { label: 'Sözce başına yüklem (clause density)', unit: '', domain: 'L5', dir: 'low', mean: 1.3, sd: 0.35, d: 2, base: 'utts' },
  subordinateRatio: { label: 'Fiilimsi / yan cümle oranı', unit: '', domain: 'L5', dir: 'low', mean: 0.25, sd: 0.1, d: 2, pct: true, base: 'verbs' },
  morphemesPerWord: { label: 'Sözcük başına biçimbirim', unit: '', domain: 'L5', dir: 'low', mean: 1.95, sd: 0.22, d: 2, base: 'wordsAvg' },
  iuCoverage: { label: 'Bilgi birimi kapsamı', unit: '', domain: 'L6', dir: 'low', mean: 0.6, sd: 0.15, d: 0, pct: true },
  infoDensity: { label: 'Bilgi yoğunluğu', unit: 'IU/100 sözcük', domain: 'L6', dir: 'low', mean: 9, sd: 3.5, d: 1, base: 'words' },
  eventCoverage: { label: 'Olay kapsamı', unit: '', domain: 'L6', dir: 'low', mean: 0.55, sd: 0.2, d: 0, pct: true },
  connectivesPerUtt: { label: 'Bağlaç kullanımı (ve, sonra, çünkü…)', unit: '/sözce', domain: 'L7', dir: 'low', mean: 0.5, sd: 0.3, d: 2, base: 'utts' },
  offTopicRatio: { label: 'Konu dışı adlar', unit: '', domain: 'L8', dir: 'high', mean: 0.12, sd: 0.1, d: 0, pct: true, base: 'nouns' },
  promptRatio: { label: 'Terapist yönlendirme gereksinimi', unit: '/danışan sözcesi', domain: 'L8', dir: 'high', mean: 0.2, sd: 0.2, d: 2, base: 'utts', desc: 'Danışan sözcesi başına terapist sorusu/onayı' },
  questionRate: { label: 'Görevi soruyla geri yöneltme', unit: '', domain: 'L8', dir: 'high', mean: 0.03, sd: 0.05, d: 0, pct: true, base: 'utts' },
  inappropriateRate: { label: 'Bağlama uygun olmayan ifade', unit: '/100 sözcük', domain: 'L8', dir: 'high', mean: 0, sd: 0.5, d: 1, base: 'words' },
  semanticErrorRate: { label: 'Anlamsal parafazi (kodlanmış)', unit: '/100 sözcük', domain: 'L3', dir: 'high', mean: 0.2, sd: 0.5, d: 1, base: 'words' },
  morphErrorRate: { label: 'Biçimbirim / dilbilgisi hatası (kodlanmış)', unit: '/100 sözcük', domain: 'L5', dir: 'high', mean: 0.3, sd: 0.6, d: 1, base: 'words' },
  predicateRatio: { label: 'Yüklemli sözce oranı', unit: '', domain: 'L5', dir: 'low', mean: 0.85, sd: 0.12, d: 0, pct: true, base: 'utts' },
  unknownRate: { label: 'Sözlük dışı / biçimi bozuk sözcük', unit: '/100 sözcük', domain: 'L9', dir: 'high', mean: 1.0, sd: 1.5, d: 1, base: 'words' },
  phonRate: { label: 'Fonolojik hata adayı / neolojizm', unit: '/100 sözcük', domain: 'L9', dir: 'high', mean: 0.3, sd: 0.6, d: 1, base: 'words' },
  fragmentRate: { label: 'Yarım bırakılan sözcük', unit: '/100 sözcük', domain: 'L9', dir: 'high', mean: 0.5, sd: 0.8, d: 1, base: 'words' },
};

export const DOMAINS = {
  L1: 'Genel üretim', L2: 'Leksikal özellikler', L3: 'Kelime erişimi', L4: 'Referans (zamir)',
  L5: 'Morfosentaks', L6: 'Bilgi içeriği', L7: 'Söylem tutarlılığı', L8: 'Pragmatik / görsel uygunluk',
  L9: 'Fonoloji ve sözcük biçimi (ek)',
};

/**
 * Dil alanları — "hangi alanda bozulma bekleniyor?" sorusunun birimi.
 * Her alanın kanıtları ölçütlerdir; alan şiddeti = en belirgin iki kanıtın ortalama z değeri.
 */
export const LANGUAGE_DOMAINS = [
  { id: 'semantic', label: 'Semantik', long: 'Semantik (anlam, sözcük–kavram eşlemesi)', feats: ['iuCoverage', 'infoDensity', 'offTopicRatio', 'vagueRate', 'semanticErrorRate', 'mattr'] },
  { id: 'pragmatic', label: 'Pragmatik', long: 'Pragmatik (dil kullanımı, söylem düzeni)', feats: ['promptRatio', 'questionRate', 'offTopicRatio', 'inappropriateRate', 'eventCoverage', 'connectivesPerUtt'] },
  { id: 'morphological', label: 'Morfolojik', long: 'Morfolojik (biçimbilim, ek kullanımı)', feats: ['morphemesPerWord', 'subordinateRatio', 'morphErrorRate', 'unknownRate'] },
  { id: 'syntactic', label: 'Sözdizimsel', long: 'Sözdizimsel (cümle yapısı)', feats: ['mluW', 'clauseDensity', 'predicateRatio', 'subordinateRatio'] },
  { id: 'phonological', label: 'Fonolojik', long: 'Fonolojik (sözcüğün ses yapısı)', feats: ['phonRate', 'unknownRate', 'fragmentRate'] },
  { id: 'fluency', label: 'Akıcılık', long: 'Akıcılık ve konuşma hızı', feats: ['wpm', 'pauseRatio', 'meanPause', 'longPausesPerMin', 'repetitionRate'] },
];

/** DKT alan öngörüsü ölçeği ve programın olasılık düzeyleri. */
export const DOMAIN_LEVELS = ['Beklemiyorum', 'Olası', 'Kuvvetle olası', 'Kesin'];
export const domainLevelOf = (p) => (p == null ? null : p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.8 ? 2 : 3);
export const PROGRAM_DOMAIN_LEVELS = ['Beklenmiyor', 'Olası', 'Kuvvetle olası', 'Çok yüksek olasılık'];

/** Örüntü türleri (alanların birlikte etkilenme biçimi). Tanı değil, "… ile uyumlu olabilir" düzeyinde. */
export const PROFILE_TYPES = [
  { id: 'typical', label: 'Belirgin bozulma örüntüsü yok' },
  { id: 'mild', label: 'Hafif, alana özgü olmayan farklılıklar' },
  { id: 'semantic_pragmatic', label: 'Semantik-pragmatik ağırlıklı söylem bozulması', note: 'Bilgi içeriği ve dil kullanımı belirgin biçimde etkilenmiş, biçim ve sözdizim daha az etkilenmiş; Alzheimer tipi demans / HBB söylem örüntüsüyle uyumlu olabilir.' },
  { id: 'semantic', label: 'Semantik (anlamsal) örüntü', note: 'Anlam ve adlandırma ağırlıklı etkilenim, akıcılık korunmuş; semantik varyant PPA ya da anomik örüntüyle uyumlu olabilir.' },
  { id: 'agrammatic', label: 'Agramatik / akıcı olmayan örüntü', note: 'Biçimbilim ve sözdizim akıcılıkla birlikte etkilenmiş; akıcı olmayan PPA ya da Broca tipi afazi ile uyumlu olabilir.' },
  { id: 'logopenic', label: 'Fonolojik-logopenik örüntü', note: 'Sözcük bulma duraksamaları ve fonolojik hatalar birlikte; logopenik PPA ile uyumlu olabilir.' },
  { id: 'pragmatic', label: 'Pragmatik ağırlıklı örüntü', note: 'Dil kullanımı ve söylem düzenlemesi öne çıkıyor; yürütücü işlev / frontal kaynaklı değişiklikler düşünülebilir.' },
  { id: 'fluency', label: 'Akıcılık / hız ağırlıklı örüntü', note: 'Yavaşlama ve duraksamalar öne çıkıyor; bilişsel yavaşlama yanında depresyon, işitme ya da motor konuşma etkenleri de değerlendirilmeli.' },
  { id: 'global', label: 'Yaygın (global) bilişsel-dilsel bozulma', note: 'Dil alanlarının çoğu birlikte etkilenmiş; ilerlemiş demans ya da yaygın dil bozukluğu örüntüsüyle uyumlu olabilir.' },
];

/** DKT klinik değerlendirme formu maddeleri (0–3) — program da aynı maddeleri puanlar. */
export const CLINICAL_ITEMS = [
  { id: 'anomia', label: 'Kelime bulma güçlüğü (anomi)', feats: ['fillerRate', 'vagueRate', 'wordFindingRate', 'longPausesPerMin', 'mattr'], w: 1.2 },
  { id: 'circumlocution', label: 'Dolambaçlı anlatım (circumlocution)', feats: ['wordFindingRate', 'vagueRate', 'infoDensity'], w: 0.8 },
  { id: 'syntax', label: 'Sözdizimsel karmaşıklık', feats: ['mluW', 'clauseDensity', 'subordinateRatio', 'morphemesPerWord'], w: 0.9 },
  { id: 'fluency', label: 'Akıcılık (duraksama, tekrar, düzeltme)', feats: ['wpm', 'pauseRatio', 'meanPause', 'repetitionRate'], w: 1.0 },
  { id: 'information', label: 'Bilgi içeriği ve olay sıralaması', feats: ['iuCoverage', 'eventCoverage', 'infoDensity', 'totalWords'], w: 1.3 },
  { id: 'coherence', label: 'Söylem tutarlılığı ve bütünlüğü', feats: ['connectivesPerUtt', 'offTopicRatio', 'promptRatio', 'questionRate', 'mtld'], w: 0.8 },
  { id: 'reference', label: 'Referans açıklığı (zamir kullanımı)', feats: ['pronounRatio', 'vagueRate'], w: 0.7 },
  { id: 'overall', label: 'Genel dil profili (bilişsel gerilemeyle uyum)', feats: [], w: 0 },
];

/** Küçük örneklem düzeltmesinin önsel ağırlığı (payda birimi cinsinden: sözcük, sözce, ad, eylem, saniye). */
export const SHRINK_N0 = { words: 30, wordsAvg: 10, utts: 5, nouns: 5, verbs: 5, secs: 20 };

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
  const adjusted = {};
  const baseN = {
    words: features.totalWords, wordsAvg: features.totalWords, utts: features.participantUtterances,
    nouns: features.nounCount, verbs: features.verbCount, secs: features.speakingSec,
  };
  for (const [k, def] of Object.entries(FEATURE_DEFS)) {
    let v = features[k];
    const n = norms[k];
    if (v == null || !Number.isFinite(v) || !n) { z[k] = null; continue; }
    // Küçük örneklem düzeltmesi: az sözcük / sözceden hesaplanan oran, payda büyüklüğüne göre
    // referans ortalamaya doğru çekilir (24 sözcükte tek bir "lan" 100 sözcükte 4 sayılmasın)
    const bn = def.base ? baseN[def.base] : null;
    if (bn != null && Number.isFinite(bn) && bn >= 0) v = (v * bn + n.mean * SHRINK_N0[def.base]) / (bn + SHRINK_N0[def.base]);
    adjusted[k] = v;
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
  // Bileşik şiddet: en ağır madde ile ağırlıklı ortalamanın yarı yarıya birleşimi
  // (tek alanda ağır bozulma, sağlam alanlarla seyrelmesin)
  const wmean = wsum ? scored.reduce((s, i) => s + i.w * i.z, 0) / wsum : null;
  const composite = wmean == null ? null : 0.5 * Math.max(...scored.map((i) => i.z)) + 0.5 * wmean;
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
  const domains = scoreDomains(features, z, { ...o, norms, adjusted });
  const profile = classifyProfile(domains);
  return { z, items, composite, risk, confidence, confidenceReasons: reasons, model: { kind: model.kind, label: model.label }, domains, profile };
}

/**
 * Alan bazlı 1 yıllık olasılık: lojistik(−2,3 + 1,3 × alan z + ½ yaş terimi + ½ eğitim terimi).
 * z=0 → ~%9, 1 → ~%27, 2 → ~%57, 3 → ~%83 (önsel, kalibre edilmemiş).
 */
export function scoreDomains(features, z, o = {}) {
  return LANGUAGE_DOMAINS.map((d) => {
    const ev = d.feats.map((k) => ({ feat: k, value: features[k], adj: o.adjusted?.[k] ?? null, ref: o.norms?.[k]?.mean ?? FEATURE_DEFS[k].mean, z: z[k], bad: z[k] == null ? null : Math.max(0, z[k]) })).filter((e) => e.bad != null);
    const top = [...ev].sort((a, b) => b.bad - a.bad).slice(0, 2);
    const dz = top.length ? top.reduce((s, e) => s + e.bad, 0) / top.length : null;
    const p = dz == null ? null : sigmoid(-2.3 + 1.3 * dz + 0.5 * ageTerm(o.age) + 0.5 * eduTerm(o.education));
    return { id: d.id, label: d.label, long: d.long, z: dz, p, level: domainLevelOf(p), evidence: ev.sort((a, b) => b.bad - a.bad), available: ev.length };
  });
}

/** Alanların birlikte etkilenme biçiminden örüntü türü (tümevarım: alan bulguları → tür). */
export function classifyProfile(domains) {
  const z = Object.fromEntries(domains.map((d) => [d.id, d.z ?? 0]));
  const HIGH = 1.5;
  const high = domains.filter((d) => (d.z ?? 0) >= HIGH).map((d) => d.id);
  const any = domains.some((d) => (d.z ?? 0) >= 1);
  const form = Math.max(z.morphological, z.syntactic);
  // Semantik ve pragmatik öbürlerinden belirgin biçimde (≥ 0,75 z) öndeyse örüntü "semantik-pragmatik"tir,
  // başka alanlar da hafifçe etkilenmiş olsa bile; yaygın (global) tür yalnız baskın bir alan çifti yokken seçilir
  const rest = Math.max(form, z.phonological, z.fluency);
  const semPragDominant = z.semantic >= HIGH && z.pragmatic >= HIGH && Math.min(z.semantic, z.pragmatic) - rest >= 0.75;
  let id = 'typical';
  if (high.length >= 4 && !semPragDominant) id = 'global';
  else if (z.semantic >= HIGH && z.pragmatic >= HIGH && form < Math.min(z.semantic, z.pragmatic)) id = 'semantic_pragmatic';
  else if (z.semantic >= HIGH && z.fluency < HIGH && form < z.semantic) id = 'semantic';
  else if (form >= HIGH && z.fluency >= 1) id = 'agrammatic';
  else if (z.phonological >= HIGH && z.fluency >= 1) id = 'logopenic';
  else if (z.pragmatic >= HIGH) id = 'pragmatic';
  else if (z.fluency >= HIGH) id = 'fluency';
  else if (high.length) id = high.includes('semantic') ? 'semantic' : high.includes('morphological') || high.includes('syntactic') ? 'agrammatic' : high.includes('phonological') ? 'logopenic' : 'mild';
  else if (any) id = 'mild';
  const t = PROFILE_TYPES.find((x) => x.id === id);
  const ranked = [...domains].filter((d) => d.z != null).sort((a, b) => b.z - a.z);
  return { id, label: t.label, note: t.note || '', affected: high, ranked: ranked.map((d) => ({ id: d.id, label: d.label, z: d.z })) };
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
  const small = f.totalWords != null && f.totalWords < 100 ? ` Örnek kısa olduğu için (${fmt(f.totalWords)} sözcük) oranlar küçük örneklem düzeltmesiyle referansa doğru çekildi; olasılıklar yine de geniş bir belirsizlik taşır.` : '';
  const caveat = `Bu çıktı tanı koymaz; ${scored.model.kind === 'team' ? 'ekip verisiyle eğitilmiş' : 'henüz kalibre edilmemiş, literatüre dayalı önsel katsayılar kullanan'} bir modelden gelir ve DKT değerlendirmesinin yerine geçmez.${scored.confidenceReasons.length ? ` Güveni düşüren etkenler: ${scored.confidenceReasons.join('; ')}.` : ''}${small}`;
  const likely = (scored.domains || []).filter((d) => d.level >= 1).sort((a, b) => b.p - a.p);
  const domainText = !scored.domains ? '' : likely.length
    ? `Alan bazlı öngörü: ${likely.map((d) => `${d.label.toLocaleLowerCase('tr-TR')} (%${fmt(d.p * 100)}, ${PROGRAM_DOMAIN_LEVELS[d.level].toLocaleLowerCase('tr-TR')})`).join(', ')}. Örüntü türü: ${scored.profile?.label.toLocaleLowerCase('tr-TR') || '—'}.`
    : 'Alan bazlı öngörü: hiçbir dil alanında 12 ay içinde bozulma olası görünmüyor.';
  return { findings: out, inference, domainText, riskText, caveat };
}

// ---------------------------------------------------------------------------
// Alan bazlı tümevarımsal gerekçe: gözlem → ara çıkarım → sonuç
// ---------------------------------------------------------------------------
/** Her ölçüt bozulma yönünde belirginse hangi ara çıkarıma kanıt olduğu. */
const INFER = {
  semantic: {
    iuCoverage: 'resimdeki temel kavramların çoğu adlandırılmıyor; kavramsal-anlamsal içerik daralıyor',
    infoDensity: 'çok sözcük az bilgi taşıyor; anlam sözcüklere yeterince yüklenemiyor',
    offTopicRatio: 'resimde bulunmayan kavramlar anlatıya giriyor; sözcük–kavram eşlemesinde kayma var',
    vagueRate: 'hedef sözcük yerine "şey, burada" gibi içi boş sözcükler kullanılıyor; anlamsal erişim zorlanıyor',
    semanticErrorRate: 'anlamca yakın ama yanlış sözcükler seçiliyor (anlamsal parafazi); semantik ağ bozuluyor',
    mattr: 'aynı sözcükler tekrar tekrar kullanılıyor; etkin anlamsal dağarcık daralıyor',
  },
  pragmatic: {
    promptRatio: 'anlatım ancak terapistin sık yönlendirmesiyle sürdürülebiliyor; söylemi bağımsız planlama ve sürdürme güçleşiyor',
    questionRate: 'görev soruyla terapiste geri yöneltiliyor; görev çerçevesini ve konuşma rolünü koruma güçleşiyor',
    offTopicRatio: 'anlatı resmin konusundan uzaklaşıyor; konu sürdürme (topic maintenance) zayıflıyor',
    inappropriateRate: 'bağlama uymayan ifadeler kullanılıyor; sosyal-dilsel ketleme azalıyor',
    eventCoverage: 'olaylar birbirine bağlanıp bir hikâyeye dönüştürülemiyor; anlatının makro yapısı zayıf',
    connectivesPerUtt: 'sözceler bağlaçlarla birbirine bağlanmıyor; söylem bağdaşıklığı düşük',
  },
  morphological: {
    morphemesPerWord: 'sözcükler daha az ekle kuruluyor; çekim ve yapım eklerinde yalınlaşma var',
    subordinateRatio: 'eklerle kurulan fiilimsi yapılar (-ıp, -ınca, -dığı) az kullanılıyor',
    morphErrorRate: 'ek seçimi ya da ek sırası hataları kodlanmış',
    unknownRate: 'sözlükte karşılığı olmayan ya da ek dizilimi çözümlenemeyen biçimler üretiliyor',
  },
  syntactic: {
    mluW: 'sözceler kısalıyor; cümle planlama kapasitesi daralıyor',
    clauseDensity: 'sözce başına yüklem az; basit ve tek yüklemli yapılara yöneliniyor',
    predicateRatio: 'sözceler yüklemsiz, yarım bırakılıyor (telgrafik anlatım)',
    subordinateRatio: 'yan cümle kurulmuyor; karmaşık cümle yapıları kullanılmıyor',
  },
  phonological: {
    phonRate: 'hedef sözcüğe ses düzeyinde benzeyen yanlış biçimler (fonolojik parafazi adayı) var',
    unknownRate: 'sözlükte bulunmayan biçimler üretiliyor (neolojizm ya da ses düzeyinde bozulma adayı)',
    fragmentRate: 'sözcükler başlanıp yarıda bırakılıyor; ses planlamasında kesintiler var',
  },
  fluency: {
    wpm: 'konuşma hızı düşük',
    pauseRatio: 'konuşmanın önemli bir kısmı sessizlikle geçiyor',
    meanPause: 'duraksamalar uzun; sözcük ve cümle planlaması zaman alıyor',
    longPausesPerMin: 'sık uzun (≥ 2 sn) duraksama var; erişim ve planlama kesintileri',
    repetitionRate: 'tekrar ve düzeltmeler sık; akış kesintiye uğruyor',
  },
};

const CONCLUDE = {
  semantic: 'semantik dil alanında (anlam, adlandırma, bilgi içeriği) bozulma',
  pragmatic: 'pragmatik alanda (konu sürdürme, söylem düzeni, dil kullanımı) bozulma',
  morphological: 'morfolojik alanda (ek kullanımı, biçimbilimsel karmaşıklık) bozulma',
  syntactic: 'sözdizimsel alanda (cümle uzunluğu ve karmaşıklığı) bozulma',
  phonological: 'fonolojik alanda (sözcüğün ses yapısı) bozulma',
  fluency: 'akıcılıkta (hız, duraksama, tekrar) bozulma',
};

const fmtFeat = (k, v) => {
  const def = FEATURE_DEFS[k];
  if (v == null) return '—';
  if (def.pct) return pct(v);
  return `${fmt(v, def.d ?? 1)}${def.unit ? ` ${def.unit}` : ''}`;
};

/** Ölçütün somut örnekleri (danışanın kendi sözleri). */
function examplesFor(k, detail = {}, ctx = {}) {
  const q = (a, n = 4) => (a || []).slice(0, n).filter(Boolean);
  switch (k) {
    case 'offTopicRatio': return q(detail.offTopicWords);
    case 'vagueRate': return q(detail.vagueWords);
    case 'questionRate': return q(detail.participantQuestions, 3);
    case 'inappropriateRate': return q(detail.inappropriateWords);
    case 'unknownRate': return q(detail.unknownWords);
    case 'phonRate': return q((detail.phonCandidates || []).map((c) => (c.target ? `${c.word} (→ ${c.target})` : c.word)));
    case 'predicateRatio': return q(detail.noPredicateExamples, 3);
    case 'iuCoverage': return q((detail.iuMissing || []).map((id) => ctx.iuLabel?.(id) || id).filter((l) => !/\(olay\)/.test(l)), 5);
    default: return [];
  }
}

/**
 * Tümevarımsal gerekçe: her alan için belirgin gözlemler (değer, referans, örnek),
 * bunlardan çıkan ara çıkarım ve alan düzeyinde sonuç.
 * @param {object} scored scoreSample() çıktısı
 */
export function domainReasoning(scored, features, detail = {}, ctx = {}) {
  const domains = scored.domains || [];
  const unverified = !ctx.verified;
  return domains.map((d) => {
    const strong = d.evidence.filter((e) => e.bad >= 1);
    const obs = (strong.length ? strong : d.evidence.slice(0, 1)).slice(0, 4).map((e) => {
      const def = FEATURE_DEFS[e.feat];
      // Küçük örneklem düzeltmesi değeri belirgin biçimde değiştirdiyse düzeltilmiş değer de yazılır
      const moved = e.adj != null && e.value != null && Math.abs(e.adj - e.value) > Math.max(1e-9, 0.25 * (FEATURE_DEFS[e.feat].sd || 0));
      const adjTxt = moved ? `kısa örnek düzeltmesiyle ~${fmtFeat(e.feat, e.adj)}; ` : '';
      return {
        feat: e.feat,
        label: def.label,
        z: e.z,
        text: `${def.label}: ${fmtFeat(e.feat, e.value)} (${adjTxt}referans ~${fmtFeat(e.feat, e.ref)}; ${lvl(e.bad)})`,
        examples: e.bad >= 1 ? examplesFor(e.feat, detail, ctx) : [],
      };
    });
    const mids = strong.map((e) => INFER[d.id]?.[e.feat]).filter(Boolean).slice(0, 3);
    const inference = mids.length
      ? `${mids.length > 1 ? 'Bu gözlemler birlikte' : 'Bu gözlem'} şunu gösteriyor: ${mids.join('; ')}.`
      : 'Bu alandaki ölçütler referans aralığına yakın; bozulmayı düşündüren tutarlı bir gözlem yok.';
    const pp = d.p == null ? null : Math.round(d.p * 100);
    const lv = d.level == null ? null : PROGRAM_DOMAIN_LEVELS[d.level].toLocaleLowerCase('tr-TR');
    const conclusion = d.p == null ? 'Bu alan için yeterli ölçüm yok.'
      : d.level >= 2 ? `Sonuç: gözlemler aynı yönde birleştiği için önümüzdeki 12 ayda ${CONCLUDE[d.id]} ${lv} (%${pp}).`
      : d.level === 1 ? `Sonuç: tek tük kanıt var; 12 ay içinde ${CONCLUDE[d.id]} olası (%${pp}), izlemde yeniden bakılmalı.`
      : `Sonuç: 12 ay içinde ${CONCLUDE[d.id]} beklenmiyor (%${pp}).`;
    let caveat = '';
    if (unverified && ['phonological', 'morphological'].includes(d.id)) caveat = 'Otomatik transkriptte ses düzeyindeki hatalar gerçek sözcüğe "düzeltilmiş" olabilir; bu alanın kanıtı transkript doğrulanınca güvenilir olur.';
    else if (d.available < 2) caveat = 'Bu alan için ölçülebilen kanıt sayısı az.';
    return { id: d.id, label: d.label, long: d.long, p: d.p, z: d.z, level: d.level, observations: obs, inference, conclusion, caveat };
  });
}

/** Örüntü türünün gerekçesi: hangi alanlar birlikte etkilenmiş, hangileri korunmuş. */
export function profileReasoning(scored) {
  const pr = scored.profile;
  if (!pr) return '';
  const doms = scored.domains || [];
  const lab = (id) => doms.find((d) => d.id === id)?.label.toLocaleLowerCase('tr-TR');
  const names = (list) => list.map((d) => d.label.toLocaleLowerCase('tr-TR')).join(', ');
  const scoredD = doms.filter((d) => d.z != null).sort((a, b) => b.z - a.z);
  // Türü belirleyen alanlar; kalan etkilenmiş alanlar ikincil sayılır
  const defining = { semantic_pragmatic: ['semantic', 'pragmatic'], semantic: ['semantic'], agrammatic: ['morphological', 'syntactic', 'fluency'], logopenic: ['phonological', 'fluency'], pragmatic: ['pragmatic'], fluency: ['fluency'] }[pr.id];
  const dominant = scoredD.filter((d) => d.z >= 1 && (defining ? defining.includes(d.id) : d.z >= 1.5));
  const secondary = scoredD.filter((d) => d.z >= 1 && !dominant.includes(d));
  const spared = scoredD.filter((d) => d.z < 1);
  if (pr.id === 'typical') return 'Hiçbir dil alanında belirgin ayrışma yok; bu örnek tipik bir anlatım örüntüsüne uyuyor.';
  if (pr.id === 'mild') return `Bazı ölçütler referanstan hafifçe ayrışıyor${pr.ranked[0] ? ` (en çok ${lab(pr.ranked[0].id)})` : ''}, ancak hiçbir alan belirgin düzeye ulaşmıyor; bir türe bağlamak için erken.`;
  const parts = [];
  parts.push(dominant.length ? `Türü belirleyen alanlar: ${names(dominant)}` : `En çok ayrışan alan: ${lab(pr.ranked[0]?.id)}`);
  if (secondary.length) parts.push(`daha az belirgin etkilenenler: ${names(secondary)}`);
  if (spared.length) parts.push(`görece korunanlar: ${names(spared)}`);
  return `${parts.join('; ')}. Alanların bu birlikteliği "${pr.label.toLocaleLowerCase('tr-TR')}" türüne işaret ediyor. ${pr.note}`;
}
