/** Danışan ayrıntısı: bilgiler, seanslar ve ilerleme grafiği. */
import { h, mount, icon, num, fmtDate, badge, emptyState, select, toast, confirmDialog, download, safeName } from '../ui/dom.js';
import { DIAGNOSES, ETIOLOGIES, MODULES, labelOf, taskOf } from '../constants.js';
import { openPatientForm } from '../components/patientForm.js';
import { sessionTable } from '../components/sessionTable.js';
import { openSessionEditor, deleteSessionFlow } from '../components/sessionEdit.js';
import { TREND_METRICS } from '../components/metrics.js';
import { trendChart } from '../ui/charts.js';
import { sessionsCsv } from '../../export/csv.js';

export async function render(root, { params }, app) {
  const p = await app.repo.patients.get(params.id);
  if (!p) { mount(root, emptyState({ icon: 'user', title: 'Danışan bulunamadı', text: 'Silinmiş olabilir ya da başka bir ekibe ait.' })); return; }
  const sessions = await app.repo.sessions.list({ patientId: p.id });
  app.setCrumbs([{ label: 'Danışanlar', href: '#/danisanlar' }, { label: p.code }]);

  const editBtn = h('button.btn.btn-ghost.btn-sm', { disabled: !app.can('patient.write') }, icon('edit', 15), 'Düzenle');
  editBtn.addEventListener('click', async () => { if (await openPatientForm(app, p)) render(root, { params }, app); });
  const csvBtn = h('button.btn.btn-ghost.btn-sm', { disabled: !sessions.length }, icon('download', 15), 'CSV');
  csvBtn.addEventListener('click', () => {
    const rows = sessions.filter((s) => s.analysis).map((s) => ({ session: s, patient: p, a: s.analysis }));
    download(new Blob([sessionsCsv(rows)], { type: 'text/csv;charset=utf-8' }), `MorphologAI_${safeName(p.code)}_seanslar.csv`);
  });
  app.setActions([csvBtn, editBtn, h('a.btn.btn-primary.btn-sm', { href: `#/seans/yeni?patient=${p.id}` }, icon('plus', 15), 'Yeni seans')]);

  const age = p.birthYear ? new Date().getFullYear() - p.birthYear : null;
  const monthsPost = p.onsetDate ? ((Date.now() - new Date(p.onsetDate)) / 2629800000) : null;
  const info = (label, value) => h('div.row.between', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)' } }, h('span.muted.small', null, label), h('span.strong.small', { style: { textAlign: 'right' } }, value || '—'));

  // İlerleme grafiği
  const modulesUsed = [...new Set(sessions.map((s) => s.module || 'aphasia'))];
  const modSel = select(MODULES.filter((m) => modulesUsed.includes(m.id)).map((m) => ({ id: m.id, label: m.label })), modulesUsed[0] || 'aphasia');
  const taskSel = h('select.select');
  const metricSel = h('select.select');
  const canvas = h('canvas', { role: 'img', 'aria-label': 'İlerleme grafiği' });
  const chartNote = h('div.small.muted.mt-1');
  const tableNote = h('div');
  const refill = () => {
    const mod = modSel.value;
    const modSessions = sessions.filter((s) => (s.module || 'aphasia') === mod);
    const tasks = [...new Set(modSessions.map((s) => s.taskType))];
    const counts = tasks.map((t) => [t, modSessions.filter((s) => s.taskType === t).length]).sort((a, b) => b[1] - a[1]);
    mount(taskSel, ...counts.map(([t, n]) => h('option', { value: t }, `${taskOf(t).label} (${n})`)), h('option', { value: '' }, 'Tüm görevler (karşılaştırma önerilmez)'));
    mount(metricSel, ...TREND_METRICS.filter((m) => m.modules.includes(mod)).map((m) => h('option', { value: m.id }, m.label)));
    drawChart();
  };
  const drawChart = () => {
    const metric = TREND_METRICS.find((m) => m.id === metricSel.value);
    if (!metric) return;
    const list = sessions.filter((s) => (s.module || 'aphasia') === modSel.value && (!taskSel.value || s.taskType === taskSel.value))
      .map((s) => ({ x: new Date(s.recordedAt), y: metric.get(s), label: taskOf(s.taskType).label }))
      .filter((pt) => pt.y != null && Number.isFinite(pt.y)).sort((a, b) => a.x - b.x);
    if (list.length < 1) { chartNote.textContent = 'Bu ölçüt için veri yok.'; trendChart(canvas, [], {}); mount(tableNote); return; }
    const first = list[0].y;
    const last = list[list.length - 1].y;
    const diff = last - first;
    chartNote.textContent = list.length > 1
      ? `${list.length} seans · ilk ${num(first)} → son ${num(last)} (${diff >= 0 ? '+' : ''}${num(diff)}${metric.unit && metric.unit !== '/100' ? ' ' + metric.unit : ''}). Karşılaştırma yalnızca aynı görev türü için anlamlıdır.`
      : 'Eğilim için en az iki seans gerekir.';
    trendChart(canvas, list, { unit: metric.unit === '/100' ? '' : metric.unit });
    mount(tableNote, h('div.table-wrap.mt-2', null, h('table.table', null,
      h('thead', null, h('tr', null, h('th', null, 'Tarih'), h('th', null, 'Görev'), h('th.num', null, metric.label))),
      h('tbody', null, list.map((pt) => h('tr', null, h('td', null, fmtDate(pt.x.toISOString())), h('td', null, pt.label), h('td.num', null, num(pt.y))))))));
  };
  modSel.addEventListener('change', refill);
  taskSel.addEventListener('change', drawChart);
  metricSel.addEventListener('change', drawChart);

  const delBtn = h('button.btn.btn-text.btn-sm', { style: { color: 'var(--danger)' }, disabled: !app.can('session.delete') }, icon('trash', 15), 'Danışanı sil');
  delBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: `${p.code} silinsin mi?`, message: `Danışan ve ${sessions.length} seansı (ses kayıtları dahil) kalıcı olarak silinecek. Bu işlem geri alınamaz.`, confirmText: 'Kalıcı olarak sil', danger: true });
    if (!ok) return;
    await app.repo.patients.remove(p.id);
    toast('Danışan silindi.', 'success');
    app.refreshCounts();
    app.navigate('/danisanlar');
  });

  mount(root,
    h('div.page-head', null,
      h('div', null,
        h('div.eyebrow', null, icon('user', 14), p.group === 'control' ? 'Kontrol grubu' : 'Danışan'),
        h('h1', null, p.code, p.fullName ? h('span', { style: { fontWeight: 500, color: 'var(--muted)', fontSize: '20px', marginLeft: '10px' } }, p.fullName) : null),
        h('div.row.mt-1', null,
          p.diagnosis ? badge(labelOf(DIAGNOSES, p.diagnosis), 'info') : null,
          p.etiology ? badge(labelOf(ETIOLOGIES, p.etiology)) : null,
          age ? badge(`${age} yaş`) : null,
          monthsPost ? badge(`Başlangıçtan ${num(monthsPost, 0)} ay sonra`) : null,
          p.consent ? badge('Onam alındı', 'ok', true) : badge('Onam kaydı yok', 'warn', true),
          p.demo ? badge('örnek veri', 'outline') : null))),
    h('div.grid.grid-main', null,
      h('div.stack', null,
        h('div.card', null,
          h('div.card-head', null, h('h2', null, icon('trend', 18), 'İlerleme'), h('div.row', null, h('div', { style: { width: '170px' } }, modSel), h('div', { style: { width: '230px' } }, taskSel), h('div', { style: { width: '250px' } }, metricSel))),
          h('div.card-body', null, sessions.length ? h('div.chart-box', null, canvas) : emptyState({ icon: 'trend', title: 'Henüz seans yok', text: 'İlk seansı başlattığınızda ilerleme burada izlenir.' }), sessions.length ? chartNote : null, sessions.length ? tableNote : null)),
        h('div.card', null,
          h('div.card-head', null, h('h2', null, icon('folder', 18), `Seanslar (${sessions.length})`)),
          h('div.card-body.tight', null, sessions.length ? sessionTable(sessions, new Map([[p.id, p]]), {
            showPatient: false,
            onEdit: app.can('session.write') ? async (s) => { const full = await app.repo.sessions.get(s.id); if (full && (await openSessionEditor(app, full))) app.navigate(`/danisan/${p.id}`, { replace: true }); } : null,
            onDelete: app.can('session.delete') ? async (s) => { if (await deleteSessionFlow(app, s, p)) app.navigate(`/danisan/${p.id}`, { replace: true }); } : null,
          }) : emptyState({ icon: 'mic', title: 'Seans yok', text: 'Canlı kayıt, ses dosyası ya da transkript ile başlayın.', action: h('a.btn.btn-primary', { href: `#/seans/yeni?patient=${p.id}` }, icon('plus', 16), 'Yeni seans') })))),
      h('div.stack', null,
        h('div.card', null,
          h('div.card-head', null, h('h3', null, icon('user', 17), 'Bilgiler')),
          h('div.card-body', null,
            info('Kod', p.code), info('Ad soyad', p.fullName), info('Doğum yılı', p.birthYear ? `${p.birthYear} (${age} yaş)` : null),
            info('Cinsiyet', { K: 'Kadın', E: 'Erkek', D: 'Diğer' }[p.sex]), info('Eğitim', p.education != null ? `${p.education} yıl` : null),
            info('El tercihi', p.handedness), info('Tanı', labelOf(DIAGNOSES, p.diagnosis)), info('Etiyoloji', labelOf(ETIOLOGIES, p.etiology)),
            info('Başlangıç', p.onsetDate ? fmtDate(p.onsetDate) : null), info('Kayıt tarihi', fmtDate(p.createdAt)),
            p.notes ? h('div.mt-2', null, h('div.tiny.muted', null, 'NOTLAR'), h('p.small', { style: { whiteSpace: 'pre-wrap', marginTop: '4px' } }, p.notes)) : null,
            h('div.mt-3', null, delBtn))),
        h('div.card', null,
          h('div.card-head', null, h('h3', null, icon('layers', 17), 'Modüllere göre seanslar')),
          h('div.card-body', null, MODULES.map((m) => {
            const n = sessions.filter((s) => (s.module || 'aphasia') === m.id).length;
            return h('div.row.between', { style: { padding: '7px 0' } }, h('span.row', null, h(`span.ic.${m.tone}`, { style: { width: '28px', height: '28px', borderRadius: '9px', display: 'grid', placeItems: 'center' } }, icon(m.icon, 15)), m.label), h('b', null, n));
          }))))));
  if (sessions.length) refill();
}
