/**
 * Araştırma dışa aktarımı (CSV).
 *  - Standart: virgül ayraç, nokta ondalık (R, SPSS, Python)
 *  - Excel (Türkçe): noktalı virgül ayraç, virgül ondalık
 * UTF-8 BOM eklenir; Türkçe karakterler Excel'de doğru görünür.
 * Danışan adları varsayılan olarak DIŞA AKTARILMAZ (yalnızca danışan kodu).
 */
import { TAM_LABELS } from '../core/text/suffixes.js';

const TENSES = ['PROG', 'PAST', 'EVID', 'FUT', 'AOR', 'AOR_NEG', 'NEC', 'COND', 'OPT', 'IMP', 'PROG2'];

function ageAt(patient, date) {
  if (!patient || !patient.birthYear) return '';
  return new Date(date).getFullYear() - Number(patient.birthYear);
}

export const SESSION_COLUMNS = [
  ['patient_code', (r) => r.patient?.code],
  ['patient_name', (r, o) => (o.includeNames ? r.patient?.fullName : '')],
  ['group', (r) => r.patient?.group],
  ['diagnosis', (r) => r.patient?.diagnosis],
  ['etiology', (r) => r.patient?.etiology],
  ['sex', (r) => r.patient?.sex],
  ['age', (r) => ageAt(r.patient, r.session.recordedAt)],
  ['education_years', (r) => r.patient?.education],
  ['onset_date', (r) => r.patient?.onsetDate],
  ['months_post_onset', (r) => (r.patient?.onsetDate ? ((new Date(r.session.recordedAt) - new Date(r.patient.onsetDate)) / 2629800000).toFixed(1) : '')],
  ['session_id', (r) => r.session.id],
  ['date', (r) => (r.session.recordedAt || '').slice(0, 10)],
  ['task_type', (r) => r.session.taskType],
  ['task_detail', (r) => r.session.taskDetail],
  ['source', (r) => r.session.source],
  ['status', (r) => r.session.status],
  ['transcription_engine', (r) => r.session.transcript?.engine],
  ['duration_sec', (r) => r.a.fluency?.durationSec ?? r.session.audioMeta?.durationSec],
  ['speech_span_sec', (r) => r.a.fluency?.speechSpanSec],
  ['utterances_total', (r) => r.a.language?.utterances.total],
  ['utterances_included', (r) => r.a.language?.utterances.included],
  ['words_produced', (r) => r.a.language?.words.produced],
  ['words_in_mlu', (r) => r.a.language?.words.mlu],
  ['morphemes', (r) => r.a.language?.words.morphemes],
  ['syllables', (r) => r.a.language?.words.syllables],
  ['mlu_w', (r) => r.a.language?.mluW],
  ['mlu_w_sd', (r) => r.a.language?.mluWsd],
  ['mlu_m', (r) => r.a.language?.mluM],
  ['mlu_m_sd', (r) => r.a.language?.mluMsd],
  ['max_utterance_m', (r) => r.a.language?.maxUtteranceM],
  ['morphemes_per_word', (r) => r.a.language?.morphemesPerWord],
  ['ttr_form', (r) => r.a.language?.ttrForm],
  ['ttr_lemma', (r) => r.a.language?.ttrLemma],
  ['mattr_form', (r) => r.a.language?.mattrForm],
  ['mattr_lemma', (r) => r.a.language?.mattrLemma],
  ['noun_verb_ratio', (r) => r.a.language?.nounVerbRatio],
  ['pronoun_noun_ratio', (r) => r.a.language?.pronounNounRatio],
  ['content_word_ratio', (r) => r.a.language?.contentRatio],
  ['nouns', (r) => (r.a.language ? (r.a.language.pos.noun || 0) + (r.a.language.pos.prop || 0) : '')],
  ['verbs', (r) => r.a.language?.verbs.total],
  ['finite_verbs', (r) => r.a.language?.verbs.finite],
  ['finite_verbs_per_utterance', (r) => r.a.language?.verbs.finitePerUtterance],
  ['utterances_with_predicate', (r) => r.a.language?.verbs.utterancesWithPredicate],
  ['verb_inflection_diversity', (r) => r.a.language?.verbs.inflectionDiversity],
  ...TENSES.map((t) => [`tense_${t.toLowerCase()}`, (r) => r.a.language?.verbs.tense?.[t] || 0]),
  ['noun_inflected_ratio', (r) => r.a.language?.nouns.inflectedRatio],
  ['case_diversity', (r) => r.a.language?.nouns.caseDiversity],
  ['fillers', (r) => r.a.language?.disfluency.fillers],
  ['discourse_markers', (r) => r.a.language?.disfluency.discourseMarkers],
  ['filler_rate_per100', (r) => r.a.language?.disfluency.fillerRate],
  ['repetitions', (r) => r.a.language?.disfluency.repetitions],
  ['retracings', (r) => r.a.language?.disfluency.retracings],
  ['repetition_rate_per100', (r) => r.a.language?.disfluency.repetitionRate],
  ['fragments', (r) => r.a.language?.disfluency.fragments],
  ['errors_total', (r) => r.a.language?.errors.total],
  ['errors_semantic', (r) => r.a.language?.errors.byCode.s || 0],
  ['errors_phonological', (r) => r.a.language?.errors.byCode.p || 0],
  ['errors_neologism', (r) => r.a.language?.errors.byCode.n || 0],
  ['errors_morphological', (r) => r.a.language?.errors.byCode.m || 0],
  ['error_rate_per100', (r) => r.a.language?.errors.rate],
  ['out_of_lexicon_rate_per100', (r) => r.a.language?.errors.unknownRate],
  ['empty_word_rate_per100', (r) => r.a.language?.lexical.emptyRate],
  ['word_finding_comments', (r) => r.a.language?.lexical.wordFindingComments],
  ['wpm', (r) => r.a.fluency?.wpm],
  ['speech_rate_syll_s', (r) => r.a.fluency?.sps],
  ['articulation_rate_syll_s', (r) => r.a.fluency?.articulationRate],
  ['mlr_syllables', (r) => r.a.fluency?.mlrSyll],
  ['pause_count', (r) => r.a.fluency?.pauseCount],
  ['pauses_per_min', (r) => r.a.fluency?.pausesPerMin],
  ['mean_pause_s', (r) => r.a.fluency?.meanPause],
  ['median_pause_s', (r) => r.a.fluency?.medianPause],
  ['max_pause_s', (r) => r.a.fluency?.maxPause],
  ['long_pauses_per_min', (r) => r.a.fluency?.longPausesPerMin],
  ['pause_time_ratio', (r) => r.a.fluency?.pauseRatio],
  ['f0_mean_hz', (r) => r.session.acoustic?.f0?.mean],
  ['f0_sd_hz', (r) => r.session.acoustic?.f0?.sd],
  ['f0_range_st', (r) => r.session.acoustic?.f0?.rangeSt],
  ['snr_db', (r) => r.session.acoustic?.quality?.snrDb],
  ['screening_score', (r) => (r.a.screening?.available ? r.a.screening.overall : '')],
  ['screening_band', (r) => (r.a.screening?.available ? r.a.screening.band.label : '')],
  ['screening_pattern', (r) => (r.a.screening?.available ? r.a.screening.pattern.label : '')],
  ['domain_fluency', (r) => r.a.screening?.domains?.fluency?.score],
  ['domain_grammar', (r) => r.a.screening?.domains?.grammar?.score],
  ['domain_lexical', (r) => r.a.screening?.domains?.lexical?.score],
  ['domain_paraphasia', (r) => r.a.screening?.domains?.paraphasia?.score],
  ['engine', (r) => r.a.engine],
  ['analyzed_at', (r) => r.a.analyzedAt],
];

/** Excel/Sheets formül enjeksiyonunu önler: = + - @ ile başlayan metin hücreleri ' ile başlatılır. */
export function csvSafeText(s) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function cell(v, o) {
  if (v === undefined || v === null) return '';
  let s = typeof v === 'number' ? (o.excelTr ? String(v).replace('.', ',') : String(v)) : csvSafeText(String(v));
  const sep = o.excelTr ? ';' : ',';
  if (s.includes(sep) || s.includes('"') || s.includes('\n')) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {Array<{session, patient, a}>} rows  a = seans analizi özeti
 * @param {{excelTr?: boolean, includeNames?: boolean}} o
 */
export function sessionsCsv(rows, o = {}) {
  const sep = o.excelTr ? ';' : ',';
  const cols = SESSION_COLUMNS.filter(([name]) => name !== 'patient_name' || o.includeNames);
  const lines = [cols.map(([n]) => n).join(sep)];
  for (const r of rows) lines.push(cols.map(([, f]) => cell(f(r, o), o)).join(sep));
  return '﻿' + lines.join('\r\n');
}

/** Sözcük düzeyi tablo (her satır bir sözcük). */
export function wordsCsv(rows, o = {}) {
  const sep = o.excelTr ? ';' : ',';
  const head = ['patient_code', 'session_id', 'date', 'utterance', 'position', 'word', 'root', 'pos', 'segmentation', 'suffix_tags', 'morphemes', 'in_mlu', 'excluded_reason', 'error_code', 'in_lexicon', 'ambiguous'];
  const lines = [head.join(sep)];
  for (const r of rows) {
    for (const w of r.a.wordTable || []) {
      lines.push([r.patient?.code, r.session.id, (r.session.recordedAt || '').slice(0, 10), w.u, w.i, w.w, w.root, w.pos, w.seg, w.tags, w.m, w.inc, w.ex, w.err, w.known, w.amb]
        .map((v) => cell(v, o)).join(sep));
    }
  }
  return '﻿' + lines.join('\r\n');
}

export function tenseLabel(t) { return TAM_LABELS[t] || t; }
