/**
 * Örnek (sentetik) veriler — uygulamayı gerçek danışan verisi olmadan denemek için.
 * Transkriptler "Kurabiye Hırsızı" resim betimleme görevine göre elle yazılmış
 * kurgusal örneklerdir; gerçek kişilere ait değildir ve araştırmada kullanılmamalıdır.
 */
import { analyzeSession, summarize } from '../core/analysis.js';

const T_CONTROL = `[00:00] T: Bu resimde neler oluyor, anlatır mısınız?
[00:03] Burada bir mutfak görüyorum.
[00:06] Anne pencerenin önünde bulaşık yıkıyor ama dalgın olduğu için lavabodaki su taşmış, yerlere akıyor.
[00:13] Arkada iki çocuk var.
[00:15] Oğlan taburenin üstüne çıkmış, dolaptaki kavanozdan kurabiye almaya çalışıyor.
[00:21] Tabure devrilmek üzere, çocuk düşecek gibi duruyor.
[00:26] Kız kardeşi de aşağıda elini uzatmış, kurabiye istiyor.
[00:31] Parmağını dudağına götürmüş, sessiz ol der gibi işaret ediyor.
[00:36] Pencereden bahçe görünüyor, dışarıda hava güzel.
[00:40] Tezgâhın üstünde birkaç tabak ve bardak duruyor.
[00:44] Annenin bu olanlardan haberi yok gibi görünüyor.
[00:48] Bence birazdan çocuk düşecek ve anne de sesi duyup arkasına dönecek.`;

const T_BROCA_1 = `[00:00] T: Bu resimde neler oluyor?
[00:04] ııı anne... (..) su.
[00:11] su &+ta taşıyor.
[00:17] çocuk... kurabiye.
[00:23] tabure (...) düş [/] düşüyor.
[00:30] kız.
[00:33] eee kurabiye... ver.
[00:40] anne bulaşık.
[00:46] pencere.
[00:50] zor... çok zor.`;

const T_BROCA_2 = `[00:00] T: Resmi anlatır mısınız?
[00:04] anne... bulaşık yıkıyor.
[00:10] su taşıyor.
[00:14] ııı çocuk kurabiye alıyor.
[00:20] tabure düşüyor.
[00:25] kız... kurabiye istiyor.
[00:31] pencere açık.`;

const T_BROCA_3 = `[00:00] T: Resmi anlatır mısınız?
[00:03] anne mutfakta bulaşık yıkıyor.
[00:08] lavabodan su taşıyor, yere akıyor.
[00:14] oğlan taburenin üstünde kurabiye alıyor.
[00:20] tabure düşecek.
[00:24] kız kardeşi de kurabiye istiyor.
[00:29] anne görmüyor, dalgın.`;

const T_ANOMIC = `[00:00] T: Bu resimde neler oluyor?
[00:03] Şimdi burada şey var, kadın şeyi yıkıyor, adı neydi, hani yemekten sonra yıkanan şeyler.
[00:12] Onlar işte, tabakları yıkıyor.
[00:16] Sonra su şeyden taşıyor, o şeyden, lavabodan.
[00:22] Çocuk da yukarıdaki şeye uzanmış, ne diyorlar ona, dolap.
[00:29] Oradan bir şey alıyor, yiyecek bir şey, hatırlayamıyorum şimdi.
[00:35] Altındaki şey de sallanıyor, düşecek gibi.
[00:40] Kız da orada duruyor, o da bir şey istiyor.
[00:45] Aklıma gelmiyor ama tatlı bir şeydi.`;

const T_WERNICKE = `[00:00] T: Bu resimde neler oluyor?
[00:03] Evet evet şimdi burada kadın da tabakları sırmalıyor [* n] çünkü onlar hep böyle olur zaten.
[00:10] Su da kaşıktan [* s] [: lavabodan] akıp gidiyor ama o bilmiyor, bilmesi de lazım değil.
[00:17] Oğlan da yukarıda kurabiyeleri polatıyor [* n], kalemi [* p] [: kapağı] açmış.
[00:24] Kızı da aşağıda ona diyor ki verin bana da biraz fırtapı [* n].
[00:30] Sonra da hepsi gidecekler bahçeye, orada da çok güzel şeyler olacak herhalde.
[00:37] Ben de eskiden böyle mutfakta çok çalışırdım, annem de öyleydi.`;

const T_STUTTER = `[00:00] T: Bize işinizi anlatır mısınız?
[00:03] B-b-ben bir bankada çalışıyorum.
[00:08] Her sabah s:aat yedide kalkıyorum ve ııı otobüse biniyorum.
[00:15] İşe gidince önce ben ben ben e-postalara bakıyorum.
[00:22] Sonra m-m-müşterilerle [blk] konuşuyorum, bazen telefonla da görüşüyorum.
[00:30] Öğlen arkadaşlarımla yemek yiyoruz, <bazen dışarıda> [/] bazen dışarıda yiyoruz.
[00:38] Akşam eve dönünce ailemle vakit geçiriyorum.
[00:44] Hafta sonları d-d-d-denize gitmeyi çok seviyorum.`;

const DAY = 86400000;

export const DEMO_PATIENTS = [
  {
    code: 'ÖRN-001', fullName: 'Örnek Kontrol Katılımcısı', birthYear: 1966, sex: 'K', education: 11, handedness: 'sağ',
    group: 'control', diagnosis: 'kontrol', etiology: '', notes: 'Sentetik örnek — sağlıklı kontrol.',
    sessions: [{ text: T_CONTROL, daysAgo: 20 }],
  },
  {
    code: 'ÖRN-002', fullName: 'Örnek Danışan (akıcı olmayan)', birthYear: 1958, sex: 'E', education: 8, handedness: 'sağ',
    group: 'patient', diagnosis: 'broca', etiology: 'inme-iskemik', onsetDate: new Date(Date.now() - 200 * DAY).toISOString().slice(0, 10),
    notes: 'Sentetik örnek — ilerleme grafiği için 3 seans.',
    sessions: [{ text: T_BROCA_1, daysAgo: 90 }, { text: T_BROCA_2, daysAgo: 55 }, { text: T_BROCA_3, daysAgo: 14 }],
  },
  {
    code: 'ÖRN-003', fullName: 'Örnek Danışan (anomik)', birthYear: 1962, sex: 'K', education: 12, handedness: 'sağ',
    group: 'patient', diagnosis: 'anomik', etiology: 'inme-iskemik', notes: 'Sentetik örnek — adlandırma güçlüğü.',
    sessions: [{ text: T_ANOMIC, daysAgo: 10 }],
  },
  {
    code: 'ÖRN-004', fullName: 'Örnek Danışan (akıcı, parafazili)', birthYear: 1955, sex: 'E', education: 5, handedness: 'sağ',
    group: 'patient', diagnosis: 'wernicke', etiology: 'inme-hemorajik', notes: 'Sentetik örnek — parafazi kodlamaları içerir.',
    sessions: [{ text: T_WERNICKE, daysAgo: 6 }],
  },
  {
    code: 'ÖRN-005', fullName: 'Örnek Danışan (kekemelik)', birthYear: 1994, sex: 'E', education: 16, handedness: 'sağ',
    group: 'patient', diagnosis: 'kekemelik', etiology: 'gelisimsel', notes: 'Sentetik örnek — takılma kodlamaları içerir.',
    sessions: [{ text: T_STUTTER, daysAgo: 3, module: 'fluency', taskType: 'monologue', taskDetail: 'İş yaşamını anlatma (örnek)' }],
  },
];

export async function createDemoData(repo, settings) {
  const created = [];
  for (const dp of DEMO_PATIENTS) {
    const { sessions, ...pdata } = dp;
    const existing = (await repo.patients.list({ includeArchived: true })).find((p) => p.code === dp.code);
    if (existing) continue;
    const patient = await repo.patients.save({ ...pdata, demo: true });
    for (const s of sessions) {
      const result = analyzeSession({ transcript: s.text, settings, final: true });
      await repo.sessions.save({
        patientId: patient.id,
        module: s.module || 'aphasia',
        taskType: s.taskType || 'picture',
        taskDetail: s.taskDetail || 'Kurabiye Hırsızı resmi (örnek)',
        source: 'text',
        status: 'verified',
        demo: true,
        recordedAt: new Date(Date.now() - s.daysAgo * DAY).toISOString(),
        transcript: { text: s.text, engine: 'manual', segments: [] },
        analysis: summarize(result),
        notes: 'Bu seans sentetik örnek veridir.',
      });
    }
    created.push(patient);
  }
  return created;
}

export async function removeDemoData(repo) {
  const all = await repo.patients.list({ includeArchived: true });
  let n = 0;
  for (const p of all.filter((x) => x.demo)) { await repo.patients.remove(p.id); n++; }
  return n;
}
