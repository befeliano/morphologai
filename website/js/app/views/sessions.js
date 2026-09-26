/** Geçmiş seanslar: filtrelenebilir liste ve araştırma dışa aktarımı. */
import { h, mount, icon, emptyState, select, debounce, download, modal, toast } from '../ui/dom.js';
import { MODULES, TASK_TYPES } from '../constants.js';
import { sessionTable, sessionDuration } from '../components/sessionTable.js';
import { sessionsCsv, wordsCsv } from '../../export/csv.js';
import { openSessionEditor, deleteSessionFlow } from '../components/sessionEdit.js';

export async function render(root, { query }, app) {
  app.setCrumbs([{ label: 'Geçmiş seanslar' }]);
  const [patients, loaded] = await Promise.all([app.repo.patients.list({ includeArchived: true }), app.repo.sessions.list()]);
  let sessions = loaded;
  const byId = new Map(patients.map((p) => [p.id, p]));

  const q = h('input.input', { type: 'search', placeholder: 'Danışan kodu / adı, görev ayrıntısı…' });
  const mod = select([{ id: '', label: 'Tüm modüller' }, ...MODULES.map((m) => ({ id: m.id, label: m.label }))], query.module || '');
  const task = select([{ id: '', label: 'Tüm görevler' }, ...TASK_TYPES], '');
  const status = select([{ id: '', label: 'Tüm durumlar' }, { id: 'verified', label: 'Doğrulandı' }, { id: 'draft', label: 'Taslak' }], '');
  const from = h('input.input', { type: 'date' });
  const to = h('input.input', { type: 'date' });
  const host = h('div');
  const countEl = h('span.muted.small');
  let filtered = sessions;

  const draw = () => {
    const term = q.value.trim().toLocaleLowerCase('tr-TR');
    filtered = sessions.filter((s) => {
      const p = byId.get(s.patientId);
      if (mod.value && (s.module || 'aphasia') !== mod.value) return false;
      if (task.value && s.taskType !== task.value) return false;
      if (status.value && (s.status || 'draft') !== status.value) return false;
      if (from.value && s.recordedAt.slice(0, 10) < from.value) return false;
      if (to.value && s.recordedAt.slice(0, 10) > to.value) return false;
      if (term && ![p?.code, p?.fullName, s.taskDetail, s.transcript?.text?.slice(0, 400)].some((x) => (x || '').toLocaleLowerCase('tr-TR').includes(term))) return false;
      return true;
    });
    const total = filtered.reduce((t, s) => t + (sessionDuration(s) || 0), 0);
    countEl.textContent = `${filtered.length} seans · ${Math.round(total / 60)} dk kayıt`;
    if (!sessions.length) {
      mount(host, emptyState({ icon: 'folder', title: 'Henüz seans yok', text: 'Canlı kayıt, ses dosyası ya da transkript ile ilk seansınızı başlatın.', action: h('a.btn.btn-primary', { href: '#/seans/yeni' }, icon('plus', 16), 'Yeni seans') }));
      return;
    }
    mount(host, filtered.length ? sessionTable(filtered, byId, {
      onEdit: app.can('session.write') ? async (s) => {
        const full = await app.repo.sessions.get(s.id);
        if (full && (await openSessionEditor(app, full))) { sessions = await app.repo.sessions.list(); draw(); }
      } : null,
      onDelete: app.can('session.delete') ? async (s) => {
        if (await deleteSessionFlow(app, s, byId.get(s.patientId))) { sessions = sessions.filter((x) => x.id !== s.id); draw(); }
      } : null,
    }) : emptyState({ icon: 'search', title: 'Eşleşen seans yok', text: 'Filtreleri değiştirin.' }));
  };
  [q].forEach((x) => x.addEventListener('input', debounce(draw, 150)));
  [mod, task, status, from, to].forEach((x) => x.addEventListener('change', draw));

  const exportBtn = h('button.btn.btn-ghost.btn-sm', { disabled: !sessions.length || !app.can('export') }, icon('download', 15), 'Araştırma dışa aktarımı');
  exportBtn.addEventListener('click', () => {
    const excel = h('input', { type: 'checkbox' });
    const names = h('input', { type: 'checkbox' });
    modal({
      title: 'Araştırma dışa aktarımı (CSV)',
      body: h('div.stack', null,
        h('p.small.muted', null, `Şu anki filtreye uyan ${filtered.length} seans dışa aktarılır. Seans düzeyi dosyada her satır bir seanstır (SPSS, R, Excel); sözcük düzeyi dosyada her satır bir sözcüğün biçimbirim çözümlemesidir.`),
        h('label.check', null, excel, h('span', null, h('b', null, 'Türkçe Excel biçimi'), h('span.muted', null, ' — noktalı virgül ayraç, virgül ondalık'))),
        h('label.check', null, names, h('span', null, h('b', null, 'Danışan adlarını ekle'), h('span.muted', null, ' — önerilmez; varsayılan olarak yalnızca kod yazılır'))),
        h('div.callout.info', null, icon('shield', 18), h('div', null, 'Dışa aktarılan dosyalar sağlık verisi içerebilir; etik kurul ve KVKK gereklerine uygun saklayın.'))),
      actions: [
        { label: 'Kapat' },
        {
          label: 'Sözcük düzeyi', icon: 'fileText', onClick: async () => {
            // Listeler sözcük tablolarını içermeyebilir (bulut); tam kayıtları al
            const ids = new Set(filtered.map((s) => s.id));
            const full = (await app.repo.sessions.list({ full: true })).filter((s) => ids.has(s.id));
            const rows = full.filter((s) => s.analysis).map((s) => ({ session: s, patient: byId.get(s.patientId), a: s.analysis }));
            download(new Blob([wordsCsv(rows, { excelTr: excel.checked })], { type: 'text/csv;charset=utf-8' }), `MorphologAI_sozcukler_${new Date().toISOString().slice(0, 10)}.csv`);
            toast('Sözcük düzeyi CSV indirildi.', 'success');
            return false;
          },
        },
        {
          label: 'Seans düzeyi', variant: 'btn-primary', icon: 'download', onClick: () => {
            const rows = filtered.map((s) => ({ session: s, patient: byId.get(s.patientId), a: s.analysis || {} }));
            download(new Blob([sessionsCsv(rows, { excelTr: excel.checked, includeNames: names.checked })], { type: 'text/csv;charset=utf-8' }), `MorphologAI_seanslar_${new Date().toISOString().slice(0, 10)}.csv`);
            toast('Seans düzeyi CSV indirildi.', 'success');
            return false;
          },
        },
      ],
    });
  });
  app.setActions([
    exportBtn,
    app.can('session.write') ? h('a.btn.btn-ghost.btn-sm', { href: '#/seans/yeni?mode=upload', title: 'Önceden kaydedilmiş bir sesi ya da transkripti kendi tarihiyle ekleyin' }, icon('calendar', 15), 'Geçmiş seans ekle') : null,
    h('a.btn.btn-primary.btn-sm', { href: '#/seans/yeni' }, icon('plus', 15), 'Yeni seans'),
  ]);

  mount(root,
    h('div.page-head', null, h('div', null, h('h1', null, 'Geçmiş seanslar'), h('p', null, 'Tüm kayıtlar: danışan, tarih-saat, süre, ses kaydı, ölçütler ve rapor. Bir seansı açarak dinleyebilir, transkripti düzenleyebilir ve rapor alabilirsiniz.'))),
    h('div.card', null,
      h('div.card-body', null,
        h('div.row', { style: { marginBottom: '10px' } },
          h('div.input-icon', { style: { flex: '1 1 260px' } }, icon('search', 16), q),
          h('div', { style: { width: '180px' } }, mod), h('div', { style: { width: '200px' } }, task), h('div', { style: { width: '150px' } }, status)),
        h('div.row', { style: { marginBottom: '14px' } },
          h('span.small.muted', null, 'Tarih:'), h('div', { style: { width: '170px' } }, from), h('span.muted', null, '–'), h('div', { style: { width: '170px' } }, to),
          h('div', { style: { flex: 1 } }), countEl),
        host)));
  draw();
}
