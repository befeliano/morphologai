/**
 * Türkçe fonetik motoru — heceleme, ses birimleri, ses pozisyonu ve IPA çevirisi.
 * Kural tabanlı ve deterministiktir (aynı girdi → aynı çıktı); DOM kullanmaz.
 *
 * Heceleme: her hecede tek ünlü vardır; iki ünlü arasındaki ünsüzlerin sonuncusu sonraki
 *   heceye geçer, kalanlar önceki hecede kalır (ki-tap-lar, Türk-çe, kont-rol). Yan yana iki
 *   ünlü ayrı hecedir (sa-at). Sözcük başındaki ünsüz öbeği ilk heceye aittir (tren, spor).
 *
 * Ses birimleri: Türkçe yazım büyük ölçüde sestemseldir; harf = ses. Ayrıca:
 *   ğ → önceki ünlüyü uzatır (dağ → daː), iki ön ünlü arasında /j/ (değil → dejil),
 *       ünlüler arasında düşer (ağaç → a.atʃ)
 *   k, g → ön ünlü komşuluğunda damaksıl (c, ɟ): kedi → cedi, gül → ɟyl
 *   l → ön ünlü komşuluğunda ince (l), art ünlü komşuluğunda kalın (ɫ)
 *   â, î, û → uzun ünlü; k/g/l'den sonra önceki ünsüzü inceltir (kâğıt → caːɯt)
 *   v → ünlüler arasında ʋ (yaklaşık), n → k/g'den önce ŋ, h her konumda h
 *   r → ɾ (tek vuruşlu)
 * Çeviri standart (ölçünlü) Türkçe sesletime göredir; ağız özellikleri, alıntı sözcüklerdeki
 * özel sesletimler ve vurgu yansıtılmaz. Ekip, yanlış çıkan sözcükleri "ipaOverrides" ile düzeltir.
 */
import { trLower } from './normalize.js';

const FRONT = new Set('eiöü');
const BACK = new Set('aıou');
const V = new Set('aeıioöuüâîû');
const LETTER = /[a-zçğıöşüâîû]/;
const isV = (c) => V.has(c);
const base = (c) => (c === 'â' ? 'a' : c === 'î' ? 'i' : c === 'û' ? 'u' : c);

/** Ünlü → IPA */
const VOWEL_IPA = { a: 'a', e: 'e', ı: 'ɯ', i: 'i', o: 'o', ö: 'œ', u: 'u', ü: 'y' };
/** Ünsüz → IPA (bağlamdan bağımsız olanlar) */
const CONS_IPA = {
  b: 'b', c: 'dʒ', ç: 'tʃ', d: 'd', f: 'f', h: 'h', j: 'ʒ', m: 'm', n: 'n', p: 'p', r: 'ɾ', s: 's', ş: 'ʃ', t: 't', y: 'j', z: 'z',
  q: 'k', w: 'v', x: 'ks',
};

/** Metindeki sözcükleri (yalnız harfler) döndürür; kesme işaretinden sonrası aynı sözcüğe eklenir. */
export function wordsOf(text) {
  return trLower(text).replace(/['’]/g, '').split(/[^a-zçğıöşüâîû]+/).filter(Boolean);
}

/**
 * Sözcüğü hecelerine ayırır. Ünlüsüz girdide (kısaltma, ünlem) tek parça döner.
 * @returns {string[]}
 */
export function syllabify(word) {
  const w = trLower(word).replace(/[^a-zçğıöşüâîû]/g, '');
  if (!w) return [];
  const idx = [];
  for (let i = 0; i < w.length; i++) if (isV(w[i])) idx.push(i);
  if (idx.length <= 1) return [w];
  const out = [];
  let start = 0;
  for (let k = 0; k < idx.length - 1; k++) {
    const between = idx[k + 1] - idx[k] - 1; // iki ünlü arasındaki ünsüz sayısı
    // Sonraki heceye bir ünsüz geçer (varsa); kalanı bu hecede kalır
    const cut = between === 0 ? idx[k] + 1 : idx[k + 1] - 1;
    out.push(w.slice(start, cut));
    start = cut;
  }
  out.push(w.slice(start));
  return out;
}

export const syllableCountOf = (word) => syllabify(word).length || 0;

/**
 * Sözcüğün ses birimleri (IPA birimleri dizisi) ve her birimin kaynağı.
 * @returns {Array<{ipa: string, letter: string, index: number, vowel: boolean, long?: boolean}>}
 */
export function phonemes(word, overrides = null) {
  const w = trLower(word).replace(/[^a-zçğıöşüâîû]/g, '');
  const ov = overrides && (overrides.get ? overrides.get(w) : overrides[w]);
  if (ov) return String(ov).split(/\s+/).filter(Boolean).map((ipa, i) => ({ ipa, letter: '', index: i, vowel: /[aeɯioœuy]/.test(ipa) }));
  const out = [];
  const prevVowel = (i) => { for (let j = i - 1; j >= 0; j--) if (isV(w[j])) return w[j]; return null; };
  const nextVowel = (i) => { for (let j = i + 1; j < w.length; j++) if (isV(w[j])) return w[j]; return null; };
  // Ünsüzün komşu ünlüsü: aynı hecedeki ünlü belirleyicidir (önce sonraki, yoksa önceki)
  const frontContext = (i) => {
    const n = w[i + 1];
    if (n && isV(n)) return n === 'â' || n === 'û' ? true : FRONT.has(base(n)); // kâ, lâ, gû → ince
    const p = prevVowel(i);
    return p ? FRONT.has(base(p)) : false;
  };
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    if (isV(c)) {
      const long = c === 'â' || c === 'î' || c === 'û';
      out.push({ ipa: VOWEL_IPA[base(c)] + (long ? 'ː' : ''), letter: c, index: i, vowel: true, long });
      continue;
    }
    if (c === 'ğ') {
      const p = w[i - 1];
      const n = w[i + 1];
      const last = out[out.length - 1];
      if (p && isV(p) && n && isV(n)) {
        // iki ön ünlü arasında /j/; diğer durumlarda düşer (ünlüler ayrı hecede kalır)
        if (FRONT.has(base(p)) && FRONT.has(base(n))) out.push({ ipa: 'j', letter: c, index: i, vowel: false });
      } else if (last && last.vowel && !last.long) {
        last.ipa += 'ː'; // hece sonunda: önceki ünlüyü uzatır
        last.long = true;
      }
      continue;
    }
    let ipa = CONS_IPA[c];
    if (c === 'k') ipa = frontContext(i) ? 'c' : 'k';
    else if (c === 'g') ipa = frontContext(i) ? 'ɟ' : 'ɡ';
    else if (c === 'l') ipa = frontContext(i) ? 'l' : 'ɫ';
    else if (c === 'v') ipa = w[i - 1] && isV(w[i - 1]) && w[i + 1] && isV(w[i + 1]) ? 'ʋ' : 'v';
    else if (c === 'n' && (w[i + 1] === 'k' || w[i + 1] === 'g')) ipa = 'ŋ';
    if (!ipa) continue;
    out.push({ ipa, letter: c, index: i, vowel: false });
  }
  return out;
}

/** Sözcüğün IPA yazımı; hece sınırları nokta ile gösterilir. */
export function toIPAWord(word, { syllables = true, overrides = null } = {}) {
  const w = trLower(word).replace(/[^a-zçğıöşüâîû]/g, '');
  if (!w) return '';
  const ph = phonemes(w, overrides);
  if (!syllables || ph.some((p) => !p.letter)) return ph.map((p) => p.ipa).join('');
  // Hece sınırı: harf dizinlerine göre
  const syl = syllabify(w);
  const sylOf = [];
  syl.forEach((part, k) => { for (let i = 0; i < part.length; i++) sylOf.push(k); });
  let s = '';
  let cur = 0;
  for (const p of ph) {
    const k = sylOf[p.index] ?? cur;
    if (k !== cur && s) s += '.';
    cur = k;
    s += p.ipa;
  }
  return s;
}

/**
 * Metni IPA'ya çevirir. Noktalama korunur; sözcük olmayan parçalar olduğu gibi kalır.
 * @returns {{ipa: string, words: Array<{word, ipa, syllables}>}}
 */
export function toIPA(text, opts = {}) {
  const words = [];
  const ipa = String(text ?? '').replace(/[A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû'’]+/g, (m) => {
    const clean = m.replace(/['’]/g, '');
    const r = toIPAWord(clean, opts);
    words.push({ word: m, ipa: r, syllables: syllabify(clean) });
    return r;
  });
  return { ipa: `/${ipa.trim()}/`, words };
}

// ---------------------------------------------------------------------------
// Hedef ses sorguları (materyal üreticiler için)
// ---------------------------------------------------------------------------
/**
 * Hedef sesi yazım düzeyinde çözer. Kullanıcı harf ("r", "ş", "k") ya da IPA ("ʃ", "tʃ") yazabilir.
 * @returns {{letters: string[], ipa: string[]}}
 */
const IPA_TO_LETTER = { ʃ: 'ş', tʃ: 'ç', dʒ: 'c', ʒ: 'j', j: 'y', ɾ: 'r', ɯ: 'ı', œ: 'ö', y: 'ü', ɡ: 'g', ɟ: 'g', c: 'k', ɫ: 'l', ŋ: 'n', ʋ: 'v' };
export function normalizeTarget(t) {
  const s = trLower(String(t || '').replace(/[/\[\]\s]/g, ''));
  if (!s) return '';
  if (IPA_TO_LETTER[s] && !LETTER.test(s[0])) return IPA_TO_LETTER[s];
  if (s === 'tʃ' || s === 'dʒ') return IPA_TO_LETTER[s];
  return s;
}

/**
 * Hedef sesin (harf ya da harf dizisi) sözcükteki konumları.
 * initial: sözcük başı · final: sözcük sonu · medial: sözcük içi.
 * Ayrıca hece konumu: onset (hece başı) / coda (hece sonu) — sözcük içi için.
 */
export function positionsOf(word, target) {
  const w = trLower(word).replace(/[^a-zçğıöşüâîû]/g, '');
  const t = normalizeTarget(target);
  const res = { initial: false, medial: false, final: false, medialOnset: false, medialCoda: false, count: 0, indexes: [] };
  if (!w || !t) return res;
  const plain = [...w].map(base).join('');
  const syl = syllabify(w);
  const starts = new Set();
  const ends = new Set();
  let acc = 0;
  for (const s of syl) { starts.add(acc); acc += s.length; ends.add(acc - 1); }
  for (let i = plain.indexOf(t); i !== -1; i = plain.indexOf(t, i + 1)) {
    res.count++;
    res.indexes.push(i);
    const end = i + t.length - 1;
    if (i === 0) res.initial = true;
    if (end === plain.length - 1) res.final = true;
    if (i > 0 && end < plain.length - 1) {
      res.medial = true;
      if (starts.has(i)) res.medialOnset = true;
      if (ends.has(end)) res.medialCoda = true;
    }
  }
  return res;
}

/** Ünlü/ünsüz iskeleti: "kitap" → "CVCVC" (hece yapısı filtreleri için). */
export function cvShape(word) {
  return [...trLower(word).replace(/[^a-zçğıöşüâîû]/g, '')].map((c) => (isV(c) ? 'V' : 'C')).join('');
}

/** Hedef sesi vurgulamak için sözcüğü parçalara böler: [{text, hit}] */
export function highlightParts(word, target) {
  const t = normalizeTarget(target);
  const lower = [...trLower(word)].map(base).join('');
  if (!t) return [{ text: word, hit: false }];
  const out = [];
  let i = 0;
  while (i < word.length) {
    const j = lower.indexOf(t, i);
    if (j === -1) { out.push({ text: word.slice(i), hit: false }); break; }
    if (j > i) out.push({ text: word.slice(i, j), hit: false });
    out.push({ text: word.slice(j, j + t.length), hit: true });
    i = j + t.length;
  }
  return out;
}

export const isFrontVowel = (c) => FRONT.has(base(c));
export const isBackVowel = (c) => BACK.has(base(c));
