/**
 * Öngörü çalışması — ortak yardımcılar (liste ve örneklem sayfaları, kayıt hattı).
 *
 * session.study = {
 *   protocol: 'kaza-v1', wave: 'baseline' | 'followup', baselineId?, followUpId?,
 *   features, detail, featuresAt,                  // son hesaplanan protokol ölçütleri
 *   ai: { items:{id:{score,z}}, composite, risk, confidence, model, locked, lockedAt,   // kilitli program tahmini
 *         domains:{semantic:{p,z,level}, …}, profile },                               // alan bazlı öngörü ve örüntü türü
 *   ratings: { [userId]: { name, items:{id:0..3}, risk:0..1, predicted:boolean, domains:{id:0..3}, profile, notes, unblinded, at } },
 *   outcome: { status:'developed'|'not_developed'|'unclear', category, method, domains:[id], profile, date, notes, by, at },
 *   speakers: { examiner, participant, bySource, pitch }
 * }
 * Program tahmini, ilk DKT değerlendirmesi kaydedildiğinde kilitlenir: sonraki transkript düzeltmeleri
 * ekranda "güncel" değeri değiştirir ama doğruluk hesabı kilitli (önceden yapılmış) tahmine dayanır.
 */
import { analyzeSession } from '../core/analysis.js';
import { computeFluency } from '../core/metrics/fluency.js';
import { computeProtocolMeasures, ACCIDENT_IU, PROTOCOL_ID } from '../core/metrics/discourse.js';
import { scoreSample, buildNorms, fitTeamModel, narrative, domainReasoning, profileReasoning, DEFAULT_MODEL } from '../core/metrics/prognosis.js';
import { ageAt } from '../core/metrics/cohort.js';

export { PROTOCOL_ID };
export const YEAR_MS = 365.25 * 86400000;
export const isStudy = (s) => s?.study?.protocol === PROTOCOL_ID;
export const iuLabel = (id) => ACCIDENT_IU.find((u) => u.id === id)?.label || id;

export const OUTCOMES = [
  { id: 'not_developed', label: 'Gerileme gelişmedi', developed: false },
  { id: 'developed', label: 'Gerileme / bozukluk gelişti', developed: true },
  { id: 'unclear', label: 'Belirsiz (değerlendirmeye alınmaz)', developed: null },
];
export const OUTCOME_CATEGORIES = [
  { id: 'none', label: 'Yok (sağlıklı)' },
  { id: 'scd', label: 'Öznel bilişsel yakınma' },
  { id: 'mci', label: 'Hafif bilişsel bozukluk (HBB/MCI)' },
  { id: 'ad', label: 'Alzheimer tipi demans' },
  { id: 'dementia', label: 'Demans (diğer)' },
  { id: 'ppa', label: 'Primer progresif afazi' },
  { id: 'other', label: 'Başka konuşma-dil bozukluğu' },
];
export const OUTCOME_METHODS = [
  { id: 'clinical', label: 'Klinik değerlendirme (DKT / nöroloji)' },
  { id: 'biomarker', label: 'Biyobelirteçle doğrulanmış (BOS, PET)' },
  { id: 'test', label: 'Standart test puanı (ör. MoCA, MMSE)' },
  { id: 'followup_sample', label: 'İzlem konuşma örneğine göre' },
];

export function dueDate(session) {
  return new Date(new Date(session.recordedAt || session.createdAt).getTime() + YEAR_MS);
}

/** Çalışma bağlamı: örneklemler, normlar (kontrol grubu) ve ekip modeli. */
export async function loadStudyContext(app) {
  const [patients, sessions] = await Promise.all([app.repo.patients.list({ includeArchived: true }), app.repo.sessions.list()]);
  const byId = new Map(patients.map((p) => [p.id, p]));
  const study = sessions.filter(isStudy);
  const controls = study.filter((s) => s.study.wave === 'baseline' && byId.get(s.patientId)?.group === 'control' && s.study.features && s.study.outcome?.status !== 'developed');
  const norms = buildNorms(controls.map((s) => s.study.features));
  const cases = study.filter((s) => s.study.wave === 'baseline' && s.study.ai?.composite != null && s.study.outcome && s.study.outcome.status !== 'unclear').map((s) => {
    const p = byId.get(s.patientId);
    return { composite: s.study.ai.composite, age: ageAt(p, s), education: p?.education, developed: s.study.outcome.status === 'developed' };
  });
  const team = fitTeamModel(cases);
  return { patients, byId, sessions, study, norms, team, model: team.used ? team.model : DEFAULT_MODEL };
}

/** Bir örneklemi transkriptten yeniden hesaplar (analiz + protokol ölçütleri + program puanı + yorum). */
export function computeStudy(app, session, patient, sctx, { text } = {}) {
  const transcript = text ?? session.transcript?.text ?? '';
  if (!transcript.trim()) return null;
  const result = analyzeSession({ transcript, acoustic: session.acoustic, settings: app.settings, corrections: session.corrections || {}, final: true });
  if (!result.fluency && session.acoustic) result.fluency = computeFluency(session.acoustic, result.language, app.settings);
  const measures = computeProtocolMeasures(result, { segments: session.transcript?.segments || [], acoustic: session.acoustic });
  const scored = scoreSample(measures.features, {
    norms: sctx.norms.norms, age: ageAt(patient, session), education: patient?.education, model: sctx.model, verified: session.status === 'verified',
  });
  const ctx = { iuLabel, verified: session.status === 'verified' };
  const text2 = narrative(measures.features, measures.detail, scored, ctx);
  const reasoning = domainReasoning(scored, measures.features, measures.detail, ctx);
  return { result, measures, scored, text: text2, reasoning, profileText: profileReasoning(scored) };
}

/** Alan düzeyinde "bozulma bekleniyor" kararı: program p ≥ %50, DKT "kuvvetle olası" ya da "kesin". */
export const programDomainPositive = (d) => (d?.p == null ? null : d.p >= 0.5);
export const raterDomainPositive = (level) => (Number.isInteger(level) ? level >= 2 : null);

/**
 * İzlem sonucunda bozulan alanlar: "gelişmedi" → hiçbiri; "gelişti" → işaretlenen alanlar
 * (hiç işaretlenmediyse alan bilgisi yok sayılır); "belirsiz" → değerlendirilmez.
 */
export function outcomeDomainSet(outcome) {
  if (!outcome || outcome.status === 'unclear') return null;
  if (outcome.status === 'not_developed') return new Set();
  return Array.isArray(outcome.domains) && outcome.domains.length ? new Set(outcome.domains) : null;
}

/** Program ve DKT alan tahminleri → {id: boolean|null}. */
export const programDomainPreds = (ai) => Object.fromEntries(Object.entries(ai?.domains || {}).map(([k, d]) => [k, programDomainPositive(d)]));
export const raterDomainPreds = (r) => Object.fromEntries(Object.entries(r?.domains || {}).map(([k, v]) => [k, raterDomainPositive(v)]));

/** Alan isabeti: tahmin edilen her alanın sonuçla uyuşması. */
export function domainAccuracy(preds, outSet) {
  if (!outSet) return null;
  let correct = 0;
  let total = 0;
  for (const [k, v] of Object.entries(preds || {})) {
    if (v == null) continue;
    total++;
    if (v === outSet.has(k)) correct++;
  }
  return total ? { correct, total } : null;
}

/** Program tahmininin saklanacak özeti. */
export function aiSnapshot(scored) {
  return {
    items: Object.fromEntries(scored.items.map((i) => [i.id, { score: i.score, z: i.z == null ? null : Number(i.z.toFixed(3)) }])),
    composite: scored.composite == null ? null : Number(scored.composite.toFixed(4)),
    risk: scored.risk == null ? null : Number(scored.risk.toFixed(4)),
    confidence: scored.confidence,
    model: scored.model,
    domains: Object.fromEntries((scored.domains || []).map((d) => [d.id, {
      p: d.p == null ? null : Number(d.p.toFixed(4)), z: d.z == null ? null : Number(d.z.toFixed(3)), level: d.level,
    }])),
    profile: scored.profile?.id || null,
    at: new Date().toISOString(),
  };
}

/**
 * Örneklemin study alanını güvenle günceller: kaydetmeden hemen önce en güncel kaydı okur
 * (aynı anda değerlendiren DKT'lerin puanları birbirinin üzerine yazılmasın).
 */
export async function updateStudy(app, sessionId, mutate) {
  const fresh = await app.repo.sessions.get(sessionId);
  if (!fresh) throw new Error('Örneklem bulunamadı.');
  const study = { ...(fresh.study || {}), ratings: { ...(fresh.study?.ratings || {}) } };
  mutate(study, fresh);
  return app.repo.sessions.save({ ...fresh, study });
}

/** Değerlendiricilerin ortalama puanı (madde başına) ve ortalama risk. */
export function ratingSummary(study) {
  const list = Object.values(study?.ratings || {});
  if (!list.length) return null;
  const items = {};
  const domains = {};
  for (const r of list) for (const [k, v] of Object.entries(r.items || {})) if (Number.isInteger(v)) (items[k] = items[k] || []).push(v);
  for (const r of list) for (const [k, v] of Object.entries(r.domains || {})) if (Number.isInteger(v)) (domains[k] = domains[k] || []).push(v);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  return {
    n: list.length,
    items: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, mean(v)])),
    domains: Object.fromEntries(Object.entries(domains).map(([k, v]) => [k, mean(v)])),
    risk: list.filter((r) => r.risk != null).length ? mean(list.filter((r) => r.risk != null).map((r) => r.risk)) : null,
  };
}
