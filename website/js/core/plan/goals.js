/**
 * Terapi planı önerileri — kural ve kalıp tabanlı (yapay zekâ kullanılmaz).
 *
 * Son seansın ölçütlerinden hedef ALANLARI seçilir ve her alan için ölçülebilir hedef kalıbı doldurulur:
 *   kısa dönem: "<süre> içinde, <bağlam>da, <davranış>, <ölçüt>"   (SMART: özgül, ölçülebilir, ulaşılabilir,
 *   ilgili, süreli). Başlangıç değeri seansın ölçümüdür; hedef değer başlangıcın makul bir adımıdır.
 * Öneriler taslaktır: klinisyen düzenler, eler ve onaylar. Hedef seçimi klinik karardır.
 */
import { suggestSoundTargets, errorPairsFromResult } from '../materials/bridge.js';

const POS_TR = { initial: 'sözcük başında', medial: 'sözcük ortasında', final: 'sözcük sonunda' };
const r1 = (x) => Number(x.toFixed(1));
const tr = (x, d = 1) => Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d });

/**
 * @param {object} o { result: analyzeSession çıktısı (ya da null), session: seans kaydı, weeks: kısa dönem süresi }
 * @returns {Array<{area, areaLabel, basis, short, long}>}
 */
export function suggestGoals({ result = null, session = null, weeks = 6 } = {}) {
  const out = [];
  const L = result?.language;
  const F = result?.fluency || session?.fluency;
  const St = result?.stuttering;
  const V = session?.voice;
  const span = `${weeks} hafta içinde`;

  // Ses üretimi
  // Hedefi klinisyenin kodladığı hatalar ([: hedef]) esas alınır; yoksa otomatik adaylara düşülür
  const pairs = errorPairsFromResult(result);
  const coded = pairs.filter((x) => x.coded);
  for (const t of suggestSoundTargets(coded.length ? coded : pairs).slice(0, 2)) {
    const pos = POS_TR[t.positions[0]] || 'sözcük içinde';
    const how = t.substitutes[0] ? `/${t.substitutes[0]}/ sesiyle değiştirme` : 'düşürme';
    out.push({
      area: 'articulation', areaLabel: 'Ses üretimi',
      basis: `/${t.sound}/ sesinde ${t.count} hata (${how}): ${t.examples.slice(0, 2).join(', ')}`,
      short: `${span}, resim adlandırma etkinliğinde /${t.sound}/ sesini ${pos} 10 denemenin 8'inde doğru üretir.`,
      long: `/${t.sound}/ sesini tüm sözcük konumlarında, yapılandırılmamış sohbette %90 doğrulukla üretir.`,
    });
  }

  // Akıcılık (kekemelik)
  if (St && St.percentSS >= 3) {
    const target = Math.max(1, r1(St.percentSS * 0.6));
    out.push({
      area: 'fluency', areaLabel: 'Akıcılık',
      basis: `Takılmalı hece oranı %${tr(St.percentSS)}`,
      short: `${span}, yapılandırılmış sohbette takılmalı hece oranını %${tr(St.percentSS)} düzeyinden %${tr(target)} düzeyine indirir.`,
      long: 'Günlük konuşma ortamlarında takılmalı hece oranını %3\'ün altında sürdürür ve konuşmaktan kaçınma davranışlarını azaltır.',
    });
  }

  // Konuşma hızı / üretim miktarı
  if (F?.wpm != null && F.wpm < 70 && L?.words?.produced >= 20) {
    out.push({
      area: 'rate', areaLabel: 'Konuşma üretimi',
      basis: `Konuşma hızı dakikada ${tr(F.wpm, 0)} sözcük`,
      short: `${span}, resim betimleme görevinde konuşma hızını dakikada ${tr(F.wpm, 0)} sözcükten ${tr(Math.min(100, F.wpm * 1.25), 0)} sözcüğe çıkarır.`,
      long: 'Günlük sohbette yaşıtlarına yakın hızda (dakikada 100–130 sözcük) ve uzun duraksama olmadan konuşur.',
    });
  }

  // Sözce uzunluğu / dilbilgisi
  if (L?.mluW != null && L.utterances?.included >= 5 && L.mluW < 4.5) {
    out.push({
      area: 'grammar', areaLabel: 'Sözce uzunluğu ve dilbilgisi',
      basis: `Ortalama sözce uzunluğu ${tr(L.mluW)} sözcük${L.verbs?.utterancesWithPredicate != null ? `, yüklemli sözce oranı %${tr(L.verbs.utterancesWithPredicate * 100, 0)}` : ''}`,
      short: `${span}, resim betimleme görevinde ortalama sözce uzunluğunu ${tr(L.mluW)} sözcükten ${tr(L.mluW + 1)} sözcüğe çıkarır ve sözcelerinin %80'inde yüklem kullanır.`,
      long: 'Günlük olayları özne, nesne ve yüklem içeren tam cümlelerle, sıralı biçimde anlatır.',
    });
  }

  // Sözcük erişimi
  const fillers = L?.disfluency ? (L.disfluency.fillerRate ?? 0) : 0;
  const empty = L?.words?.produced ? (100 * (L.lexical?.emptyWords || 0)) / L.words.produced : 0;
  if (L && (fillers + empty >= 8 || (L.lexical?.wordFindingComments || 0) >= 2)) {
    out.push({
      area: 'lexical', areaLabel: 'Sözcük erişimi',
      basis: `100 sözcükte ${tr(fillers + empty)} dolgu / belirsiz sözcük${L.lexical?.wordFindingComments ? `, ${L.lexical.wordFindingComments} kelime bulma yorumu` : ''}`,
      short: `${span}, adlandırma etkinliğinde 20 hedef sözcüğün 16'sını ipucu olmadan ya da yalnız anlamsal ipucuyla adlandırır.`,
      long: 'Sohbette hedef sözcüğe ulaşamadığında tanımlama ve eş anlamlı kullanma stratejilerini kendiliğinden uygular.',
    });
  }

  // Ses (fonasyon)
  if (V && (V.jitterLocal > 1.04 || V.shimmerLocal > 3.81 || (V.hnr != null && V.hnr < 20))) {
    const bits = [V.jitterLocal > 1.04 ? `jitter %${tr(V.jitterLocal, 2)}` : null, V.shimmerLocal > 3.81 ? `shimmer %${tr(V.shimmerLocal, 2)}` : null, V.hnr != null && V.hnr < 20 ? `HNR ${tr(V.hnr)} dB` : null].filter(Boolean);
    out.push({
      area: 'voice', areaLabel: 'Ses',
      basis: `Uzatılmış ünlüde ${bits.join(', ')}`,
      short: `${span}, uzatılmış /a/ üretiminde rahat ses başlangıcıyla en az 10 saniye kesintisiz fonasyon sağlar; ses hijyeni kurallarını haftada 5 gün uygular.`,
      long: 'Günlük ses kullanımında yorgunluk ve kısıklık yakınması olmadan, ölçümleri beklenen aralıkta olan bir ses kalitesi sürdürür.',
    });
  }

  if (!out.length) {
    out.push({
      area: 'general', areaLabel: 'Genel',
      basis: 'Son seansta belirgin bir sapma saptanmadı ya da çözümleme için yeterli veri yok',
      short: `${span}, belirlenen hedef davranışı yapılandırılmış etkinlikte 10 denemenin 8'inde gerçekleştirir.`,
      long: 'Kazanılan beceriyi farklı kişi ve ortamlarda kendiliğinden kullanır.',
    });
  }
  return out;
}

/** Seans planı iskeleti (süreler dakika). */
export function sessionPlanDraft(goals = [], minutes = 40) {
  const k = minutes / 40;
  const g = goals[0];
  return [
    { title: 'Karşılama ve ev programının gözden geçirilmesi', min: Math.round(5 * k), note: 'Geçen haftanın ev çalışmaları; güçlük yaşanan noktalar.' },
    { title: 'Isınma', min: Math.round(5 * k), note: 'Önceki seansta başarılan düzeyin kısa tekrarı.' },
    { title: 'Hedef çalışma', min: Math.round(18 * k), note: g ? g.short : 'Seçilen hedefe yönelik yapılandırılmış etkinlik; ipucu düzeyi kademeli azaltılır.' },
    { title: 'Genelleme', min: Math.round(7 * k), note: 'Hedefin daha az yapılandırılmış bir etkinlikte (oyun, sohbet, hikâye) kullanımı.' },
    { title: 'Özet ve ev programı', min: Math.round(5 * k), note: 'Seansın özeti; evde yapılacaklar ve nasıl yapılacağı gösterilir.' },
  ];
}

/** Aileye öneri havuzu (alan → hazır metinler). Klinisyen seçer ve düzenler. */
export const FAMILY_ADVICE = {
  articulation: ['Hedef sesi düzeltmek yerine doğru biçimini siz yineleyerek model olun ("tedi" derse "evet, kedi" deyin).', 'Hedef sesli sözcükleri günde 5 dakika, oyun içinde çalışın; zorlamayın.', 'Doğru üretimleri hemen ve somut biçimde övün.'],
  fluency: ['Çocuğunuzla konuşurken kendi konuşma hızınızı yavaşlatın ve cümleleriniz arasında duraklayın.', 'Sözünü kesmeyin, cümlesini tamamlamayın; göz temasını koruyarak sabırla bekleyin.', '"Yavaş konuş, nefes al" gibi uyarılar yerine söylediğinin içeriğiyle ilgilenin.', 'Her gün 10 dakika, acele edilmeyen birebir sohbet zamanı ayırın.'],
  rate: ['Evet/hayır yerine açık uçlu sorular sorun ve yanıt için en az 5 saniye bekleyin.', 'Gün içinde yaşananları birlikte, sırayla anlatın.'],
  grammar: ['Söylediğini bir iki sözcük ekleyerek genişletin ("araba" derse "kırmızı araba gidiyor" deyin).', 'Kitap okurken resimleri birlikte betimleyin; cümleyi sizin başlatıp onun tamamlamasını bekleyin.'],
  lexical: ['Sözcüğü bulamadığında hemen söylemek yerine ipucu verin: ne işe yarar, neye benzer, ilk sesi nedir.', 'Günlük nesneleri kategorilere ayırma ve adlandırma oyunları oynayın.'],
  voice: ['Gün boyu yeterli su içilmesini sağlayın; bağırma ve fısıldamadan kaçının.', 'Gürültülü ortamda sesi yükseltmek yerine yaklaşarak konuşun.', 'Ses yorulduğunda kısa ses dinlendirme molaları verin.'],
  general: ['Ev çalışmalarını kısa ve düzenli tutun: her gün aynı saatte 5–10 dakika.', 'Çabayı övün; hataları düzeltirken doğru modeli sunun.'],
};

export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** Ev kayıtlarından özet: son 7 günün durumu, seri (üst üste yapılan gün) ve haftalık yüzde. */
export function homeSummary(logs = [], today = new Date()) {
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const map = new Map(logs.map((l) => [String(l.day).slice(0, 10), l]));
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const l = map.get(key(d));
    days.push({ day: key(d), done: l ? !!l.done : null, slot: l?.slot || '', note: l?.note || '' });
  }
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const l = map.get(key(d));
    if (l?.done) streak++;
    else if (i === 0 && !l) continue; // bugün henüz girilmemişse seri bozulmaz
    else break;
  }
  const done = days.filter((d) => d.done).length;
  return { days, streak, weekPct: Math.round((100 * done) / 7), todayKey: key(today) };
}
