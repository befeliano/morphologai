/**
 * MorphologAI — Türkçe biçimbirim çözümleyici (kural tabanlı, tarayıcı içi)
 * ========================================================================
 *
 * Yöntem: "üreterek çözümleme" (analysis by synthesis).
 *   1. Kelimenin başındaki her olası kök gövdesi sözlükte aranır
 *      (ses olaylarına uğramış gövdeler dahil: kitab-, ağz-, gid-, başl-).
 *   2. Her gövdeden başlayarak Türkçe'nin ek dizilim kurallarına (morfotaktik)
 *      uygun ek dizileri, ünlü uyumu / ünsüz benzeşmesi / kaynaştırma kuralları
 *      uygulanarak ÜRETİLİR ve kelimenin kalanıyla karşılaştırılır.
 *   3. Kelimeyi tam olarak üreten tüm çözümlemeler puanlanır: bilinen kök,
 *      kökün sıklığı ve eklerin olasılığı dikkate alınır.
 *   4. Hiçbir bilinen kökle çözülemeyen kelimeler (neolojizm, özel ad, yazım
 *      hatası) için bilinmeyen kök + güçlü ek kanıtı aranır; kanıt zayıfsa
 *      kelime bölünmeden bırakılır (aşırı bölmeyi önler).
 *
 * MLU-m sayımı: kök = 1, her çekim eki = +1, yapım ekleri ayrıca sayılmaz.
 */
import { SUFFIXES, TRANSITIONS, NON_FINAL, FINITE_TAM, NONFINITE } from './suffixes.js';
import { isVowel, isVoiceless, lastVowel, harmA, harmI, trLower, normKey, vowelCount } from './normalize.js';
import { getLexicon, POS_LABEL, POS_CSS, spokenAbbr } from './lexicon.js';

export const ENGINE_VERSION = '5.1.0';
export const ENGINE_ID = `morphologai-morph@${ENGINE_VERSION}`;

// ---------------------------------------------------------------------------
// Şablon gerçekleştirme (alomorf üretimi)
// ---------------------------------------------------------------------------
const tplCache = new Map();

function tplTokens(tpl) {
  let t = tplCache.get(tpl);
  if (t) return t;
  t = [];
  for (let i = 0; i < tpl.length; i++) {
    const c = tpl[i];
    if (c === '(') {
      const inner = tpl[i + 1];
      i += 2;
      t.push(inner === 'I' ? { k: 'optI' } : { k: 'buf', c: inner });
    } else if (c === 'A' || c === 'I' || c === 'D' || c === 'C') {
      t.push({ k: c });
    } else {
      t.push({ k: 'lit', c });
    }
  }
  tplCache.set(tpl, t);
  return t;
}

function realizeTpl(tpl, last, lv) {
  let out = '';
  for (const t of tplTokens(tpl)) {
    let ch = '';
    switch (t.k) {
      case 'buf': if (isVowel(last)) ch = t.c; break;
      case 'optI': if (!isVowel(last)) ch = harmI(lv); break;
      case 'A': ch = harmA(lv); break;
      case 'I': ch = harmI(lv); break;
      case 'D': ch = isVoiceless(last) ? 't' : 'd'; break;
      case 'C': ch = isVoiceless(last) ? 'ç' : 'c'; break;
      default: ch = t.c;
    }
    if (ch) {
      out += ch;
      last = ch;
      if (isVowel(ch)) lv = ch;
    }
  }
  return { surf: out, last, lv };
}

function baseSurfaces(sufId, ctx) {
  const r = (tpl) => realizeTpl(tpl, ctx.last, ctx.lv);
  switch (sufId) {
    case 'AOR': {
      if (isVowel(ctx.last)) return [r('r')];
      const out = [];
      if (ctx.aor !== 'I') out.push(r('Ar'));
      if (ctx.aor !== 'A') out.push(r('Ir'));
      return out;
    }
    case 'PASS':
      if (isVowel(ctx.last)) return [r('n')];
      return [r(ctx.last === 'l' ? 'In' : 'Il')];
    case 'CAUS': {
      const out = [r('DIr')];
      if (isVowel(ctx.last) || ((ctx.last === 'r' || ctx.last === 'l') && ctx.syl > 1)) out.push(r('t'));
      return out;
    }
    default:
      return SUFFIXES[sufId].tpl.map(r);
  }
}

/** Bir ekin bu bağlamdaki tüm yüzey biçimleri ve sonraki eke getirdiği koşullar. */
function realizations(sufId, ctx) {
  const suf = SUFFIXES[sufId];
  const out = [];
  for (const r of baseSurfaces(sufId, ctx)) {
    if (!r.surf) continue;
    const startsV = isVowel(r.surf[0]);
    if (suf.voicesFinal && r.surf.endsWith('k')) {
      out.push({ ...r, startsV, needs: 'notVowel' });
      out.push({ surf: r.surf.slice(0, -1) + 'ğ', last: 'ğ', lv: r.lv, startsV, needs: 'vowel', voiced: true });
    } else {
      out.push({ ...r, startsV, needs: null });
    }
    // gelme + iyor → gelm-iyor ; konuşama + ıyor → konuşam-ıyor
    if (suf.dropsBeforeProg && isVowel(r.last) && r.surf.length > 1) {
      const ds = r.surf.slice(0, -1);
      out.push({ surf: ds, last: ds[ds.length - 1], lv: lastVowel(ds) || ctx.lv, startsV: isVowel(ds[0]), needs: 'prog', dropped: true });
    }
  }
  return out;
}

const COND = {
  afterLocGen: (c) => c.lastCase === 'LOC' || c.lastCase === 'GEN' || c.lastCase === 'LOC_N' || c.lastCase === 'GEN_N',
  pronGen: (c) => c.rootPos === 'pron' && (c.lastCase === 'GEN' || c.lastCase === 'GEN_N'),
  timeNoun: (c) => !!c.entry.sub && c.entry.sub.includes('time'),
  voiceOk: (c) => c.voice < 2,
  isNum: (c) => c.rootPos === 'num',
};

function needsOk(needs, r, sufId) {
  switch (needs) {
    case 'vowel': return r.startsV;
    case 'notVowel': return !r.startsV;
    case 'prog': return !!SUFFIXES[sufId].prog;
    case 'y': return r.surf[0] === 'y';
    default: return true;
  }
}

const MAX_DEPTH = 10;

function search(word, pos, ctx, morphs, out) {
  if (pos === word.length) {
    if (!NON_FINAL.has(ctx.state) && (ctx.needs === null || ctx.needs === 'notVowel')) out.push({ ctx, morphs });
    return;
  }
  if (morphs.length >= MAX_DEPTH) return;
  const trs = TRANSITIONS[ctx.state];
  if (!trs) return;
  for (const [sufId, next, cond] of trs) {
    if (cond && !COND[cond](ctx)) continue;
    if (ctx.needs === 'prog' && !SUFFIXES[sufId].prog) continue;
    for (const r of realizations(sufId, ctx)) {
      if (!needsOk(ctx.needs, r, sufId)) continue;
      if (!word.startsWith(r.surf, pos)) continue;
      const suf = SUFFIXES[sufId];
      const nctx = {
        ...ctx,
        state: next,
        last: r.last,
        lv: r.lv,
        needs: r.needs,
        syl: ctx.syl + vowelCount(r.surf),
        voice: ctx.voice + (suf.voice ? 1 : 0),
        aor: suf.voice || sufId === 'ABIL' ? 'I' : ctx.aor,
        lastCase: suf.cat === 'hâl' ? sufId : ctx.lastCase,
      };
      search(word, pos + r.surf.length, nctx, [...morphs, { id: sufId, surface: r.surf, dropped: !!r.dropped, voiced: !!r.voiced }], out);
    }
  }
}

// ---------------------------------------------------------------------------
// Puanlama
// ---------------------------------------------------------------------------
const SUFFIXED_POS_PRIOR = { pron: 0.5, adv: -2, det: -3, num: -1, conj: -3, postp: -3, interj: -3 };

function scoreParse(p, opts) {
  const e = p.entry;
  let s = 0;
  const sufs = p.suffixes;
  if (e.known) {
    s += 40 + (e.core || 0);
    if (e.src === 'nontdk') s -= 1.5;
    if (e.src === 'person' || e.src === 'place' || e.src === 'proper') {
      s += opts.capitalized ? (opts.initial ? 2 : 16) : -7;
    }
    if (e.special) s += 1;                       // zamir n'si / düzensiz biçim (onu, bana)
    if (!sufs.length) s += 2;                    // sözlükte birebir geçen kelime (adam ≠ ada-m)
    for (const m of sufs) {
      const suf = SUFFIXES[m.id];
      s += suf.prior - (suf.infl ? 2.5 : 6);
      if (suf.colloquial) s -= 1;
    }
    if (sufs.length) s += SUFFIXED_POS_PRIOR[e.pos] || 0;
    if (e.pos === 'adj' && sufs.some((m) => SUFFIXES[m.id].cat === 'iyelik')) s -= 2;
  } else {
    for (const m of sufs) {
      const suf = SUFFIXES[m.id];
      s += suf.infl ? suf.ev - 1.2 : -3;
    }
    if (sufs.length) s -= 0.5;
    if (p.rootSurface.length < 3) s -= 1.5;
    if (!vowelCount(p.rootSurface)) s -= 10;
    if (opts.capitalized && !opts.initial && !sufs.length) s += 1;
  }
  if (p.finite) s += 1;
  return s;
}

// ---------------------------------------------------------------------------
// Çözümleme sonucu
// ---------------------------------------------------------------------------
const DERIV_POS = { DER_LI: 'adj', DER_SIZ: 'adj', DER_LIK: 'noun', DER_CI: 'noun', DER_CIK: 'noun', ORD: 'adj', DIST: 'adj' };
const PERSON_TAGS = new Set(['1SG', '2SG', '1PL', '2PL', '3PL']);
const TENSE_NORMAL = { PROG_COL: 'PROG', FUT_COL: 'FUT', FUT_COLK: 'FUT', AORNEG_1SG: 'AOR_NEG', AORNEG_1PL: 'AOR_NEG' };

function describe(word, original, variant, morphs, opts) {
  const e = variant.entry;
  const rootSurface = variant.rootSurf || word.slice(0, word.length - morphs.reduce((n, m) => n + m.surface.length, 0));
  const all = [...(variant.pre || []), ...morphs];
  const suffixes = all.map((m) => ({ ...m, suf: SUFFIXES[m.id] }));

  let pos = e.pos;
  for (const m of suffixes) if (DERIV_POS[m.id]) pos = DERIV_POS[m.id];
  const ids = suffixes.map((m) => m.id);
  let verb = null;
  if (e.pos === 'verb') {
    const tam = ids.find((id) => FINITE_TAM.has(id)) || null;
    const nonfin = ids.find((id) => NONFINITE.has(id)) || null;
    const negative = ids.some((id) => id === 'NEG' || id === 'IMPOSS' || id === 'AOR_NEG');
    const bareImperative = !tam && !nonfin && ids.every((id) => id === 'NEG' || SUFFIXES[id].voice);
    const finite = !!tam || bareImperative;
    const personM = [...suffixes].reverse().find((m) => PERSON_TAGS.has(m.suf.tag) || /^IMP\./.test(m.suf.tag));
    let person = personM ? personM.suf.tag.replace('IMP.', '') : (finite ? '3SG' : null);
    if (bareImperative) person = '2SG';
    let tense = null;
    if (tam) tense = tam.startsWith('IMP') ? 'IMP' : (TENSE_NORMAL[tam] || tam);
    else if (bareImperative) tense = 'IMP';
    const copula = ids.find((id) => id === 'COP_PAST' || id === 'COP_EVID' || id === 'COP_COND') || null;
    verb = {
      finite,
      form: finite ? 'finite' : nonfin ? (nonfin.startsWith('CONV') || nonfin === 'COP_KEN' ? 'converb'
        : nonfin.startsWith('PART') ? 'participle' : nonfin === 'INF' ? 'infinitive' : 'verbal-noun') : null,
      tense,
      compound: copula,
      negative,
      person,
      ability: ids.includes('ABIL') || ids.includes('IMPOSS'),
      voice: ids.filter((id) => SUFFIXES[id].voice),
      colloquial: ids.some((id) => SUFFIXES[id].colloquial),
    };
  }

  const cases = suffixes.filter((m) => m.suf.cat === 'hâl').map((m) => m.suf.tag);
  const inflCount = suffixes.filter((m) => m.suf.infl).length;

  const morphemes = [];
  const rootNote = variant.note || (rootSurface !== e.root ? 'ses olayı' : null);
  morphemes.push({
    type: 'root',
    surface: rootSurface,
    display: opts.displayRoot || e.display || e.root,
    label: `kök (${(POS_LABEL[e.pos] || 'isim').toLocaleLowerCase('tr-TR')})`,
    tag: 'ROOT',
    note: rootSurface !== e.root && rootNote ? `${rootNote}: ${e.root} → ${rootSurface}-` : null,
  });
  suffixes.forEach((m, i) => {
    let display = m.surface;
    const next = suffixes[i + 1];
    if (m.suf.prog) {
      const prevDropped = i > 0 ? suffixes[i - 1].dropped : variant.dropped;
      if (prevDropped) display = m.surface.slice(1);
    }
    if (m.dropped && next && next.suf.prog) display = m.surface + next.surface[0];
    // Zamir n'si / kaynaştırma kökte kaldıysa ilk eke yaz: o-nu, bu-nlar, su-yu
    if (i === 0 && e.special && !variant.pre && rootSurface.length > e.root.length && rootSurface.startsWith(e.root)) {
      display = rootSurface.slice(e.root.length) + display;
    }
    morphemes.push({
      type: m.suf.infl ? 'infl' : 'deriv',
      id: m.id,
      tag: m.suf.tag,
      cat: m.suf.cat,
      label: m.suf.label,
      surface: m.surface,
      display,
    });
  });
  if (e.special && !variant.pre && morphemes.length > 1 && rootSurface.startsWith(e.root)) {
    morphemes[0].note = null;
  }

  return {
    original,
    norm: word,
    root: e.root,
    lemma: e.lemma || e.root,
    pos,
    posLabel: POS_LABEL[pos] || 'İsim',
    css: POS_CSS[pos] || 'other',
    morphemes,
    morphemeCount: 1 + inflCount,
    derivCount: suffixes.length - inflCount,
    known: !!e.known,
    source: e.known ? (['person', 'place', 'proper'].includes(e.src) ? 'lexicon-name' : 'lexicon') : 'unknown',
    verb,
    cases,
    plural: ids.includes('PL'),
    possessive: suffixes.some((m) => m.suf.cat === 'iyelik'),
    signature: `${e.root}|${pos}|${ids.join('+')}`,
    _entry: e,
  };
}

// ---------------------------------------------------------------------------
// Tek kelime çözümleme
// ---------------------------------------------------------------------------
const NUMBER_WORDS = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS_WORDS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];

/** Rakamla yazılmış sayının okunuşundaki son sözcük (ünlü uyumu için): 30'a → otuz. */
function spokenTail(numStr) {
  const n = parseInt(numStr.replace(/[.,].*$/, ''), 10);
  if (!Number.isFinite(n)) return 'bir';
  if (n === 0) return 'sıfır';
  if (n % 1000000 === 0) return 'milyon';
  if (n % 1000 === 0) return 'bin';
  if (n % 100 === 0) return 'yüz';
  if (n % 10 === 0) return TENS_WORDS[(n % 100) / 10];
  return NUMBER_WORDS[n % 10];
}

function closedAnalysis(original, word, pos, label, extra = {}) {
  return {
    original,
    norm: word,
    root: extra.root || word,
    lemma: extra.root || word,
    pos,
    posLabel: POS_LABEL[pos] || label,
    css: POS_CSS[pos] || 'other',
    morphemes: [{ type: 'root', surface: word, display: extra.display || word, label, tag: 'ROOT' }],
    morphemeCount: 1,
    derivCount: 0,
    known: true,
    source: extra.source || 'rule',
    verb: null,
    cases: [],
    plural: false,
    possessive: false,
    signature: `${word}|${pos}|`,
    alternatives: [],
    ambiguous: false,
    score: 50,
    ...extra,
  };
}

/** Kesme işaretinden sonraki ekleri (Ankara'ya, 3'te, MR'da) çözümler. */
function analyzeAfterApostrophe(original, word, base, rest, capitalized) {
  const lex = getLexicon();
  const isNum = /^\d+([.,]\d+)?$/.test(base);
  const rawBase = original.split(/['’]/)[0];
  const abbr = !isNum && lex.abbr.get(rawBase.toLocaleUpperCase('tr-TR'));
  const isAbbr = !!abbr && /^[A-ZÇĞİÖŞÜ0-9]+$/.test(rawBase);
  const spoken = isNum ? spokenTail(base) : isAbbr ? abbr.spoken : base;
  const pos = isNum ? 'num' : isAbbr ? 'abbr' : 'prop';
  const entry = { root: base, lemma: base, pos, known: true, core: 8, src: isNum ? 'number' : 'proper', attrs: new Set(), sub: [] };
  const tryCtx = (lv, last) => {
    const ctx = { state: 'N', last, lv, needs: null, syl: vowelCount(spoken), voice: 0, aor: null, lastCase: null, rootPos: pos, entry };
    const out = [];
    search(rest, 0, ctx, [], out);
    return out;
  };
  let found = tryCtx(lastVowel(spoken) || 'e', spoken[spoken.length - 1]);
  if (!found.length) found = [...tryCtx('a', 'a'), ...tryCtx('e', 'e'), ...tryCtx('ı', 't'), ...tryCtx('i', 't')];
  const disp = isNum ? base : rawBase;
  let best = null;
  for (const { morphs } of found) {
    const sc = scoreParse({ entry, suffixes: morphs, rootSurface: base, finite: false }, { capitalized });
    if (!best || sc > best.sc) best = { sc, morphs };
  }
  if (best) {
    const a = describe(word, original, { entry, rootSurf: base, surf: base }, best.morphs, { displayRoot: disp });
    a.source = isNum ? 'number' : isAbbr ? 'abbreviation' : 'proper';
    a.alternatives = [];
    a.ambiguous = false;
    a.score = 50;
    return a;
  }
  const a = closedAnalysis(original, word, pos, isNum ? 'sayı' : 'özel isim', { display: disp, root: base, source: isNum ? 'number' : 'proper' });
  a.morphemes.push({ type: 'infl', id: 'UNK', tag: 'SFX', cat: 'bilinmeyen', label: 'çözümlenemeyen ek', surface: rest, display: rest });
  a.morphemeCount = 2;
  a.uncertain = true;
  return a;
}

const cache = new Map();
let overrides = new Map();

/** Ekip sözlüğü düzeltmeleri: normalize kelime → analiz nesnesi. */
export function setOverrides(map) {
  overrides = map instanceof Map ? map : new Map(Object.entries(map || {}));
  cache.clear();
}
export function getOverrides() { return overrides; }
export function clearCache() { cache.clear(); }

/**
 * Bir kelimeyi çözümler.
 * @param {string} token      kelime (noktalama temizlenmiş olmalı)
 * @param {{capitalized?:boolean, initial?:boolean}} opts
 *        initial: sözce başındaki kelime (büyük harf özel ad kanıtı sayılmaz)
 */
export function analyzeWord(token, opts = {}) {
  const original = token;
  const word = normKey(token);
  const capitalized = opts.capitalized ?? /^[A-ZÇĞİÖŞÜ]/.test(token);
  const initial = !!opts.initial;
  const cacheKey = `${token}|${capitalized ? 1 : 0}${initial ? 1 : 0}`;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, original };

  let result;
  const ov = overrides.get(word);
  const lex = getLexicon();
  if (ov) {
    result = { ...ov, original, norm: word, source: 'override', alternatives: [], ambiguous: false };
  } else if (!word) {
    result = closedAnalysis(original, word, 'unknown', 'boş');
  } else if (/^\d+([.,]\d+)?$/.test(word)) {
    result = closedAnalysis(original, word, 'num', 'sayı', { source: 'number' });
  } else if (word.includes("'")) {
    const i = word.indexOf("'");
    const base = word.slice(0, i);
    const rest = word.slice(i + 1).replace(/'/g, '');
    result = rest ? analyzeAfterApostrophe(original, word, base, rest, capitalized)
      : closedAnalysis(original, base, 'prop', 'özel isim', { display: original.replace(/['’]$/, '') });
  } else if (/^[A-ZÇĞİÖŞÜ]{2,6}$/.test(token) && lex.abbr.has(token)) {
    result = closedAnalysis(original, word, 'abbr', 'kısaltma', { display: token, source: 'abbreviation' });
  } else {
    result = analyzeRegular(original, word, capitalized, initial);
  }
  cache.set(cacheKey, result);
  if (cache.size > 30000) cache.clear();
  return { ...result, original };
}

function analyzeRegular(original, word, capitalized, initial) {
  const lex = getLexicon();
  const parses = [];
  const seen = new Set();

  const run = (variant) => {
    const e = variant.entry;
    const pre = variant.pre || [];
    const ctx = {
      state: variant.state,
      last: variant.surf[variant.surf.length - 1],
      lv: variant.lv || lastVowel(variant.surf) || 'e',
      needs: variant.needs,
      syl: vowelCount(variant.surf),
      voice: 0,
      aor: e.attrs && e.attrs.has('Aorist_A') ? 'A' : e.attrs && e.attrs.has('Aorist_I') ? 'I'
        : e.pos === 'verb' ? (vowelCount(e.root) > 1 ? 'I' : 'A') : null,
      lastCase: e.lastCase || (pre.length ? pre[pre.length - 1].id : null),
      rootPos: e.pos,
      entry: e,
    };
    if (ctx.needs === 'any') {
      // En az bir ek almalı (on-u, bun-a)
      ctx.needs = null;
      if (variant.surf.length === word.length) return;
    }
    const found = [];
    search(word, variant.surf.length, ctx, [], found);
    for (const f of found) {
      const a = describe(word, original, variant, f.morphs, {});
      if (seen.has(a.signature)) continue;
      seen.add(a.signature);
      parses.push(a);
    }
  };

  for (const v of lex.prefixStems(word)) run(v);

  // Büyük harfli kelime: geniş özel ad havuzundan kök ara (Mehmet'e değil Mehmete gibi yazımlar dahil)
  if (capitalized) {
    for (const p of lex.properPrefixes(word)) {
      const display = p.display;
      const entry = { root: p.key, lemma: display, display, pos: 'prop', known: true, core: 0, src: 'proper', attrs: new Set(), sub: [p.kind] };
      run({ entry, surf: p.key, lv: lastVowel(p.key), needs: null, state: 'N' });
    }
  }

  // Bilinmeyen kök: yalnızca hiçbir bilinen kökle çözülemediyse
  if (!parses.length) {
    for (let i = Math.min(word.length, 30); i >= 2; i--) {
      const rootSurf = word.slice(0, i);
      if (!vowelCount(rootSurf)) continue;
      for (const pos of ['noun', 'verb']) {
        if (pos === 'verb' && i === word.length) continue;
        const entry = { root: rootSurf, lemma: rootSurf, pos, known: false, src: 'unknown', attrs: new Set(), sub: [] };
        run({ entry, surf: rootSurf, lv: lastVowel(rootSurf), needs: null, state: pos === 'verb' ? 'V' : 'N' });
      }
    }
  }

  if (!parses.length) {
    return closedAnalysis(original, word, 'unknown', 'bilinmeyen', { known: false, source: 'unknown', score: 0 });
  }

  const opts = { capitalized, initial };
  for (const p of parses) {
    const sufs = p.morphemes.slice(1).map((m) => ({ id: m.id }));
    p.score = scoreParse({ entry: p._entry, suffixes: sufs, rootSurface: p.morphemes[0].surface, finite: !!(p.verb && p.verb.finite) }, opts);
  }
  parses.sort((a, b) => b.score - a.score || a.morphemes.length - b.morphemes.length);

  const best = parses[0];
  const second = parses[1];
  best.ambiguous = !!second && best.score - second.score < 2
    && (second.morphemeCount !== best.morphemeCount || second.pos !== best.pos);
  best.alternatives = dedupeAlternatives(best, parses.slice(1, 8)).slice(0, 5);
  if (!best.known) best.unknownRoot = true;
  return finalize(best);
}

function chain(a) {
  return a.morphemes.map((m) => m.display).join('+') + '|' + a.pos;
}

function dedupeAlternatives(best, list) {
  const seen = new Set([chain(best)]);
  const out = [];
  for (const p of list) {
    const c = chain(p);
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(slimAlternative(p));
  }
  return out;
}

function slimAlternative(p) {
  return {
    root: p.root, lemma: p.lemma, pos: p.pos, posLabel: p.posLabel, css: p.css,
    morphemes: p.morphemes, morphemeCount: p.morphemeCount, derivCount: p.derivCount,
    verb: p.verb, cases: p.cases, plural: p.plural, possessive: p.possessive,
    known: p.known, source: p.source, signature: p.signature, score: Number(p.score.toFixed(2)),
  };
}

function finalize(p) {
  const { _entry, ...rest } = p;
  rest.score = Number(p.score.toFixed(2));
  return rest;
}

/** Bir alternatifi (bağlam kuralı ya da kullanıcı seçimi) ana analiz haline getirir. */
export function applyAlternative(analysis, signature, source = 'manual') {
  const alt = (analysis.alternatives || []).find((a) => a.signature === signature);
  if (!alt) return analysis;
  const others = [analysis, ...analysis.alternatives].filter((a) => a.signature !== signature).map((a) => {
    const { alternatives, ambiguous, original, norm, ...slim } = a;
    return slim;
  });
  return { ...analysis, ...alt, alternatives: others, ambiguous: false, source, original: analysis.original, norm: analysis.norm };
}

/**
 * Kullanıcının yazdığı elle bölütlemeyi ("gel-iyor-um" / "kitap+lar+ı") analiz
 * nesnesine çevirir. Ek etiketleri, yüzeyi eşleşen envanter ekinden tahmin edilir.
 */
export function manualAnalysis(original, segmentation, pos = 'noun') {
  const parts = segmentation.split(/[-+\s|]+/).map((p) => trLower(p.trim())).filter(Boolean);
  if (!parts.length) return null;
  const [root, ...sfx] = parts;
  const morphemes = [{ type: 'root', surface: root, display: root, label: `kök (${(POS_LABEL[pos] || '').toLocaleLowerCase('tr-TR')})`, tag: 'ROOT' }];
  for (const s of sfx) {
    const guess = Object.entries(SUFFIXES).find(([, def]) => def.infl && def.tpl && def.tpl.some((t) => t.replace(/[()]/g, '').length === s.length
      && realizeTpl(t, root[root.length - 1] || 'a', lastVowel(root) || 'a').surf === s));
    const def = guess ? guess[1] : null;
    morphemes.push({
      type: 'infl', id: guess ? guess[0] : 'MANUAL', tag: def ? def.tag : 'SFX', cat: def ? def.cat : 'elle',
      label: def ? `${def.label} (elle)` : 'ek (elle girildi)', surface: s, display: s,
    });
  }
  const isVerb = pos === 'verb';
  return {
    original, norm: normKey(original), root, lemma: root, pos, posLabel: POS_LABEL[pos] || 'İsim',
    css: POS_CSS[pos] || 'other', morphemes, morphemeCount: parts.length, derivCount: 0,
    known: true, source: 'manual',
    verb: isVerb ? { finite: true, form: 'finite', tense: null, person: null, negative: false, voice: [] } : null,
    cases: [], plural: false, possessive: false, signature: `${root}|${pos}|manual:${sfx.join('+')}`,
    alternatives: [], ambiguous: false, score: 99,
  };
}

// ---------------------------------------------------------------------------
// Olası hedef kelime (fonolojik parafazi / yazım hatası adayı)
// ---------------------------------------------------------------------------
const ALPHABET = 'abcçdefgğhıijklmnoöprsştuüvyz';
const targetCache = new Map();

/**
 * Bilinmeyen bir kelimeye 1 harf uzaklıktaki (silme, ekleme, değiştirme,
 * yer değiştirme) bilinen kelimeleri bulur. "kalam" → "kalem".
 * @returns {Array<{word, root, pos, morphemeCount}>} en fazla 3 aday
 */
export function suggestTargets(token) {
  const word = normKey(token);
  if (word.length < 3) return [];
  if (targetCache.has(word)) return targetCache.get(word);
  const cands = new Set();
  for (let i = 0; i <= word.length; i++) {
    const a = word.slice(0, i);
    const b = word.slice(i);
    if (b) cands.add(a + b.slice(1));                                   // silme
    if (b.length > 1) cands.add(a + b[1] + b[0] + b.slice(2));          // yer değiştirme
    for (const c of ALPHABET) {
      if (b) cands.add(a + c + b.slice(1));                             // değiştirme
      cands.add(a + c + b);                                             // ekleme
    }
  }
  cands.delete(word);
  const out = [];
  for (const c of cands) {
    if (c.length < 2) continue;
    const r = analyzeWord(c, { capitalized: false });
    if (r.known && r.source === 'lexicon' && r.score >= 45) out.push({ word: c, root: r.root, pos: r.pos, score: r.score, morphemeCount: r.morphemeCount });
  }
  out.sort((x, y) => y.score - x.score);
  const res = out.slice(0, 3);
  targetCache.set(word, res);
  return res;
}
