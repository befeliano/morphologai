/**
 * Ev Programı — danışan / aile ekranı.
 *
 * Giriş yoktur: klinisyenin oluşturduğu kişisel bağlantıdaki anahtar (adresin # sonrasındaki kısım)
 * kullanılır. Anahtar sunucuya adresle gönderilmez (# kısmı tarayıcıda kalır); yalnızca iki veritabanı
 * işlevine parametre olarak verilir: link_get (programı ve son kayıtları okur) ve link_log (günlük kayıt).
 * Bu sayfa danışanın adını, tanısını, seans ya da ses verisini göstermez ve bunlara erişemez.
 * Ekrana basılan tüm metinler textContent ile eklenir.
 */
import { PUBLIC_CLOUD } from './data/cloud.public.js';
import { LIBS } from './lib/cdn.js';
import { homeSummary } from './core/plan/goals.js';

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
};
const DAY = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const SLOTS = [['sabah', 'Sabah'], ['ogle', 'Öğle'], ['aksam', 'Akşam']];
const QUICK = ['Kolay geçti', 'Biraz zorlandık', 'İsteksizdi', 'Çok keyifliydi'];
const str = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : '');

async function getClient() {
  if (window.__morphologaiTestClient && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return window.__morphologaiTestClient;
  let cfg = null;
  try {
    const r = await fetch('/api/config', { cache: 'no-store', headers: { accept: 'application/json' } });
    if (r.ok) { const j = await r.json(); if (j?.supabase?.url && j?.supabase?.anonKey) cfg = j.supabase; }
  } catch { /* yerleşik ayara düş */ }
  if (!cfg && PUBLIC_CLOUD.url && PUBLIC_CLOUD.anonKey) cfg = PUBLIC_CLOUD;
  if (!cfg) throw new Error('Bağlantı ayarı bulunamadı.');
  const { createClient } = await import(LIBS.supabase);
  return createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Sayfayı kurar. Testlerde doğrudan çağrılabilir. */
export async function mountTakip(root, client, token) {
  const show = (...kids) => { root.replaceChildren(...kids.flat().filter(Boolean)); };
  const fail = (title, text) => show(el('div', { class: 't-card t-center' }, el('h1', { text: title }), el('p', { class: 't-muted', text })));
  if (!/^[0-9a-f]{32,64}$/.test(token || '')) { fail('Bağlantı geçersiz', 'Terapistinizin gönderdiği bağlantıyı eksiksiz açtığınızdan emin olun.'); return; }

  const res = await client.rpc('link_get', { p_token: token });
  if (res.error) { fail('Şu anda açılamıyor', /Çok fazla/.test(res.error.message || '') ? 'Çok fazla deneme yapıldı. Bir süre sonra yeniden deneyin.' : 'İnternet bağlantınızı kontrol edip sayfayı yenileyin.'); return; }
  const data = res.data;
  if (!data) { fail('Bağlantı artık geçerli değil', 'Bağlantının süresi dolmuş ya da iptal edilmiş olabilir. Terapistinizden yeni bir bağlantı isteyin.'); return; }

  const home = data.home && typeof data.home === 'object' ? data.home : {};
  const logs = Array.isArray(data.logs) ? data.logs.map((l) => ({ day: str(String(l.day), 10), done: !!l.done, slot: str(l.slot, 10), note: str(l.note, 500) })) : [];
  const today = str(String(data.today || ''), 10) || new Date().toISOString().slice(0, 10);
  const [ty, tm, td] = today.split('-').map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  const mine = logs.find((l) => l.day === today) || { day: today, done: null, slot: '', note: '' };

  const saveMsg = el('div', { class: 't-save', 'aria-live': 'polite' });
  const weekHost = el('div');
  const drawWeek = () => {
    const s = homeSummary(logs, todayDate);
    weekHost.replaceChildren(
      el('div', { class: 't-week' }, s.days.map((d) => {
        const [y, m, dd] = d.day.split('-').map(Number);
        const cls = `t-day${d.done === true ? ' done' : d.done === false ? ' miss' : ''}${d.day === today ? ' today' : ''}`;
        return el('div', { class: cls }, el('span', { text: d.done === true ? '✓' : d.done === false ? '–' : '' }), DAY[new Date(y, m - 1, dd).getDay()]);
      })),
      el('div', { class: 't-stats' }, el('div', {}, el('b', { text: `${s.streak} gün` }), 'üst üste'), el('div', {}, el('b', { text: `%${s.weekPct}` }), 'bu hafta')));
  };

  let timer = 0;
  const save = () => {
    if (mine.done == null) return;
    clearTimeout(timer);
    saveMsg.className = 't-save';
    saveMsg.textContent = 'Kaydediliyor…';
    timer = setTimeout(async () => {
      const r = await client.rpc('link_log', { p_token: token, p_day: today, p_done: mine.done, p_slot: mine.done ? mine.slot : '', p_note: mine.note });
      if (r.error || r.data === false) { saveMsg.className = 't-save err'; saveMsg.textContent = 'Kaydedilemedi. İnternetinizi kontrol edip yeniden deneyin.'; return; }
      const i = logs.findIndex((l) => l.day === today);
      const rec = { ...mine };
      if (i === -1) logs.push(rec); else logs[i] = rec;
      saveMsg.className = 't-save ok';
      saveMsg.textContent = 'Kaydedildi ✓';
      drawWeek();
    }, 500);
  };

  const yes = el('button', { class: 't-btn yes', type: 'button', text: 'Yaptık' });
  const no = el('button', { class: 't-btn no', type: 'button', text: 'Yapamadık' });
  const slotRow = el('div', { class: 't-row' });
  const slotBtns = SLOTS.map(([id, label]) => el('button', { class: 't-chip', type: 'button', text: label, on: { click: () => { mine.slot = mine.slot === id ? '' : id; sync(); save(); } } }));
  slotRow.append(...slotBtns);
  const note = el('textarea', { maxlength: '500', placeholder: 'Bugün nasıl geçti? (isteğe bağlı)', 'aria-label': 'Günün notu' });
  note.value = mine.note;
  const sync = () => {
    yes.classList.toggle('on', mine.done === true);
    no.classList.toggle('on', mine.done === false);
    yes.setAttribute('aria-pressed', String(mine.done === true));
    no.setAttribute('aria-pressed', String(mine.done === false));
    slotRow.hidden = mine.done !== true;
    slotBtns.forEach((b, i) => b.classList.toggle('on', mine.slot === SLOTS[i][0]));
  };
  yes.addEventListener('click', () => { mine.done = true; sync(); save(); });
  no.addEventListener('click', () => { mine.done = false; mine.slot = ''; sync(); save(); });
  note.addEventListener('input', () => { mine.note = note.value.slice(0, 500); save(); });
  const quick = el('div', { class: 't-row' }, QUICK.map((q) => el('button', { class: 't-chip', type: 'button', text: q, on: { click: () => { note.value = (note.value ? `${note.value.trim()} ` : '') + q; note.dispatchEvent(new Event('input')); } } })));

  const list = (title, items, render) => (items.length ? el('section', { class: 't-card' }, el('h2', { text: title }), el('ul', { class: 't-list' }, items.map(render))) : null);
  const tasks = (Array.isArray(home.tasks) ? home.tasks : []).slice(0, 30);
  const homework = (Array.isArray(home.homework) ? home.homework : []).slice(0, 30);
  const advice = (Array.isArray(home.advice) ? home.advice : []).slice(0, 30);

  sync();
  drawWeek();
  show(
    el('header', {}, el('h1', { text: 'Ev Programı' }), el('p', { class: 't-muted', text: todayDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }) })),
    el('section', { class: 't-card' }, el('h2', { text: 'Bugün çalıştınız mı?' }), el('div', { class: 't-row' }, yes, no),
      el('div', { style: 'margin-top:12px' }, slotRow), el('div', { style: 'margin-top:12px' }, note), el('div', { style: 'margin-top:8px' }, quick), saveMsg),
    el('section', { class: 't-card' }, el('h2', { text: 'Son 7 gün' }), weekHost),
    list('Günlük ev çalışmaları', tasks, (t) => el('li', {}, el('b', { text: str(t?.title, 160) }), t?.freq ? el('div', { class: 't-sub', text: str(t.freq, 120) }) : null, t?.note ? el('div', { class: 't-sub', text: str(t.note, 600) }) : null)),
    list('Ödevler', homework, (t) => el('li', {}, t?.how ? el('details', {}, el('summary', { text: str(t?.title, 160) }), el('div', { class: 't-sub', text: str(t.how, 1200) })) : el('b', { text: str(t?.title, 160) }))),
    list('Terapistinizin önerileri', advice, (t) => el('li', { text: str(typeof t === 'string' ? t : t?.text, 600) })),
    str(home.note, 2000) ? el('section', { class: 't-card' }, el('h2', { text: 'Terapistinizden not' }), el('div', { class: 't-sub', text: str(home.note, 2000) })) : null,
    el('p', { class: 't-muted t-center', text: 'Bu bağlantı size özeldir; başkalarıyla paylaşmayın. Acil bir durumda bu sayfayı değil, sağlık kuruluşunu arayın.' }));
}

if (typeof document !== 'undefined' && document.getElementById('takip')) {
  const root = document.getElementById('takip');
  const token = location.hash.replace(/^#/, '').trim();
  getClient().then((c) => mountTakip(root, c, token)).catch(() => {
    root.replaceChildren(el('div', { class: 't-card t-center' }, el('h1', { text: 'Şu anda açılamıyor' }), el('p', { class: 't-muted', text: 'İnternet bağlantınızı kontrol edip sayfayı yenileyin.' })));
  });
}
