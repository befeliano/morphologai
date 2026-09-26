/**
 * Analiz — danışan gruplarına göre anonim ölçüt karşılaştırması ve eğilimler.
 * Grafiklerde kişi adı ya da danışan kodu yer almaz; yalnız grup etiketleri
 * ("Kadın · 30–39", "Lise") ve özet istatistikler gösterilir.
 */
import { h, mount, icon, num, select, download, emptyState, badge, field } from '../ui/dom.js';
import { MODULES, TASK_TYPES, DIAGNOSES, ETIOLOGIES, GROUPS, labelOf, moduleOf, taskOf } from '../constants.js';
import {
  dimensions, COHORT_METRICS, METRIC_GROUPS, buildRows, aggregate, monthlyTrend, ageScatter, crossCounts, linearFit, metricById, stats, orderGroups,
} from '../../core/metrics/cohort.js';
import { meanBarChart, stackedBarChart, multiLineChart, scatterChart } from '../ui/charts.js';
import { csvSafeText } from '../../export/csv.js';

const PREF_KEY = 'morphologai.analytics.v1';
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } };
const writePrefs = (p) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* yok say */ } };

export async function render(root, _p, app) {
  app.setCrumbs([{ label: 'Analiz' }]);
  const [patients, sessionsAll] = await Promise.all([app.repo.patients.list({ includeArchived: true }), app.repo.sessions.list()]);
  const byId = new Map(patients.map((p) => [p.id, p]));
  const dims = dimensions({
    diagnosis: (id) => labelOf(DIAGNOSES, id), etiology: (id) => labelOf(ETIOLOGIES, id), group: (id) => labelOf(GROUPS, id),
    module: (id) => moduleOf(id).label, task: (id) => taskOf(id).label,
  });
  const onlyDemo = sessionsAll.length > 0 && sessionsAll.every((s) => s.demo || byId.get(s.patientId)?.demo);
  const saved = readPrefs();
  const st = {
    dimA: 'ageGroup', dimB: '', module: '', task: '', group: '', from: '', to: '',
    metricGroup: 'fluency', perPatient: true, hideSmall: true, view: 'charts', trendMetric: 'wpm', scatterMetric: 'wpm',
    ...saved,
    includeDemo: saved.includeDemo ?? onlyDemo,
  };

  if (!sessionsAll.length) {
    mount(root, h('div.page-head', null, h('div', null, h('h1', null, 'Analiz'))),
      h('div.card', null, h('div.card-body', null, emptyState({ icon: 'chart', title: 'Henüz seans yok', text: 'Grup analizleri, seans kaydettikçe burada oluşur.' }))));
    return;
  }

  // ---- Denetimler ----
  const dimOpts = dims.map((d) => ({ id: d.id, label: d.label }));
  const selA = select(dimOpts, st.dimA);
  const selB = select([{ id: '', label: '— yok —' }, ...dimOpts], st.dimB);
  const selMod = select([{ id: '', label: 'Tüm modüller' }, ...MODULES.map((m) => ({ id: m.id, label: m.label }))], st.module);
  const selTask = select([{ id: '', label: 'Tüm görevler' }, ...TASK_TYPES.map((t) => ({ id: t.id, label: t.label }))], st.task);
  const selGroup = select([{ id: '', label: 'Danışan + kontrol' }, ...GROUPS], st.group);
  const from = h('input.input', { type: 'date', value: st.from });
  const to = h('input.input', { type: 'date', value: st.to });
  const chk = (key, label, help) => {
    const c = h('input', { type: 'checkbox', checked: !!st[key] });
    c.addEventListener('change', () => { st[key] = c.checked; update(); });
    return h('label.check', { title: help || '' }, c, h('span.small', null, label));
  };
  const bind = (el, key) => el.addEventListener('change', () => { st[key] = el.value; update(); });
  bind(selA, 'dimA'); bind(selB, 'dimB'); bind(selMod, 'module'); bind(selTask, 'task'); bind(selGroup, 'group'); bind(from, 'from'); bind(to, 'to');

  const tabs = h('div.seg');
  const viewSeg = h('div.seg');
  const tiles = h('div.stats');
  const body = h('div');
  const distCard = h('div');
  const trendCard = h('div');
  const scatterCard = h('div');
  const note = h('div.small.muted');

  const exportBtn = h('button.btn.btn-ghost.btn-sm', { disabled: !app.can('export') }, icon('download', 15), 'Tabloyu indir (CSV)');
  app.setActions([exportBtn]);

  // ---- Hesap ----
  let rows = [];
  let agg = { groups: [], hidden: 0 };
  const minN = () => (st.hideSmall ? 3 : 1);
  const filterSessions = () => {
    const fromT = st.from ? new Date(`${st.from}T00:00:00`).getTime() : -Infinity;
    const toT = st.to ? new Date(`${st.to}T23:59:59`).getTime() : Infinity;
    return sessionsAll.filter((s) => {
      const p = byId.get(s.patientId);
      if (!p) return false;
      if (!st.includeDemo && (s.demo || p.demo)) return false;
      if (st.module && (s.module || 'aphasia') !== st.module) return false;
      if (st.task && s.taskType !== st.task) return false;
      if (st.group && (p.group || 'patient') !== st.group) return false;
      const t = new Date(s.recordedAt || s.createdAt).getTime();
      return t >= fromT && t <= toT;
    });
  };

  const metricItems = (m) => agg.groups
    .map((g) => ({ label: g.label, ...g.metrics[m.id] }))
    .filter((d) => d.n >= minN() && d.mean != null);

  // ---- Çizim ----
  const drawTabs = () => {
    mount(tabs, ...METRIC_GROUPS.map((g) => h(`button${st.metricGroup === g.id ? '.on' : ''}`, { type: 'button', on: { click: () => { st.metricGroup = g.id; update(); } } }, g.label)));
    mount(viewSeg,
      h(`button${st.view === 'charts' ? '.on' : ''}`, { type: 'button', on: { click: () => { st.view = 'charts'; update(); } } }, icon('chart', 14), 'Grafik'),
      h(`button${st.view === 'table' ? '.on' : ''}`, { type: 'button', on: { click: () => { st.view = 'table'; update(); } } }, icon('list', 14), 'Tablo'));
  };

  const drawTiles = () => {
    const perPatientMean = (id) => {
      const per = new Map();
      for (const r of rows) { const v = r.values[id]; if (v == null) continue; if (!per.has(r.pid)) per.set(r.pid, []); per.get(r.pid).push(v); }
      return stats([...per.values()].map((a) => a.reduce((s, x) => s + x, 0) / a.length));
    };
    const f0By = (sexLabel) => {
      const per = new Map();
      for (const r of rows) { if (r.keys.sex !== sexLabel || r.values.f0Mean == null) continue; if (!per.has(r.pid)) per.set(r.pid, []); per.get(r.pid).push(r.values.f0Mean); }
      return stats([...per.values()].map((a) => a.reduce((s, x) => s + x, 0) / a.length));
    };
    const pats = new Set(rows.map((r) => r.pid)).size;
    const withAudio = rows.filter((r) => r.values.f0Mean != null || r.values.pausesPerMin != null).length;
    const wpm = perPatientMean('wpm');
    const ppm = perPatientMean('pausesPerMin');
    const fK = f0By('Kadın');
    const fE = f0By('Erkek');
    const tile = (ic, tone, label, value, hint) => h('div.card.stat', null, h(`div.ic.${tone}`, null, icon(ic, 20)), h('div', null, h('div.label', null, label), h('div.value', null, value), hint ? h('div.hint', null, hint) : null));
    const safe = (s, d) => (s.n >= minN() ? num(s.mean, d) : '—');
    mount(tiles,
      tile('users', 'indigo', 'Danışan', num(pats, 0), `${rows.length} seans · ${withAudio} ses kayıtlı`),
      tile('mic', 'teal', 'Ortalama sözcük/dk', safe(wpm, 0), wpm.n ? `n = ${wpm.n} danışan` : 'transkriptli seans yok'),
      tile('clock', 'coral', 'Duraksama sıklığı', ppm.n >= minN() ? `${num(ppm.mean, 1)}/dk` : '—', ppm.n ? `n = ${ppm.n} danışan` : 'ses kaydı yok'),
      tile('voice', 'lavender', 'F0 ortalama', `${safe(fK, 0)} / ${safe(fE, 0)}`, 'Hz · kadın / erkek'));
  };

  const chartHeight = (n) => `${Math.max(120, Math.min(560, 36 + n * 30))}px`;

  const drawCharts = () => {
    const metrics = COHORT_METRICS.filter((m) => m.group === st.metricGroup);
    if (st.view === 'table') {
      const head = h('tr', null, h('th', null, 'Grup'), h('th.num', null, 'Danışan'), ...metrics.map((m) => h('th.num', null, m.label, m.unit ? h('div.tiny.muted', { style: { fontWeight: 400, textTransform: 'none', letterSpacing: 0 } }, m.unit) : null)));
      const trs = agg.groups.map((g) => h('tr', null, h('td', null, h('b', null, g.label)), h('td.num', null, g.patients),
        ...metrics.map((m) => {
          const s = g.metrics[m.id];
          return h('td.num', null, s.n >= minN() && s.mean != null ? h('span', null, num(s.mean, m.decimals), s.sd != null ? h('span.tiny.muted', null, ` ±${num(s.sd, m.decimals)}`) : null, h('div.tiny.faint', null, `n=${s.n}`)) : h('span.faint', null, '—'));
        })));
      mount(body, h('div.card', null, h('div.card-body.tight', null, h('div.table-wrap', null, h('table.table.analytics-table', null, h('thead', null, head), h('tbody', null, trs))))));
      return;
    }
    const cards = [];
    const draws = [];
    for (const m of metrics) {
      const items = metricItems(m);
      const canvas = h('canvas', { role: 'img', 'aria-label': `${m.label} — grup ortalamaları` });
      cards.push(h('div.card', null,
        h('div.card-head', null, h('h3', null, m.label), h('span.sub', null, m.unit || '')),
        h('div.card-body', null, items.length
          ? h('div.chart-box', { style: { height: chartHeight(items.length) } }, canvas)
          : h('p.small.muted', null, 'Bu ölçüt için yeterli veri yok.'))));
      if (items.length) draws.push(() => meanBarChart(canvas, items, { unit: m.unit, decimals: m.decimals, nLabel: st.perPatient ? 'danışan' : 'seans' }));
    }
    mount(body, h('div.grid.analytics-grid', null, cards));
    setTimeout(() => draws.forEach((d) => d()), 0);
  };

  const drawDistribution = () => {
    const dimA = st.dimA;
    const dimB = st.dimB || (dimA === 'diagnosis' ? 'sex' : 'diagnosis');
    const a = dims.find((d) => d.id === dimA);
    const b = dims.find((d) => d.id === dimB);
    const table = crossCounts(rows, dimA, dimB);
    let labels = [...table.keys()];
    const totals = new Map(labels.map((l) => [l, [...table.get(l).values()].reduce((s, x) => s + x, 0)]));
    if (st.hideSmall) labels = labels.filter((l) => totals.get(l) >= 3);
    const orderA = a?.order || [];
    labels.sort((x, y) => { const ix = orderA.indexOf(x); const iy = orderA.indexOf(y); return (ix === -1 ? 900 : ix) - (iy === -1 ? 900 : iy) || x.localeCompare(y, 'tr'); });
    const cats = new Map();
    for (const l of labels) for (const [k, v] of table.get(l)) cats.set(k, (cats.get(k) || 0) + v);
    // Kategori sırası sabit (değişkenin doğal sırası / alfabetik) — renk kategoriye bağlı kalır
    const orderB = b?.order || [];
    const rankB = (k) => { const i = orderB.indexOf(k); return i === -1 ? (k === 'Belirtilmemiş' ? 999 : 500) : i; };
    const series = [...cats.keys()].sort((x, y) => rankB(x) - rankB(y) || x.localeCompare(y, 'tr')).map((k) => ({ label: k, data: labels.map((l) => table.get(l).get(k) || 0) }));
    const canvas = h('canvas', { role: 'img', 'aria-label': `${a.label} ve ${b.label} dağılımı` });
    mount(distCard, h('div.card', null,
      h('div.card-head', null, h('h3', null, icon('users', 17), `${a.label} × ${b.label}`), h('span.sub', null, 'danışan sayısı')),
      h('div.card-body', null, labels.length ? h('div.chart-box', { style: { height: chartHeight(labels.length + 1.5) } }, canvas) : h('p.small.muted', null, 'Gösterilecek grup yok.'))));
    if (labels.length) setTimeout(() => stackedBarChart(canvas, labels, series, { valueLabel: 'danışan' }), 0);
  };

  const metricSelect = (key) => {
    const s = select(COHORT_METRICS.map((m) => ({ id: m.id, label: `${m.label}${m.unit ? ` (${m.unit})` : ''}` })), st[key], { style: { height: '34px', maxWidth: '260px' } });
    s.addEventListener('change', () => { st[key] = s.value; writePrefs(st); key === 'trendMetric' ? drawTrend() : drawScatter(); });
    return s;
  };

  const drawTrend = () => {
    const m = metricById(st.trendMetric) || COHORT_METRICS[0];
    // Renk grubun kendisine bağlı kalsın: seriler büyüklüğe göre değil, değişkenin doğal sırasına göre dizilir
    const raw = monthlyTrend(rows, m.id, { dimA: st.dimA, dimB: st.dimB || null, maxSeries: 6, minN: minN() }).filter((s) => s.points.length);
    const order = orderGroups(raw.map((s) => s.label), st.dimA, st.dimB || null, dims);
    const series = order.map((l) => raw.find((s) => s.label === l));
    const months = new Set(series.flatMap((s) => s.points.map((p) => p.x.getTime()))).size;
    const canvas = h('canvas', { role: 'img', 'aria-label': `${m.label} aylık eğilim` });
    mount(trendCard, h('div.card', null,
      h('div.card-head', null, h('h3', null, icon('trending', 17), 'Aylık eğilim'), metricSelect('trendMetric')),
      h('div.card-body', null, series.length && months >= 2
        ? h('div.chart-box', { style: { height: '280px' } }, canvas)
        : h('p.small.muted', null, 'Eğilim için en az iki farklı ayda, yeterli danışanı olan grup gerekir.'),
        h('p.tiny.muted.mt-1', null, 'Her nokta o aydaki seansların ortalamasıdır; en kalabalık 6 grup gösterilir.'))));
    if (series.length && months >= 2) setTimeout(() => multiLineChart(canvas, series, { unit: m.unit, decimals: m.decimals }), 0);
  };

  const drawScatter = () => {
    const m = metricById(st.scatterMetric) || COHORT_METRICS[0];
    const pts = ageScatter(rows, m.id);
    const fit = linearFit(pts);
    const canvas = h('canvas', { role: 'img', 'aria-label': `Yaş ve ${m.label}` });
    const enough = pts.length >= Math.max(3, minN());
    mount(scatterCard, h('div.card', null,
      h('div.card-head', null, h('h3', null, icon('activity', 17), 'Yaş ile ilişki'), metricSelect('scatterMetric')),
      h('div.card-body', null,
        enough ? h('div.chart-box', { style: { height: '280px' } }, canvas) : h('p.small.muted', null, 'Doğum yılı girilmiş en az 3 danışan gerekir.'),
        enough && fit ? h('p.small.mt-1', null, h('b', null, `r = ${num(fit.r, 2)}`), h('span.muted', null, ` · n = ${fit.n} danışan · eğim ${num(fit.slope, 3)} ${m.unit || ''}/yıl. Korelasyon nedensellik göstermez; küçük örneklemde yorumlamayın.`)) : null)));
    if (enough) setTimeout(() => scatterChart(canvas, pts, { xLabel: 'Yaş', unit: m.unit, decimals: m.decimals, fit }), 0);
  };

  const update = () => {
    writePrefs(st);
    const filtered = filterSessions();
    rows = buildRows(filtered, byId, dims);
    agg = aggregate(rows, { dimA: st.dimA, dimB: st.dimB || null, perPatient: st.perPatient, minN: minN(), dims });
    mount(note,
      st.includeDemo ? badge('Örnek veriler dahil', 'warn', true) : null, ' ',
      agg.hidden ? `${agg.hidden} küçük grup (3'ten az danışan) gizlendi. ` : '',
      st.perPatient ? 'Değerler önce her danışanın kendi seanslarında ortalanır.' : 'Her seans ayrı gözlem sayılır.');
    drawTabs();
    drawTiles();
    if (!rows.length) {
      mount(body, h('div.card', null, h('div.card-body', null, emptyState({ icon: 'search', title: 'Filtreye uyan seans yok', text: 'Filtreleri genişletin ya da örnek verileri dahil edin.' }))));
      mount(distCard); mount(trendCard); mount(scatterCard);
      return;
    }
    drawCharts();
    drawDistribution();
    drawTrend();
    drawScatter();
  };

  exportBtn.addEventListener('click', () => {
    const dimLabel = [dims.find((d) => d.id === st.dimA)?.label, st.dimB ? dims.find((d) => d.id === st.dimB)?.label : null].filter(Boolean).join(' × ');
    const head = ['grup', 'danisan_sayisi', 'seans_sayisi', 'olcut', 'birim', 'n', 'ortalama', 'ss', 'ortanca', 'en_kucuk', 'en_buyuk'];
    const esc = (v) => { const s = v == null ? '' : typeof v === 'number' ? String(v) : csvSafeText(String(v)); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [`# MorphologAI grup analizi · ${dimLabel} · ${new Date().toISOString().slice(0, 10)} · ${st.perPatient ? 'danışan başına ortalama' : 'seans düzeyi'} · kişisel bilgi içermez`, head.join(',')];
    for (const g of agg.groups) {
      for (const m of COHORT_METRICS) {
        const s = g.metrics[m.id];
        if (!s.n || s.n < minN()) continue;
        const f = (x) => (x == null ? '' : Number(x.toFixed(4)));
        lines.push([g.label, g.patients, g.sessions, m.label, m.unit, s.n, f(s.mean), f(s.sd), f(s.median), f(s.min), f(s.max)].map(esc).join(','));
      }
    }
    download(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), `MorphologAI_grup_analizi_${new Date().toISOString().slice(0, 10)}.csv`);
  });

  mount(root,
    h('div.page-head', null, h('div', null,
      h('div.eyebrow', null, icon('shield', 14), 'Anonim grup analizi'),
      h('h1', null, 'Analiz'),
      h('p', null, 'Danışanların yaş, cinsiyet, eğitim, el tercihi ve tanı gibi özelliklerine göre konuşma hızı, duraksama, ses frekansı, dil ve kekemelik ölçütlerini karşılaştırın. Grafiklerde kişi adı ya da danışan kodu yer almaz.'))),
    h('div.card.analytics-filters', null, h('div.card-body', null,
      h('div.filter-grid', null,
        field('Karşılaştır', selA), field('İkinci değişken', selB), field('Modül', selMod), field('Görev', selTask), field('Grup', selGroup),
        field('Başlangıç', from), field('Bitiş', to)),
      h('div.row.mt-2', { style: { gap: '18px' } },
        chk('perPatient', 'Danışan başına ortala', 'Çok seansı olan danışan grubu tek başına belirlemesin'),
        chk('hideSmall', "3'ten az danışanlı grupları gizle", 'Küçük gruplar kişinin tanınmasına yol açabilir'),
        chk('includeDemo', 'Örnek verileri dahil et')),
      h('div.mt-2', null, note))),
    h('div.mt-3', null, tiles),
    h('div.row.between.mt-3', { style: { gap: '10px' } }, h('div.seg-scroll', null, tabs), viewSeg),
    h('div.mt-2', null, body),
    h('div.grid.grid-2.mt-3', null, distCard, scatterCard),
    h('div.mt-3', null, trendCard),
    h('p.tiny.muted.mt-3', null, 'Ölçüt tanımları için Yöntem sayfasına bakın. Akıcılık ve ses frekansı her ses kaydından hesaplanır; sözcük/dakika ve hece ölçütleri transkript gerektirir. Referans normlar Türkçe için standartlaştırılmamıştır; bulgular araştırma ve klinik karar desteği içindir.'));
  update();
}
