/** Yöntem ve ölçütler — hesaplama kuralları, sürümler, kaynaklar (makale "Yöntem" bölümü için). */
import { h, mount, icon } from '../ui/dom.js';
import { ENGINE_ID } from '../../core/text/morphology.js';
import { ACOUSTIC_VERSION } from '../../core/audio/acoustic.js';
import { brandMark } from '../layout.js';

export async function render(root, _p, app) {
  if (app.ctx) { app.setCrumbs([{ label: 'Yöntem ve ölçütler' }]); app.setActions([h('button.btn.btn-ghost.btn-sm', { on: { click: () => window.print() } }, icon('file', 15), 'Yazdır / PDF')]); }
  const sec = (title, ...body) => h('section', null, h('h2', null, title), ...body);
  const p = (...t) => h('p', null, ...t);
  const li = (...t) => h('li', null, ...t);
  const code = (t) => h('code', null, t);
  const table = (head, rows) => h('div.table-wrap', null, h('table.table', null, h('thead', null, h('tr', null, head.map((x) => h('th', null, x)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))));

  const doc = h('article.doc', null,
    !app.ctx ? h('a.brand', { href: 'index.html', style: { textDecoration: 'none', marginBottom: '20px', display: 'inline-flex' } }, h('span.brand-mark', null, brandMark(20)), 'MorphologAI') : null,
    h('div.eyebrow', null, icon('book', 14), 'Yöntem belgesi'),
    h('h1', { style: { fontSize: '28px', fontWeight: 700, letterSpacing: '-.02em' } }, 'Yöntem ve ölçütler'),
    p(`Bu sayfa MorphologAI'nin hesapladığı tüm ölçütlerin tanımlarını, sayım kurallarını ve algoritmalarını belgeler. Makale ve raporlarda yöntem bölümü için kaynak olarak kullanılabilir. Çözümleme motoru: `, code(ENGINE_ID), ', akustik modül: ', code(ACOUSTIC_VERSION), '.'),

    sec('1. Veri toplama ve saklama',
      h('ul', null,
        li(h('b', null, 'Canlı kayıt: '), 'tarayıcı ses işleme (yankı giderme, gürültü bastırma, otomatik kazanç) kapalı olarak, cihazın doğal örnekleme hızında (genellikle 48 kHz) mono, 16-bit PCM WAV olarak kaydedilir.'),
        li(h('b', null, 'Yüklenen dosyalar: '), 'özgün biçimde saklanır; çözümleme için yüksek kaliteli yeniden örnekleme (OfflineAudioContext) ile 16 kHz monoya indirgenir. Ses (fonasyon) ölçümleri doğal örnekleme hızında yapılır.'),
        li(h('b', null, 'Depolama: '), 'tüm veriler tarayıcının yerel veritabanında (IndexedDB), ekip (kiracı) kimliğiyle ayrılmış olarak tutulur. Çözümleme tamamen istemci tarafında çalışır.'),
        li(h('b', null, 'Otomatik transkripsiyon: '), 'Chrome Web Speech API (varsayılan olarak Google sunucularında işlenir) ya da cihaz içi Whisper (transformers.js). Otomatik transkriptler klinisyen tarafından dinlenerek düzeltilmeli ve "Doğrulandı" olarak işaretlenmelidir; konuşma tanıma sistemleri parafazileri düzeltme, dolgu ve tekrarları atlama eğilimindedir.'))),

    sec('2. Transkripsiyon kuralları',
      p('Her satır bir sözcedir. Kodlama, CHAT/AphasiaBank kurallarının bir alt kümesidir:'),
      table(['Gösterim', 'Anlam', 'MLU\'ya etkisi'], [
        ['T: …', 'terapist sözcesi', 'hariç'],
        ['ııı, eee, &-ıı', 'dolgu', 'sözcük sayılmaz; dolgu olarak sayılır'],
        ['yani, işte, hani, falan (ayar)', 'söylem belirleyicisi', 'varsayılan: dolgu'],
        ['sözcük [/] ; <öbek> [/]', 'tekrar', 'tekrarlanan (ilk) söyleniş sayılmaz'],
        ['sözcük [//]', 'düzeltme / yeniden başlama', 'düzeltilen sayılmaz'],
        ['araba araba (kodsuz)', 'otomatik ardışık tekrar (ayar)', 'ilk söyleniş sayılmaz'],
        ['ka-, &+ka', 'yarım kalmış sözcük', 'sayılmaz'],
        ['xxx', 'anlaşılmayan', 'sözce hariç (ayar)'],
        ['… , +…', 'yarım kalan sözce', 'sözce hariç (ayar)'],
        ['tek sözcüklük evet/hayır/tamam', 'onay/ret yanıtı', 'sözce hariç (ayar)'],
        ['sözcük [* s|p|n|m] [: hedef]', 'parafazi kodu ve hedef', 'sayılır; hedef verilmişse biçimbirim çözümlemesi hedef üzerinden'],
        ['b-b-bebek, s:u, [blk]', 'kekemelik takılmaları', 'sözcük bir kez sayılır'],
      ])),

    sec('3. Biçimbirim çözümlemesi',
      p('Sözcükler kural tabanlı, "üreterek çözümleme" yöntemiyle kök ve eklerine ayrılır: kelimenin başındaki olası kök gövdeleri (ses olaylarına uğramış biçimler dahil) sözlükte aranır; her gövdeden başlayarak Türkçe ek dizilim kurallarına (morfotaktik) uygun ek dizileri ünlü uyumu, ünsüz benzeşmesi, kaynaştırma, ünsüz yumuşaması, ünlü düşmesi ve daralma kuralları uygulanarak üretilir ve kelimeyle karşılaştırılır. Kelimeyi tam üreten çözümlemeler; kökün sözlükte bulunması, sıklık önceliği ve eklerin olasılığıyla puanlanır. Sözcük türü ve eş sesli okumalar, bağlam kurallarıyla (ör. sözce sonu çekimli fiil, belirleyici + ad, sayı + ölçü sözcüğü, isim tamlaması, saygı sözcükleri) yeniden sıralanır.'),
      h('ul', null,
        li('Sözlük: Zemberek-NLP Türkçe sözlükleri (Akın & Akın, Apache-2.0) — ~36.000 kök, ~60.000 özel ad; ek olarak klinik konuşmada sık sözcükler için öncelik listesi.'),
        li('Envanter: çokluk, iyelik, hâl (zamir n\'li biçimler dahil), -ki, ek-fiil, olumsuzluk, yeterlilik, zaman/kip (standart ve konuşma dili: -yo, -ıca), kişi ekleri, emir/istek, fiilimsiler; yapım ekleri (çatı, -lı, -sız, -lık, -cı, -cık, sıra/üleştirme sayı ekleri).'),
        li('Sözlükte bulunmayan sözcüklerde yalnızca güçlü ek kanıtı varsa bölme yapılır (neolojizm ve özel adlarda aşırı bölmeyi önlemek için).'),
        li('Belirsiz sözcükler işaretlenir; klinisyen seçenekler arasından seçim yapabilir ya da elle bölütleyebilir. Düzeltmeler seansa ya da ekip sözlüğüne kaydedilir.'))),

    sec('4. Dil ölçütleri',
      table(['Ölçüt', 'Tanım'], [
        ['MLU-m', 'Dahil edilen sözcelerde biçimbirim sayısı ortalaması. Kök = 1, her çekim eki = +1, yapım ekleri ayrıca sayılmaz; birleşik sözcükler, özel adlar ve kalıplaşmış sözcükler kök olarak 1 sayılır.'],
        ['MLU-w', 'Dahil edilen sözcelerde sözcük sayısı ortalaması.'],
        ['Sözcük başına biçimbirim', 'Toplam biçimbirim / üretilen sözcük.'],
        ['TTR (biçim / kök)', 'Farklı sözcük biçimi (ya da kök) / toplam sözcük.'],
        ['MATTR', 'Kayan pencereli TTR (varsayılan pencere 50 sözcük; Covington & McFall, 2010).'],
        ['İsim / fiil oranı', '(isim + özel ad) / fiil (çekimli ve fiilimsi).'],
        ['Sözce başına çekimli fiil', 'Çekimli fiil sayısı / dahil sözce.'],
        ['Yüklemli sözce oranı', 'Çekimli fiil, ek-fiil ya da var/yok/değil içeren dahil sözce oranı.'],
        ['Zaman/kişi çeşitliliği', 'Farklı zaman–kişi–olumsuzluk–birleşik zaman bileşimlerinin sayısı.'],
        ['Hâl eki çeşitliliği', 'Kullanılan farklı hâl eki sayısı; çekimli ad oranı.'],
        ['Dolgu / tekrar oranı', '100 üretilen sözcükte dolgu (+ söylem belirleyicisi) ve tekrar/düzeltme sayısı.'],
        ['Parafazi oranı', '100 sözcükte kodlanmış hata ([* …]) sayısı; türlerine göre ayrıca.'],
        ['Sözlük dışı sözcük', 'Sözlükte bulunmayan, özel ad olmayan sözcükler (olası neolojizm/fonolojik parafazi); tek harf uzaklıkta bilinen sözcük "olası hedef" olarak gösterilir.'],
        ['Boş sözcük', '"şey", "zımbırtı", "falan" gibi içeriksiz sözcüklerin 100 sözcükteki sayısı.'],
        ['Kelime bulma yorumu', '"adı neydi", "aklıma gelmiyor" gibi üstdilsel ifadeler içeren sözce sayısı.'],
      ])),

    sec('5. Akustik ölçütler',
      h('ul', null,
        li(h('b', null, 'Konuşma/sessizlik bölütleme: '), '25 ms pencere, 10 ms adımla RMS enerji (dBFS). Gürültü tabanı = enerji dağılımının 10. yüzdeliği; eşik = gürültü + max(8 dB; 0,25 × (95. yüzdelik − gürültü)) + kullanıcı düzeltmesi; 3 dB histerezis; 60 ms\'den kısa enerji adacıkları atılır; en kısa duraksamadan (varsayılan 250 ms) kısa boşluklar birleştirilir.'),
        li(h('b', null, 'Duraksama: '), 'ilk ve son konuşma arasındaki eşik üstü sessizlikler (baştaki ve sondaki sessizlik hariç). Uzun duraksama eşiği varsayılan 2 sn.'),
        li(h('b', null, 'Konuşma hızı: '), 'hece / konuşma aralığı süresi (Türkçe yazımda her ünlü bir hecedir). ', h('b', null, 'Artikülasyon hızı: '), 'hece / fonasyon (konuşma bölütleri) süresi. ', h('b', null, 'MLR: '), 'hece / konuşma akışı sayısı.'),
        li(h('b', null, 'Temel frekans (F0): '), 'YIN algoritması (de Cheveigné & Kawahara, 2002); 8 kHz\'e indirgenmiş sinyal, 40 ms pencere, 10 ms adım, 60–500 Hz, eşik 0,15; oktav hatası düzeltmesi ve 5 noktalı medyan süzgeç. Aralık 5.–95. yüzdelik arasında yarım ton olarak raporlanır.'),
        li(h('b', null, 'Kayıt kalitesi: '), 'SNR tahmini (95. yüzdelik − gürültü tabanı), kırpılma oranı (|x| ≥ 0,985), tepe düzeyi.'))),

    sec('6. Ses (fonasyon) ölçütleri',
      p('Uzatılmış ünlü görevlerinde en uzun ses bölümü (baş ve sondan 0,1–0,25 sn kırpılarak) doğal örnekleme hızında çözümlenir. Glotal tepeler YIN F0 izine göre aranır ve parabolik ara değerlemeyle alt-örnek hassasiyetinde konumlandırılır; periyotlar Praat ölçütleriyle süzülür (periyot aralığı 1/500–1/75 sn, en büyük periyot oranı 1,3).'),
      table(['Ölçüt', 'Tanım', 'Yaygın eşik (yetişkin /a/)'], [
        ['Jitter (local)', 'ardışık periyot farklarının ortalaması / ortalama periyot', '< %1,04'],
        ['Jitter (RAP, PPQ5)', '3 ve 5 noktalı perturbasyon bölümü', '< %0,68 ; < %0,84'],
        ['Shimmer (local, dB, APQ3/5/11)', 'ardışık tepe-tepe genlik farkları', '< %3,81 ; < 0,35 dB ; < %3,07 ; < %4,23'],
        ['HNR', '10·log10(r/(1−r)), r: periyot gecikmesinde normalize çapraz ilinti (Boersma, 1993)', '> 20 dB'],
        ['CPP', 'kepstral tepe belirginliği (40 ms Hann pencere, 60–330 Hz)', 'yüksek = daha periyodik'],
        ['MPT', 'en uzun kesintisiz ses bölümü', 'genellikle > 15 sn'],
        ['s/z oranı', 'en uzun iki ses bölümünün (sırasıyla /s/, /z/) süre oranı', '> 1,4 anlamlı olabilir'],
      ]),
      p('Eşikler kayıt koşullarına duyarlıdır; kayıplı sıkıştırılmış biçimler (MP3/AAC) jitter/shimmer değerlerini bozabilir.')),

    sec('7. Motor konuşma (DDK)',
      p('5 ms adımlı enerji zarfındaki yerel tepeler hece çekirdeği kabul edilir (≥ 4 dB belirginlik, ≥ 65 ms aralık). Hız = (hece − 1) / (son − ilk hece zamanı); düzenlilik = heceler arası sürelerin değişim katsayısı (CV); ilk ve son 5 saniyenin hızı ayrıca verilir.')),

    sec('8. Akıcılık / kekemelik',
      p('Yairi & Ambrose (1999) sınıflaması: kekemeliğe özgü takılmalar (SLD: parça sözcük tekrarı, tek heceli sözcük tekrarı, uzatma, blok) ve diğer akıcısızlıklar (OD: dolgu, düzeltme, çok heceli sözcük tekrarı, öbek tekrarı, yarım bırakılan sözcük). %SS = SLD olay sayısı / toplam hece × 100. Ağırlıklı SLD = (PWR + MWR) × ortalama tekrar birimi + 2 × (uzatma + blok). 100 hecede ≥ 3 SLD kekemelik ile uyumlu sıklık kabul edilir.')),

    sec('9. Afazi tarama göstergesi (deneysel)',
      p('Dört alan için (akıcılık, dilbilgisi, sözcük erişimi, parafazi/içerik) ölçütler referans değerlerle karşılaştırılır: z = (değer − ortalama) / SS, yalnız bozulma yönünde. Şiddet = lojistik dönüşüm (z = 2 ≈ 0,37; z = 3 ≈ 0,73). Alan puanı = ağırlıklı ortalama şiddet × 100. Genel gösterge = en yüksek alan puanı + diğer alanların 0,25 katı (en fazla 100). Bantlar: < 20 tipik, 20–40 sınırda, 40–65 afazi ile uyumlu, ≥ 65 belirgin. Örüntü (akıcı olmayan, akıcı-parafazili, anomik, akıcılıkta azalma, yaygın) alan puanlarının birleşiminden türetilir.'),
      p(h('b', null, 'Sınırlılık: '), 'gösterge tanı koymaz ve standart afazi testlerinin (ör. ADD, GAT, BDAE, WAB) yerine geçmez; anlama ve tekrarlama becerilerini ölçmez. Varsayılan referans değerler yaklaşıktır; ekip, kontrol grubu seanslarıyla (aynı görev, ≥ 5 seans) kendi normlarını oluşturabilir.')),

    sec('10. Otomatik yazıya dökme',
      p('Önerilen yöntem cihaz içi Whisper\'dır (OpenAI Whisper, ONNX; transformers.js). Ses bilgisayardan çıkmaz. Kayıt önce akustik çözümlemedeki konuşma bölümlerine göre en fazla 24 saniyelik pencerelere bölünür; uzun sessizlikler modele verilmez, çünkü Whisper sessizlikte metin "uydurabilir". Bilinen uydurma kalıpları ("Altyazı M.K.", "İzlediğiniz için teşekkürler") ve 8 ve üzeri ardışık tekrar döngüleri ayıklanır; klinik açıdan anlamlı 2–5\'lik tekrarlar korunur.'),
      p(h('b', null, 'Sınırlılık: '), 'otomatik tanıma parafazileri çoğu zaman "düzeltir", dolgu ve yarım sözcükleri atlayabilir. Klinik ölçümler için transkript dinlenerek düzeltilmeli ve "Doğrulandı" olarak işaretlenmelidir.')),

    sec('11. Grup analizi',
      p('Analiz sayfası seansları danışanların yaş grubu, cinsiyet, eğitim düzeyi (yıl: ≤ 5 ilkokul, 6–8 ortaokul, 9–12 lise, 13–16 üniversite, ≥ 17 lisansüstü), el tercihi, tanı, etiyoloji, grup, modül ve görev türüne göre karşılaştırır; iki değişken çaprazlanabilir (ör. "Kadın · 30–39"). Varsayılan olarak her danışanın seansları önce kendi içinde ortalanır; grup istatistikleri (ortalama, SS, ortanca, aralık, n) danışanlar üzerinden hesaplanır. Yaş ilişkisi için Pearson r ve en küçük kareler eğimi verilir.'),
      p(h('b', null, 'Gizlilik: '), 'grafik ve tablolarda ad ya da danışan kodu yer almaz; 3\'ten az danışanı olan gruplar varsayılan olarak gizlenir. Akıcılık (duraksama sıklığı ve süresi, konuşma oranı) ve F0 her ses kaydından ölçülür; sözcük/dakika ve hece hızları transkript gerektirir.')),

    sec('12. Öngörü çalışması (kaza resmi protokolü)',
      p('Katılımcıya standart kaza resmi gösterilir ve standart yönerge okunur; 3–5 dakikalık spontan anlatım kaydedilir. Aynı görsel 1 yıl sonraki izlemde yeniden kullanılır.'),
      p(h('b', null, 'Konuşmacı ayrımı: '), 'terapistin onay ve soruları ölçütlere katılmaz. Otomatik transkriptte üç kanıt birleştirilir: (1) canlı kayıtta terapistin "konuşuyorum" tuşunu basılı tuttuğu aralıklar; (2) metin ipuçları — yönerge kalıpları ("anlatır mısınız", "neler görüyorsunuz"), "-sınız/-siniz" hitaplı sorular, yalnız onay sözcüğünden oluşan sözceler; birinci tekil kişi danışan lehine; (3) ses perdesi — bölümlerin F0 ortancası yarım ton ölçeğinde iki kümeye ayrılır, kümeler en az 3,5 yarım ton ayrışıyor ve metin ipuçları kümeyi belirliyorsa ipucusuz bölümler ses perdesine göre etiketlenir. Dilbilgisel doğruluk ölçüt olarak kullanılmaz. Etiketler öneridir ve transkript ekranında tek tıkla düzeltilir.'),
      p(h('b', null, 'Ölçütler (L1–L8): '), 'toplam sözcük, MLU-w, konuşma hızı (yalnız danışanın konuştuğu aralıklarda), duraksama oranı ve süresi; MATTR, MTLD (eşik 0,72; ileri-geri ortalaması, ≥ 50 sözcük), isim/fiil ve içerik sözcüğü oranı, tekrar; dolgu, belirsiz ifade ("şey", "burada"), kelime bulma yorumları; zamir oranı; sözce başına yüklem, fiilimsi oranı, sözcük başına biçimbirim; bilgi birimleri (resimdeki 14 varlık + 8 olay; anahtar sözcük kök ya da yüzey biçimde geçtiğinde, bazı olaylarda iki sözcük grubu aynı sözcede), bilgi yoğunluğu ve olay kapsamı; bağlaç kullanımı; resimde olmayan (konu dışı) adların oranı. Alan öngörüsü için ek kanıtlar: terapist yönlendirme gereksinimi (danışan sözcesi başına terapist sözcesi), görevi soruyla geri yöneltme oranı, bağlama uymayan ifadeler, kodlanmış anlamsal ve biçimbirim hataları, yüklemli sözce oranı, sözlük dışı sözcükler, fonolojik hata adayları ve yarım bırakılan sözcükler (L9).'),
      p(h('b', null, 'Alan bazlı öngörü (hangi alanda?): '), 'ölçütler altı dil alanına kanıt olarak gruplanır — semantik (bilgi birimi kapsamı, bilgi yoğunluğu, konu dışı adlar, belirsiz ifade, anlamsal parafazi, MATTR), pragmatik (terapist yönlendirmesi, soruyla geri yöneltme, konu dışı adlar, uygunsuz ifade, olay kapsamı, bağlaç), morfolojik (sözcük başına biçimbirim, fiilimsi oranı, biçimbirim hataları, çözümlenemeyen biçimler), sözdizimsel (MLU-w, sözce başına yüklem, yüklemli sözce oranı, fiilimsi), fonolojik (fonolojik hata adayları, sözlük dışı sözcükler, yarım sözcükler) ve akıcılık (hız, duraksama, uzun duraksama, tekrar). Alan şiddeti = alanın en belirgin iki kanıtının ortalama z değeri; 12 aylık alan olasılığı = lojistik(−2,3 + 1,3 × alan z + ½ yaş terimi + ½ eğitim terimi). Düzeyler: < %25 beklenmiyor, %25–50 olası, %50–80 kuvvetle olası, ≥ %80 çok yüksek olasılık (program "kesin" demez).'),
      p(h('b', null, 'Küçük örneklem düzeltmesi: '), 'az sözcük ya da sözceden hesaplanan oranlar, paydanın büyüklüğüne göre referans ortalamaya doğru çekilir: düzeltilmiş değer = (değer × n + referans × n₀) / (n + n₀). n₀: 100 sözcükteki sıklıklar için 30 sözcük, sözcük ortalamaları için 10 sözcük, sözce oranları için 5 sözce, ad/eylem oranları için 5, zamanlama ölçütleri için 20 saniye. Böylece 24 sözcüklük bir örnekte tek bir sözcük "100 sözcükte 4" gibi aşırı bir değere dönüşüp olasılığı şişirmez. Konuşma dilinde yerleşik kısalmalar (burda, orda, nerde, bi) hata ya da bilinmeyen sözcük sayılmaz.'),
      p(h('b', null, 'Tümevarımsal gerekçe: '), 'her alan için önce gözlemler (değer, referans ve danışanın kendi sözlerinden örnekler: konu dışı adlar, "şey/burada" gibi belirsiz sözcükler, terapiste yöneltilen sorular, sözlük dışı biçimler, yüklemsiz sözceler), ardından bu gözlemlerin birlikte işaret ettiği ara çıkarım (ör. "anlatım ancak terapistin sık yönlendirmesiyle sürdürülebiliyor → söylemi bağımsız planlama güçleşiyor"), en sonda alan düzeyinde sonuç yazılır. Otomatik transkriptte ses düzeyindeki hatalar gerçek sözcüğe düzeltilmiş olabileceği için fonolojik ve morfolojik kanıtlar transkript doğrulanınca güvenilir olur.'),
      p(h('b', null, 'Tür (örüntü): '), 'alanların birlikte etkilenme biçimi bir örüntüye bağlanır (alan z ≥ 1,5 "belirgin"): dört ya da daha çok alan → yaygın (global); semantik ve pragmatik belirgin, biçim-sözdizim görece korunmuş → semantik-pragmatik söylem bozulması (Alzheimer tipi demans / HBB ile uyumlu olabilir); semantik belirgin, akıcılık korunmuş → semantik örüntü (svPPA / anomik); morfoloji-sözdizim akıcılıkla birlikte → agramatik (nfvPPA / Broca); fonolojik ve akıcılık → logopenik; yalnız pragmatik → pragmatik; yalnız akıcılık → akıcılık/hız örüntüsü. Tür tanı değildir. DKT de kör formda her alan için öngörüsünü (beklemiyorum / olası / kuvvetle olası / kesin) ve beklediği türü girer; izlem sonucunda bozulan alanlar ve gerçekleşen tür işaretlenir ve alan düzeyinde doğruluk ("kuvvetle olası" ve üstü = bekleniyor; program için p ≥ %50) ile program–DKT uyumu (κw) hesaplanır.'),
      p(h('b', null, 'Program değerlendirmesi: '), 'her ölçüt referans değerle karşılaştırılır (z, bozulma yönünde). Klinik formdaki 8 madde (DKT formuyla aynı) ilgili ölçütlerin en yüksek iki z değerinin ortalamasından 0–3 puanlanır (< 1: 0, < 2: 1, < 3: 2, ≥ 3: 3). Bileşik şiddet = en ağır maddenin z değeri ile maddelerin ağırlıklı ortalama z değerinin ortalaması (tek alanda ağır bozulma sağlam alanlarla seyrelmesin diye). 1 yıllık risk = lojistik(−2,6 + 1,25 × bileşik + yaş terimi + eğitim terimi); yaş terimi 0,035 × (yaş − 65), eğitim terimi −0,04 × (eğitim yılı − 8), sınırlandırılmış. Bu varsayılan katsayılar kalibre edilmemiş önsel değerlerdir. Ekipte en az 12 sonuçlu örneklem (her grupta en az 4) biriktiğinde, aynı değişkenlerle L2 düzenlileştirmeli lojistik regresyon eğitilir ve birini-dışarıda-bırak doğruluğu varsayılandan düşük değilse kullanılır. Referans değerler, kontrol grubundan en az 5 örneklem olduğunda ekibin kendi ortalama ve SS değerleriyle değiştirilir.'),
      p(h('b', null, 'Aylık seyir: '), 'tek bir örnekten aylık gidiş ölçülemez; birikimli olasılık sabit tehlike varsayımıyla P(ay) = 1 − (1 − P₁₂)^(ay/12) olarak gösterilir. İzlem takvimi risk düzeyine göre önerilir (≥ %50: 3, 6, 9, 12. aylar; %25–50: 6 ve 12; < %25: 12).'),
      p(h('b', null, 'Körleme ve doğruluk: '), 'DKT, program sonucunu görmeden 8 maddeyi puanlar ve 1 yıllık risk tahmini girer; program tahmini ilk DKT değerlendirmesinde kilitlenir. Sonucu görerek verilen değerlendirmeler "kör değil" olarak işaretlenir. 1 yıl sonra girilen klinik sonuca göre doğruluk, duyarlılık, özgüllük (eşik %50), Brier skoru ve AUC hesaplanır; program–DKT uyumu kuadratik ağırlıklı Cohen kappa, DKT\'ler arası uyum Fleiss kappa ile verilir.'),
      p(h('b', null, 'Sınırlılık: '), 'program tanı koymaz; referans değerler Türkçe için standartlaştırılmamıştır; otomatik transkripsiyon ve konuşmacı ayrımı hataları ölçütleri etkiler — transkript mutlaka dinlenerek doğrulanmalıdır.')),

    sec('13. Dışa aktarım',
      h('ul', null,
        li('Seans düzeyi ve sözcük düzeyi CSV (standart ya da Türkçe Excel biçimi); danışan adları varsayılan olarak yazılmaz.'),
        li('CHAT (.cha) — CLAN/TalkBank uyumlu, basitleştirilmiş %mor satırıyla.'),
        li('Praat TextGrid — sözce, konuşma/sessizlik, duraksama ve not katmanları.'),
        li('PDF klinik rapor (isteğe bağlı anonim), JSON, özgün ses dosyası ve ekip yedeği (ZIP).'),
        li('Grup analizi tablosu (CSV) — yalnız grup düzeyinde özet; kişisel bilgi içermez.'))),

    sec('Kaynaklar',
      h('ul', null,
        li('Akın, A. A., & Akın, M. D. (2007). Zemberek, an open source NLP framework for Turkic languages.'),
        li('Boersma, P. (1993). Accurate short-term analysis of the fundamental frequency and the harmonics-to-noise ratio of a sampled sound. IFA Proceedings, 17, 97–110.'),
        li('Boersma, P., & Weenink, D. Praat: doing phonetics by computer.'),
        li('Brown, R. (1973). A first language: The early stages. Harvard University Press.'),
        li('Covington, M. A., & McFall, J. D. (2010). Cutting the Gordian knot: The moving-average type–token ratio (MATTR). Journal of Quantitative Linguistics, 17(2), 94–100.'),
        li('de Cheveigné, A., & Kawahara, H. (2002). YIN, a fundamental frequency estimator for speech and music. JASA, 111(4), 1917–1930.'),
        li('Eckel, F. C., & Boone, D. R. (1981). The s/z ratio as an indicator of laryngeal pathology. JSHD, 46(2), 147–149.'),
        li('MacWhinney, B. (2000). The CHILDES Project: Tools for analyzing talk. Lawrence Erlbaum.'),
        li('MacWhinney, B., Fromm, D., Forbes, M., & Holland, A. (2011). AphasiaBank: Methods for studying discourse. Aphasiology, 25(11), 1286–1307.'),
        li('Nicholas, L. E., & Brookshire, R. H. (1993). A system for quantifying the informativeness and efficiency of the connected speech of adults with aphasia. JSHR, 36, 338–350.'),
        li('Radford, A., Kim, J. W., Xu, T., Brockman, G., McLeavey, C., & Sutskever, I. (2023). Robust speech recognition via large-scale weak supervision. ICML.'),
        li('Yairi, E., & Ambrose, N. G. (1999). Early childhood stuttering I: Persistency and recovery rates. JSLHR, 42, 1097–1112.'))),
    h('p.tiny.muted', { style: { marginTop: '28px' } }, 'MorphologAI klinik karar desteği ve araştırma amaçlıdır; tıbbi cihaz değildir.'));

  mount(root, app.ctx ? doc : h('div', { style: { maxWidth: '900px', margin: '0 auto', padding: '40px 24px' } }, doc));
}
