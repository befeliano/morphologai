/**
 * Dalga biçimli ses oynatıcı: duraksama bölgeleri, sözce başlangıçları, klinisyen notları,
 * sürükleyerek aralık seçme ve döngü, hız ayarı, klavye kısayolları.
 */
import { h, icon, clock, mount } from '../ui/dom.js';

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function createPlayer({ blob, peaks = null, duration = null, pauses = [], markers = [], utterances = [] }) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;
  const canvas = h('canvas');
  const wrap = h('div.wave-wrap', { title: 'Tıklayarak konuma gidin, sürükleyerek aralık seçin' }, canvas);
  const playBtn = h('button.play-btn', { 'aria-label': 'Oynat / duraklat' }, icon('play', 20));
  const time = h('span.time', null, '00:00 / --:--');
  const speed = h('select.select', { style: { width: '92px', height: '34px' }, 'aria-label': 'Oynatma hızı' },
    ...[0.5, 0.75, 1, 1.25, 1.5].map((v) => h('option', { value: v, selected: v === 1 }, `${String(v).replace('.', ',')}×`)));
  const back = h('button.btn.btn-ghost.btn-icon.btn-sm', { title: '2 sn geri (Ctrl+←)' }, icon('chevronLeft', 16));
  const fwd = h('button.btn.btn-ghost.btn-icon.btn-sm', { title: '2 sn ileri (Ctrl+→)' }, icon('chevronRight', 16));
  const loopInfo = h('span.small.muted');
  const legend = h('div.legend', null,
    h('span', null, h('i', { style: { background: 'var(--viz-1)' } }), 'konuşma'),
    h('span', null, h('i', { style: { background: 'rgba(245,158,11,.35)' } }), 'duraksama'),
    utterances.some((u) => u.start != null) ? h('span', null, h('i', { style: { background: 'var(--accent)', width: '3px' } }), 'sözce başı') : null,
    markers.length ? h('span', null, h('i', { style: { background: 'var(--coral)', width: '3px' } }), 'not') : null);
  const el = h('div.player', null,
    h('div.player-bar', null, playBtn, back, fwd, time, h('div', { style: { flex: 1 } }), loopInfo, speed),
    wrap, legend);

  let dur = duration || 0;
  let sel = null;          // {a, b}
  let dragging = null;
  const listeners = new Set();
  let raf = 0;

  audio.addEventListener('loadedmetadata', () => { if (Number.isFinite(audio.duration)) dur = audio.duration; draw(); });
  audio.addEventListener('play', () => { mount(playBtn, icon('pause', 20)); tick(); });
  audio.addEventListener('pause', () => { mount(playBtn, icon('play', 20)); cancelAnimationFrame(raf); draw(); });
  audio.addEventListener('ended', () => { mount(playBtn, icon('play', 20)); });
  playBtn.addEventListener('click', () => toggle());
  back.addEventListener('click', () => seek(audio.currentTime - 2));
  fwd.addEventListener('click', () => seek(audio.currentTime + 2));
  speed.addEventListener('change', () => { audio.playbackRate = Number(speed.value); audio.preservesPitch = true; });

  function tick() {
    raf = requestAnimationFrame(tick);
    if (sel && audio.currentTime >= sel.b) {
      if (sel.once) { audio.pause(); sel = null; } else audio.currentTime = sel.a;
    }
    draw();
    for (const fn of listeners) fn(audio.currentTime);
  }

  function toggle() {
    if (audio.paused) {
      if (sel && (audio.currentTime < sel.a || audio.currentTime >= sel.b)) audio.currentTime = sel.a;
      audio.play().catch(() => {});
    } else audio.pause();
  }
  function seek(t) {
    audio.currentTime = Math.max(0, Math.min(dur || 0, t));
    draw();
    for (const fn of listeners) fn(audio.currentTime);
  }

  const xToT = (x) => (x / wrap.clientWidth) * dur;
  wrap.addEventListener('mousedown', (e) => {
    const r = wrap.getBoundingClientRect();
    dragging = { x0: e.clientX - r.left, moved: false };
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  function onMove(e) {
    if (!dragging) return;
    const r = wrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    if (Math.abs(x - dragging.x0) > 4) {
      dragging.moved = true;
      const a = xToT(Math.min(x, dragging.x0));
      const b = xToT(Math.max(x, dragging.x0));
      sel = { a, b };
      loopInfo.textContent = `Seçim: ${clock(a, true)}–${clock(b, true)} (${(b - a).toFixed(2)} sn, döngü)`;
      draw();
    }
  }
  function onUp() {
    if (!dragging) return;
    if (!dragging.moved) {
      sel = null;
      loopInfo.textContent = '';
      seek(xToT(dragging.x0));
    }
    dragging = null;
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(10, wrap.clientWidth);
    const H = Math.max(10, wrap.clientHeight);
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!dur) return;
    const tx = (t) => (t / dur) * W;
    // duraksamalar
    ctx.fillStyle = 'rgba(245,158,11,0.22)';
    for (const p of pauses) ctx.fillRect(tx(p.start), 0, Math.max(1, tx(p.end) - tx(p.start)), H);
    // seçim
    if (sel) { ctx.fillStyle = 'rgba(99,102,241,0.16)'; ctx.fillRect(tx(sel.a), 0, tx(sel.b) - tx(sel.a), H); }
    // dalga biçimi
    const mid = H / 2;
    const primary = css('--viz-1') || '#6366f1';
    const played = css('--primary-700') || '#4338ca';
    if (peaks && peaks.length) {
      const n = peaks.length / 2;
      const cur = tx(audio.currentTime);
      for (let x = 0; x < W; x++) {
        const i0 = Math.floor((x / W) * n);
        const i1 = Math.max(i0 + 1, Math.floor(((x + 1) / W) * n));
        let mn = 0;
        let mx = 0;
        for (let i = i0; i < i1 && i < n; i++) { mn = Math.min(mn, peaks[2 * i]); mx = Math.max(mx, peaks[2 * i + 1]); }
        const y1 = mid - mx * mid * 0.95;
        const y2 = mid - mn * mid * 0.95;
        ctx.fillStyle = x < cur ? played : primary;
        ctx.globalAlpha = x < cur ? 1 : 0.75;
        ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = css('--faint');
      ctx.fillRect(0, mid, W, 1);
    }
    // sözce başları
    ctx.fillStyle = css('--accent') || '#10b981';
    for (const u of utterances) if (u.start != null) ctx.fillRect(tx(u.start), 0, 2, 8);
    // notlar
    ctx.fillStyle = css('--coral') || '#f43f5e';
    for (const m of markers) { ctx.fillRect(tx(m.t), 0, 2, H); }
    // oynatma çizgisi
    ctx.fillStyle = css('--text') || '#0f172a';
    ctx.fillRect(tx(audio.currentTime), 0, 1.5, H);
    time.textContent = `${clock(audio.currentTime, true)} / ${clock(dur)}`;
  }

  const ro = new ResizeObserver(() => draw());
  ro.observe(wrap);
  setTimeout(draw, 50);

  return {
    el,
    audio,
    seek,
    toggle,
    play: () => audio.play().catch(() => {}),
    pause: () => audio.pause(),
    playRange(a, b) {
      sel = { a, b: Math.max(b, a + 0.2), once: true };
      loopInfo.textContent = '';
      audio.currentTime = a;
      audio.play().catch(() => {});
    },
    onTime(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setMarkers(m) { markers = m; draw(); },
    setPauses(p) { pauses = p; draw(); },
    setUtterances(u) { utterances = u; draw(); },
    get duration() { return dur; },
    destroy() {
      cancelAnimationFrame(raf);
      audio.pause();
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      URL.revokeObjectURL(url);
    },
  };
}
