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
  return results;
}
