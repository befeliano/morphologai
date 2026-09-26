/** Seans bilgilerini düzenleme ve silme (liste, danışan sayfası ve seans ekranı ortak). */
import { h, field, select, modal, toast, confirmDialog } from '../ui/dom.js';
import { MODULES, moduleOf, taskOf } from '../constants.js';

const toLocalInput = (iso) => {
  const d = new Date(iso || Date.now());
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/**
 * @returns {Promise<object|null>} kaydedilen seans ya da vazgeçilirse null
 */
export async function openSessionEditor(app, session) {
  if (!app.can('session.write')) { toast('Seans düzenleme yetkiniz yok.', 'warning'); return null; }
  const patients = await app.repo.patients.list({ includeArchived: true });
  const when = h('input.input', { type: 'datetime-local', value: toLocalInput(session.recordedAt), required: true });
  const pat = select(patients.map((p) => ({ id: p.id, label: `${p.code}${p.fullName ? ' · ' + p.fullName : ''}` })), session.patientId);
  const mod = select(MODULES.map((m) => ({ id: m.id, label: m.label })), session.module || 'aphasia');
  const task = h('select.select');
  const fillTasks = () => {
    const m = moduleOf(mod.value);
    const cur = m.tasks.includes(task.value || session.taskType) ? (task.value || session.taskType) : m.defaultTask;
    task.replaceChildren(...m.tasks.map((id) => h('option', { value: id, selected: id === cur }, taskOf(id).label)));
  };
  mod.addEventListener('change', fillTasks);
  fillTasks();
  const detail = h('input.input', { value: session.taskDetail || '', maxlength: 200 });
  const status = select([{ id: 'draft', label: 'Taslak' }, { id: 'verified', label: 'Transkript doğrulandı' }], session.status || 'draft');
  return new Promise((resolve) => {
    let saved = null;
    modal({
      title: 'Seans bilgilerini düzenle',
      body: h('div.stack', null,
        h('div.form-grid', null,
          field('Tarih ve saat', when, 'Geçmiş bir seansı doğru tarihe taşımak için değiştirin.'),
          field('Danışan', pat),
          field('Klinik modül', mod),
          field('Görev türü', task),
          field('Görev ayrıntısı', detail),
          field('Durum', status)),
        h('p.tiny.muted', null, 'Modül ya da görev değişikliği mevcut ölçümleri silmez; sesle ilgili modül ölçümleri için seans ekranındaki "Yeniden ölç"ü kullanın.')),
      actions: [
        { label: 'Vazgeç' },
        {
          label: 'Kaydet', variant: 'btn-primary', icon: 'save', onClick: async () => {
            if (!when.value) { toast('Tarih ve saat girin.', 'warning'); return false; }
            const d = new Date(when.value);
            if (Number.isNaN(d.getTime())) { toast('Geçersiz tarih.', 'warning'); return false; }
            if (d.getTime() > Date.now() + 5 * 60000) { toast('Seans tarihi gelecekte olamaz.', 'warning'); return false; }
            saved = await app.repo.sessions.save({
              ...session,
              recordedAt: d.toISOString(),
              patientId: pat.value,
              module: mod.value,
              taskType: task.value,
              taskDetail: detail.value.trim(),
              status: status.value,
              ...(status.value === 'verified' && session.status !== 'verified' ? { verifiedAt: new Date().toISOString(), verifiedBy: app.ctx.user.id } : {}),
            });
            app.normsCache?.clear();
            toast('Seans bilgileri güncellendi.', 'success');
            return true;
          },
        },
      ],
      onClose: () => resolve(saved),
    });
  });
}

/** Onay alıp seansı (ses kaydı ve analiziyle) siler. @returns {Promise<boolean>} */
export async function deleteSessionFlow(app, session, patient) {
  if (!app.can('session.delete')) { toast('Seans silme yetkiniz yok.', 'warning'); return false; }
  const when = new Date(session.recordedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  const ok = await confirmDialog({
    title: 'Seans silinsin mi?',
    message: `${patient?.code || 'Danışan'} · ${when} seansı; ses kaydı, transkript ve analiz sonuçlarıyla birlikte kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
    confirmText: 'Kalıcı olarak sil',
    danger: true,
  });
  if (!ok) return false;
  await app.repo.sessions.remove(session.id);
  app.normsCache?.clear();
  app.refreshCounts();
  toast('Seans silindi.', 'success');
  return true;
}
