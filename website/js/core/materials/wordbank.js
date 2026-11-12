/**
 * Sözcük bankası — materyal üreticilerin sözcük kaynağı.
 *
 * Üç kaynak birleştirilir:
 *  1. Çekirdek liste (aşağıda): çocukların gündelik dağarcığından, somut ve resmedilebilir sözcükler;
 *     kategori etiketlidir. Ekip listeden sözcük gizleyebilir.
 *  2. Ekip sözcükleri: ekibin eklediği sözcükler ve çekirdek sözcüklere verdiği kategori/yaş/görsel bilgisi.
 *  3. Genel sözlük (Zemberek kökleri): "geniş arama" açıldığında kullanılır; yaş uygunluğu bilinmez,
 *     bu yüzden varsayılan olarak kapalıdır ve sonuçlarda işaretlenir.
 *
 * Hece ve ses bilgisi saklanmaz; phonetics.js ile sözcükten hesaplanır.
 */
import { syllabify, positionsOf, normalizeTarget } from '../text/phonetics.js';
import { trLower, harmA, lastVowel } from '../text/normalize.js';

export const CATEGORIES = [
  { id: 'hayvan', label: 'Hayvanlar' }, { id: 'yiyecek', label: 'Yiyecek ve içecek' }, { id: 'esya', label: 'Ev eşyaları' },
  { id: 'giysi', label: 'Giysiler' }, { id: 'vucut', label: 'Vücut' }, { id: 'tasit', label: 'Taşıtlar' },
  { id: 'doga', label: 'Doğa' }, { id: 'okul', label: 'Okul ve oyun' }, { id: 'kisi', label: 'Kişiler ve meslekler' },
  { id: 'yer', label: 'Yerler' }, { id: 'eylem', label: 'Eylemler' }, { id: 'nitelik', label: 'Renk ve nitelik' },
];

export const AGE_BANDS = [
  { id: '2-4', label: '2–4 yaş' }, { id: '4-7', label: '4–7 yaş' }, { id: '7-12', label: '7–12 yaş' }, { id: '12+', label: '12 yaş ve üzeri' },
];

const SEED = {
  hayvan: `kedi köpek kuş balık at inek koyun keçi tavuk horoz civciv ördek kaz tavşan fare aslan kaplan ayı kurt tilki fil zürafa maymun
    zebra deve eşek kuzu arı karınca kelebek böcek örümcek sinek yılan kaplumbağa kurbağa timsah penguen baykuş kartal leylek papağan
    sincap kirpi geyik yunus balina köpekbalığı ahtapot yengeç salyangoz uğurböceği çekirge hindi güvercin serçe kanguru panda gergedan`,
  yiyecek: `ekmek su süt peynir yumurta bal reçel zeytin çay çorba pilav makarna et tavuk köfte patates domates salatalık biber soğan
    havuç elma armut muz portakal mandalina çilek kiraz karpuz kavun üzüm şeftali kayısı erik limon nar incir ceviz fındık fıstık
    pasta kek kurabiye bisküvi çikolata şeker dondurma simit börek pizza yoğurt ayran tuz un pirinç mısır bezelye fasulye ıspanak
    lahana marul sarımsak tereyağı sucuk mercimek nohut meyve sebze`,
  esya: `masa sandalye koltuk yatak dolap kapı pencere halı perde lamba ayna saat telefon televizyon bilgisayar buzdolabı fırın ocak
    tabak bardak kaşık çatal bıçak tencere tava çaydanlık fincan sürahi şişe kavanoz kova süpürge havlu sabun tarak fırça makas
    anahtar çanta cüzdan şemsiye yastık yorgan battaniye çekmece raf merdiven soba çamaşır ütü kumanda radyo vazo sepet kutu
    mum çivi çekiç testere ip iğne düğme fermuar gözlük bavul ampul priz musluk küvet lavabo çöp`,
  giysi: `gömlek pantolon etek elbise kazak ceket mont hırka çorap ayakkabı terlik çizme bot şapka bere atkı eldiven kemer pijama
    tişört şort mayo yelek kravat papyon önlük eşofman`,
  vucut: `baş saç göz kulak burun ağız dudak diş dil yanak çene boyun omuz kol dirsek el parmak tırnak göğüs karın sırt bel bacak
    diz ayak topuk kaş kirpik alın yüz bıyık sakal kalp`,
  tasit: `araba otobüs kamyon tren uçak gemi vapur kayık bisiklet motosiklet traktör ambulans itfaiye taksi minibüs helikopter
    tramvay metro roket kızak yelkenli vinç tekerlek direksiyon`,
  doga: `güneş ay yıldız bulut yağmur kar rüzgar gökkuşağı deniz göl nehir dağ orman ağaç çiçek yaprak çimen taş toprak kum ateş
    şimşek gökyüzü dünya ada şelale mağara buz dal kök tohum gül papatya lale çam mantar dere tarla bahçe çamur duman gölge`,
  okul: `kalem defter kitap silgi kalemtıraş cetvel boya kağıt tahta sıra top bebek uçurtma balon salıncak kaydırak oyuncak
    oyun yapboz kukla davul gitar piyano flüt resim harita bayrak zil düdük ip kart zar tebeşir yapıştırıcı küre pergel`,
  kisi: `anne baba kardeş abla ağabey bebek çocuk kız oğlan dede nine teyze amca dayı hala arkadaş öğretmen doktor hemşire polis
    asker itfaiyeci aşçı şoför pilot çiftçi berber terzi fırıncı garson öğrenci kaptan ressam şarkıcı postacı dişçi kasap balıkçı marangoz`,
  yer: `ev okul park bahçe sokak cadde market bakkal hastane eczane fırın köy şehir oda mutfak banyo salon balkon çatı bodrum
    sınıf kütüphane sinema lokanta otel köprü yol durak liman havaalanı çiftlik hayvanat müze cami stadyum plaj pazar garaj`,
  eylem: `gel git ye iç uyu koş yürü otur kalk bak gör duy söyle konuş oku yaz çiz boya oyna zıpla atla tırman yüz düş tut at
    ver al aç kapat yıka sil giy çıkar tara kes pişir ağla gül öp sarıl bekle dinle sev iste bul kaybet taşı it çek
    vur kır yap boz topla dağıt sakla ara sor anlat öğren unut`,
  nitelik: `kırmızı mavi sarı yeşil turuncu mor pembe siyah beyaz kahverengi gri büyük küçük uzun kısa şişman zayıf sıcak soğuk
    ıslak kuru temiz kirli yeni eski hızlı yavaş ağır hafif sert yumuşak tatlı ekşi acı tuzlu güzel çirkin mutlu üzgün kızgın
    yorgun aç tok dolu boş açık kapalı yüksek alçak kalın ince geniş dar`,
};

/** Çekirdek liste: [{word, category}] — tekrarlar ilk kategoride kalır. */
export const SEED_WORDS = (() => {
  const seen = new Set();
  const out = [];
  for (const [category, text] of Object.entries(SEED)) {
    for (const w of text.trim().split(/\s+/)) {
      if (seen.has(w)) continue;
      seen.add(w);
      out.push({ word: w, category });
    }
  }
  return out;
})();

const WORD_OK = /^[a-zçğıöşüâîû]{2,14}$/;

function entry(word, extra = {}) {
  const syl = syllabify(word);
  return { word, syllables: syl.length, syl, category: null, ageBand: null, mediaId: null, source: 'seed', pos: null, ...extra };
}

/**
 * Bankayı kurar.
 * @param {object} o { custom: ekip sözcükleri [{word, category, ageBand, mediaId, hidden}], lexicon: Lexicon (isteğe bağlı), wide: genel sözlüğü kat }
 * @returns {Array<{word, syllables, syl, category, ageBand, mediaId, source, pos}>}
 */
export function buildBank({ custom = [], lexicon = null, wide = false } = {}) {
  const map = new Map();
  for (const s of SEED_WORDS) map.set(s.word, entry(s.word, { category: s.category, ageBand: '2-4', pos: s.category === 'eylem' ? 'verb' : s.category === 'nitelik' ? 'adj' : 'noun' }));
  for (const c of custom) {
    const w = trLower(c.word || '').trim();
    if (!w) continue;
    if (c.hidden) { map.delete(w); continue; }
    const prev = map.get(w);
    map.set(w, entry(w, {
      ...(prev || {}), source: prev ? prev.source : 'custom',
      category: c.category ?? prev?.category ?? null, ageBand: c.ageBand ?? prev?.ageBand ?? null, mediaId: c.mediaId ?? null,
    }));
  }
  if (wide && lexicon) {
    const hidden = new Set(custom.filter((c) => c.hidden).map((c) => trLower(c.word || '')));
    for (const e of lexicon.entries.values()) {
      if (!['noun', 'adj', 'verb'].includes(e.pos)) continue;
      const root = trLower(e.root || '');
      if (!WORD_OK.test(root) || map.has(root) || hidden.has(root)) continue;
      map.set(root, entry(root, { source: 'lexicon', pos: e.pos }));
    }
  }
  return [...map.values()];
}

/** Fiil kökünü mastar hâline getirir (gel → gelmek); materyalde gösterim için. */
export function infinitive(root) {
  const v = lastVowel(root);
  return v ? `${root}m${harmA(v)}k` : root;
}

export const POSITIONS = [
  { id: 'initial', label: 'Sözcük başı', short: 'SB' },
  { id: 'medial', label: 'Sözcük ortası', short: 'SO' },
  { id: 'final', label: 'Sözcük sonu', short: 'SS' },
  { id: 'medialOnset', label: 'Sözcük ortası, hece başı', short: 'SOHB' },
  { id: 'medialCoda', label: 'Sözcük ortası, hece sonu', short: 'SOHS' },
];

const parseList = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map(normalizeTarget).filter(Boolean);

/**
 * Bankayı süzer ve neden az sonuç çıktığını açıklar.
 * @param {Array} bank buildBank() çıktısı
 * @param {object} f { targets, positions, syllables, exclude, categories, ageBand, onlyWithImage, allTargets }
 * @returns {{words: Array, steps: Array<{label, count}>, hint: string|null}}
 */
export function filterWords(bank, f = {}) {
  const targets = parseList(f.targets);
  const exclude = parseList(f.exclude);
  const positions = (f.positions || []).filter(Boolean);
  const syllables = (f.syllables || []).map(Number).filter(Boolean);
  const cats = (f.categories || []).filter(Boolean);
  const steps = [{ label: 'Bankadaki sözcük', count: bank.length }];
  let list = bank;
  const step = (label, fn, active) => {
    if (!active) return;
    list = list.filter(fn);
    steps.push({ label, count: list.length });
  };
  step(`Kategori (${cats.length})`, (w) => cats.includes(w.category), cats.length > 0);
  step('Yaş bandı', (w) => !w.ageBand || w.ageBand === f.ageBand, !!f.ageBand);
  step(`Hece sayısı (${syllables.join(', ')})`, (w) => syllables.includes(Math.min(w.syllables, 5)), syllables.length > 0);
  step(`Hedef ses (${targets.join(', ')})`, (w) => {
    const hits = targets.map((t) => positionsOf(w.word, t));
    return f.allTargets ? hits.every((h) => h.count > 0) : hits.some((h) => h.count > 0);
  }, targets.length > 0);
  step('Ses pozisyonu', (w) => targets.some((t) => {
    const p = positionsOf(w.word, t);
    return positions.some((id) => p[id]);
  }), targets.length > 0 && positions.length > 0);
  step(`Hariç tutulan sesler (${exclude.join(', ')})`, (w) => exclude.every((t) => positionsOf(w.word, t).count === 0), exclude.length > 0);
  step('Yalnız görseli olanlar', (w) => !!w.mediaId, !!f.onlyWithImage);

  // Sonuç yetersizse en çok daraltan adımı söyle
  let hint = null;
  if (list.length < 6 && steps.length > 1) {
    let worst = null;
    for (let i = 1; i < steps.length; i++) {
      const lost = steps[i - 1].count - steps[i].count;
      if (steps[i - 1].count > 0 && (!worst || lost / steps[i - 1].count > worst.ratio)) worst = { ratio: lost / steps[i - 1].count, label: steps[i].label, before: steps[i - 1].count, after: steps[i].count };
    }
    if (worst) hint = `En çok daraltan ölçüt: ${worst.label} (${worst.before} → ${worst.after} sözcük). Bu ölçütü gevşetin${f.wide ? '' : ' ya da "geniş sözlük" seçeneğini açın'}.`;
  }
  // Sıra: görseli olanlar, sonra bankadakiler (genel sözlük en sonda), adlar eylem ve niteliklerden önce, kısa sözcükler önce
  const rank = (w) => (w.mediaId ? 0 : 1) * 100 + (w.source === 'lexicon' ? 1 : 0) * 10 + (w.pos === 'noun' || !w.pos ? 0 : 1);
  const words = [...list].sort((a, b) => rank(a) - rank(b) || a.syllables - b.syllables || a.word.localeCompare(b.word, 'tr'));
  return { words, steps, hint };
}
