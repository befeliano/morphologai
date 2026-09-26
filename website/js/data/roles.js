/** Roller, yetkiler ve ekip varsayılan ayarları (yerel ve bulut altyapısı için ortak). */
import { DEFAULT_SETTINGS } from '../core/analysis.js';

export const ROLES = {
  owner: { label: 'Ekip sahibi', rank: 4, description: 'Tüm yetkiler; ekibi yönetir ve silebilir.' },
  admin: { label: 'Yönetici', rank: 3, description: 'Üyeleri ve tüm verileri yönetir.' },
  clinician: { label: 'Klinisyen (DKT)', rank: 2, description: 'Danışan ve seans oluşturur, düzenler.' },
  viewer: { label: 'Gözlemci / Araştırmacı', rank: 1, description: 'Yalnızca görüntüler ve anonim dışa aktarım yapar.' },
};

// Bulut şemasındaki RLS kuralları (supabase/schema.sql) bu düzeylerle aynıdır.
const PERMS = {
  'patient.write': 2,
  'session.write': 2,
  'session.delete': 2,
  'lexicon.write': 2,
  'export': 1,
  'member.manage': 3,
  'org.manage': 3,
  'org.delete': 4,
  'settings.write': 3,
};

export function can(member, action) {
  if (!member || member.status !== 'active') return false;
  const need = PERMS[action] ?? 4;
  return (ROLES[member.role]?.rank || 0) >= need;
}

export function defaultOrgSettings() {
  return {
    analysis: { ...DEFAULT_SETTINGS },
    transcription: { engine: 'webspeech', whisperModel: 'onnx-community/whisper-small', preferLocal: true },
    recording: { format: 'wav' },
  };
}

/** Ekip ayarlarını eksik alanlar varsayılanla doldurulmuş hâle getirir. */
export function normalizeOrgSettings(settings) {
  const s = settings && typeof settings === 'object' && Object.keys(settings).length ? { ...settings } : defaultOrgSettings();
  s.analysis = { ...DEFAULT_SETTINGS, ...(s.analysis || {}) };
  return s;
}

/** E-posta karşılaştırması için biçim (yerel ayardan bağımsız küçük harf: "I" → "i"). */
export const normEmail = (e) => String(e || '').trim().toLowerCase();
