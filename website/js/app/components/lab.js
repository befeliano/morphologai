/**
 * Akustik Laboratuvar — Praat'ın "View & Edit" penceresine benzer çalışma alanı.
 *   dalga biçimi · spektrogram (geniş bant 5 ms / dar bant 30 ms) · perde (mavi) · şiddet (sarı)
 *   formantlar (kırmızı) · sözce/duraksama katmanları · imleç ve seçim ölçümleri
 *   seçimden ses raporu (jitter/shimmer/HNR/CPP) ve DDK · TextGrid / CSV / PNG dışa aktarım
 */
import { h, icon, mount, num, clock, download, toast, safeName } from '../ui/dom.js';
import { decodeToMono16k } from '../../core/audio/decode.js';
import { spectrogram, formantTrack } from '../../core/audio/dsp.js';
import { f0Track } from '../../core/audio/acoustic.js';
import { voiceReport, VOICE_NORMS } from '../../core/audio/voice.js';
import { ddkAnalysis } from '../../core/audio/ddk.js';
import { mixDown } from '../pipeline.js';
import { toTextGrid } from '../../export/textgrid.js';

const MAGMA = [[0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191]];
function colorMap(v) {
  const x = Math.max(0, Math.min(1, v)) * (MAGMA.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = MAGMA[i];
  const b = MAGMA[Math.min(MAGMA.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function createLab({ blob, session, acoustic = null, analysis = null, markers = [], patientCode = '' }) {
  const state = {
    t0: 0, t1: 0, dur: 0, sel: null, cursor: null,
    wide: true, color: false, showPitch: true, showInt: true, showFormants: true,
    maxHz: 5000, pitchMin: 75, pitchMax: 500,
  };
  let x16 = null;
  let dec = null;
  let native = null;
  let win = null;           // pencereye özgü hesaplamalar
  const audio = new Audio(URL.createObjectURL(blob));
  let raf = 0;

  // ---- DOM ----
  const btn = (ic, title, fn, text) => h('button.btn.btn-ghost.btn-sm', { title, on: { click: fn } }, icon(ic, 15), text || null);
  const chk = (label, key) => {
    const c = h('input', { type: 'checkbox', checked: state[key] });
    c.addEventListener('change', () => { state[key] = c.checked; draw(); });
    return h('label.check', { style: { fontSize: '12.5px', alignItems: 'center' } }, c, label);
  };
  const bandSel = h('div.seg', null);
  const drawBand = () => mount(bandSel,
    h(`button${state.wide ? '.on' : ''}`, { on: { click: () => { state.wide = true; drawBand(); recompute(); } } }, 'Geniş bant'),
    h(`button${!state.wide ? '.on' : ''}`, { on: { click: () => { state.wide = false; drawBand(); recompute(); } } }, 'Dar bant'));
  drawBand();
  const cmapSel = h('div.seg', null);
  const drawCmap = () => mount(cmapSel,
    h(`button${!state.color ? '.on' : ''}`, { on: { click: () => { state.color = false; drawCmap(); renderSpec(); draw(); } } }, 'Gri'),
    h(`button${state.color ? '.on' : ''}`, { on: { click: () => { state.color = true; drawCmap(); renderSpec(); draw(); } } }, 'Renkli'));
  drawCmap();

  const waveC = h('canvas');
  const specC = h('canvas');
  const tierC = h('canvas');
  const axisC = h('canvas');
  const stage = h('div', { style: { position: 'relative', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', background: 'var(--surface)', userSelect: 'none', cursor: 'crosshair' } },
    h('div', { style: { height: '90px', position: 'relative' } }, waveC),
    h('div', { style: { height: '280px', position: 'relative', borderTop: '1px solid var(--border)' } }, specC),
    h('div', { style: { height: '54px', position: 'relative', borderTop: '1px solid var(--border)' } }, tierC),
    h('div', { style: { height: '24px', position: 'relative', borderTop: '1px solid var(--border)' } }, axisC));
  const status = h('div.small.muted', null, 'Ses yükleniyor…');
  const readCursor = h('div.small');
  const readSel = h('div.small');
  const results = h('div');
  const toolbar = h('div.row', { style: { gap: '8px', marginBottom: '10px' } },
    btn('maximize', 'Tüm kayıt', () => setView(0, state.dur), 'Tümü'),
    btn('zoomIn', 'Yakınlaştır', () => zoom(0.5)),
    btn('zoomOut', 'Uzaklaştır', () => zoom(2)),
    btn('chevronLeft', 'Sola kaydır', () => pan(-0.4)),
    btn('chevronRight', 'Sağa kaydır', () => pan(0.4)),
    h('span', { style: { width: '8px' } }), bandSel, cmapSel,
    chk('Perde', 'showPitch'), chk('Şiddet', 'showInt'), chk('Formant', 'showFormants'));
  const selTools = h('div.row', { style: { gap: '8px' } },
    btn('play', 'Seçimi dinle (Sekme)', () => playSel(), 'Dinle'),
    btn('zoomIn', 'Seçime yakınlaştır', () => { if (state.sel) setView(state.sel.a, state.sel.b); }, 'Seçime yakınlaş'),
    btn('voice', 'Seçimde ses raporu (uzatılmış ünlü)', () => runVoice(), 'Ses raporu'),
    btn('activity', 'Seçimde DDK çözümlemesi', () => runDdk(), 'DDK'));
  const exportRow = h('div.row', { style: { gap: '8px' } },
    btn('download', 'Praat TextGrid', () => exportTextGrid(), 'TextGrid'),
    btn('download', 'Perde (F0) listesi', () => exportPitch(), 'Perde CSV'),
    btn('download', 'Formant listesi (görünen aralık)', () => exportFormants(), 'Formant CSV'),
    btn('download', 'Spektrogram görüntüsü', () => exportPng(), 'PNG'));

  const el = h('div.grid.lab-grid', null,
    h('div', null, toolbar, stage, h('div.row.between.mt-1', null, status, h('span.tiny.faint', null, 'Sürükle: seçim · Tıkla: imleç · Tekerlek: yakınlaştır · Sekme tuşu: seçimi dinle'))),
    h('div.lab-side', null,
      h('div.card', null, h('div.card-head', null, h('h3', null, icon('target', 16), 'İmleç')), h('div.card-body', null, readCursor)),
      h('div.card', null, h('div.card-head', null, h('h3', null, icon('scissors', 16), 'Seçim')), h('div.card-body', null, readSel, h('div.mt-2', null, selTools))),
      h('div.card', null, h('div.card-head', null, h('h3', null, icon('download', 16), 'Dışa aktar')), h('div.card-body', null, exportRow))),
    h('div', { style: { gridColumn: '1 / -1' } }, results));

  // ---- Yükleme ----
  (async () => {
    try {
      dec = await decodeToMono16k(blob);
      x16 = dec.samples;
      state.dur = dec.durationSec;
      const initial = Math.min(state.dur, state.dur > 30 ? 10 : state.dur);
      status.textContent = `${clock(state.dur, true)} · 16 kHz çözümleme · kaynak ${dec.source.sampleRate ? num(dec.source.sampleRate / 1000, 1) + ' kHz' : ''}`;
      setView(0, initial);
    } catch (err) {
      status.textContent = `Ses çözülemedi: ${err.message || err}`;
    }
  })();

  // ---- Görünüm ----
  function setView(a, b) {
    if (!x16) return;
    const d = state.dur;
    let t0 = Math.max(0, a);
    let t1 = Math.min(d, b);
    if (t1 - t0 < 0.05) { const c = (t0 + t1) / 2; t0 = Math.max(0, c - 0.025); t1 = Math.min(d, c + 0.025); }
    state.t0 = t0;
    state.t1 = t1;
    recompute();
  }
  function zoom(f) {
    const c = state.cursor ?? (state.t0 + state.t1) / 2;
    const w = (state.t1 - state.t0) * f;
    setView(c - w / 2, c + w / 2);
  }
  function pan(f) {
    const w = state.t1 - state.t0;
    const shift = w * f;
    let a = state.t0 + shift;
    a = Math.max(0, Math.min(state.dur - w, a));
    setView(a, a + w);
  }

  let recomputeTimer = 0;
  function recompute() {
    clearTimeout(recomputeTimer);
    status.textContent = `${clock(state.t0, true)} – ${clock(state.t1, true)} · hesaplanıyor…`;
    drawAxes();
    recomputeTimer = setTimeout(() => {
      const t0 = state.t0;
      const t1 = state.t1;
      const span = t1 - t0;
      const cols = Math.min(1600, Math.max(200, Math.round(specC.clientWidth * (window.devicePixelRatio || 1))));
      const sp = spectrogram(x16, 16000, { t0, t1, columns: cols, winSec: state.wide ? 0.005 : 0.03, maxHz: state.maxHz });
      // Perde
      let pitch;
      if (span <= 90) {
        const a = Math.floor(t0 * 16000);
        const b = Math.floor(t1 * 16000);
        const tr = f0Track(x16.subarray(a, b), [{ start: 0, end: (b - a) / 16000 }], { f0Min: state.pitchMin, f0Max: state.pitchMax, hopMs: span > 30 ? 20 : 10 });
        pitch = { t: tr.times.map((t) => t + t0), hz: tr.values };
      } else if (acoustic?.f0Track) {
        pitch = acoustic.f0Track;
      } else pitch = { t: [], hz: [] };
      // Şiddet (10 ms, dBFS)
      const ints = { t: [], db: [] };
      const step = span > 120 ? 0.05 : 0.01;
      for (let t = t0; t < t1; t += step) {
        const a = Math.floor(t * 16000);
        const n = Math.floor(0.03 * 16000);
        let e = 0;
        for (let i = 0; i < n; i++) { const v = x16[a + i] || 0; e += v * v; }
        ints.t.push(t + 0.015);
        ints.db.push(10 * Math.log10(e / n + 1e-12));
      }
      // Formantlar (≤ 12 sn pencere)
      let formants = null;
      if (span <= 12) formants = formantTrack(x16, 16000, { t0, t1, maxFormantHz: 5500, step: span > 5 ? 0.02 : 0.01, segments: acoustic?.speechSegments || null });
      win = { t0, t1, sp, pitch, ints, formants, specImg: null };
      renderSpec();
      draw();
      status.textContent = `${clock(t0, true)} – ${clock(t1, true)} (${num(span, 2)} sn)${formants ? '' : ' · formantlar için ≤ 12 sn\'ye yakınlaştırın'}`;
      updateSel();
    }, 30);
  }

  function renderSpec() {
    if (!win) return;
    const { sp } = win;
    const w = sp.frames.length;
    const hgt = sp.frames[0] ? sp.frames[0].length : 1;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = hgt;
    const ctx = off.getContext('2d');
    const img = ctx.createImageData(w, hgt);
    const range = 70;
    const top = sp.maxDb;
    for (let x = 0; x < w; x++) {
      const row = sp.frames[x];
      for (let y = 0; y < hgt; y++) {
        const v = (row[y] - (top - range)) / range;
        const idx = ((hgt - 1 - y) * w + x) * 4;
        if (state.color) {
          const [r, g, b] = colorMap(v);
          img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b;
        } else {
          const g = 255 * (1 - Math.max(0, Math.min(1, v)));
          img.data[idx] = g; img.data[idx + 1] = g; img.data[idx + 2] = g;
        }
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    win.specImg = off;
  }

  function fit(c) {
    const dpr = window.devicePixelRatio || 1;
    const p = c.parentElement;
    const W = p.clientWidth;
    const H = p.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W, H };
  }

  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function drawAxes() {
    const { ctx, W, H } = fit(axisC);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = cssv('--muted');
    ctx.font = '11px Poppins, sans-serif';
    const span = state.t1 - state.t0;
    if (!span) return;
    const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300];
    const step = steps.find((s) => span / s <= 10) || 600;
    for (let t = Math.ceil(state.t0 / step) * step; t <= state.t1; t += step) {
      const x = ((t - state.t0) / span) * W;
      ctx.fillRect(x, 0, 1, 5);
      const label = step < 1 ? `${t.toFixed(step < 0.1 ? 2 : 1)} sn` : clock(t);
      ctx.fillText(label, Math.min(W - 40, x + 3), 16);
    }
  }

  function draw() {
    if (!win || !x16) return;
    const span = win.t1 - win.t0;
    const tx = (t, W) => ((t - win.t0) / span) * W;
    // Dalga biçimi
    {
      const { ctx, W, H } = fit(waveC);
      ctx.clearRect(0, 0, W, H);
      if (state.sel) { ctx.fillStyle = 'rgba(99,102,241,0.14)'; ctx.fillRect(tx(state.sel.a, W), 0, tx(state.sel.b, W) - tx(state.sel.a, W), H); }
      const a = Math.floor(win.t0 * 16000);
      const n = Math.floor(span * 16000);
      const mid = H / 2;
      ctx.fillStyle = cssv('--viz-1') || '#6366f1';
      for (let x = 0; x < W; x++) {
        const i0 = a + Math.floor((x / W) * n);
        const i1 = a + Math.floor(((x + 1) / W) * n);
        let mn = 0; let mx = 0;
        for (let i = i0; i < Math.max(i1, i0 + 1); i++) { const v = x16[i] || 0; if (v < mn) mn = v; if (v > mx) mx = v; }
        ctx.fillRect(x, mid - mx * mid * 0.95, 1, Math.max(1, (mx - mn) * mid * 0.95));
      }
      // DDK: algılanan hece çekirdekleri
      if (state.ddkMarks?.length) {
        ctx.fillStyle = cssv('--amber') || '#f59e0b';
        for (const t of state.ddkMarks) {
          if (t < win.t0 || t > win.t1) continue;
          const x = tx(t, W);
          ctx.fillRect(x - 0.5, 0, 1, H);
          ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, 6); ctx.fill();
        }
      }
      ctx.fillStyle = cssv('--muted');
      ctx.font = '10px Poppins, sans-serif';
      ctx.fillText('Dalga biçimi', 6, 12);
    }
    // Spektrogram + katmanlar
    {
      const { ctx, W, H } = fit(specC);
      ctx.clearRect(0, 0, W, H);
      if (win.specImg) { ctx.imageSmoothingEnabled = true; ctx.drawImage(win.specImg, 0, 0, W, H); }
      if (state.sel) { ctx.fillStyle = 'rgba(99,102,241,0.18)'; ctx.fillRect(tx(state.sel.a, W), 0, tx(state.sel.b, W) - tx(state.sel.a, W), H); }
      const fy = (hz) => H - (hz / state.maxHz) * H;
      if (state.showFormants && win.formants) {
        ctx.fillStyle = '#e11d48';
        for (let k = 0; k < win.formants.f.length; k++) {
          const arr = win.formants.f[k];
          for (let i = 0; i < arr.length; i++) if (arr[i]) ctx.fillRect(tx(win.formants.times[i], W) - 1.5, fy(arr[i]) - 1.5, 3, 3);
        }
      }
      if (state.showInt) {
        const lo = -75;
        const hi = -5;
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        win.ints.t.forEach((t, i) => {
          const y = H - ((win.ints.db[i] - lo) / (hi - lo)) * H;
          const x = tx(t, W);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      if (state.showPitch) {
        const py = (hz) => H - ((hz - state.pitchMin) / (state.pitchMax - state.pitchMin)) * H;
        ctx.fillStyle = '#2563eb';
        const r = span > 30 ? 1.5 : 2.2;
        win.pitch.t.forEach((t, i) => {
          const hz = win.pitch.hz[i];
          if (hz > 0 && t >= win.t0 && t <= win.t1) { ctx.beginPath(); ctx.arc(tx(t, W), py(hz), r, 0, Math.PI * 2); ctx.fill(); }
        });
      }
      // eksen etiketleri
      ctx.font = '10px Poppins, sans-serif';
      ctx.fillStyle = state.color ? '#fff' : '#334155';
      ctx.fillText(`${state.maxHz} Hz`, 6, 12);
      ctx.fillText('0 Hz', 6, H - 4);
      if (state.showPitch) { ctx.fillStyle = '#2563eb'; ctx.textAlign = 'right'; ctx.fillText(`${state.pitchMax} Hz`, W - 6, 12); ctx.fillText(`${state.pitchMin} Hz`, W - 6, H - 4); ctx.textAlign = 'left'; }
      // imleç
      if (state.cursor != null && state.cursor >= win.t0 && state.cursor <= win.t1) {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(tx(state.cursor, W), 0, 1, H);
      }
      if (!audio.paused) { ctx.fillStyle = '#16a34a'; ctx.fillRect(tx(audio.currentTime, W), 0, 1.5, H); }
    }
    // Katmanlar (TextGrid benzeri)
    {
      const { ctx, W, H } = fit(tierC);
      ctx.clearRect(0, 0, W, H);
      ctx.font = '11px Poppins, sans-serif';
      const half = H / 2;
      ctx.fillStyle = cssv('--surface-2');
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = cssv('--border');
      ctx.fillRect(0, half, W, 1);
      // duraksamalar
      for (const p of acoustic?.pauses || []) {
        if (p.end < win.t0 || p.start > win.t1) continue;
        ctx.fillStyle = 'rgba(245,158,11,0.35)';
        ctx.fillRect(tx(p.start, W), half + 2, Math.max(1, tx(p.end, W) - tx(p.start, W)), half - 4);
        if (tx(p.end, W) - tx(p.start, W) > 34) { ctx.fillStyle = cssv('--text-2'); ctx.fillText(`${p.dur.toFixed(2)}`, tx(p.start, W) + 3, H - 8); }
      }
      // sözceler
      const utts = (analysis?.utterances || []).filter((u) => u.start != null);
      utts.forEach((u, i) => {
        const next = utts[i + 1];
        const s = u.start;
        const e = next ? next.start : state.dur;
        if (e < win.t0 || s > win.t1) return;
        const x0 = Math.max(0, tx(s, W));
        const x1 = Math.min(W, tx(e, W));
        ctx.fillStyle = cssv('--accent');
        ctx.fillRect(tx(s, W), 0, 2, half);
        ctx.fillStyle = cssv('--text');
        const text = u.tokens.filter((t) => t.kind === 'word').map((t) => t.text).join(' ');
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 4, 0, Math.max(0, x1 - x0 - 8), half);
        ctx.clip();
        ctx.fillText(`${u.speaker === 'examiner' ? 'T: ' : ''}${text}`, x0 + 5, half - 8);
        ctx.restore();
      });
      for (const m of markers) {
        if (m.t < win.t0 || m.t > win.t1) continue;
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(tx(m.t, W), 0, 2, H);
      }
      ctx.fillStyle = cssv('--muted');
      ctx.fillText('sözce', W - 40, 13);
      ctx.fillText('duraksama', W - 62, half + 13);
    }
    drawAxes();
  }

  // ---- Ölçümler ----
  const valueAt = (arrT, arrV, t, tol = 0.03) => {
    let best = null;
    let bd = tol;
    for (let i = 0; i < arrT.length; i++) {
      const d = Math.abs(arrT[i] - t);
      if (d < bd && arrV[i] != null && arrV[i] > 0) { bd = d; best = arrV[i]; }
    }
    return best;
  };
  function updateCursor(t, hz) {
    if (!win) return;
    const pitch = valueAt(win.pitch.t, win.pitch.hz, t, 0.03);
    const idb = (() => { let best = null; let bd = 0.02; win.ints.t.forEach((x, i) => { const d = Math.abs(x - t); if (d < bd) { bd = d; best = win.ints.db[i]; } }); return best; })();
    const fm = win.formants ? win.formants.f.map((arr) => valueAt(win.formants.times, arr, t, 0.02)) : [];
    mount(readCursor,
      row('Zaman', `${num(t, 3)} sn`),
      hz != null ? row('Frekans (imleç)', `${num(hz, 0)} Hz`) : null,
      row('Perde (F0)', pitch ? `${num(pitch, 1)} Hz` : 'sessiz / belirsiz'),
      row('Şiddet', idb != null ? `${num(idb, 1)} dBFS` : '—'),
      win.formants ? row('F1 · F2', `${fm[0] ? num(fm[0], 0) : '—'} · ${fm[1] ? num(fm[1], 0) : '—'} Hz`) : null,
      win.formants ? row('F3 · F4', `${fm[2] ? num(fm[2], 0) : '—'} · ${fm[3] ? num(fm[3], 0) : '—'} Hz`) : null);
  }
  function row(k, v) {
    return h('div.row.between', { style: { padding: '4px 0', borderBottom: '1px solid var(--border)' } }, h('span.muted', null, k), h('b.num', null, v));
  }
  function stats(arrT, arrV, a, b) {
    const v = [];
    arrT.forEach((t, i) => { if (t >= a && t <= b && arrV[i] != null && arrV[i] > 0) v.push(arrV[i]); });
    if (!v.length) return null;
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    return { mean: m, min: Math.min(...v), max: Math.max(...v), n: v.length };
  }
  function updateSel() {
    if (!state.sel || !win) { mount(readSel, h('span.muted', null, 'Dalga biçimi ya da spektrogram üzerinde sürükleyerek bir aralık seçin.')); return; }
    const { a, b } = state.sel;
    const p = stats(win.pitch.t, win.pitch.hz, a, b);
    const idb = (() => { const v = []; win.ints.t.forEach((t, i) => { if (t >= a && t <= b) v.push(win.ints.db[i]); }); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; })();
    const fm = win.formants ? win.formants.f.map((arr) => stats(win.formants.times, arr, a, b)) : [];
    mount(readSel,
      row('Başlangıç – bitiş', `${num(a, 3)} – ${num(b, 3)}`),
      row('Süre', `${num(b - a, 3)} sn`),
      row('Ort. perde', p ? `${num(p.mean, 1)} Hz` : '—'),
      row('Perde aralığı', p ? `${num(p.min, 0)}–${num(p.max, 0)} Hz` : '—'),
      row('Ort. şiddet', idb != null ? `${num(idb, 1)} dBFS` : '—'),
      win.formants ? row('F1 / F2 / F3 ort.', fm.slice(0, 3).map((s) => (s ? num(s.mean, 0) : '—')).join(' / ')) : null);
  }

  // ---- Fare etkileşimi ----
  let drag = null;
  const timeAt = (e, elx) => {
    const r = elx.getBoundingClientRect();
    return state.t0 + ((e.clientX - r.left) / r.width) * (state.t1 - state.t0);
  };
  stage.addEventListener('mousedown', (e) => { drag = { t: timeAt(e, stage), moved: false }; });
  stage.addEventListener('mousemove', (e) => {
    if (!win) return;
    const t = timeAt(e, stage);
    const r = specC.getBoundingClientRect();
    const hz = e.clientY >= r.top && e.clientY <= r.bottom ? ((r.bottom - e.clientY) / r.height) * state.maxHz : null;
    if (drag) {
      if (Math.abs(t - drag.t) > (state.t1 - state.t0) * 0.004) {
        drag.moved = true;
        state.sel = { a: Math.max(0, Math.min(t, drag.t)), b: Math.min(state.dur, Math.max(t, drag.t)) };
        updateSel();
        draw();
      }
    } else {
      updateCursor(t, hz);
    }
  });
  window.addEventListener('mouseup', onUp);
  function onUp(e) {
    if (!drag) return;
    if (!drag.moved) {
      state.cursor = drag.t;
      state.sel = null;
      updateSel();
      const r = specC.getBoundingClientRect();
      updateCursor(drag.t, e.clientY >= r.top && e.clientY <= r.bottom ? ((r.bottom - e.clientY) / r.height) * state.maxHz : null);
      draw();
    }
    drag = null;
  }
  stage.addEventListener('wheel', (e) => {
    if (!win) return;
    e.preventDefault();
    state.cursor = timeAt(e, stage);
    zoom(e.deltaY > 0 ? 1.25 : 0.8);
  }, { passive: false });
  const onKey = (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === 'Tab' && el.isConnected) { e.preventDefault(); playSel(); }
  };
  document.addEventListener('keydown', onKey);

  function playSel() {
    const a = state.sel ? state.sel.a : state.cursor ?? state.t0;
    const b = state.sel ? state.sel.b : state.t1;
    audio.currentTime = a;
    audio.play().catch(() => {});
    cancelAnimationFrame(raf);
    const loop = () => {
      if (audio.currentTime >= b || audio.paused) { audio.pause(); draw(); return; }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  // ---- Seçimden ölçümler ----
  function needSel() {
    if (!state.sel || state.sel.b - state.sel.a < 0.3) { toast('Önce en az 0,3 saniyelik bir aralık seçin.', 'warning'); return null; }
    return state.sel;
  }
  function runVoice() {
    const s = needSel();
    if (!s || !dec) return;
    if (!native) native = mixDown(dec.decoded);
    const r = voiceReport(native, dec.decoded.sampleRate, { t0: s.a, t1: s.b });
    mount(results, voiceReportCard(r, `Seçim ${num(s.a, 2)}–${num(s.b, 2)} sn`));
    results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function runDdk() {
    const s = needSel();
    if (!s) return;
    const r = ddkAnalysis(x16, 16000, { t0: s.a, t1: s.b });
    mount(results, ddkCard(r, `Seçim ${num(s.a, 2)}–${num(s.b, 2)} sn`));
    if (r.ok) {
      state.ddkMarks = r.times;
      draw();
    }
  }

  // ---- Dışa aktarım ----
  const base = `MorphologAI_${safeName(patientCode || 'seans')}_${(session?.recordedAt || '').slice(0, 10)}`;
  function exportTextGrid() {
    const tg = toTextGrid({ durationSec: state.dur || acoustic?.durationSec, utterances: analysis?.utterances || [], acoustic, markers });
    download(new Blob([tg], { type: 'text/plain;charset=utf-8' }), `${base}.TextGrid`);
    toast('TextGrid indirildi. Praat\'ta ses dosyasıyla birlikte açabilirsiniz.', 'success');
  }
  function exportPitch() {
    if (!x16) return;
    const tr = f0Track(x16, [{ start: 0, end: state.dur }], { hopMs: 10 });
    const lines = ['time_s,f0_hz', ...tr.times.map((t, i) => `${t.toFixed(3)},${tr.values[i] ? tr.values[i].toFixed(2) : ''}`)];
    download(new Blob([lines.join('\n')], { type: 'text/csv' }), `${base}_perde.csv`);
  }
  function exportFormants() {
    if (!win || !win.formants) { toast('Formant listesi için görünümü 12 saniyenin altına yakınlaştırın.', 'warning'); return; }
    const f = win.formants;
    const lines = ['time_s,F1,F2,F3,F4', ...f.times.map((t, i) => [t.toFixed(3), ...f.f.map((arr) => (arr[i] ? arr[i].toFixed(0) : ''))].join(','))];
    download(new Blob([lines.join('\n')], { type: 'text/csv' }), `${base}_formantlar.csv`);
  }
  function exportPng() {
    const c = document.createElement('canvas');
    c.width = specC.width;
    c.height = waveC.height + specC.height + tierC.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(waveC, 0, 0);
    ctx.drawImage(specC, 0, waveC.height);
    ctx.drawImage(tierC, 0, waveC.height + specC.height);
    c.toBlob((b) => download(b, `${base}_spektrogram.png`), 'image/png');
  }

  const ro = new ResizeObserver(() => { if (win) draw(); });
  ro.observe(stage);

  return {
    el,
    destroy() {
      ro.disconnect();
      cancelAnimationFrame(raf);
      audio.pause();
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKey);
    },
  };
}

/** Ses raporu kartı (Praat "Voice report" düzeni). */
export function voiceReportCard(r, title = 'Ses raporu') {
  if (!r || !r.ok) {
    return h('div.callout.warn', null, icon('alert', 18), h('div', null, h('b', null, 'Ses raporu hesaplanamadı. '), r?.reason || 'Yeterli sesli bölüm yok.'));
  }
  const flag = (key, v) => {
    const n = VOICE_NORMS[key];
    if (!n || v == null) return null;
    const bad = n.max != null ? v > n.max : v < n.min;
    return bad ? h('span.badge.warn', null, icon('alert', 12), 'eşik dışı') : h('span.badge.ok', null, icon('check', 12), 'eşik içinde');
  };
  const tr = (label, value, key, norm) => h('tr', null, h('td', null, label), h('td.num', null, value), h('td.small.muted', null, norm || ''), h('td', null, key ? flag(key, r[key]) : null));
  return h('div.card', null,
    h('div.card-head', null, h('h3', null, icon('voice', 17), 'Ses raporu'), h('span.sub', null, title)),
    h('div.card-body', null,
      h('div.metric-grid', null,
        [['F0 ortanca', `${num(r.f0.median, 1)} Hz`], ['F0 ort. ± SS', `${num(r.f0.mean, 1)} ± ${num(r.f0.sd, 1)}`], ['F0 aralığı', `${num(r.f0.min, 0)}–${num(r.f0.max, 0)} Hz`],
          ['Periyot sayısı', num(r.periods, 0)], ['Ses kırılması', `${num(r.voiceBreaks, 0)} (%${num(r.degreeOfBreaks, 1)})`], ['Sessiz çerçeve', `%${num(r.unvoicedFraction, 1)}`]]
          .map(([k, v]) => h('div.metric', null, h('div.m-label', null, k), h('div.m-value', { style: { fontSize: '17px' } }, v)))),
      h('div.table-wrap.mt-2', null, h('table.table', null,
        h('thead', null, h('tr', null, h('th', null, 'Ölçüt'), h('th.num', null, 'Değer'), h('th', null, 'Eşik (yetişkin)'), h('th', null, ''))),
        h('tbody', null,
          tr('Jitter (local)', `%${num(r.jitterLocal, 3)}`, 'jitterLocal', '< %1,040'),
          tr('Jitter (local, mutlak)', `${num(r.jitterAbsUs, 1)} µs`, null, '< 83,2 µs'),
          tr('Jitter (RAP)', `%${num(r.jitterRap, 3)}`, 'jitterRap', '< %0,680'),
          tr('Jitter (PPQ5)', `%${num(r.jitterPpq5, 3)}`, 'jitterPpq5', '< %0,840'),
          tr('Shimmer (local)', `%${num(r.shimmerLocal, 3)}`, 'shimmerLocal', '< %3,810'),
          tr('Shimmer (local, dB)', `${num(r.shimmerDb, 3)} dB`, 'shimmerDb', '< 0,350 dB'),
          tr('Shimmer (APQ3)', `%${num(r.shimmerApq3, 3)}`, 'shimmerApq3', '< %3,070'),
          tr('Shimmer (APQ5)', `%${num(r.shimmerApq5, 3)}`, 'shimmerApq5', '< %4,230'),
          tr('Shimmer (APQ11)', `%${num(r.shimmerApq11, 3)}`, null, ''),
          tr('HNR', `${num(r.hnr, 2)} dB`, 'hnr', '> 20 dB'),
          tr('CPP', `${num(r.cpp, 2)} dB`, null, 'yüksek = daha periyodik'),
          r.segmentSec != null ? tr('Fonasyon süresi (bölüm)', `${num(r.segmentSec, 2)} sn`, null, 'MPT: yetişkin genellikle > 15 sn') : null))),
      h('p.tiny.muted.mt-2', null, 'Eşikler Praat/MDVP literatüründe uzatılmış /a/ için yaygın kullanılan patoloji sınırlarıdır; kayıt koşullarına (mikrofon, gürültü, sıkıştırma) duyarlıdır. MP3/AAC gibi kayıplı biçimler jitter/shimmer değerlerini bozabilir; WAV önerilir.')));
}

export function ddkCard(r, title = 'DDK') {
  if (!r || !r.ok) return h('div.callout.warn', null, icon('alert', 18), h('div', null, h('b', null, 'DDK hesaplanamadı. '), r?.reason || ''));
  return h('div.card', null,
    h('div.card-head', null, h('h3', null, icon('activity', 17), 'Diadokokinetik hız'), h('span.sub', null, title)),
    h('div.card-body', null,
      h('div.metric-grid', null,
        [['Hız', `${num(r.rate, 2)} hece/sn`, 'yetişkin ≈ 5–7'], ['Hece sayısı', num(r.syllables, 0), ''], ['Süre', `${num(r.durationSec, 2)} sn`, ''],
          ['Ort. aralık', `${num(r.meanIntervalMs, 0)} ms`, `SS ${num(r.sdIntervalMs, 0)} ms`], ['Düzensizlik (CV)', `%${num(r.cv, 1)}`, 'düşük = düzenli'],
          ['İlk 5 sn hız', r.rateFirst5 ? `${num(r.rateFirst5, 2)}` : '—', 'hece/sn'], ['Son 5 sn hız', r.rateLast5 ? `${num(r.rateLast5, 2)}` : '—', 'yorgunluk göstergesi']]
          .map(([k, v, n]) => h('div.metric', null, h('div.m-label', null, k), h('div.m-value', { style: { fontSize: '18px' } }, v), n ? h('div.m-note', null, n) : null))),
      h('p.tiny.muted.mt-2', null, 'Heceler enerji zarfındaki tepelerden saptanır. Referans değerler genel yetişkin literatürüne dayanır; Türkçe normlar için kontrol grubu verinizi kullanın.')));
}
