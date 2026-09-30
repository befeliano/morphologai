/**
 * MorphologAI — motor regresyon testleri (tarayıcıda çalışır: /dev/tests.html)
 * Biçim: [kelime, beklenen ayrıştırma ("kök+ek+ek"), beklenen tür?]
 * Tür kısaltmaları: n isim, v fiil, a sıfat, d zarf, p zamir, t belirleyici, c bağlaç, o edat, u sayı, q soru, x özel isim
 */
import { loadLexicon } from '../js/core/text/lexicon.js';
import { analyzeWord } from '../js/core/text/morphology.js';
import { analyzeSession } from '../js/core/analysis.js';

const POS = { n: 'noun', v: 'verb', a: 'adj', d: 'adv', p: 'pron', t: 'det', c: 'conj', o: 'postp', u: 'num', q: 'ques', x: 'prop', g: 'neg' };

export const WORD_CASES = [
  // Şimdiki zaman, ünlü daralması
  ['gidiyorum', 'git+iyor+um', 'v'], ['geliyorum', 'gel+iyor+um', 'v'], ['istiyorum', 'iste+yor+um', 'v'],
  ['görüyorum', 'gör+üyor+um', 'v'], ['istemiyorum', 'iste+mi+yor+um', 'v'], ['bekliyor', 'bekle+yor', 'v'],
  ['başlıyor', 'başla+yor', 'v'], ['anlıyor', 'anla+yor', 'v'], ['söylüyor', 'söyle+yor', 'v'], ['diyor', 'de+yor', 'v'],
  ['yiyor', 'ye+yor', 'v'], ['oynuyor', 'oyna+yor', 'v'], ['ağlıyor', 'ağla+yor', 'v'], ['koşuyor', 'koş+uyor', 'v'],
  ['düşüyor', 'düş+üyor', 'v'], ['yürüyordu', 'yürü+yor+du', 'v'], ['bilmiyorum', 'bil+mi+yor+um', 'v'],
  ['hatırlamıyorum', 'hatırla+mı+yor+um', 'v'], ['konuşamıyorum', 'konuş+amı+yor+um', 'v'],
  ['söyleyemiyorum', 'söyle+yemi+yor+um', 'v'], ['çalışıyordum', 'çalış+ıyor+du+m', 'v'], ['geliyorlardı', 'gel+iyor+lar+dı', 'v'],
  ['istemiyordum', 'iste+mi+yor+du+m', 'v'], ['ağrıyor', 'ağrı+yor', 'v'], ['okuyor', 'oku+yor', 'v'],
  // Geçmiş zaman
  ['geldim', 'gel+di+m', 'v'], ['geldin', 'gel+di+n', 'v'], ['gittik', 'git+ti+k', 'v'], ['yaptım', 'yap+tı+m', 'v'],
  ['okudum', 'oku+du+m', 'v'], ['baktım', 'bak+tı+m', 'v'], ['gelmedi', 'gel+me+di', 'v'], ['yapmadım', 'yap+ma+dı+m', 'v'],
  ['bulamadım', 'bul+ama+dı+m', 'v'], ['anlamadım', 'anla+ma+dı+m', 'v'], ['yazdı', 'yaz+dı', 'v'], ['dedi', 'de+di', 'v'],
  ['verdi', 'ver+di', 'v'], ['aldı', 'al+dı', 'v'], ['oldu', 'ol+du', 'v'], ['gitti', 'git+ti', 'v'], ['koştu', 'koş+tu', 'v'],
  ['yürüdü', 'yürü+dü', 'v'], ['düştü', 'düş+tü', 'v'], ['gelemedim', 'gel+eme+di+m', 'v'], ['hatırlayamadım', 'hatırla+yama+dı+m', 'v'],
  ['geldiniz', 'gel+di+niz', 'v'], ['geldiler', 'gel+di+ler', 'v'],
  // Gelecek, geniş, diğer kipler
  ['yapacağım', 'yap+acağ+ım', 'v'], ['gidecek', 'git+ecek', 'v'], ['gelmeyecek', 'gel+me+yecek', 'v'], ['gelir', 'gel+ir', 'v'],
  ['yapar', 'yap+ar', 'v'], ['okur', 'oku+r', 'v'], ['gelmez', 'gel+me+z', 'v'], ['gelmem', 'gel+me+m', 'v'],
  ['gelmeyiz', 'gel+me+yiz', 'v'], ['gelmiş', 'gel+miş', 'v'], ['gelmişti', 'gel+miş+ti', 'v'], ['gelmiştir', 'gel+miş+tir', 'v'],
  ['gelmeli', 'gel+meli', 'v'], ['gelmeliyim', 'gel+meli+yim', 'v'], ['gelse', 'gel+se', 'v'], ['gelseydi', 'gel+se+ydi', 'v'],
  ['gelebilir', 'gel+ebil+ir', 'v'], ['gelebiliyorum', 'gel+ebil+iyor+um', 'v'], ['gelemez', 'gel+eme+z', 'v'],
  ['gelsin', 'gel+sin', 'v'], ['gelelim', 'gel+e+lim', 'v'], ['geleyim', 'gel+e+yim', 'v'], ['gelirken', 'gel+ir+ken', 'v'],
  ['ederim', 'et+er+im', 'v'], ['gideyim', 'git+e+yim', 'v'], ['yapabilirim', 'yap+abil+ir+im', 'v'], ['konuşmakta', 'konuş+makta', 'v'],
  ['gelsene', 'gel+sene', 'v'],
  // Konuşma dili
  ['geliyom', 'gel+iyo+m', 'v'], ['bilmiyom', 'bil+mi+yo+m', 'v'], ['yapıyoz', 'yap+ıyo+z', 'v'], ['gidicem', 'git+ice+m', 'v'],
  // Fiilimsiler
  ['geldiğimde', 'gel+diğ+im+de', 'v'], ['gittiğini', 'git+tiğ+i+ni', 'v'], ['gelen', 'gel+en', 'v'], ['gelenler', 'gel+en+ler', 'v'],
  ['gelince', 'gel+ince', 'v'], ['gelip', 'gel+ip', 'v'], ['gelerek', 'gel+erek', 'v'], ['gelmeden', 'gel+meden', 'v'],
  ['geldikçe', 'gel+dikçe', 'v'], ['gelmek', 'gel+mek', 'v'], ['gelmekten', 'gel+mek+ten', 'v'], ['gelmesi', 'gel+me+si', 'v'],
  ['gelmeyi', 'gel+me+yi', 'v'],
  // Çatı (yapım eki: sayılmaz)
  ['yapıldı', 'yap+ıl+dı', 'v'], ['yaptırdım', 'yap+tır+dı+m', 'v'], ['okunuyor', 'oku+n+uyor', 'v'],
  // İsim çekimi, ses olayları
  ['kitabı', 'kitap+ı', 'n'], ['kitabım', 'kitap+ım', 'n'], ['ağacı', 'ağaç+ı', 'n'], ['çocuğu', 'çocuk+u', 'n'],
  ['rengi', 'renk+i', 'n'], ['ağzı', 'ağız+ı', 'n'], ['burnu', 'burun+u', 'n'], ['oğlu', 'oğul+u', 'n'],
  ['resmi', 'resim+i', 'n'], ['ismi', 'isim+i', 'n'], ['hakkı', 'hak+ı', 'n'], ['saati', 'saat+i', 'n'],
  ['evlerimizden', 'ev+ler+imiz+den', 'n'], ['arabalarımız', 'araba+lar+ımız', 'n'], ['kapıyı', 'kapı+yı', 'n'],
  ['suyu', 'su+yu', 'n'], ['çayı', 'çay+ı', 'n'], ['annem', 'anne+m', 'n'], ['babam', 'baba+m', 'n'],
  ['kardeşim', 'kardeş+im', 'n'], ['kurabiyeyi', 'kurabiye+yi', 'n'], ['kavanozdan', 'kavanoz+dan', 'n'],
  ['tabureden', 'tabure+den', 'n'], ['masaya', 'masa+ya', 'n'], ['okula', 'okul+a', 'n'], ['anneme', 'anne+m+e', 'n'],
  ['annemin', 'anne+m+in', 'n'], ['annesinin', 'anne+si+nin', 'n'], ['evindeki', 'ev+i+nde+ki', 'n'],
  ['evdekiler', 'ev+de+ki+ler', 'n'], ['arkadaşımla', 'arkadaş+ım+la', 'n'], ['hastaneye', 'hastane+ye', 'n'],
  ['ilacımı', 'ilaç+ım+ı', 'n'], ['bardağı', 'bardak+ı', 'n'], ['çocuklar', 'çocuk+lar', 'n'], ['telefonla', 'telefon+la', 'n'],
  ['kitapları', 'kitap+lar+ı', 'n'], ['öğretmenlerimiz', 'öğretmen+ler+imiz', 'n'], ['buzdolabına', 'buzdolabı+n+a', 'n'],
  // Yalın kelimeler (bölünmemeli)
  ['kurabiye', 'kurabiye', 'n'], ['masa', 'masa', 'n'], ['araba', 'araba', 'n'], ['kadın', 'kadın', 'n'], ['adam', 'adam', 'n'],
  ['kalem', 'kalem', 'n'], ['insan', 'insan', 'n'], ['zaman', 'zaman', 'n'], ['bardak', 'bardak', 'n'], ['ayakkabı', 'ayakkabı', 'n'],
  ['bulaşık', 'bulaşık', 'n'], ['tabure', 'tabure', 'n'], ['yemek', 'yemek', 'n'], ['ekmek', 'ekmek', 'n'], ['gelin', 'gelin', 'n'],
  // Ek-fiil
  ['hastaydı', 'hasta+ydı'], ['evdeyim', 'ev+de+yim', 'n'], ['güzeldi', 'güzel+di', 'a'], ['öğretmenim', 'öğretmen+im', 'n'],
  ['vardı', 'var+dı', 'a'], ['yoktu', 'yok+tu', 'a'], ['değilim', 'değil+im', 'g'], ['değildi', 'değil+di', 'g'],
  // Zamirler
  ['bana', 'ben+a', 'p'], ['sana', 'sen+a', 'p'], ['onu', 'o+nu', 'p'], ['ona', 'o+na', 'p'], ['onunla', 'o+nun+la', 'p'],
  ['benimle', 'ben+im+le', 'p'], ['bunlar', 'bu+nlar', 'p'], ['bunu', 'bu+nu', 'p'], ['hepsini', 'hepsi+ni', 'p'],
  ['neyi', 'ne+yi', 'p'], ['nereye', 'nere+ye', 'p'], ['kendisi', 'kendi+si', 'p'],
  // Soru eki
  ['misin', 'mi+sin', 'q'], ['miyim', 'mi+yim', 'q'],
  // Özel ad, sayı, kesme işareti
  ["Ankara'ya", 'Ankara+ya', 'x'], ["Ali'nin", 'Ali+nin', 'x'], ["3'te", '3+te', 'u'], ["20'ye", '20+ye', 'u'],
  // Yapım ekleri
  ['tuzsuz', 'tuz+suz', 'a'], ['gözlüklü', 'gözlük+lü', 'a'], ['kitaplık', 'kitap+lık', 'n'],
];

export const SENTENCE_CASES = [
  // [cümle, kelime sırası (0'dan), beklenen tür, açıklama]
  ['Ayşe Hanım yüz lira verdi.', 2, 'u', 'yüz lira → sayı'],
  ['Ayşe Hanım yüz lira verdi.', 1, 'n', 'Hanım → saygı sözcüğü'],
  ['yaz tatilinde denize gittik.', 0, 'n', 'yaz tatili → mevsim'],
  ['mektup yaz dedi.', 1, 'v', 'mektup yaz → fiil'],
  ['kız kardeşi de bakıyor.', 0, 'n', 'kız kardeşi → isim tamlaması'],
  ['kız kardeşi de bakıyor.', 2, 'c', 'de → bağlaç'],
  ['bu kitap çok güzel.', 0, 't', 'bu + isim → belirleyici'],
  ['bunu ben yaptım.', 1, 'p', 'ben → zamir'],
  ['yemek istiyorum.', 0, 'v', 'yemek istiyorum → mastar'],
  ['akşam yemek yaptım.', 1, 'n', 'yemek yaptım → isim'],
  ['gelecek hafta gelecek.', 0, 'n', 'gelecek hafta → zaman'],
  ['gelecek hafta gelecek.', 2, 'v', 'cümle sonu → gelecek zaman'],
];

function chainOf(a) {
  return a.morphemes.map((m) => m.display).join('+');
}

export async function runAll() {
  await loadLexicon(new URL('../', import.meta.url).href);
  const results = [];
  for (const [w, exp, pos] of WORD_CASES) {
    const a = analyzeWord(w, { initial: false });
    const got = chainOf(a);
    const okSeg = got.toLocaleLowerCase('tr-TR') === exp.toLocaleLowerCase('tr-TR');
    const okPos = !pos || a.pos === POS[pos];
    results.push({ kind: 'word', input: w, expected: exp + (pos ? ` [${POS[pos]}]` : ''), got: `${got} [${a.pos}]`, ok: okSeg && okPos, count: a.morphemeCount });
  }
  for (const [s, idx, pos, note] of SENTENCE_CASES) {
    const r = analyzeSession({ transcript: s });
    const words = r.utterances[0].tokens.filter((t) => t.kind === 'word');
    const t = words[idx];
    const ok = t && t.a.pos === POS[pos];
    results.push({ kind: 'context', input: `${s} (#${idx + 1})`, expected: `${POS[pos]} — ${note}`, got: t ? `${chainOf(t.a)} [${t.a.pos}]${t.a.context ? ' · ' + t.a.context.rule : ''}` : '—', ok });
  }
  await studyTests(results);
  return results;
}

// ---------------------------------------------------------------------------
// Öngörü çalışması: konuşmacı ayrımı, protokol ölçütleri, model ve istatistikler
// ---------------------------------------------------------------------------
async function studyTests(results) {
  const { textCue, labelSpeakers } = await import('../js/core/text/speakers.js');
  const { computeProtocolMeasures } = await import('../js/core/metrics/discourse.js');
  const { scoreSample, monthlyProjection, fitTeamModel } = await import('../js/core/metrics/prognosis.js');
  const { predictionMetrics, weightedKappa, fleissKappa } = await import('../js/core/metrics/studyStats.js');
  const add = (input, expected, got, ok) => results.push({ kind: 'öngörü', input, expected, got: String(got), ok: !!ok });

  const cues = [
    ['Bu resmi anlatır mısınız?', 'examiner'], ['Burda neler görüyorsunuz?', 'examiner'], ['Başka ne var?', 'examiner'],
    ['Tamam.', 'examiner'], ['Hıhı', 'examiner'], ['Bilmiyorum.', 'participant'], ['Anlatacağımız bitti mi?', null],
    ['Bunlar kuş mu?', null], ['Araba otobüse çarpmış.', null],
  ];
  for (const [t, exp] of cues) { const c = textCue(t); add(`ipucu: ${t}`, exp || 'ipucu yok', c.speaker || 'ipucu yok', c.speaker === exp); }

  // Ses perdesi: iki ses, metin ipucu terapist kümesini belirler
  const track = { t: [], hz: [] };
  for (let t = 0; t < 40; t += 0.1) { track.t.push(Number(t.toFixed(1))); track.hz.push(t % 10 < 5 ? 210 : 120); }
  const segs = [0, 10, 20, 30].flatMap((b) => [{ text: 'Neler görüyorsunuz?', start: b + 0.5, end: b + 4.5 }, { text: 'bir araba var', start: b + 5.5, end: b + 9.5 }]);
  segs[2].text = 'hmm bakayım'; // ipucusuz terapist bölümü → ses perdesinden
  const lab = labelSpeakers(segs, { f0Track: track });
  add('ses perdesiyle ayrım', 'terapist bölüm 3 ses perdesinden', `${lab.segments[2].speaker}/${lab.segments[2].speakerSource}`, lab.segments[2].speaker === 'examiner' && lab.segments[2].speakerSource === 'pitch');
  const btn = labelSpeakers([{ text: 'araba var', start: 1, end: 3 }], { therapistIntervals: [[0.8, 3.2]] });
  add('terapist tuşu', 'examiner/button', `${btn.segments[0].speaker}/${btn.segments[0].speakerSource}`, btn.segments[0].speakerSource === 'button');

  // Protokol ölçütleri: terapist satırı ölçüte girmez, bilgi birimleri eşleşir
  const tx = 'T: Bu resimde neler oluyor, anlatır mısınız?\nBir kaza olmuş, mavi araba otobüse çarpmış.\nYerde yaralı bir adam yatıyor, ambulans gelmiş.\nPolis kalabalığı durduruyor.';
  const r = analyzeSession({ transcript: tx, final: true });
  const m = computeProtocolMeasures(r, {});
  add('terapist sözcükleri dışarıda', 'danışan 17 sözcük', m.features.totalWords, m.features.totalWords === 17);
  const need = ['otobus', 'araba', 'ambulans', 'polis', 'e_kaza', 'e_yatma', 'e_ambulans', 'e_polis'];
  add('bilgi birimleri', need.join(','), m.detail.iuFound.join(','), need.every((x) => m.detail.iuFound.includes(x)));

  // Model: daha bozuk örnek daha yüksek risk; aylık birikim artan
  const lo = scoreSample({ totalWords: 200, wpm: 110, iuCoverage: 0.7, eventCoverage: 0.7, fillerRate: 2, vagueRate: 1, pronounRatio: 0.07, mluW: 6.5 }, { age: 68, education: 11 });
  const hi = scoreSample({ totalWords: 60, wpm: 55, iuCoverage: 0.2, eventCoverage: 0.1, fillerRate: 12, vagueRate: 9, pronounRatio: 0.16, mluW: 3 }, { age: 68, education: 11 });
  add('risk sıralaması', 'bozuk > %50 > %30 > sağlıklı', `${Math.round(hi.risk * 100)} > ${Math.round(lo.risk * 100)}`, hi.risk > lo.risk && lo.risk < 0.3 && hi.risk > 0.5);
  const mp = monthlyProjection(0.5);
  add('aylık birikimli risk', '12. ay = %50, artan', `${Math.round(mp[11].p * 100)}`, Math.abs(mp[11].p - 0.5) < 1e-9 && mp.every((x, i) => i === 0 || x.p > mp[i - 1].p));
  add('ekip modeli eşiği', '12 vakadan azsa kullanılmaz', fitTeamModel([{ composite: 1, developed: true }]).used, fitTeamModel([{ composite: 1, developed: true }]).used === false);

  // İstatistikler
  const pm = predictionMetrics([{ p: 0.9, y: true }, { p: 0.2, y: false }, { p: 0.6, y: false }, { p: 0.4, y: true }]);
  add('doğruluk / AUC', 'doğruluk 0,5 · AUC 0,75', `${pm.accuracy} · ${pm.auc}`, pm.accuracy === 0.5 && pm.auc === 0.75);
  add('ağırlıklı kappa (tam uyum)', '1', weightedKappa([[0, 0], [1, 1], [2, 2], [3, 3]]), weightedKappa([[0, 0], [1, 1], [2, 2], [3, 3]]) === 1);
  const fk = fleissKappa([[0, 0], [3, 3], [1, 1], [2, 2]]);
  add('Fleiss kappa (tam uyum)', '1', fk?.kappa, fk && Math.abs(fk.kappa - 1) < 1e-9);

  // Alan bazlı öngörü ve örüntü türü
  const { domainReasoning, profileReasoning } = await import('../js/core/metrics/prognosis.js');
  const { outcomeDomainSet, domainAccuracy } = await import('../js/app/study.js');
  const NORMAL = {
    totalWords: 180, mluW: 6, wpm: 105, pauseRatio: 0.35, meanPause: 0.9, longPausesPerMin: 1, mattr: 0.72, mtld: 55, repetitionRate: 2,
    fillerRate: 4, vagueRate: 3, wordFindingRate: 0.3, pronounRatio: 0.08, clauseDensity: 1.3, subordinateRatio: 0.25, morphemesPerWord: 1.95,
    iuCoverage: 0.6, infoDensity: 9, eventCoverage: 0.55, connectivesPerUtt: 0.5, offTopicRatio: 0.12, promptRatio: 0.2, questionRate: 0.03,
    inappropriateRate: 0, semanticErrorRate: 0.2, morphErrorRate: 0.3, predicateRatio: 0.85, unknownRate: 1, phonRate: 0.3, fragmentRate: 0.5,
  };
  const dom = (s, id) => s.domains.find((d) => d.id === id);
  const typ = scoreSample(NORMAL, { age: 65, education: 8 });
  add('tür: tipik örnek', 'typical, alanlar < %25', `${typ.profile.id} · en yüksek %${Math.round(Math.max(...typ.domains.map((d) => d.p)) * 100)}`, typ.profile.id === 'typical' && typ.domains.every((d) => d.level === 0));
  const semPrag = scoreSample({ ...NORMAL, iuCoverage: 0.15, infoDensity: 3, offTopicRatio: 0.45, vagueRate: 8, promptRatio: 1, questionRate: 0.2, eventCoverage: 0.1 }, { age: 66, education: 5 });
  add('tür: semantik-pragmatik', 'semantic_pragmatic; semantik & pragmatik ≥ %50, morfoloji < %25',
    `${semPrag.profile.id} · sem %${Math.round(dom(semPrag, 'semantic').p * 100)} · prag %${Math.round(dom(semPrag, 'pragmatic').p * 100)} · morf %${Math.round(dom(semPrag, 'morphological').p * 100)}`,
    semPrag.profile.id === 'semantic_pragmatic' && dom(semPrag, 'semantic').p >= 0.5 && dom(semPrag, 'pragmatic').p >= 0.5 && dom(semPrag, 'morphological').p < 0.25);
  const agr = scoreSample({ ...NORMAL, morphemesPerWord: 1.4, subordinateRatio: 0.05, mluW: 2.5, clauseDensity: 0.6, predicateRatio: 0.5, wpm: 50, pauseRatio: 0.6 }, { age: 66, education: 8 });
  add('tür: agramatik', 'agrammatic; semantik < %25', `${agr.profile.id} · sem %${Math.round(dom(agr, 'semantic').p * 100)}`, agr.profile.id === 'agrammatic' && dom(agr, 'semantic').p < 0.25);
  const reas = domainReasoning(semPrag, { ...NORMAL, offTopicRatio: 0.45 }, { offTopicWords: ['kuş', 'deniz'], participantQuestions: ['Ne diyeyim?'] }, { verified: true });
  const semR = reas.find((d) => d.id === 'semantic');
  const pragR = reas.find((d) => d.id === 'pragmatic');
  add('tümevarım: gözlem → çıkarım → sonuç', 'semantik gözleminde "kuş", pragmatikte soru örneği, sonuç %',
    `${semR.observations.flatMap((o) => o.examples).join('/')} · ${pragR.observations.flatMap((o) => o.examples).join('/')}`,
    semR.observations.some((o) => o.examples.includes('kuş')) && pragR.observations.some((o) => o.examples.includes('Ne diyeyim?')) && /%\d+/.test(semR.conclusion) && semR.inference.length > 20);
  add('tür gerekçesi', 'etkilenen ve korunan alanlar sayılır', profileReasoning(semPrag).slice(0, 60), /semantik/.test(profileReasoning(semPrag)) && /korunan/.test(profileReasoning(semPrag)));
  const unv = domainReasoning(semPrag, NORMAL, {}, { verified: false }).find((d) => d.id === 'phonological');
  add('doğrulanmamış transkript uyarısı', 'fonolojik alanda uyarı', unv.caveat ? 'var' : 'yok', !!unv.caveat);

  // Baskın alan çifti: dört alan belirgin olsa da semantik-pragmatik öndeyse tür semantik-pragmatiktir
  const dom4 = scoreSample({ ...NORMAL, iuCoverage: 0, offTopicRatio: 0.5, promptRatio: 1.2, questionRate: 0.25, morphemesPerWord: 1.6, subordinateRatio: 0.08, mluW: 3, clauseDensity: 0.7, predicateRatio: 0.6 }, { age: 66, education: 8 });
  add('tür: baskın semantik-pragmatik', 'semantic_pragmatic (biçim de etkilenmiş)', `${dom4.profile.id} · ${dom4.domains.map((d) => `${d.id} ${d.z.toFixed(1)}`).join(' ')}`, dom4.profile.id === 'semantic_pragmatic');

  // Küçük örneklem düzeltmesi: 24 sözcükte tek bir uygunsuz sözcük, 240 sözcükteki on taneyle aynı ağırlıkta değildir
  const few = scoreSample({ ...NORMAL, totalWords: 24, inappropriateRate: 4.17 }, {});
  const many = scoreSample({ ...NORMAL, totalWords: 240, inappropriateRate: 4.17 }, {});
  add('küçük örneklem düzeltmesi', 'z(24 sözcük) < z(240 sözcük)', `${few.z.inappropriateRate.toFixed(2)} < ${many.z.inappropriateRate.toFixed(2)}`, few.z.inappropriateRate < many.z.inappropriateRate && few.z.inappropriateRate < 4);
  const burda = analyzeWord('Burda', { initial: true });
  add('konuşma dili: burda', 'bilinen sözcük (bura+da)', `${burda.known} · ${burda.root}`, burda.known === true && /bura/.test(burda.root || ''));

  // Protokol: terapist yönlendirmesi ve danışanın soruları
  const tx2 = 'T: Anlatır mısınız?\nBurda bir şey var.\nNe diyeyim?\nT: Başka ne var?\nAraba otobüse çarpmış.';
  const m2 = computeProtocolMeasures(analyzeSession({ transcript: tx2, final: true }), {});
  add('yönlendirme ve soru oranı', 'promptRatio 0,67 · questionRate 0,333', `${m2.features.promptRatio} · ${m2.features.questionRate}`, m2.features.promptRatio === 0.67 && m2.features.questionRate === 0.333 && m2.detail.participantQuestions.some((q) => /diyeyim/.test(q)));

  // Alan doğruluğu
  const none = outcomeDomainSet({ status: 'not_developed' });
  const devSet = outcomeDomainSet({ status: 'developed', domains: ['semantic', 'pragmatic'] });
  const acc = domainAccuracy({ semantic: true, pragmatic: false, morphological: false, syntactic: null }, devSet);
  add('alan isabeti', 'gelişmedi → boş küme; 2/3', `${none.size} · ${acc.correct}/${acc.total}`, none.size === 0 && acc.correct === 2 && acc.total === 3 && outcomeDomainSet({ status: 'developed' }) === null && outcomeDomainSet({ status: 'unclear' }) === null);
}
