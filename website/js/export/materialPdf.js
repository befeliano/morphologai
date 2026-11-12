/**
 * Terapi materyali PDF'i (pdfmake). Her materyal türü aynı sayfa şablonunu kullanır:
 * başlık, danışan / tarih satırı, içerik, altbilgi (hazırlayan · MorphologAI).
 * Hedef ses renkle birlikte altı çizili basılır (siyah-beyaz yazıcıda da ayırt edilir).
 * Görseller çağıran tarafından JPEG/PNG data URL olarak verilir (pdfmake WebP desteklemez).
 */
import { loadPdfMake } from '../lib/cdn.js';
import { highlightParts } from '../core/text/phonetics.js';

const C = { primary: '#4f46e5', text: '#0f172a', muted: '#64748b', border: '#cbd5e1', hit: '#c2410c' };
const upper = (s) => String(s).toLocaleUpperCase('tr-TR');

const hl = (word, target, size) => (target
  ? { text: highlightParts(word, target).map((p) => (p.hit ? { text: p.text, color: C.hit, bold: true, decoration: 'underline' } : { text: p.text })), fontSize: size, alignment: 'center' }
  : { text: word, fontSize: size, alignment: 'center' });

const boxLayout = { hLineColor: () => C.border, vLineColor: () => C.border, hLineWidth: () => 0.8, vLineWidth: () => 0.8, paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 4, paddingRight: () => 4 };

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
const padRow = (row, n, fill = '') => [...row, ...new Array(n - row.length).fill(fill)];

function cardCell(item, images, target, imgSize, fontSize, showText = true) {
  const img = item.mediaId && images.get(item.mediaId);
  const stack = [];
  if (img) stack.push({ image: img, fit: [imgSize, imgSize], alignment: 'center', margin: [0, 0, 0, 4] });
  else stack.push({ text: ' ', fontSize: 4, margin: [0, imgSize / 3, 0, imgSize / 3] });
  if (showText) stack.push(hl(item.text, target, fontSize));
  return { stack, unbreakable: true };
}

function cardsGrid(items, images, target, cols) {
  const w = Math.floor(500 / cols);
  const imgSize = Math.min(w - 16, cols <= 3 ? 130 : 95);
  return {
    table: { widths: new Array(cols).fill('*'), body: chunk(items, cols).map((r) => padRow(r.map((it) => cardCell(it, images, target, imgSize, cols <= 3 ? 16 : 13)), cols)), dontBreakRows: true },
    layout: boxLayout,
  };
}

function gridTable(grid, cell = 22, marks = null) {
  return {
    table: {
      widths: new Array(grid[0].length).fill(cell), heights: cell,
      body: grid.map((row, r) => row.map((ch, c) => ({ text: ch || ' ', alignment: 'center', fontSize: Math.round(cell * 0.55), margin: [0, 2, 0, 0], fillColor: marks && marks.has(`${r},${c}`) ? '#fde68a' : null }))),
    },
    layout: { ...boxLayout, paddingTop: () => 1, paddingBottom: () => 1, paddingLeft: () => 0, paddingRight: () => 0 },
    alignment: 'center',
  };
}

const BUILDERS = {
  cards: (c, images) => [cardsGrid(c.items, images, c.target, c.columns || 3)],
  list: (c) => [{ columns: chunk(c.items, Math.ceil(c.items.length / 2) || 1).map((col) => ({ stack: col.map((it, i) => ({ ...hl(it.text, c.target, 15), alignment: 'left', margin: [0, 4, 0, 4] })) })), columnGap: 30 }],
  worksheet: (c, images) => [{
    table: {
      widths: new Array(3).fill('*'),
      body: chunk(c.items, 3).map((r) => padRow(r.map((it) => {
        const cell = cardCell(it, images, null, 95, 13, false);
        cell.stack.push({ text: it.blank, fontSize: 17, alignment: 'center', characterSpacing: 2 });
        return cell;
      }), 3)),
      dontBreakRows: true,
    },
    layout: boxLayout,
  }, { text: `Eksik harfi yazın. Hedef ses: ${c.target || '—'}`, style: 'help', margin: [0, 10, 0, 0] }],
  pairs: (c, images) => [{
    table: {
      widths: ['*', '*'],
      body: c.pairs.map((p) => [cardCell(p.a, images, c.a, 120, 18), cardCell(p.b, images, c.b, 120, 18)]),
      dontBreakRows: true,
    },
    layout: boxLayout,
  }],
  phrases: (c, images) => [{
    table: {
      widths: ['*', '*'],
      body: chunk(c.items, 2).map((r) => padRow(r.map((it) => ({
        stack: [
          { columns: [it.first, it.second].map((x) => (x.mediaId && images.get(x.mediaId) ? { image: images.get(x.mediaId), fit: [80, 80], alignment: 'center' } : { text: '' })), columnGap: 6 },
          { ...hl(it.text, c.target, 16), margin: [0, 6, 0, 0] },
        ],
        unbreakable: true,
      })), 2)),
      dontBreakRows: true,
    },
    layout: boxLayout,
  }],
  matching: (c, images) => [{
    columns: [
      { width: '*', stack: c.left.map((it, i) => ({ columns: [{ text: `${i + 1}.`, width: 22, fontSize: 14 }, { text: it.text, fontSize: 16 }, { text: '●', width: 14, alignment: 'right' }], margin: [0, 26, 0, 26] })) },
      { width: 90, text: '' },
      { width: '*', stack: c.right.map((it) => ({ columns: [{ text: '●', width: 14 }, it.mediaId && images.get(it.mediaId) ? { image: images.get(it.mediaId), fit: [70, 70] } : { text: it.text, fontSize: 16, margin: [0, 26, 0, 26] }] , margin: [0, 2, 0, 2] })) },
    ],
  }, { text: 'Sözcüğü resmiyle çizgi çizerek eşleştirin.', style: 'help', margin: [0, 12, 0, 0] }],
  wordsearch: (c, images, answers) => {
    const marks = answers ? new Set(c.placements.flatMap((p) => Array.from({ length: p.word.length }, (_, i) => `${p.row + p.dr * i},${p.col + p.dc * i}`))) : null;
    const cell = Math.min(26, Math.floor(480 / c.size));
    return [
      { columns: [{ width: '*', text: '' }, { width: 'auto', ...gridTable(c.grid, cell, marks) }, { width: '*', text: '' }] },
      { text: 'Aranan sözcükler', style: 'h3', margin: [0, 14, 0, 4] },
      { text: c.placements.map((p) => upper(p.word)).join('   ·   '), fontSize: 13, lineHeight: 1.4 },
    ];
  },
  scramble: (c, images) => [{
    table: {
      widths: [70, '*', 170],
      body: c.items.map((it) => [
        it.mediaId && images.get(it.mediaId) ? { image: images.get(it.mediaId), fit: [56, 56], alignment: 'center' } : { text: '' },
        { text: it.scrambled, fontSize: 19, characterSpacing: 2, margin: [0, 16, 0, 0] },
        { text: '_'.repeat(Math.max(8, it.word.length * 2)), fontSize: 16, margin: [0, 18, 0, 0], color: C.muted },
      ]),
    },
    layout: 'noBorders',
  }, { text: 'Harfleri doğru sıraya koyup sözcüğü yazın.', style: 'help', margin: [0, 10, 0, 0] }],
  crossword: (c, images, answers) => {
    const cell = Math.min(28, Math.floor(480 / Math.max(c.cols, 8)));
    const at = new Map(c.cells.map((x) => [`${x.r},${x.c}`, x]));
    const body = Array.from({ length: c.rows }, (_, r) => Array.from({ length: c.cols }, (_, cc) => {
      const x = at.get(`${r},${cc}`);
      if (!x) return { text: ' ', border: [false, false, false, false] };
      return { stack: [{ text: x.num ? String(x.num) : ' ', fontSize: 6, color: C.muted }, { text: answers ? x.ch : ' ', fontSize: Math.round(cell * 0.45), alignment: 'center' }], border: [true, true, true, true] };
    }));
    const clue = (e) => (e.mediaId && images.get(e.mediaId)
      ? { columns: [{ text: `${e.num}.`, width: 18, bold: true }, { image: images.get(e.mediaId), fit: [44, 44] }], margin: [0, 2, 0, 2] }
      : { text: [{ text: `${e.num}. `, bold: true }, e.clue || `${e.word.length} harf`], margin: [0, 3, 0, 3] });
    const across = c.entries.filter((e) => e.dir === 'across');
    const down = c.entries.filter((e) => e.dir === 'down');
    return [
      { columns: [{ width: '*', text: '' }, { width: 'auto', table: { widths: new Array(c.cols).fill(cell), heights: cell, body }, layout: { hLineColor: () => C.text, vLineColor: () => C.text, hLineWidth: () => 0.8, vLineWidth: () => 0.8, paddingTop: () => 1, paddingBottom: () => 1, paddingLeft: () => 2, paddingRight: () => 2 } }, { width: '*', text: '' }] },
      { columns: [{ stack: [{ text: 'Soldan sağa', style: 'h3' }, ...across.map(clue)] }, { stack: [{ text: 'Yukarıdan aşağıya', style: 'h3' }, ...down.map(clue)] }], columnGap: 24, margin: [0, 14, 0, 0] },
    ];
  },
  maze: (c, images, answers) => c.items.flatMap((m, i) => {
    const marks = answers ? new Set(m.path.map(([r, cc]) => `${r},${cc}`)) : new Set([m.path[0].join(',')]);
    return [
      { columns: [{ width: '*', text: '' }, { width: 'auto', ...gridTable(m.grid, 30, marks) }, { width: '*', text: '' }], margin: [0, i ? 16 : 0, 0, 0], unbreakable: true },
      { text: `${m.word.length} harfli sözcüğü bulun: renkli kareden başlayıp yan yana harfleri izleyin.${m.hint ? ` İpucu: ${m.hint}` : ''}`, style: 'help', alignment: 'center', margin: [0, 6, 0, 0] },
    ];
  }),
  stems: (c) => [
    { text: 'Nasıl oynanır?', style: 'h3' },
    { text: 'Bir oyuncu cümlenin başını okur ve yarıda bırakır; diğer oyuncu cümleyi dilediği gibi tamamlar. Sırayla devam edilir. Doğru ya da yanlış yanıt yoktur.', style: 'help', margin: [0, 0, 0, 10] },
    { ol: c.items.map((s) => ({ text: s.text, fontSize: 15, margin: [0, 7, 0, 7] })) },
  ],
  chat: (c) => [{
    table: {
      widths: ['*', '*'],
      body: chunk(c.items, 2).map((r) => padRow(r.map((it) => ({ text: it.text, fontSize: 15, alignment: 'center', margin: [6, 26, 6, 26] })), 2)),
      dontBreakRows: true,
    },
    layout: boxLayout,
  }, { text: 'Kartları kesip karıştırın. Sırayla bir kart çekilir ve soru yanıtlanır; yanıt uzunluğu danışanın hedefine göre ayarlanır.', style: 'help', margin: [0, 10, 0, 0] }],
  story: (c) => [
    { text: c.sentences.join(' '), fontSize: 15, lineHeight: 1.6, margin: [0, 0, 0, 14] },
    c.words?.length ? { text: [{ text: 'Hedef sözcükler: ', bold: true }, c.words.join(', ')], fontSize: 11, color: C.muted, margin: [0, 0, 0, 12] } : { text: '' },
    c.questions?.length ? { text: 'Sorular', style: 'h3' } : { text: '' },
    { ol: (c.questions || []).map((q) => ({ text: q.text, fontSize: 13, margin: [0, 6, 0, 16] })) },
  ],
  wh: (c, images) => c.items.map((it) => ({
    columns: [
      it.mediaId && images.get(it.mediaId) ? { image: images.get(it.mediaId), fit: [110, 110], width: 120 } : { text: it.text, fontSize: 18, bold: true, width: 120 },
      { stack: [{ text: it.mediaId && images.get(it.mediaId) ? it.text : '', fontSize: 13, color: C.muted }, ...it.questions.map((q) => ({ text: `• ${q.text}`, fontSize: 14, margin: [0, 5, 0, 5] }))] },
    ],
    columnGap: 14, margin: [0, 8, 0, 14], unbreakable: true,
  })),
};

/**
 * @param {object} p { kind, title, content, images: Map<mediaId, dataURL>, patientLabel, clinician, org, withAnswers }
 * @returns {Promise<Blob>}
 */
export async function buildMaterialPdf(p) {
  const pdfMake = await loadPdfMake();
  const images = p.images || new Map();
  const build = BUILDERS[p.kind];
  if (!build) throw new Error(`Bilinmeyen materyal türü: ${p.kind}`);
  const head = (suffix = '') => [
    { text: `${p.title || 'Terapi materyali'}${suffix}`, style: 'h1' },
    { columns: [{ text: p.patientLabel ? `Danışan: ${p.patientLabel}` : 'Ad: ______________________', style: 'meta' }, { text: `Tarih: ${p.date || '____ / ____ / ________'}`, style: 'meta', alignment: 'right' }], margin: [0, 4, 0, 4] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: C.primary }], margin: [0, 2, 0, 14] },
  ];
  const content = [...head(), ...build(p.content, images, false)];
  if (p.withAnswers && ['wordsearch', 'crossword', 'maze'].includes(p.kind)) {
    content.push({ text: '', pageBreak: 'after' }, ...head(' — çözüm anahtarı'), ...build(p.content, images, true));
  }
  const doc = {
    pageSize: 'A4', pageMargins: [40, 40, 40, 46],
    info: { title: p.title || 'Terapi materyali', creator: 'MorphologAI' },
    content,
    footer: (page, pages) => ({ columns: [{ text: [p.clinician, p.org].filter(Boolean).join(' · '), style: 'foot' }, { text: `MorphologAI · ${page}/${pages}`, style: 'foot', alignment: 'right' }], margin: [40, 14, 40, 0] }),
    styles: { h1: { fontSize: 20, bold: true, color: C.text }, h3: { fontSize: 12, bold: true, color: C.primary, margin: [0, 0, 0, 4] }, meta: { fontSize: 10, color: C.muted }, help: { fontSize: 10, color: C.muted, italics: true }, foot: { fontSize: 8, color: C.muted } },
    defaultStyle: { font: 'Roboto', fontSize: 11, color: C.text },
  };
  return new Promise((resolve, reject) => {
    try { pdfMake.createPdf(doc).getBlob(resolve); } catch (e) { reject(e); }
  });
}
