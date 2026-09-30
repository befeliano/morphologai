/**
 * Öngörü çalışması — tek örneklem: kör DKT değerlendirmesi, program değerlendirmesi,
 * bireysel karşılaştırma, 1 yıl sonraki izlem ve tahminlerin doğruluğu.
 */
import { h, mount, icon, num, badge, toast, field, select, emptyState, fmtDate, fmtDateTime, fmtDur, confirmDialog } from '../ui/dom.js';
import { taskOf } from '../constants.js';
import { createPlayer } from '../components/player.js';
import { lineChart } from '../ui/charts.js';
import { ACCIDENT_IU } from '../../core/metrics/discourse.js';
import {
  CLINICAL_ITEMS, FEATURE_DEFS, DOMAINS, SEVERITY, LANGUAGE_DOMAINS, DOMAIN_LEVELS, PROGRAM_DOMAIN_LEVELS, PROFILE_TYPES,
  monthlyProjection, followUpPlan,
} from '../../core/metrics/prognosis.js';
import { ageAt } from '../../core/metrics/cohort.js';
import {
  isStudy, loadStudyContext, computeStudy, aiSnapshot, updateStudy, ratingSummary, dueDate,
  OUTCOMES, OUTCOME_CATEGORIES, OUTCOME_METHODS, PROTOCOL_ID,
  programDomainPositive, raterDomainPositive, outcomeDomainSet, programDomainPreds, raterDomainPreds, domainAccuracy,
} from '../study.js';

const DOMAIN_SHORT = ['Yok', 'Olası', 'Kuvvetle', 'Kesin'];
const profileLabel = (id) => PROFILE_TYPES.find((t) => t.id === id)?.label || '—';

const pctTxt = (p) => (p == null ? '—' : `%${num(p * 100, 0)}`);
const fmtFeat = (k, v) => {
  const d = FEATURE_DEFS[k];
  if (v == null || !Number.isFinite(v)) return '—';
  return d?.pct ? `%${num(v * 100, 0)}` : num(v, d?.d ?? 2);
};
const riskTone = (p) => (p == null ? '' : p >= 0.5 ? 'danger' : p >= 0.25 ? 'warn' : 'ok');

export async function render(root, { params, query }, app) {
  app.setCrumbs([{ label: 'Öngörü çalışması', href: '#/ongoru' }, { label: 'Örneklem' }]);
  let session = await app.repo.sessions.get(params.id);
  if (!session) { mount(root, emptyState({ icon: 'target', title: 'Örneklem bulunamadı', text: 'Silinmiş olabilir ya da başka bir ekibe ait.' })); return; }
  if (!isStudy(session)) {
    const add = h('button.btn.btn-primary', { disabled: !app.can('session.write') }, icon('plus', 16), 'Başlangıç örneklemi olarak ekle');
    add.addEventListener('click', async () => {
      await updateStudy(app, session.id, (s) => { Object.assign(s, { protocol: PROTOCOL_ID, wave: 'baseline', ratings: s.ratings || {}, createdAt: new Date().toISOString() }); });
      render(root, { params, query }, app);
    });
    mount(root, h('div.card', null, h('div.card-body', null, emptyState({ icon: 'target', title: 'Bu seans çalışmaya dahil değil', text: 'Geçmiş bir kaydı (tercihen kaza resmi anlatımı) öngörü çalışmasına başlangıç örneklemi olarak ekleyebilirsiniz.', action: add }))));
    return;
  }
  const patient = await app.repo.patients.get(session.patientId);
  const sctx = await loadStudyContext(app);
  const audioRec = session.audioId ? await app.repo.audio.get(session.audioId) : null;
  await app.lexicon();
  const me = app.ctx.user.id;
  const canWrite = app.can('session.write');
  const study = session.study;
  const isBaseline = study.wave !== 'followup';
  const comp = computeStudy(app, session, patient, sctx);
  const current = comp ? aiSnapshot(comp.scored) : null;
  // Alan bazlı öngörü sonradan eklendi: daha önce kilitlenmiş ama sonucu girilmemiş örneklemlere
  // alan tahmini bir kez eklenir ve o anda kilitlenir (ayrı zaman damgasıyla)
  if (study.ai?.locked && !study.ai.domains && current?.domains && !study.outcome && canWrite) {
    const stamp = new Date().toISOString();
    try {
      session = await updateStudy(app, session.id, (s) => { if (s.ai && !s.ai.domains) Object.assign(s.ai, { domains: current.domains, profile: current.profile, domainsLockedAt: stamp }); });
      Object.assign(study.ai, { domains: current.domains, profile: current.profile, domainsLockedAt: stamp });
    } catch { /* salt okunur bağlantıda sessizce geç */ }
  }
  const ai = study.ai?.locked ? study.ai : current;
  const myRating = study.ratings?.[me] || null;
  let revealed = !!myRating || !canWrite || query.reveal === '1';
  const age = ageAt(patient, session);

  app.setCrumbs([{ label: 'Öngörü çalışması', href: '#/ongoru' }, { label: patient ? patient.code : 'Danışan', href: patient ? `#/danisan/${patient.id}` : null }, { label: isBaseline ? 'Başlangıç' : '1. yıl izlemi' }]);
  const cleanups = [];

  // ---- Eylemler ----
  const openSession = h('a.btn.btn-ghost.btn-sm', { href: `#/seans/${session.id}?tab=transcript` }, icon('edit', 15), 'Transkript ve kayıt');
  const follow = isBaseline && !study.followUpId && canWrite
    ? h('a.btn.btn-primary.btn-sm', { href: `#/seans/yeni?module=cognitive&task=accident&study=followup&baseline=${session.id}&patient=${session.patientId}` }, icon('repeat', 15), 'İzlem örneklemi al')
    : null;
  app.setActions([openSession, follow]);

  // ---- Başlık ----
  const due = dueDate(session);
  const daysLeft = Math.ceil((due - Date.now()) / 86400000);
  const head = h('div.page-head', null, h('div', null,
    h('div.eyebrow', null, icon('target', 14), `Öngörü çalışması · kaza resmi protokolü`),
    h('h1', null, patient ? patient.code : '—', h('span', { style: { fontWeight: 500, color: 'var(--muted)', fontSize: '19px', marginLeft: '10px' } }, fmtDateTime(session.recordedAt))),
    h('div.row.mt-1', null,
      isBaseline ? badge('Başlangıç örneklemi (0. ay)', 'info', true) : badge('1. yıl izlem örneklemi', 'info', true),
      session.status === 'verified' ? badge('Transkript doğrulandı', 'ok', true) : badge('Transkript taslak', 'warn', true),
      age != null ? badge(`${age} yaş`) : null,
      patient?.education != null ? badge(`${patient.education} yıl eğitim`) : null,
      isBaseline && !study.outcome ? badge(daysLeft > 0 ? `İzleme ${daysLeft} gün` : 'İzlem zamanı geldi', daysLeft > 0 ? 'outline' : 'warn') : null)));

  // ---- 1. Kayıt ve konuşmacılar ----
  let player = null;
  if (audioRec) {
    player = createPlayer({ blob: audioRec.blob, duration: session.acoustic?.durationSec, pauses: session.acoustic?.pauses || [] });
    cleanups.push(() => player.destroy());
  }
  const sp = study.speakers;
  const lines = (session.transcript?.text || '').split('\n').filter((l) => l.trim());
  const txPreview = h('div.utt-list', { style: { maxHeight: '260px', overflowY: 'auto' } },
    lines.length ? lines.map((l) => {
      const isT = /^\s*(\[\d{1,2}:\d{2}(?:[.,]\d)?\]\s*)?\*?(T|TER|DKT|INV|EXA|TERAPİST|TERAPIST)\s*:/i.test(l);
      return h('div.small', { style: { padding: '5px 8px', borderBottom: '1px solid var(--border)', color: isT ? 'var(--muted)' : 'var(--text)', fontStyle: isT ? 'italic' : 'normal' } },
        h('b', { style: { display: 'inline-block', width: '22px', color: isT ? 'var(--viz-2)' : 'var(--primary)' } }, isT ? 'T' : 'D'), l.replace(/^\s*(\[\d{1,2}:\d{2}(?:[.,]\d)?\]\s*)?\*?(T|TER|DKT|INV|EXA|TERAPİST|TERAPIST)\s*:\s*/i, '$1'));
    }) : h('p.small.muted', null, 'Transkript yok. "Transkript ve kayıt" ekranından yazıya dökün.'));
  const recordCard = h('div.card', null,
    h('div.card-head', null, h('h2', null, icon('headphones', 18), 'Konuşma örneği'), h('span.sub', null, `${taskOf(session.taskType).label}${session.acoustic?.durationSec ? ' · ' + fmtDur(session.acoustic.durationSec) : ''}`)),
    h('div.card-body', null,
      player ? player.el : h('p.small.muted', null, 'Ses kaydı yok (yalnız transkript).'),
      h('div.row.mt-2', { style: { gap: '8px', alignItems: 'flex-start' } },
        h('img', { src: taskOf('accident').stimulus, alt: 'Uyaran görseli', style: { width: '120px', borderRadius: '8px', border: '1px solid var(--border)' } }),
        h('div.small', { style: { flex: 1, minWidth: '200px' } },
          h('b', null, 'Konuşmacı ayrımı: '),
          sp ? `${sp.examiner} terapist, ${sp.participant} danışan sözcesi (tuş ${sp.bySource?.button || 0}, metin ipucu ${sp.bySource?.text || 0}, ses perdesi ${sp.bySource?.pitch || 0}).` : 'Terapist satırları "T:" ile işaretli.',
          sp?.pitch ? h('div.tiny.muted', null, `İki ayrı ses bulundu: terapist ~${sp.pitch.therapistHz} Hz, danışan ~${sp.pitch.participantHz} Hz (${num(sp.pitch.separationSt, 1)} yarım ton).`) : null,
          comp ? h('div.tiny.muted', null, `Danışan: ${comp.measures.features.participantUtterances} sözce, ${comp.measures.features.totalWords} sözcük · Terapist: ${comp.measures.features.examinerUtterances} sözce (ölçütlere katılmaz).`) : null,
          h('div.tiny.muted.mt-1', null, 'Otomatik ayrım öneridir; yanlış atanan satırı Transkript ekranında "T:" ekleyip kaldırarak düzeltin.'))),
      h('div.mt-2', null, txPreview)));

  // ---- 2. DKT kör değerlendirme formu ----
  const ratingHost = h('div');
  const drawRating = (editing = false) => {
    const r = myRating;
    if (!canWrite) {
      mount(ratingHost, h('div.card', null, h('div.card-body', null, h('p.small.muted', null, 'Gözlemci rolündesiniz; değerlendirme formunu dolduramazsınız. Değerlendirme için ekip yöneticinizden "Klinisyen" rolü isteyin.'))));
      return;
    }
    if (r && !editing) {
      const edit = h('button.btn.btn-ghost.btn-sm', { on: { click: () => drawRating(true) } }, icon('edit', 14), 'Düzenle');
      mount(ratingHost, h('div.card', null,
        h('div.card-head', null, h('h2', null, icon('stethoscope', 18), 'Değerlendirmeniz'), edit),
        h('div.card-body', null,
          h('div.risk-hero', null, h('div.risk-num', null, `%${num((r.risk ?? 0) * 100, 0)}`), h('div', null,
            h('div.strong', null, r.predicted ? '1 yıl içinde gerileme bekliyorsunuz' : '1 yıl içinde gerileme beklemiyorsunuz'),
            h('div.tiny.muted', null, `${fmtDateTime(r.at)}${r.unblinded ? ' · program sonucu görüldükten sonra verildi (kör değil)' : ' · kör değerlendirme'}`))),
          h('div.table-wrap.mt-2', null, h('table.table', null, h('tbody', null, CLINICAL_ITEMS.map((it) => h('tr', null, h('td.small', null, it.label), h('td.num', null, r.items?.[it.id] != null ? `${r.items[it.id]} · ${SEVERITY[r.items[it.id]]}` : '—')))))),
          r.domains ? h('div.mt-2', null,
            h('div.small.strong', null, 'Beklediğiniz bozulma alanları'),
            h('div.row.mt-1', { style: { gap: '6px' } }, LANGUAGE_DOMAINS.filter((d) => r.domains[d.id] != null).map((d) => {
              const v = r.domains[d.id];
              return badge(`${d.label}: ${DOMAIN_LEVELS[v].toLocaleLowerCase('tr-TR')}`, v >= 3 ? 'danger' : v === 2 ? 'warn' : v === 1 ? 'info' : 'outline');
            })),
            r.profile ? h('div.small.mt-1', null, h('b', null, 'Beklenen tür: '), profileLabel(r.profile)) : null) : null,
          r.notes ? h('p.small.mt-2', null, h('b', null, 'Not: '), r.notes) : null)));
      return;
    }
    const items = { ...(r?.items || {}) };
    const pickers = CLINICAL_ITEMS.map((it) => {
      const wrap = h('div.score-pick', { role: 'radiogroup', 'aria-label': it.label });
      const draw = () => mount(wrap, ...[0, 1, 2, 3].map((v) => h(`button${items[it.id] === v ? '.on' : ''}`, { type: 'button', title: SEVERITY[v], 'aria-pressed': String(items[it.id] === v), on: { click: () => { items[it.id] = v; draw(); } } }, String(v))));
      draw();
      return h('div.row.between', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' } }, h('span.small', { style: { flex: '1 1 220px' } }, it.label), wrap);
    });
    // Alan öngörüsü: hangi dil alanlarında bozulma bekleniyor?
    const doms = { ...(r?.domains || {}) };
    const domPickers = LANGUAGE_DOMAINS.map((d) => {
      const wrap = h('div.score-pick.words', { role: 'radiogroup', 'aria-label': d.long });
      const draw = () => mount(wrap, ...[0, 1, 2, 3].map((v) => h(`button${doms[d.id] === v ? '.on' : ''}`, { type: 'button', title: DOMAIN_LEVELS[v], 'aria-pressed': String(doms[d.id] === v), on: { click: () => { doms[d.id] = v; draw(); } } }, DOMAIN_SHORT[v])));
      draw();
      return h('div.row.between', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' } }, h('span.small', { style: { flex: '1 1 200px' } }, d.long), wrap);
    });
    const profileSel = select([{ id: '', label: 'Emin değilim / belirtmiyorum' }, ...PROFILE_TYPES.map((t) => ({ id: t.id, label: t.label }))], r?.profile || '');
    const risk = h('input', { type: 'range', min: 0, max: 100, step: 5, value: r ? Math.round((r.risk ?? 0) * 100) : 20, style: { width: '100%' } });
    const riskOut = h('b', null, '');
    const updRisk = () => { riskOut.textContent = `%${risk.value} — ${Number(risk.value) >= 50 ? 'gerileme bekleniyor' : 'gerileme beklenmiyor'}`; };
    risk.addEventListener('input', updRisk);
    updRisk();
    const notes = h('textarea.textarea', { rows: 3, placeholder: 'Klinik gözlemleriniz (isteğe bağlı)…' }, r?.notes || '');
    const save = h('button.btn.btn-primary', { style: { whiteSpace: 'normal', height: 'auto', minHeight: '40px', textAlign: 'left' } }, icon('save', 16), r ? 'Değerlendirmeyi güncelle' : 'Kaydet ve program sonucunu aç');
    save.addEventListener('click', async () => {
      const missing = CLINICAL_ITEMS.filter((it) => items[it.id] == null);
      if (missing.length) { toast(`Tüm maddeleri puanlayın (${missing.length} eksik).`, 'warning'); return; }
      const missingD = LANGUAGE_DOMAINS.filter((d) => doms[d.id] == null);
      if (missingD.length) { toast(`Her dil alanı için öngörünüzü seçin (${missingD.map((d) => d.label).join(', ')} eksik).`, 'warning'); return; }
      save.disabled = true;
      try {
        const snap = current;
        session = await updateStudy(app, session.id, (s) => {
          s.ratings[me] = {
            name: `${app.ctx.user.title ? app.ctx.user.title + ' ' : ''}${app.ctx.user.name}`,
            items: { ...items }, risk: Number(risk.value) / 100, predicted: Number(risk.value) >= 50,
            domains: { ...doms }, profile: profileSel.value || null, notes: notes.value.trim(),
            unblinded: r ? !!r.unblinded : revealed, at: new Date().toISOString(),
          };
          // İlk değerlendirmede program tahmini kilitlenir (önceden yapılmış tahmin olarak saklanır)
          if (!s.ai?.locked && snap) s.ai = { ...snap, locked: true, lockedAt: new Date().toISOString(), lockedBy: me };
          if (comp) { s.features = comp.measures.features; s.detail = comp.measures.detail; s.featuresAt = new Date().toISOString(); }
        });
        toast('Değerlendirmeniz kaydedildi.', 'success');
        render(root, { params, query: {} }, app);
      } catch (err) {
        save.disabled = false;
        toast(err.message, 'error');
      }
    });
    mount(ratingHost, h('div.card', null,
      h('div.card-head', null, h('h2', null, icon('stethoscope', 18), 'Klinik değerlendirme formu (DKT)'), h('span.sub', null, 'kör değerlendirme')),
      h('div.card-body', null,
        h('p.small.muted', { style: { marginTop: 0 } }, 'Kaydı dinleyip her maddeyi puanlayın: 0 yok · 1 hafif · 2 orta · 3 belirgin. Ardından bu kişide 1 yıl içinde konuşma-dil ya da bilişsel-dilsel gerileme gelişme olasılığını tahmin edin. Program sonucu siz kaydedene kadar gizlidir.'),
        pickers,
        h('h3', { style: { fontSize: '14.5px', margin: '18px 0 2px' } }, 'Hangi alanlarda bozulma bekliyorsunuz? (1 yıl içinde)'),
        h('p.tiny.muted', { style: { margin: '0 0 4px' } }, 'Yok = beklemiyorum · Olası · Kuvvetle olası · Kesin. İzlemde alan düzeyinde doğruluk bu seçimlere göre hesaplanır ("kuvvetle olası" ve "kesin" = bozulma bekleniyor).'),
        domPickers,
        h('div.mt-2', null, field('Beklediğiniz bozukluk türü / örüntü', profileSel)),
        h('div.mt-3', null, field('1 yıl içinde gerileme olasılığı (tahmininiz)', risk), riskOut),
        h('div.mt-2', null, field('Notlar', notes)),
        h('div.row.mt-2', null, save))));
  };
  drawRating();

  // ---- 3. Program değerlendirmesi ----
  const aiHost = h('div');
  const drawAi = () => {
    if (!comp) { mount(aiHost, h('div.card', null, h('div.card-body', null, emptyState({ icon: 'fileText', title: 'Transkript gerekli', text: 'Program değerlendirmesi için önce kaydı yazıya dökün ve terapist satırlarını ayırın.', action: h('a.btn.btn-primary', { href: `#/seans/${session.id}?tab=transcript` }, icon('edit', 16), 'Transkripte git') })))); return; }
    if (!revealed) {
      const peek = h('button.btn.btn-ghost.btn-sm', null, icon('eye', 14), 'Yine de göster (körlük bozulur)');
      peek.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Program sonucu gösterilsin mi?', message: 'Kendi değerlendirmenizi yapmadan program sonucunu görürseniz değerlendirmeniz "kör değil" olarak işaretlenir ve istatistiklerde ayrıca belirtilir.', confirmText: 'Göster' }))) return;
        revealed = true;
        drawAi();
      });
      mount(aiHost, h('div.blind-veil', null, icon('lock', 22), h('h3', { style: { margin: '8px 0 4px', color: 'var(--text)' } }, 'Program değerlendirmesi gizli'),
        h('p.small', { style: { margin: '0 0 12px' } }, 'Kör değerlendirme için önce klinik formu doldurup tahmininizi kaydedin; ardından programın yorumu, risk tahmini ve karşılaştırma açılır.'), peek));
      return;
    }
    const sc = comp.scored;
    const t = comp.text;
    const locked = !!study.ai?.locked;
    const p = ai?.risk ?? null;
    const plan = followUpPlan(p);
    const monthly = monthlyProjection(p);
    const canvas = h('canvas', { role: 'img', 'aria-label': 'Aylık birikimli risk' });
    setTimeout(() => { if (monthly.length) lineChart(canvas, monthly.map((m) => m.month), monthly.map((m) => Number((m.p * 100).toFixed(1))), { unit: '%', xLabel: 'ay', min: 0, max: 100 }); }, 0);
    const itemRows = sc.items.map((it) => {
      const lockedScore = ai?.items?.[it.id]?.score;
      const ev = it.evidence.slice(0, 2).map((e) => `${FEATURE_DEFS[e.feat]?.label.split(' (')[0]}: ${fmtFeat(e.feat, e.value)}`).join(' · ');
      return h('tr', null, h('td.small', null, it.label),
        h('td.num', null, lockedScore != null ? h('b', null, `${lockedScore} · ${SEVERITY[lockedScore]}`) : '—'),
        h('td.tiny.muted', null, it.id === 'overall' ? `bileşik şiddet z = ${num(it.z, 2)}` : ev || '—'));
    });
    const measureRows = Object.entries(DOMAINS).flatMap(([dom, dlabel]) => {
      const keys = Object.keys(FEATURE_DEFS).filter((k) => FEATURE_DEFS[k].domain === dom);
      return [h('tr', null, h('td', { colspan: 5, style: { background: 'var(--surface-2)', fontWeight: 600, fontSize: '12px' } }, `${dom} · ${dlabel}`)),
        ...keys.map((k) => {
          const d = FEATURE_DEFS[k];
          const z = sc.z[k];
          const n = sctx.norms.norms[k];
          const flag = z == null ? '—' : z >= 2 ? badge('belirgin', 'danger') : z >= 1 ? badge('hafif', 'warn') : badge('olağan', 'ok');
          return h('tr', null, h('td.small', null, d.label, d.unit ? h('span.tiny.muted', null, ` (${d.unit})`) : null),
            h('td.num', null, fmtFeat(k, comp.measures.features[k])),
            h('td.num.tiny.muted', null, n ? `${fmtFeat(k, n.mean)} ± ${d.pct ? num(n.sd * 100, 0) : num(n.sd, d.d ?? 2)}` : '—'),
            h('td.num', null, z == null ? '—' : num(z, 1)), h('td', null, flag));
        })];
    });
    const found = new Set(comp.measures.detail.iuFound);
    // Alan bazlı öngörü: kilitli tahmin (varsa) başlıkta, gerekçe güncel transkriptten
    const lockedDom = ai?.domains || {};
    const lvTone = (lv) => (lv >= 3 ? 'danger' : lv === 2 ? 'warn' : lv === 1 ? 'info' : 'ok');
    const domainCards = [...(comp.reasoning || [])].sort((a, b) => (lockedDom[b.id]?.p ?? b.p ?? -1) - (lockedDom[a.id]?.p ?? a.p ?? -1)).map((d) => {
      const lp = lockedDom[d.id]?.p ?? d.p;
      const lv = lockedDom[d.id]?.level ?? d.level;
      const drift = lockedDom[d.id]?.p != null && d.p != null && Math.abs(lockedDom[d.id].p - d.p) >= 0.05;
      return h(`div.domain-card.lv-${lv ?? 0}`, null,
        h('div.row.between', { style: { alignItems: 'baseline', gap: '8px', flexWrap: 'nowrap' } }, h('h4', null, d.long), h('span.dp', null, pctTxt(lp))),
        h('div.pbar', { role: 'img', 'aria-label': `${d.label}: 12 ayda bozulma olasılığı ${pctTxt(lp)}` }, h('span', { style: { width: `${Math.round((lp ?? 0) * 100)}%` } })),
        h('div.row', { style: { gap: '6px' } }, badge(lv == null ? 'Ölçülemedi' : PROGRAM_DOMAIN_LEVELS[lv], lv == null ? 'outline' : lvTone(lv), true),
          drift ? h('span.tiny.muted', null, `güncel transkriptle %${num(d.p * 100, 0)}`) : null),
        h('ol.chain.mt-2', null,
          h('li', null, h('span.step', null, 'Gözlem'), ...d.observations.map((o) => h('div', { style: { marginBottom: '3px' } }, o.text,
            o.examples.length ? h('div.tiny', null, 'Örnek: ', ...o.examples.flatMap((x, i) => [i ? ', ' : '', h('q', null, x)])) : null))),
          h('li', null, h('span.step', null, 'Ara çıkarım'), d.inference),
          h('li', null, h('span.step', null, 'Sonuç'), d.conclusion)),
        d.caveat ? h('p.tiny.muted', { style: { margin: '2px 0 0' } }, d.caveat) : null);
    });
    const prof = sc.profile;
    const lockedProfile = ai?.profile && prof && ai.profile !== prof.id ? ai.profile : null;
    const profileCard = prof ? h('div.card.mt-3', null,
      h('div.card-head', null, h('h3', null, icon('brain', 17), 'Bozukluk türü (örüntü)'), h('span.sub', null, 'tümevarım: alan bulguları → tür')),
      h('div.card-body', null,
        h('div.row', { style: { gap: '8px' } }, h('span.strong', null, lockedProfile ? profileLabel(lockedProfile) : prof.label), lockedProfile ? badge('kilitli tahmin', 'outline') : null),
        h('p.small', { style: { margin: '8px 0 6px', lineHeight: 1.6 } }, comp.profileText),
        lockedProfile ? h('p.tiny', { style: { color: 'var(--warn)', margin: '0 0 6px' } }, `Güncel transkriptle tür: ${prof.label}. Doğruluk hesabında kilitli tahmin kullanılır.`) : null,
        h('p.tiny.muted', { style: { margin: 0 } }, 'Tür, hangi alanların birlikte etkilendiğine ve hangilerinin korunduğuna göre belirlenir. Tanı değildir; "uyumlu olabilir" düzeyinde bir örüntü önerisidir.'))) : null;
    mount(aiHost,
      h('div.card', null,
        h('div.card-head', null, h('h2', null, icon('sparkles', 18), 'Programın değerlendirmesi'),
          locked ? badge(`Tahmin kilitli · ${fmtDate(study.ai.lockedAt)}`, 'outline') : badge('Kilitlenmedi — ilk DKT değerlendirmesinde kilitlenir', 'warn')),
        h('div.card-body', null,
          h('div.risk-hero', null,
            h('div.risk-num', { style: { color: `var(--${riskTone(p) === 'danger' ? 'danger' : riskTone(p) === 'warn' ? 'warn' : 'ok'})` } }, pctTxt(p), h('small', null, '12 ay')),
            h('div', null,
              h('div.row', { style: { gap: '6px' } }, badge(`${plan.level} risk`, riskTone(p), true), badge(`Güven: ${ai?.confidence || sc.confidence}`, 'outline'), badge(ai?.model?.kind === 'team' ? 'Ekip modeli' : 'Varsayılan model', 'outline')),
              h('div.tiny.muted.mt-1', null, ai?.model?.label || sc.model.label),
              locked && current && Math.abs((current.risk ?? 0) - (p ?? 0)) >= 0.05 ? h('div.tiny.mt-1', { style: { color: 'var(--warn)' } }, `Transkript kilitten sonra değişti; güncel hesap %${num(current.risk * 100, 0)}. Doğruluk hesabında kilitli tahmin kullanılır.`) : null)),
          h('div.narrative.mt-3', null, ...t.findings.map((s) => h('p', null, s)), h('p', null, h('b', null, 'Çıkarım: '), t.inference),
            t.domainText ? h('p', null, h('b', null, 'Alanlar: '), t.domainText) : null,
            h('p', null, h('b', null, 'Öngörü: '), t.riskText), h('p.tiny.muted', null, t.caveat)))),
      domainCards.length ? h('div.card.mt-3', null,
        h('div.card-head', null, h('h3', null, icon('layers', 17), 'Hangi alanda bozulma bekleniyor?'), h('span.sub', null, 'gözlem → ara çıkarım → sonuç · 12 ay')),
        h('div.card-body', null, h('div.domain-grid', null, domainCards),
          h('p.tiny.muted.mt-2', { style: { marginBottom: 0 } }, 'Her alanın olasılığı, o alana kanıt olan ölçütlerin en belirgin ikisinin referanstan sapmasından (z) ve yaş/eğitimden hesaplanır: lojistik(−2,3 + 1,3·z + ½ yaş + ½ eğitim). Program "kesin" demez; en üst düzey "çok yüksek olasılık"tır (≥ %80).'))) : null,
      profileCard,
      h('div.grid.grid-2.mt-3', null,
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('trending', 17), 'Ay ay birikimli risk'), h('span.sub', null, `izlem: ${plan.months.map((m) => `${m}. ay`).join(', ')}`)),
          h('div.card-body', null, h('div.chart-box', { style: { height: '220px' } }, canvas),
            h('p.tiny.muted.mt-1', null, 'Sabit tehlike varsayımıyla: P(ay) = 1 − (1 − P₁₂)^(ay/12). Tek bir konuşma örneğinden aylık seyir ancak bu varsayımla modellenebilir; ara izlemler tahmini güncellemek içindir.'))),
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('list', 17), 'Klinik maddeler (program puanı)')),
          h('div.card-body.tight', null, h('div.table-wrap', null, h('table.table', null, h('thead', null, h('tr', null, h('th', null, 'Madde'), h('th.num', null, '0–3'), h('th', null, 'Dayanak'))), h('tbody', null, itemRows)))))),
      h('div.card.mt-3', null, h('div.card-head', null, h('h3', null, icon('eye', 17), 'Bilgi birimleri'), h('span.sub', null, `${comp.measures.features.iuCount} / ${comp.measures.features.iuTotal} · olay ${comp.measures.detail.eventsFound}/8`)),
        h('div.card-body', null, h('div.iu-list', null, ACCIDENT_IU.map((u) => h(`span.iu${found.has(u.id) ? '.hit' : ''}`, { title: u.type }, found.has(u.id) ? '✓ ' : '', u.label))),
          comp.measures.detail.offTopicWords.length ? h('p.small.mt-2', null, h('b', null, 'Resimde olmayan / konu dışı adlar: '), comp.measures.detail.offTopicWords.join(', ')) : null)),
      h('div.card.mt-3', null, h('div.card-head', null, h('h3', null, icon('layers', 17), 'Dilsel parametreler (L1–L8)'), h('span.sub', null, sctx.norms.source === 'team' ? `referans: ekibin kontrol grubu (n = ${sctx.norms.n})` : 'referans: varsayılan yaklaşık değerler')),
        h('div.card-body.tight', null, h('div.table-wrap', null, h('table.table', null,
          h('thead', null, h('tr', null, h('th', null, 'Ölçüt'), h('th.num', null, 'Değer'), h('th.num', null, 'Referans'), h('th.num', null, 'z'), h('th', null, 'Durum'))),
          h('tbody', null, measureRows))),
          h('p.tiny.muted', { style: { padding: '8px 16px' } }, `Zamanlama: ${comp.measures.detail.timingSource === 'participant' ? 'yalnız danışanın konuştuğu bölümler' : comp.measures.detail.timingSource === 'whole' ? 'tüm kayıt (terapist konuşması dahil — konuşmacı zamanları yok)' : 'transkriptten tahmin'}. z, bozulma yönündeki sapmadır.`))));
  };
  drawAi();

  // ---- 4. Bireysel karşılaştırma ----
  const compareHost = h('div');
  const rs = ratingSummary(study);
  if (revealed && rs && ai) {
    const rows = CLINICAL_ITEMS.map((it) => {
      const d = rs.items[it.id];
      const a = ai.items?.[it.id]?.score;
      let agree = '—';
      if (d != null && a != null) {
        const diff = a - Math.round(d);
        agree = diff === 0 ? h('span.agree', { style: { color: 'var(--ok)' } }, icon('checkCircle', 15), 'Uyum')
          : diff > 0 ? h('span.agree', { style: { color: 'var(--warn)' } }, icon('alert', 15), 'Program daha belirgin')
            : h('span.agree', { style: { color: 'var(--danger)' } }, icon('alertCircle', 15), 'DKT daha belirgin');
      }
      return h('tr', null, h('td.small', null, it.label), h('td.num', null, d != null ? num(d, rs.n > 1 ? 1 : 0) : '—'), h('td.num', null, a ?? '—'), h('td', null, agree));
    });
    // Alan düzeyinde karşılaştırma: DKT "kuvvetle olası/kesin" ↔ program p ≥ %50
    const raterList = Object.values(study.ratings || {}).filter((r) => r.domains);
    const aiDom = ai.domains || {};
    const domRows = Object.keys(aiDom).length || raterList.length ? LANGUAGE_DOMAINS.map((d) => {
      const pd = aiDom[d.id];
      const progPos = programDomainPositive(pd);
      const lv = rs.domains?.[d.id];
      const dktPos = lv == null ? null : raterDomainPositive(Math.round(lv));
      let agree = '—';
      if (progPos != null && dktPos != null) {
        agree = progPos === dktPos ? h('span.agree', { style: { color: 'var(--ok)' } }, icon('checkCircle', 15), progPos ? 'İkisi de bekliyor' : 'İkisi de beklemiyor')
          : progPos ? h('span.agree', { style: { color: 'var(--warn)' } }, icon('alert', 15), 'Yalnız program bekliyor')
            : h('span.agree', { style: { color: 'var(--danger)' } }, icon('alertCircle', 15), 'Yalnız DKT bekliyor');
      }
      const dktTxt = lv == null ? '—' : raterList.length > 1 ? `${num(lv, 1)} · ${DOMAIN_LEVELS[Math.round(lv)].toLocaleLowerCase('tr-TR')}` : DOMAIN_LEVELS[lv];
      return h('tr', null, h('td.small', null, d.long), h('td', null, dktTxt),
        h('td', null, pd?.p != null ? `%${num(pd.p * 100, 0)} · ${PROGRAM_DOMAIN_LEVELS[pd.level].toLocaleLowerCase('tr-TR')}` : '—'), h('td', null, agree));
    }) : [];
    const raterProfiles = raterList.map((r) => r.profile).filter(Boolean);
    const progProfile = ai.profile;
    const profileLine = progProfile || raterProfiles.length ? h('p.small', { style: { padding: '10px 16px 12px', margin: 0 } },
      h('b', null, 'Tür: '), `DKT ${raterProfiles.length ? [...new Set(raterProfiles)].map(profileLabel).join(' / ') : 'belirtilmedi'} · program ${progProfile ? profileLabel(progProfile) : '—'}`,
      progProfile && raterProfiles.length ? (raterProfiles.includes(progProfile) ? h('span.agree', { style: { color: 'var(--ok)', marginLeft: '8px' } }, icon('checkCircle', 15), 'aynı tür') : h('span.agree', { style: { color: 'var(--warn)', marginLeft: '8px' } }, icon('alert', 15), 'farklı tür')) : null) : null;
    mount(compareHost, h('div.card.mt-3', null,
      h('div.card-head', null, h('h2', null, icon('grid', 18), 'Bireysel karşılaştırma'), h('span.sub', null, `${rs.n} DKT değerlendirmesi${rs.n > 1 ? ' (ortalama)' : ''} · risk: DKT ${pctTxt(rs.risk)} / program ${pctTxt(ai.risk)}`)),
      h('div.card-body.tight', null, h('div.table-wrap', null, h('table.table', null,
        h('thead', null, h('tr', null, h('th', null, 'Parametre'), h('th.num', null, 'DKT (0–3)'), h('th.num', null, 'Program (0–3)'), h('th', null, 'Uyum'))), h('tbody', null, rows))),
        domRows.length ? h('div.table-wrap', { style: { borderTop: '1px solid var(--border)' } }, h('table.table', null,
          h('thead', null, h('tr', null, h('th', null, 'Dil alanı'), h('th', null, 'DKT öngörüsü'), h('th', null, 'Program öngörüsü'), h('th', null, 'Uyum'))), h('tbody', null, domRows))) : null,
        domRows.length && !Object.keys(aiDom).length ? h('p.tiny.muted', { style: { padding: '8px 16px', margin: 0 } }, 'Bu örneklemin kilitli program tahmini alan bazlı öngörü eklenmeden önce alınmış; alan karşılaştırması için programın alan tahmini yok.') : null,
        profileLine)));
  }

  // ---- 5. İzlem ve sonuç ----
  const followHost = h('div');
  const baseline = isBaseline ? session : (study.baselineId ? await app.repo.sessions.get(study.baselineId) : null);
  const followUp = isBaseline ? (study.followUpId ? await app.repo.sessions.get(study.followUpId) : null) : session;
  const changeTable = () => {
    if (!baseline?.study?.features || !followUp?.study?.features) return null;
    const keys = ['totalWords', 'wpm', 'mluW', 'iuCoverage', 'eventCoverage', 'mattr', 'fillerRate', 'vagueRate', 'pronounRatio', 'pauseRatio', 'subordinateRatio'];
    const rows = keys.map((k) => {
      const a = baseline.study.features[k];
      const b = followUp.study.features[k];
      const d = FEATURE_DEFS[k];
      if (a == null || b == null) return null;
      const delta = b - a;
      const worse = d.dir === 'low' ? delta < 0 : delta > 0;
      const rel = Math.abs(delta) / Math.max(1e-9, d.sd);
      return h('tr', null, h('td.small', null, d.label), h('td.num', null, fmtFeat(k, a)), h('td.num', null, fmtFeat(k, b)),
        h('td.num', null, `${delta > 0 ? '+' : ''}${d.pct ? num(delta * 100, 0) + ' puan' : num(delta, d.d ?? 2)}`),
        h('td', null, rel < 0.5 ? badge('belirgin değişim yok', 'outline') : worse ? badge('kötüleşme', 'danger') : badge('iyileşme', 'ok')));
    }).filter(Boolean);
    return h('div.table-wrap', null, h('table.table', null, h('thead', null, h('tr', null, h('th', null, 'Ölçüt'), h('th.num', null, 'Başlangıç'), h('th.num', null, '1. yıl'), h('th.num', null, 'Değişim'), h('th', null, 'Yön'))), h('tbody', null, rows)));
  };
  if (isBaseline) {
    const o = study.outcome || {};
    const status = select(OUTCOMES.map((x) => ({ id: x.id, label: x.label })), o.status || 'not_developed', { disabled: !canWrite });
    const cat = select(OUTCOME_CATEGORIES, o.category || 'none', { disabled: !canWrite });
    const method = select(OUTCOME_METHODS, o.method || 'clinical', { disabled: !canWrite });
    const date = h('input.input', { type: 'date', value: o.date || new Date().toISOString().slice(0, 10), disabled: !canWrite });
    const notes = h('textarea.textarea', { rows: 2, disabled: !canWrite, placeholder: 'ör. MoCA 21/30; nöroloji: amnestik HBB' }, o.notes || '');
    // Bozulan alanlar ve gerçekleşen tür (alan düzeyinde doğruluk için)
    const outDoms = new Set(o.domains || []);
    const domChecks = LANGUAGE_DOMAINS.map((d) => {
      const cb = h('input', { type: 'checkbox', checked: outDoms.has(d.id), disabled: !canWrite });
      cb.addEventListener('change', () => { if (cb.checked) outDoms.add(d.id); else outDoms.delete(d.id); });
      return h('label.check', null, cb, h('span', null, d.label));
    });
    const outProfile = select([{ id: '', label: 'Belirlenmedi' }, ...PROFILE_TYPES.map((t) => ({ id: t.id, label: t.label }))], o.profile || '', { disabled: !canWrite });
    const domBox = h('div.mt-2', null,
      h('div.small.strong', null, 'Bozulan dil alanları'),
      h('p.tiny.muted', { style: { margin: '2px 0 8px' } }, '"Gerileme gelişti" ise etkilenen alanları işaretleyin; "gelişmedi" seçilirse hiçbir alan bozulmamış sayılır.'),
      h('div.domain-checks', null, domChecks),
      h('div.mt-2', null, field('Gerçekleşen tür / örüntü (isteğe bağlı)', outProfile)));
    const syncDomBox = () => { domBox.style.display = status.value === 'developed' ? '' : 'none'; };
    status.addEventListener('change', syncDomBox);
    syncDomBox();
    const saveO = h('button.btn.btn-primary.btn-sm', { disabled: !canWrite }, icon('save', 14), study.outcome ? 'Sonucu güncelle' : 'Sonucu kaydet');
    saveO.addEventListener('click', async () => {
      if (!study.ai?.locked && !(await confirmDialog({ title: 'Program tahmini kilitlenmedi', message: 'Bu örneklemde henüz DKT değerlendirmesi yok, bu yüzden programın tahmini önceden kilitlenmedi. Sonucu şimdi girerseniz program tahmini şu anki transkriptle kilitlenecek. Devam edilsin mi?', confirmText: 'Devam et' }))) return;
      const developed = status.value === 'developed';
      session = await updateStudy(app, session.id, (s) => {
        if (!s.ai?.locked && current) s.ai = { ...current, locked: true, lockedAt: new Date().toISOString(), lockedBy: me };
        s.outcome = {
          status: status.value, category: cat.value, method: method.value,
          domains: developed ? LANGUAGE_DOMAINS.map((d) => d.id).filter((id) => outDoms.has(id)) : [],
          profile: developed ? (outProfile.value || null) : 'typical',
          date: date.value, notes: notes.value.trim(), by: me, at: new Date().toISOString(),
        };
      });
      toast('İzlem sonucu kaydedildi.', 'success');
      render(root, { params, query: {} }, app);
    });
    const verdict = (p) => {
      if (!study.outcome || study.outcome.status === 'unclear' || p == null) return '—';
      const ok = (p >= 0.5) === (study.outcome.status === 'developed');
      return ok ? h('span.agree', { style: { color: 'var(--ok)' } }, icon('checkCircle', 15), 'Doğru') : h('span.agree', { style: { color: 'var(--danger)' } }, icon('x', 15), 'Yanlış');
    };
    const outSet = outcomeDomainSet(study.outcome);
    const domVerdict = (preds) => {
      const a = domainAccuracy(preds, outSet);
      return a ? `${a.correct}/${a.total}` : '—';
    };
    const profVerdict = (pid) => {
      const real = study.outcome?.profile;
      if (!real || !pid) return '—';
      return pid === real ? h('span.agree', { style: { color: 'var(--ok)' } }, icon('checkCircle', 15), 'Aynı') : h('span.agree', { style: { color: 'var(--danger)' } }, icon('x', 15), 'Farklı');
    };
    const raters = Object.values(study.ratings || {});
    mount(followHost, h('div.card.mt-3', null,
      h('div.card-head', null, h('h2', null, icon('calendar', 18), '1 yıl sonra: izlem ve sonuç'), h('span.sub', null, `planlanan izlem: ${fmtDate(due.toISOString())}`)),
      h('div.card-body', null,
        followUp ? h('div', null, h('p.small', { style: { marginTop: 0 } }, 'İzlem örneklemi: ', h('a', { href: `#/ongoru/${followUp.id}` }, fmtDateTime(followUp.recordedAt))), changeTable())
          : h('p.small.muted', { style: { marginTop: 0 } }, daysLeft > 0 ? `İzlem örneklemi ${daysLeft} gün sonra (aynı resimle) alınmalı. Erken izlem de yapılabilir.` : 'İzlem zamanı geldi: "İzlem örneklemi al" ile aynı resimle yeni kayıt alın.'),
        h('div.divider'),
        h('h3', { style: { fontSize: '15px', margin: '4px 0 10px' } }, 'Klinik sonuç (1 yıl sonunda)'),
        h('div.form-grid', null, field('Durum', status), field('Tanı / kategori', cat), field('Belirleme yöntemi', method), field('Tarih', date)),
        domBox,
        h('div.mt-2', null, field('Not', notes)), h('div.row.mt-2', null, saveO),
        study.outcome ? h('div.table-wrap.mt-3', null, h('table.table', null,
          h('thead', null, h('tr', null, h('th', null, 'Tahmin eden'), h('th.num', null, '1 yıllık risk'), h('th', null, 'Tahmin'), h('th', null, 'Sonuca göre'), h('th.num', null, 'Alan isabeti'), h('th', null, 'Tür'))),
          h('tbody', null,
            h('tr', null, h('td', null, h('b', null, 'Program (yapay zekâ)'), study.ai?.locked ? null : h('span.tiny.muted', null, ' · kilitsiz')), h('td.num', null, pctTxt(study.ai?.risk)), h('td', null, study.ai?.risk != null ? (study.ai.risk >= 0.5 ? 'gerileme' : 'gerileme yok') : '—'), h('td', null, verdict(study.ai?.risk)),
              h('td.num', null, domVerdict(programDomainPreds(study.ai))), h('td', null, profVerdict(study.ai?.profile))),
            ...raters.map((r) => h('tr', null, h('td', null, r.name, r.unblinded ? h('span.tiny.muted', null, ' · kör değil') : null), h('td.num', null, pctTxt(r.risk)), h('td', null, r.predicted ? 'gerileme' : 'gerileme yok'), h('td', null, verdict(r.risk)),
              h('td.num', null, domVerdict(raterDomainPreds(r))), h('td', null, profVerdict(r.profile))))))) : null,
        study.outcome && outSet ? h('p.tiny.muted.mt-1', null, `Alan isabeti: öngörülen 6 alandan kaçında "bozulma bekleniyor / beklenmiyor" kararı sonuçla uyuştu (bozulan alanlar: ${outSet.size ? LANGUAGE_DOMAINS.filter((d) => outSet.has(d.id)).map((d) => d.label.toLocaleLowerCase('tr-TR')).join(', ') : 'yok'}).`) : null)));
  } else if (baseline) {
    mount(followHost, h('div.card.mt-3', null,
      h('div.card-head', null, h('h2', null, icon('calendar', 18), 'Başlangıçla karşılaştırma'), h('span.sub', null, h('a', { href: `#/ongoru/${baseline.id}` }, `başlangıç: ${fmtDate(baseline.recordedAt)}`))),
      h('div.card-body', null, changeTable() || h('p.small.muted', null, 'Karşılaştırma için iki örneklemin de transkripti gerekir.'),
        h('p.tiny.muted.mt-2', null, 'Klinik sonucu (gerileme gelişti mi) başlangıç örnekleminin sayfasında girin; doğruluk orada hesaplanır.'))));
  }

  mount(root, head,
    h('div.grid.grid-main', null, recordCard, ratingHost),
    h('div.mt-3', null, aiHost),
    compareHost,
    followHost);
  return () => cleanups.forEach((fn) => { try { fn(); } catch { /* yok say */ } });
}
