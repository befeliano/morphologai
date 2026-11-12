/**
 * Hedef sayacı — seans transkriptinde bir hedefin (ses, ek ya da sözcük) kaç kez üretildiğini sayar.
 * Yalnız danışanın sözceleri sayılır. Ek hedefleri düz metin aramasıyla değil, biçimbirim çözümlemesindeki
 * ek etiketleriyle bulunur: "-lar" hedefi "kalar" gibi rastlantısal harf dizilerini saymaz, çokluk ekini sayar.
 *
 * Otomatik transkriptte danışanın hatalı üretimi doğru sözcüğe "düzeltilmiş" olabilir; bu yüzden sayım
 * "hedefin geçtiği yer"dir, "doğru üretim" değildir. Doğruluk için transkript dinlenerek kodlanmalıdır.
 */
import { positionsOf, normalizeTarget } from '../text/phonetics.js';
import { trLower } from '../text/normalize.js';

export const SUFFIX_TARGETS = [
  { id: 'PL', label: 'Çokluk eki (-lar / -ler)' }, { id: 'ACC', label: 'Belirtme hâli (-ı / -i)' }, { id: 'DAT', label: 'Yönelme hâli (-a / -e)' },
  { id: 'LOC', label: 'Bulunma hâli (-da / -de)' }, { id: 'ABL', label: 'Ayrılma hâli (-dan / -den)' }, { id: 'GEN', label: 'Tamlayan eki (-ın / -in)' },
  { id: 'INS', label: 'Vasıta eki (-la / ile)' }, { id: 'POSS', label: 'İyelik ekleri (-ım, -ın, -ı…)' },
  { id: 'PROG', label: 'Şimdiki zaman (-yor)' }, { id: 'PST', label: 'Görülen geçmiş zaman (-dı)' }, { id: 'EVID', label: 'Öğrenilen geçmiş zaman (-mış)' },
  { id: 'FUT', label: 'Gelecek zaman (-acak)' }, { id: 'AOR', label: 'Geniş zaman (-r)' }, { id: 'NEG', label: 'Olumsuzluk (-ma)' },
  { id: 'ABIL', label: 'Yeterlilik (-abil)' }, { id: 'CVB', label: 'Zarf-fiil (-ıp, -ınca, -arak…)' }, { id: 'PTCP', label: 'Sıfat-fiil (-an, -dık…)' },
];

const tagMatches = (tag, target) => tag === target || tag.startsWith(`${target}.`) || (target === 'NEG' && tag === 'AOR.NEG');

/**
 * @param {object} result analyzeSession() çıktısı
 * @param {object} t { type: 'sound' | 'suffix' | 'word', value, position? }
 * @returns {{count, perUtterance: number, utterances: number, hits: Array<{utterance, word, index}>, words: Map<string, number>}}
 */
export function countTargets(result, t) {
  const hits = [];
  const part = (result?.utterances || []).filter((u) => u.speaker !== 'examiner');
  const value = t.type === 'sound' ? normalizeTarget(t.value) : t.type === 'word' ? trLower(t.value || '').trim() : t.value;
  if (!value) return { count: 0, utterances: part.length, uttWithHit: 0, hits, words: [] };
  let uttWithHit = 0;
  part.forEach((u, ui) => {
    let any = false;
    (u.tokens || []).forEach((tok, ti) => {
      if (tok.kind !== 'word') return;
      let n = 0;
      if (t.type === 'sound') {
        const p = positionsOf(tok.text, value);
        n = t.position ? (p[t.position] ? 1 : 0) : p.count;
      } else if (t.type === 'suffix') {
        n = (tok.a?.morphemes || []).filter((m) => m.tag && tagMatches(m.tag, value)).length;
      } else {
        const root = trLower(tok.a?.root || '');
        n = trLower(tok.norm || tok.text) === value || root === value ? 1 : 0;
      }
      if (n) { hits.push({ utterance: ui, token: ti, word: tok.text, n }); any = true; }
    });
    if (any) uttWithHit++;
  });
  const byWord = new Map();
  for (const h of hits) byWord.set(trLower(h.word), (byWord.get(trLower(h.word)) || 0) + h.n);
  return {
    count: hits.reduce((s, h) => s + h.n, 0), utterances: part.length, uttWithHit, hits,
    words: [...byWord.entries()].sort((a, b) => b[1] - a[1]).map(([word, n]) => ({ word, n })),
  };
}
