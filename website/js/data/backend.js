/**
 * Veri altyapısı seçimi: yerel (IndexedDB) ya da bulut (Supabase).
 *
 * Yapılandırma /api/config adresinden okunur:
 *   - Vercel'de: api/config.js, proje ortam değişkenlerinden (SUPABASE_URL, SUPABASE_ANON_KEY)
 *   - Yerelde:   tools/serve.ps1, proje kökündeki .env.local dosyasından
 * Supabase ayarı yoksa uygulama yerel modda (bu tarayıcıdaki veritabanı) çalışır.
 * Son başarılı yapılandırma saklanır; ağ geçici olarak yoksa onunla devam edilir.
 */
import { LIBS } from '../lib/cdn.js';
import { PUBLIC_CLOUD } from './cloud.public.js';

const CACHE_KEY = 'morphologai.cloud.config.v1';
const EPHEMERAL_KEY = 'morphologai.cloud.ephemeral';
const ALIVE_KEY = 'morphologai.cloud.alive';

export const backend = {
  /** 'local' | 'cloud' */
  mode: 'local',
  supabase: null,
  config: null,
  /** Yapılandırma kaynağı: 'server' | 'cache' | 'none' | 'test' */
  source: 'none',
  error: null,
  /** Parola sıfırlama bağlantısıyla gelindi mi? */
  recovery: false,
  /** Uygulama içinden kayıt açık mı? (yerel modda her zaman; bulutta yapılandırmaya bağlı) */
  allowSignup: true,
  /** Testlerde yükleme parça boyutları */
  tuning: null,
  listeners: new Set(),
  onAuth(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  get isCloud() { return this.mode === 'cloud'; },
  get projectHost() {
    try { return this.config?.url ? new URL(this.config.url).host : ''; } catch { return ''; }
  },
};

async function fetchConfig() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch('/api/config', { cache: 'no-store', signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (r.status === 404) return { supabase: null };
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.includes('json')) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}
function writeCache(cfg) {
  try {
    if (cfg?.supabase) localStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* yok say */ }
}

/** Uygulama adresi (e-posta bağlantılarının döneceği yer). */
export function appUrl() {
  return `${location.origin}${location.pathname}`;
}

/**
 * Altyapıyı başlatır.
 * @param {{client?: object}} opts  testlerde hazır (sahte) istemci verilebilir
 */
export async function initBackend({ client = null, tuning = null } = {}) {
  backend.tuning = tuning;
  // Yalnız yerel geliştirme sayfası (dev/cloud-app.html, yayına alınmaz) sahte istemci verir
  if (!client && typeof window !== 'undefined' && window.__morphologaiTestClient && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    client = await window.__morphologaiTestClient;
  }
  if (client) {
    Object.assign(backend, { mode: 'cloud', supabase: client, config: { url: 'https://test.supabase.co' }, source: 'test', error: null });
    return backend;
  }
  let cfg = await fetchConfig();
  let source = 'server';
  if (!cfg) {
    cfg = readCache();
    source = cfg ? 'cache' : 'none';
  } else {
    writeCache(cfg);
  }
  let sb = cfg?.supabase;
  // Sunucu yapılandırması yoksa yerleşik (herkese açık anon anahtarlı) proje kullanılır
  if ((!sb || !sb.url || !sb.anonKey) && PUBLIC_CLOUD.url && PUBLIC_CLOUD.anonKey) {
    sb = PUBLIC_CLOUD;
    source = 'builtin';
  }
  if (!sb || !sb.url || !sb.anonKey) {
    Object.assign(backend, { mode: 'local', supabase: null, config: null, source: 'none' });
    return backend;
  }
  backend.mode = 'cloud';
  backend.config = { url: sb.url, anonKey: sb.anonKey };
  backend.allowSignup = typeof cfg?.allowSignup === 'boolean' ? cfg.allowSignup : !!PUBLIC_CLOUD.allowSignup;
  backend.source = source;
  try {
    const { createClient } = await import(LIBS.supabase);
    backend.supabase = createClient(sb.url, sb.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'morphologai.sb.auth' },
      global: { headers: { 'x-client-info': 'morphologai-web' } },
    });
  } catch (err) {
    backend.error = new Error(`Bulut kütüphanesi yüklenemedi (${err.message || err}). İnternet bağlantınızı kontrol edip sayfayı yenileyin.`);
    return backend;
  }
  backend.supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') backend.recovery = true;
    for (const fn of backend.listeners) { try { fn(event, session); } catch { /* yok say */ } }
  });
  // "Beni hatırla" işaretlenmediyse tarayıcı kapanınca oturumu kapat
  try {
    if (localStorage.getItem(EPHEMERAL_KEY) && !sessionStorage.getItem(ALIVE_KEY)) {
      await backend.supabase.auth.signOut({ scope: 'local' });
      localStorage.removeItem(EPHEMERAL_KEY);
    }
  } catch { /* yok say */ }
  // E-posta bağlantısından dönüldüyse (?code=… / hata) oturum kurulmasını bekle ve adresi temizle
  const qs = new URLSearchParams(location.search);
  if (qs.has('code') || qs.has('error_description') || qs.has('error')) {
    try { await backend.supabase.auth.getSession(); } catch { /* yok say */ }
    backend.urlError = qs.get('error_description') || null;
    history.replaceState(null, '', `${location.pathname}${location.hash || '#/'}`);
  }
  return backend;
}

/** "Beni hatırla" tercihini uygular (bulut modu). */
export function setRemember(remember) {
  try {
    if (remember) { localStorage.removeItem(EPHEMERAL_KEY); sessionStorage.removeItem(ALIVE_KEY); }
    else { localStorage.setItem(EPHEMERAL_KEY, '1'); sessionStorage.setItem(ALIVE_KEY, '1'); }
  } catch { /* yok say */ }
}

/** Supabase / PostgREST hatalarını anlaşılır Türkçe iletiye çevirir. */
export function cloudError(error, fallback) {
  if (!error) return new Error(fallback || 'Bilinmeyen hata');
  const msg = String(error.message || error.error_description || error || '');
  const code = error.code || '';
  const out = (m) => { const e = new Error(m); e.code = code; e.cause = error; return e; };
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) return out('Bulut veritabanına bağlanılamadı; internet bağlantınızı kontrol edin.');
  if (/Invalid login credentials/i.test(msg)) return out('E-posta veya parola hatalı.');
  if (/Email not confirmed/i.test(msg)) return out('E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzdaki doğrulama bağlantısına tıklayın.');
  if (/already registered|already been registered|User already exists/i.test(msg)) return out('Bu e-posta adresiyle kayıtlı bir hesap zaten var.');
  if (/should be different from the old password/i.test(msg)) return out('Yeni parola eskisinden farklı olmalı.');
  if (/Password should be at least|weak password/i.test(msg)) return out('Parola yeterince güçlü değil (en az 8 karakter; harf ve rakam kullanın).');
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(msg) || error.status === 429) return out('Çok fazla deneme yapıldı; birkaç dakika sonra tekrar deneyin.');
  if (/signups? not allowed|Signups not allowed/i.test(msg)) return out('Bu projede yeni kayıt kapalı. Supabase → Authentication → Sign In / Providers bölümünden e-posta ile kaydı açın.');
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883' || /schema cache|does not exist/i.test(msg)) {
    return out('Bulut veritabanı şeması kurulmamış görünüyor. Supabase panelinde SQL Editor\'da supabase/schema.sql dosyasını çalıştırın.');
  }
  // Şemadaki fonksiyonların kendi (Türkçe) iletileri olduğu gibi gösterilir
  if (/[çğıöşüÇĞİÖŞÜ]/.test(msg)) return out(msg);
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return out('Bu işlem için yetkiniz yok.');
  if (code === '23505') return out(fallback || 'Bu kayıt zaten var.');
  if (code === 'PGRST116') return out(fallback || 'Kayıt bulunamadı.');
  if (/JWT expired|invalid JWT|refresh_token/i.test(msg)) return out('Oturumunuzun süresi doldu; lütfen yeniden giriş yapın.');
  return out(msg || fallback || 'Bulut işlemi başarısız oldu.');
}
