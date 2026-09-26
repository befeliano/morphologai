/**
 * Gemini yapay zekâ entegrasyonu — HAZIR AMA PASİF
 * ===============================================
 *
 * Bu modül ileride seans sesinin ve transkriptin Google Gemini modeline gönderilip
 * nitel klinik yorum (söylem özellikleri, parafazi adayları, önerilen hedefler)
 * alınması için hazırlanmıştır. Şu an `AI_ENABLED = false` olduğu için arayüzde
 * yalnızca bilgi olarak görünür ve hiçbir veri gönderilmez.
 *
 * Etkinleştirmeden önce:
 *  1. Kurum/etik kurul onayı ve danışandan açık rıza (KVKK: sağlık verisi yurt dışına aktarım)
 *  2. API anahtarının istemcide değil bir sunucu işlevinde (Vercel /api) tutulması
 *  3. Aşağıdaki `GEMINI_CONFIG.model` değerinin güncel bir model kimliğiyle değiştirilmesi
 */

export const AI_ENABLED = false;

export const GEMINI_CONFIG = {
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  model: 'gemini-2.5-pro',
  proxyPath: '/api/ai/gemini', // önerilen: anahtarı sunucuda tutan Vercel işlevi
};

/** Modelden istenecek yapılandırılmış yanıtın şeması. */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ozet: { type: 'STRING', description: 'Konuşma örneğinin 3-5 cümlelik klinik özeti' },
    akicilik: { type: 'STRING', description: 'Akıcılık, duraksama, prozodi gözlemleri' },
    dilbilgisi: { type: 'STRING', description: 'Biçimbirim/sözdizimi gözlemleri (agramatizm vb.)' },
    sozcukErisimi: { type: 'STRING', description: 'Adlandırma güçlüğü, boş sözcük, dolaylı anlatım' },
    parafaziAdaylari: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { soylenen: { type: 'STRING' }, olasiHedef: { type: 'STRING' }, tur: { type: 'STRING' } } },
    },
    olasiOruntu: { type: 'STRING', description: 'Akıcı olmayan / akıcı / anomik / karma / tipik' },
    guven: { type: 'STRING', description: 'düşük / orta / yüksek' },
    terapiOnerileri: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['ozet', 'olasiOruntu', 'guven'],
};

export function buildPrompt({ transcript, metrics, task, patient }) {
  return [
    'Sen deneyimli bir dil ve konuşma terapistine yardımcı olan bir klinik dilbilim asistanısın.',
    'Aşağıdaki Türkçe bağlamlı konuşma örneğini afazi açısından değerlendir. Tanı koyma; gözlemlerini ve olası örüntüyü',
    'kanıtlarıyla birlikte, temkinli bir dille yaz. Yanıtı yalnızca istenen JSON şemasında ver.',
    '',
    `Görev: ${task || 'belirtilmedi'}`,
    patient ? `Danışan bilgisi (anonim): ${JSON.stringify(patient)}` : '',
    `Otomatik ölçütler (MorphologAI): ${JSON.stringify(metrics)}`,
    '',
    'Transkript (her satır bir sözce; T: terapist):',
    transcript,
  ].filter(Boolean).join('\n');
}

/**
 * Gemini generateContent isteği gövdesi. Ses isteğe bağlıdır (base64, en fazla ~20 MB satır içi).
 */
export function buildGeminiRequest({ transcript, metrics, task, patient, audioBase64 = null, mimeType = 'audio/wav' }) {
  const parts = [{ text: buildPrompt({ transcript, metrics, task, patient }) }];
  if (audioBase64) parts.push({ inline_data: { mime_type: mimeType, data: audioBase64 } });
  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };
}

/** PASİF: AI_ENABLED false olduğu sürece hata fırlatır; hiçbir ağ isteği yapılmaz. */
/**
 * Yalnızca sunucu vekili üzerinden çağrılır (API anahtarı tarayıcıya hiç gelmez).
 * Vekil, isteği yapan kullanıcının Supabase oturumunu doğrular; bu yüzden bulut bağlantısı gerekir.
 */
export async function callGemini({ request, model = GEMINI_CONFIG.model }) {
  if (!AI_ENABLED) throw new Error('Yapay zekâ entegrasyonu henüz etkin değil.');
  const { backend } = await import('../data/backend.js');
  if (!backend.isCloud) throw new Error('Yapay zekâ yorumu için bulut veritabanı bağlantısı ve oturum gerekir.');
  const { data: { session } } = await backend.supabase.auth.getSession();
  if (!session) throw new Error('Oturum bulunamadı; yeniden giriş yapın.');
  const res = await fetch(GEMINI_CONFIG.proxyPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ model, request }),
  });
  if (!res.ok) throw new Error(`Gemini isteği başarısız: ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? JSON.parse(text) : null;
}
