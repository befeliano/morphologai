/** Seans özet görünümleri: tarama göstergesi, ölçüt ızgarası, akıcılık (kekemelik) kartları. */
import { h, icon, num, pct, tip, badge } from '../ui/dom.js';
import { EXCLUSION_LABELS } from '../../core/metrics/language.js';
import { STUTTER_LABELS } from '../../core/metrics/stuttering.js';

const TONE_ICON = { ok: 'checkCircle', info: 'info', warn: 'alert', danger: 'alertCircle' };

/**
 * Akıcılık ve ses profili — her ses kaydında gösterilir (transkript gerekmez).
 * @param {object} acoustic seansın akustik özeti
 * @param {object} F akıcılık ölçütleri (transkript varsa sözcük/hece hızlarını da içerir)
 */
export function speechProfileCard(acoustic, F, { title = 'Akıcılık ve ses', sub = 'her ses kaydında ölçülür' } = {}) {
  if (!acoustic) return null;
  const f0 = acoustic.f0;
  const m = (label, value, unit, note) => h('div.metric', null, h('div.m-label', null, label), h('div.m-value', null, value, unit ? h('small', null, unit) : null), note ? h('div.m-note', null, note) : null);
  const speakPct = F && F.pauseRatio != null ? 100 * (1 - F.pauseRatio) : null;
  return h('div.card', null,
    h('div.card-head', null, h('h3', null, icon('activity', 17), title), h('span.sub', null, sub)),
    h('div.card-body', null,
      h('div.metric-grid', null,
        F?.wpm != null ? m('Sözcük/dakika', num(F.wpm, 0), '', 'transkriptten') : null,
        F?.sps != null ? m('Konuşma hızı', num(F.sps, 2), 'hece/sn') : null,
        F ? m('Konuşma oranı', speakPct != null ? `%${num(speakPct, 0)}` : '—', '', 'duraksamalar dışındaki süre') : null,
        F ? m('Duraksama', num(F.pausesPerMin, 1), '/dk', `${F.pauseCount} duraksama · ort. ${num(F.meanPause, 2)} sn`) : null,
        F ? m('Uzun duraksama', num(F.longPausesPerMin, 2), '/dk', `≥ ${num(F.longPauseThresholdSec, 1)} sn · ${F.longPauses} kez`) : null,
        F ? m('Konuşma akışı', num(F.runs, 0), '', F.mlrSyll != null ? `ort. ${num(F.mlrSyll, 1)} hece` : 'duraksamalarla ayrılan bölüm') : null,
        f0 ? m('F0 ortalama', num(f0.mean, 0), 'Hz', `ortanca ${num(f0.median, 0)} Hz`) : m('F0', '—', '', 'perde ölçülemedi'),
        f0 ? m('F0 aralığı', num(f0.rangeSt, 1), 'yarım ton', `5.–95. yüzdelik: ${num(f0.p5, 0)}–${num(f0.p95, 0)} Hz`) : null,
        acoustic.intensity ? m('Şiddet ort.', num(acoustic.intensity.meanDb, 0), 'dBFS', 'kayıt düzeyine bağlıdır') : null),
      F?.wpm == null ? h('p.tiny.muted.mt-2', null, 'Sözcük/dakika ve hece hızları için transkript gerekir; duraksama ve ses frekansı doğrudan kayıttan ölçülür.') : null));
}
const METER_CLASS = (score) => (score < 20 ? 'good' : score < 40 ? 'warning' : score < 65 ? 'serious' : 'critical');

function gauge(score) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 200 118');
  const arc = (from, to, color, w = 16) => {
    const a0 = Math.PI * (1 - from / 100);
    const a1 = Math.PI * (1 - to / 100);
    const r = 82;
    const cx = 100;
    const cy = 100;
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`);
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', w);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);
  };
  arc(0.5, 99.5, 'var(--surface-3)');
  const color = score < 20 ? 'var(--status-good)' : score < 40 ? 'var(--status-warning)' : score < 65 ? 'var(--status-serious)' : 'var(--status-critical)';
  if (score > 0.5) arc(0.5, Math.min(99.5, score), color);
  return h('div.gauge', null, svg, h('div.g-val', null, String(score), h('small', null, '/ 100')));
}

export function screeningCard(S, { acousticMissing = false } = {}) {
  if (!S || !S.available) {
    return h('div.card', null, h('div.card-head', null, h('h2', null, icon('gauge', 18), 'Afazi tarama göstergesi')),
      h('div.card-body', null, h('div.callout.info', null, icon('info', 18), h('div', null, S?.reason || 'Tarama için yeterli veri yok.'))));
  }
  const domains = Object.entries(S.domains).map(([, d]) => h('div.domain', null,
    h('div.d-label', null, d.label),
    d.available ? h(`div.meter.${METER_CLASS(d.score)}`, null, h('span', { style: { width: `${Math.max(2, d.score)}%` } })) : h('div.small.faint', null, 'veri yok (ses kaydı gerekir)'),
    h('div.d-val', null, d.available ? d.score : '—')));
  const findings = S.topFindings.length
    ? S.topFindings.map((f) => h('div.finding', null,
      h('div', null, h('div', null, f.label), h('div.f-ref', null, `Referans ${f.pct ? pct(f.ref.mean) + ' ± ' + pct(f.ref.sd) : num(f.ref.mean) + ' ± ' + num(f.ref.sd)} ${f.unit || ''} · z = ${num(f.z, 1)}${f.ref.n ? ` · kontrol n=${f.ref.n}` : ''}`)),
      h('div.f-val', null, f.pct ? pct(f.value) : num(f.value))))
    : [h('p.small.muted', null, 'Belirgin sapma gösteren ölçüt yok.')];
  return h('div.card', null,
    h('div.card-head', null, h('h2', null, icon('gauge', 18), 'Afazi tarama göstergesi'), h('span.badge.outline', null, 'deneysel · tanı değildir')),
    h('div.card-body', null,
      h('div.screen-hero', null,
        gauge(S.overall),
        h('div', null,
          h(`div.band.${S.band.tone}`, null, icon(TONE_ICON[S.band.tone], 20), S.band.label),
          h('div', { style: { fontWeight: 600, marginTop: '8px' } }, S.pattern.label),
          h('p.small.muted', { style: { marginTop: '4px' } }, S.pattern.description),
          h('div.row.mt-2', null,
            badge(`Örnek: ${S.adequacy.level}`, S.adequacy.level === 'yeterli' ? 'ok' : S.adequacy.level === 'sınırlı' ? 'warn' : 'danger'),
            badge(`Güven: ${S.confidence}`),
            badge(`Referans: ${S.normsSource}`)))),
      h('div.mt-3', null, domains),
      acousticMissing ? h('div.callout.info.mt-2', null, icon('info', 18), h('div', null, 'Ses kaydı olmadığından akıcılık alanı hesaplanamadı; gösterge dil alanlarına dayanıyor.')) : null,
      h('div.mt-3', null, h('div.tiny.muted', { style: { fontWeight: 600, marginBottom: '4px' } }, 'KATKI YAPAN BULGULAR'), findings),
      h('p.tiny.muted.mt-2', null, S.disclaimer)));
}

function metricBox(label, value, note, help, hero = false) {
  return h(`div.metric${hero ? '.hero' : ''}`, null,
    h('div.m-label', null, label, help ? tip(help) : null),
    h('div.m-value', null, value),
    note ? h('div.m-note', null, note) : null);
}

export function languageMetricGrid(L, F) {
  const items = [
    ['MLU-m', num(L.mluM), `SS ${num(L.mluMsd)} · en uzun ${L.maxUtteranceM}`, 'Sözce başına ortalama biçimbirim: kök = 1, her çekim eki +1. Türkçe için birincil MLU ölçütü.', true],
    ['MLU-w', num(L.mluW), `SS ${num(L.mluWsd)}`, 'Sözce başına ortalama sözcük sayısı.'],
    ['Sözce', `${L.utterances.included} / ${L.utterances.total}`, 'dahil / toplam', 'Yarım, anlaşılmayan ve tek sözcüklük evet/hayır sözceleri MLU dışında tutulur (ayarlanabilir).'],
    ['Sözcük', num(L.words.produced, 0), `${num(L.words.syllables, 0)} hece`, 'Tekrarlar ve dolgular hariç üretilen sözcükler.'],
    ['Sözcük başına biçimbirim', num(L.morphemesPerWord), '', 'Biçimbirimsel karmaşıklık göstergesi.'],
    ['MATTR', L.mattrForm != null ? num(L.mattrForm, 3) : '—', `pencere ${L.mattrWindow}${L.mattrForm == null ? ' · yetersiz örnek' : ''}`, 'Kayan pencereli sözcük çeşitliliği (örnek uzunluğundan bağımsız).'],
    ['TTR (biçim / kök)', `${num(L.ttrForm, 3)} / ${num(L.ttrLemma, 3)}`, '', 'Farklı sözcük / toplam sözcük; kısa örneklerde yüksek çıkar.'],
    ['İsim / fiil', num(L.nounVerbRatio), `${L.pos.noun || 0} isim · ${L.verbs.total} fiil`, 'Agramatik konuşmada artar, anomide azalır.'],
    ['Çekimli fiil / sözce', num(L.verbs.finitePerUtterance), `${L.verbs.finite} çekimli · ${L.verbs.nonfinite} fiilimsi`, 'Sözce başına çekimli fiil sayısı.'],
    ['Yüklemli sözce', pct(L.verbs.utterancesWithPredicate), '', 'Çekimli fiil ya da ek-fiil içeren sözce oranı.'],
    ['Zaman/kişi çeşitliliği', num(L.verbs.inflectionDiversity, 0), 'farklı çekim', 'Farklı zaman-kişi-olumsuzluk birleşimi sayısı.'],
    ['Hâl eki çeşitliliği', num(L.nouns.caseDiversity, 0), `${pct(L.nouns.inflectedRatio)} çekimli ad`, 'Kullanılan farklı hâl eki sayısı.'],
    ['Dolgu', num(L.disfluency.fillerRate, 1), '100 sözcükte', 'ııı, eee ve söylem belirleyicileri (yani, işte, şey).'],
    ['Tekrar / düzeltme', num(L.disfluency.repetitionRate, 1), `${L.disfluency.repetitions} tekrar · ${L.disfluency.retracings} düzeltme`, '[/] ve [//] kodları ile otomatik ardışık tekrarlar.'],
    ['Parafazi (kodlanmış)', num(L.errors.rate, 1), `${L.errors.total} hata · 100 sözcükte`, '[* s] anlamsal, [* p] fonolojik, [* n] neolojizm, [* m] biçimbirimsel.'],
    ['Sözlük dışı sözcük', num(L.errors.unknownRate, 1), `${L.errors.unknownWords} sözcük`, 'Sözlükte bulunmayan sözcükler: olası neolojizm, yazım hatası ya da özel ad.'],
    ['Boş sözcük', num(L.lexical.emptyRate, 1), '100 sözcükte', '"şey", "zımbırtı", "falan" gibi içeriksiz sözcükler — adlandırma güçlüğü göstergesi.'],
    ['Kelime bulma yorumu', num(L.lexical.wordFindingComments, 0), 'sözce', '"adı neydi", "aklıma gelmiyor" gibi üstdilsel yorumlar.'],
  ];
  const fl = F ? [
    ['Konuşma hızı', num(F.sps), 'hece/sn', 'Hece / konuşma aralığı süresi (duraksamalar dahil).'],
    ['Artikülasyon hızı', num(F.articulationRate), 'hece/sn', 'Hece / fonasyon süresi (duraksamalar hariç).'],
    ['Sözcük / dakika', num(F.wpm, 0), '', 'Üretilen sözcük / konuşma aralığı (dk).'],
    ['Ort. akış uzunluğu', num(F.mlrSyll, 1), `hece · ${F.runs} akış`, 'Duraksamalarla ayrılan konuşma bölümlerinin ortalama hece sayısı (MLR).'],
    ['Duraksama', `${F.pauseCount}`, `${num(F.pausesPerMin)}/dk · ort. ${num(F.meanPause)} sn`, 'Konuşma aralığındaki eşik üstü (varsayılan ≥ 0,25 sn) sessizlikler.'],
    ['Uzun duraksama', `${F.longPauses}`, `≥ ${num(F.longPauseThresholdSec, 1)} sn · ${num(F.longPausesPerMin)}/dk`, 'Uzun sessizlikler; kelime bulma güçlüğü ve akıcılık göstergesi.'],
    ['Duraksama oranı', pct(F.pauseRatio, 1), `en uzun ${num(F.maxPause)} sn`, 'Konuşma aralığında sessizliğin oranı.'],
  ] : [];
  return h('div.metric-grid', null, [...items.slice(0, 2), ...fl, ...items.slice(2)].map(([l, v, n, help, hero]) => metricBox(l, v, n, help, hero)));
}

export function exclusionSummary(L) {
  const ex = Object.entries(L.utterances.excluded).filter(([, n]) => n > 0);
  if (!ex.length && !L.utterances.examiner) return null;
  return h('div.small.muted', null, 'MLU dışında tutulan sözceler: ',
    ex.map(([k, n]) => `${EXCLUSION_LABELS[k]} (${n})`).join(', ') || '—',
    L.utterances.examiner ? ` · ${L.utterances.examiner} terapist sözcesi` : '');
}

export function stutteringCard(St, F) {
  if (!St) return null;
  const toneCls = { ok: 'ok', info: 'info', warn: 'warn', danger: 'danger' }[St.band.tone];
  const rows = Object.entries(St.counts).filter(([, n]) => n > 0).map(([k, n]) => h('tr', null,
    h('td', null, STUTTER_LABELS[k]), h('td', null, ['PWR', 'MWR', 'PRO', 'BLK'].includes(k) ? badge('SLD', 'danger') : badge('OD')), h('td.num', null, n)));
  return h('div.card', null,
    h('div.card-head', null, h('h2', null, icon('waves', 18), 'Akıcılık / takılma çözümlemesi')),
    h('div.card-body', null,
      h('div.screen-hero', null,
        h('div', { style: { textAlign: 'center' } }, h('div', { style: { fontSize: '44px', fontWeight: 700, letterSpacing: '-.03em' } }, `%${num(St.percentSS, 1)}`), h('div.small.muted', null, 'takılmalı hece (%SS)')),
        h('div', null,
          h(`div.band.${toneCls}`, null, icon(TONE_ICON[St.band.tone], 20), St.band.label),
          h('p.small.muted.mt-1', null, St.meetsCriterion ? '100 hecede 3 ya da daha fazla kekemeliğe özgü takılma (SLD): kekemelik ile uyumlu sıklık.' : '100 hecede 3\'ten az kekemeliğe özgü takılma.'),
          h('div.row.mt-2', null, badge(`${num(St.syllables, 0)} hece`), badge(`SLD ${num(St.sldPer100, 1)}/100`), badge(`OD ${num(St.odPer100, 1)}/100`)))),
      h('div.metric-grid.mt-3', null,
        metricBox('SLD / 100 hece', num(St.sldPer100, 2), `${St.sld} olay`, 'Kekemeliğe özgü takılmalar: parça sözcük tekrarı, tek heceli sözcük tekrarı, uzatma, blok.'),
        metricBox('Diğer akıcısızlık / 100', num(St.odPer100, 2), `${St.od} olay`, 'Dolgu, düzeltme, çok heceli sözcük ve öbek tekrarı.'),
        metricBox('SLD oranı', pct(St.sldRatio), 'tüm takılmalar içinde', 'Kekemeliğe özgü takılmaların tüm akıcısızlıklar içindeki payı.'),
        metricBox('Ort. tekrar birimi', num(St.meanRepetitionUnits, 2), '', 'Tekrar olaylarında ortalama yineleme sayısı (b-b-bebek = 2).'),
        metricBox('Ağırlıklı SLD', num(St.weightedSld, 1), 'Yairi & Ambrose', '(PWR + MWR) × tekrar birimi + 2 × (uzatma + blok).'),
        F ? metricBox('Konuşma hızı', num(F.sps), 'hece/sn', '') : null,
        F ? metricBox('Artikülasyon hızı', num(F.articulationRate), 'hece/sn', '') : null),
      rows.length ? h('div.table-wrap.mt-3', null, h('table.table', null, h('thead', null, h('tr', null, h('th', null, 'Takılma türü'), h('th', null, 'Sınıf'), h('th.num', null, 'Sayı'))), h('tbody', null, rows))) : h('p.small.muted.mt-2', null, 'Kodlanmış takılma yok.'),
      h('div.callout.info.mt-3', null, icon('info', 18), h('div', null,
        h('b', null, 'Kodlama: '), 'parça tekrarı ', h('code.mono', null, 'b-b-bebek'), ', uzatma ', h('code.mono', null, 's:u'), ' ya da ', h('code.mono', null, 'sssu'), ', blok ', h('code.mono', null, 'sözcük [blk]'),
        ', sözcük tekrarı ', h('code.mono', null, 'ben ben ben'), '. Otomatik konuşma tanıma takılmaları çoğunlukla yazmaz; %SS için transkripti dinleyerek kodlayın. Değerlendirme için SSI-4 gibi standart araçlarla birlikte yorumlayın.'))));
}
