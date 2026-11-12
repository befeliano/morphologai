/**
 * Analizden materyale köprü: seans çözümlemesindeki ses hatalarından çalışılacak hedef sesleri önerir.
 *
 * Kaynak: (1) hedefi bilinen fonolojik hatalar — transkriptte "kalam [: kalem]" biçiminde kodlananlar,
 * (2) sözlükte bulunmayan ama bir harf uzağında bilinen sözcük olan üretimler (fonolojik hata adayı).
 * Her (söylenen, hedef) çifti harf düzeyinde karşılaştırılır:
 *   değiştirme : aynı uzunlukta tek fark      → hedef ses = beklenen harf, yerine söylenen = üretilen harf
 *   düşürme    : söylenen bir harf kısa        → hedef ses = düşen harf
 *   ekleme     : söylenen bir harf uzun        → eklenen ses not edilir (hedef önerilmez)
 * Öneri, en az bir kez gözlenen hedef sesleri sıklığa göre sıralar. Otomatik transkript ses hatalarını
 * gerçek sözcüğe "düzeltmiş" olabileceğinden öneriler doğrulanmış transkriptte anlamlıdır.
 */
import { trLower } from '../text/normalize.js';

const clean = (s) => trLower(s || '').replace(/[^a-zçğıöşüâîû]/g, '');
const posOf = (i, len) => (i === 0 ? 'initial' : i === len - 1 ? 'final' : 'medial');

/** İki sözcük arasındaki tek harflik farkı döndürür; yoksa null. */
export function singleDiff(said, target) {
  const a = clean(said);
  const b = clean(target);
  if (!a || !b || a === b) return null;
  if (a.length === b.length) {
    let idx = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { if (idx !== -1) return null; idx = i; }
    }
    return idx === -1 ? null : { type: 'substitution', expected: b[idx], produced: a[idx], position: posOf(idx, b.length) };
  }
  if (a.length + 1 === b.length) {
    for (let i = 0; i < b.length; i++) if (b.slice(0, i) + b.slice(i + 1) === a) return { type: 'omission', expected: b[i], produced: '', position: posOf(i, b.length) };
  }
  if (a.length === b.length + 1) {
    for (let i = 0; i < a.length; i++) if (a.slice(0, i) + a.slice(i + 1) === b) return { type: 'addition', expected: '', produced: a[i], position: posOf(i, a.length) };
  }
  return null;
}

/**
 * @param {Array<{word: string, target: string}>} pairs söylenen / hedef sözcük çiftleri
 * @returns {Array<{sound, count, positions: string[], substitutes: string[], omissions: number, examples: string[]}>}
 */
export function suggestSoundTargets(pairs = []) {
  const map = new Map();
  for (const p of pairs) {
    const d = singleDiff(p.word, p.target);
    if (!d || !d.expected) continue;
    let e = map.get(d.expected);
    if (!e) map.set(d.expected, (e = { sound: d.expected, count: 0, positions: new Map(), substitutes: new Map(), omissions: 0, examples: [] }));
    e.count++;
    e.positions.set(d.position, (e.positions.get(d.position) || 0) + 1);
    if (d.type === 'omission') e.omissions++;
    else e.substitutes.set(d.produced, (e.substitutes.get(d.produced) || 0) + 1);
    if (e.examples.length < 4) e.examples.push(`${clean(p.word)} → ${clean(p.target)}`);
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return [...map.values()].sort((a, b) => b.count - a.count || a.sound.localeCompare(b.sound, 'tr'))
    .map((e) => ({ sound: e.sound, count: e.count, positions: top(e.positions), substitutes: top(e.substitutes), omissions: e.omissions, examples: e.examples }));
}

/** Analiz sonucundan (analyzeSession çıktısı) söylenen/hedef çiftlerini toplar. */
export function errorPairsFromResult(result) {
  const out = [];
  for (const u of result?.utterances || []) {
    if (u.speaker === 'examiner') continue;
    for (const t of u.tokens || []) {
      if (t.kind !== 'word') continue;
      if (t.target) out.push({ word: t.text, target: t.target, coded: true });
      else if (t.targets?.length) out.push({ word: t.text, target: t.targets[0].word, coded: false });
    }
  }
  return out;
}
