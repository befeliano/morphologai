/**
 * Klinik PDF raporu (pdfmake, Roboto yazı tipi — Türkçe karakterler tam desteklenir).
 */
import { loadPdfMake } from '../lib/cdn.js';
import { TAM_LABELS } from '../core/text/suffixes.js';
import { POS_LABEL } from '../core/text/lexicon.js';
import { TASK_TYPES, DIAGNOSES, ETIOLOGIES, SOURCES, labelOf } from '../app/constants.js';

const C = { primary: '#4f46e5', text: '#0f172a', muted: '#64748b', border: '#e2e8f0', soft: '#f1f5f9', ok: '#059669', warn: '#d97706', danger: '#dc2626' };
const fmt = (v, d = 2, unit = '') => (v == null || v === '' || Number.isNaN(v) ? '—' : `${typeof v === 'number' ? v.toLocaleString('tr-TR', { maximumFractionDigits: d }) : v}${unit ? ' ' + unit : ''}`);

function kvTable(rows) {
  return {
    table: {
      widths: ['*', 'auto'],
      body: rows.map(([k, v]) => [{ text: k, color: C.muted, fontSize: 9 }, { text: String(v), bold: true, fontSize: 9, alignment: 'right' }]),
    },
    layout: { hLineColor: () => C.border, vLineWidth: () => 0, hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5), paddingTop: () => 3, paddingBottom: () => 3 },
  };
}

function section(title) {
  return { text: title, style: 'h2', margin: [0, 14, 0, 6] };
}

/**
 * @param {object} p { session, patient, analysis (tam sonuç), acoustic, org, clinician, charts: {pos, f0, pauses} (dataURL), anonymize }
 */
export async function buildSessionPdf(p) {
  const pdfMake = await loadPdfMake();
  const { session, patient, analysis: a, org, clinician, charts = {}, anonymize = false } = p;
  const L = a.language;
  const F = a.fluency;
  const S = a.screening;
  const date = new Date(session.recordedAt || session.createdAt);
  const content = [];

  content.push({
    columns: [
      [{ text: 'MorphologAI', color: C.primary, bold: true, fontSize: 11 }, { text: 'Konuşma ve Dil Analizi Raporu', style: 'h1' }],
      [{ text: org?.name || '', alignment: 'right', color: C.muted, fontSize: 9 },
        { text: `Rapor: ${new Date().toLocaleString('tr-TR')}`, alignment: 'right', color: C.muted, fontSize: 9 },
        { text: clinician ? `Hazırlayan: ${clinician}` : '', alignment: 'right', color: C.muted, fontSize: 9 }],
    ],
  });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 1, lineColor: C.primary }], margin: [0, 2, 0, 8] });

  const age = patient?.birthYear ? date.getFullYear() - Number(patient.birthYear) : null;
  content.push({
    columns: [
      [section('Danışan'), kvTable([
        ['Kod', patient?.code || '—'],
        ...(anonymize ? [] : [['Ad Soyad', patient?.fullName || '—']]),
        ['Yaş / Cinsiyet', `${age ?? '—'} / ${patient?.sex || '—'}`],
        ['Grup', patient?.group === 'control' ? 'Kontrol' : 'Danışan'],
        ['Tanı', labelOf(DIAGNOSES, patient?.diagnosis) || '—'],
        ['Etiyoloji', labelOf(ETIOLOGIES, patient?.etiology) || '—'],
        ['Eğitim (yıl)', patient?.education ?? '—'],
      ])],
      { width: 20, text: '' },
      [section('Seans'), kvTable([
        ['Tarih', date.toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })],
        ['Görev', labelOf(TASK_TYPES, session.taskType) || '—'],
        ['Görev ayrıntısı', session.taskDetail || '—'],
        ['Kaynak', labelOf(SOURCES, session.source) || '—'],
        ['Süre', F ? fmt(F.durationSec, 1, 'sn') : session.audioMeta?.durationSec ? fmt(session.audioMeta.durationSec, 1, 'sn') : '—'],
        ['Durum', session.status === 'verified' ? 'Transkript doğrulandı' : 'Taslak (doğrulanmadı)'],
      ])],
    ],
  });

  content.push(section('Temel ölçütler'));
  const leftRows = [
    ['Sözce (dahil / toplam)', `${L.utterances.included} / ${L.utterances.total}`],
    ['Üretilen sözcük', L.words.produced],
    ['MLU-m (biçimbirim / sözce)', fmt(L.mluM)],
    ['MLU-w (sözcük / sözce)', fmt(L.mluW)],
    ['Sözcük başına biçimbirim', fmt(L.morphemesPerWord)],
    ['TTR (biçim / kök)', `${fmt(L.ttrForm, 3)} / ${fmt(L.ttrLemma, 3)}`],
    [`MATTR (${L.mattrWindow})`, fmt(L.mattrForm, 3)],
    ['İsim / fiil oranı', fmt(L.nounVerbRatio)],
    ['Sözce başına çekimli fiil', fmt(L.verbs.finitePerUtterance)],
    ['Yüklemli sözce oranı', L.verbs.utterancesWithPredicate != null ? `%${fmt(L.verbs.utterancesWithPredicate * 100, 0)}` : '—'],
  ];
  const rightRows = F ? [
    ['Konuşma hızı', fmt(F.sps, 2, 'hece/sn')],
    ['Artikülasyon hızı', fmt(F.articulationRate, 2, 'hece/sn')],
    ['Sözcük / dakika', fmt(F.wpm, 1)],
    ['Ortalama akış uzunluğu', fmt(F.mlrSyll, 1, 'hece')],
    ['Duraksama sayısı (≥0,25 sn)', `${F.pauseCount} (${fmt(F.pausesPerMin)}/dk)`],
    ['Ortalama / en uzun duraksama', `${fmt(F.meanPause)} / ${fmt(F.maxPause)} sn`],
    [`Uzun duraksama (≥${F.longPauseThresholdSec} sn)`, `${F.longPauses} (${fmt(F.longPausesPerMin)}/dk)`],
    ['Duraksama oranı', `%${fmt(F.pauseRatio * 100, 1)}`],
    ['Dolgu / tekrar (100 sözcükte)', `${fmt(L.disfluency.fillerRate, 1)} / ${fmt(L.disfluency.repetitionRate, 1)}`],
    ['Kodlanmış parafazi (100 sözcükte)', fmt(L.errors.rate, 1)],
  ] : [
    ['Akustik ölçüm', 'Ses kaydı yok'],
    ['Dolgu (100 sözcükte)', fmt(L.disfluency.fillerRate, 1)],
    ['Tekrar/düzeltme (100 sözcükte)', fmt(L.disfluency.repetitionRate, 1)],
    ['Kodlanmış parafazi', `${L.errors.total} (${fmt(L.errors.rate, 1)}/100)`],
    ['Sözlük dışı sözcük', `${L.errors.unknownWords}`],
    ['Boş sözcük (100 sözcükte)', fmt(L.lexical.emptyRate, 1)],
    ['Kelime bulma yorumu', L.lexical.wordFindingComments],
  ];
  content.push({ columns: [kvTable(leftRows), { width: 20, text: '' }, kvTable(rightRows)] });

  if (p.acoustic && p.acoustic.f0) {
    const f0 = p.acoustic.f0;
    content.push({ text: `Temel frekans (F0): ortalama ${fmt(f0.mean, 1)} Hz, SS ${fmt(f0.sd, 1)} Hz, aralık ${fmt(f0.rangeSt, 1)} yarım ton · Kayıt kalitesi: ${p.acoustic.quality?.level || '—'} (SNR ≈ ${fmt(p.acoustic.quality?.snrDb, 0)} dB)`, fontSize: 8.5, color: C.muted, margin: [0, 6, 0, 0] });
  }

  if (S && S.available) {
    content.push(section('Afazi tarama göstergesi (deneysel)'));
    const tone = { ok: C.ok, info: C.primary, warn: C.warn, danger: C.danger }[S.band.tone];
    content.push({
      columns: [
        { width: 110, stack: [{ text: String(S.overall), fontSize: 30, bold: true, color: tone }, { text: '/ 100', color: C.muted, fontSize: 9 }] },
        { stack: [
          { text: S.band.label, bold: true, color: tone, fontSize: 11 },
          { text: `Olası örüntü: ${S.pattern.label}`, fontSize: 10, margin: [0, 2, 0, 2] },
          { text: S.pattern.description, fontSize: 8.5, color: C.muted },
          { text: `Alanlar — ${Object.values(S.domains).map((d) => `${d.label}: ${d.available ? d.score : '—'}`).join(' · ')}`, fontSize: 8.5, margin: [0, 4, 0, 0] },
          { text: `Örnek yeterliliği: ${S.adequacy.level} · Güven: ${S.confidence} · Referans: ${S.normsSource}`, fontSize: 8, color: C.muted, margin: [0, 2, 0, 0] },
        ] },
      ],
    });
    if (S.topFindings.length) {
      content.push({
        margin: [0, 6, 0, 0],
        table: {
          widths: ['*', 70, 90, 45],
          body: [
            [{ text: 'Katkı yapan bulgu', bold: true, fontSize: 8.5 }, { text: 'Değer', bold: true, fontSize: 8.5 }, { text: 'Referans (ort ± SS)', bold: true, fontSize: 8.5 }, { text: 'z', bold: true, fontSize: 8.5 }],
            ...S.topFindings.map((f) => [
              { text: f.label, fontSize: 8.5 },
              { text: f.pct ? `%${fmt(f.value * 100, 0)}` : fmt(f.value), fontSize: 8.5 },
              { text: f.pct ? `%${fmt(f.ref.mean * 100, 0)} ± ${fmt(f.ref.sd * 100, 0)}` : `${fmt(f.ref.mean)} ± ${fmt(f.ref.sd)}`, fontSize: 8.5 },
              { text: fmt(f.z, 1), fontSize: 8.5 },
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      });
    }
    content.push({ text: S.disclaimer, fontSize: 7.5, italics: true, color: C.muted, margin: [0, 6, 0, 0] });
  }

  const imgs = [];
  if (charts.pos) imgs.push({ image: charts.pos, width: 250 });
  if (charts.tense) imgs.push({ image: charts.tense, width: 250 });
  if (imgs.length) content.push(section('Grafikler'), { columns: imgs, columnGap: 12 });
  const imgs2 = [];
  if (charts.f0) imgs2.push({ image: charts.f0, width: 250 });
  if (charts.pauses) imgs2.push({ image: charts.pauses, width: 250 });
  if (imgs2.length) content.push({ columns: imgs2, columnGap: 12, margin: [0, 8, 0, 0] });

  const tense = L.verbs.tense || {};
  if (Object.keys(tense).length) {
    content.push(section('Fiil çekimi'));
    content.push({
      table: {
        widths: ['*', 60],
        body: [[{ text: 'Zaman / kip', bold: true, fontSize: 8.5 }, { text: 'Sayı', bold: true, fontSize: 8.5 }],
          ...Object.entries(tense).sort((x, y) => y[1] - x[1]).map(([k, v]) => [{ text: TAM_LABELS[k] || k, fontSize: 8.5 }, { text: String(v), fontSize: 8.5 }])],
      },
      layout: 'lightHorizontalLines',
    });
  }

  content.push({ text: 'Transkript', style: 'h2', margin: [0, 14, 0, 6], pageBreak: 'before' });
  a.utterances.forEach((u, i) => {
    const words = u.tokens.map((t) => {
      if (t.kind === 'word') return { text: t.text + ' ', color: t.excluded ? C.muted : t.error ? C.danger : C.text, decoration: t.excluded ? 'lineThrough' : undefined };
      if (t.kind === 'filler') return { text: `${t.text} `, color: C.muted, italics: true };
      if (t.kind === 'pause') return { text: `${t.pause} `, color: C.muted };
      if (t.kind === 'unintelligible') return { text: 'xxx ', color: C.warn };
      if (t.kind === 'fragment') return { text: `${t.text}- `, color: C.muted };
      return { text: '' };
    });
    content.push({
      columns: [
        { width: 24, text: `${i + 1}.`, color: C.muted, fontSize: 8.5 },
        { width: 20, text: u.speaker === 'examiner' ? 'T' : '', color: C.muted, fontSize: 8.5 },
        { text: words, fontSize: 9.5 },
        { width: 60, text: u.speaker === 'examiner' ? 'terapist' : u.included ? `${u.wordsIncluded} s · ${u.morphemesIncluded} b` : 'dışı', fontSize: 8, color: C.muted, alignment: 'right' },
      ],
      margin: [0, 1.5, 0, 1.5],
    });
  });

  const seen = new Set();
  const rows = [];
  for (const u of a.utterances) {
    if (u.speaker === 'examiner') continue;
    for (const t of u.tokens) {
      if (t.kind !== 'word' || !t.a || seen.has(t.norm)) continue;
      seen.add(t.norm);
      rows.push([
        { text: t.text, fontSize: 8.5, bold: true },
        { text: t.a.morphemes.map((m, k) => (k ? '-' : '') + m.display).join(' + '), fontSize: 8.5 },
        { text: t.a.morphemes.slice(1).map((m) => m.label).join('; ') || 'kök', fontSize: 7.5, color: C.muted },
        { text: POS_LABEL[t.a.pos] || t.a.pos, fontSize: 8.5 },
        { text: String(t.a.morphemeCount), fontSize: 8.5, alignment: 'center' },
      ]);
      if (rows.length >= 250) break;
    }
  }
  if (rows.length) {
    content.push(section('Biçimbirim çözümlemesi (farklı sözcükler)'));
    content.push({
      table: { headerRows: 1, widths: [70, 110, '*', 55, 30], body: [[
        { text: 'Sözcük', bold: true, fontSize: 8.5 }, { text: 'Kök + ekler', bold: true, fontSize: 8.5 },
        { text: 'Ek işlevleri', bold: true, fontSize: 8.5 }, { text: 'Tür', bold: true, fontSize: 8.5 }, { text: 'B.', bold: true, fontSize: 8.5 }], ...rows] },
      layout: 'lightHorizontalLines',
    });
  }
  if (session.notes) content.push(section('Klinisyen notları'), { text: session.notes, fontSize: 9.5 });

  const doc = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: { title: `MorphologAI raporu ${patient?.code || ''}`, author: clinician || 'MorphologAI', creator: 'MorphologAI' },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: C.text, lineHeight: 1.15 },
    styles: { h1: { fontSize: 17, bold: true }, h2: { fontSize: 11.5, bold: true, color: C.primary } },
    content,
    footer: (page, pages) => ({
      columns: [
        { text: `MorphologAI · ${a.engine} · Bu rapor klinik karar desteği içindir, tanı yerine geçmez.`, fontSize: 7, color: C.muted, margin: [40, 10, 0, 0] },
        { text: `${page} / ${pages}`, alignment: 'right', fontSize: 8, color: C.muted, margin: [0, 10, 40, 0] },
      ],
    }),
  };
  return pdfMake.createPdf(doc);
}
