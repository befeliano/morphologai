/**
 * Dil havuzları: bağlamsal çözümleme ve klinik söylem göstergeleri için
 * elle derlenmiş sözcük/ifade listeleri.
 *
 *  - Dolgu sesleri ve söylem belirleyicileri (MLU'dan çıkarılır, ayrıca sayılır)
 *  - Boş / belirsiz sözcükler (adlandırma güçlüğü göstergesi: "şey", "zımbırtı")
 *  - Kelime bulma güçlüğü (üstdilsel) ifadeleri ("adı neydi", "aklıma gelmiyor")
 *  - Saygı/unvan sözcükleri (özel ad bağlamı: "Ayşe Hanım", "Doktor Ali")
 *  - Ölçü sözcükleri (sayı bağlamı: "yüz lira", "iki bardak")
 *  - Eş sesli (sesteş) sözcükler ve bağlam ipuçları
 */

const set = (s) => new Set(s.trim().split(/\s+/));

/** Saf dolgu sesleri (duraksama dolgusu). */
export const FILLERS = set(`
ı ıı ııı ıııı ıh ıhh ııh ıhı e ee eee eeee eh ehh ehm em emm ım ımm ımmm hı hıı hım hımm hmm hmmm mm mmm mmmm
öö ööö öh
`);

/** Söylem belirleyicileri (dolgu işlevli sözcükler). Varsayılan: MLU'dan çıkarılır. */
export const DISCOURSE_MARKERS = set('yani işte hani falan filan felan fln şeyy');

/** Tek başına evet/hayır/onay yanıtları (MLU'da genellikle dışlanır). */
export const YESNO = set('evet hayır tamam peki olur yok he hee hıhı aynen tabii tabi elbette hayhay');

/** Boş/belirsiz sözcük kökleri (adlandırma güçlüğü göstergesi). */
export const EMPTY_LEMMAS = set('şey zımbırtı zamazingo falan filan nesne ıvır zıvır şeysi');

/** Kelime bulma güçlüğüne işaret eden üstdilsel ifadeler (sözce metninde aranır). */
export const WORD_FINDING_PATTERNS = [
  /\badı\s+ne(ydi|ymiş)?\b/, /\bismi\s+ne(ydi)?\b/, /\bne\s+di(yorlar|yordum|yeyim|yelim)\b/, /\bne\s+deniyor\b/,
  /\bne\s+derler\b/, /\bnasıl\s+(desem|diyeyim|söylesem|anlatsam)\b/, /\bhatırla(yamıyorum|mıyorum|yamadım)\b/,
  /\baklıma\s+gel(mi|e)/, /\bbula(mıyorum|madım)\b/, /\bunuttum\b/, /\bsöyle(yemiyorum|yemedim)\b/,
  /\bdilimin\s+ucunda\b/, /\bbilemedim\b/, /\bçıkaramadım\b/, /\bneydi\b/, /\bo\s+şey\s+işte\b/,
];

/** Özel adı izleyen saygı/akrabalık sözcükleri. */
export const HONORIFICS = set('bey beyi beyin beye hanım hanımı hanımın hanıma hoca hocam hocanın amca amcam teyze teyzem abla ablam abi abim ağabey ağabeyim dayı dayım hala halam nine dede efendi usta paşa ağa bacı');

/** Özel adın önüne gelen unvanlar. */
export const TITLES = set('doktor dr dr. sayın hemşire öğretmen hoca avukat profesör prof doçent doç müdür başkan kaptan dkt');

/** Ölçü/sayı sözcükleri: bir sayıdan sonra geldiklerinde sayı okumasını güçlendirir. */
export const MEASURE_NOUNS = set(`
tane adet kez defa kere kişi yıl sene ay hafta gün saat dakika saniye lira kuruş dolar euro avro kilo gram litre
metre santim kilometre derece kat bardak kaşık dilim parça porsiyon yaş numara sayfa sıra kutu paket şişe çift
tabak fincan kavanoz torba poşet kova kalem kişilik yaşında
`);

export const NUMBER_WORDS = set('sıfır bir iki üç dört beş altı yedi sekiz dokuz on yirmi otuz kırk elli altmış yetmiş seksen doksan yüz bin milyon milyar yarım çeyrek birkaç kaç');

/** Belirleyiciler: arkasından isim/sıfat gelirse belirleyici, gelmezse zamir/sayı okuması. */
export const DETERMINERS = set('bu şu o bir her hiçbir bazı birkaç birçok tüm bütün öbür diğer');

/** Tümleç olarak mastar/isim-fiil alan fiiller ("yemek istiyorum" → mastar). */
export const INF_GOVERNORS = set('iste başla sev bil çalış dene unut bırak vazgeç karar alış zorla hazırlan');

/**
 * Eş sesli sözcükler: yüzey biçimi → anlamlar ve bağlam ipuçları.
 * prev/next: komşu sözcüğün lemması (kök) bu kümelerden biriyse puan eklenir.
 * prefer: {pos, root} seçilecek okuma. gloss: arayüzde gösterilecek açıklama.
 */
export const HOMONYMS = {
  yüz: [
    { gloss: 'sayı (100)', prefer: { pos: 'num' }, prev: 'bir iki üç dört beş altı yedi sekiz dokuz', next: 'MEASURE', bonus: 4 },
    { gloss: 'surat', prefer: { pos: 'noun' }, next: 'yıka gül boya kızar döndür bak göz', prev: 'güzel temiz asık kırmızı', bonus: 3 },
    { gloss: 'yüzmek', prefer: { pos: 'verb' }, prev: 'deniz havuz göl su nehir', bonus: 3 },
  ],
  gül: [
    { gloss: 'çiçek', prefer: { pos: 'noun' }, prev: 'kırmızı beyaz pembe sarı demet bir', next: 'kokla koku bahçe dal yaprak ağaç', bonus: 3 },
    { gloss: 'gülmek', prefer: { pos: 'verb' }, prev: 'çok hep yine biraz', bonus: 2 },
  ],
  yaz: [
    { gloss: 'mevsim', prefer: { pos: 'noun' }, prev: 'bu geçen gelecek her sıcak', next: 'tatil mevsim ay gün akşam sıcak', bonus: 3 },
    { gloss: 'yazmak', prefer: { pos: 'verb' }, prev: 'mektup yazı not isim ad kalem kağıt deftere tahtaya', bonus: 3 },
  ],
  çay: [
    { gloss: 'içecek', prefer: { pos: 'noun', root: 'çay' }, prev: 'sıcak demli açık koyu bir iki', next: 'iç demle bardak şeker koy', bonus: 2 },
  ],
  at: [
    { gloss: 'hayvan', prefer: { pos: 'noun' }, next: 'bin koş yarış ahır araba', prev: 'beyaz siyah kahverengi güzel bir', bonus: 3 },
    { gloss: 'atmak', prefer: { pos: 'verb' }, prev: 'çöp top taş dışarı yere', bonus: 3 },
  ],
  dolu: [
    { gloss: 'hava olayı', prefer: { pos: 'noun' }, next: 'yağ yağmur', bonus: 4 },
    { gloss: 'boş olmayan', prefer: { pos: 'adj' }, bonus: 1 },
  ],
  kaz: [
    { gloss: 'hayvan', prefer: { pos: 'noun' }, prev: 'beyaz bir ördek', bonus: 2 },
    { gloss: 'kazmak', prefer: { pos: 'verb' }, prev: 'toprak çukur yer bahçe', bonus: 3 },
  ],
  bin: [
    { gloss: 'sayı (1000)', prefer: { pos: 'num' }, next: 'MEASURE', prev: 'bir iki üç dört beş on yüz', bonus: 4 },
    { gloss: 'binmek', prefer: { pos: 'verb' }, prev: 'otobüs araba at bisiklet taksi tren', bonus: 3 },
  ],
  yemek: [
    { gloss: 'besin (isim)', prefer: { pos: 'noun' }, next: 'ye yap pişir hazırla koy ısıt sev', prev: 'sıcak güzel akşam öğle bir', bonus: 3 },
    { gloss: 'yemek (mastar)', prefer: { pos: 'verb' }, next: 'INF_GOV', bonus: 4.5 },
  ],
  ekmek: [
    { gloss: 'besin (isim)', prefer: { pos: 'noun' }, bonus: 1 },
    { gloss: 'ekmek (tohum)', prefer: { pos: 'verb' }, prev: 'tohum buğday tarla', bonus: 3 },
  ],
  gelecek: [
    { gloss: 'zaman (isim/sıfat)', prefer: { pos: 'noun', root: 'gelecek' }, prev: 'bu bir parlak güzel', next: 'hafta ay yıl sene sefer gün', bonus: 13 },
    { gloss: 'gelmek (gelecek zaman)', prefer: { pos: 'verb' }, final: true, bonus: 2 },
  ],
  gelir: [
    { gloss: 'kazanç', prefer: { pos: 'noun', root: 'gelir' }, prev: 'aylık yüksek düşük emekli iyi az', bonus: 4 },
  ],
  gelin: [
    { gloss: 'evlenen kadın / oğlun eşi', prefer: { pos: 'noun', root: 'gelin' }, prev: 'bizim yeni güzel', next: 'kız hanım damat', bonus: 3 },
    { gloss: 'gelmek (emir)', prefer: { pos: 'verb' }, prev: 'buraya içeri eve lütfen', bonus: 3 },
  ],
  aç: [
    { gloss: 'karnı boş', prefer: { pos: 'adj' }, prev: 'çok karnım', next: 'kal', bonus: 2 },
    { gloss: 'açmak', prefer: { pos: 'verb' }, prev: 'kapı pencere kapak ağız göz', bonus: 3 },
  ],
  kaç: [
    { gloss: 'soru (sayı)', prefer: { pos: 'adj' }, next: 'MEASURE', bonus: 3 },
    { gloss: 'kaçmak', prefer: { pos: 'verb' }, final: true, bonus: 2 },
  ],
  yan: [
    { gloss: 'taraf', prefer: { pos: 'noun' }, bonus: 1 },
    { gloss: 'yanmak', prefer: { pos: 'verb' }, prev: 'ateş ocak ev yemek', bonus: 3 },
  ],
  ara: [
    { gloss: 'aralık', prefer: { pos: 'noun' }, bonus: 0.5 },
    { gloss: 'aramak', prefer: { pos: 'verb' }, prev: 'telefon beni onu anahtar', bonus: 3 },
  ],
  koy: [
    { gloss: 'deniz girintisi', prefer: { pos: 'noun' }, prev: 'küçük güzel sakin', bonus: 3 },
    { gloss: 'koymak', prefer: { pos: 'verb' }, final: true, bonus: 2 },
  ],
  uç: [
    { gloss: 'sivri kenar', prefer: { pos: 'noun' }, prev: 'kalem parmak dil', bonus: 3 },
    { gloss: 'uçmak', prefer: { pos: 'verb' }, prev: 'kuş uçak gök havada', bonus: 3 },
  ],
  saç: [
    { gloss: 'kıl', prefer: { pos: 'noun' }, next: 'tara kes boya uzun', prev: 'uzun kısa sarı siyah beyaz', bonus: 2 },
    { gloss: 'saçmak', prefer: { pos: 'verb' }, prev: 'tohum yem para', bonus: 3 },
  ],
  kır: [
    { gloss: 'açık arazi', prefer: { pos: 'noun' }, next: 'çiçek gezi ev', bonus: 2 },
    { gloss: 'kırmak', prefer: { pos: 'verb' }, prev: 'bardak tabak cam yumurta kol', bonus: 3 },
  ],
  düş: [
    { gloss: 'rüya', prefer: { pos: 'noun' }, prev: 'güzel kötü', next: 'gör', bonus: 3 },
    { gloss: 'düşmek', prefer: { pos: 'verb' }, bonus: 1 },
  ],
  yağ: [
    { gloss: 'yağ (isim)', prefer: { pos: 'noun' }, prev: 'zeytin tere sıvı', next: 'koy dök sür', bonus: 3 },
    { gloss: 'yağmak', prefer: { pos: 'verb' }, prev: 'yağmur kar dolu', bonus: 4 },
  ],
  yaş: [
    { gloss: 'ömür', prefer: { pos: 'noun' }, prev: 'kaç', bonus: 2 },
  ],
  oy: [
    { gloss: 'seçim oyu', prefer: { pos: 'noun' }, next: 'ver kullan', bonus: 3 },
  ],
  sol: [
    { gloss: 'yön', prefer: { pos: 'adj' }, next: 'el kol ayak taraf göz', bonus: 2 },
  ],
  sağ: [
    { gloss: 'yön', prefer: { pos: 'adj' }, next: 'el kol ayak taraf göz', bonus: 2 },
  ],
  ben: [
    { gloss: 'zamir', prefer: { pos: 'pron' }, bonus: 2 },
  ],
  de: [{ gloss: 'bağlaç (de/da)', prefer: { pos: 'conj' }, bonus: 4 }],
  da: [{ gloss: 'bağlaç (de/da)', prefer: { pos: 'conj' }, bonus: 4 }],
  ki: [{ gloss: 'bağlaç (ki)', prefer: { pos: 'conj' }, bonus: 3 }],
  kız: [
    { gloss: 'kız çocuk', prefer: { pos: 'noun' }, bonus: 2 },
    { gloss: 'kızmak', prefer: { pos: 'verb' }, prev: 'bana ona sana çok', bonus: 3 },
  ],
  kalk: [{ gloss: 'kalkmak', prefer: { pos: 'verb' }, bonus: 1 }],
  çalar: [
    { gloss: 'çalmak (geniş zaman)', prefer: { pos: 'verb' }, bonus: 1 },
  ],
  bakan: [
    { gloss: 'sıfat-fiil (bakan kişi)', prefer: { pos: 'verb' }, bonus: 1 },
    { gloss: 'devlet görevlisi', prefer: { pos: 'noun', root: 'bakan' }, prev: 'sağlık milli eğitim dışişleri', bonus: 4 },
  ],
  okur: [
    { gloss: 'okumak (geniş zaman)', prefer: { pos: 'verb' }, bonus: 1 },
  ],
  yazar: [
    { gloss: 'yazmak (geniş zaman)', prefer: { pos: 'verb' }, final: true, bonus: 2 },
    { gloss: 'eser sahibi', prefer: { pos: 'noun', root: 'yazar' }, prev: 'ünlü bir genç', bonus: 3 },
  ],
  kazan: [
    { gloss: 'büyük tencere', prefer: { pos: 'noun', root: 'kazan' }, prev: 'büyük bakır', bonus: 3 },
    { gloss: 'kazanmak', prefer: { pos: 'verb' }, prev: 'para maç', bonus: 3 },
  ],
  dolma: [
    { gloss: 'yemek', prefer: { pos: 'noun', root: 'dolma' }, prev: 'biber yaprak zeytinyağlı', bonus: 3 },
  ],
  var: [
    { gloss: 'varlık bildirir', prefer: { pos: 'adj', root: 'var' }, bonus: 2 },
  ],
  kalk: [
    { gloss: 'kalkmak', prefer: { pos: 'verb' }, bonus: 1 },
  ],
  hala: [
    { gloss: 'babanın kız kardeşi', prefer: { pos: 'noun' }, prev: 'benim bizim', next: 'geldi', bonus: 2 },
    { gloss: 'hâlâ (henüz)', prefer: { pos: 'adv' }, bonus: 1 },
  ],
};

/**
 * Yaygın konuşma tanıma (STT) yazım hataları ve konuşma dili biçimleri → standart.
 * Yalnızca sözlükte bulunmayan biçimlerde uygulanır; orijinal yazım korunur.
 */
export const SPELLING_VARIANTS = {
  birşey: 'bir şey', herşey: 'her şey', hiçbirşey: 'hiçbir şey', birsürü: 'bir sürü',
  napıyorsun: 'ne yapıyorsun', napıyon: 'ne yapıyorsun', naber: 'ne haber',
};
