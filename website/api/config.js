/**
 * Vercel sunucu işlevi — istemci yapılandırması (GET /api/config).
 *
 * Supabase bağlantısı Vercel proje ortam değişkenlerinden okunur:
 *   SUPABASE_URL       = https://<proje>.supabase.co
 *   SUPABASE_ANON_KEY  = anon (public) ya da "publishable" anahtar
 * (Vercel'in Supabase entegrasyonunun eklediği NEXT_PUBLIC_* adları da tanınır.)
 *
 * Yalnızca tarayıcıda kullanılması güvenli olan herkese açık anahtar döndürülür; erişim
 * veritabanındaki satır düzeyi güvenlik kurallarıyla sınırlıdır. service_role / secret
 * anahtar yanlışlıkla girilirse asla gönderilmez.
 */
function isSecretKey(key) {
  if (/^sb_secret_/i.test(key)) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload && payload.role === 'service_role';
  } catch {
    return false;
  }
}

module.exports = function handler(req, res) {
  const env = process.env;
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_KEY || '').trim();
  res.setHeader('Cache-Control', 'no-store');
  if (!url || !key) {
    res.status(200).json({ supabase: null, version: 1 });
    return;
  }
  if (!/^https:\/\/[^/\s]+$/i.test(url)) {
    res.status(500).json({ supabase: null, error: 'SUPABASE_URL geçersiz (https://<proje>.supabase.co biçiminde olmalı).' });
    return;
  }
  if (isSecretKey(key)) {
    res.status(500).json({ supabase: null, error: 'Gizli (service_role) anahtar tanımlanmış. Vercel\'de SUPABASE_ANON_KEY olarak yalnızca anon/publishable anahtarı kullanın.' });
    return;
  }
  // Uygulama içi kayıt varsayılan olarak kapalıdır (hesaplar Supabase panelinden açılır)
  const signup = String(env.MORPHOLOGAI_ALLOW_SIGNUP || '').trim().toLowerCase();
  res.status(200).json({ supabase: { url, anonKey: key }, ...(signup ? { allowSignup: signup === 'true' } : {}), version: 1 });
};
