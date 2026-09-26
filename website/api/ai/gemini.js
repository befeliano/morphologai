/**
 * Vercel sunucu işlevi — Gemini vekil (proxy). ŞU AN KAPALI.
 *
 * Etkinleştirmek için Vercel proje ayarlarında şu ortam değişkenlerini tanımlayın:
 *   MORPHOLOGAI_AI_ENABLED = true
 *   GEMINI_API_KEY         = <Google AI Studio anahtarı>
 * ve istemcide js/ai/gemini.js içindeki AI_ENABLED değerini true yapın.
 *
 * Güvenlik
 *  - API anahtarı yalnız sunucuda tutulur, tarayıcıya gönderilmez.
 *  - İstek yalnızca oturum açmış bir kullanıcıdan kabul edilir: Authorization: Bearer <Supabase oturum belirteci>
 *    belirteç Supabase Auth'a sorularak doğrulanır (bulut bağlantısı olmadan yapay zekâ çalışmaz).
 *  - Yalnız aynı kökenden (sitenin kendisinden) gelen POST istekleri; gövde boyutu sınırlı; model adı denetlenir.
 */
const MAX_BODY = 2 * 1024 * 1024;

async function verifyUser(req) {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const auth = String(req.headers.authorization || '');
  if (!url || !anon || !/^Bearer\s+[\w-]+\.[\w-]+\.[\w-]+$/.test(auth)) return null;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!r.ok) return null;
  const user = await r.json();
  return user && user.id ? user : null;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // aynı kökenli bazı istekler Origin göndermez
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.MORPHOLOGAI_AI_ENABLED !== 'true' || !process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: 'Yapay zekâ entegrasyonu etkin değil.' });
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Yalnızca POST.' });
    return;
  }
  if (!sameOrigin(req)) {
    res.status(403).json({ error: 'Kökene izin verilmiyor.' });
    return;
  }
  try {
    const user = await verifyUser(req);
    if (!user) {
      res.status(401).json({ error: 'Oturum gerekli.' });
      return;
    }
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (raw.length > MAX_BODY) {
      res.status(413).json({ error: 'İstek çok büyük.' });
      return;
    }
    const { model = 'gemini-2.5-pro', request } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!/^gemini-[\w.-]{1,40}$/.test(model) || !request || typeof request !== 'object') {
      res.status(400).json({ error: 'Geçersiz istek.' });
      return;
    }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(request),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Yapay zekâ isteği başarısız oldu.' });
  }
};
