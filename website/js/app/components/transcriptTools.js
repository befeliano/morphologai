/** Transkript düzenleme yardımcıları: kod ekleme düğmeleri ve kurallar. */
import { h } from '../ui/dom.js';

const CODES = [
  ['T:', 'Terapist satırı (satır başına)', 'line'],
  ['[/]', 'Tekrar (önceki sözcük sayılmaz)'],
  ['[//]', 'Düzeltme / yeniden başlama'],
  ['[* s]', 'Anlamsal parafazi'],
  ['[* p]', 'Fonolojik parafazi'],
  ['[* n]', 'Neolojizm'],
  ['[: ]', 'Hedef sözcük (parafazide)', 'target'],
  ['&-ıı', 'Dolgu'],
  ['xxx', 'Anlaşılmayan sözcük'],
  ['(.)', 'Duraksama'],
  ['[blk]', 'Blok (kekemelik)'],
  ['...', 'Yarım kalan sözce'],
];

function insertAt(ta, text, mode) {
  const s = ta.selectionStart ?? ta.value.length;
  const e = ta.selectionEnd ?? s;
  let ins = text;
  let caret;
  if (mode === 'line') {
    const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
    ta.setRangeText(`${text} `, lineStart, lineStart, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return;
  }
  const before = ta.value.slice(0, s);
  if (before && !/\s$/.test(before)) ins = ` ${ins}`;
  if (mode === 'target') { ins = before && !/\s$/.test(before) ? ' [: ]' : '[: ]'; caret = s + ins.length - 1; }
  ta.setRangeText(ins, s, e, 'end');
  if (caret != null) ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
}

export function transcriptToolbar(ta) {
  return h('div.tx-toolbar', null, CODES.map(([code, title, mode]) => h('button', { type: 'button', title, on: { click: () => insertAt(ta, code, mode) } }, code)));
}

export function transcriptHelp() {
  const row = (code, desc) => h('tr', null, h('td', { style: { padding: '5px 8px 5px 0', whiteSpace: 'nowrap' } }, h('code.mono', { style: { fontSize: '12px' } }, code)), h('td.small', { style: { padding: '5px 0', color: 'var(--text-2)' } }, desc));
  return h('div.small', null,
    h('p.muted', { style: { marginBottom: '8px' } }, 'Her satır bir sözcedir. Satır başındaki [dd:ss] zaman damgası sesle eşleştirme içindir (isteğe bağlı).'),
    h('table', { style: { borderCollapse: 'collapse', width: '100%' } }, h('tbody', null,
      row('T: …', 'Terapist / inceleyici sözcesi — ölçütlere katılmaz'),
      row('ııı  eee  &-ıı', 'Dolgu — MLU\'dan çıkarılır, ayrıca sayılır'),
      row('ka-  &+ka', 'Yarım kalmış sözcük / ses parçası'),
      row('sözcük [/]', 'Tekrar — ilk söyleniş sayılmaz'),
      row('<iki sözcük> [/]', 'Öbek tekrarı'),
      row('sözcük [//]', 'Düzeltme (yeniden başlama)'),
      row('sözcük [* s|p|n|m]', 'Parafazi: anlamsal / fonolojik / neolojizm / biçimbirimsel'),
      row('kalam [* p] [: kalem]', 'Hedef sözcük — çözümleme hedef üzerinden yapılır'),
      row('xxx', 'Anlaşılmayan — sözce MLU\'dan çıkarılır'),
      row('(.) (..) (2.5)', 'Duraksama işaretleri'),
      row('... / +...', 'Yarım kalan sözce — MLU\'dan çıkarılır'),
      row('b-b-bebek', 'Parça sözcük tekrarı (kekemelik)'),
      row('s:u  sssu', 'Uzatma (kekemelik)'),
      row('sözcük [blk]', 'Blok (kekemelik)'))),
    h('p.tiny.muted', { style: { marginTop: '8px' } }, 'Kodlar CHAT/AphasiaBank kurallarının bir alt kümesidir; .cha dosyaları içe ve dışa aktarılabilir.'));
}
