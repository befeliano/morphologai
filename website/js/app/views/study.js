/**
 * Öngörü çalışması — genel bakış: örneklemler, izlem takvimi, tahmin doğruluğu (program ve DKT),
 * program–DKT uyumu, Venn özeti ve araştırma dışa aktarımı.
 */
import { h, mount, icon, num, badge, toast, modal, emptyState, fmtDate, download } from '../ui/dom.js';
import { labelOf, DIAGNOSES, GROUPS } from '../constants.js';
import { scatterChart } from '../ui/charts.js';
import { CLINICAL_ITEMS, FEATURE_DEFS } from '../../core/metrics/prognosis.js';
import { predictionMetrics, weightedKappa, fleissKappa, kappaLabel, pearson } from '../../core/metrics/studyStats.js';
import { ageAt } from '../../core/metrics/cohort.js';
import { csvSafeText } from '../../export/csv.js';
import { loadStudyContext, computeStudy, aiSnapshot, updateStudy, ratingSummary, dueDate, isStudy, OUTCOMES, OUTCOME_CATEGORIES, PROTOCOL_ID } from '../study.js';

const pctTxt = (p) => (p == null ? '—' : `%${num(p * 100, 0)}`);

export async function render(root, _p, app) {
  app.setCrumbs([{ label: 'Öngörü çalışması' }]);
  const sctx = await loadStudyContext(app);
  const { byId } = sctx;
  const baselines = sctx.study.filter((s) => s.study.wave !== 'followup').sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
  const canWrite = app.can('session.write');

  const newBtn = h('a.btn.btn-primary.btn-sm', { href: '#/seans/yeni?module=cognitive&task=accident&study=baseline', style: canWrite ? null : { display: 'none' } }, icon('plus', 15), 'Yeni örneklem');
  const addBtn = h('button.btn.btn-ghost.btn-sm', { disabled: !canWrite }, icon('folder', 15), 'Geçmiş kaydı ekle');
  const csvBtn = h('button.btn.btn-ghost.btn-sm', { disabled: !app.can('export') || !sctx.study.length }, icon('download', 15), 'Araştırma verisi (CSV)');
  app.setActions([csvBtn, addBtn, newBtn]);

  // ---- Geçmiş kaydı çalışmaya ekle ----
  addBtn.addEventListener('click', async () => {
    const candidates = sctx.sessions.filter((s) => !isStudy(s) && (s.transcript?.text?.trim() || s.audioId) && (s.module || 'aphasia') !== 'voice' && s.module !== 'motor');
    if (!candidates.length) { toast('Eklenebilecek (transkripti ya da sesi olan) seans yok. Geçmiş bir ses kaydını "Yeni başlangıç örneklemi → Ses dosyası yükle" ile kendi tarihiyle ekleyebilirsiniz.', 'info', 9000); return; }
    const list = h('div.stack', { style: { gap: '6px', maxHeight: '50vh', overflowY: 'auto' } }, candidates.map((s) => {
      const p = byId.get(s.patientId);
      const b = h('button.alt-item', { style: { width: '100%' } },
        h('div', { style: { textAlign: 'left' } }, h('b', null, p?.code || '—'), h('div.tiny.muted', null, `${fmtDate(s.recordedAt)} · ${s.taskType || ''} · ${s.audioId ? 'sesli' : 'yalnız metin'}`)), icon('plus', 15));
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const patient = byId.get(s.patientId);
          const comp = computeStudy(app, s, patient, sctx);
          await updateStudy(app, s.id, (st) => {
            Object.assign(st, { protocol: PROTOCOL_ID, wave: 'baseline', ratings: st.ratings || {}, createdAt: new Date().toISOString() });
            if (comp) { st.features = comp.measures.features; st.detail = comp.measures.detail; st.featuresAt = new Date().toISOString(); st.ai = aiSnapshot(comp.scored); }
          });
          toast('Seans çalışmaya başlangıç örneklemi olarak eklendi.', 'success');
          document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
          app.navigate(`/ongoru/${s.id}`);
        } catch (err) { b.disabled = false; toast(err.message, 'error'); }
      });
      return b;
    }));
    modal({ title: 'Geçmiş kaydı çalışmaya ekle', body: h('div.stack', null, h('p.small.muted', null, 'Seçtiğiniz seans, kendi kayıt tarihiyle başlangıç örneklemi olur; 1 yıllık izlem tarihi bu tarihten hesaplanır. Protokol gereği kaza resmi anlatımları önerilir.'), list), actions: [{ label: 'Kapat' }] });
  });

  if (!sctx.study.length) {
    mount(root, head(), h('div.card', null, h('div.card-body', null, emptyState({
      icon: 'target', title: 'Henüz örneklem yok',
      text: 'Danışana kaza resmini gösterip standart yönergeyle 3–5 dakikalık anlatım alın (canlı ya da geçmiş ses kaydı yükleyerek). Her örneklemde önce DKT, sonra program 1 yıllık gerileme riskini tahmin eder; 1 yıl sonraki izlemde ikisinin doğruluğu karşılaştırılır.',
      action: canWrite ? h('a.btn.btn-primary', { href: '#/seans/yeni?module=cognitive&task=accident&study=baseline' }, icon('plus', 16), 'İlk örneklemi al') : null,
    }))), protocolCard());
    return;
  }

  // ---- Tahmin başarısı ----
  const withOutcome = baselines.filter((s) => s.study.outcome && s.study.outcome.status !== 'unclear');
  const y = (s) => s.study.outcome.status === 'developed';
  const aiM = predictionMetrics(withOutcome.map((s) => ({ p: s.study.ai?.locked ? s.study.ai.risk : null, y: y(s) })));
  const raterNames = new Map();
  for (const s of baselines) for (const [uid, r] of Object.entries(s.study.ratings || {})) raterNames.set(uid, r.name || 'DKT');
  const raterRows = [...raterNames.entries()].map(([uid, name]) => ({ name, m: predictionMetrics(withOutcome.map((s) => ({ p: s.study.ratings?.[uid]?.risk ?? null, y: y(s) }))) }));
  const dktMean = predictionMetrics(withOutcome.map((s) => ({ p: ratingSummary(s.study)?.risk ?? null, y: y(s) })));

  // ---- Uyum ----
  const rated = baselines.filter((s) => s.study.ai && ratingSummary(s.study));
  const kappaRows = CLINICAL_ITEMS.map((it) => {
    const pairs = rated.map((s) => [s.study.ai.items?.[it.id]?.score, Math.round(ratingSummary(s.study).items[it.id] ?? NaN)]).filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b));
    const kw = weightedKappa(pairs);
    const fl = fleissKappa(baselines.map((s) => Object.values(s.study.ratings || {}).map((r) => r.items?.[it.id]).filter(Number.isInteger)));
    let dktOnly = 0; let both = 0; let aiOnly = 0;
    for (const [a, b] of pairs) { if (a >= 2 && b >= 2) both++; else if (b >= 2) dktOnly++; else if (a >= 2) aiOnly++; }
    return { it, n: pairs.length, kw, fl, dktOnly, both, aiOnly };
  });
  const venn = kappaRows.reduce((acc, r) => ({ dktOnly: acc.dktOnly + r.dktOnly, both: acc.both + r.both, aiOnly: acc.aiOnly + r.aiOnly }), { dktOnly: 0, both: 0, aiOnly: 0 });
  const riskPts = rated.map((s) => ({ x: (ratingSummary(s.study).risk ?? 0) * 100, y: (s.study.ai.risk ?? 0) * 100 }));
  const rRisk = pearson(riskPts.map((p) => p.x), riskPts.map((p) => p.y));

  // ---- Vaka listesi ----
  const now = Date.now();
  const dueCount = baselines.filter((s) => !s.study.outcome && !s.study.followUpId && dueDate(s).getTime() <= now).length;
  const caseRows = baselines.map((s) => {
    const p = byId.get(s.patientId);
    const rs = ratingSummary(s.study);
    const due = dueDate(s);
    const days = Math.ceil((due - now) / 86400000);
    const o = s.study.outcome;
    const verdict = (prob) => (!o || o.status === 'unclear' || prob == null ? null : (prob >= 0.5) === (o.status === 'developed'));
    const mark = (v) => (v == null ? h('span.faint', null, '—') : v ? h('span', { style: { color: 'var(--ok)' }, title: 'doğru' }, icon('check', 15)) : h('span', { style: { color: 'var(--danger)' }, title: 'yanlış' }, icon('x', 15)));
    const tr = h('tr.clickable', { on: { click: () => app.navigate(`/ongoru/${s.id}`) } },
      h('td', null, h('div.strong', null, p?.code || '—'), h('div.tiny.muted', null, [ageAt(p, s) != null ? `${ageAt(p, s)} yaş` : null, p?.sex === 'K' ? 'kadın' : p?.sex === 'E' ? 'erkek' : null].filter(Boolean).join(' · '))),
      h('td', null, fmtDate(s.recordedAt)),
      h('td.num', null, rs ? pctTxt(rs.risk) : h('span.faint', null, 'bekliyor')),
      h('td.num', null, s.study.ai?.locked ? pctTxt(s.study.ai.risk) : h('span.faint', { title: 'DKT değerlendirmesinden önce gizli' }, 'kilitsiz')),
      h('td', null, s.study.followUpId ? badge('izlem alındı', 'ok') : o ? badge('sonuç girildi', 'ok') : days > 0 ? h('span.small.muted', null, `${days} gün`) : badge('izlem zamanı', 'warn')),
      h('td', null, o ? h('span.small', null, labelOf(OUTCOMES, o.status).split(' (')[0], o.category && o.category !== 'none' ? h('div.tiny.muted', null, labelOf(OUTCOME_CATEGORIES, o.category)) : null) : h('span.faint', null, '—')),
      h('td', null, h('span.row', { style: { gap: '10px', flexWrap: 'nowrap' } }, h('span.tiny.muted', null, 'P'), mark(verdict(s.study.ai?.locked ? s.study.ai.risk : null)), h('span.tiny.muted', null, 'D'), mark(verdict(rs?.risk)))));
    return tr;
  });

  const tile = (ic, tone, label, value, hint) => h('div.card.stat', null, h(`div.ic.${tone}`, null, icon(ic, 20)), h('div', null, h('div.label', null, label), h('div.value', null, value), hint ? h('div.hint', null, hint) : null));
  const mRow = (name, m, strong = false) => h('tr', null, h('td', null, strong ? h('b', null, name) : name), h('td.num', null, m.n || 0),
    h('td.num', null, m.n ? pctTxt(m.accuracy) : '—'), h('td.num', null, m.sensitivity != null ? pctTxt(m.sensitivity) : '—'), h('td.num', null, m.specificity != null ? pctTxt(m.specificity) : '—'),
    h('td.num', null, m.n ? num(m.brier, 3) : '—'), h('td.num', null, m.auc != null ? num(m.auc, 2) : '—'));

  const scatter = h('canvas', { role: 'img', 'aria-label': 'Program riski ile DKT riski' });
  if (riskPts.length >= 2) setTimeout(() => scatterChart(scatter, riskPts, { xLabel: 'DKT', unit: '%', decimals: 0 }), 0);

  mount(root,
    head(),
    h('div.stats', null,
      tile('users', 'indigo', 'Başlangıç örneklemi', num(baselines.length, 0), `${sctx.study.length - baselines.length} izlem örneklemi`),
      tile('calendar', 'coral', 'İzlem zamanı gelen', num(dueCount, 0), 'sonuç girilmemiş'),
      tile('checkCircle', 'teal', 'Sonucu belli', num(withOutcome.length, 0), `${withOutcome.filter(y).length} gerileme`),
      tile('target', 'lavender', 'Program doğruluğu', aiM.n ? pctTxt(aiM.accuracy) : '—', dktMean.n ? `DKT: ${pctTxt(dktMean.accuracy)} · n = ${aiM.n}` : 'izlem sonuçları bekleniyor')),
    h('div.grid.grid-2.mt-3', null,
      h('div.card', null, h('div.card-head', null, h('h2', null, icon('target', 18), '1 yıl sonra: kim doğru bildi?'), h('span.sub', null, 'eşik %50')),
        h('div.card-body.tight', null, withOutcome.length ? h('div.table-wrap', null, h('table.table', null,
          h('thead', null, h('tr', null, h('th', null, 'Tahmin eden'), h('th.num', null, 'n'), h('th.num', null, 'Doğruluk'), h('th.num', null, 'Duyarlılık'), h('th.num', null, 'Özgüllük'), h('th.num', null, 'Brier'), h('th.num', null, 'AUC'))),
          h('tbody', null, mRow('Program (yapay zekâ)', aiM, true), mRow('DKT ortalaması', dktMean, true), ...raterRows.map((r) => mRow(r.name, r.m)))))
          : h('p.small.muted', { style: { padding: '16px' } }, 'Doğruluk, başlangıç örneklemlerinin 1 yıl sonraki klinik sonucu girildikçe hesaplanır.'),
          h('p.tiny.muted', { style: { padding: '8px 16px' } }, 'Program tahmini ilk DKT değerlendirmesinde kilitlenir (önceden yapılmış tahmin). Brier: 0 en iyi; AUC: 0,5 şans düzeyi, 1 kusursuz ayırım.'))),
      h('div.card', null, h('div.card-head', null, h('h2', null, icon('grid', 18), 'Program – DKT uyumu'), h('span.sub', null, `${rated.length} değerlendirilmiş örneklem`)),
        h('div.card-body.tight', null, h('div.table-wrap', null, h('table.table', null,
          h('thead', null, h('tr', null, h('th', null, 'Madde'), h('th.num', null, 'κw (program–DKT)'), h('th.num', null, 'Fleiss κ (DKT\'ler)'))),
          h('tbody', null, kappaRows.map((r) => h('tr', null, h('td.small', null, r.it.label),
            h('td.num', null, r.kw != null ? h('span', null, num(r.kw, 2), h('div.tiny.muted', null, kappaLabel(r.kw))) : '—'),
            h('td.num', null, r.fl ? h('span', null, num(r.fl.kappa, 2), h('div.tiny.muted', null, `${r.fl.raters} DKT, ${r.fl.subjects} örneklem`)) : '—')))))),
          h('div.row', { style: { padding: '12px 16px', gap: '8px' } }, badge(`Yalnız DKT saptadı: ${venn.dktOnly}`, 'outline'), badge(`Ortak bulgu: ${venn.both}`, 'ok'), badge(`Yalnız program saptadı: ${venn.aiOnly}`, 'outline')),
          h('p.tiny.muted', { style: { padding: '0 16px 12px' } }, 'κw: kuadratik ağırlıklı Cohen kappa (0–3 puanlar). Bulgu = puan ≥ 2.')))),
    riskPts.length >= 2 ? h('div.card.mt-3', null, h('div.card-head', null, h('h3', null, icon('activity', 17), 'Risk tahminleri: DKT ve program'), h('span.sub', null, rRisk != null ? `r = ${num(rRisk, 2)} · n = ${riskPts.length}` : '')),
      h('div.card-body', null, h('div.chart-box', { style: { height: '260px' } }, scatter), h('p.tiny.muted.mt-1', null, 'Her nokta bir örneklem: yatay eksen DKT tahmini, dikey eksen program tahmini (%).'))) : null,
    h('div.card.mt-3', null, h('div.card-head', null, h('h2', null, icon('folder', 18), 'Örneklemler')),
      h('div.card-body.tight', null, h('div.table-wrap', null, h('table.table', null,
        h('thead', null, h('tr', null, h('th', null, 'Danışan'), h('th', null, 'Başlangıç'), h('th.num', null, 'DKT riski'), h('th.num', null, 'Program riski'), h('th', null, 'İzlem'), h('th', null, 'Sonuç'), h('th', null, 'Doğru mu?'))),
        h('tbody', null, caseRows))))),
    h('div.grid.grid-2.mt-3', null, modelCard(), protocolCard()));

  function head() {
    return h('div.page-head', null, h('div', null,
      h('div.eyebrow', null, icon('target', 14), 'Kaza resmi protokolü · 1 yıllık izlem'),
      h('h1', null, 'Öngörü çalışması'),
      h('p', null, 'Danışan kaza resmini anlatır; kayıttan sonra önce DKT (kör), sonra program 1 yıl içinde konuşma-dil / bilişsel-dilsel gerileme olasılığını tahmin eder. 1 yıl sonra aynı resimle izlem örneklemi alınır ve klinik sonuç girilir; iki tahminin doğruluğu burada karşılaştırılır.')));
  }
  function modelCard() {
    const t = sctx.team;
    return h('div.card', null, h('div.card-head', null, h('h3', null, icon('cpu', 17), 'Program modeli')),
      h('div.card-body.small', null,
        h('p', { style: { marginTop: 0 } }, h('b', null, 'Kullanılan: '), sctx.model.label),
        t.used ? null : h('p.muted', null, t.reason),
        t.looAccTeam != null ? h('p.muted', null, `Birini-dışarıda-bırak doğruluğu: ekip modeli ${pctTxt(t.looAccTeam)}, varsayılan ${pctTxt(t.looAccDefault)}.`) : null,
        h('p', null, h('b', null, 'Referans değerler: '), sctx.norms.source === 'team' ? `ekibin kontrol grubu (${sctx.norms.n} örneklem)` : `varsayılan yaklaşık değerler — kontrol grubundan en az 5 örneklem girildiğinde ekibin kendi değerleri kullanılır (şu an ${sctx.norms.n}).`),
        h('p.tiny.muted', null, 'Model, 8 klinik maddenin ağırlıklı şiddetini, yaşı ve eğitim yılını lojistik fonksiyonla riske çevirir. Sonuçlar tanı koymaz; ayrıntılar Yöntem sayfasında.')));
  }
  function protocolCard() {
    return h('div.card', null, h('div.card-head', null, h('h3', null, icon('book', 17), 'Protokol')),
      h('div.card-body.small', null, h('div.row', { style: { gap: '12px', alignItems: 'flex-start', flexWrap: 'nowrap' } },
        h('img', { src: 'assets/stimuli/kaza-resmi.jpg', alt: 'Kaza resmi', style: { width: '140px', borderRadius: '8px', border: '1px solid var(--border)', flexShrink: 0 } }),
        h('ol', { style: { margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' } },
          h('li', null, 'Kaza resmini gösterin, standart yönergeyi okuyun; 3–5 dk spontan anlatım.'),
          h('li', null, 'Siz konuşurken "Terapist konuşuyor" tuşunu (T) basılı tutun; onay ve sorularınız ölçüte katılmaz.'),
          h('li', null, 'Transkripti kontrol edin, klinik formu kör doldurup 1 yıllık tahmininizi girin.'),
          h('li', null, 'Programın yorumunu ve karşılaştırmayı inceleyin.'),
          h('li', null, '12. ayda aynı resimle izlem alın, klinik sonucu girin.')))));
  }

  // ---- Araştırma verisi (CSV, SPSS/R için; ad yok, yalnız danışan kodu) ----
  csvBtn.addEventListener('click', () => {
    const featKeys = Object.keys(FEATURE_DEFS);
    const extra = ['iuCount', 'iuTotal', 'speakingSec', 'suffixTypes', 'converbsPerUtt', 'participantUtterances', 'examinerUtterances'];
    const head = ['kod', 'grup', 'tani', 'yas', 'cinsiyet', 'egitim_yil', 'dalga', 'tarih', 'baslangic_kod_tarih',
      ...featKeys, ...extra,
      ...CLINICAL_ITEMS.map((i) => `program_${i.id}`), 'program_bilesik_z', 'program_risk', 'program_kilitli',
      'dkt_sayisi', ...CLINICAL_ITEMS.map((i) => `dkt_ort_${i.id}`), 'dkt_ort_risk', 'dkt_kor_degil_sayisi',
      'sonuc', 'sonuc_kategori', 'sonuc_yontem', 'sonuc_tarih'];
    const esc = (v) => { if (v == null) return ''; const s = typeof v === 'number' ? String(Number(v.toFixed(4))) : csvSafeText(String(v)); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = sctx.study.map((s) => {
      const p = byId.get(s.patientId);
      const f = s.study.features || {};
      const rs = ratingSummary(s.study);
      const base = s.study.wave === 'followup' ? sctx.study.find((x) => x.id === s.study.baselineId) : null;
      const o = (s.study.wave === 'followup' ? base?.study.outcome : s.study.outcome) || {};
      return [p?.code, labelOf(GROUPS, p?.group || 'patient'), labelOf(DIAGNOSES, p?.diagnosis), ageAt(p, s), p?.sex, p?.education, s.study.wave, s.recordedAt?.slice(0, 10), base ? base.recordedAt?.slice(0, 10) : '',
        ...featKeys.map((k) => f[k]), ...extra.map((k) => f[k]),
        ...CLINICAL_ITEMS.map((i) => s.study.ai?.items?.[i.id]?.score), s.study.ai?.composite, s.study.ai?.risk, s.study.ai?.locked ? 1 : 0,
        rs?.n || 0, ...CLINICAL_ITEMS.map((i) => rs?.items?.[i.id]), rs?.risk, Object.values(s.study.ratings || {}).filter((r) => r.unblinded).length,
        o.status, o.category, o.method, o.date].map(esc).join(',');
    });
    const text = `﻿# MorphologAI öngörü çalışması (kaza resmi protokolü) · ${new Date().toISOString().slice(0, 10)} · danışan adı içermez\n${head.join(',')}\n${rows.join('\n')}`;
    download(new Blob([text], { type: 'text/csv;charset=utf-8' }), `MorphologAI_ongoru_calismasi_${new Date().toISOString().slice(0, 10)}.csv`);
    toast('Araştırma verisi indirildi (danışan adı yok, yalnız kod).', 'success');
  });
}
