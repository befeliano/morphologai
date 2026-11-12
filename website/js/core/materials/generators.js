/**
 * Materyal üreticiler — saf fonksiyonlar. Rastgelelik tohumludur: aynı tohum aynı materyali verir
 * (yeniden üretilebilir, test edilebilir). Girdi olarak sözcük bankası girişleri ya da düz sözcükler alınır.
 *
 *  minimalPairs   : tek ses farkıyla ayrılan sözcük çiftleri (aynı konumda a ↔ b)
 *  twoWordPhrases : hedef sesi taşıyan iki sözcüklü öbekler (sıfat + ad, ad + eylem, yineleme)
 *  wordSearch     : sözcük avı ızgarası + çözüm anahtarı
 *  scramble       : karışık harfler
 *  crossword      : çengel bulmaca (kesişen yerleşim)
 *  letterMaze     : labirent — harfleri sırayla izleyerek sözcüğü bulma
 *  sentenceStems  : cümle tamamlama başlangıçları (konu × zaman)
 *  whQuestions    : 5N1K soru kalıpları
 */
import { trLower } from '../text/normalize.js';
import { normalizeTarget, positionsOf } from '../text/phonetics.js';

// ---- tohumlu rastgele ----
export function rng(seed = 1) {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const wordOf = (x) => (typeof x === 'string' ? x : x.word);
const upper = (s) => s.toLocaleUpperCase('tr-TR');
const ALPHABET = [...'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'];

// ---------------------------------------------------------------------------
// Minimal çiftler
// ---------------------------------------------------------------------------
/** Sık çalışılan karşıtlıklar (fonolojik süreçlere göre). */
export const PAIR_SETS = [
  { id: 'k-t', a: 'k', b: 't', label: 'k – t (öne alma)' }, { id: 'g-d', a: 'g', b: 'd', label: 'g – d (öne alma)' },
  { id: 't-k', a: 't', b: 'k', label: 't – k (arkaya alma)' }, { id: 's-t', a: 's', b: 't', label: 's – t (duraklaştırma)' },
  { id: 'ş-s', a: 'ş', b: 's', label: 'ş – s' }, { id: 'z-s', a: 'z', b: 's', label: 'z – s (ötümsüzleşme)' },
  { id: 'r-l', a: 'r', b: 'l', label: 'r – l (akıcı ünsüzler)' }, { id: 'r-y', a: 'r', b: 'y', label: 'r – y (kayma)' },
  { id: 'l-y', a: 'l', b: 'y', label: 'l – y (kayma)' }, { id: 'ç-t', a: 'ç', b: 't', label: 'ç – t' },
  { id: 'c-d', a: 'c', b: 'd', label: 'c – d' }, { id: 'b-p', a: 'b', b: 'p', label: 'b – p (ötümlülük)' },
  { id: 'd-t', a: 'd', b: 't', label: 'd – t (ötümlülük)' }, { id: 'g-k', a: 'g', b: 'k', label: 'g – k (ötümlülük)' },
  { id: 'v-f', a: 'v', b: 'f', label: 'v – f (ötümlülük)' }, { id: 'm-n', a: 'm', b: 'n', label: 'm – n' },
  { id: 'f-p', a: 'f', b: 'p', label: 'f – p (duraklaştırma)' }, { id: 'ş-ç', a: 'ş', b: 'ç', label: 'ş – ç' },
];

/**
 * @param {Array} bank sözcük girişleri (ya da sözcükler)
 * @param {string} a ilk ses (harf)  @param {string} b ikinci ses
 * @param {object} o { position: 'initial'|'medial'|'final'|null }
 * @returns {Array<{a: entry, b: entry, index: number, position: string}>}
 */
export function minimalPairs(bank, a, b, { position = null } = {}) {
  const A = normalizeTarget(a);
  const B = normalizeTarget(b);
  if (!A || !B || A === B || A.length !== 1 || B.length !== 1) return [];
  const byWord = new Map(bank.map((e) => [wordOf(e), e]));
  const out = [];
  const seen = new Set();
  for (const [w, e] of byWord) {
    for (let i = 0; i < w.length; i++) {
      if (w[i] !== A) continue;
      const other = w.slice(0, i) + B + w.slice(i + 1);
      const o = byWord.get(other);
      if (!o) continue;
      const pos = i === 0 ? 'initial' : i === w.length - 1 ? 'final' : 'medial';
      if (position && pos !== position) continue;
      const key = `${w}|${other}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: e, b: o, index: i, position: pos });
    }
  }
  return out.sort((x, y) => wordOf(x.a).length - wordOf(y.a).length || wordOf(x.a).localeCompare(wordOf(y.a), 'tr'));
}

// ---------------------------------------------------------------------------
// İkili ifadeler
// ---------------------------------------------------------------------------
/**
 * Hedef sesi taşıyan sözcüklerden iki sözcüklü öbekler.
 * mode: 'adj-noun' (sıfat + ad), 'noun-verb' (ad + eylem), 'repeat' (yineleme: "top top"), 'any' (iki ad)
 * both: iki sözcükte de hedef ses bulunsun
 */
export function twoWordPhrases(bank, { target = '', position = null, mode = 'adj-noun', both = false, count = 12, seed = 1 } = {}) {
  const rand = rng(seed);
  const has = (e) => {
    if (!target) return true;
    const p = positionsOf(wordOf(e), target);
    return position ? !!p[position] : p.count > 0;
  };
  const nouns = bank.filter((e) => e.pos === 'noun' || (!e.pos && e.category !== 'eylem' && e.category !== 'nitelik'));
  const adjs = bank.filter((e) => e.pos === 'adj');
  const verbs = bank.filter((e) => e.pos === 'verb');
  const out = [];
  const seen = new Set();
  const push = (x, y, text) => {
    if (seen.has(text) || out.length >= count) return;
    seen.add(text);
    out.push({ first: x, second: y, text });
  };
  const pick = (first, second, fmt) => {
    const F = shuffle(first, rand);
    const S = shuffle(second, rand);
    const fHit = F.filter(has);
    const sHit = S.filter(has);
    // Önce iki sözcüğü de hedefli olanlar, sonra en az biri hedefli
    for (let i = 0; i < Math.max(fHit.length, sHit.length) && out.length < count; i++) {
      const x = fHit[i % Math.max(1, fHit.length)];
      const y = sHit[i % Math.max(1, sHit.length)];
      if (x && y && wordOf(x) !== wordOf(y)) push(x, y, fmt(x, y));
    }
    if (both) return;
    for (let i = 0; i < 200 && out.length < count; i++) {
      const x = i % 2 ? fHit[i % Math.max(1, fHit.length)] : F[i % Math.max(1, F.length)];
      const y = i % 2 ? S[i % Math.max(1, S.length)] : sHit[i % Math.max(1, sHit.length)];
      if (x && y && wordOf(x) !== wordOf(y) && (has(x) || has(y))) push(x, y, fmt(x, y));
    }
  };
  if (mode === 'repeat') {
    for (const e of shuffle(bank.filter(has), rand)) push(e, e, `${wordOf(e)} ${wordOf(e)}`);
  } else if (mode === 'noun-verb') {
    pick(nouns, verbs, (x, y) => `${wordOf(x)} ${wordOf(y)}`);
  } else if (mode === 'any') {
    pick(nouns, nouns, (x, y) => `${wordOf(x)} ${wordOf(y)}`);
  } else {
    pick(adjs, nouns, (x, y) => `${wordOf(x)} ${wordOf(y)}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sözcük avı
// ---------------------------------------------------------------------------
const DIRS = { easy: [[0, 1], [1, 0]], medium: [[0, 1], [1, 0], [1, 1]], hard: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0]] };

/**
 * @returns {{size, grid: string[][], placements: Array<{word, row, col, dr, dc}>, skipped: string[]}}
 */
export function wordSearch(words, { size = null, level = 'easy', seed = 1 } = {}) {
  const rand = rng(seed);
  const list = [...new Set(words.map(wordOf).map((w) => upper(trLower(w).replace(/[^a-zçğıöşüâîû]/g, ''))).filter((w) => w.length >= 2))]
    .sort((a, b) => b.length - a.length);
  const longest = list.length ? list[0].length : 4;
  const n = Math.max(size || 0, longest, Math.min(16, Math.ceil(Math.sqrt(list.join('').length * 1.8)) + 1), 6);
  const grid = Array.from({ length: n }, () => new Array(n).fill(''));
  const dirs = DIRS[level] || DIRS.easy;
  const placements = [];
  const skipped = [];
  for (const w of list) {
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const [dr, dc] = dirs[Math.floor(rand() * dirs.length)];
      const r0 = Math.floor(rand() * n);
      const c0 = Math.floor(rand() * n);
      const r1 = r0 + dr * (w.length - 1);
      const c1 = c0 + dc * (w.length - 1);
      if (r1 < 0 || r1 >= n || c1 < 0 || c1 >= n) continue;
      let ok = true;
      for (let i = 0; i < w.length; i++) {
        const ch = grid[r0 + dr * i][c0 + dc * i];
        if (ch && ch !== w[i]) { ok = false; break; }
      }
      if (!ok) continue;
      for (let i = 0; i < w.length; i++) grid[r0 + dr * i][c0 + dc * i] = w[i];
      placements.push({ word: w, row: r0, col: c0, dr, dc });
      placed = true;
    }
    if (!placed) skipped.push(w);
  }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!grid[r][c]) grid[r][c] = ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return { size: n, grid, placements, skipped };
}

// ---------------------------------------------------------------------------
// Karışık harfler
// ---------------------------------------------------------------------------
export function scramble(words, { seed = 1 } = {}) {
  const rand = rng(seed);
  return words.map(wordOf).map((w) => {
    const letters = [...upper(w)];
    let mixed = letters;
    for (let i = 0; i < 12; i++) {
      mixed = shuffle(letters, rand);
      if (mixed.join('') !== letters.join('') || letters.length < 2 || new Set(letters).size === 1) break;
    }
    return { word: w, scrambled: mixed.join(' ') };
  });
}

// ---------------------------------------------------------------------------
// Çengel bulmaca
// ---------------------------------------------------------------------------
/**
 * Sözcükleri ortak harflerinden kesiştirerek yerleştirir (açgözlü).
 * @returns {{rows, cols, cells: Map-like dizi [{r,c,ch,num?}], entries: [{num, word, row, col, dir}], skipped}}
 */
export function crossword(words, { seed = 1, max = 10 } = {}) {
  const rand = rng(seed);
  const list = shuffle([...new Set(words.map(wordOf).map((w) => upper(trLower(w).replace(/[^a-zçğıöşüâîû]/g, ''))).filter((w) => w.length >= 2))], rand)
    .sort((a, b) => b.length - a.length).slice(0, max);
  const grid = new Map(); // "r,c" → harf
  const placed = [];
  const key = (r, c) => `${r},${c}`;
  const canPlace = (w, r, c, dir) => {
    let cross = 0;
    for (let i = 0; i < w.length; i++) {
      const rr = dir === 'across' ? r : r + i;
      const cc = dir === 'across' ? c + i : c;
      const cur = grid.get(key(rr, cc));
      if (cur) { if (cur !== w[i]) return -1; cross++; continue; }
      // Yan komşular boş olmalı (yan yana bitişik sözcük oluşmasın)
      const n1 = dir === 'across' ? key(rr - 1, cc) : key(rr, cc - 1);
      const n2 = dir === 'across' ? key(rr + 1, cc) : key(rr, cc + 1);
      if (grid.has(n1) || grid.has(n2)) return -1;
    }
    const before = dir === 'across' ? key(r, c - 1) : key(r - 1, c);
    const after = dir === 'across' ? key(r, c + w.length) : key(r + w.length, c);
    if (grid.has(before) || grid.has(after)) return -1;
    return cross;
  };
  const put = (w, r, c, dir) => {
    for (let i = 0; i < w.length; i++) grid.set(dir === 'across' ? key(r, c + i) : key(r + i, c), w[i]);
    placed.push({ word: w, row: r, col: c, dir });
  };
  const skipped = [];
  for (const w of list) {
    if (!placed.length) { put(w, 0, 0, 'across'); continue; }
    let best = null;
    for (const p of placed) {
      for (let i = 0; i < p.word.length; i++) {
        for (let j = 0; j < w.length; j++) {
          if (p.word[i] !== w[j]) continue;
          const dir = p.dir === 'across' ? 'down' : 'across';
          const r = p.dir === 'across' ? p.row - j : p.row + i;
          const c = p.dir === 'across' ? p.col + i : p.col - j;
          const cross = canPlace(w, r, c, dir);
          if (cross >= 1 && (!best || cross > best.cross)) best = { r, c, dir, cross };
        }
      }
    }
    if (best) put(w, best.r, best.c, best.dir);
    else skipped.push(w);
  }
  const rs = [...grid.keys()].map((k) => Number(k.split(',')[0]));
  const cs = [...grid.keys()].map((k) => Number(k.split(',')[1]));
  const r0 = Math.min(...rs);
  const c0 = Math.min(...cs);
  const entries = placed.map((p) => ({ ...p, row: p.row - r0, col: p.col - c0 }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  let num = 0;
  const numAt = new Map();
  for (const e of entries) {
    const k = key(e.row, e.col);
    if (!numAt.has(k)) numAt.set(k, ++num);
    e.num = numAt.get(k);
  }
  const cells = [...grid.entries()].map(([k, ch]) => {
    const [r, c] = k.split(',').map(Number);
    return { r: r - r0, c: c - c0, ch, num: numAt.get(key(r - r0, c - c0)) || null };
  });
  return { rows: Math.max(...rs) - r0 + 1, cols: Math.max(...cs) - c0 + 1, cells, entries, skipped };
}

// ---------------------------------------------------------------------------
// Labirent (harf yolu)
// ---------------------------------------------------------------------------
/**
 * Sözcüğün harfleri ızgarada bitişik (yatay/dikey) bir yol oluşturur; diğer hücreler rastgele harftir.
 * @returns {{size, grid: string[][], path: Array<[r,c]>}}
 */
export function letterMaze(word, { size = null, seed = 1 } = {}) {
  const rand = rng(seed);
  const w = [...upper(trLower(wordOf(word)).replace(/[^a-zçğıöşüâîû]/g, ''))];
  const n = Math.max(size || 0, Math.ceil(Math.sqrt(w.length * 2.2)) + 1, 4);
  for (let attempt = 0; attempt < 200; attempt++) {
    const path = [[Math.floor(rand() * n), Math.floor(rand() * n)]];
    const used = new Set([path[0].join(',')]);
    while (path.length < w.length) {
      const [r, c] = path[path.length - 1];
      const opts = shuffle([[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]], rand)
        .filter(([a, b]) => a >= 0 && a < n && b >= 0 && b < n && !used.has(`${a},${b}`));
      if (!opts.length) break;
      path.push(opts[0]);
      used.add(opts[0].join(','));
    }
    if (path.length < w.length) continue;
    const grid = Array.from({ length: n }, () => new Array(n).fill(''));
    path.forEach(([r, c], i) => { grid[r][c] = w[i]; });
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!grid[r][c]) grid[r][c] = ALPHABET[Math.floor(rand() * ALPHABET.length)];
    return { size: n, grid, path };
  }
  return { size: n, grid: [], path: [] };
}

// ---------------------------------------------------------------------------
// Cümle tamamlama
// ---------------------------------------------------------------------------
export const STEM_TOPICS = [
  { id: 'hayvan', label: 'Hayvanlar' }, { id: 'okul', label: 'Okul' }, { id: 'aile', label: 'Aile' }, { id: 'doga', label: 'Doğa' },
  { id: 'duygu', label: 'Duygular' }, { id: 'yemek', label: 'Yemek' }, { id: 'oyun', label: 'Oyun' }, { id: 'hayal', label: 'Hayal gücü' },
];
export const STEM_TENSES = [
  { id: 'present', label: 'Şimdiki zaman' }, { id: 'past', label: 'Geçmiş zaman' }, { id: 'future', label: 'Gelecek zaman' }, { id: 'aorist', label: 'Geniş zaman' },
];
const STEMS = {
  hayvan: {
    present: ['Kedi şu anda koltuğun altında…', 'Kuşlar ağacın dalında…', 'Köpeğim beni görünce hemen…', 'Küçük balık akvaryumda…', 'Tavşan havucu görünce…'],
    past: ['Dün hayvanat bahçesinde bir fil…', 'Kedim sabah uyanınca…', 'Geçen hafta bir sincap…', 'Parkta gördüğüm köpek…', 'Çiftlikteki inekler…'],
    future: ['Bir köpeğim olursa ona…', 'Yarın kuşlara…', 'Büyüyünce bir at…', 'Kedim acıkınca…', 'Hayvanat bahçesine gidince ilk önce…'],
    aorist: ['Kediler en çok…', 'Kuşlar sabahları…', 'Ayılar kışın…', 'Balıklar suda…', 'Köpekler sahiplerini görünce…'],
  },
  okul: {
    present: ['Öğretmenim şimdi tahtaya…', 'Arkadaşım sırada…', 'Teneffüste bahçede…', 'Çantamın içinde…', 'Sınıfta herkes…'],
    past: ['Dün okulda en komik şey…', 'Sabah okula giderken…', 'Geçen hafta resim dersinde…', 'Teneffüste arkadaşımla…', 'Öğretmenim bana…'],
    future: ['Yarın okulda…', 'Tatil başlayınca…', 'Bu yıl sonunda…', 'Büyüyünce okulda…', 'Okul gezisinde…'],
    aorist: ['Okulda en sevdiğim ders…', 'Her sabah okula…', 'Teneffüslerde genellikle…', 'Öğretmenimiz her gün…', 'Beslenme saatinde…'],
  },
  aile: {
    present: ['Annem şu anda mutfakta…', 'Kardeşim odasında…', 'Babam balkonda…', 'Dedem bahçede…', 'Evde herkes…'],
    past: ['Dün akşam ailemle…', 'Geçen bayramda ninem…', 'Sabah kahvaltıda babam…', 'Kardeşim küçükken…', 'Tatilde hep birlikte…'],
    future: ['Hafta sonu ailemle…', 'Bayramda dedemlere gidince…', 'Akşam annem gelince…', 'Yazın hep birlikte…', 'Kardeşim büyüyünce…'],
    aorist: ['Annem her sabah…', 'Babam beni görünce…', 'Kardeşimle en çok…', 'Ninem bana hep…', 'Ailemle pazar günleri…'],
  },
  doga: {
    present: ['Dışarıda şimdi…', 'Gökyüzünde bulutlar…', 'Rüzgar yaprakları…', 'Bahçedeki çiçekler…', 'Deniz bugün…'],
    past: ['Dün yağmur yağınca…', 'Geçen kış kar…', 'Ormanda yürürken…', 'Sabah güneş…', 'Deniz kenarında…'],
    future: ['Yarın hava güzel olursa…', 'Kar yağınca…', 'İlkbahar gelince…', 'Yazın denize gidince…', 'Yağmur durunca…'],
    aorist: ['Sonbaharda yapraklar…', 'Kışın hava…', 'Güneş her sabah…', 'Yağmurdan sonra gökyüzünde…', 'Geceleri gökyüzünde…'],
  },
  duygu: {
    present: ['Şu anda kendimi…', 'Beni en çok mutlu eden şey şu an…', 'Bugün biraz…', 'Arkadaşım üzgün çünkü…', 'İçimden şimdi…'],
    past: ['En çok sevindiğim gün…', 'Bir keresinde çok korktum çünkü…', 'Dün üzüldüm çünkü…', 'Çok güldüğüm bir an…', 'Şaşırdığım bir şey…'],
    future: ['Yarın mutlu olmak için…', 'Üzülünce kendime…', 'Bir arkadaşım ağlarsa…', 'Heyecanlanınca…', 'Kızdığımda bundan sonra…'],
    aorist: ['Mutlu olunca…', 'Korktuğumda…', 'Sinirlendiğimde beni sakinleştiren şey…', 'Üzgün olduğumda…', 'En çok güldüğüm şey…'],
  },
  yemek: {
    present: ['Mutfaktan şimdi çok güzel…', 'Tabağımda…', 'Annem tencerede…', 'Şu an canım…', 'Sofrada herkes…'],
    past: ['Dün akşam yemekte…', 'Sabah kahvaltıda…', 'Geçen gün ilk kez…', 'Doğum günümde pasta…', 'Piknikte…'],
    future: ['Akşam yemeğinde…', 'Büyüyünce kendi başıma…', 'Yarın kahvaltıda…', 'Misafir gelince…', 'Acıkınca ilk iş…'],
    aorist: ['En sevdiğim yemek…', 'Kahvaltıda genellikle…', 'Hiç sevmediğim yiyecek…', 'Dondurmayı en çok…', 'Çorbayı içerken…'],
  },
  oyun: {
    present: ['Şimdi arkadaşlarımla…', 'Parkta çocuklar…', 'Topum şu anda…', 'Oyuncaklarım odamda…', 'Bahçede saklambaç…'],
    past: ['Dün parkta…', 'Geçen hafta arkadaşımla…', 'En son oynadığım oyun…', 'Küçükken en sevdiğim oyuncak…', 'Topu atınca…'],
    future: ['Okuldan sonra…', 'Hafta sonu parkta…', 'Yeni bir oyun icat etsem…', 'Arkadaşım gelince…', 'Yazın bahçede…'],
    aorist: ['En sevdiğim oyun…', 'Arkadaşlarımla genellikle…', 'Yağmurlu günlerde evde…', 'Oyun oynarken en çok…', 'Parkta ilk önce…'],
  },
  hayal: {
    present: ['Şu anda bir uzay gemisinde olsam…', 'Görünmez olsam şimdi…', 'Kanatlarım olsa şu an…', 'Bir dev olsam…', 'Sihirli bir değneğim olsa…'],
    past: ['Rüyamda bir ejderha…', 'Bir gün sabah uyandım ve…', 'Eski zamanlarda bir kral…', 'Dün gece odamda bir robot…', 'Bir varmış bir yokmuş…'],
    future: ['Büyüyünce…', 'Bir gün aya gidersem…', 'Üç dileğim olsa…', 'Bir süper kahraman olursam…', 'Yüz yıl sonra insanlar…'],
    aorist: ['Hayvanlar konuşabilse…', 'Bulutlar pamuk şeker olsa…', 'Uçabilsem her gün…', 'Dünyanın en komik şeyi…', 'Bir robotum olsa bana…'],
  },
};

/** Konu ve zamana göre yarım cümle başlangıçları. maxWords: kekemelik çalışması için kısa tutma sınırı. */
export function sentenceStems({ topics = [], tense = 'mixed', count = 10, maxWords = null, seed = 1 } = {}) {
  const rand = rng(seed);
  const ts = topics.length ? topics : Object.keys(STEMS);
  const tenses = tense === 'mixed' ? Object.keys(STEMS.hayvan) : [tense];
  let pool = [];
  for (const t of ts) for (const z of tenses) for (const s of STEMS[t]?.[z] || []) pool.push({ text: s, topic: t, tense: z });
  if (maxWords) pool = pool.filter((s) => s.text.replace('…', '').trim().split(/\s+/).length <= maxWords);
  return shuffle(pool, rand).slice(0, count);
}

// ---------------------------------------------------------------------------
// 5N1K
// ---------------------------------------------------------------------------
export const WH_TYPES = [
  { id: 'kim', label: 'Kim?' }, { id: 'ne', label: 'Ne?' }, { id: 'nerede', label: 'Nerede?' },
  { id: 'nezaman', label: 'Ne zaman?' }, { id: 'neden', label: 'Neden?' }, { id: 'nasil', label: 'Nasıl?' },
];
const WH_TEMPLATES = {
  kim: ['Resimde kim var?', 'Bunu kim kullanır?', 'Bunu kim yapıyor?'],
  ne: ['Bu ne?', 'Resimde ne görüyorsun?', 'Bununla ne yapılır?'],
  nerede: ['Bu nerede bulunur?', 'Bunu nerede görürsün?', 'Resimdeki olay nerede geçiyor?'],
  nezaman: ['Bunu ne zaman kullanırız?', 'Bu ne zaman olur?', 'Bunu en son ne zaman gördün?'],
  neden: ['Buna neden ihtiyaç duyarız?', 'Sence bu neden böyle?', 'Bunu neden kullanırız?'],
  nasil: ['Bu nasıl kullanılır?', 'Bu nasıl görünüyor?', 'Bu nasıl ses çıkarır?'],
};
/** Her öğe (sözcük/görsel) için seçilen soru türlerinden birer soru. */
export function whQuestions(items, { types = ['ne', 'nerede', 'nasil'], seed = 1 } = {}) {
  const rand = rng(seed);
  return items.map((it) => ({
    item: it,
    questions: types.map((t) => ({ type: t, text: WH_TEMPLATES[t][Math.floor(rand() * WH_TEMPLATES[t].length)] })),
  }));
}
