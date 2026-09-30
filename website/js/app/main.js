/**
 * MorphologAI — uygulama başlatıcı ve yönlendirici.
 */
import { openDB, requestPersistence } from '../data/db.js';
import { backend, initBackend } from '../data/backend.js';
import { ensureSeed, loadContext, can, logout, switchOrg, setNewPassword } from '../data/auth.js';
import { createRepo } from '../data/repo.js';
import { loadLexicon, isLexiconReady } from '../core/text/lexicon.js';
import { setOverrides } from '../core/text/morphology.js';
import { normsFromControls } from '../core/metrics/screening.js';
import { h, mount, toast, confirmDialog, closePopovers, modal, field, icon } from './ui/dom.js';
import { renderShell, updateShellActive } from './layout.js';
import { refreshChartsTheme } from './ui/charts.js';

const ROUTES = [
  { path: '/giris', load: () => import('./views/login.js'), public: true, bare: true },
  { path: '/kayit', load: () => import('./views/login.js'), public: true, bare: true, props: { mode: 'register' } },
  { path: '/', load: () => import('./views/dashboard.js'), nav: 'dashboard' },
  { path: '/danisanlar', load: () => import('./views/patients.js'), nav: 'patients' },
  { path: '/danisan/:id', load: () => import('./views/patient.js'), nav: 'patients' },
  { path: '/seans/yeni', load: () => import('./views/newSession.js'), nav: 'new' },
  { path: '/seans/:id', load: () => import('./views/session.js'), nav: 'sessions' },
  { path: '/seanslar', load: () => import('./views/sessions.js'), nav: 'sessions' },
  { path: '/analiz', load: () => import('./views/analytics.js'), nav: 'analytics' },
  { path: '/ongoru', load: () => import('./views/study.js'), nav: 'study' },
  { path: '/ongoru/:id', load: () => import('./views/studySession.js'), nav: 'study' },
  { path: '/ekip', load: () => import('./views/team.js'), nav: 'team' },
  { path: '/ayarlar', load: () => import('./views/settings.js'), nav: 'settings' },
  { path: '/yontem', load: () => import('./views/methods.js'), nav: 'methods' },
];

function matchRoute(path) {
  for (const r of ROUTES) {
    const pa = r.path.split('/').filter(Boolean);
    const pb = path.split('/').filter(Boolean);
    if (pa.length !== pb.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pa.length; i++) {
      if (pa[i].startsWith(':')) params[pa[i].slice(1)] = decodeURIComponent(pb[i]);
      else if (pa[i] !== pb[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

// ---------------------------------------------------------------------------
const THEME_KEY = 'morphologai.theme';
export function applyTheme(t) {
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}
function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const app = {
  backend,
  ctx: null,
  repo: null,
  root: null,
  outlet: null,
  cleanup: null,
  guard: null,
  normsCache: new Map(),
  lexiconPromise: null,

  can(action) { return can(this.ctx?.member, action); },
  get settings() { return this.ctx?.org?.settings?.analysis || {}; },
  get orgSettings() { return this.ctx?.org?.settings || {}; },

  navigate(hash, { replace = false } = {}) {
    const target = hash.startsWith('#') ? hash : `#${hash}`;
    if (replace) history.replaceState(null, '', target);
    else if (location.hash !== target) { location.hash = target; return; }
    route();
  },

  async refreshContext() {
    this.ctx = await loadContext();
    this.repo = this.ctx && this.ctx.org ? createRepo(this.ctx) : null;
    this.normsCache.clear();
    if (this.repo) setOverrides(await this.repo.lexicon.map());
  },

  toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* yok say */ }
    refreshChartsTheme();
    return next;
  },
  theme: currentTheme,

  async logout() {
    if (!(await this.checkGuard())) return;
    await logout();
    this.ctx = null;
    this.repo = null;
    this.navigate('/giris');
  },

  async switchOrg(orgId) {
    if (!(await this.checkGuard())) return;
    await switchOrg(orgId);
    await this.refreshContext();
    toast(`Aktif ekip: ${this.ctx.org.name}`, 'success');
    renderAppShell();
    route();
  },

  /** Çalışan kayıt vb. varken sayfadan ayrılmayı onaylat. */
  setGuard(fn) { this.guard = fn; },
  async checkGuard() {
    if (!this.guard) return true;
    const msg = this.guard();
    if (!msg) return true;
    const ok = await confirmDialog({ title: 'Sayfadan ayrılınsın mı?', message: msg, confirmText: 'Ayrıl', danger: true });
    if (ok) this.guard = null;
    return ok;
  },

  /** Sözlük hazır olana kadar bekler (ilk analiz öncesi). */
  async lexicon() {
    // Site kökü bu modülün konumundan hesaplanır (sayfa adresinden bağımsız)
    if (!this.lexiconPromise) this.lexiconPromise = loadLexicon(new URL('../../', import.meta.url).href);
    return this.lexiconPromise;
  },
  lexiconReady: () => isLexiconReady(),

  /** Kontrol grubu normları (aynı görev türü; en az 5 seans). */
  async norms(taskType) {
    if (!this.repo) return null;
    if (this.normsCache.has(taskType)) return this.normsCache.get(taskType);
    const patients = await this.repo.patients.list({ includeArchived: true });
    const controls = new Set(patients.filter((p) => p.group === 'control' && !p.demo).map((p) => p.id));
    const sessions = (await this.repo.sessions.list()).filter((s) => controls.has(s.patientId) && s.taskType === taskType && s.analysis);
    const n = normsFromControls(sessions.map((s) => s.analysis));
    this.normsCache.set(taskType, n);
    return n;
  },

  setCrumbs(items) { this.shellApi?.setCrumbs(items); },
  setActions(nodes) { this.shellApi?.setActions(nodes); },
  refreshCounts() { this.shellApi?.refreshCounts(); },
};
window.__morphologai = app;

function renderAppShell() {
  app.shellApi = renderShell(app.root, app);
  app.outlet = app.shellApi.outlet;
}

let routing = 0;
let lastHash = null;
async function route() {
  const my = ++routing;
  const { path, query } = parseHash();
  const m = matchRoute(path) || matchRoute('/');
  const { route: r, params } = m;
  if (lastHash !== null && lastHash !== location.hash && app.guard) {
    const ok = await app.checkGuard();
    if (!ok) { history.replaceState(null, '', lastHash); return; }
  }
  lastHash = location.hash;
  closePopovers();
  if (!r.public && !app.ctx) { app.navigate('/giris', { replace: true }); return; }
  if (app.ctx && !app.ctx.org && !r.public && r.path !== '/ayarlar' && r.path !== '/ekip') {
    // Hiçbir ekibe üye değil: ekip oluşturma ekranına
    if (r.path !== '/ekip') { app.navigate('/ekip', { replace: true }); return; }
  }
  if (app.cleanup) { try { app.cleanup(); } catch { /* yok say */ } app.cleanup = null; }
  app.guard = null;

  const bare = r.bare || !app.ctx;
  if (bare) {
    app.shellApi = null;
    mount(app.root, h('div.page-loading'));
    app.outlet = app.root;
  } else {
    if (!app.shellApi || !app.root.contains(app.shellApi.outlet)) renderAppShell();
    updateShellActive(app.shellApi, r.nav);
    app.setActions([]);
    app.setCrumbs([]);
    mount(app.outlet, h('div.row', { style: { padding: '40px 0', justifyContent: 'center' } }, h('div.spinner')));
  }
  try {
    const mod = await r.load();
    if (my !== routing) return;
    const res = await mod.render(app.outlet, { params, query, ...(r.props || {}) }, app);
    if (my !== routing) { if (typeof res === 'function') res(); return; }
    app.cleanup = typeof res === 'function' ? res : null;
    window.scrollTo({ top: 0 });
  } catch (err) {
    console.error(err);
    mount(app.outlet, h('div.card', null, h('div.card-body', null,
      h('div.callout.danger', null, h('b', null, 'Sayfa yüklenemedi: '), err.message || String(err)))));
  }
}

/**
 * Hareketsizlikte otomatik çıkış (paylaşılan hastane bilgisayarları için).
 * Süre bu tarayıcıya özeldir (Ayarlar → Profil); kayıt ya da işleme sürerken (app.guard) çıkış yapılmaz.
 */
export const IDLE_KEY = 'morphologai.idleMinutes';
export function idleMinutes() {
  try { const v = localStorage.getItem(IDLE_KEY); return v == null ? 30 : Number(v) || 0; } catch { return 30; }
}
function startIdleWatch() {
  let last = Date.now();
  const bump = () => { last = Date.now(); };
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, bump, { passive: true, capture: true });
  setInterval(async () => {
    const mins = idleMinutes();
    if (!mins || !app.ctx) { last = Date.now(); return; }
    if (app.guard && app.guard()) { last = Date.now(); return; }
    if (Date.now() - last < mins * 60000) return;
    closePopovers();
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
    await logout();
    app.ctx = null;
    app.repo = null;
    app.navigate('/giris');
    toast(`Güvenliğiniz için ${mins} dakika hareketsizlik sonrası oturum kapatıldı.`, 'info', 12000);
  }, 20000);
}

/** Başlangıç hatası ekranı (yeniden dene / çıkış). */
function bootError(title, message, { allowLogout = false } = {}) {
  const retry = h('button.btn.btn-primary', { on: { click: () => location.reload() } }, icon('refresh', 16), 'Yeniden dene');
  const out = allowLogout ? h('button.btn.btn-ghost', { on: { click: async () => { await logout(); location.reload(); } } }, icon('logout', 16), 'Çıkış yap') : null;
  mount(app.root, h('div', { style: { maxWidth: '620px', margin: '12vh auto', padding: '0 16px' } },
    h('div.card', null, h('div.card-body', { style: { padding: '28px' } },
      h('h2', { style: { fontSize: '20px', marginBottom: '10px' } }, title),
      h('div.callout.danger', null, icon('alert', 18), h('div', null, message)),
      h('div.row.mt-3', null, retry, out)))));
}

/** Parola sıfırlama bağlantısıyla gelindiğinde yeni parola iste. */
let recoveryShown = false;
function showRecoveryDialog() {
  if (recoveryShown) return;
  recoveryShown = true;
  const pw = h('input.input', { type: 'password', autocomplete: 'new-password' });
  const pw2 = h('input.input', { type: 'password', autocomplete: 'new-password' });
  modal({
    title: 'Yeni parolanızı belirleyin',
    body: h('div.stack', null, h('p.small.muted', null, 'Parola sıfırlama bağlantısıyla giriş yaptınız. Hesabınız için yeni bir parola belirleyin.'),
      field('Yeni parola', pw, 'En az 8 karakter.'), field('Yeni parola (tekrar)', pw2)),
    actions: [
      { label: 'Daha sonra' },
      {
        label: 'Parolayı kaydet', variant: 'btn-primary', icon: 'lock', onClick: async () => {
          if (pw.value !== pw2.value) { toast('Parolalar eşleşmiyor.', 'warning'); return false; }
          await setNewPassword(pw.value);
          toast('Parolanız güncellendi.', 'success');
          return true;
        },
      },
    ],
  });
}

async function boot() {
  try { applyTheme(localStorage.getItem(THEME_KEY) || 'system'); } catch { /* yok say */ }
  app.root = document.getElementById('app');
  await initBackend();
  if (backend.error) {
    bootError('Bulut bağlantısı kurulamadı', backend.error.message);
    return;
  }
  if (backend.mode === 'local') {
    try {
      await openDB();
      await ensureSeed();
    } catch (err) {
      bootError('Yerel veritabanı açılamadı', `Tarayıcınız gizli modda olabilir ya da site verisine izin verilmiyor olabilir. Ayrıntı: ${err.message || String(err)}`);
      return;
    }
    requestPersistence();
  }
  app.lexicon();
  try {
    await app.refreshContext();
  } catch (err) {
    console.error(err);
    bootError('Oturum yüklenemedi', err.message || String(err), { allowLogout: true });
    return;
  }
  if (backend.mode === 'cloud') {
    backend.onAuth((event) => {
      if (event === 'PASSWORD_RECOVERY') showRecoveryDialog();
      if (event === 'SIGNED_OUT' && app.ctx) {
        app.ctx = null;
        app.repo = null;
        app.navigate('/giris');
      }
    });
    if (backend.recovery) showRecoveryDialog();
    if (backend.urlError) toast(`E-posta bağlantısı: ${backend.urlError}`, 'error', 9000);
  }
  startIdleWatch();
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => {
    if (app.guard && app.guard()) { e.preventDefault(); e.returnValue = ''; }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => refreshChartsTheme());
  route();
}

export function routeNow() { route(); }
export default app;

boot();
