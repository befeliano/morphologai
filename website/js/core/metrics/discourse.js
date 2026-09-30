/**
 * Kaza resmi protokolü — söylem ölçütleri (L1–L8 kodlama şeması).
 *
 * Yalnız DANIŞAN sözceleri kullanılır (terapist "T:" satırları dışarıda). Konuşma hızı ve
 * duraksamalar, konuşmacı etiketli bölümler varsa yalnız danışanın konuştuğu aralıklardan,
 * yoksa tüm kayıttan hesaplanır (timingSource ile belirtilir).
 *
 * Bilgi birimleri (IU): uyarıcı resimde görünen 14 varlık + 8 olay. Bir birim, danışanın
 * sözcüklerinde (kök ya da yüzey biçim) anahtar sözcüklerinden biri geçtiğinde sayılır; bazı
 * olaylar aynı sözcede iki sözcük grubunun birlikte geçmesini ister ("polis … durduruyor").
 */

export const PROTOCOL_ID = 'kaza-v1';

export const ACCIDENT_IU = [
  // Varlıklar
  { id: 'otobus', label: 'Otobüs', type: 'varlık', any: ['otobüs', 'midibüs', 'minibüs', 'dolmuş'] },
  { id: 'araba', label: 'Araba (mavi otomobil)', type: 'varlık', any: ['araba', 'otomobil', 'araç', 'taksi', 'oto', 'kamyonet', 'binek'] },
  { id: 'ambulans', label: 'Ambulans', type: 'varlık', any: ['ambulans', 'cankurtaran', 'kızılay', 'hilal'] },
  { id: 'polis', label: 'Polis / trafik görevlisi', type: 'varlık', any: ['polis', 'memur', 'komiser', 'jandarma', 'bekçi', 'trafikçi'] },
  { id: 'yarali', label: 'Yerde yatan yaralı', type: 'varlık', any: ['yaralı', 'kazazede', 'ölü', 'ceset', 'yaralanan'] },
  { id: 'saglikci', label: 'Sağlık görevlisi', type: 'varlık', any: ['doktor', 'hemşire', 'sağlıkçı', 'paramedik', 'hastabakıcı', 'acilci'] },
  { id: 'sedye', label: 'Sedye', type: 'varlık', any: ['sedye'] },
  { id: 'kalabalik', label: 'Kalabalık / izleyenler', type: 'varlık', any: ['kalabalık', 'insan', 'halk', 'seyirci', 'millet', 'meraklı', 'vatandaş', 'ahali', 'topluluk'] },
  { id: 'cocuk', label: 'Çocuk(lar)', type: 'varlık', any: ['çocuk', 'oğlan', 'kız', 'velet'] },
  { id: 'lamba', label: 'Trafik lambası', type: 'varlık', any: ['lamba', 'ışık', 'sinyal', 'semafor'] },
  { id: 'gecit', label: 'Yaya geçidi', type: 'varlık', any: ['geçit', 'zebra', 'çizgi'] },
  { id: 'yol', label: 'Yol / cadde', type: 'varlık', any: ['yol', 'cadde', 'sokak', 'kavşak', 'kaldırım', 'asfalt'] },
  { id: 'kan', label: 'Kan', type: 'varlık', any: ['kan'] },
  { id: 'parca', label: 'Kırık cam / parçalar', type: 'varlık', any: ['cam', 'parça', 'enkaz', 'kırık', 'hurda'] },
  // Olaylar
  { id: 'e_kaza', label: 'Kaza / çarpışma olmuş', type: 'olay', any: ['kaza', 'çarp', 'çarpış', 'tosla', 'vur', 'çarpışma'] },
  { id: 'e_hasar', label: 'Araç ezilmiş / hasar görmüş', type: 'olay', any: ['ez', 'parçala', 'kır', 'hasar', 'dağıl', 'buruş', 'göçük', 'mahvol', 'yamul', 'hurdahaş'] },
  { id: 'e_yatma', label: 'Bir kişi yaralanıp yerde yatıyor', type: 'olay', any: ['yat', 'düş', 'yaralan', 'bayıl', 'öl', 'uzan'] },
  { id: 'e_ambulans', label: 'Ambulans gelmiş / bekliyor', type: 'olay', all: [['ambulans', 'cankurtaran'], ['gel', 'çağır', 'bekle', 'dur', 'yetiş', 'var', 'git']] },
  { id: 'e_tasima', label: 'Yaralı sedyeyle taşınıyor', type: 'olay', any: ['taşı', 'götür', 'bindir'], all: [['sedye', 'yaralı', 'hasta', 'adam', 'kadın', 'kişi'], ['kaldır', 'yükle', 'koy', 'al', 'it']] },
  { id: 'e_polis', label: 'Polis trafiği yönetiyor / insanları durduruyor', type: 'olay', all: [['polis', 'memur', 'trafikçi', 'görevli'], ['yönet', 'düdük', 'çal', 'durdur', 'işaret', 'el', 'kaldır', 'engelle', 'uzaklaş', 'göster', 'kontrol', 'bekle', 'dur']] },
  { id: 'e_izleme', label: 'İnsanlar olayı izliyor', type: 'olay', all: [['kalabalık', 'insan', 'halk', 'seyirci', 'millet', 'meraklı', 'vatandaş', 'çocuk', 'kadın', 'adam'], ['izle', 'seyret', 'topla', 'merak', 'bak', 'bekle']] },
  { id: 'e_yardim', label: 'Yardım / müdahale ediliyor', type: 'olay', any: ['yardım', 'kurtar', 'müdahale', 'tedavi', 'ilkyardım'] },
];

/** Resimde yer alan ya da resmi anlatırken olağan sözcükler (konu dışı sayılmaz). */
const SCENE_WORDS = new Set([
  ...ACCIDENT_IU.flatMap((u) => [...(u.any || []), ...(u.all || []).flat()]),
  ...`şey yer taraf ön arka üst alt yan orta köşe resim fotoğraf kişi adam kadın insan abi abla teyze amca dede nine bey hanım
  şoför sürücü yolcu kapı pencere teker tekerlek bina ev apartman ağaç duvar direk düdük el kol bacak baş kafa yüz ayak saç
  hastane acil kaza olay durum zaman an gün hava renk mavi kırmızı beyaz sarı yeşil şapka üniforma elbise kıyafet gözlük
  çanta ses siren korna trafik ekip görevli şehir mahalle dükkan cadde bayan erkek genç yaşlı aile anne baba çoluk tane
  sağ sol karşı ara içeri dışarı motor kaput plaka far ön cam şişe yağ benzin fren hız kalabalık yardım`.split(/\s+/).filter(Boolean),
]);

/** Bağlama uygun olmayan (kaba / ünlem) ifadeler — pragmatik kanıt. */
const INAPPROPRIATE = new Set(['lan', 'ulan', 'be', 'hay', 'kahretsin', 'lanet', 'defol', 'salak', 'aptal', 'gerizekalı']);

const CONNECTIVES = new Set(['ve', 'sonra', 'ardından', 'ama', 'fakat', 'ancak', 'çünkü', 'yüzden', 'ayrıca', 'hem', 'veya', 'yoksa', 'böylece', 'dolayısıyla', 'lakin', 'oysa', 'derken', 'önce']);
const DEICTIC_PLACE = new Set(['burada', 'burda', 'orada', 'orda', 'şurada', 'şurda', 'buraya', 'oraya', 'şuraya', 'burası', 'orası', 'şurası']);

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const r = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));

function keyMatches(key, tok) {
  if (tok.root === key || tok.norm === key) return true;
  return key.length >= 4 && (tok.norm.startsWith(key) || tok.root.startsWith(key));
}

/** MTLD (McCarthy & Jarvis, 2010): ileri ve geri geçişlerin ortalaması; 50 sözcükten az örnekte hesaplanmaz. */
export function mtld(tokens, threshold = 0.72) {
  if (tokens.length < 50) return null;
  const once = (list) => {
    let factors = 0;
    let types = new Set();
    let count = 0;
    for (const w of list) {
      count++;
      types.add(w);
      if (types.size / count <= threshold) { factors++; types = new Set(); count = 0; }
    }
    if (count > 0) factors += (1 - types.size / count) / (1 - threshold);
    return factors > 0 ? list.length / factors : null;
  };
  const f = once(tokens);
  const b = once([...tokens].reverse());
  return f != null && b != null ? (f + b) / 2 : f ?? b;
}

/**
 * @param {object} result   analyzeSession çıktısı (utterances, language, fluency)
 * @param {object} o        { segments: konuşmacı etiketli bölümler [{start,end,speaker}], acoustic: akustik özet }
 * @returns {{features: object, detail: object}}
 */
// language.js'teki yüklemli sözce ölçütüyle aynı tanım (çekimli eylem, ek-fiil, var/yok/değil)
const hasPredicate = (t) => t.kind === 'word' && !t.excluded && t.a
  && ((t.a.verb && t.a.verb.finite) || t.a.pos === 'cop' || (t.a.morphemes || []).some((m) => m.cat === 'ek-fiil') || ['var', 'yok', 'değil'].includes(t.a.root));

export function computeProtocolMeasures(result, { segments = [], acoustic = null } = {}) {
  const L = result.language;
  const F = result.fluency;
  const part = result.utterances.filter((u) => u.speaker !== 'examiner');
  const exam = result.utterances.filter((u) => u.speaker === 'examiner');
  const toks = [];
  for (const u of part) {
    for (const t of u.tokens) {
      if (t.kind !== 'word' || !t.a) continue;
      toks.push({ u: u.index ?? part.indexOf(u), norm: String(t.norm || '').toLocaleLowerCase('tr-TR'), root: String(t.a.root || '').toLocaleLowerCase('tr-TR'), pos: t.a.pos, t });
    }
  }
  const produced = L.words.produced || 0;
  const per100 = (n) => (produced ? (100 * n) / produced : null);

  // ---- L1 zamanlama: yalnız danışanın konuştuğu aralıklar ----
  let timingSource = 'whole';
  let wpm = F?.wpm ?? null;
  let pauseRatio = F?.pauseRatio ?? null;
  let meanPause = F?.meanPause ?? null;
  let longPausesPerMin = F?.longPausesPerMin ?? null;
  let speakingSec = F?.speakingTimeSec ?? null;
  // Danışan aralıkları transkript satırlarından türetilir (sonradan "T:" düzeltmeleri de yansır):
  // satırın başlangıcı zaman damgasından, bitişi eşleşen otomatik bölümden ya da sonraki satırdan
  const lineMap = new Map();
  for (const u of result.utterances) {
    if (!lineMap.has(u.lineNo)) lineMap.set(u.lineNo, { start: u.start, speaker: u.speaker, words: 0 });
    const l = lineMap.get(u.lineNo);
    if (l.start == null && u.start != null) l.start = u.start;
    l.words += u.tokens.filter((t) => t.kind === 'word').length;
  }
  const timedLines = [...lineMap.values()].filter((l) => l.start != null).sort((a, b) => a.start - b.start);
  const segEnd = (start) => {
    let best = null;
    for (const s of segments) {
      if (s.start == null || s.end == null) continue;
      const d = Math.abs(s.start - start);
      if (d < 1.0 && (!best || d < best.d)) best = { d, end: s.end };
    }
    return best ? best.end : null;
  };
  const maxT = acoustic?.durationSec ?? Infinity;
  const partSegs = timedLines.map((l, i) => {
    const next = timedLines[i + 1]?.start;
    let end = segEnd(l.start) ?? next ?? l.start + Math.max(1, l.words * 0.5);
    if (next != null) end = Math.min(end, next);
    return { start: l.start, end: Math.min(end, maxT), speaker: l.speaker };
  }).filter((s) => s.speaker !== 'examiner' && s.end > s.start);
  const window = partSegs.reduce((s, x) => s + (x.end - x.start), 0);
  if (partSegs.length && window >= 5 && acoustic?.speechSegments) {
    timingSource = 'participant';
    const speech = partSegs.reduce((acc, p) => acc + acoustic.speechSegments.reduce((a, s) => a + overlap(p.start, p.end, s.start, s.end), 0), 0);
    const inner = (acoustic.pauses || []).filter((pz) => partSegs.some((p) => pz.start >= p.start - 0.05 && pz.end <= p.end + 0.05));
    wpm = produced ? produced / (window / 60) : null;
    pauseRatio = Math.max(0, Math.min(1, 1 - speech / window));
    meanPause = inner.length ? inner.reduce((s, x) => s + x.dur, 0) / inner.length : 0;
    longPausesPerMin = inner.filter((x) => x.dur >= 2).length / (window / 60);
    speakingSec = speech;
  } else if (!F && L.timing?.spanSec) {
    timingSource = 'estimate';
    wpm = produced / (L.timing.spanSec / 60);
  }

  // ---- L2 sözcük dağarcığı ----
  const forms = part.flatMap((u) => u.tokens.filter((t) => t.kind === 'word' && !t.excluded).map((t) => String(t.norm || '').toLocaleLowerCase('tr-TR')));

  // ---- L3 sözcük erişimi ----
  const deictic = toks.filter((x) => DEICTIC_PLACE.has(x.norm)).length;
  const fillers = (L.disfluency?.fillers || 0) + (L.disfluency?.discourseMarkers || 0);

  // ---- L4 referans ----
  const pronouns = toks.filter((x) => x.pos === 'pron').length;

  // ---- L5 biçim-sözdizim ----
  const suffixTypes = new Set();
  for (const x of toks) for (const m of x.t.a.morphemes || []) if (m.tag && m.tag !== 'ROOT') suffixTypes.add(m.tag);
  const verbsTotal = L.verbs?.total || 0;
  const includedUtts = L.utterances?.included || part.length || 0;
  const converbs = toks.filter((x) => x.t.a.verb && x.t.a.verb.form === 'converb').length;

  // ---- L6 bilgi birimleri ----
  const byUtt = new Map();
  for (const x of toks) { if (!byUtt.has(x.u)) byUtt.set(x.u, []); byUtt.get(x.u).push(x); }
  const found = [];
  for (const iu of ACCIDENT_IU) {
    let ok = !!(iu.any && toks.some((x) => iu.any.some((k) => keyMatches(k, x))));
    if (!ok && iu.all) {
      for (const list of byUtt.values()) {
        if (iu.all.every((group) => list.some((x) => group.some((k) => keyMatches(k, x))))) { ok = true; break; }
      }
    }
    if (ok) found.push(iu.id);
  }
  const entities = ACCIDENT_IU.filter((u) => u.type === 'varlık');
  const events = ACCIDENT_IU.filter((u) => u.type === 'olay');
  const foundSet = new Set(found);

  // ---- L7 bağlantı ----
  const connectives = toks.filter((x) => CONNECTIVES.has(x.norm)).length;

  // ---- L8 konu uygunluğu ----
  const inappropriate = toks.filter((x) => INAPPROPRIATE.has(x.norm));
  const byCode = L.errors?.byCode || {};
  const nouns = toks.filter((x) => x.pos === 'noun' && !DEICTIC_PLACE.has(x.norm));
  const offTopic = nouns.filter((x) => !SCENE_WORDS.has(x.root) && !SCENE_WORDS.has(x.norm) && ![...SCENE_WORDS].some((k) => k.length >= 5 && x.norm.startsWith(k)));

  const features = {
    // L1
    totalWords: produced,
    mluW: L.mluW,
    wpm: r(wpm, 1),
    pauseRatio: r(pauseRatio, 3),
    meanPause: r(meanPause, 2),
    longPausesPerMin: r(longPausesPerMin, 2),
    speakingSec: r(speakingSec, 1),
    // L2 — 50 sözcükten kısa örnekte çeşitlilik yapay olarak yüksek çıkar; hesaplanmaz
    mattr: produced >= 50 ? (L.mattrForm ?? L.ttrForm ?? null) : null,
    mtld: r(mtld(forms), 1),
    nounVerbRatio: L.nounVerbRatio,
    contentRatio: L.contentRatio,
    repetitionRate: L.disfluency?.repetitionRate ?? null,
    // L3
    fillerRate: r(per100(fillers), 2),
    vagueRate: r(per100((L.lexical?.emptyWords || 0) + deictic), 2),
    wordFindingRate: r(per100(L.lexical?.wordFindingComments || 0), 2),
    // L4
    pronounRatio: produced ? r(pronouns / produced, 3) : null,
    // L5
    clauseDensity: includedUtts ? r(verbsTotal / includedUtts, 2) : null,
    subordinateRatio: verbsTotal ? r((L.verbs?.nonfinite || 0) / verbsTotal, 3) : null,
    morphemesPerWord: L.morphemesPerWord,
    suffixTypes: suffixTypes.size,
    // L6
    iuCount: found.length,
    iuTotal: ACCIDENT_IU.length,
    iuCoverage: r(found.length / ACCIDENT_IU.length, 3),
    infoDensity: produced ? r((100 * found.length) / produced, 2) : null,
    eventCoverage: r(events.filter((e) => foundSet.has(e.id)).length / events.length, 3),
    // L7
    connectivesPerUtt: includedUtts ? r(connectives / includedUtts, 2) : null,
    converbsPerUtt: includedUtts ? r(converbs / includedUtts, 2) : null,
    // L8
    offTopicRatio: nouns.length ? r(offTopic.length / nouns.length, 3) : null,
    // Alan bazlı çıkarım için ek kanıtlar
    promptRatio: r(exam.length / Math.max(1, part.length), 2),                        // danışan sözcesi başına terapist yönlendirmesi
    questionRate: part.length ? r(part.filter((u) => u.question).length / part.length, 3) : null, // görevi soruyla geri yöneltme
    inappropriateRate: r(per100(inappropriate.length), 2),
    unknownRate: L.errors?.unknownRate ?? null,                                     // sözlük dışı / biçimi bozuk sözcük
    phonRate: r(per100((L.errors?.phonologicalCandidates?.length || 0) + (byCode.p || 0) + (byCode.f || 0) + (byCode.n || 0)), 2),
    semanticErrorRate: r(per100(byCode.s || 0), 2),
    morphErrorRate: r(per100((byCode.m || 0) + (byCode.g || 0)), 2),
    predicateRatio: L.verbs?.utterancesWithPredicate ?? null,                       // yüklemli sözce oranı
    fragmentRate: L.disfluency?.fragmentRate ?? null,
    // Örnek bilgisi
    participantUtterances: part.length,
    nounCount: nouns.length,     // küçük örneklem düzeltmesi için paydalar
    verbCount: verbsTotal,
    examinerUtterances: exam.length,
    examinerWords: exam.reduce((s, u) => s + u.tokens.filter((t) => t.kind === 'word').length, 0),
  };
  return {
    features,
    detail: {
      timingSource,
      iuFound: found,
      iuMissing: ACCIDENT_IU.filter((u) => !foundSet.has(u.id)).map((u) => u.id),
      entitiesFound: entities.filter((e) => foundSet.has(e.id)).length,
      eventsFound: events.filter((e) => foundSet.has(e.id)).length,
      offTopicWords: [...new Set(offTopic.map((x) => x.t.text))].slice(0, 20),
      vagueWords: [...new Set(toks.filter((x) => DEICTIC_PLACE.has(x.norm) || x.t.emptyFiller || x.norm === 'şey').map((x) => x.t.text))].slice(0, 12),
      // Tümevarımsal gerekçe için somut örnekler (danışanın kendi sözleri)
      participantQuestions: part.filter((u) => u.question).map((u) => u.raw?.trim() || '').filter(Boolean).slice(0, 6),
      unknownWords: (L.errors?.unknownList || []).slice(0, 10),
      phonCandidates: (L.errors?.phonologicalCandidates || []).slice(0, 8),
      inappropriateWords: [...new Set(inappropriate.map((x) => x.t.text))].slice(0, 6),
      noPredicateExamples: part.filter((u) => u.included && !u.tokens.some(hasPredicate)).map((u) => u.raw?.trim() || '').filter(Boolean).slice(0, 5),
    },
  };
}
