/**
 * Analiz hattı: transkript (+ isteğe bağlı akustik) → sözce/sözcük çözümlemesi → ölçütler → tarama
 *
 *  1. parseTranscript: sözcelere bölme, kodlar, dolgular, tekrarlar
 *  2. analyzeWord + contextualize: her sözcüğün kök/ek çözümlemesi ve bağlama göre seçimi
 *  3. MLU dahil/dışı kararı (ayarlara göre)
 *  4. computeLanguageMetrics / computeFluency / computeScreening
 */
import { parseTranscript } from './text/transcript.js';
import { analyzeWord, suggestTargets, ENGINE_ID } from './text/morphology.js';
import { contextualize } from './text/context.js';
import { computeLanguageMetrics, exclusionReason } from './metrics/language.js';
import { computeFluency } from './metrics/fluency.js';
import { computeScreening } from './metrics/screening.js';
import { computeStuttering } from './metrics/stuttering.js';

export { ENGINE_ID };

export const DEFAULT_SETTINGS = {
  excludeYesNo: true,
  excludeIncomplete: true,
  excludeUnintelligible: true,
  excludeDiscourse: true,
  autoRepetition: true,
  minPauseMs: 250,
  longPauseMs: 2000,
  mattrWindow: 50,
  vadOffsetDb: 0,
};

/**
 * Transkripti çözümler (ölçüt hesaplamadan).
 * @param {string} text
 * @param {object} settings
 * @param {object} [opts] { corrections: {norm: analysis}, final: bool }
 */
export function analyzeTranscript(text, settings = DEFAULT_SETTINGS, opts = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const corrections = opts.corrections || {};
  const { utterances } = parseTranscript(text, s);
  for (const u of utterances) {
    const items = [];
    for (const t of u.tokens) {
      if (t.kind !== 'word') continue;
      const fixed = corrections[t.norm];
      // Parafazide hedef sözcük verilmişse ([: kalem]) biçimbirim çözümlemesi hedef üzerinden yapılır
      const useTarget = t.target && !/\s/.test(t.target.trim());
      if (fixed) t.a = { ...fixed, original: t.text, source: 'manual' };
      else if (useTarget) t.a = { ...analyzeWord(t.target.trim(), { capitalized: false }), original: t.text, fromTarget: t.target.trim() };
      else if (t.alts) {
        // Uzatılmış sözcük ("saaat"): sözlükte bulunan sadeleştirmeyi seç
        const cands = t.alts.map((x) => analyzeWord(x, { capitalized: t.capitalized, initial: t.initial }));
        const pick = cands.find((c) => c.known) || cands[0];
        t.a = pick;
        t.text = pick.original;
        t.norm = pick.norm;
      } else t.a = analyzeWord(t.text, { capitalized: t.capitalized, initial: t.initial });
      items.push({ a: t.a, norm: t.norm, capitalized: t.capitalized, initial: t.initial, tok: t });
    }
    contextualize(items.filter((it) => !it.tok.excluded || it.tok.reason === 'auto-repetition' || it.tok.reason === 'repetition'));
    for (const it of items) it.tok.a = it.a;
    if (opts.final) {
      for (const t of u.tokens) {
        if (t.kind === 'word' && t.a && !t.a.known && !t.a.likelyProper && t.norm.length >= 4) t.targets = suggestTargets(t.text);
      }
    }
    const reason = exclusionReason(u, s);
    u.included = !reason;
    u.excludeReason = reason;
    const words = u.tokens.filter((t) => t.kind === 'word' && !t.excluded);
    u.wordsIncluded = words.length;
    u.morphemesIncluded = words.reduce((n, t) => n + (t.a ? t.a.morphemeCount : 1), 0);
  }
  return { utterances, settings: s };
}

/**
 * Tam seans analizi.
 * @param {object} p
 *   transcript: string
 *   acoustic:   akustik çözümleme sonucu (ses yoksa null)
 *   settings, corrections, norms, final
 */
export function analyzeSession({ transcript, acoustic = null, settings = {}, corrections = {}, norms = null, final = false } = {}) {
  const t0 = performance.now();
  const { utterances, settings: s } = analyzeTranscript(transcript, settings, { corrections, final });
  const language = computeLanguageMetrics(utterances, s);
  const fluency = computeFluency(acoustic, language, s);
  const result = {
    engine: ENGINE_ID,
    analyzedAt: new Date().toISOString(),
    settings: s,
    utterances,
    language,
    fluency,
    stuttering: computeStuttering(utterances),
    durationSec: acoustic ? acoustic.durationSec : null,
  };
  result.screening = computeScreening(result, norms);
  result.elapsedMs = Math.round(performance.now() - t0);
  return result;
}

/** Depolama için özet (sözce ayrıntısı olmadan) */
export function summarize(result) {
  const { utterances, ...rest } = result;
  return { ...rest, wordTable: wordTable(result) };
}

/** Araştırma dışa aktarımı için sözcük tablosu (sıkıştırılmış) */
export function wordTable(result) {
  const rows = [];
  for (const u of result.utterances) {
    if (u.speaker === 'examiner') continue;
    u.tokens.forEach((t, i) => {
      if (t.kind !== 'word') return;
      rows.push({
        u: u.index + 1,
        i: i + 1,
        w: t.text,
        root: t.a ? t.a.root : t.norm,
        pos: t.a ? t.a.pos : 'unknown',
        seg: t.a ? t.a.morphemes.map((m, k) => (k === 0 ? m.display : m.display)).join('-') : t.text,
        tags: t.a ? t.a.morphemes.slice(1).map((m) => m.tag).join('.') : '',
        m: t.a ? t.a.morphemeCount : 1,
        inc: u.included && !t.excluded ? 1 : 0,
        ex: t.reason || '',
        err: t.error ? t.error.code : '',
        known: t.a ? (t.a.known ? 1 : 0) : 0,
        amb: t.a && t.a.ambiguous ? 1 : 0,
      });
    });
  }
  return rows;
}
