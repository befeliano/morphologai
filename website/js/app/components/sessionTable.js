/** Seans listesi tablosu (panel, danışan sayfası ve geçmiş seanslar). */
import { h, icon, num, fmtDate, fmtTime, fmtDur, badge } from '../ui/dom.js';
import { moduleOf, taskOf } from '../constants.js';

export function sessionDuration(s) {
  return s.acoustic?.durationSec ?? s.audioMeta?.durationSec ?? s.analysis?.fluency?.durationSec ?? null;
}

/** Modüle göre seansın ana ölçütü. */
export function keyMetric(s) {
  const a = s.analysis || {};
  switch (s.module) {
    case 'fluency':
      return { label: '%SS', value: a.stuttering?.percentSS != null ? `%${num(a.stuttering.percentSS, 1)}` : '—' };
    case 'voice': {
      const v = s.voice;
      if (s.taskType === 'sz' && s.sz?.ratio) return { label: 's/z', value: num(s.sz.ratio, 2) };
      return { label: 'HNR · jitter', value: v?.ok ? `${num(v.hnr, 1)} dB · %${num(v.jitterLocal, 2)}` : '—' };
    }
    case 'motor':
      return { label: 'DDK hızı', value: s.ddk?.ok ? `${num(s.ddk.rate, 1)} hece/sn` : '—' };
    default:
      return { label: 'MLU-m', value: a.language?.mluM != null ? num(a.language.mluM, 2) : '—' };
  }
}

export function screeningBadge(s) {
  const sc = s.analysis?.screening;
  if (s.module !== 'aphasia' && s.module) {
    const b = s.module === 'fluency' ? s.analysis?.stuttering?.band : null;
    if (b?.label) return badge(b.label, b.tone === 'danger' ? 'danger' : b.tone === 'warn' ? 'warn' : b.tone === 'ok' ? 'ok' : 'info');
    return h('span.faint.small', null, '—');
  }
  if (!sc || !sc.available || sc.overall == null) return h('span.faint.small', null, '—');
  const tone = { ok: 'ok', info: 'info', warn: 'warn', danger: 'danger' }[sc.band?.tone] || 'info';
  return badge(sc.band?.label ? `${sc.overall} · ${sc.band.label.split(' —')[0]}` : String(sc.overall), tone);
}

export function statusBadge(s) {
  return s.status === 'verified' ? badge('Doğrulandı', 'ok', true) : badge('Taslak', 'warn', true);
}

/**
 * @param {object} o  showPatient, onOpen(s), onEdit(s), onDelete(s) — düzenle/sil verilirse satırda düğme görünür
 */
export function sessionTable(sessions, patientsById, { showPatient = true, onOpen, onEdit, onDelete } = {}) {
  const act = (ic, title, fn, danger = false) => h('button.btn.btn-text.btn-sm.btn-icon', {
    type: 'button', title, 'aria-label': title, style: danger ? { color: 'var(--danger)' } : null,
    on: { click: (e) => { e.stopPropagation(); fn(); } },
  }, icon(ic, 15));
  const head = h('tr', null,
    showPatient ? h('th', null, 'Danışan') : null,
    h('th', null, 'Tarih'),
    h('th', null, 'Modül / görev'),
    h('th.num', null, 'Süre'),
    h('th', null, 'Ana ölçüt'),
    h('th', null, 'Değerlendirme'),
    h('th', null, 'Durum'),
    h('th', null, ''));
  const rows = sessions.map((s) => {
    const p = patientsById.get(s.patientId);
    const mod = moduleOf(s.module);
    const km = keyMetric(s);
    const tr = h('tr.clickable', { on: { click: () => (onOpen ? onOpen(s) : (location.hash = `#/seans/${s.id}`)) } },
      showPatient ? h('td', null,
        h('div.strong', null, p ? p.code : '—'),
        h('div.tiny.muted', null, p?.fullName || (p?.demo ? 'örnek' : ''))) : null,
      h('td', null, h('div', null, fmtDate(s.recordedAt)), h('div.tiny.muted', null, fmtTime(s.recordedAt))),
      h('td', null, h('div', { style: { fontWeight: 500 } }, mod.label), h('div.tiny.muted', null, taskOf(s.taskType).label)),
      h('td.num', null, fmtDur(sessionDuration(s))),
      h('td', null, h('div.tiny.muted', null, km.label), h('div.strong.num', null, km.value)),
      h('td', null, screeningBadge(s)),
      h('td', null, statusBadge(s)),
      h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } },
        s.audioId ? h('span', { title: 'Ses kaydı var', style: { color: 'var(--accent-600)', display: 'inline-flex', marginRight: '6px', verticalAlign: 'middle' } }, icon('headphones', 16)) : null,
        s.demo ? badge('örnek', 'outline') : null,
        onEdit ? act('edit', 'Seans bilgilerini düzenle', () => onEdit(s)) : null,
        onDelete ? act('trash', 'Seansı sil', () => onDelete(s), true) : null,
        h('span', { style: { color: 'var(--faint)', display: 'inline-flex', verticalAlign: 'middle' } }, icon('chevronRight', 16))));
    return tr;
  });
  return h('div.table-wrap', null, h('table.table', null, h('thead', null, head), h('tbody', null, rows)));
}
