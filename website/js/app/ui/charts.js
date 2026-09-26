/**
 * Chart.js sarmalayıcıları. Kurallar (dataviz): tek serili grafiklerde tek renk,
 * ≤ 24 px çubuk, 4 px yuvarlatılmış veri ucu, 2 px çizgi, silik ızgara,
 * metinler seri renginde değil metin renginde; her grafikte ipucu balonu.
 */
import { loadChart } from '../../lib/cdn.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function theme() {
  return {
    primary: css('--viz-1') || '#6366f1',
    wash: css('--viz-1-wash') || 'rgba(99,102,241,.12)',
    grid: css('--viz-grid') || '#e8e8e3',
    axis: css('--viz-axis') || '#898781',
    text: css('--text') || '#0f172a',
    muted: css('--muted') || '#64748b',
    surface: css('--surface') || '#fff',
    font: css('--font') || 'Poppins, sans-serif',
  };
}

const registry = new Set();

function baseOptions(t, extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    layout: { padding: { top: 6, right: 12 } },
    font: { family: t.font },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: t.surface,
        titleColor: t.text,
        bodyColor: t.text,
        borderColor: t.grid,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        displayColors: false,
        titleFont: { family: t.font, weight: '600' },
        bodyFont: { family: t.font },
      },
    },
    ...extra,
  };
}

function axis(t, extra = {}) {
  return {
    grid: { color: t.grid, drawTicks: false, lineWidth: 1 },
    border: { display: false },
    ticks: { color: t.axis, font: { family: t.font, size: 11 }, padding: 6 },
    ...extra,
  };
}

async function make(canvas, config) {
  const Chart = await loadChart();
  // Sayfadan kaldırılmış tuvallerin grafiklerini serbest bırak (filtre değişimlerinde birikmesin)
  for (const ch of registry) {
    if (!ch.canvas || !ch.canvas.isConnected) { try { ch.destroy(); } catch { /* yok say */ } registry.delete(ch); }
  }
  if (!canvas.isConnected) return null;
  const prev = Chart.getChart(canvas);
  if (prev) prev.destroy();
  const chart = new Chart(canvas, config);
  registry.add(chart);
  return chart;
}

/** Yatay çubuk grafik (kategori → değer), büyükten küçüğe. */
export async function barChart(canvas, items, { unit = '', valueLabel = 'Değer', horizontal = true, color, decimals = 0 } = {}) {
  const t = theme();
  const data = [...items];
  return make(canvas, {
    type: 'bar',
    data: {
      labels: data.map((d) => d.label),
      datasets: [{
        label: valueLabel,
        data: data.map((d) => d.value),
        backgroundColor: color || t.primary,
        borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 4, bottomRight: 4, ...(horizontal ? {} : { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }) },
        borderSkipped: 'start',
        maxBarThickness: 22,
        categoryPercentage: 0.8,
      }],
    },
    options: baseOptions(t, {
      indexAxis: horizontal ? 'y' : 'x',
      scales: {
        x: axis(t, horizontal ? { beginAtZero: true, ticks: { color: t.axis, precision: 0, font: { family: t.font, size: 11 } } } : { grid: { display: false }, border: { display: false } }),
        y: axis(t, horizontal ? { grid: { display: false }, ticks: { color: t.text, font: { family: t.font, size: 12 } } } : { beginAtZero: true }),
      },
      plugins: {
        ...baseOptions(t).plugins,
        tooltip: {
          ...baseOptions(t).plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed[horizontal ? 'x' : 'y'];
              const total = data.reduce((s, d) => s + d.value, 0);
              const share = total && !unit ? ` (%${((100 * v) / total).toLocaleString('tr-TR', { maximumFractionDigits: 1 })})` : '';
              return `${v.toLocaleString('tr-TR', { maximumFractionDigits: decimals })}${unit ? ' ' + unit : ''}${share}`;
            },
          },
        },
      },
    }),
  });
}

/** Zaman içinde tek ölçüt (ilerleme). points: [{x: Date, y, label}] */
export async function trendChart(canvas, points, { unit = '', refBand = null, decimals = 2 } = {}) {
  const t = theme();
  const datasets = [{
    data: points.map((p) => ({ x: p.x.getTime(), y: p.y, label: p.label })),
    borderColor: t.primary,
    backgroundColor: t.wash,
    borderWidth: 2,
    pointRadius: 4.5,
    pointHoverRadius: 6,
    pointBackgroundColor: t.primary,
    pointBorderColor: t.surface,
    pointBorderWidth: 2,
    tension: 0.25,
    fill: true,
  }];
  const plugins = [];
  if (refBand) {
    plugins.push({
      id: 'refband',
      beforeDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const y1 = scales.y.getPixelForValue(refBand.max);
        const y0 = scales.y.getPixelForValue(refBand.min);
        ctx.save();
        ctx.fillStyle = 'rgba(12,163,12,0.07)';
        ctx.fillRect(chartArea.left, Math.min(y0, y1), chartArea.right - chartArea.left, Math.abs(y0 - y1));
        ctx.restore();
      },
    });
  }
  const xs = points.map((p) => p.x.getTime());
  const span = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  return make(canvas, {
    type: 'line',
    data: { datasets },
    plugins,
    options: baseOptions(t, {
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: axis(t, {
          type: 'linear',
          min: xs.length ? Math.min(...xs) - Math.max(span * 0.05, 86400000) : undefined,
          max: xs.length ? Math.max(...xs) + Math.max(span * 0.05, 86400000) : undefined,
          grid: { display: false },
          ticks: { color: t.axis, maxTicksLimit: 6, font: { family: t.font, size: 11 }, callback: (v) => new Date(v).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) },
        }),
        y: axis(t, { grace: '12%' }),
      },
      plugins: {
        ...baseOptions(t).plugins,
        tooltip: {
          ...baseOptions(t).plugins.tooltip,
          callbacks: {
            title: (items) => new Date(items[0].parsed.x).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }),
            label: (ctx) => `${ctx.parsed.y.toLocaleString('tr-TR', { maximumFractionDigits: decimals })}${unit ? ' ' + unit : ''}${ctx.raw.label ? ' · ' + ctx.raw.label : ''}`,
          },
        },
      },
    }),
  });
}

/** F0 izi (Hz) — zaman ekseninde tek çizgi. */
export async function lineChart(canvas, xs, ys, { unit = 'Hz', xLabel = 'sn', min, max, spanGaps = false } = {}) {
  const t = theme();
  return make(canvas, {
    type: 'line',
    data: { datasets: [{ data: xs.map((x, i) => ({ x, y: ys[i] })), borderColor: t.primary, borderWidth: 2, pointRadius: 0, tension: 0.2, spanGaps }] },
    options: baseOptions(t, {
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      scales: {
        x: axis(t, { type: 'linear', grid: { display: false }, ticks: { color: t.axis, maxTicksLimit: 8, callback: (v) => `${Number(v).toFixed(0)} ${xLabel}` } }),
        y: axis(t, { min, max }),
      },
      plugins: {
        ...baseOptions(t).plugins,
        tooltip: { ...baseOptions(t).plugins.tooltip, callbacks: { title: (it) => `${it[0].parsed.x.toFixed(2)} ${xLabel}`, label: (c) => `${c.parsed.y.toFixed(1)} ${unit}` } },
      },
    }),
  });
}

// ---------------------------------------------------------------------------
// Çok serili grafikler (grup analizi). Kategorik renkler sabit sırada atanır;
// 6'dan fazla seri "Diğer"e katlanır. Seri kimliği hiçbir zaman yalnız renge bırakılmaz:
// lejant her zaman görünür ve sayfada tablo görünümü vardır.
// ---------------------------------------------------------------------------
export const CAT_MAX = 6;
export function catColors() {
  return [1, 2, 3, 4, 5, 6].map((i) => css(`--cat-${i}`)).concat(css('--cat-other') || '#a8a29e');
}
const catColor = (i, other = false) => { const c = catColors(); return other ? c[6] : c[i % 6]; };

function legend(t) {
  return {
    display: true,
    position: 'bottom',
    labels: { color: t.text, font: { family: t.font, size: 12 }, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', padding: 14 },
  };
}

const fmtNum = (v, d) => (v == null ? '—' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: 0 }));

/**
 * Grup ortalamaları (yatay, tek renk). items: [{label, mean, sd, n, median}]
 * İpucunda ortalama ± SS, ortanca ve danışan sayısı gösterilir.
 */
export async function meanBarChart(canvas, items, { unit = '', decimals = 1, nLabel = 'danışan' } = {}) {
  const t = theme();
  return make(canvas, {
    type: 'bar',
    data: {
      labels: items.map((d) => d.label),
      datasets: [{
        data: items.map((d) => d.mean),
        backgroundColor: t.primary,
        borderRadius: { topLeft: 0, bottomLeft: 0, topRight: 4, bottomRight: 4 },
        borderSkipped: 'start',
        maxBarThickness: 22,
        categoryPercentage: 0.78,
      }],
    },
    options: baseOptions(t, {
      indexAxis: 'y',
      layout: { padding: { top: 6, right: 78 } },
      scales: {
        x: axis(t, { beginAtZero: true, ticks: { color: t.axis, font: { family: t.font, size: 11 }, maxTicksLimit: 6 } }),
        y: axis(t, { grid: { display: false }, ticks: { color: t.text, font: { family: t.font, size: 12 }, autoSkip: false } }),
      },
      plugins: {
        ...baseOptions(t).plugins,
        tooltip: {
          ...baseOptions(t).plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const d = items[ctx.dataIndex];
              return [
                `Ortalama: ${fmtNum(d.mean, decimals)}${unit ? ' ' + unit : ''}${d.sd != null ? ` (SS ${fmtNum(d.sd, decimals)})` : ''}`,
                `Ortanca: ${fmtNum(d.median, decimals)} · aralık ${fmtNum(d.min, decimals)}–${fmtNum(d.max, decimals)}`,
                `n = ${d.n} ${nLabel}`,
              ];
            },
          },
        },
      },
    }),
    plugins: [{
      // Seçici doğrudan etiket: her çubuğun ucunda n
      id: 'nlabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        ctx.save();
        ctx.font = `11px ${t.font}`;
        ctx.fillStyle = t.muted;
        ctx.textBaseline = 'middle';
        meta.data.forEach((bar, i) => {
          const d = items[i];
          if (!d) return;
          ctx.fillText(`${fmtNum(d.mean, decimals)} · n=${d.n}`, bar.x + 6, bar.y);
        });
        ctx.restore();
      },
    }],
  });
}

/** Yığılmış çubuk (ör. yaş grubuna göre tanı dağılımı). series: [{label, data:[…]}] */
export async function stackedBarChart(canvas, labels, series, { valueLabel = 'danışan' } = {}) {
  const t = theme();
  let ss = series;
  if (series.length > CAT_MAX) {
    const keep = series.slice(0, CAT_MAX - 1);
    const rest = series.slice(CAT_MAX - 1);
    ss = [...keep, { label: 'Diğer', data: labels.map((_, i) => rest.reduce((s, r) => s + (r.data[i] || 0), 0)), other: true }];
  }
  return make(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: ss.map((s, i) => ({
        label: s.label,
        data: s.data,
        _cat: s.other ? 'other' : i,
        backgroundColor: catColor(i, s.other),
        borderColor: t.surface,
        borderWidth: { top: 0, bottom: 0, left: 1, right: 1 },
        borderSkipped: false,
        borderRadius: 0,
        maxBarThickness: 22,
      })),
    },
    options: baseOptions(t, {
      indexAxis: 'y',
      scales: {
        x: axis(t, { stacked: true, beginAtZero: true, ticks: { color: t.axis, precision: 0, font: { family: t.font, size: 11 } } }),
        y: axis(t, { stacked: true, grid: { display: false }, ticks: { color: t.text, font: { family: t.font, size: 12 }, autoSkip: false } }),
      },
      plugins: {
        ...baseOptions(t).plugins,
        legend: legend(t),
        tooltip: { ...baseOptions(t).plugins.tooltip, displayColors: true, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x} ${valueLabel}` } },
      },
    }),
  });
}

/** Çok serili zaman eğilimi. series: [{label, points:[{x:Date, y, n}]}] */
export async function multiLineChart(canvas, series, { unit = '', decimals = 1 } = {}) {
  const t = theme();
  const all = series.flatMap((s) => s.points.map((p) => p.x.getTime()));
  const span = all.length ? Math.max(...all) - Math.min(...all) : 0;
  const pad = Math.max(span * 0.04, 15 * 86400000);
  return make(canvas, {
    type: 'line',
    data: {
      datasets: series.slice(0, CAT_MAX).map((s, i) => ({
        label: s.label,
        _cat: i,
        data: s.points.map((p) => ({ x: p.x.getTime(), y: p.y, n: p.n })),
        borderColor: catColor(i),
        backgroundColor: catColor(i),
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBorderColor: t.surface,
        pointBorderWidth: 2,
        tension: 0.2,
      })),
    },
    options: baseOptions(t, {
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: axis(t, {
          type: 'linear',
          min: all.length ? Math.min(...all) - pad : undefined,
          max: all.length ? Math.max(...all) + pad : undefined,
          grid: { display: false },
          ticks: { color: t.axis, maxTicksLimit: 7, font: { family: t.font, size: 11 }, callback: (v) => new Date(v).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }) },
        }),
        y: axis(t, { grace: '10%' }),
      },
      plugins: {
        ...baseOptions(t).plugins,
        legend: legend(t),
        tooltip: {
          ...baseOptions(t).plugins.tooltip,
          displayColors: true,
          callbacks: {
            title: (it) => new Date(it[0].parsed.x).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
            label: (c) => `${c.dataset.label}: ${fmtNum(c.parsed.y, decimals)}${unit ? ' ' + unit : ''} (${c.raw.n} seans)`,
          },
        },
      },
    }),
  });
}

/** Saçılım + doğrusal eğilim çizgisi. points: [{x, y}], fit: {slope, intercept} */
export async function scatterChart(canvas, points, { xLabel = '', unit = '', decimals = 1, fit = null } = {}) {
  const t = theme();
  const datasets = [{
    type: 'scatter',
    data: points,
    backgroundColor: t.primary,
    borderColor: t.surface,
    borderWidth: 2,
    pointRadius: 5,
    pointHoverRadius: 7,
  }];
  if (fit && points.length) {
    const xs = points.map((p) => p.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    datasets.push({
      type: 'line',
      data: [{ x: x0, y: fit.intercept + fit.slope * x0 }, { x: x1, y: fit.intercept + fit.slope * x1 }],
      borderColor: t.axis,
      borderDash: [5, 4],
      borderWidth: 2,
      pointRadius: 0,
      _fit: true,
    });
  }
  return make(canvas, {
    type: 'scatter',
    data: { datasets },
    options: baseOptions(t, {
      scales: {
        x: axis(t, { type: 'linear', grid: { display: false }, title: { display: !!xLabel, text: xLabel, color: t.axis, font: { family: t.font, size: 11 } } }),
        y: axis(t, { grace: '10%' }),
      },
      plugins: {
        ...baseOptions(t).plugins,
        tooltip: {
          ...baseOptions(t).plugins.tooltip,
          filter: (it) => !it.dataset._fit,
          callbacks: { label: (c) => `${xLabel ? xLabel + ' ' : ''}${fmtNum(c.parsed.x, 0)} · ${fmtNum(c.parsed.y, decimals)}${unit ? ' ' + unit : ''}` },
        },
      },
    }),
  });
}

/** Tema değişince tüm grafikleri yeniden renklendir. */
export function refreshChartsTheme() {
  const t = theme();
  const cats = catColors();
  for (const ch of registry) {
    if (!ch.canvas || !ch.canvas.isConnected) { registry.delete(ch); continue; }
    for (const ds of ch.data.datasets) {
      if (ds._cat != null) {
        const c = ds._cat === 'other' ? cats[6] : cats[ds._cat % 6];
        ds.backgroundColor = c;
        ds.borderColor = ch.config.type === 'bar' ? t.surface : c;
        if (ds.pointBorderColor) ds.pointBorderColor = t.surface;
        continue;
      }
      if (ds._fit) { ds.borderColor = t.axis; continue; }
      if (ds.type === 'scatter' || ch.config.type === 'scatter') { ds.backgroundColor = t.primary; ds.borderColor = t.surface; continue; }
      if (ds.type === 'bar' || ch.config.type === 'bar') ds.backgroundColor = t.primary;
      else { ds.borderColor = t.primary; ds.pointBackgroundColor = t.primary; ds.backgroundColor = ds.fill ? t.wash : ds.backgroundColor; ds.pointBorderColor = t.surface; }
    }
    for (const [key, sc] of Object.entries(ch.options.scales || {})) {
      if (sc.grid) sc.grid.color = t.grid;
      // Kategori etiketleri (yatay çubuklarda y ekseni) metin renginde kalır
      if (sc.ticks) sc.ticks.color = ch.options.indexAxis === 'y' && key === 'y' ? t.text : t.axis;
    }
    if (ch.options.plugins.legend?.display && ch.options.plugins.legend.labels) ch.options.plugins.legend.labels.color = t.text;
    const tt = ch.options.plugins.tooltip;
    Object.assign(tt, { backgroundColor: t.surface, titleColor: t.text, bodyColor: t.text, borderColor: t.grid });
    ch.update('none');
  }
}

/** Grafik görüntüsü (PDF için) — beyaz zeminde. */
export function chartImage(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0);
  return c.toDataURL('image/png');
}
