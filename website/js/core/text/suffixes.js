/**
 * Türkçe ek envanteri ve biçimbilimsel dizilim (morfotaktik) modeli.
 *
 * Şablon gösterimi (biçimbirim alomorfları):
 *   A   → a/e        (iki yönlü ünlü uyumu)
 *   I   → ı/i/u/ü    (dört yönlü ünlü uyumu)
 *   D   → d/t        (sert ünsüzden sonra t: "fıstıkçı şahap")
 *   C   → c/ç
 *   (y) (n) (s) (ş)  → kaynaştırma ünsüzü; yalnızca ünlüden sonra
 *   (I) → yalnızca ünsüzden sonra gelen ünlü (-(I)m: ev-im / anne-m)
 *
 * Alanlar:
 *   infl   : çekim eki mi (MLU-m'de +1 sayılır). Yapım ekleri (infl:false) sayılmaz.
 *   prior  : bilinen kökle yapılan çözümlemeler arasında sıklık önceliği
 *   ev     : bilinmeyen kök için "bu gerçekten ek mi" kanıt gücü
 */

const s = (tag, label, cat, tpl, prior, ev, extra = {}) =>
  ({ tag, label, cat, tpl, prior, ev, infl: true, ...extra });
const d = (tag, label, cat, tpl, prior, extra = {}) =>
  ({ tag, label, cat, tpl, prior, ev: 0.5, infl: false, ...extra });

export const SUFFIXES = {
  // ---------------- İsim çekimi ----------------
  PL:     s('PL', 'çokluk eki (-lar)', 'çokluk', ['lAr'], 2, 3),
  P1SG:   s('POSS.1SG', 'iyelik eki, 1. tekil (-ım)', 'iyelik', ['(I)m'], 2, 1.4),
  P2SG:   s('POSS.2SG', 'iyelik eki, 2. tekil (-ın)', 'iyelik', ['(I)n'], 0, 0.8),
  P3SG:   s('POSS.3SG', 'iyelik eki, 3. tekil (-ı/-sı)', 'iyelik', ['(s)I'], 1, 1.4),
  P1PL:   s('POSS.1PL', 'iyelik eki, 1. çoğul (-ımız)', 'iyelik', ['(I)mIz'], 1, 3),
  P2PL:   s('POSS.2PL', 'iyelik eki, 2. çoğul (-ınız)', 'iyelik', ['(I)nIz'], 0, 2.5),
  P3PL:   s('POSS.3PL', 'iyelik eki, 3. çoğul (-ları)', 'iyelik', ['lArI'], -3, 2.5),

  ACC:    s('ACC', 'belirtme hâli (-ı)', 'hâl', ['(y)I'], 2, 1.4),
  DAT:    s('DAT', 'yönelme hâli (-a)', 'hâl', ['(y)A'], 2, 1.4),
  LOC:    s('LOC', 'bulunma hâli (-da)', 'hâl', ['DA'], 2, 2),
  ABL:    s('ABL', 'ayrılma hâli (-dan)', 'hâl', ['DAn'], 2, 3),
  GEN:    s('GEN', 'tamlayan eki (-ın)', 'hâl', ['(n)In'], 1, 1.6),
  INS:    s('INS', 'vasıta eki (-la / ile)', 'hâl', ['(y)lA'], 1, 2.5),
  EQU:    s('EQU', 'eşitlik eki (-ca)', 'hâl', ['CA'], -3, 0.5),
  // 3. kişi iyelikten / -ki'den sonra zamir n'li hâl ekleri (evi-n-e, evdeki-n-i)
  ACC_N:  s('ACC', 'belirtme hâli (-ı)', 'hâl', ['nI'], 2, 1.6),
  DAT_N:  s('DAT', 'yönelme hâli (-a)', 'hâl', ['nA'], 2, 1.6),
  LOC_N:  s('LOC', 'bulunma hâli (-da)', 'hâl', ['ndA'], 2, 2.5),
  ABL_N:  s('ABL', 'ayrılma hâli (-dan)', 'hâl', ['ndAn'], 2, 3),
  GEN_N:  s('GEN', 'tamlayan eki (-ın)', 'hâl', ['nIn'], 1, 2),
  EQU_N:  s('EQU', 'eşitlik eki (-ca)', 'hâl', ['ncA'], -3, 1),
  KI:     s('KI', 'aitlik eki (-ki)', 'ilgi', ['ki', 'kü'], 0, 1.5),

  // ---------------- Ek-fiil (isim/sıfat yüklemi) ----------------
  COP_1SG:  s('COP.1SG', 'ek-fiil, 1. tekil (-ım)', 'ek-fiil', ['(y)Im'], -1, 1.4),
  COP_2SG:  s('COP.2SG', 'ek-fiil, 2. tekil (-sın)', 'ek-fiil', ['sIn'], -1, 1.8),
  COP_1PL:  s('COP.1PL', 'ek-fiil, 1. çoğul (-ız)', 'ek-fiil', ['(y)Iz'], -1, 1.6),
  COP_2PL:  s('COP.2PL', 'ek-fiil, 2. çoğul (-sınız)', 'ek-fiil', ['sInIz'], -1, 2.5),
  COP_DIR:  s('COP.GNR', 'ek-fiil, geniş zaman (-dır)', 'ek-fiil', ['DIr'], 0, 2.5),
  COP_PAST: s('COP.PST', 'ek-fiil, hikâye (-ydı)', 'ek-fiil', ['(y)DI'], 0, 2.2),
  COP_EVID: s('COP.EVID', 'ek-fiil, rivayet (-ymış)', 'ek-fiil', ['(y)mIş'], 0, 3),
  COP_COND: s('COP.COND', 'ek-fiil, şart (-ysa)', 'ek-fiil', ['(y)sA'], 0, 2),
  COP_KEN:  s('CVB.WHILE', 'zarf-fiil (-ken)', 'zarf-fiil', ['(y)ken'], 0, 3),

  // ---------------- Fiil çekimi ----------------
  NEG:    s('NEG', 'olumsuzluk eki (-ma)', 'olumsuzluk', ['mA'], 2, 1.2, { dropsBeforeProg: true }),
  ABIL:   s('ABIL', 'yeterlilik (-abil)', 'kip', ['(y)Abil'], 0, 4),
  IMPOSS: s('NEG.ABIL', 'yeterlilik olumsuzu (-ama)', 'olumsuzluk', ['(y)AmA'], 0, 2.5, { dropsBeforeProg: true }),

  PROG:   s('PROG', 'şimdiki zaman (-yor)', 'zaman', ['Iyor'], 3, 4, { tam: true, prog: true }),
  // Konuşma dili (sözlü aktarım transkriptlerinde sık): geliyo(m), gidicem, yapcaz
  PROG_COL: s('PROG', 'şimdiki zaman (-yo, konuşma dili)', 'zaman', ['Iyo'], 1, 3, { tam: true, prog: true, colloquial: true }),
  FUT_COL:  s('FUT', 'gelecek zaman (-ıca, konuşma dili)', 'zaman', ['(y)IcA', '(y)AcA'], 0, 3, { tam: true, colloquial: true }),
  FUT_COLK: s('FUT', 'gelecek zaman (-ıcak, konuşma dili)', 'zaman', ['(y)IcAk'], 0, 3, { tam: true, colloquial: true, voicesFinal: true }),
  C1SG: s('1SG', 'kişi eki, 1. tekil (-m, konuşma dili)', 'kişi', ['m'], 1, 1.2),
  C1PL: s('1PL', 'kişi eki, 1. çoğul (-z, konuşma dili)', 'kişi', ['z'], 0.5, 1.2),
  FUT:    s('FUT', 'gelecek zaman (-acak)', 'zaman', ['(y)AcAk'], 2, 4, { tam: true, voicesFinal: true }),
  PAST:   s('PST', 'görülen geçmiş zaman (-dı)', 'zaman', ['DI'], 2, 2.5, { tam: true }),
  EVID:   s('EVID', 'öğrenilen geçmiş zaman (-mış)', 'zaman', ['mIş'], 1, 3, { tam: true }),
  AOR:    s('AOR', 'geniş zaman (-r)', 'zaman', null, 1, 1.4, { tam: true }),
  AOR_NEG:s('AOR.NEG', 'geniş zaman olumsuzu (-z)', 'zaman', ['z'], 1, 1.5, { tam: true }),
  NEC:    s('NEC', 'gereklilik kipi (-malı)', 'kip', ['mAlI'], 0, 4, { tam: true }),
  COND:   s('COND', 'dilek-şart kipi (-sa)', 'kip', ['sA'], 0, 1.8, { tam: true }),
  OPT:    s('OPT', 'istek kipi (-a)', 'kip', ['(y)A'], -1, 0.6, { tam: true }),
  PROG2:  s('PROG2', 'şimdiki zaman (-makta)', 'zaman', ['mAktA'], 0.5, 4, { tam: true }),
  IMP_EMPH: s('IMP.2SG', 'emir kipi, 2. kişi (-sana)', 'kip', ['sAnA', 'sAnIzA'], 0, 3, { tam: true }),

  // Kişi ekleri — z-dizisi (-yor/-acak/-mış/-r/-malı sonrası)
  Z1SG: s('1SG', 'kişi eki, 1. tekil (-ım)', 'kişi', ['(y)Im'], 1.5, 1.8),
  Z2SG: s('2SG', 'kişi eki, 2. tekil (-sın)', 'kişi', ['sIn'], 0.5, 2),
  Z1PL: s('1PL', 'kişi eki, 1. çoğul (-ız)', 'kişi', ['(y)Iz'], 0.5, 1.8),
  Z2PL: s('2PL', 'kişi eki, 2. çoğul (-sınız)', 'kişi', ['sInIz'], 0, 2.5),
  A3PL: s('3PL', 'kişi eki, 3. çoğul (-lar)', 'kişi', ['lAr'], 1, 2.5),
  // Kişi ekleri — k-dizisi (-dı / -sa sonrası)
  K1SG: s('1SG', 'kişi eki, 1. tekil (-m)', 'kişi', ['m'], 2, 1.5),
  K2SG: s('2SG', 'kişi eki, 2. tekil (-n)', 'kişi', ['n'], 1, 1),
  K1PL: s('1PL', 'kişi eki, 1. çoğul (-k)', 'kişi', ['k'], 1.5, 1.5),
  K2PL: s('2PL', 'kişi eki, 2. çoğul (-nız)', 'kişi', ['nIz'], 0.5, 2),
  // Geniş zaman olumsuzunda 1. kişiler (gelmem, gelmeyiz)
  AORNEG_1SG: s('1SG', 'kişi eki, 1. tekil (-m)', 'kişi', ['m'], 1, 1.2, { tam: true }),
  AORNEG_1PL: s('1PL', 'kişi eki, 1. çoğul (-ız)', 'kişi', ['(y)Iz'], 0.5, 1.5, { tam: true }),
  // Emir kipi
  IMP_3SG: s('IMP.3SG', 'emir kipi, 3. tekil (-sın)', 'kip', ['sIn'], 0, 1.8, { tam: true }),
  IMP_2PL: s('IMP.2PL', 'emir kipi, 2. çoğul (-ın)', 'kip', ['(y)In', '(y)InIz'], -2, 1, { tam: true }),
  IMP_3PL: s('IMP.3PL', 'emir kipi, 3. çoğul (-sınlar)', 'kip', ['sInlAr'], -1, 4, { tam: true }),
  // İstek kipi kişi ekleri
  OPT_1SG: s('1SG', 'kişi eki, 1. tekil (-yım)', 'kişi', ['(y)Im'], 0.5, 1.5),
  OPT_2SG: s('2SG', 'kişi eki, 2. tekil (-sın)', 'kişi', ['sIn'], -1, 1.5),
  OPT_1PL: s('1PL', 'kişi eki, 1. çoğul (-lım)', 'kişi', ['lIm'], 1, 2.5),
  OPT_2PL: s('2PL', 'kişi eki, 2. çoğul (-sınız)', 'kişi', ['sInIz'], -1, 2.5),

  // ---------------- Fiilimsiler ----------------
  INF:        s('INF', 'mastar (-mak)', 'fiilimsi', ['mAk'], 0, 3),
  VN_MA:      s('VN', 'isim-fiil (-ma)', 'fiilimsi', ['mA'], 0, 1),
  VN_IS:      s('VN', 'isim-fiil (-ış)', 'fiilimsi', ['(y)Iş'], -1, 1.8),
  PART_AN:    s('PTCP', 'sıfat-fiil (-an)', 'fiilimsi', ['(y)An'], 0, 1.6),
  PART_DIK:   s('PTCP', 'sıfat-fiil (-dık)', 'fiilimsi', ['DIk'], 0, 2.5, { voicesFinal: true }),
  PART_ACAK:  s('PTCP.FUT', 'sıfat-fiil (-acak)', 'fiilimsi', ['(y)AcAk'], 0, 3.5, { voicesFinal: true }),
  CONV_IP:    s('CVB', 'zarf-fiil (-ıp)', 'zarf-fiil', ['(y)Ip'], 0, 1.8),
  CONV_ARAK:  s('CVB', 'zarf-fiil (-arak)', 'zarf-fiil', ['(y)ArAk'], 0, 4),
  CONV_INCA:  s('CVB', 'zarf-fiil (-ınca)', 'zarf-fiil', ['(y)IncA'], 0, 4),
  CONV_MADAN: s('CVB', 'zarf-fiil (-madan)', 'zarf-fiil', ['mAdAn'], 1, 4),
  CONV_DIKCA: s('CVB', 'zarf-fiil (-dıkça)', 'zarf-fiil', ['DIkçA'], -1, 4),
  CONV_ALI:   s('CVB', 'zarf-fiil (-alı)', 'zarf-fiil', ['(y)AlI'], -2, 2.5),

  // ---------------- Yapım ekleri (MLU-m'de ayrıca sayılmaz) ----------------
  PASS:    d('PASS', 'edilgen çatı eki (yapım)', 'çatı', null, -1, { voice: true }),
  CAUS:    d('CAUS', 'ettirgen çatı eki (yapım)', 'çatı', null, -1.5, { voice: true }),
  DER_LI:  d('WITH', 'yapım eki (-lı)', 'yapım', ['lI'], -1),
  DER_SIZ: d('WITHOUT', 'yapım eki (-sız)', 'yapım', ['sIz'], -1),
  DER_LIK: d('NESS', 'yapım eki (-lık)', 'yapım', ['lIk'], -1.5, { voicesFinal: true }),
  DER_CI:  d('AGT', 'yapım eki (-cı)', 'yapım', ['CI'], -1.5),
  DER_CIK: d('DIM', 'yapım eki, küçültme (-cık)', 'yapım', ['CIk'], -1.5, { voicesFinal: true }),
  ORD:     d('ORD', 'sıra sayı eki (-ıncı)', 'yapım', ['(I)ncI'], 0),
  DIST:    d('DIST', 'üleştirme sayı eki (-ar)', 'yapım', ['(ş)Ar'], 0),
};

// ---------------------------------------------------------------------------
// Dizilim (hangi durumdan sonra hangi ek gelebilir)
// Biçim: [ekKimliği, sonrakiDurum, koşul?]
// ---------------------------------------------------------------------------
const CASES = (to) => ['ACC', 'DAT', 'LOC', 'ABL', 'GEN', 'INS', 'EQU'].map((c) => [c, to]);
const CASES_N = (to) => ['ACC_N', 'DAT_N', 'LOC_N', 'ABL_N', 'GEN_N', 'INS', 'EQU_N'].map((c) => [c, to]);
const POSS = [['P1SG', 'N_P'], ['P2SG', 'N_P'], ['P1PL', 'N_P'], ['P2PL', 'N_P'], ['P3SG', 'N_P3'], ['P3PL', 'N_P3']];
const PRED = [
  ['COP_1SG', 'END'], ['COP_2SG', 'END'], ['COP_1PL', 'END'], ['COP_2PL', 'END'],
  ['COP_DIR', 'P_DIR'], ['COP_PAST', 'P_K'], ['COP_EVID', 'P_Z'], ['COP_COND', 'P_K'], ['COP_KEN', 'END'],
];
const ZP = (to) => [['Z1SG', to], ['Z2SG', to], ['Z1PL', to], ['Z2PL', to]];
const KP = [['K1SG', 'END'], ['K2SG', 'END'], ['K1PL', 'END'], ['K2PL', 'END'], ['A3PL', 'END']];
const TAM = [
  ['PROG', 'V_TZ'], ['FUT', 'V_TZ'], ['PAST', 'V_TK'], ['EVID', 'V_TZ'], ['AOR', 'V_TZ'],
  ['NEC', 'V_TZ'], ['COND', 'V_TK'], ['OPT', 'V_OPT'], ['PROG2', 'V_TZ'],
  ['PROG_COL', 'V_TC'], ['FUT_COL', 'V_FC'], ['FUT_COLK', 'V_TZ'],
];
const IMP = [['IMP_3SG', 'END'], ['IMP_2PL', 'END'], ['IMP_3PL', 'END'], ['IMP_EMPH', 'END']];
const NONFIN = [
  ['INF', 'N_INF'], ['VN_MA', 'N2'], ['VN_IS', 'N2'], ['PART_AN', 'N2'], ['PART_DIK', 'N_DIK'], ['PART_ACAK', 'N_DIK'],
  ['CONV_IP', 'END'], ['CONV_ARAK', 'END'], ['CONV_INCA', 'END'], ['CONV_DIKCA', 'END'], ['CONV_ALI', 'END'],
];
const DERIV = [
  ['DER_LI', 'N2'], ['DER_SIZ', 'N2'], ['DER_LIK', 'N2'], ['DER_CI', 'N2'], ['DER_CIK', 'N2'],
  ['ORD', 'N2', 'isNum'], ['DIST', 'N2', 'isNum'],
];

const NOMINAL = [['PL', 'N_PL'], ...POSS, ...CASES('N_C'), ...PRED];

export const TRANSITIONS = {
  N: [...NOMINAL, ...DERIV, ['KI', 'N_KI', 'timeNoun']],
  N2: NOMINAL,
  N_PL: [['P1SG', 'N_P'], ['P2SG', 'N_P'], ['P1PL', 'N_P'], ['P2PL', 'N_P'], ['P3SG', 'N_P3'], ...CASES('N_C'), ...PRED],
  N_P: [...CASES('N_C'), ...PRED],
  N_P3: [...CASES_N('N_C'), ...PRED],
  N_C: [['KI', 'N_KI', 'afterLocGen'], ['INS', 'N_C2', 'pronGen'], ...PRED],
  N_C2: PRED,
  N_KI: [['PL', 'N_PL'], ...CASES_N('N_C'), ...PRED],
  N_INF: [['ABL', 'N_C'], ['INS', 'N_C'], ['LOC', 'N_C'], ['DAT', 'N_C'], ['COP_DIR', 'P_DIR'], ['COP_PAST', 'P_K']],
  N_DIK: [...POSS, ['PL', 'N_DIKPL']],
  N_DIKPL: [['P1SG', 'N_P'], ['P2SG', 'N_P'], ['P1PL', 'N_P'], ['P2PL', 'N_P'], ['P3SG', 'N_P3']],

  P_DIR: [['A3PL', 'END']],
  P_K: KP,
  P_Z: [...ZP('END'), ['A3PL', 'END']],

  V: [
    ['PASS', 'V', 'voiceOk'], ['CAUS', 'V', 'voiceOk'],
    ['NEG', 'V_NEG'], ['ABIL', 'V_ABIL'], ['IMPOSS', 'V_NEG'],
    ...TAM, ...IMP, ...NONFIN, ['CONV_MADAN', 'END'],
  ],
  V_ABIL: [...TAM, ...NONFIN],
  V_NEG: [
    ['PROG', 'V_TZ'], ['FUT', 'V_TZ'], ['PAST', 'V_TK'], ['EVID', 'V_TZ'], ['NEC', 'V_TZ'],
    ['COND', 'V_TK'], ['OPT', 'V_OPT'], ['PROG2', 'V_TZ'],
    ['PROG_COL', 'V_TC'], ['FUT_COL', 'V_FC'], ['FUT_COLK', 'V_TZ'],
    ['AOR_NEG', 'V_AN'], ['AORNEG_1SG', 'END'], ['AORNEG_1PL', 'END'],
    ...IMP,
    ['INF', 'N_INF'], ['VN_MA', 'N2'], ['PART_AN', 'N2'], ['PART_DIK', 'N_DIK'], ['PART_ACAK', 'N_DIK'],
    ['CONV_IP', 'END'], ['CONV_ARAK', 'END'], ['CONV_INCA', 'END'], ['CONV_DIKCA', 'END'],
  ],
  V_TZ: [
    ...ZP('END'), ['A3PL', 'V_3PL'],
    ['COP_PAST', 'V_K2'], ['COP_EVID', 'V_Z2'], ['COP_COND', 'V_K2'], ['COP_DIR', 'V_DIR'], ['COP_KEN', 'END'],
  ],
  V_3PL: [['COP_PAST', 'END'], ['COP_EVID', 'END'], ['COP_COND', 'END'], ['COP_DIR', 'END']],
  V_TC: [
    ['C1SG', 'END'], ['K2SG', 'END'], ['C1PL', 'END'], ['Z2SG', 'END'], ['Z2PL', 'END'], ['A3PL', 'V_3PL'],
    ['COP_PAST', 'V_K2'], ['COP_EVID', 'V_Z2'],
  ],
  V_FC: [['C1SG', 'END'], ['K2SG', 'END'], ['C1PL', 'END'], ['Z2SG', 'END'], ['Z2PL', 'END']],
  V_DIR: [['A3PL', 'END']],
  V_TK: [...KP, ['COP_COND', 'V_K2'], ['COP_PAST', 'V_K2'], ['COP_EVID', 'V_Z2']],
  V_K2: KP,
  V_Z2: [...ZP('END'), ['A3PL', 'END']],
  V_OPT: [['OPT_1SG', 'END'], ['OPT_2SG', 'END'], ['OPT_1PL', 'END'], ['OPT_2PL', 'END'], ['A3PL', 'END'], ['COP_PAST', 'V_K2']],
  V_AN: [
    ['Z2SG', 'END'], ['Z2PL', 'END'], ['A3PL', 'V_3PL'],
    ['COP_PAST', 'V_K2'], ['COP_EVID', 'V_Z2'], ['COP_COND', 'V_K2'], ['COP_KEN', 'END'],
  ],

  // Özel kökler
  Q: [...ZP('END'), ['COP_PAST', 'V_K2'], ['COP_EVID', 'V_Z2'], ['COP_DIR', 'END']],   // soru eki "mi"
  PRED_ONLY: [...ZP('END'), ['A3PL', 'END'], ['COP_PAST', 'V_K2'], ['COP_EVID', 'V_Z2'], ['COP_COND', 'V_K2'], ['COP_DIR', 'P_DIR'], ['COP_KEN', 'END']], // "değil"
  I_COP: [['PAST', 'V_TK'], ['EVID', 'V_TZ'], ['COND', 'V_TK']],                      // idi / imiş / ise
  END: [],
  CLOSED: [],
};

/** Kelimenin bu durumlarda bitmesi dilbilgisel değildir. */
export const NON_FINAL = new Set(['V_ABIL', 'N_DIK', 'N_DIKPL', 'I_COP', 'V_FC']);

/** Çekimli (sonlu) fiil yapan ekler. */
export const FINITE_TAM = new Set([
  'PROG', 'FUT', 'PAST', 'EVID', 'AOR', 'AOR_NEG', 'NEC', 'COND', 'OPT', 'PROG2',
  'PROG_COL', 'FUT_COL', 'FUT_COLK',
  'AORNEG_1SG', 'AORNEG_1PL', 'IMP_3SG', 'IMP_2PL', 'IMP_3PL', 'IMP_EMPH',
]);

export const NONFINITE = new Set([
  'INF', 'VN_MA', 'VN_IS', 'PART_AN', 'PART_DIK', 'PART_ACAK',
  'CONV_IP', 'CONV_ARAK', 'CONV_INCA', 'CONV_MADAN', 'CONV_DIKCA', 'CONV_ALI', 'COP_KEN',
]);

/** Zaman/kip özetleri (klinik tablo için). */
export const TAM_LABELS = {
  PROG: 'Şimdiki zaman (-yor)',
  PROG2: 'Şimdiki zaman (-makta)',
  PAST: 'Görülen geçmiş (-dı)',
  EVID: 'Öğrenilen geçmiş (-mış)',
  FUT: 'Gelecek zaman (-acak)',
  AOR: 'Geniş zaman (-r)',
  AOR_NEG: 'Geniş zaman (-z)',
  AORNEG_1SG: 'Geniş zaman (-z)',
  AORNEG_1PL: 'Geniş zaman (-z)',
  NEC: 'Gereklilik (-malı)',
  COND: 'Dilek-şart (-sa)',
  OPT: 'İstek (-a)',
  IMP: 'Emir',
};
