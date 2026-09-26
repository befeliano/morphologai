/**
 * Dil ölçütleri (transkript + biçimbirim çözümlemesinden)
 *
 * Tanımlar (Yöntem sayfasında da belgelenir):
 *  - MLU-w  : dahil edilen sözcelerdeki sözcük sayısı ortalaması
 *  - MLU-m  : dahil edilen sözcelerdeki biçimbirim sayısı ortalaması
 *             (kök = 1, her çekim eki = +1, yapım ekleri sayılmaz; birleşik sözcük/özel ad kökü = 1)
 *  - TTR    : farklı sözcük / toplam sözcük (biçim ve kök/lemma düzeyinde)
 *  - MATTR  : kayan pencereli TTR (Covington & McFall, 2010); varsayılan pencere 50
 *  - İsim/Fiil oranı, içerik sözcüğü oranı, sözce başına çekimli fiil
 *  - Zaman/kişi eki dağılımı, hâl eki çeşitliliği
 *  - Dolgu, tekrar, yeniden başlama, yarım sözcük oranları (100 sözcükte)
 *  - Kodlanmış parafaziler, olası neolojizmler (sözlükte bulunmayan), boş sözcükler
 */
import { syllableCount } from '../text/normalize.js';
import { CONTENT_POS, FUNCTION_POS } from '../text/lexicon.js';
import { YESNO, EMPTY_LEMMAS, WORD_FINDING_PATTERNS } from '../text/pools.js';

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

/** Kayan pencereli TTR. N < pencere ise null. */
export function mattr(tokens, window = 50) {
  const n = tokens.length;
  if (n < window) return null;
  const counts = new Map();
  let distinct = 0;
  for (let i = 0; i < window; i++) {
    const c = (counts.get(tokens[i]) || 0) + 1;
    counts.set(tokens[i], c);
    if (c === 1) distinct++;
  }
  let sum = distinct / window;
  let windows = 1;
  for (let i = window; i < n; i++) {
    const out = tokens[i - window];
    const co = counts.get(out) - 1;
    counts.set(out, co);
    if (co === 0) distinct--;
    const c = (counts.get(tokens[i]) || 0) + 1;
    counts.set(tokens[i], c);
    if (c === 1) distinct++;
    sum += distinct / window;
    windows++;
  }
  return sum / windows;
}

/**
 * Her sözcenin MLU'ya dahil olup olmadığını belirler.
 * @returns {string|null} dışlama nedeni ya da null (dahil)
 */
export function exclusionReason(u, settings) {
  if (u.speaker === 'examiner') return 'examiner';
  const words = u.tokens.filter((t) => t.kind === 'word' && !t.excluded);
  if (!words.length) return 'empty';
  if (settings.excludeUnintelligible && u.hasUnintelligible) return 'unintelligible';
  if (settings.excludeIncomplete && u.incomplete) return 'incomplete';
  if (settings.excludeYesNo && words.length === 1 && YESNO.has(words[0].norm)) return 'yesno';
  return null;
}

export const EXCLUSION_LABELS = {
  examiner: 'terapist sözcesi',
  empty: 'sözcük içermiyor',
  unintelligible: 'anlaşılmayan bölüm (xxx)',
  incomplete: 'yarım kalmış sözce',
  yesno: 'tek sözcüklük evet/hayır yanıtı',
};

export function computeLanguageMetrics(utterances, settings) {
  const part = utterances.filter((u) => u.speaker !== 'examiner');
  const examinerCount = utterances.length - part.length;
  const included = part.filter((u) => u.included);
  const excluded = { incomplete: 0, unintelligible: 0, yesno: 0, empty: 0 };
  for (const u of part) if (!u.included && excluded[u.excludeReason] !== undefined) excluded[u.excludeReason]++;

  // Tüm katılımcı sözcük tokenları
  const allTokens = part.flatMap((u) => u.tokens);
  const wordTokens = allTokens.filter((t) => t.kind === 'word');
  const producedWords = wordTokens.filter((t) => !t.excluded);         // tekrarlar hariç üretilen sözcükler
  const mluWords = included.flatMap((u) => u.tokens.filter((t) => t.kind === 'word' && !t.excluded));

  // MLU
  const wPerUtt = included.map((u) => u.wordsIncluded);
  const mPerUtt = included.map((u) => u.morphemesIncluded);
  const mluW = mean(wPerUtt);
  const mluM = mean(mPerUtt);

  // Sözcük düzeyi (üretilen sözcükler)
  const forms = producedWords.map((t) => t.norm);
  const lemmas = producedWords.map((t) => (t.a ? `${t.a.root}:${t.a.pos}` : t.norm));
  const uniqueForms = new Set(forms).size;
  const uniqueLemmas = new Set(lemmas).size;
  const N = producedWords.length;
  const syllables = producedWords.reduce((s, t) => s + syllableCount(t.text), 0);
  const morphemes = producedWords.reduce((s, t) => s + (t.a ? t.a.morphemeCount : 1), 0);

  // Sözcük türleri
  const pos = {};
  for (const t of producedWords) {
    const p = t.a ? t.a.pos : 'unknown';
    pos[p] = (pos[p] || 0) + 1;
  }
  const count = (p) => pos[p] || 0;
  const nouns = count('noun') + count('prop') + count('abbr');
  const verbsAll = producedWords.filter((t) => t.a && t.a.pos === 'verb');
  const finite = verbsAll.filter((t) => t.a.verb && t.a.verb.finite);
  const content = producedWords.filter((t) => t.a && CONTENT_POS.has(t.a.pos)).length;
  const functional = producedWords.filter((t) => t.a && FUNCTION_POS.has(t.a.pos)).length;

  // Fiil çekimi
  const tense = {};
  const person = {};
  const combos = new Set();
  let negative = 0;
  let ability = 0;
  let compound = 0;
  for (const t of finite) {
    const v = t.a.verb;
    if (v.tense) tense[v.tense] = (tense[v.tense] || 0) + 1;
    if (v.person) person[v.person] = (person[v.person] || 0) + 1;
    combos.add(`${v.tense}|${v.person}|${v.negative ? 1 : 0}|${v.compound || ''}`);
    if (v.negative) negative++;
    if (v.ability) ability++;
    if (v.compound) compound++;
  }
  const nonfiniteForms = {};
  for (const t of verbsAll) {
    if (t.a.verb && !t.a.verb.finite && t.a.verb.form) nonfiniteForms[t.a.verb.form] = (nonfiniteForms[t.a.verb.form] || 0) + 1;
  }
  const uttWithVerb = included.filter((u) => u.tokens.some((t) => t.kind === 'word' && !t.excluded && t.a
    && ((t.a.verb && t.a.verb.finite) || t.a.pos === 'cop' || (t.a.morphemes || []).some((m) => m.cat === 'ek-fiil')
      || ['var', 'yok', 'değil'].includes(t.a.root)))).length;

  // İsim çekimi
  const nounTokens = producedWords.filter((t) => t.a && ['noun', 'prop', 'pron', 'abbr'].includes(t.a.pos));
  const cases = {};
  let inflectedNouns = 0;
  let plural = 0;
  let possessive = 0;
  for (const t of nounTokens) {
    if (t.a.morphemeCount > 1) inflectedNouns++;
    for (const c of t.a.cases || []) cases[c] = (cases[c] || 0) + 1;
    if (t.a.plural) plural++;
    if (t.a.possessive) possessive++;
  }

  // Akıcılık bozukluğu göstergeleri (metin)
  const fillers = allTokens.filter((t) => t.kind === 'filler' && !t.discourse).length;
  const discourse = allTokens.filter((t) => t.discourse).length;
  const repetitions = allTokens.filter((t) => t.reason === 'repetition' || t.reason === 'auto-repetition').length
    + allTokens.reduce((s, t) => s + (t.repeatCount ? t.repeatCount - 1 : 0), 0);
  const retracings = allTokens.filter((t) => t.reason === 'retrace').length;
  const fragments = allTokens.filter((t) => t.kind === 'fragment').length;
  const unintelligible = allTokens.filter((t) => t.kind === 'unintelligible').length;
  const per100 = (x) => (N ? (100 * x) / N : 0);

  // Hatalar / parafazi
  const byCode = {};
  let errorsTotal = 0;
  for (const t of wordTokens) {
    if (!t.error) continue;
    errorsTotal++;
    byCode[t.error.code] = (byCode[t.error.code] || 0) + 1;
  }
  const unknown = producedWords.filter((t) => t.a && !t.a.known && !t.a.likelyProper && t.a.pos !== 'prop');
  const phonCandidates = producedWords.filter((t) => t.targets && t.targets.length).map((t) => ({ word: t.text, target: t.targets[0].word }));

  // Boş sözcük ve kelime bulma güçlüğü
  const emptyWords = allTokens.filter((t) => t.emptyFiller || (t.kind === 'word' && t.a && EMPTY_LEMMAS.has(t.a.root))).length;
  let wordFinding = 0;
  for (const u of part) {
    const low = u.text.toLocaleLowerCase('tr-TR');
    for (const re of WORD_FINDING_PATTERNS) if (re.test(low)) { wordFinding++; break; }
  }

  // Sebat (perseverasyon): aynı içerik kökünün ardışık olmayan sözcelerde yoğun tekrarı
  const contentLemmaCounts = new Map();
  for (const t of producedWords) {
    if (!t.a || !['noun', 'verb', 'adj'].includes(t.a.pos)) continue;
    contentLemmaCounts.set(t.a.root, (contentLemmaCounts.get(t.a.root) || 0) + 1);
  }
  const topRepeated = [...contentLemmaCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([lemma, n]) => ({ lemma, n }));
  const uttTexts = new Map();
  for (const u of included) {
    const k = u.tokens.filter((t) => t.kind === 'word' && !t.excluded).map((t) => t.norm).join(' ');
    uttTexts.set(k, (uttTexts.get(k) || 0) + 1);
  }
  const stereotypies = [...uttTexts.entries()].filter(([k, n]) => n >= 3 && k).map(([text, n]) => ({ text, n }));

  const ambiguous = producedWords.filter((t) => t.a && t.a.ambiguous).length;

  // Süre: transkript zaman damgalarından (yoksa hece sayısından kaba tahmin)
  const timed = utterances.filter((u) => u.start != null).map((u) => u.start);
  let timing;
  if (timed.length >= 2) {
    const lastU = utterances.filter((u) => u.start != null).slice(-1)[0];
    const lastDur = lastU.tokens.filter((t) => t.kind === 'word').reduce((s, t) => s + syllableCount(t.text), 0) / 3.5;
    timing = { spanSec: round(Math.max(...timed) - Math.min(...timed) + Math.max(1, lastDur), 1), source: 'timestamps' };
  } else {
    timing = { spanSec: round(syllables / 3.0, 1), source: 'estimate' };
  }

  return {
    timing,
    utterances: {
      total: part.length,
      included: included.length,
      excluded,
      examiner: examinerCount,
      questions: part.filter((u) => u.question).length,
    },
    words: {
      tokens: wordTokens.length,
      produced: N,
      mlu: mluWords.length,
      uniqueForms,
      uniqueLemmas,
      syllables,
      morphemes,
    },
    mluW: round(mluW),
    mluM: round(mluM),
    mluWsd: round(sd(wPerUtt)),
    mluMsd: round(sd(mPerUtt)),
    maxUtteranceW: wPerUtt.length ? Math.max(...wPerUtt) : 0,
    maxUtteranceM: mPerUtt.length ? Math.max(...mPerUtt) : 0,
    morphemesPerWord: round(N ? morphemes / N : 0),
    syllablesPerWord: round(N ? syllables / N : 0),
    ttrForm: round(N ? uniqueForms / N : 0, 3),
    ttrLemma: round(N ? uniqueLemmas / N : 0, 3),
    mattrForm: round(mattr(forms, settings.mattrWindow || 50), 3),
    mattrLemma: round(mattr(lemmas, settings.mattrWindow || 50), 3),
    mattrWindow: settings.mattrWindow || 50,
    pos,
    nounVerbRatio: round(verbsAll.length ? nouns / verbsAll.length : null),
    pronounNounRatio: round(nouns ? count('pron') / nouns : null),
    contentRatio: round(N ? content / N : 0, 3),
    functionRatio: round(N ? functional / N : 0, 3),
    verbs: {
      total: verbsAll.length,
      finite: finite.length,
      nonfinite: verbsAll.length - finite.length,
      nonfiniteForms,
      finitePerUtterance: round(included.length ? finite.length / included.length : 0),
      utterancesWithPredicate: round(included.length ? uttWithVerb / included.length : 0, 3),
      tense,
      person,
      negative,
      ability,
      compound,
      inflectionDiversity: combos.size,
      meanMorphemes: round(mean(verbsAll.map((t) => t.a.morphemeCount))),
    },
    nouns: {
      total: nounTokens.length,
      inflected: inflectedNouns,
      inflectedRatio: round(nounTokens.length ? inflectedNouns / nounTokens.length : 0, 3),
      cases,
      caseDiversity: Object.keys(cases).length,
      plural,
      possessive,
    },
    disfluency: {
      fillers,
      discourseMarkers: discourse,
      repetitions,
      retracings,
      fragments,
      unintelligible,
      fillerRate: round(per100(fillers + discourse)),
      repetitionRate: round(per100(repetitions + retracings)),
      fragmentRate: round(per100(fragments)),
    },
    errors: {
      total: errorsTotal,
      byCode,
      rate: round(per100(errorsTotal)),
      unknownWords: unknown.length,
      unknownRate: round(per100(unknown.length)),
      unknownList: [...new Set(unknown.map((t) => t.text))].slice(0, 40),
      phonologicalCandidates: phonCandidates.slice(0, 40),
    },
    lexical: {
      emptyWords,
      emptyRate: round(per100(emptyWords)),
      wordFindingComments: wordFinding,
      properNouns: count('prop'),
      ambiguousWords: ambiguous,
    },
    perseveration: {
      topRepeated,
      stereotypies,
    },
  };
}
