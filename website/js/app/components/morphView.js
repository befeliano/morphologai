/** Biçimbirim çözümlemesi görünümleri: çipler, sözcük kartı, düzeltme penceresi. */
import { h, icon, popover, closePopovers, select, toast, badge } from '../ui/dom.js';
import { POS_LABEL, POS_CSS } from '../../core/text/lexicon.js';
import { applyAlternative, manualAnalysis } from '../../core/text/morphology.js';

export const POS_OPTIONS = ['noun', 'verb', 'adj', 'adv', 'pron', 'det', 'conj', 'postp', 'num', 'prop', 'interj', 'ques'].map((id) => ({ id, label: POS_LABEL[id] }));

export function posTag(pos, label) {
  return h('span.pos-tag', { dataset: { pos: POS_CSS[pos] || 'other' } }, label || POS_LABEL[pos] || pos);
}

/** kök + ek çipleri */
export function chips(a) {
  if (!a) return h('span.faint', null, '—');
  const wrap = h('span.mchips');
  a.morphemes.forEach((m, i) => {
    if (i) wrap.appendChild(h('span.mplus', null, '+'));
    const cls = m.type === 'root' ? (a.known ? 'root' : 'unk') : m.type === 'deriv' ? 'deriv' : 'infl';
    const title = m.type === 'root'
      ? `${m.label}${m.note ? ' · ' + m.note : ''}${a.known ? '' : ' · sözlükte yok'}`
      : `${m.label}${m.type === 'deriv' ? ' · MLU-m\'de sayılmaz' : ''} · yüzey: -${m.surface}`;
    wrap.appendChild(h(`span.mchip.${cls}`, { title }, m.type === 'root' ? m.display : `-${m.display}`));
  });
  return wrap;
}

/** Canlı akışta sözcük hapı */
export function wordPill(t) {
  const a = t.a;
  const el = h('span.word-pill', { dataset: { pos: a ? POS_CSS[a.pos] || 'other' : 'other' }, title: a ? `${POS_LABEL[a.pos] || a.pos} · ${a.morphemeCount} biçimbirim` : '' });
  if (t.excluded) el.classList.add('excluded');
  if (!a || a.morphemes.length === 1) {
    el.appendChild(h('span.seg-root', null, t.text));
  } else {
    el.appendChild(h('span.seg-root', null, a.morphemes[0].surface));
    for (const m of a.morphemes.slice(1)) el.appendChild(h('span.seg-sfx', null, m.surface));
  }
  return el;
}

/**
 * Sözcük düzeltme penceresi: alternatif çözümlemeler ve elle bölütleme.
 * @param {HTMLElement} anchor
 * @param {object} token { text, norm, a }
 * @param {(analysis, {team:boolean}) => void} onPick
 */
export function openCorrection(anchor, token, onPick, { canTeam = true } = {}) {
  const a = token.a;
  const alts = a.alternatives || [];
  const seg = h('input.input', { value: a.morphemes.map((m) => m.surface).join('-'), style: { height: '36px', fontFamily: 'var(--mono)' } });
  const pos = select(POS_OPTIONS, a.pos, { style: { height: '36px' } });
  const team = h('input', { type: 'checkbox', checked: false });
  const content = h('div', null,
    h('div.row.between', null, h('b', null, token.text), posTag(a.pos, a.posLabel)),
    h('div.mt-1', null, chips(a)),
    a.context ? h('div.tiny.muted.mt-1', null, 'Bağlam: ', a.context.rule) : null,
    a.fromTarget ? h('div.tiny.muted.mt-1', null, `Hedef sözcükten çözümlendi: ${a.fromTarget}`) : null,
    alts.length ? h('div.tiny.muted.mt-2', { style: { fontWeight: 600 } }, 'DİĞER OLASI ÇÖZÜMLEMELER') : null,
    ...alts.map((alt) => {
      const row = h('div.alt-item', null, h('div', null, chips(alt), h('div.tiny.muted', null, `${POS_LABEL[alt.pos] || alt.pos} · ${alt.morphemeCount} biçimbirim`)), icon('check', 15));
      row.addEventListener('click', () => {
        closePopovers();
        onPick(applyAlternative(a, alt.signature), { team: team.checked });
      });
      return row;
    }),
    h('div.tiny.muted.mt-2', { style: { fontWeight: 600 } }, 'ELLE BÖLÜTLE'),
    h('div.row.mt-1', { style: { flexWrap: 'nowrap' } }, h('div', { style: { flex: 1 } }, seg), h('div', { style: { width: '120px' } }, pos)),
    h('div.tiny.muted.mt-1', null, 'Kök ve ekleri tire ile ayırın: gel-iyor-um. Biçimbirim sayısı parça sayısıdır.'),
    canTeam ? h('label.check.mt-2', { style: { fontSize: '12.5px' } }, team, h('span', null, 'Ekip sözlüğüne kaydet (bu sözcük her yerde böyle çözümlensin)')) : null,
    h('div.row.mt-2', { style: { justifyContent: 'flex-end' } },
      h('button.btn.btn-ghost.btn-sm', { on: { click: () => closePopovers() } }, 'Kapat'),
      h('button.btn.btn-primary.btn-sm', {
        on: {
          click: () => {
            const man = manualAnalysis(token.text, seg.value, pos.value);
            if (!man) { toast('Geçerli bir bölütleme girin.', 'warning'); return; }
            closePopovers();
            onPick(man, { team: team.checked });
          },
        },
      }, icon('save', 14), 'Uygula')));
  return popover(anchor, content, { width: 380 });
}

export function ambiguityBadge(a) {
  if (!a) return null;
  if (a.source === 'manual' || a.source === 'override') return badge('düzeltildi', 'ok');
  if (!a.known && a.pos !== 'prop') return badge('sözlükte yok', 'danger');
  if (a.ambiguous) return badge('belirsiz', 'warn');
  if (a.context && !a.context.confirmed) return badge('bağlam', 'info');
  return null;
}
