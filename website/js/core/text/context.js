/**
 * Bağlamsal çözümleme: bir sözcedeki kelimelerin en olası okumasını komşu
 * sözcüklere bakarak seçer. Biçimbirim çözümleyicinin ürettiği alternatifler
 * arasından, aşağıdaki ipuçlarının puanlarıyla yeniden sıralama yapılır:
 *
 *  1. Türkçe SOV dizilimi: sözce sonundaki çekimli fiil okuması güçlenir.
 *  2. Belirleyici + isim: "bu kitap" (belirleyici) / "bunu gördüm" (zamir).
 *  3. Sayı/ölçü: "yüz lira" (sayı), "iki bardak" (isim).
 *  4. Tamlama: ilgi hâlinden sonra iyelikli isim ("annemin çantası").
 *  5. Eş sesli sözcük havuzu: "yaz tatili" (mevsim) / "mektup yaz" (fiil).
 *  6. Özel ad bağlamı: "Ayşe Hanım", "Doktor Mehmet".
 *  7. Mastar yöneten fiiller: "yemek istiyorum" (mastar).
 */
import { applyAlternative } from './morphology.js';
import { POS_LABEL, POS_CSS } from './lexicon.js';
import {
  HOMONYMS, DETERMINERS, NUMBER_WORDS, MEASURE_NOUNS, HONORIFICS, TITLES, INF_GOVERNORS,
} from './pools.js';

const NOMINAL = new Set(['noun', 'adj', 'num', 'prop', 'abbr', 'pron']);
const cueSets = new Map();

function cueSet(str) {
  if (!str) return null;
  if (str === 'MEASURE') return MEASURE_NOUNS;
  if (str === 'INF_GOV') return INF_GOVERNORS;
  let s = cueSets.get(str);
  if (!s) cueSets.set(str, (s = new Set(str.split(/\s+/))));
  return s;
}

function cueHit(str, nb) {
  const s = cueSet(str);
  if (!s || !nb) return false;
  return s.has(nb.a.root) || s.has(nb.norm) || (nb.a.lemma && s.has(nb.a.lemma));
}

function matchesPrefer(c, prefer) {
  if (!prefer) return true;
  if (prefer.pos && c.pos !== prefer.pos) return false;
  if (prefer.root && c.root !== prefer.root) return false;
  return true;
}

function contextScore(c, i, items) {
  const self = items[i];
  const prev = items[i - 1];
  const next = items[i + 1];
  const isFinal = !next;
  const nSuffix = c.morphemes.length - 1;
  let s = 0;
  const notes = [];

  // 1) Sözce sonu: çekimli fiil / ek-fiilli yüklem
  if (isFinal && c.verb && c.verb.finite) { s += 2; notes.push('sözce sonunda çekimli fiil'); }
  else if (isFinal && !c.verb && c.morphemes.some((m) => m.cat === 'ek-fiil')) s += 0.5;
  if (!isFinal && c.verb && c.verb.finite && next && next.a.verb && next.a.verb.finite && nSuffix === 0) s -= 0.5;

  // 2) Belirleyici / zamir
  if (DETERMINERS.has(self.norm) && nSuffix === 0) {
    const nextNominal = next && ['noun', 'adj', 'num', 'prop', 'abbr'].includes(next.a.pos);
    if (nextNominal && c.pos === 'det') { s += 2.5; notes.push('ardından ad geliyor → belirleyici'); }
    if (!nextNominal && (c.pos === 'pron' || (self.norm === 'bir' && c.pos === 'num'))) s += 1.5;
  }

  // 3) Sayı / belirleyiciden sonra ad
  if (prev && (prev.a.pos === 'num' || prev.a.pos === 'det' || NUMBER_WORDS.has(prev.norm))) {
    if (c.verb && nSuffix === 0) s -= 1.5;
    else if (NOMINAL.has(c.pos)) s += 0.8;
  }

  // 4) Yalın sıfat + ad
  if (nSuffix === 0 && next && ['noun', 'prop'].includes(next.a.pos) && (c.pos === 'adj' || c.pos === 'num')) s += 1;
  // 4b) Belirtisiz isim tamlaması: yalın ad + 3. kişi iyelikli ad ("kız kardeşi", "okul çantası")
  if (nSuffix === 0 && next && next.a.possessive && c.pos === 'noun') { s += 2; notes.push('isim tamlaması'); }
  // 4c) Cümle ortasında eksiz emir kipi seyrektir (alıntı: "yaz dedi" hariç)
  if (c.verb && c.verb.tense === 'IMP' && nSuffix === 0 && next && !(next.a.root === 'de' || next.norm === 'diye')) s -= 2.5;
  // 4d) Saygı sözcükleri (Hanım, Bey, Amca) özel adı izlediğinde ad okuması
  if (HONORIFICS.has(self.norm) && prev && (prev.a.pos === 'prop' || prev.capitalized)) {
    if (c.pos === 'noun') { s += 8; notes.push('saygı sözcüğü'); } else if (c.pos === 'prop') s -= 4;
  }

  // 5) Tamlama
  if (prev && prev.a.cases && prev.a.cases.includes('GEN') && c.possessive) { s += 1.5; notes.push('ilgi hâlinden sonra iyelikli ad (tamlama)'); }

  // 6) Eş sesli havuzu
  const senses = [...(HOMONYMS[self.norm] || []), ...(c.root !== self.norm ? HOMONYMS[c.root] || [] : [])];
  for (const sense of senses) {
    if (!matchesPrefer(c, sense.prefer)) continue;
    const hasCue = sense.prev || sense.next || sense.final;
    let hit = false;
    if (sense.prev && cueHit(sense.prev, prev)) hit = true;
    if (sense.next && cueHit(sense.next, next)) hit = true;
    if (sense.final && isFinal) hit = true;
    if (hit) { s += sense.bonus; notes.push(`eş sesli: ${sense.gloss}`); }
    else if (!hasCue) s += sense.bonus * 0.5;
  }

  // 7) Özel ad bağlamı
  if (c.pos === 'prop') {
    if (next && HONORIFICS.has(next.norm)) { s += 6; notes.push('saygı sözcüğünden önce özel ad'); }
    if (prev && TITLES.has(prev.norm)) { s += 5; notes.push('unvandan sonra özel ad'); }
  }

  // 8) Mastar yöneten fiil
  if (c.verb && (c.verb.form === 'infinitive' || c.verb.form === 'verbal-noun') && next && INF_GOVERNORS.has(next.a.root)) {
    s += 2; notes.push('mastar tümleci');
  }
  return { s, notes };
}

/**
 * @param {Array<{a: object, norm: string, capitalized?: boolean, initial?: boolean}>} items
 *        bir sözcedeki kelimeler (dolgu/söylem belirleyicileri hariç), sırayla
 * @returns aynı dizi; items[i].a bağlama göre güncellenmiş analizdir
 */
export function contextualize(items) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const a = it.a;
    if (a.source === 'override' || a.source === 'manual') continue;

    // Büyük harfle yazılmış, sözce başı olmayan bilinmeyen kelime → olası özel ad
    if (!a.known && it.capitalized && !it.initial && a.morphemes.length === 1) {
      it.a = { ...a, pos: 'prop', posLabel: 'Özel isim (olası)', css: POS_CSS.prop, likelyProper: true };
      continue;
    }
    const cands = [a, ...(a.alternatives || [])];
    if (cands.length < 2) continue;
    let best = null;
    let second = null;
    for (const c of cands) {
      const { s, notes } = contextScore(c, i, items);
      const total = (c.score ?? 0) + s;
      const rec = { c, total, notes };
      if (!best || total > best.total) { second = best; best = rec; }
      else if (!second || total > second.total) second = rec;
    }
    let out = a;
    if (best.c.signature !== a.signature) {
      out = applyAlternative(a, best.c.signature, 'context');
      out.context = { rule: best.notes.join('; ') || 'bağlam', from: a.signature };
    } else if (best.notes.length) {
      out = { ...a, context: { rule: best.notes.join('; '), confirmed: true } };
    }
    const margin = second ? best.total - second.total : 99;
    out.ambiguous = margin < 2 && !!second && (second.c.morphemeCount !== best.c.morphemeCount || second.c.pos !== best.c.pos);
    if (out.pos === 'det' && !POS_LABEL[out.pos]) out.posLabel = 'Belirleyici';
    it.a = out;
  }
  return items;
}
