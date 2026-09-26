/** Uygulama sabitleri: klinik modüller, görevler, tanılar. */

export const READING_PASSAGE = 'Kuzey Rüzgârı ile Güneş, hangisinin daha güçlü olduğu konusunda tartışıyorlardı. '
  + 'O sırada kalın bir palto giymiş bir yolcu çıkageldi. Yolcunun paltosunu ilk kim çıkartabilirse onun daha güçlü '
  + 'sayılmasına karar verdiler. Kuzey Rüzgârı var gücüyle esmeye başladı; ama o estikçe yolcu paltosuna daha sıkı sarındı. '
  + 'Sonunda Kuzey Rüzgârı vazgeçti. Ardından Güneş ılık ılık parlamaya başladı ve yolcu çok geçmeden paltosunu çıkardı. '
  + 'Böylece Kuzey Rüzgârı, Güneş\'in daha güçlü olduğunu kabul etmek zorunda kaldı.';

export const TASK_TYPES = [
  { id: 'picture', label: 'Resim betimleme', prompt: 'Bu resme bakın ve resimde olan her şeyi bana anlatın.', hint: 'ör. Kurabiye Hırsızı (BDAE), ADD resmi' },
  { id: 'sequence', label: 'Resimli öykü (resim dizisi)', prompt: 'Bu resimlerdeki olayları sırasıyla bir öykü gibi anlatın.', hint: 'ör. 4–6 kartlık öykü dizisi' },
  { id: 'story', label: 'Öykü yeniden anlatımı', prompt: 'Kül Kedisi masalını hatırladığınız kadarıyla baştan sona anlatır mısınız?', hint: 'ör. Kül Kedisi, Keloğlan' },
  { id: 'procedural', label: 'Prosedürel söylem', prompt: 'Bir bardak çayı nasıl demlediğinizi adım adım anlatır mısınız?', hint: 'ör. çay demleme, yumurta haşlama' },
  { id: 'personal', label: 'Kişisel anlatı', prompt: 'Hastalığınızın nasıl başladığını ve o gün neler olduğunu anlatır mısınız?', hint: 'ör. inme öyküsü, önemli bir anı' },
  { id: 'free', label: 'Serbest konuşma / sohbet', prompt: 'Bana biraz kendinizden, günlerinizin nasıl geçtiğinden bahseder misiniz?', hint: '' },
  { id: 'monologue', label: 'Monolog', prompt: 'Size en çok keyif veren bir etkinliği ya da işinizi ayrıntılı anlatır mısınız?', hint: 'en az 2–3 dakika' },
  { id: 'conversation', label: 'Karşılıklı konuşma', prompt: 'Günlük yaşamınız, aileniz ve hobileriniz hakkında sohbet edelim.', hint: 'terapist satırlarını "T:" ile işaretleyin' },
  { id: 'reading', label: 'Sesli okuma', prompt: READING_PASSAGE, hint: 'Standart metin: Kuzey Rüzgârı ile Güneş' },
  { id: 'naming', label: 'Adlandırma', prompt: 'Gösterdiğim resimlerin adını söyleyin.', hint: 'ör. 20 resimlik adlandırma listesi' },
  { id: 'repetition', label: 'Tekrarlama', prompt: 'Söylediğim sözcük ve cümleleri aynen tekrar edin.', hint: '' },
  { id: 'vowel_a', label: 'Uzatılmış /a/', prompt: 'Derin bir nefes alın ve rahat bir ses düzeyinde "aaaa" sesini olabildiğince uzun ve sabit çıkarın.', hint: '3 deneme önerilir; en uzunu MPT' },
  { id: 'vowel_i', label: 'Uzatılmış /i/', prompt: 'Derin bir nefes alın ve "iiii" sesini olabildiğince uzun ve sabit çıkarın.', hint: '' },
  { id: 'sz', label: 's/z oranı', prompt: 'Önce "sssss" sesini olabildiğince uzun çıkarın; kısa bir aradan sonra aynısını "zzzzz" ile yapın.', hint: 'kayıtta önce /s/, sonra /z/' },
  { id: 'counting', label: 'Sayma (1–20)', prompt: 'Rahat bir hızda 1\'den 20\'ye kadar sayın.', hint: '' },
  { id: 'amr_pa', label: 'AMR — "pa-pa-pa"', prompt: 'Derin nefes alın ve "pa-pa-pa" hecesini olabildiğince hızlı ve düzenli tekrarlayın.', hint: '5–7 saniye' },
  { id: 'amr_ta', label: 'AMR — "ta-ta-ta"', prompt: 'Derin nefes alın ve "ta-ta-ta" hecesini olabildiğince hızlı ve düzenli tekrarlayın.', hint: '5–7 saniye' },
  { id: 'amr_ka', label: 'AMR — "ka-ka-ka"', prompt: 'Derin nefes alın ve "ka-ka-ka" hecesini olabildiğince hızlı ve düzenli tekrarlayın.', hint: '5–7 saniye' },
  { id: 'smr_pataka', label: 'SMR — "pa-ta-ka"', prompt: '"pa-ta-ka" dizisini olabildiğince hızlı ve doğru tekrarlayın.', hint: '5–7 saniye' },
  { id: 'other', label: 'Diğer', prompt: '', hint: '' },
];

export const MODULES = [
  {
    id: 'aphasia', label: 'Afazi', long: 'Afazi — bağlamlı konuşma çözümlemesi', icon: 'brain', tone: 'indigo',
    description: 'MLU, biçimbirim çözümlemesi, fiil çekimi, sözcük erişimi, parafazi ve afazi tarama göstergesi.',
    tasks: ['picture', 'sequence', 'story', 'procedural', 'personal', 'free', 'naming', 'repetition', 'other'],
    defaultTask: 'picture', transcript: true,
  },
  {
    id: 'fluency', label: 'Akıcılık / Kekemelik', long: 'Akıcılık — kekemelik ve takılma çözümlemesi', icon: 'waves', tone: 'coral',
    description: '%SS (takılmalı hece), takılma türleri (SLD/OD), tekrar birimi, konuşma hızı ve duraksamalar.',
    tasks: ['monologue', 'reading', 'conversation', 'picture', 'free', 'other'],
    defaultTask: 'monologue', transcript: true,
  },
  {
    id: 'voice', label: 'Ses (Fonasyon)', long: 'Ses bozuklukları — akustik ses çözümlemesi', icon: 'voice', tone: 'teal',
    description: 'Uzatılmış ünlüde F0, jitter, shimmer, HNR, CPP, ses kırılmaları; MPT ve s/z oranı.',
    tasks: ['vowel_a', 'vowel_i', 'sz', 'reading', 'counting', 'other'],
    defaultTask: 'vowel_a', transcript: false,
  },
  {
    id: 'motor', label: 'Motor konuşma (DDK)', long: 'Motor konuşma — diadokokinetik hız', icon: 'activity', tone: 'amber',
    description: 'AMR ve SMR görevlerinde hece hızı, düzenlilik (CV) ve yorgunluk (ilk/son 5 sn).',
    tasks: ['smr_pataka', 'amr_pa', 'amr_ta', 'amr_ka', 'reading', 'other'],
    defaultTask: 'smr_pataka', transcript: false,
  },
];

export const moduleOf = (id) => MODULES.find((m) => m.id === id) || MODULES[0];

export const DIAGNOSES = [
  { id: 'broca', label: 'Broca afazisi', group: 'Afazi' },
  { id: 'wernicke', label: 'Wernicke afazisi', group: 'Afazi' },
  { id: 'anomik', label: 'Anomik afazi', group: 'Afazi' },
  { id: 'global', label: 'Global afazi', group: 'Afazi' },
  { id: 'iletim', label: 'İletim afazisi', group: 'Afazi' },
  { id: 'tkm', label: 'Transkortikal motor afazi', group: 'Afazi' },
  { id: 'tkd', label: 'Transkortikal duyusal afazi', group: 'Afazi' },
  { id: 'mikst', label: 'Mikst transkortikal afazi', group: 'Afazi' },
  { id: 'ppa', label: 'Primer progresif afazi', group: 'Afazi' },
  { id: 'afazi', label: 'Afazi (sınıflanmamış)', group: 'Afazi' },
  { id: 'kekemelik', label: 'Gelişimsel kekemelik', group: 'Akıcılık' },
  { id: 'edinilmis-kekemelik', label: 'Edinilmiş (nörojenik) kekemelik', group: 'Akıcılık' },
  { id: 'klatering', label: 'Hızlı-bozuk konuşma (klatering)', group: 'Akıcılık' },
  { id: 'disfoni', label: 'Disfoni', group: 'Ses' },
  { id: 'nodul', label: 'Vokal nodül / polip', group: 'Ses' },
  { id: 'paralizi', label: 'Vokal kord paralizisi', group: 'Ses' },
  { id: 'spazmodik', label: 'Spazmodik disfoni', group: 'Ses' },
  { id: 'dizartri', label: 'Dizartri', group: 'Motor konuşma' },
  { id: 'apraksi', label: 'Konuşma apraksisi', group: 'Motor konuşma' },
  { id: 'kontrol', label: 'Sağlıklı kontrol', group: 'Diğer' },
  { id: 'diger', label: 'Diğer', group: 'Diğer' },
];

export const ETIOLOGIES = [
  { id: 'inme-iskemik', label: 'İnme (iskemik)' },
  { id: 'inme-hemorajik', label: 'İnme (hemorajik)' },
  { id: 'tbh', label: 'Travmatik beyin hasarı' },
  { id: 'tumor', label: 'Tümör' },
  { id: 'norodejeneratif', label: 'Nörodejeneratif' },
  { id: 'gelisimsel', label: 'Gelişimsel' },
  { id: 'fonksiyonel', label: 'Fonksiyonel' },
  { id: 'diger', label: 'Diğer' },
  { id: 'bilinmiyor', label: 'Bilinmiyor' },
];

export const SOURCES = [
  { id: 'live', label: 'Canlı kayıt' },
  { id: 'upload', label: 'Yüklenen ses dosyası' },
  { id: 'text', label: 'Metin / transkript' },
];

export const GROUPS = [
  { id: 'patient', label: 'Danışan' },
  { id: 'control', label: 'Kontrol grubu' },
];

export const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || '';
export const taskOf = (id) => TASK_TYPES.find((t) => t.id === id) || TASK_TYPES[TASK_TYPES.length - 1];

export const TENSE_TR = {
  PROG: 'Şimdiki (-yor)', PROG2: 'Şimdiki (-makta)', PAST: 'Görülen geçmiş (-dı)', EVID: 'Öğrenilen geçmiş (-mış)',
  FUT: 'Gelecek (-acak)', AOR: 'Geniş (-r)', AOR_NEG: 'Geniş olumsuz (-maz)', NEC: 'Gereklilik (-malı)',
  COND: 'Dilek-şart (-sa)', OPT: 'İstek (-a)', IMP: 'Emir',
};
export const PERSON_TR = { '1SG': '1. tekil', '2SG': '2. tekil', '3SG': '3. tekil', '1PL': '1. çoğul', '2PL': '2. çoğul', '3PL': '3. çoğul' };
export const CASE_TR = { ACC: 'Belirtme (-ı)', DAT: 'Yönelme (-a)', LOC: 'Bulunma (-da)', ABL: 'Ayrılma (-dan)', GEN: 'Tamlayan (-ın)', INS: 'Vasıta (-la)', EQU: 'Eşitlik (-ca)' };
