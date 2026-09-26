/**
 * Transkript ayrıştırıcı — klinik transkripsiyon kuralları (CHAT/AphasiaBank alt kümesi)
 * ==================================================================================
 *
 *  Her satır bir sözcedir. Satır içinde ". ? !" ile biten cümleler ayrıca bölünür.
 *
 *  [00:12]           satır başında: sözcenin başlangıç zamanı (dk:sn)
 *  T: / *INV:        terapist (inceleyici) satırı → analize katılmaz, gösterilir
 *  H: / *PAR:        hasta/katılımcı satırı (etiket isteğe bağlı)
 *  ııı  eee  &-ıı    dolgu (MLU'dan çıkarılır, sayılır)
 *  &+ka   ka-        yarım kalmış sözcük / ses parçası (çıkarılır)
 *  &=güler           sözel olmayan olay (yok sayılır)
 *  xxx               anlaşılmayan sözcük (sözce MLU'dan çıkarılır)
 *  kelime [/]        tekrar (önceki sözcük sayılmaz)
 *  kelime [//]       düzeltme/yeniden başlama (önceki sözcük sayılmaz)
 *  <iki kelime> [/]  grup tekrarı
 *  kelime [* s]      anlamsal parafazi   [* p] fonolojik   [* n] neolojizm
 *                    [* m] biçimbirimsel hata   [*] belirtilmemiş hata
 *  kelime [: hedef]  hedef sözcük (parafazide)
 *  (.) (..) (...)    duraksama işareti; (2.5) saniye cinsinden
 *  ...  +...         yarım kalmış sözce (MLU'dan çıkarılır)
 */
import { normKey } from './normalize.js';
import { FILLERS, DISCOURSE_MARKERS } from './pools.js';

export const ERROR_CODES = {
  s: 'anlamsal parafazi',
  p: 'fonolojik parafazi',
  n: 'neolojizm',
  m: 'biçimbirimsel hata',
  f: 'biçimsel (fonolojik) sözcük hatası',
  g: 'dilbilgisi hatası',
  '': 'belirtilmemiş hata',
};

const EXAMINER = /^\s*\*?(INV|EXA|INT|TER|T|K|DKT|TERAPİST|TERAPIST)\s*:\s*/i;
const PARTICIPANT = /^\s*\*?(PAR|PAT|HST|HAS|H|P|D|DANIŞAN|HASTA)\s*:\s*/i;
const TIME_CODE = /^\s*\[(\d{1,2}):(\d{2})(?:[.,](\d))?\]\s*/;

const TOKEN_RE = /(<)|(>)|(\[[^\]]*\])|(\((?:\.{1,3}|\d+(?:[.,]\d+)?)\))|(\+(?:\.\.\.|\/\/?\.|\/\/?\?|"\/\.|,))|(\.\.\.|…)|([.!?]+)|([^\s<>[\]().!?…,;"“”«»]+(?:[.](?=[^\s.!?])[^\s<>[\]().!?…,;"“”«»]+)*)/g;

const ABBR_DOT = new Set(['dr', 'prof', 'doç', 'sn', 'vb', 'vs', 'örn', 'bkz', 'yy', 'no', 'av', 'öğr', 'uzm', 'dkt']);
const SEY_DET = new Set(['bir', 'bi', 'her', 'hiçbir', 'o', 'bu', 'şu', 'ne', 'başka', 'öyle', 'böyle', 'güzel', 'çok', 'bazı', 'hiç']);

/**
 * @param {string} text
 * @param {object} opts { excludeDiscourse=true, autoRepetition=true }
 * @returns {{ utterances: Array }}
 */
export function parseTranscript(text, opts = {}) {
  const { excludeDiscourse = true, autoRepetition = true } = opts;
  const utterances = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((rawLine, lineNo) => {
    let line = rawLine;
    if (!line.trim() || /^\s*[@%]/.test(line)) return;
    let start = null;
    const tm = line.match(TIME_CODE);
    if (tm) {
      start = Number(tm[1]) * 60 + Number(tm[2]) + (tm[3] ? Number(tm[3]) / 10 : 0);
      line = line.slice(tm[0].length);
    }
    let speaker = 'participant';
    if (EXAMINER.test(line)) { speaker = 'examiner'; line = line.replace(EXAMINER, ''); }
    else if (PARTICIPANT.test(line)) line = line.replace(PARTICIPANT, '');
    // ikinci zaman kodu etiketten sonra gelebilir
    const tm2 = line.match(TIME_CODE);
    if (tm2 && start == null) {
      start = Number(tm2[1]) * 60 + Number(tm2[2]) + (tm2[3] ? Number(tm2[3]) / 10 : 0);
      line = line.slice(tm2[0].length);
    }
    splitUtterances(line).forEach((u, k) => {
      const utt = buildUtterance(u, { excludeDiscourse, autoRepetition });
      if (!utt.tokens.length && !utt.raw.trim()) return;
      utt.lineNo = lineNo;
      utt.speaker = speaker;
      utt.start = k === 0 ? start : null;
      utterances.push(utt);
    });
  });
  utterances.forEach((u, i) => { u.index = i; });
  return { utterances };
}

/** Satırı sözcelere böler; her parça {text, terminator} */
function splitUtterances(line) {
  const parts = [];
  let buf = '';
  let depth = 0;
  const flush = (term) => {
    if (buf.trim() || term) parts.push({ text: buf.trim(), terminator: term || null });
    buf = '';
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '[' || ch === '<') depth++;
    if (ch === ']' || ch === '>') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === '.' || ch === '!' || ch === '?' || ch === '…')) {
      let j = i;
      while (j + 1 < line.length && '.!?…'.includes(line[j + 1])) j++;
      let term = line.slice(i, j + 1);
      const nextCh = line[j + 1];
      const before = buf.match(/([^\s<>[\]]+)$/);
      const beforeWord = before ? before[1] : '';
      // CHAT sonlandırıcıları: "+..." "+/." "+//."
      const plus = buf.match(/\+\/*$/);
      if (plus) {
        term = plus[0] + term;
        buf = buf.slice(0, buf.length - plus[0].length);
        flush(term);
        i = j;
        continue;
      }
      // Kısaltma noktası (Dr.) veya ondalık sayı (3.5) sözce sonu değildir
      if (term === '.' && ABBR_DOT.has(normKey(beforeWord))) { buf += ch; continue; }
      if (term === '.' && /\d$/.test(beforeWord) && /\d/.test(nextCh || '')) { buf += ch; continue; }
      if (nextCh && !/\s/.test(nextCh) && term.length === 1 && !'"”»)\''.includes(nextCh)) { buf += ch; continue; }
      const isEllipsis = /^(\.\.\.|…)/.test(term);
      if (isEllipsis && line.slice(j + 1).trim()) buf += ' (...) ';   // cümle içi üç nokta: duraksama
      else flush(term);
      i = j;
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) flush(null);
  return parts;
}

function buildUtterance(part, opts) {
  const tokens = [];
  let group = null;          // <...> grubu içindeki token indeksleri
  let lastGroup = null;
  const text = part.text;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    const [raw] = m;
    if (m[1]) { group = []; continue; }
    if (m[2]) { lastGroup = group; group = null; continue; }
    if (m[3]) { applyCode(raw, tokens, lastGroup); lastGroup = null; continue; }
    if (m[4]) { tokens.push(mk(raw, 'pause', { pause: raw })); continue; }
    if (m[5] || m[6] || m[7]) continue;       // satır içi sonlandırıcılar
    const tok = classifyWord(raw, tokens, opts);
    if (!tok) continue;
    if (group) group.push(tokens.length);
    tokens.push(tok);
    lastGroup = null;
  }

  // "şey": belirleyiciden sonra ad ("bir şey"), yalnız başına dolgu
  tokens.forEach((t, i) => {
    if (t.kind !== 'word' || t.norm !== 'şey') return;
    const prev = prevWord(tokens, i);
    if (!prev || !SEY_DET.has(prev.norm)) {
      t.kind = 'filler';
      t.excluded = true;
      t.reason = 'filler';
      t.emptyFiller = true;
    }
  });

  // Otomatik ardışık tekrar: "araba araba", "ben gittim ben gittim"
  if (opts.autoRepetition) markAutoRepetitions(tokens);

  const words = tokens.filter((t) => t.kind === 'word');
  const terminator = part.terminator;
  const incomplete = !!terminator && /^(\.\.\.|…|\+\.\.\.|\+\/+[.?]|\+"\/\.)/.test(terminator)
    || /-$/.test(text.trim());
  return {
    raw: text + (terminator && !/^\+/.test(terminator) ? terminator : terminator ? ' ' + terminator : ''),
    text,
    terminator,
    question: terminator === '?',
    incomplete,
    tokens,
    hasUnintelligible: tokens.some((t) => t.kind === 'unintelligible'),
    wordCount: words.length,
  };
}

function mk(raw, kind, extra = {}) {
  return { raw, text: raw, norm: '', kind, excluded: kind !== 'word', reason: kind === 'word' ? null : kind, error: null, target: null, ...extra };
}

function classifyWord(raw, tokens, opts) {
  let t = raw.replace(/^[‘'"“«(]+|[’'"”»),;:]+$/g, '');
  if (!t) return null;
  if (/^&-/.test(t)) return mk(raw, 'filler', { text: t.slice(2), norm: normKey(t.slice(2)) });
  if (/^&\+/.test(t)) return mk(raw, 'fragment', { text: t.slice(2), norm: normKey(t.slice(2)), reason: 'fragment' });
  if (/^&=/.test(t)) return mk(raw, 'event', { text: t.slice(2) });
  if (/^&/.test(t)) return mk(raw, 'fragment', { text: t.slice(1), norm: normKey(t.slice(1)), reason: 'fragment' });
  if (/^0\S/.test(t)) return null;                                   // CHAT: atlanmış sözcük
  if (/^(xxx|yyy)$/i.test(t)) return mk(raw, 'unintelligible', { reason: 'unintelligible' });
  if (/^www$/i.test(t)) return mk(raw, 'untranscribed', { reason: 'untranscribed' });
  if (/^[^\wçğıöşüÇĞİÖŞÜâîû]+$/.test(t)) return null;
  if (/[-‐]$/.test(t) && t.length > 1) {
    const s = t.replace(/[-‐]+$/, '');
    return mk(raw, 'fragment', { text: s, norm: normKey(s), reason: 'fragment' });
  }
  let norm = normKey(t);
  if (FILLERS.has(norm) || /^(ı{2,}|e{3,}|m{2,}|h?m{2,}|ö{2,})$/.test(norm)) {
    return mk(raw, 'filler', { text: t, norm, reason: 'filler' });
  }
  // Kekemelik: parça sözcük tekrarı "b-b-bebek", "ba-ba-bebek"
  let stutter = null;
  let alts = null;
  const pwr = t.match(/^((?:[^\s-]{1,4}-)+)([^\s-]{2,})$/);
  if (pwr) {
    const parts = pwr[1].split('-').filter(Boolean);
    const final = pwr[2];
    const fn = normKey(final);
    if (parts.every((p) => fn.startsWith(normKey(p)))) {
      stutter = { type: 'PWR', units: parts.length, raw: t };
      t = final;
      norm = fn;
    }
  }
  // Uzatma: "s:u", "a:nne" (CHAT) ya da 3+ aynı harf "sssu"
  if (!stutter && /\p{L}:\p{L}|\p{L}:$/u.test(t)) {
    stutter = { type: 'PRO', raw: t };
    t = t.replace(/:/g, '');
    norm = normKey(t);
  } else if (!stutter && /(\p{L})\1\1/u.test(norm)) {
    stutter = { type: 'PRO', raw: t };
    const one = t.replace(/(\p{L})\1{2,}/gu, '$1');
    const two = t.replace(/(\p{L})\1{2,}/gu, '$1$1');
    alts = [one, two];
    t = one;
    norm = normKey(one);
  }
  if (DISCOURSE_MARKERS.has(norm)) {
    return { raw, text: t, norm, kind: opts.excludeDiscourse ? 'filler' : 'word', discourse: true,
      excluded: !!opts.excludeDiscourse, reason: opts.excludeDiscourse ? 'discourse' : null, error: null, target: null };
  }
  const isFirstWord = !tokens.some((x) => x.kind === 'word');
  return {
    raw, text: t, norm, kind: 'word', excluded: false, reason: null, error: null, target: null,
    capitalized: /^[A-ZÇĞİÖŞÜ]/.test(t), initial: isFirstWord, stutter, alts,
  };
}

function applyCode(code, tokens, lastGroup) {
  const inner = code.slice(1, -1).trim();
  if (TIME_CODE.test(code)) return;
  const targets = lastGroup && lastGroup.length ? lastGroup.map((i) => tokens[i])
    : [lastWordToken(tokens)].filter(Boolean);
  if (!targets.length) return;
  if (/^\/{1,3}$/.test(inner)) {
    const reason = inner === '/' ? 'repetition' : 'retrace';
    for (const t of targets) { t.excluded = true; t.reason = reason; t.repN = targets.length; }
    return;
  }
  // Kekemelik kodları: [blk] blok, [pro] uzatma, [pwr] parça tekrarı, [wwr] sözcük tekrarı
  const st = inner.toLowerCase().match(/^(blk|pro|pwr|wwr)(?:\s*x?\s*(\d+))?$/);
  if (st) {
    const t = targets[targets.length - 1];
    t.stutter = { type: st[1].toUpperCase(), units: st[2] ? Number(st[2]) : (st[1] === 'pwr' ? 1 : undefined), coded: true };
    return;
  }
  const rep = inner.match(/^x\s*(\d+)$/i);
  if (rep) { targets[targets.length - 1].repeatCount = Number(rep[1]); return; }
  const err = inner.match(/^\*\s*([a-zğüşıöç]*)/i);
  if (err) {
    const c = (err[1] || '').toLowerCase()[0] || '';
    const key = ERROR_CODES[c] !== undefined ? c : '';
    const t = targets[targets.length - 1];
    t.error = { code: key || '*', label: ERROR_CODES[key] || ERROR_CODES[''], raw: inner };
    return;
  }
  const tg = inner.match(/^:\s*(.+)$/);
  if (tg) { targets[targets.length - 1].target = tg[1].trim(); return; }
  // Diğer kodlar ([+ gram], [=! güler]) yok sayılır
}

function lastWordToken(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].kind === 'word' || tokens[i].kind === 'fragment' || tokens[i].kind === 'filler') return tokens[i];
  }
  return null;
}

function prevWord(tokens, i) {
  for (let j = i - 1; j >= 0; j--) if (tokens[j].kind === 'word') return tokens[j];
  return null;
}

function markAutoRepetitions(tokens) {
  const idx = tokens.map((t, i) => (t.kind === 'word' && !t.excluded ? i : -1)).filter((i) => i >= 0);
  for (let n = 3; n >= 1; n--) {
    for (let k = 0; k + 2 * n <= idx.length; k++) {
      const a = idx.slice(k, k + n).map((i) => tokens[i]);
      const b = idx.slice(k + n, k + 2 * n).map((i) => tokens[i]);
      if (a.some((t) => t.excluded) || b.some((t) => t.excluded)) continue;
      if (a.every((t, j) => t.norm === b[j].norm)) {
        // İlk geçiş tekrar sayılır, son söylenen korunur (CHAT/SALT uygulaması)
        a.forEach((t) => { t.excluded = true; t.reason = 'auto-repetition'; t.repN = n; });
      }
    }
  }
}

/** Sözceyi (dışlanan öğeler işaretli) düz metin olarak üretir. */
export function utteranceText(u) {
  return u.tokens.filter((t) => t.kind === 'word').map((t) => t.text).join(' ');
}
