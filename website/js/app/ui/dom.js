/**
 * Arayüz yardımcıları. Tüm dinamik metinler textContent ile eklenir (XSS'e kapalı).
 *
 *  h('div.card#x', {on:{click}}, 'metin', h('b', null, 'kalın'))
 */
import { icon } from './icons.js';

export function h(spec, props, ...children) {
  const m = spec.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const tag = (m && m[1]) || 'div';
  const el = tag === 'svg' ? document.createElementNS('http://www.w3.org/2000/svg', 'svg') : document.createElement(tag);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') { String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c)); }
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'text') el.textContent = v;
      // Güvenlik: ham HTML ve satır içi olay öznitelikleri (onclick="…") kabul edilmez
      else if (k === 'html' || /^on[a-z]/i.test(k)) throw new Error(`h(): güvenli olmayan özellik "${k}"`);
      else if ((k === 'href' || k === 'src' || k === 'action' || k === 'formaction') && typeof v === 'string' && /^\s*(javascript|data|vbscript):/i.test(v) && !/^data:image\//i.test(v)) continue;
      else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') el[k] = v;
      else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...children) { clear(el); append(el, children); return el; }
export { icon };

// ---------------------------------------------------------------------------
// Biçimlendiriciler
// ---------------------------------------------------------------------------
const nf = new Map();
export function num(v, d = 2) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '—';
  const key = d;
  if (!nf.has(key)) nf.set(key, new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  return nf.get(key).format(Number(v));
}
export const pct = (v, d = 0) => (v == null ? '—' : `%${num(v * 100, d)}`);
export function fmtDate(iso, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', opts);
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
export function fmtDur(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m} dk ${String(r).padStart(2, '0')} sn` : `${r} sn`;
}
export function clock(sec, tenths = false) {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const r = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${tenths ? r.toFixed(1).padStart(4, '0') : String(Math.floor(r)).padStart(2, '0')}`;
}
export function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${num(v, i ? 1 : 0)} ${u[i]}`;
}
export function relTime(iso) {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'az önce';
  if (d < 3600) return `${Math.floor(d / 60)} dk önce`;
  if (d < 86400) return `${Math.floor(d / 3600)} sa önce`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} gün önce`;
  return fmtDate(iso);
}
export function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toLocaleUpperCase('tr-TR')).join('');
}
export function safeName(s) {
  return String(s || 'dosya').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 60);
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------------------
// Bildirim
// ---------------------------------------------------------------------------
let toastRoot = null;
const TOAST_ICON = { success: 'checkCircle', error: 'alertCircle', warning: 'alert', info: 'info' };
export function toast(message, type = 'info', ms = 4200) {
  if (!toastRoot) { toastRoot = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastRoot); }
  const el = h(`div.toast.${type}`, null, h('span.t-ic', null, icon(TOAST_ICON[type] || 'info', 18)), h('div', null, message));
  toastRoot.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); };
  setTimeout(close, ms);
  el.addEventListener('click', close);
  return close;
}

// ---------------------------------------------------------------------------
// Pencere (modal)
// ---------------------------------------------------------------------------
export function modal({ title, body, actions = [], wide = false, onClose, dismissible = true }) {
  const back = h('div.modal-backdrop');
  const closeBtn = h('button.btn.btn-ghost.btn-icon.btn-sm', { 'aria-label': 'Kapat', on: { click: () => close() } }, icon('x', 16));
  const foot = h('div.modal-foot');
  const box = h(`div.modal${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.modal-head', null, h('h3', null, title), dismissible ? closeBtn : null),
    h('div.modal-body', null, body),
    actions.length ? foot : null);
  const api = {
    close,
    el: box,
    setBusy(b) { foot.querySelectorAll('button').forEach((x) => { x.disabled = b; }); },
  };
  for (const a of actions) {
    const btn = h(`button.btn.${a.variant || 'btn-ghost'}`, { type: 'button' }, a.icon ? icon(a.icon, 16) : null, a.label);
    btn.addEventListener('click', async () => {
      if (!a.onClick) { close(); return; }
      try {
        api.setBusy(true);
        const r = await a.onClick(api);
        if (r !== false) close();
      } catch (err) {
        toast(err.message || String(err), 'error');
      } finally {
        api.setBusy(false);
      }
    });
    foot.appendChild(btn);
  }
  back.appendChild(box);
  if (dismissible) back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(); };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add('show'));
  setTimeout(() => { const f = box.querySelector('input, select, textarea'); if (f) f.focus(); }, 60);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    back.classList.remove('show');
    setTimeout(() => back.remove(), 200);
    onClose && onClose();
  }
  return api;
}

export function confirmDialog({ title = 'Emin misiniz?', message, confirmText = 'Onayla', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title,
      body: h('p', { class: 'muted' }, message),
      actions: [
        { label: 'Vazgeç', onClick: () => { done = true; resolve(false); } },
        { label: confirmText, variant: danger ? 'btn-danger' : 'btn-primary', onClick: () => { done = true; resolve(true); } },
      ],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

/** Form alanı kısayolu */
export function field(label, input, help) {
  return h('div.field', null, h('label', null, label), input, help ? h('div.help', null, help) : null);
}

export function select(options, value, props = {}) {
  const s = h('select.select', props);
  let lastGroup = null;
  let groupEl = null;
  for (const o of options) {
    const opt = h('option', { value: o.id ?? o.value ?? '' }, o.label);
    if (String(o.id ?? o.value) === String(value ?? '')) opt.selected = true;
    if (o.group) {
      if (o.group !== lastGroup) { groupEl = h('optgroup', { label: o.group }); s.appendChild(groupEl); lastGroup = o.group; }
      groupEl.appendChild(opt);
    } else s.appendChild(opt);
  }
  return s;
}

export function badge(text, tone = '', dot = false) {
  return h(`span.badge${tone ? '.' + tone : ''}`, null, dot ? h('span.dot') : null, text);
}

export function emptyState({ icon: ic = 'folder', title, text, action }) {
  return h('div.empty', null, h('div.e-ic', null, icon(ic, 28)), h('h3', null, title), text ? h('p', null, text) : null, action || null);
}

export function tip(text) {
  return h('span.info-dot', { title: text, tabindex: '0', 'aria-label': text }, 'i');
}

/** Tıklanan öğenin yanında açılan küçük pencere. */
export function popover(anchor, content, { width = 360 } = {}) {
  closePopovers();
  const el = h('div.pop', { style: { width: `${width}px` } }, content);
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = Math.min(width, window.innerWidth - 24);
  let left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left));
  let top = r.bottom + 8;
  const hgt = el.offsetHeight;
  if (top + hgt > window.innerHeight - 12) top = Math.max(12, r.top - hgt - 8);
  Object.assign(el.style, { left: `${left}px`, top: `${top}px` });
  const off = (e) => { if (!el.contains(e.target) && e.target !== anchor) closePopovers(); };
  setTimeout(() => document.addEventListener('mousedown', off), 0);
  el._off = off;
  return el;
}
export function closePopovers() {
  document.querySelectorAll('.pop').forEach((p) => { document.removeEventListener('mousedown', p._off); p.remove(); });
}
