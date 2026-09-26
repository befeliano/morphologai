/**
 * Praat TextGrid (uzun metin biçimi) dışa aktarımı.
 * Katmanlar:
 *   1. "sozce"     — sözceler (başlangıç: transkript zaman damgası; bitiş: sonraki sözce / konuşma sonu)
 *   2. "konusma"   — akustik bölütleme: "ses" / "sessiz" aralıkları
 *   3. "duraksama" — ≥ eşik duraksamalar (süreleriyle)
 *   4. "notlar"    — canlı seansta eklenen zaman damgalı klinisyen notları (PointTier)
 * Praat'ta: Open → Read from file… (ses dosyasıyla birlikte açılır: View & Edit).
 */
const esc = (s) => String(s ?? '').replace(/"/g, '""');
const r = (x) => Number((x || 0).toFixed(4));

function intervalTier(name, xmax, intervals) {
  // boşlukları doldur (TextGrid aralıkları kesintisiz olmalı)
  const full = [];
  let t = 0;
  for (const iv of intervals.filter((v) => v.end > v.start).sort((a, b) => a.start - b.start)) {
    const s = Math.max(t, iv.start);
    const e = Math.min(xmax, iv.end);
    if (e <= s) continue;
    if (s > t) full.push({ start: t, end: s, text: '' });
    full.push({ start: s, end: e, text: iv.text });
    t = e;
  }
  if (t < xmax) full.push({ start: t, end: xmax, text: '' });
  const lines = [
    '        class = "IntervalTier"', `        name = "${name}"`, '        xmin = 0', `        xmax = ${r(xmax)}`,
    `        intervals: size = ${full.length}`,
  ];
  full.forEach((iv, i) => {
    lines.push(`        intervals [${i + 1}]:`, `            xmin = ${r(iv.start)}`, `            xmax = ${r(iv.end)}`, `            text = "${esc(iv.text)}"`);
  });
  return lines;
}

function pointTier(name, xmax, points) {
  const lines = ['        class = "TextTier"', `        name = "${name}"`, '        xmin = 0', `        xmax = ${r(xmax)}`, `        points: size = ${points.length}`];
  points.forEach((p, i) => lines.push(`        points [${i + 1}]:`, `            number = ${r(p.t)}`, `            mark = "${esc(p.text)}"`));
  return lines;
}

/**
 * @param {object} p { durationSec, utterances (analiz), acoustic (özet: speechSegments, pauses), markers }
 */
export function toTextGrid({ durationSec, utterances = [], acoustic = null, markers = [] }) {
  const xmax = durationSec || 0;
  const tiers = [];
  const timed = utterances.filter((u) => u.start != null).sort((a, b) => a.start - b.start);
  const lastSpeech = acoustic && acoustic.speechSegments && acoustic.speechSegments.length
    ? acoustic.speechSegments[acoustic.speechSegments.length - 1].end : xmax;
  tiers.push(intervalTier('sozce', xmax, timed.map((u, i) => {
    const next = timed[i + 1];
    const text = `${u.speaker === 'examiner' ? 'T: ' : ''}${u.tokens.filter((t) => t.kind === 'word').map((t) => t.text).join(' ')}`;
    return { start: u.start, end: next ? next.start : Math.max(u.start + 0.5, lastSpeech), text };
  })));
  if (acoustic && acoustic.speechSegments) {
    tiers.push(intervalTier('konusma', xmax, [
      ...acoustic.speechSegments.map((s) => ({ start: s.start, end: s.end, text: 'ses' })),
      ...(acoustic.pauses || []).map((p) => ({ start: p.start, end: p.end, text: 'sessiz' })),
    ]));
    tiers.push(intervalTier('duraksama', xmax, (acoustic.pauses || []).map((p) => ({ start: p.start, end: p.end, text: `${p.dur.toFixed(2)} sn` }))));
  }
  tiers.push(pointTier('notlar', xmax, markers.map((m) => ({ t: m.t, text: m.text }))));
  const out = ['File type = "ooTextFile"', 'Object class = "TextGrid"', '', 'xmin = 0', `xmax = ${r(xmax)}`, 'tiers? <exists>', `size = ${tiers.length}`, 'item []:'];
  tiers.forEach((lines, i) => { out.push(`    item [${i + 1}]:`, ...lines); });
  return out.join('\n') + '\n';
}
