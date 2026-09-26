/**
 * Sözlük: Zemberek-NLP Türkçe sözlüklerini (Apache-2.0) yükler ve her kök için
 * ses olaylarına göre yüzey biçimleri (gövde varyantları) üretir:
 *
 *   kitap  → kitap (ünsüzle başlayan ek) / kitab- (ünlüyle başlayan ek)   ünsüz yumuşaması
 *   ağız   → ağız / ağz-                                                  ünlü düşmesi
 *   hak    → hak / hakk-                                                  ünsüz ikizleşmesi
 *   başla  → başla / başl- (+ıyor)                                        ünlü daralması
 *   git    → git / gid-                                                   fiil yumuşaması
 *   saat   → saat (ince ünlülü ek alır: saati)                            ters ünlü uyumu
 *
 * Özel ad havuzları (yer adları, kişi adları, derlemden özel adlar) ve kısaltmalar
 * ayrı tutulur ve yalnızca büyük harfle yazılmış sözcüklerde devreye girer; böylece
 * küçük harfli bir neolojizm yanlışlıkla bir köy adıyla eşleşmez.
 */
import { normKey, lastVowel, vowelCount, voiceFinal, frontOf, isVowel } from './normalize.js';
import { CORE, PREFERRED, FALLBACK_CLOSED, PROPER_NAMES, PLACES } from './coreLexicon.js';

export const POS_LABEL = {
  noun: 'İsim', verb: 'Fiil', adj: 'Sıfat', adv: 'Zarf', pron: 'Zamir', det: 'Belirleyici',
  conj: 'Bağlaç', postp: 'Edat', num: 'Sayı', interj: 'Ünlem', ques: 'Soru eki', neg: 'Olumsuzluk',
  cop: 'Ek-fiil', prop: 'Özel isim', abbr: 'Kısaltma', unknown: 'Bilinmeyen',
};
export const POS_CSS = {
  noun: 'noun', verb: 'verb', adj: 'adj', adv: 'adv', pron: 'pron', det: 'det', conj: 'conj',
  postp: 'adp', num: 'num', interj: 'other', ques: 'adp', neg: 'adp', cop: 'verb', prop: 'prop',
  abbr: 'noun', unknown: 'unk',
};
/** İçerik sözcüğü türleri. */
export const CONTENT_POS = new Set(['noun', 'verb', 'adj', 'adv', 'prop', 'abbr']);
/** İşlev sözcüğü türleri. */
export const FUNCTION_POS = new Set(['pron', 'det', 'conj', 'postp', 'ques', 'neg', 'cop', 'interj', 'num']);

const P_MAP = {
  Noun: 'noun', Adj: 'adj', Adv: 'adv', Pron: 'pron', Conj: 'conj', Postp: 'postp', Det: 'det',
  Num: 'num', Interj: 'interj', Ques: 'ques', Verb: 'verb', Dup: 'dup', Punc: 'punc', Abbrv: 'abbr',
};
const CLOSED_POS = new Set(['pron', 'conj', 'postp', 'det', 'ques', 'neg', 'num', 'cop']);

/** 3. kişi iyelik ekiyle biten zamirler: hâl eki zamir n'si ile gelir (hepsi-n-i). */
const P3_PRONOUNS = new Set([
  'hepsi', 'biri', 'birisi', 'çoğu', 'birçoğu', 'kimisi', 'hiçbiri', 'herbiri', 'birbiri', 'bazısı',
  'tümü', 'diğeri', 'öbürü', 'başkası', 'birkaçı', 'cümlesi', 'kimi', 'birileri',
]);

const CORE_BONUS = 12;

export class Lexicon {
  constructor() {
    /** yüzey biçimi → gövde varyantları */
    this.stems = new Map();
    this.entries = new Map();
    /** normalize özel ad → { display, kind } (yalnız büyük harfli kullanımda) */
    this.proper = new Map();
    /** BÜYÜK HARFLİ kısaltma → { display, spoken } */
    this.abbr = new Map();
    this.size = 0;
    this.sources = [];
  }

  _addStem(surf, variant) {
    let list = this.stems.get(surf);
    if (!list) this.stems.set(surf, (list = []));
    list.push(variant);
  }

  addEntry(e) {
    // Aynı kök+tür farklı ses özellikleriyle birden çok kez geçebilir (ör. "kalp",
    // "yok"); bunlar ayrı girdiler olarak tutulur, yalnızca birebir aynıları atlanır.
    const key = `${e.root}|${e.pos}|${[...e.attrs].sort().join(',')}|${e.surf || ''}|${e.state || ''}`;
    if (this.entries.has(key)) return this.entries.get(key);
    e.known = true;
    const coreKey = `${e.root}:${e.pos === 'prop' ? 'noun' : e.pos}`;
    e.core = (CORE.has(coreKey) || CLOSED_POS.has(e.pos)) ? CORE_BONUS
      : e.pos === 'interj' ? CORE_BONUS / 2 : 0;
    e.core += PREFERRED.get(coreKey) || 0;
    this.entries.set(key, e);
    this.size++;
    buildVariants(e).forEach((v) => this._addStem(v.surf, v));
    return e;
  }

  addProper(display, kind) {
    const k = normKey(display);
    if (!k || k.length < 2 || this.proper.has(k)) return;
    this.proper.set(k, { display, kind });
  }

  prefixStems(word) {
    const out = [];
    for (let i = 1; i <= word.length; i++) {
      const list = this.stems.get(word.slice(0, i));
      if (list) for (const v of list) out.push(v);
    }
    return out;
  }

  /** Kelimenin başında yer alan özel adlar (en uzun önce). */
  properPrefixes(word) {
    const out = [];
    for (let i = word.length; i >= 2; i--) {
      const p = this.proper.get(word.slice(0, i));
      if (p) out.push({ key: word.slice(0, i), ...p });
    }
    return out;
  }

  /** Kelime sözlükte (kök olarak) var mı? */
  hasRoot(word) {
    const list = this.stems.get(word);
    return !!list && list.some((v) => !v.needs || v.needs === 'notVowel');
  }
}

// ---------------------------------------------------------------------------
// Gövde varyantları
// ---------------------------------------------------------------------------
function startState(e) {
  if (e.state) return e.state;
  switch (e.pos) {
    case 'verb': return 'V';
    case 'conj': case 'interj': return 'CLOSED';
    case 'ques': return 'Q';
    case 'neg': return 'PRED_ONLY';
    case 'pron': return P3_PRONOUNS.has(e.root) ? 'N_P3' : 'N';
    default: return 'N';
  }
}

function nominalVoicing(e) {
  const { root, attrs } = e;
  if (e.pos === 'prop') return false;
  if (attrs.has('NoVoicing')) return false;
  if (attrs.has('Voicing')) return true;
  const last = root[root.length - 1];
  if (!'pçtkg'.includes(last)) return false;
  if (root.endsWith('nk')) return true;           // renk → rengi
  return vowelCount(root) > 1;                     // kitap → kitabı; tek heceli: top → topu
}

function dropLastVowel(root) {
  for (let i = root.length - 1; i >= 0; i--) {
    if (isVowel(root[i])) return root.slice(0, i) + root.slice(i + 1);
  }
  return root;
}

function variant(e, surf, lv, needs, extra = {}) {
  return { entry: e, surf, lv, needs, state: startState(e), ...extra };
}

function buildVariants(e) {
  const { root, pos, attrs } = e;
  const out = [];
  if (!root) return out;
  const ih = attrs.has('InverseHarmony');
  const lv = e.lv || (ih ? frontOf(lastVowel(root)) : lastVowel(root));

  if (e.special) {
    out.push(variant(e, e.surf || root, e.lv || lastVowel(e.rootSurf || root) || 'e', e.needs || null,
      { pre: e.pre, rootSurf: e.rootSurf, note: e.note }));
    return out;
  }
  if (attrs.has('NoSuffix')) {
    out.push(variant(e, root, lv, null, { state: 'CLOSED' }));
    return out;
  }

  if (pos === 'verb') {
    const voicing = attrs.has('Voicing');
    out.push(variant(e, root, lv, voicing ? 'notVowel' : null));
    if (voicing) {
      const vs = voiceFinal(root);
      if (vs) out.push(variant(e, vs, lv, 'vowel', { note: 'ünsüz yumuşaması' }));
    }
    if (isVowel(root[root.length - 1])) {
      const dr = root.slice(0, -1);
      if (dr) out.push(variant(e, dr, lastVowel(dr) || lv, 'prog', { dropped: true, note: 'ünlü daralması' }));
    }
    if (root === 'de' || root === 'ye') {
      out.push(variant(e, root[0] + 'i', 'i', 'y', { note: 'ünlü daralması' }));
    }
    if (attrs.has('LastVowelDrop')) {
      // devir → devr-il (edilgen), çağır → çağr-ıl
      const ds = dropLastVowel(root);
      out.push(variant(e, ds, lastVowel(ds) || lv, 'vowel', { note: 'ünlü düşmesi' }));
    }
    return out;
  }

  const voicing = nominalVoicing(e);
  const drop = attrs.has('LastVowelDrop');
  const dbl = attrs.has('Doubling');
  out.push(variant(e, root, lv, voicing || drop || dbl ? 'notVowel' : null));
  if (drop) {
    let ds = dropLastVowel(root);
    if (voicing) ds = voiceFinal(ds) || ds;
    const dlv = ih ? frontOf(lastVowel(ds)) : lastVowel(ds);
    out.push(variant(e, ds, dlv || lv, 'vowel', { note: 'ünlü düşmesi' }));
  } else if (dbl) {
    const base = voicing ? voiceFinal(root) || root : root;
    out.push(variant(e, base + base[base.length - 1], lv, 'vowel', { note: 'ünsüz ikizleşmesi' }));
  } else if (voicing) {
    const vs = voiceFinal(root);
    if (vs) out.push(variant(e, vs, lv, 'vowel', { note: 'ünsüz yumuşaması' }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zemberek .dict ayrıştırma
// ---------------------------------------------------------------------------
function parseDictLine(line) {
  const t = line.trim();
  if (!t || t.startsWith('#')) return null;
  const br = t.indexOf('[');
  const word = (br >= 0 ? t.slice(0, br) : t).trim();
  if (!word || /\s/.test(word)) return null;
  const P = [];
  const A = new Set();
  let Pr = null;
  if (br >= 0) {
    const meta = t.slice(br + 1, t.lastIndexOf(']'));
    for (const part of meta.split(';')) {
      const m = part.match(/^\s*(\w+)\s*:\s*(.*)$/);
      if (!m) continue;
      const vals = m[2].split(',').map((v) => v.trim()).filter(Boolean);
      if (m[1] === 'P') P.push(...vals);
      else if (m[1] === 'A') vals.forEach((v) => A.add(v));
      else if (m[1] === 'Pr') Pr = vals[0];
    }
  }
  return { word, P, A, Pr };
}

function entryFromDict(raw, src) {
  const key = normKey(raw.word);
  let pos = raw.P.length ? P_MAP[raw.P[0]] : null;
  const sub = raw.P.slice(1).map((x) => x.toLowerCase());
  if (pos === 'dup' || pos === 'punc' || pos === 'abbr') return null;
  let root = key;
  let lemma = key;
  if (!pos) {
    if (key.length > 3 && /m[ae]k$/.test(key)) {
      pos = 'verb';
      root = key.slice(0, -3);
    } else pos = 'noun';
  } else if (pos === 'verb') {
    pos = key === 'değil' ? 'neg' : 'verb';
  }
  if (pos === 'verb' && root === 'i') return null;   // "imek" ayrıca ele alınır
  if (sub.includes('prop')) pos = 'prop';
  return { root, lemma, pos, sub, attrs: raw.A, src };
}

/** Elle tanımlanan düzensiz / özel biçimler. */
function specialEntries() {
  const S = (o) => ({ attrs: new Set(), sub: [], src: 'special', special: true, ...o });
  return [
    S({ root: 'o', lemma: 'o', pos: 'pron', surf: 'on', rootSurf: 'on', needs: 'any', lv: 'o', note: 'zamir n\'si' }),
    S({ root: 'bu', lemma: 'bu', pos: 'pron', surf: 'bun', rootSurf: 'bun', needs: 'any', lv: 'u', note: 'zamir n\'si' }),
    S({ root: 'şu', lemma: 'şu', pos: 'pron', surf: 'şun', rootSurf: 'şun', needs: 'any', lv: 'u', note: 'zamir n\'si' }),
    S({ root: 'ben', lemma: 'ben', pos: 'pron', surf: 'bana', rootSurf: 'ban', lv: 'a', state: 'N_C',
      pre: [{ id: 'DAT', surface: 'a' }], note: 'düzensiz biçim' }),
    S({ root: 'sen', lemma: 'sen', pos: 'pron', surf: 'sana', rootSurf: 'san', lv: 'a', state: 'N_C',
      pre: [{ id: 'DAT', surface: 'a' }], note: 'düzensiz biçim' }),
    S({ root: 'ben', lemma: 'ben', pos: 'pron', surf: 'benim', rootSurf: 'ben', lv: 'i', state: 'N_C',
      pre: [{ id: 'GEN', surface: 'im' }], lastCase: 'GEN', note: 'düzensiz biçim' }),
    S({ root: 'biz', lemma: 'biz', pos: 'pron', surf: 'bizim', rootSurf: 'biz', lv: 'i', state: 'N_C',
      pre: [{ id: 'GEN', surface: 'im' }], lastCase: 'GEN', note: 'düzensiz biçim' }),
    S({ root: 'su', lemma: 'su', pos: 'noun', surf: 'suy', rootSurf: 'suy', needs: 'vowel', lv: 'u', note: 'kaynaştırma' }),
    S({ root: 'ne', lemma: 'ne', pos: 'pron', surf: 'ney', rootSurf: 'ney', needs: 'vowel', lv: 'e', note: 'kaynaştırma' }),
    S({ root: 'i', lemma: 'i-', pos: 'cop', surf: 'i', rootSurf: 'i', lv: 'i', state: 'I_COP', note: 'ek-fiil' }),
    S({ root: 'iken', lemma: 'iken', pos: 'conj', surf: 'iken', rootSurf: 'iken', lv: 'e', state: 'CLOSED' }),
    // Konuşma dili kısaltmaları
    S({ root: 'bir', lemma: 'bir', pos: 'det', surf: 'bi', rootSurf: 'bi', lv: 'i', state: 'CLOSED', note: 'konuşma dili (bir)' }),
    S({ root: 'şöyle', lemma: 'şöyle', pos: 'adv', surf: 'şöle', rootSurf: 'şöle', lv: 'e', state: 'CLOSED', note: 'konuşma dili (şöyle)' }),
    S({ root: 'böyle', lemma: 'böyle', pos: 'adv', surf: 'böle', rootSurf: 'böle', lv: 'e', state: 'CLOSED', note: 'konuşma dili (böyle)' }),
    S({ root: 'öyle', lemma: 'öyle', pos: 'adv', surf: 'öle', rootSurf: 'öle', lv: 'e', state: 'CLOSED', note: 'konuşma dili (öyle)' }),
    S({ root: 'nasıl', lemma: 'nasıl', pos: 'adv', surf: 'nası', rootSurf: 'nası', lv: 'ı', state: 'CLOSED', note: 'konuşma dili (nasıl)' }),
  ];
}

function fallbackEntries() {
  const out = [];
  for (const key of CORE) {
    const [root, pos] = key.split(':');
    out.push({ root, lemma: root, pos, sub: [], attrs: new Set(), src: 'core' });
  }
  for (const [pos, list] of Object.entries(FALLBACK_CLOSED)) {
    for (const w of list.split(/\s+/)) if (w) out.push({ root: w, lemma: w, pos, sub: [], attrs: new Set(), src: 'core' });
  }
  return out;
}

const LETTER_NAMES = {
  a: 'a', b: 'be', c: 'ce', ç: 'çe', d: 'de', e: 'e', f: 'fe', g: 'ge', ğ: 'ge', h: 'he', ı: 'ı', i: 'i',
  j: 'je', k: 'ke', l: 'le', m: 'me', n: 'ne', o: 'o', ö: 'ö', p: 'pe', r: 're', s: 'se', ş: 'şe', t: 'te',
  u: 'u', ü: 'ü', v: 've', y: 'ye', z: 'ze', w: 've', x: 'iks', q: 'kü',
};

/** Kısaltmanın okunuşu (ek uyumu için): MR → "me-re" → son ünlü e. */
export function spokenAbbr(abbr, pr) {
  if (pr) return pr;
  const low = normKey(abbr);
  return [...low].map((c) => LETTER_NAMES[c] || c).join('');
}

/** Metin içeriklerinden sözlük kurar (test ve çalışma zamanı ortak). */
export function buildLexicon(files = {}) {
  const { master = '', nonTdk = '', persons = '', locations = '', proper = '', properCorpus = '', abbreviations = '' } = files;
  const lex = new Lexicon();
  const eachLine = (text, fn) => {
    if (!text) return 0;
    let n = 0;
    for (const line of text.split(/\r?\n/)) {
      const raw = parseDictLine(line);
      if (raw) { fn(raw); n++; }
    }
    return n;
  };
  const nMaster = eachLine(master, (raw) => { const e = entryFromDict(raw, 'master'); if (e) lex.addEntry(e); });
  eachLine(nonTdk, (raw) => { const e = entryFromDict(raw, 'nontdk'); if (e) lex.addEntry(e); });
  if (!nMaster) fallbackEntries().forEach((e) => lex.addEntry(e));
  specialEntries().forEach((e) => lex.addEntry(e));

  // Sık kişi/yer adları: küçük harfle de tanınır (ceza puanıyla)
  for (const [list, src] of [[PROPER_NAMES, 'person'], [PLACES, 'place']]) {
    for (const w of list.split(/\s+/)) {
      if (!w) continue;
      lex.addEntry({ root: normKey(w), lemma: w, pos: 'prop', sub: [], attrs: new Set(), src, display: w });
      lex.addProper(w, src === 'person' ? 'kişi adı' : 'yer adı');
    }
  }
  // Geniş özel ad havuzları: yalnız büyük harfli kullanımda
  eachLine(persons, (raw) => lex.addProper(raw.word, 'kişi adı'));
  eachLine(locations, (raw) => lex.addProper(raw.word, 'yer adı'));
  eachLine(proper, (raw) => lex.addProper(raw.word, 'özel ad'));
  eachLine(properCorpus, (raw) => { if (/^[A-ZÇĞİÖŞÜ]/.test(raw.word)) lex.addProper(raw.word, 'özel ad'); });
  eachLine(abbreviations, (raw) => {
    if (/^[A-ZÇĞİÖŞÜ0-9]{2,6}$/.test(raw.word)) lex.abbr.set(raw.word, { display: raw.word, spoken: spokenAbbr(raw.word, raw.Pr) });
  });
  for (const a of ['TV', 'MR', 'BT', 'EEG', 'EKG', 'SGK', 'PTT', 'AVM', 'ABD', 'TL', 'KM', 'DR', 'DKT']) {
    if (!lex.abbr.has(a)) lex.abbr.set(a, { display: a, spoken: spokenAbbr(a) });
  }

  lex.sources = nMaster
    ? ['zemberek-master', nonTdk && 'zemberek-non-tdk', persons && 'zemberek-person-names', locations && 'zemberek-locations',
      proper && 'zemberek-proper', properCorpus && 'zemberek-proper-corpus', abbreviations && 'zemberek-abbreviations'].filter(Boolean)
    : ['core-fallback'];
  return lex;
}

let _lexicon = null;
let _loading = null;

export const LEXICON_FILES = {
  master: 'master-dictionary.dict',
  nonTdk: 'non-tdk.dict',
  persons: 'person-names.dict',
  locations: 'locations-tr.dict',
  proper: 'proper.dict',
  properCorpus: 'proper-from-corpus.dict',
  abbreviations: 'abbreviations.dict',
};

/**
 * Sözlüğü (bir kez) yükler. baseUrl: sitenin kök adresi.
 * Dosyalar alınamazsa çekirdek listeyle çalışır (uyarı verir).
 */
export function loadLexicon(baseUrl = document.baseURI) {
  if (_lexicon) return Promise.resolve(_lexicon);
  if (_loading) return _loading;
  const get = (f) => fetch(new URL(`data/lexicon/${f}`, baseUrl).href).then((r) => (r.ok ? r.text() : '')).catch(() => '');
  const keys = Object.keys(LEXICON_FILES);
  _loading = Promise.all(keys.map((k) => get(LEXICON_FILES[k]))).then((texts) => {
    const files = Object.fromEntries(keys.map((k, i) => [k, texts[i]]));
    _lexicon = buildLexicon(files);
    if (!files.master) console.warn('Zemberek sözlüğü yüklenemedi; çekirdek sözlükle devam ediliyor.');
    return _lexicon;
  });
  return _loading;
}

export function getLexicon() {
  if (!_lexicon) throw new Error('Sözlük henüz yüklenmedi (önce loadLexicon() çağrılmalı).');
  return _lexicon;
}

export function isLexiconReady() { return !!_lexicon; }
export function setLexicon(lex) { _lexicon = lex; }
