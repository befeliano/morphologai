/**
 * Terapi planı ve ev programı (danışan bazında).
 *  - Hedefler: son seansın ölçütlerinden kalıp tabanlı öneri (klinisyen düzenler)
 *  - Haftalık seans günleri, seans planı taslağı
 *  - Ev programı: günlük çalışmalar, ödevler, aileye öneriler, paylaşılan not
 *  - Danışan bağlantısı: şifresiz kişisel bağlantı ve günlük kayıtların izlenmesi (yalnız bulut modunda)
 * Plan, danışan kaydının "plan" alanında saklanır. Danışan ekranına yalnızca plan.home gider.
 */
import { h, mount, icon, toast, field, select, badge, emptyState, confirmDialog, fmtDate, fmtDateTime } from '../ui/dom.js';
import { analyzeSession } from '../../core/analysis.js';
import { suggestGoals, sessionPlanDraft, FAMILY_ADVICE, WEEKDAYS, homeSummary } from '../../core/plan/goals.js';
import { uuid } from '../../data/crypto.js';

const AREA_LABEL = { articulation: 'Ses üretimi', fluency: 'Akıcılık', rate: 'Konuşma üretimi', grammar: 'Dilbilgisi', lexical: 'Sözcük erişimi', voice: 'Ses', general: 'Genel' };
const SLOT_TR = { sabah: 'sabah', ogle: 'öğle', aksam: 'akşam' };
const clip = (s, n) => String(s || '').slice(0, n);

export async function render(root, { params }, app) {
  const p = await app.repo.patients.get(params.id);
  if (!p) { mount(root, emptyState({ icon: 'user', title: 'Danışan bulunamadı', text: 'Silinmiş olabilir ya da başka bir ekibe ait.' })); return; }
  app.setCrumbs([{ label: 'Danışanlar', href: '#/danisanlar' }, { label: p.code, href: `#/danisan/${p.id}` }, { label: 'Terapi planı' }]);
  const canWrite = app.can('patient.write');
  const sessions = await app.repo.sessions.list({ patientId: p.id });
  const plan = JSON.parse(JSON.stringify(p.plan || {}));
  plan.goals = plan.goals || [];
  plan.schedule = plan.schedule || [];
  plan.sessionPlan = plan.sessionPlan || '';
  plan.home = { tasks: [], homework: [], advice: [], note: '', ...(plan.home || {}) };
  let dirty = false;
  const touch = () => { dirty = true; saveBtn.classList.add('btn-primary'); saveBtn.classList.remove('btn-ghost'); };

  const saveBtn = h('button.btn.btn-ghost.btn-sm', { disabled: !canWrite }, icon('save', 15), 'Planı kaydet');
  saveBtn.addEventListener('click', async () => {
    try {
      const fresh = await app.repo.patients.get(p.id);
      await app.repo.patients.save({ ...fresh, plan: { ...plan, updatedAt: new Date().toISOString() } });
      dirty = false;
      saveBtn.classList.remove('btn-primary'); saveBtn.classList.add('btn-ghost');
      toast('Plan kaydedildi. Ev programı danışan bağlantısında güncellendi.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
  app.setActions([saveBtn]);
  app.setGuard?.(() => (dirty ? 'Kaydedilmemiş plan değişiklikleri var.' : null));

  // ---- Hedefler ----
  const goalsHost = h('div');
  const drawGoals = () => {
    mount(goalsHost, plan.goals.length ? plan.goals.map((g, i) => {
      const short = h('textarea.textarea', { rows: 2, disabled: !canWrite, maxlength: 400 }, g.short || '');
      const long = h('textarea.textarea', { rows: 2, disabled: !canWrite, maxlength: 400 }, g.long || '');
      short.addEventListener('input', () => { g.short = short.value; touch(); });
      long.addEventListener('input', () => { g.long = long.value; touch(); });
      const done = h('input', { type: 'checkbox', checked: g.status === 'done', disabled: !canWrite });
      done.addEventListener('change', () => { g.status = done.checked ? 'done' : 'active'; g.doneAt = done.checked ? new Date().toISOString() : null; touch(); });
      const rm = h('button.btn.btn-ghost.btn-icon.btn-sm', { title: 'Hedefi sil', 'aria-label': 'Hedefi sil', disabled: !canWrite }, icon('trash', 14));
      rm.addEventListener('click', () => { plan.goals.splice(i, 1); touch(); drawGoals(); });
      return h('div.plan-goal', null,
        h('div.row.between', null, h('span.row', { style: { gap: '8px' } }, badge(AREA_LABEL[g.area] || 'Hedef', 'info'), g.basis ? h('span.tiny.muted', null, g.basis) : null), h('span.row', { style: { gap: '8px', flexWrap: 'nowrap' } }, h('label.check', null, done, h('span.small', null, 'Ulaşıldı')), rm)),
        h('div.form-grid.mt-2', null, field('Kısa dönem hedef', short), field('Uzun dönem hedef', long)));
    }) : h('p.small.muted', null, 'Henüz hedef yok. Son seanstan öneri alabilir ya da boş bir hedef ekleyebilirsiniz.'));
  };
  const suggestBtn = h('button.btn.btn-soft.btn-sm', { disabled: !canWrite }, icon('sparkles', 15), 'Son seanstan öner');
  suggestBtn.addEventListener('click', async () => {
    const last = sessions.find((s) => s.transcript?.text?.trim()) || sessions[0];
    if (!last) { toast('Öneri için en az bir seans gerekir.', 'warning'); return; }
    await app.lexicon();
    const full = await app.repo.sessions.get(last.id);
    const result = full.transcript?.text?.trim() ? analyzeSession({ transcript: full.transcript.text, acoustic: full.acoustic, settings: app.settings, corrections: full.corrections || {}, final: true }) : null;
    const list = suggestGoals({ result, session: full });
    const have = new Set(plan.goals.map((g) => g.short));
    let added = 0;
    for (const g of list) if (!have.has(g.short)) { plan.goals.push({ id: uuid(), area: g.area, basis: g.basis, short: g.short, long: g.long, status: 'active', createdAt: new Date().toISOString(), sessionId: last.id }); added++; }
    if (added) { touch(); drawGoals(); toast(`${added} hedef önerisi eklendi (${fmtDate(last.recordedAt)} seansından). Düzenleyip kaydedin.`, 'success', 6000); } else toast('Bu seans için öneriler zaten listede.', 'info');
  });
  const addGoal = h('button.btn.btn-ghost.btn-sm', { disabled: !canWrite }, icon('plus', 15), 'Boş hedef');
  addGoal.addEventListener('click', () => { plan.goals.push({ id: uuid(), area: 'general', short: '', long: '', status: 'active', createdAt: new Date().toISOString() }); touch(); drawGoals(); });
  drawGoals();

  // ---- Haftalık seans günleri ----
  const schedHost = h('div');
  const drawSched = () => {
    mount(schedHost, WEEKDAYS.map((name, d) => {
      const cur = plan.schedule.find((x) => x.day === d);
      const cb = h('input', { type: 'checkbox', checked: !!cur, disabled: !canWrite });
      const time = h('input.input', { type: 'time', value: cur?.time || '10:00', disabled: !canWrite || !cur, style: { width: '120px', height: '34px' } });
      cb.addEventListener('change', () => {
        plan.schedule = plan.schedule.filter((x) => x.day !== d);
        if (cb.checked) plan.schedule.push({ day: d, time: time.value || '10:00' });
        plan.schedule.sort((a, b) => a.day - b.day);
        touch(); drawSched();
      });
      time.addEventListener('change', () => { const x = plan.schedule.find((y) => y.day === d); if (x) { x.time = time.value; touch(); } });
      return h('div.row.between', { style: { padding: '5px 0' } }, h('label.check', null, cb, h('span', null, name)), time);
    }));
  };
  drawSched();

  // ---- Seans planı ----
  const sessionPlan = h('textarea.textarea', { rows: 8, disabled: !canWrite, maxlength: 4000, placeholder: 'Seansın akışı…' }, plan.sessionPlan);
  sessionPlan.addEventListener('input', () => { plan.sessionPlan = sessionPlan.value; touch(); });
  const draftBtn = h('button.btn.btn-ghost.btn-sm', { disabled: !canWrite }, icon('wand', 15), 'Taslak oluştur');
  draftBtn.addEventListener('click', () => {
    const active = plan.goals.filter((g) => g.status !== 'done');
    sessionPlan.value = sessionPlanDraft(active, 40).map((s) => `${s.title} (${s.min} dk)\n  ${s.note}`).join('\n\n');
    plan.sessionPlan = sessionPlan.value; touch();
  });

  // ---- Ev programı ----
  const listEditor = (arr, fields, addLabel) => {
    const host = h('div');
    const draw = () => {
      mount(host, arr.map((it, i) => {
        const inputs = fields.map((f) => {
          const inp = f.area ? h('textarea.textarea', { rows: 2, placeholder: f.ph, maxlength: f.max, disabled: !canWrite }, it[f.key] || '') : h('input.input', { placeholder: f.ph, maxlength: f.max, value: it[f.key] || '', disabled: !canWrite });
          inp.addEventListener('input', () => { it[f.key] = inp.value; touch(); });
          return h('div', { style: { flex: f.flex || '1 1 200px', minWidth: 0 } }, inp);
        });
        const rm = h('button.btn.btn-ghost.btn-icon.btn-sm', { title: 'Sil', 'aria-label': 'Sil', disabled: !canWrite }, icon('trash', 14));
        rm.addEventListener('click', () => { arr.splice(i, 1); touch(); draw(); });
        return h('div.row', { style: { gap: '8px', alignItems: 'flex-start', padding: '6px 0', flexWrap: 'wrap' } }, inputs, rm);
      }), h('button.btn.btn-ghost.btn-sm.mt-1', { disabled: !canWrite || arr.length >= 20, on: { click: () => { arr.push({}); touch(); draw(); } } }, icon('plus', 14), addLabel));
    };
    draw();
    return host;
  };
  const adviceHost = h('div');
  const drawAdvice = () => {
    mount(adviceHost, plan.home.advice.map((a, i) => {
      const inp = h('textarea.textarea', { rows: 2, maxlength: 500, disabled: !canWrite }, a);
      inp.addEventListener('input', () => { plan.home.advice[i] = inp.value; touch(); });
      const rm = h('button.btn.btn-ghost.btn-icon.btn-sm', { title: 'Sil', 'aria-label': 'Sil', disabled: !canWrite }, icon('trash', 14));
      rm.addEventListener('click', () => { plan.home.advice.splice(i, 1); touch(); drawAdvice(); });
      return h('div.row', { style: { gap: '8px', alignItems: 'flex-start', padding: '5px 0', flexWrap: 'nowrap' } }, h('div', { style: { flex: 1, minWidth: 0 } }, inp), rm);
    }));
  };
  const areas = [...new Set([...plan.goals.map((g) => g.area), 'general'])];
  const adviceSel = select([{ id: '', label: 'Hazır öneri ekle…' }, ...areas.flatMap((a) => (FAMILY_ADVICE[a] || []).map((t) => ({ id: t, label: clip(t, 90), group: AREA_LABEL[a] || a })))], '', { disabled: !canWrite });
  adviceSel.addEventListener('change', () => { if (adviceSel.value && plan.home.advice.length < 20) { plan.home.advice.push(adviceSel.value); touch(); drawAdvice(); } adviceSel.value = ''; });
  const addAdvice = h('button.btn.btn-ghost.btn-sm', { disabled: !canWrite }, icon('plus', 14), 'Kendi önerim');
  addAdvice.addEventListener('click', () => { if (plan.home.advice.length < 20) { plan.home.advice.push(''); touch(); drawAdvice(); } });
  drawAdvice();
  const homeNote = h('textarea.textarea', { rows: 3, maxlength: 2000, disabled: !canWrite, placeholder: 'Danışan / aile ile paylaşmak istediğiniz not (isteğe bağlı)…' }, plan.home.note || '');
  homeNote.addEventListener('input', () => { plan.home.note = homeNote.value; touch(); });

  // ---- Danışan bağlantısı ve izleme ----
  const linkHost = h('div');
  const linkNotice = h('div'); // yeni oluşturulan bağlantı yalnız bir kez burada gösterilir
  const drawLinks = async () => {
    if (!app.repo.links?.supported) {
      mount(linkHost, h('div.callout.info', null, icon('cloud', 18), h('div', null, 'Danışan bağlantısı yalnızca bulut veritabanıyla çalışır: danışanın telefonu bu bilgisayardaki yerel veriye erişemez. Ev programını yine de buradan hazırlayıp çıktı olarak verebilirsiniz.')));
      return;
    }
    let links = []; let logs = [];
    try { [links, logs] = await Promise.all([app.repo.links.list(p.id), app.repo.links.logs(p.id)]); } catch (err) {
      mount(linkHost, h('div.callout.warn', null, icon('alert', 18), h('div', null, `Bağlantılar okunamadı: ${err.message} Supabase'de supabase/schema.sql dosyasını yeniden çalıştırmanız gerekebilir.`)));
      return;
    }
    const active = links.filter((l) => !l.revokedAt && new Date(l.expiresAt) > new Date());
    const sum = homeSummary(logs);
    const createBtn = h('button.btn.btn-primary.btn-sm', { disabled: !canWrite }, icon('link', 15), active.length ? 'Yeni bağlantı oluştur' : 'Danışan bağlantısı oluştur');
    createBtn.addEventListener('click', async () => {
      if (dirty) { toast('Önce planı kaydedin; danışan kaydedilmiş programı görür.', 'warning'); return; }
      const ok = await confirmDialog({
        title: 'Danışan bağlantısı oluşturulsun mu?',
        message: 'Bağlantıyı açan herkes bu danışanın ev programını (günlük çalışmalar, ödevler, öneriler, paylaşılan not) görebilir ve günlük kayıt girebilir. Ad, tanı, seans ve ses kayıtları görünmez. Bağlantıyı yalnızca danışana ya da velisine gönderin; danışanın / velinin bu paylaşım için onayını aldığınızdan emin olun. Bağlantı 180 gün geçerlidir ve istediğiniz zaman iptal edilebilir.',
        confirmText: 'Oluştur',
      });
      if (!ok) return;
      try {
        const { token } = await app.repo.links.create(p.id, 180);
        const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}takip.html#${token}`;
        const box = h('input.input', { readonly: true, value: url, 'aria-label': 'Danışan bağlantısı' });
        const copy = h('button.btn.btn-ghost.btn-sm', null, icon('copy', 14), 'Kopyala');
        copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); toast('Bağlantı kopyalandı.', 'success'); } catch { box.select(); } });
        await drawLinks();
        mount(linkNotice, h('div.callout.warn.mt-2', null, icon('alert', 18), h('div', { style: { flex: 1, minWidth: 0 } },
          h('b', null, 'Bağlantı yalnızca şimdi gösterilir; kopyalayıp danışana iletin. '), 'Kaybolursa yenisini oluşturup eskisini iptal edin.',
          h('div.row.mt-2', { style: { gap: '8px', flexWrap: 'nowrap' } }, box, copy))));
      } catch (err) { toast(err.message, 'error'); }
    });
    mount(linkHost,
      h('div.row.between', null, h('div.small.muted', null, active.length ? `${active.length} etkin bağlantı` : 'Etkin bağlantı yok'), createBtn), linkNotice,
      links.length ? h('div.table-wrap.mt-2', null, h('table.table', null,
        h('thead', null, h('tr', null, h('th', null, 'Oluşturuldu'), h('th', null, 'Son açılış'), h('th', null, 'Durum'), h('th', null, ''))),
        h('tbody', null, links.map((l) => {
          const live = !l.revokedAt && new Date(l.expiresAt) > new Date();
          const rv = h('button.btn.btn-ghost.btn-sm', { disabled: !canWrite || !live }, 'İptal et');
          rv.addEventListener('click', async () => {
            if (!(await confirmDialog({ title: 'Bağlantı iptal edilsin mi?', message: 'Bu bağlantı bir daha açılamaz. Girilmiş günlük kayıtlar korunur.', confirmText: 'İptal et', danger: true }))) return;
            try { await app.repo.links.revoke(l.id); toast('Bağlantı iptal edildi.', 'success'); drawLinks(); } catch (err) { toast(err.message, 'error'); }
          });
          return h('tr', null, h('td', null, fmtDate(l.createdAt)), h('td', null, l.lastSeenAt ? fmtDateTime(l.lastSeenAt) : h('span.faint', null, 'hiç açılmadı')),
            h('td', null, l.revokedAt ? badge('iptal edildi', 'outline') : live ? badge(`${fmtDate(l.expiresAt)} tarihine kadar`, 'ok') : badge('süresi doldu', 'warn')), h('td', null, rv));
        })))) : null,
      h('div.divider'),
      h('h3', { style: { fontSize: '15px', margin: '0 0 8px' } }, 'Ev çalışması izleme'),
      logs.length ? h('div', null,
        h('div.plan-week', null, sum.days.map((d) => h(`div.plan-day${d.done === true ? '.done' : d.done === false ? '.miss' : ''}`, { title: d.note || '' }, h('span', null, d.done === true ? '✓' : d.done === false ? '–' : ''), d.day.slice(8, 10)))),
        h('div.row.mt-2', { style: { gap: '18px' } }, h('span.small', null, h('b', null, `${sum.streak} gün `), 'üst üste'), h('span.small', null, h('b', null, `%${sum.weekPct} `), 'son 7 gün')),
        h('div.table-wrap.mt-2', null, h('table.table', null,
          h('thead', null, h('tr', null, h('th', null, 'Gün'), h('th', null, 'Durum'), h('th', null, 'Not'))),
          h('tbody', null, logs.slice(0, 14).map((l) => h('tr', null, h('td', null, fmtDate(l.day)), h('td', null, l.done ? badge(`yapıldı${l.slot ? ' · ' + SLOT_TR[l.slot] : ''}`, 'ok') : badge('yapılmadı', 'warn')), h('td.small', { style: { whiteSpace: 'pre-wrap' } }, l.note || '—')))))))
        : h('p.small.muted', null, 'Henüz günlük kayıt yok. Danışan bağlantıyı açıp "Yaptık / Yapamadık" işaretlediğinde burada görünür.'));
  };
  drawLinks();

  const card = (ic, title, sub, body, actions = null) => h('div.card', null, h('div.card-head', null, h('h2', null, icon(ic, 18), title), actions || (sub ? h('span.sub', null, sub) : null)), h('div.card-body', null, body));
  mount(root,
    h('div.page-head', null, h('div', null,
      h('div.eyebrow', null, icon('note', 14), 'Terapi planı ve ev programı'),
      h('h1', null, p.code),
      h('p', null, 'Hedefler son seansın ölçütlerinden kalıp tabanlı olarak önerilir; düzenleyip onaylamak size aittir. Ev programı bölümü, danışan bağlantısını açan kişinin gördüğü içeriktir.'))),
    h('div.grid.grid-main', null,
      h('div.stack', null,
        card('target', 'Hedefler', null, goalsHost, h('span.row', { style: { gap: '8px' } }, suggestBtn, addGoal)),
        card('fileText', 'Seans planı', null, h('div', null, sessionPlan), draftBtn),
        card('home', 'Ev programı (danışanla paylaşılır)', null, h('div', null,
          h('h3', { style: { fontSize: '14.5px', margin: '0 0 4px' } }, 'Günlük ev çalışmaları'),
          listEditor(plan.home.tasks, [{ key: 'title', ph: 'Çalışma (ör. /r/ kartlarını adlandırma)', max: 160 }, { key: 'freq', ph: 'Sıklık (ör. günde 2 kez, 5 dk)', max: 120, flex: '0 1 200px' }, { key: 'note', ph: 'Dikkat edilecekler', max: 600, area: true, flex: '1 1 100%' }], 'Çalışma ekle'),
          h('div.divider'),
          h('h3', { style: { fontSize: '14.5px', margin: '0 0 4px' } }, 'Ödevler'),
          listEditor(plan.home.homework, [{ key: 'title', ph: 'Ödev (ör. Minimal çift sayfası)', max: 160 }, { key: 'how', ph: 'Nasıl yapılır?', max: 1200, area: true, flex: '1 1 100%' }], 'Ödev ekle'),
          h('p.tiny.muted', null, 'Materyal Atölyesi\'nde hazırladığınız PDF\'i ayrıca verin; buraya adını ve nasıl uygulanacağını yazın.'),
          h('div.divider'),
          h('h3', { style: { fontSize: '14.5px', margin: '0 0 4px' } }, 'Aileye öneriler'),
          adviceHost, h('div.row.mt-1', { style: { gap: '8px' } }, h('div', { style: { flex: '1 1 260px' } }, adviceSel), addAdvice),
          h('div.divider'),
          field('Paylaşılan not', homeNote)))),
      h('div.stack', null,
        card('calendar', 'Haftalık seans günleri', null, schedHost),
        card('link', 'Danışan bağlantısı', 'şifresiz, kişiye özel', linkHost))));
  return () => { app.setGuard?.(null); };
}
