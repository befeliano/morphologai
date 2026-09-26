/**
 * Sık kullanılan (çekirdek) Türkçe kökler.
 *
 * Zemberek sözlüğü ~30.000 kök içerir; ancak "verdi", "gelir", "bakan" gibi
 * sözlükte isim olarak da geçen biçimlerde doğru çözümlemeyi seçebilmek için
 * gündelik/klinik konuşmada sık geçen köklere öncelik puanı verilir.
 * Ayrıca Zemberek dosyaları yüklenemezse bu liste yedek sözlük olarak kullanılır.
 *
 * Biçim: kök (fiillerde -mak/-mek'siz). Konuşma örneklerinde (resim betimleme,
 * öykü anlatma, günlük yaşam, sağlık) sık geçen sözcükler ağırlıklıdır.
 */

const VERBS = `
acı acık açıkla aç ağla ağrı akıt ak al alış anımsa anla anlaş anlat ara arttır art as
at atla ayır ayrıl bağır bağla bak bakın bas başar başla başlat bat bayıl becer bekle belirt benze
besle beğen bil bildir bin birleş biç bitir bit boya boz boşal boşalt böl bul buluş bulun burk büyü büyüt
cevapla çağır çal çalış çalıştır çarp çek çevir çık çıkar çırp çiz çiğne çöz çürü çömel
dağıt dal daral dayan dağıl de değ değiştir değiş demle dene dik dile dinle dinlen diz
doğ doğra doğur dokun dol dola dolaş doldur don dondur doy doyur dön döndür dök dökül dur durdur duy
düşün düş düşür düzelt düzenle eğil eğlen ek ekle emzir erit es esne et evlen ez fırlat fısılda geç geçir gel
getir gez gir git giy giydir göm gönder gör görün görüş göster götür gül güldür güven haşla hatırla
hazırla hisset ilerle incele indir in inan inle iste it iyileş izle kaç kaçır kal kaldır kalk kapa
kapat karala karıştır karış kas kay kaybet kaybol kayna kaynat kaz kazan kes kır kırıl kız
kızart kilitle kokla kok konuş kop kork korkut koru koş koy kucakla kullan kurtar kur kurula kus kutla küs
ol oku okut omuzla onar oyna oynat ov ödüllendir öde öğren öğret öksür öl ölç öp ör ört özle
pişir piş rahatla sakla saklan sal salla san sar sarıl sat savaş say seç sev sevin seyret sık sıkıl sırala
sil sinirlen sor soy soğu soğut söndür söyle sula sun sür süpür süz şaşır şişir şiş takıl tak tamamla
tanı tanış taran tara tart taşı taş tat tekrarla temizle terle titre tokalaş topla tut tutun tırman
uç ulaş unut uyan uyandır uyu uyut uygula uzan uzat üşü üz üzül vazgeç ver vur yağ yakala yak yakış
yaklaş yala yalvar yan yanıtla yap yapış yapıştır yarala yaşa yat yatır yaz ye yedir yen yerleş
yetiş yık yıka yıkan yırt yorul yuvarla yükle yüksel yürü yüz yut zıpla zorla eriş döv ısın ısıt
kırp üfle tükür kaşı
`;

const NOUNS = `
abla ağabey abi ada adam adres ağaç ağız ağrı ahır akşam akıl alet alışveriş alın ameliyat amca ana anahtar
anne anneanne apartman araba arı arka arkadaş asker aslan astım ateş avuç ay ayak ayakkabı ayna ayı
baba babaanne bacak bahçe bakkal balık balkon bardak basamak baş başarı bayram bebek bel belediye beyin
bez bıçak bilgi bilgisayar bina bisiklet bisküvi biber bilet boğaz boya boyun bulaşık bulut burun but
buzdolabı böcek börek bulgur cadde cam cami can cep ceket cevap cümle çağ çamaşır çanta çatal çatı çay
çaydanlık çekmece çeyrek çiçek çift çiftlik çikolata çilek çimen çizgi çocuk çorap çorba çöp dakika dal
damat dayı dede defter deniz dere deri ders dergi devlet diş dil dilek dirsek dizi doktor dolap dolma domates
dondurma dua dudak durak durum duvar düğün dükkan dünya düşünce eczane egzersiz ekmek el elbise elma emekli
enişte erik erkek eş eşek eşya et etek ev evlat fare fasulye fincan fındık fırın fırtına fikir film fil
fiyat gazete gece gelin gemi gezi giysi göğüs gök göl gömlek göz gözlük gün güneş hafta hala halı hamur
hanım hap harf hasta hastalık hastane hava havlu hayat hayvan hediye hemşire hikaye horoz hırsız ıspanak
ışık ilaç insan irmik iş işçi iğne kadın kafa kahvaltı kahve kalem kalp kan kanepe kapı kar karın kardeş
karınca karpuz kasap kaş kaşık kavanoz kavun kaza kazak kedi kek kelebek kelime kemer kemik kenar kilo
kira kiraz kitap kış kız kızkardeş koca kol koltuk komşu köpek köprü köşe köy kulak kum kurabiye kurt
kuş kutu kuzen kuyruk kümes lamba lavabo lokanta mahalle makarna makine mandalina manav market masa masal
maç maymun mektup memleket memur mercimek merdiven mesele meyve mide misafir mont muhabbet mutfak muz
musluk müdür müzik nane nefes nehir nine not numara oda oğul okul olay omuz orman ot otel otobüs oyun
oyuncak ödev öğle öğrenci öğretmen ördek örümcek öykü para parça park parmak pasta patates patlıcan
pantolon pazar peynir pencere perde pilav pirinç polis portakal poğaça radyo raf randevu reçel renk resim
rüya rüzgar saat sabah sabun saç salata salon sandalye sayı sebze sepet ses sınav sınıf sigara simit sinek
sofra soğan sokak soru sorun spor su sucuk süpürge süt şapka şarkı şehir şeker şey şişe tabak tabure
tahta taksi tarla tatil tatlı tava tavan tavşan tavuk taş tedavi telefon televizyon tencere teras terapi
terapist terlik teyze tırnak toprak top torun tren tuvalet tuz tüp un uçak uyku üniversite üzüm vapur
vücut yağ yağmur yaprak yastık yatak yaz yazı yeğen yemek yer yıl yıldız yılan yol yolculuk yorgan yumurta
yüz yüzük zaman zeytin zürafa iç dış üst alt ön yan orta taraf baş son hata ölüm
doğum ad isim soyad yaş boy kısım tane çeşit tür konu anlam türkçe ülke kasaba ilçe
sonbahar ilkbahar mevsim pazartesi salı çarşamba perşembe cuma cumartesi haber kova sünger
tezgah itfaiye itfaiyeci kül prens prenses balo saray kraliçe kral peri
sandviç tereyağı fıstık bura şura ora diz kas sinir damar felç inme kriz tansiyon
`;

const ADJS = `
açık ağır aç akıllı alçak aptal aydınlık az bayat beyaz benzer boş bozuk bütün büyük canlı cesur çirkin
çiğ çok dar deli derin diğer doğru dolu düz eğri ekşi eksik eski farklı fazla fakir garip geniş genç gerçek
gerekli gri güçlü güzel hafif hasta hazır hızlı ılık ince ilginç iyi kalın kapalı kara karanlık kahverengi
kel keskin kırık kırmızı kısa kirli kolay komik kocaman korkak kötü kuru küçük lacivert lazım lezzetli mavi
meşgul minik mor mutlu mutsuz mümkün normal önemli pahalı parlak pembe rahat rahatsız sağ sağlam sağlıklı
sakin sarı serin sert sessiz sevimli sıcak sıkıcı sıkı siyah soğuk sol son sulu sinirli şişman taze tatlı
tam tembel temiz tok tuzlu tuhaf turuncu ucuz uzak uzun uykulu üzgün yakın yalnız yanlış yarım yaşlı
yavaş yeni yeşil yorgun yumuşak yüksek zayıf zengin zor zeki kızgın heyecanlı mahcup yabancı ünlü özel
ilk aynı başka bazı birkaç her hiçbir tüm kör sağır dilsiz topal ıslak kırgın dik var yok
`;

const ADVS = `
artık aslında az bazen belki beraber biraz birden birlikte böyle bugün çabuk çok daha dün elbette en erken
galiba geç gene genellikle gerçekten hâlâ hala hemen henüz hep herhalde hiç işte kesinlikle maalesef
mesela mutlaka nasıl ne neden neyse niye niçin önce öyle özellikle peki sadece sanki sonra şimdi şöyle
tabii tamam tekrar yakında yalnızca yani yarın yavaşça yine zaten hızlıca aniden evet hayır
`;

const INTERJ = 'evet hayır tamam peki merhaba selam günaydın hoşça teşekkürler sağol eyvah aman ah of oh vay';

function parseList(str, pos, out) {
  for (const w of str.split(/\s+/)) if (w) out.add(`${w}:${pos}`);
}

/** "kök:tür" anahtarlarından oluşan küme (tür: noun|verb|adj|adv|interj). */
export const CORE = (() => {
  const set = new Set();
  parseList(VERBS, 'verb', set);
  parseList(NOUNS, 'noun', set);
  parseList(ADJS, 'adj', set);
  parseList(ADVS, 'adv', set);
  parseList(INTERJ, 'interj', set);
  return set;
})();

/**
 * Anlamca çakışan eşsesli köklerde klinik konuşmada daha olası olana küçük ek puan.
 * (ör. "yıkıyor": yıka- 'yıkamak' > yık- 'yıkmak'; "taşıyor": taşı- ≈ taş-)
 */
export const PREFERRED = new Map([
  ['yıka:verb', 1.5], ['taşı:verb', 0.3], ['yaz:verb', 0.5], ['aç:verb', 0.3], ['düş:verb', 0.5],
  ['yemek:noun', 1], ['ekmek:noun', 1.5], ['gelin:noun', 0.5], ['yüz:noun', 0.3], ['çocuk:noun', 1],
]);

/**
 * Yaygın kişi adları ve yer adları (Zemberek'in person-names listesi yalnızca
 * seyrek adları içerir). Büyük harfle yazıldıklarında özel isim olarak öne çıkar.
 */
export const PROPER_NAMES = `
Ayşe Fatma Emine Hatice Zeynep Elif Meryem Şerife Zehra Sultan Hanife Merve Havva Zeliha Esra Fadime Özlem
Hacer Yasemin Hülya Leyla Dilek Büşra Kübra Rabia Songül Gülsüm Sevgi Aysel Aynur Nuran Nurten Sevim Gülay
Şevval Nisa Ecrin Defne Azra Asya Eylül Nehir Duru Beren Melek İrem Buse Cansu Gizem Ebru Pınar Ceren Selin
Sude Damla İpek Tuğba Burcu Derya Filiz Gönül Hande Melike Nazlı Seda Tuba Ümran Yeliz Zerrin Gül Bahar
Mehmet Mustafa Ahmet Ali Hüseyin Hasan İbrahim İsmail Osman Yusuf Murat Ömer Ramazan Halil Süleyman Abdullah
Mahmut Salih Recep Kemal Fatih Emre Burak Can Cem Deniz Kerem Mert Emir Eymen Yiğit Berat Serkan Erkan Volkan
Onur Uğur Tolga Barış Hakan Kadir Orhan Yunus Enes Furkan Oğuz Selim Sinan Tuncay Umut Erdem Levent Cengiz
Metin Nuri Rıza Sabri Şükrü Veli Yakup Zafer Adem Bekir Cemil Davut Ercan Gökhan İlhan Kenan Nihat Okan
`;

export const PLACES = `
Türkiye Ankara İstanbul İzmir Bursa Antalya Konya Adana Gaziantep Şanlıurfa Kocaeli Mersin Diyarbakır Hatay
Manisa Kayseri Samsun Balıkesir Kahramanmaraş Van Aydın Tekirdağ Sakarya Denizli Muğla Eskişehir Mardin
Trabzon Malatya Erzurum Ordu Afyon Sivas Tokat Zonguldak Çorum Elazığ Kütahya Rize Giresun Edirne Çanakkale
Isparta Bolu Nevşehir Sinop Kastamonu Uşak Düzce Yozgat Niğde Aksaray Karaman Kırşehir Amasya Artvin Bartın
Almanya Fransa İngiltere Amerika Rusya Yunanistan İtalya İspanya Avrupa Asya Anadolu Karadeniz Akdeniz Ege
Kadıköy Üsküdar Beşiktaş Çankaya Kızılay Taksim Boğaz
`;

/** Zemberek yüklenemezse kullanılacak kapalı sınıf sözcükleri (yedek sözlük). */
export const FALLBACK_CLOSED = {
  pron: 'ben sen o biz siz onlar bu şu bunlar şunlar kim ne kendi herkes hepsi biri birisi kimse hiçbiri nere bura şura ora',
  conj: 've veya ya da ama fakat ancak çünkü ki yani hem ne ile eğer oysa yoksa halbuki üstelik ayrıca',
  postp: 'için gibi kadar göre karşı doğru dolayı rağmen beri önce sonra boyunca üzere diye ile',
  det: 'bir bu şu o her bazı birkaç hiçbir tüm birçok',
  num: 'sıfır bir iki üç dört beş altı yedi sekiz dokuz on yirmi otuz kırk elli altmış yetmiş seksen doksan yüz bin milyon',
  ques: 'mi mı mu mü',
};
