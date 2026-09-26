/** Danışan listesi. */
import { h, mount, icon, num, fmtDate, badge, emptyState, select, debounce } from '../ui/dom.js';
import { DIAGNOSES, GROUPS, labelOf } from '../constants.js';
import { openPatientForm } from '../components/patientForm.js';

export async function render(root, _p, app) {
  app.setCrumbs([{ label: 'Danışanlar' }]);
  const addBtn = h('button.btn.btn-primary.btn-sm', { disabled: !app.can('patient.write') }, icon('userPlus', 15), 'Yeni danışan');
  addBtn.addEventListener('click', async () => {
    const p = await openPatientForm(app);
    if (p) app.navigate(`/danisan/${p.id}`);
  });
  app.setActions([addBtn]);

  const [patients, sessions] = await Promise.all([app.repo.patients.list(), app.repo.sessions.list()]);
  const stats = new Map();
  for (const s of sessions) {
    const st = stats.get(s.patientId) || { n: 0, last: null };
    st.n++;
    if (!st.last || new Date(s.recordedAt) > new Date(st.last)) st.last = s.recordedAt;
    stats.set(s.patientId, st);
  }

  const q = h('input.input', { placeholder: 'Kod, ad ya da tanı ara…', type: 'search' });
  const grp = select([{ id: '', label: 'Tüm gruplar' }, ...GROUPS], '');
  const dx = select([{ id: '', label: 'Tüm tanılar' }, ...DIAGNOSES], '');
  const tableHost = h('div');

  const draw = () => {
    const term = q.value.trim().toLocaleLowerCase('tr-TR');
    const list = patients.filter((p) => (!grp.value || p.group === grp.value) && (!dx.value || p.diagnosis === dx.value)
      && (!term || [p.code, p.fullName, labelOf(DIAGNOSES, p.diagnosis)].some((x) => (x || '').toLocaleLowerCase('tr-TR').includes(term))));
    if (!patients.length) {
      mount(tableHost, emptyState({ icon: 'users', title: 'Henüz danışan yok', text: 'Danışanlarınızı kod ile ekleyin; ad bilgisi isteğe bağlıdır ve araştırma çıktılarına yazılmaz.', action: addBtn.cloneNode(true) }));
      tableHost.querySelector('button')?.addEventListener('click', () => addBtn.click());
      return;
    }
    if (!list.length) { mount(tableHost, emptyState({ icon: 'search', title: 'Sonuç yok', text: 'Arama ölçütlerinizi değiştirin.' })); return; }
    const rows = list.map((p) => {
      const st = stats.get(p.id) || { n: 0, last: null };
      const age = p.birthYear ? new Date().getFullYear() - p.birthYear : null;
      return h('tr.clickable', { on: { click: () => app.navigate(`/danisan/${p.id}`) } },
        h('td', null, h('div.strong', null, p.code), p.demo ? badge('örnek', 'outline') : null),
        h('td', null, p.fullName || h('span.faint', null, '—')),
        h('td', null, `${age ?? '—'} / ${p.sex || '—'}`),
        h('td', null, p.group === 'control' ? badge('Kontrol', 'accent') : badge('Danışan', 'info')),
        h('td', null, labelOf(DIAGNOSES, p.diagnosis) || h('span.faint', null, '—')),
        h('td.num', null, num(st.n, 0)),
        h('td', null, st.last ? fmtDate(st.last) : h('span.faint', null, '—')),
        h('td', { style: { textAlign: 'right', color: 'var(--faint)' } }, icon('chevronRight', 16)));
    });
    mount(tableHost, h('div.table-wrap', null, h('table.table', null,
      h('thead', null, h('tr', null, ['Kod', 'Ad soyad', 'Yaş / cinsiyet', 'Grup', 'Tanı'].map((t) => h('th', null, t)), h('th.num', null, 'Seans'), h('th', null, 'Son seans'), h('th'))),
      h('tbody', null, rows))));
  };
  q.addEventListener('input', debounce(draw, 150));
  grp.addEventListener('change', draw);
  dx.addEventListener('change', draw);

  mount(root,
    h('div.page-head', null, h('div', null, h('h1', null, 'Danışanlar'), h('p', null, `${patients.length} danışan · ${patients.filter((p) => p.group === 'control').length} kontrol grubu`))),
    h('div.card', null,
      h('div.card-body', null,
        h('div.row', { style: { marginBottom: '14px' } },
          h('div.input-icon', { style: { flex: 1, minWidth: '220px' } }, icon('search', 16), q),
          h('div', { style: { width: '180px' } }, grp),
          h('div', { style: { width: '240px' } }, dx)),
        tableHost)));
  draw();
}
