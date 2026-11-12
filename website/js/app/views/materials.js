/**
 * Materyal Atölyesi — terapi materyali üreticileri.
 * Ortak akış: ölçütleri seç → üret → önizle ve düzenle → PDF indir / kaydet.
 * Sözcükler sözcük bankasından (çekirdek liste + ekip sözcükleri), görseller ekibin kendi yüklediklerinden gelir.
 */
import { h, mount, icon, toast, field, select, badge, emptyState, download, safeName, confirmDialog, fmtDate, fmtBytes, debounce } from '../ui/dom.js';
import { getLexicon } from '../../core/text/lexicon.js';
import { toIPA, highlightParts, normalizeTarget } from '../../core/text/phonetics.js';
import { buildBank, filterWords, CATEGORIES, AGE_BANDS, POSITIONS, SEED_WORDS } from '../../core/materials/wordbank.js';
import {
  minimalPairs, PAIR_SETS, twoWordPhrases, wordSearch, scramble, crossword, letterMaze, sentenceStems, STEM_TOPICS, STEM_TENSES,
  whQuestions, WH_TYPES, shuffle, rng,
} from '../../core/materials/generators.js';
import { buildMaterialPdf } from '../../export/materialPdf.js';

const TOOLS = [
  { id: 'set', label: 'Sözcük seti', icon: 'grid', hint: 'Hedef ses, pozisyon ve hece sayısına göre kart, liste ya da çalışma sayfası' },
  { id: 'pairs', label: 'Minimal çift', icon: 'copy', hint: 'Tek ses farkıyla ayrılan sözcük çiftleri' },
  { id: 'phrases', label: 'İkili ifade', icon: 'link', hint: 'Sözcükten cümleye geçiş için iki sözcüklü öbekler' },
  { id: 'matching', label: 'Eşleştirme', icon: 'repeat', hint: 'Sözcük – resim eşleştirme sayfası' },
  { id: 'puzzle', label: 'Bulmaca', icon: 'hash', hint: 'Sözcük avı, karışık harfler, çengel bulmaca, labirent' },
  { id: 'stems', label: 'Cümle tamamlama', icon: 'note', hint: 'Konu ve zamana göre yarım cümleler' },
  { id: 'wh', label: '5N1K', icon: 'info', hint: 'Kim, ne, nerede, ne zaman, neden, nasıl soruları' },
  { id: 'ipa', label: 'IPA çevirici', icon: 'voice', hint: 'Türkçe metni IPA yazımına çevirir' },
  { id: 'media', label: 'Görsellerim', icon: 'folder', hint: 'Kendi görsellerinizi yükleyin ve sözcüklere bağlayın' },
  { id: 'bank', label: 'Sözcük bankası', icon: 'book', hint: 'Ekibin sözcükleri, kategori ve yaş etiketleri' },
  { id: 'saved', label: 'Kayıtlı', icon: 'save', hint: 'Kaydedilen materyaller' },
];

const KIND_LABEL = { cards: 'Kartlar', list: 'Liste', worksheet: 'Çalışma sayfası', pairs: 'Minimal çift', phrases: 'İkili ifade', matching: 'Eşleştirme', wordsearch: 'Sözcük avı', scramble: 'Karışık harfler', crossword: 'Çengel bulmaca', maze: 'Labirent', stems: 'Cümle tamamlama', wh: '5N1K' };

/** Görseli küçültüp JPEG'e çevirir (beyaz zemin; en uzun kenar ≤ max). */
async function toJpeg(blob, max = 1024, quality = 0.86) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const hh = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, hh);
  g.drawImage(bmp, 0, 0, w, hh);
  bmp.close?.();
  const out = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  return { blob: out, width: w, height: hh, dataUrl: () => c.toDataURL('image/jpeg', quality) };
}

export async function render(root, { query }, app) {
  app.setCrumbs([{ label: 'Materyal Atölyesi' }]);
  app.setActions([]);
  const canWrite = app.can('lexicon.write');
  const S = { custom: [], media: [], patients: [], thumbs: new Map(), dataUrls: new Map(), wideReady: false };
  const cleanups = [];

  async function reload() {
    [S.custom, S.media, S.patients] = await Promise.all([app.repo.words.list(), app.repo.media.list(), app.repo.patients.list()]);
    S.mediaIds = new Set(S.media.map((m) => m.id));
    // Silinmiş görsele bağlı sözcükler görselsiz sayılır
    S.customLive = S.custom.map((c) => (c.mediaId && !S.mediaIds.has(c.mediaId) ? { ...c, mediaId: null } : c));
  }
  try {
    await reload();
  } catch (err) {
    // Bulut şeması güncellenmemişse (words / media_files / materials tabloları yoksa) yol göster
    mount(root, h('div.card', null, h('div.card-body', null, emptyState({
      icon: 'database', title: 'Materyal Atölyesi için veritabanı güncellemesi gerekli',
      text: app.backend?.isCloud
        ? 'Supabase panelinde SQL Editor\'ı açıp depodaki supabase/schema.sql dosyasının tamamını yeniden çalıştırın (mevcut verilere dokunmaz), sonra bu sayfayı yenileyin.'
        : `Veriler yüklenemedi: ${err.message}`,
    }), h('p.tiny.muted', { style: { textAlign: 'center' } }, err.message))));
    return undefined;
  }
  const bank = (wide = false) => buildBank({ custom: S.customLive, lexicon: wide ? getLexicon() : null, wide });
  const customOf = (word) => S.customLive.find((c) => c.word === word) || null;

  async function thumbUrl(id) {
    if (!id) return null;
    if (S.thumbs.has(id)) return S.thumbs.get(id);
    const p = app.repo.media.get(id).then((m) => (m ? URL.createObjectURL(m.blob) : null)).catch(() => null);
    S.thumbs.set(id, p);
    return p;
  }
  cleanups.push(() => { for (const p of S.thumbs.values()) Promise.resolve(p).then((u) => u && URL.revokeObjectURL(u)); });
  function img(id, size = 72, alt = '') {
    const el = h('img.mat-img', { alt, width: size, height: size, style: { width: `${size}px`, height: `${size}px` } });
    if (id) thumbUrl(id).then((u) => { if (u) el.src = u; else el.classList.add('missing'); });
    else el.classList.add('missing');
    return el;
  }
  async function dataUrl(id) {
    if (S.dataUrls.has(id)) return S.dataUrls.get(id);
    const m = await app.repo.media.get(id);
    if (!m) return null;
    const j = await toJpeg(m.blob, 520, 0.85);
    const u = j.dataUrl();
    S.dataUrls.set(id, u);
    return u;
  }
  const hlWord = (word, target) => h('span', null, highlightParts(word, target).map((p) => (p.hit ? h('b.mat-hit', null, p.text) : p.text)));
  const item = (e) => ({ text: e.word, mediaId: e.mediaId || null });

  // -------------------------------------------------------------------------
  // Ortak: çıktı çubuğu (başlık, danışan, PDF, kaydet)
  // -------------------------------------------------------------------------
  function outputBar({ getDoc, defaultTitle }) {
    const title = h('input.input', { value: defaultTitle, maxlength: 120, 'aria-label': 'Materyal başlığı' });
    const patient = select([{ id: '', label: 'Danışan yok (ad satırı boş)' }, ...S.patients.map((p) => ({ id: p.id, label: p.code }))], '');
    const answers = h('input', { type: 'checkbox', checked: true });
    const pdfBtn = h('button.btn.btn-primary', null, icon('download', 16), 'PDF indir');
    const saveBtn = h('button.btn.btn-ghost', { disabled: !app.can('session.write') }, icon('save', 16), 'Kaydet');
    const collect = () => {
      const d = getDoc();
      if (!d) { toast('Önce materyali oluşturun.', 'warning'); return null; }
      return { ...d, title: title.value.trim() || defaultTitle };
    };
    pdfBtn.addEventListener('click', async () => {
      const d = collect();
      if (!d) return;
      pdfBtn.disabled = true;
      try {
        const ids = new Set();
        JSON.stringify(d.content, (k, v) => { if (k === 'mediaId' && v) ids.add(v); return v; });
        const images = new Map();
        for (const id of ids) { const u = await dataUrl(id); if (u) images.set(id, u); }
        const p = S.patients.find((x) => x.id === patient.value);
        const blob = await buildMaterialPdf({
          kind: d.kind, title: d.title, content: d.content, images, patientLabel: p ? p.code : '', withAnswers: answers.checked,
          clinician: `${app.ctx.user.title ? app.ctx.user.title + ' ' : ''}${app.ctx.user.name}`, org: app.ctx.org?.name,
        });
        download(blob, `${safeName(d.title)}.pdf`);
      } catch (err) { toast(`PDF oluşturulamadı: ${err.message}`, 'error', 8000); }
      pdfBtn.disabled = false;
    });
    saveBtn.addEventListener('click', async () => {
      const d = collect();
      if (!d) return;
      try {
        await app.repo.materials.save({ kind: d.kind, title: d.title, params: d.params || {}, content: d.content, patientId: patient.value || null });
        toast('Materyal kaydedildi ("Kayıtlı" sekmesinde).', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
    return h('div.mat-output', null,
      h('div.form-grid', null, field('Başlık', title), field('Danışan (PDF üst bilgisi)', patient)),
      h('div.row.mt-2', { style: { gap: '10px', flexWrap: 'wrap' } }, pdfBtn, saveBtn,
        h('label.check', { style: { marginLeft: '6px' } }, answers, h('span', null, 'Bulmacalarda çözüm anahtarı sayfası ekle'))));
  }

  // -------------------------------------------------------------------------
  // Ortak: sözcük seçici (süzgeç + seçilebilir sonuçlar)
  // -------------------------------------------------------------------------
  function wordPicker({ onChange, defaults = {}, requireImage = false, max = 12 }) {
    const st = { removed: new Set(), words: [], limit: max };
    const target = h('input.input', { placeholder: 'ör. r   ya da   k, g', value: defaults.targets || '', maxlength: 30 });
    const exclude = h('input.input', { placeholder: 'ör. s, ş', value: defaults.exclude || '', maxlength: 30 });
    const posBox = POSITIONS.map((p) => ({ p, cb: h('input', { type: 'checkbox', checked: (defaults.positions || []).includes(p.id) }) }));
    const sylBox = [1, 2, 3, 4, 5].map((n) => ({ n, cb: h('input', { type: 'checkbox', checked: (defaults.syllables || []).includes(n) }) }));
    const catSel = select([{ id: '', label: 'Tüm kategoriler' }, ...CATEGORIES], defaults.category || '');
    const ageSel = select([{ id: '', label: 'Tüm yaşlar' }, ...AGE_BANDS], '');
    const onlyImg = h('input', { type: 'checkbox', checked: requireImage });
    const wide = h('input', { type: 'checkbox' });
    const limit = h('input.input', { type: 'number', min: 1, max: 60, value: max, style: { width: '84px' } });
    const out = h('div');
    const info = h('div.small.muted');

    const run = async () => {
      if (wide.checked && !S.wideReady) { info.textContent = 'Genel sözlük yükleniyor…'; await app.lexicon(); S.wideReady = true; }
      const f = {
        targets: target.value, exclude: exclude.value, positions: posBox.filter((x) => x.cb.checked).map((x) => x.p.id),
        syllables: sylBox.filter((x) => x.cb.checked).map((x) => x.n), categories: catSel.value ? [catSel.value] : [],
        ageBand: ageSel.value || null, onlyWithImage: onlyImg.checked, wide: wide.checked,
      };
      const res = filterWords(bank(wide.checked), f);
      st.limit = Math.max(1, Math.min(60, Number(limit.value) || max));
      st.all = res.words;
      st.filter = f;
      st.target = normalizeTarget(String(target.value).split(/[\s,;]+/)[0] || '');
      draw(res);
    };
    const chosen = () => st.all.filter((w) => !st.removed.has(w.word)).slice(0, st.limit);
    const draw = (res) => {
      st.words = chosen();
      const shown = st.all.slice(0, Math.max(st.limit + st.removed.size, st.limit) + 12);
      info.textContent = `${res.words.length} sözcük bulundu · ${st.words.length} tanesi materyalde${res.words.some((w) => w.source === 'lexicon') ? ' · gri sözcükler genel sözlükten (yaş uygunluğunu kontrol edin)' : ''}`;
      mount(out,
        res.hint ? h('div.callout.warn.mt-2', null, icon('alert', 16), h('div', null, res.words.length ? '' : h('b', null, 'Bu ölçütlere uyan sözcük yok. '), res.hint)) : null,
        h('div.mat-chips.mt-2', null, shown.map((w) => {
          const off = st.removed.has(w.word) || !st.words.includes(w);
          const b = h(`button.mat-chip${off ? '.off' : ''}${w.source === 'lexicon' ? '.wide' : ''}`, { type: 'button', title: st.removed.has(w.word) ? 'Materyale geri ekle' : 'Materyalden çıkar', 'aria-pressed': String(!off) },
            w.mediaId ? icon('eye', 12) : null, hlWord(w.word, st.target), h('span.tiny', null, ` ${w.syllables}h`));
          b.addEventListener('click', () => { if (st.removed.has(w.word)) st.removed.delete(w.word); else st.removed.add(w.word); draw(res); onChange(); });
          return b;
        })),
        res.words.length > shown.length ? h('div.tiny.muted.mt-1', null, `+${res.words.length - shown.length} sözcük daha; sayıyı artırın ya da ölçütleri daraltın.`) : null);
    };
    const trigger = debounce(async () => { st.removed.clear(); await run(); onChange(); }, 180);
    for (const el of [target, exclude, limit]) el.addEventListener('input', trigger);
    for (const el of [catSel, ageSel, onlyImg, wide, ...posBox.map((x) => x.cb), ...sylBox.map((x) => x.cb)]) el.addEventListener('change', trigger);
    const el = h('div', null,
      h('div.form-grid', null,
        field('Hedef ses(ler)', target, 'Harf ya da IPA yazabilirsiniz; birden çok ses virgülle.'),
        field('Hariç tutulan sesler', exclude, 'Danışanın henüz üretemediği sesler.'),
        h('div.field', null, h('label', null, 'Ses pozisyonu'), h('div.mat-checks', null, posBox.map((x) => h('label.check', { title: x.p.label }, x.cb, h('span', null, x.p.short))))),
        h('div.field', null, h('label', null, 'Hece sayısı'), h('div.mat-checks', null, sylBox.map((x) => h('label.check', null, x.cb, h('span', null, x.n === 5 ? '5+' : String(x.n)))))),
        field('Kategori', catSel), field('Yaş bandı', ageSel)),
      h('div.row.mt-2', { style: { gap: '16px', flexWrap: 'wrap', alignItems: 'center' } },
        h('label.check', null, onlyImg, h('span', null, 'Yalnız görseli olanlar')),
        h('label.check', { title: 'Yaklaşık 30 bin kök; yaş uygunluğu bilinmez' }, wide, h('span', null, 'Geniş sözlük')),
        h('label.row', { style: { gap: '8px', alignItems: 'center' } }, h('span.small', null, 'Sözcük sayısı'), limit)),
      h('div.mt-2', null, info), out);
    return { el, run, get words() { return st.words; }, get target() { return st.target; }, get filter() { return st.filter; } };
  }

  // -------------------------------------------------------------------------
  // Önizleme (PDF ile aynı içerik)
  // -------------------------------------------------------------------------
  function preview(d) {
    const c = d.content;
    const card = (it, target, size = 84) => h('div.mat-card', null, img(it.mediaId, size, it.text), h('div.mat-word', null, hlWord(it.text, target)));
    const gridEl = (grid, marks) => h('div.mat-lettergrid', { style: { gridTemplateColumns: `repeat(${grid[0].length}, 1fr)`, maxWidth: `${grid[0].length * 34}px` } },
      grid.flatMap((row, r) => row.map((ch, cc) => h(`span${marks && marks.has(`${r},${cc}`) ? '.on' : ''}`, null, ch))));
    switch (d.kind) {
      case 'cards': return h('div.mat-cards', { style: { gridTemplateColumns: `repeat(${c.columns}, minmax(0, 1fr))` } }, c.items.map((it) => card(it, c.target)));
      case 'list': return h('ol.mat-list', null, c.items.map((it) => h('li', null, hlWord(it.text, c.target))));
      case 'worksheet': return h('div.mat-cards', { style: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } }, c.items.map((it) => h('div.mat-card', null, img(it.mediaId, 84, it.text), h('div.mat-word.mono', null, it.blank))));
      case 'pairs': return h('div.mat-pairs', null, c.pairs.map((p) => h('div.mat-pair', null, card(p.a, c.a, 96), h('span.muted', null, '–'), card(p.b, c.b, 96))));
      case 'phrases': return h('div.mat-cards', { style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } }, c.items.map((it) => h('div.mat-card', null,
        h('div.row', { style: { gap: '6px', justifyContent: 'center' } }, img(it.first.mediaId, 64, it.first.text), img(it.second.mediaId, 64, it.second.text)), h('div.mat-word', null, hlWord(it.text, c.target)))));
      case 'matching': return h('div.mat-match', null,
        h('div', null, c.left.map((it, i) => h('div.mat-match-row', null, `${i + 1}. ${it.text}`, h('span', null, '●')))),
        h('div', null, c.right.map((it) => h('div.mat-match-row', null, h('span', null, '●'), it.mediaId ? img(it.mediaId, 56, it.text) : it.text))));
      case 'wordsearch': return h('div', null, gridEl(c.grid, new Set(c.placements.flatMap((p) => Array.from({ length: p.word.length }, (_, i) => `${p.row + p.dr * i},${p.col + p.dc * i}`)))),
        h('p.small.mt-2', null, h('b', null, 'Aranan sözcükler: '), c.placements.map((p) => p.word).join(' · ')),
        c.skipped?.length ? h('p.tiny.muted', null, `Sığmayan sözcükler: ${c.skipped.join(', ')}`) : null,
        h('p.tiny.muted', null, 'Önizlemede yanıtlar işaretli; PDF\'in ilk sayfasında işaretsizdir.'));
      case 'scramble': return h('div.mat-list', null, c.items.map((it) => h('div.row', { style: { gap: '12px', alignItems: 'center', padding: '6px 0' } }, img(it.mediaId, 48, it.word), h('b.mono', { style: { fontSize: '18px', letterSpacing: '2px' } }, it.scrambled), h('span.tiny.muted', null, `(${it.word})`))));
      case 'crossword': {
        const at = new Map(c.cells.map((x) => [`${x.r},${x.c}`, x]));
        return h('div', null, h('div.mat-cross', { style: { gridTemplateColumns: `repeat(${c.cols}, 30px)` } },
          Array.from({ length: c.rows * c.cols }, (_, i) => {
            const x = at.get(`${Math.floor(i / c.cols)},${i % c.cols}`);
            return x ? h('span.cell', null, x.num ? h('i', null, String(x.num)) : null, x.ch) : h('span');
          })),
        h('p.small.mt-2', null, c.entries.map((e) => `${e.num}${e.dir === 'across' ? '→' : '↓'} ${e.word}`).join(' · ')),
        c.skipped?.length ? h('p.tiny.muted', null, `Yerleşemeyen sözcükler: ${c.skipped.join(', ')}`) : null);
      }
      case 'maze': return h('div.mat-pairs', null, c.items.map((m) => h('div', null, gridEl(m.grid, new Set(m.path.map(([r, cc]) => `${r},${cc}`))), h('div.tiny.muted.mt-1', { style: { textAlign: 'center' } }, m.word))));
      case 'stems': return h('ol.mat-list', null, c.items.map((s) => h('li', null, s.text)));
      case 'wh': return h('div', null, c.items.map((it) => h('div.row', { style: { gap: '14px', padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' } },
        img(it.mediaId, 72, it.text), h('div', null, h('b', null, it.text), h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, it.questions.map((q) => h('li', null, q.text)))))));
      default: return h('p.muted', null, 'Önizleme yok.');
    }
  }

  /** Bir aracın standart yerleşimi: solda ölçütler, sağda önizleme + çıktı. */
  function toolLayout({ controls, defaultTitle, build }) {
    let doc = null;
    const host = h('div.mat-preview');
    const refresh = () => {
      try { doc = build(); } catch (err) { doc = null; mount(host, h('p.small', { style: { color: 'var(--danger)' } }, err.message)); return; }
      if (!doc) { mount(host, emptyState({ icon: 'grid', title: 'Henüz içerik yok', text: 'Ölçütleri seçin; uygun sözcükler bulununca önizleme burada görünür.' })); return; }
      mount(host, preview(doc));
    };
    const bar = outputBar({ getDoc: () => doc, defaultTitle });
    const el = h('div.grid.grid-2.mat-tool', null,
      h('div.card', null, h('div.card-head', null, h('h3', null, icon('filter', 17), 'Ölçütler')), h('div.card-body', null, controls(refresh))),
      h('div.card', null, h('div.card-head', null, h('h3', null, icon('eye', 17), 'Önizleme')), h('div.card-body', null, host, h('div.divider'), bar)));
    return { el, refresh };
  }
  const seedInput = () => h('input.input', { type: 'number', min: 1, max: 9999, value: 1 + Math.floor(Math.random() * 999), style: { width: '100px' }, title: 'Aynı sayı aynı materyali üretir' });
  const reroll = (seed, refresh) => {
    const b = h('button.btn.btn-ghost.btn-sm', { type: 'button' }, icon('refresh', 14), 'Yeniden karıştır');
    b.addEventListener('click', () => { seed.value = String(1 + Math.floor(Math.random() * 9999)); refresh(); });
    return b;
  };

  // -------------------------------------------------------------------------
  // Araçlar
  // -------------------------------------------------------------------------
  const tools = {
    set() {
      const format = select([{ id: 'cards', label: 'Kartlar (görselli)' }, { id: 'list', label: 'Sözcük listesi' }, { id: 'worksheet', label: 'Çalışma sayfası (eksik harf)' }], 'cards');
      const cols = select([{ id: '2', label: '2 sütun (büyük)' }, { id: '3', label: '3 sütun' }, { id: '4', label: '4 sütun' }], '3');
      let picker;
      const t = toolLayout({
        defaultTitle: 'Sözcük kartları',
        controls: (refresh) => {
          picker = wordPicker({ onChange: refresh, defaults: { targets: query.ses || '', positions: query.pozisyon ? [query.pozisyon] : [], syllables: query.hece ? [Number(query.hece)] : [] } });
          format.addEventListener('change', refresh);
          cols.addEventListener('change', refresh);
          return h('div', null, picker.el, h('div.divider'), h('div.form-grid', null, field('Materyal türü', format), field('Kart düzeni', cols)));
        },
        build: () => {
          const ws = picker.words;
          if (!ws.length) return null;
          const target = picker.target;
          if (format.value === 'worksheet') {
            if (!target) throw new Error('Çalışma sayfası için bir hedef ses girin.');
            return { kind: 'worksheet', params: picker.filter, content: { target, items: ws.map((e) => ({ ...item(e), blank: highlightParts(e.word, target).map((p) => (p.hit ? '_'.repeat(p.text.length) : p.text)).join('') })) } };
          }
          return { kind: format.value, params: picker.filter, content: { target, columns: Number(cols.value), items: ws.map(item) } };
        },
      });
      picker.run().then(t.refresh);
      return t.el;
    },

    pairs() {
      const set = select([...PAIR_SETS.map((p) => ({ id: p.id, label: p.label })), { id: 'custom', label: 'Başka bir çift…' }], PAIR_SETS.find((x) => x.a === query.a && x.b === query.b)?.id || (query.a && query.b ? 'custom' : 'k-t'));
      const a = h('input.input', { maxlength: 2, value: (query.a || 'k').slice(0, 2), style: { width: '70px' } });
      const b = h('input.input', { maxlength: 2, value: (query.b || 't').slice(0, 2), style: { width: '70px' } });
      const position = select([{ id: '', label: 'Her konum' }, { id: 'initial', label: 'Sözcük başı' }, { id: 'medial', label: 'Sözcük ortası' }, { id: 'final', label: 'Sözcük sonu' }], '');
      const wide = h('input', { type: 'checkbox' });
      const limit = h('input.input', { type: 'number', min: 1, max: 30, value: 8, style: { width: '84px' } });
      const info = h('div.small.muted.mt-2');
      const t = toolLayout({
        defaultTitle: 'Minimal çiftler',
        controls: (refresh) => {
          set.addEventListener('change', () => { const p = PAIR_SETS.find((x) => x.id === set.value); if (p) { a.value = p.a; b.value = p.b; } refresh(); });
          for (const el of [a, b, limit]) el.addEventListener('input', () => { set.value = PAIR_SETS.find((x) => x.a === a.value && x.b === b.value)?.id || 'custom'; refresh(); });
          position.addEventListener('change', refresh);
          wide.addEventListener('change', async () => { if (wide.checked && !S.wideReady) { await app.lexicon(); S.wideReady = true; } refresh(); });
          return h('div', null,
            field('Karşıtlık', set),
            h('div.row.mt-2', { style: { gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' } }, field('Hedef ses', a), field('Karşıt ses', b), field('Konum', position), field('Çift sayısı', limit)),
            h('label.check.mt-2', null, wide, h('span', null, 'Geniş sözlük (daha çok çift; yaş uygunluğunu kontrol edin)')), info);
        },
        build: () => {
          const all = minimalPairs(bank(wide.checked), a.value, b.value, { position: position.value || null });
          info.textContent = all.length ? `${all.length} çift bulundu.` : 'Bu karşıtlık için bankada çift yok. "Geniş sözlük" seçeneğini açın ya da Sözcük bankasına çift ekleyin (ör. kaş – taş).';
          if (!all.length) return null;
          return { kind: 'pairs', params: { a: a.value, b: b.value, position: position.value }, content: { a: normalizeTarget(a.value), b: normalizeTarget(b.value), pairs: all.slice(0, Number(limit.value) || 8).map((p) => ({ a: item(p.a), b: item(p.b) })) } };
        },
      });
      t.refresh();
      return t.el;
    },

    phrases() {
      const target = h('input.input', { placeholder: 'ör. r', maxlength: 4, value: query.ses || '' });
      const position = select([{ id: '', label: 'Her konum' }, ...POSITIONS.slice(0, 3)], '');
      const mode = select([{ id: 'adj-noun', label: 'Sıfat + ad (kırmızı araba)' }, { id: 'noun-verb', label: 'Ad + eylem (kedi koş)' }, { id: 'any', label: 'Ad + ad' }, { id: 'repeat', label: 'Yineleme (top top)' }], 'adj-noun');
      const both = h('input', { type: 'checkbox' });
      const count = h('input.input', { type: 'number', min: 2, max: 30, value: 10, style: { width: '84px' } });
      const seed = seedInput();
      const t = toolLayout({
        defaultTitle: 'İkili ifadeler',
        controls: (refresh) => {
          for (const el of [target, count, seed]) el.addEventListener('input', refresh);
          for (const el of [position, mode, both]) el.addEventListener('change', refresh);
          return h('div', null,
            h('div.form-grid', null, field('Hedef ses', target), field('Konum', position), field('Öbek türü', mode), field('Öbek sayısı', count)),
            h('label.check.mt-2', null, both, h('span', null, 'İki sözcükte de hedef ses bulunsun')),
            h('div.row.mt-2', { style: { gap: '10px', alignItems: 'center' } }, h('span.small', null, 'Tohum'), seed, reroll(seed, refresh)),
            h('p.tiny.muted.mt-2', null, 'Öbekler otomatik birleştirilir; anlamsız olanları yeniden karıştırarak değiştirin ve kullanmadan önce gözden geçirin.'));
        },
        build: () => {
          const list = twoWordPhrases(bank(), { target: target.value, position: position.value || null, mode: mode.value, both: both.checked, count: Number(count.value) || 10, seed: Number(seed.value) || 1 });
          if (!list.length) return null;
          return { kind: 'phrases', params: { target: target.value, mode: mode.value }, content: { target: normalizeTarget(target.value), items: list.map((p) => ({ text: p.text, first: item(p.first), second: item(p.second) })) } };
        },
      });
      t.refresh();
      return t.el;
    },

    matching() {
      const seed = seedInput();
      let picker;
      const t = toolLayout({
        defaultTitle: 'Sözcük – resim eşleştirme',
        controls: (refresh) => {
          picker = wordPicker({ onChange: refresh, requireImage: true, max: 6 });
          seed.addEventListener('input', refresh);
          return h('div', null, picker.el, h('div.divider'), h('div.row', { style: { gap: '10px', alignItems: 'center' } }, h('span.small', null, 'Tohum'), seed, reroll(seed, refresh)),
            h('p.tiny.muted.mt-2', null, 'Eşleştirme için görseli olan sözcükler gerekir. Görsel yoksa "Görsellerim" sekmesinden yükleyin.'));
        },
        build: () => {
          const ws = picker.words.slice(0, 8);
          if (ws.length < 2) return null;
          const rand = rng(Number(seed.value) || 1);
          return { kind: 'matching', params: picker.filter, content: { left: ws.map(item), right: shuffle(ws.map(item), rand) } };
        },
      });
      picker.run().then(t.refresh);
      return t.el;
    },

    puzzle() {
      const type = select([{ id: 'wordsearch', label: 'Sözcük avı' }, { id: 'scramble', label: 'Karışık harfler' }, { id: 'crossword', label: 'Çengel bulmaca' }, { id: 'maze', label: 'Labirent (harf yolu)' }], 'wordsearch');
      const level = select([{ id: 'easy', label: 'Kolay (yatay, dikey)' }, { id: 'medium', label: 'Orta (+ çapraz)' }, { id: 'hard', label: 'Zor (+ ters yön)' }], 'easy');
      const seed = seedInput();
      let picker;
      const t = toolLayout({
        defaultTitle: 'Bulmaca',
        controls: (refresh) => {
          picker = wordPicker({ onChange: refresh, max: 8 });
          for (const el of [type, level]) el.addEventListener('change', refresh);
          seed.addEventListener('input', refresh);
          return h('div', null, h('div.form-grid', null, field('Bulmaca türü', type), field('Sözcük avı zorluğu', level)),
            h('div.row.mt-2', { style: { gap: '10px', alignItems: 'center' } }, h('span.small', null, 'Tohum'), seed, reroll(seed, refresh)), h('div.divider'), picker.el);
        },
        build: () => {
          const ws = picker.words;
          if (!ws.length) return null;
          const s = Number(seed.value) || 1;
          const media = new Map(ws.map((e) => [e.word.toLocaleUpperCase('tr-TR'), e.mediaId || null]));
          if (type.value === 'wordsearch') {
            const r = wordSearch(ws, { level: level.value, seed: s });
            return { kind: 'wordsearch', params: picker.filter, content: r };
          }
          if (type.value === 'scramble') return { kind: 'scramble', params: picker.filter, content: { items: scramble(ws, { seed: s }).map((x) => ({ ...x, mediaId: ws.find((e) => e.word === x.word)?.mediaId || null })) } };
          if (type.value === 'crossword') {
            if (ws.length < 3) throw new Error('Çengel bulmaca için en az 3 sözcük seçin.');
            const r = crossword(ws, { seed: s, max: 10 });
            return { kind: 'crossword', params: picker.filter, content: { ...r, entries: r.entries.map((e) => ({ ...e, mediaId: media.get(e.word) || null, clue: media.get(e.word) ? '' : `${e.word.length} harf` })) } };
          }
          return { kind: 'maze', params: picker.filter, content: { items: ws.slice(0, 4).map((e, i) => ({ ...letterMaze(e.word, { seed: s + i }), word: e.word, hint: e.category ? CATEGORIES.find((c) => c.id === e.category)?.label : '' })) } };
        },
      });
      picker.run().then(t.refresh);
      return t.el;
    },

    stems() {
      const topicBox = STEM_TOPICS.map((p) => ({ p, cb: h('input', { type: 'checkbox' }) }));
      const tense = select([{ id: 'mixed', label: 'Karışık' }, ...STEM_TENSES], 'mixed');
      const count = h('input.input', { type: 'number', min: 3, max: 30, value: 10, style: { width: '84px' } });
      const short = select([{ id: '', label: 'Sınır yok' }, { id: '3', label: 'En çok 3 sözcük (kısa)' }, { id: '4', label: 'En çok 4 sözcük' }, { id: '5', label: 'En çok 5 sözcük' }], '');
      const seed = seedInput();
      const editor = h('textarea.textarea', { rows: 10, placeholder: 'Her satır bir cümle başlangıcı…' });
      let manual = false;
      const t = toolLayout({
        defaultTitle: 'Cümle tamamlama oyunu',
        controls: (refresh) => {
          const regen = () => { manual = false; refresh(); };
          for (const el of [tense, short, ...topicBox.map((x) => x.cb)]) el.addEventListener('change', regen);
          for (const el of [count, seed]) el.addEventListener('input', regen);
          editor.addEventListener('input', () => { manual = true; refresh(); });
          return h('div', null,
            h('div.field', null, h('label', null, 'Konular'), h('div.mat-checks', null, topicBox.map((x) => h('label.check', null, x.cb, h('span', null, x.p.label))))),
            h('div.form-grid.mt-2', null, field('Zaman', tense), field('Cümle uzunluğu', short, 'Akıcılık çalışmasında kısa başlangıçlarla başlayın.'), field('Cümle sayısı', count)),
            h('div.row.mt-2', { style: { gap: '10px', alignItems: 'center' } }, h('span.small', null, 'Tohum'), seed, reroll(seed, regen)),
            h('div.mt-2', null, field('Liste (düzenleyebilir, satır ekleyip silebilirsiniz)', editor)));
        },
        build: () => {
          if (!manual) {
            const list = sentenceStems({ topics: topicBox.filter((x) => x.cb.checked).map((x) => x.p.id), tense: tense.value, count: Number(count.value) || 10, maxWords: short.value ? Number(short.value) : null, seed: Number(seed.value) || 1 });
            editor.value = list.map((s) => s.text).join('\n');
          }
          const items = editor.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 40).map((text) => ({ text: text.slice(0, 200) }));
          return items.length ? { kind: 'stems', params: { tense: tense.value }, content: { items } } : null;
        },
      });
      t.refresh();
      return t.el;
    },

    wh() {
      const typeBox = WH_TYPES.map((p) => ({ p, cb: h('input', { type: 'checkbox', checked: ['ne', 'nerede', 'nasil'].includes(p.id) }) }));
      const seed = seedInput();
      let picker;
      const t = toolLayout({
        defaultTitle: '5N1K soruları',
        controls: (refresh) => {
          picker = wordPicker({ onChange: refresh, max: 5 });
          for (const x of typeBox) x.cb.addEventListener('change', refresh);
          seed.addEventListener('input', refresh);
          return h('div', null,
            h('div.field', null, h('label', null, 'Soru türleri'), h('div.mat-checks', null, typeBox.map((x) => h('label.check', null, x.cb, h('span', null, x.p.label))))),
            h('div.row.mt-2', { style: { gap: '10px', alignItems: 'center' } }, h('span.small', null, 'Tohum'), seed, reroll(seed, refresh)),
            h('p.tiny.muted.mt-2', null, 'Küçük çocuklarda "kim" ve "ne", daha büyüklerde "neden" ve "nasıl" soruları uygundur. Sorular kalıptan üretilir; seansta danışana göre uyarlayın.'),
            h('div.divider'), picker.el);
        },
        build: () => {
          const ws = picker.words;
          const types = typeBox.filter((x) => x.cb.checked).map((x) => x.p.id);
          if (!ws.length || !types.length) return null;
          const q = whQuestions(ws.map(item), { types, seed: Number(seed.value) || 1 });
          return { kind: 'wh', params: { types }, content: { items: q.map((x) => ({ ...x.item, questions: x.questions })) } };
        },
      });
      picker.run().then(t.refresh);
      return t.el;
    },

    ipa() {
      const input = h('textarea.textarea', { rows: 5, placeholder: 'Türkçe sözcük ya da metin yazın…', maxlength: 4000 }, query.metin || 'Dar kapısından başka aydınlık girecek hiçbir yeri olmayan dükkânında tek başına çalışırdı.');
      const out = h('div.mat-ipa');
      const table = h('div');
      const copy = h('button.btn.btn-ghost.btn-sm', null, icon('copy', 14), 'Kopyala');
      const run = () => {
        const r = toIPA(input.value);
        out.textContent = input.value.trim() ? r.ipa : '';
        mount(table, r.words.length ? h('div.table-wrap.mt-2', null, h('table.table', null,
          h('thead', null, h('tr', null, h('th', null, 'Sözcük'), h('th', null, 'Heceler'), h('th', null, 'IPA'))),
          h('tbody', null, r.words.slice(0, 60).map((w) => h('tr', null, h('td', null, w.word), h('td.mono', null, w.syllables.join(' · ')), h('td.mono', null, `/${w.ipa}/`)))))) : null);
      };
      input.addEventListener('input', run);
      copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(out.textContent); toast('IPA yazımı kopyalandı.', 'success'); } catch { toast('Kopyalanamadı; metni seçip kopyalayın.', 'warning'); } });
      run();
      return h('div.grid.grid-2', null,
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('edit', 17), 'Metin')), h('div.card-body', null, input,
          h('p.tiny.muted.mt-2', null, 'Çeviri ölçünlü (standart) Türkçe sesletime göredir ve kural tabanlıdır. Ağız özellikleri, vurgu ve alıntı sözcüklerdeki özel sesletimler yansıtılmaz; özel adlarda ve yabancı kökenli sözcüklerde sonucu kontrol edin. Nokta hece sınırını, ː uzun ünlüyü gösterir.'))),
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('voice', 17), 'IPA'), copy), h('div.card-body', null, out, table)));
    },

    media() {
      const grid = h('div.mat-media');
      const info = h('div.small.muted');
      const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, style: { display: 'none' } });
      const pick = h('button.btn.btn-primary', { disabled: !canWrite }, icon('upload', 16), 'Görsel yükle');
      pick.addEventListener('click', () => input.click());
      const link = async (label, mediaId) => {
        const word = label.trim().toLocaleLowerCase('tr-TR');
        if (!/^[a-zçğıöşüâîû ]{1,60}$/.test(word)) return false;
        const prev = customOf(word);
        const seed = SEED_WORDS.find((s) => s.word === word);
        await app.repo.words.save({ word, category: prev?.category ?? seed?.category ?? null, ageBand: prev?.ageBand ?? null, hidden: false, mediaId });
        return true;
      };
      const draw = async () => {
        await reload();
        const linked = new Map(S.customLive.filter((c) => c.mediaId).map((c) => [c.mediaId, c.word]));
        const withImg = buildBank({ custom: S.customLive }).filter((w) => w.mediaId).length;
        info.textContent = `${S.media.length} görsel · ${fmtBytes(S.media.reduce((s, m) => s + (m.sizeBytes || 0), 0))} · bankadaki ${withImg} sözcüğün görseli var`;
        mount(grid, S.media.length ? S.media.map((m) => {
          const label = h('input.input', { value: linked.get(m.id) || m.label || '', maxlength: 60, placeholder: 'sözcük', disabled: !canWrite, 'aria-label': 'Görselin sözcüğü' });
          label.addEventListener('change', async () => {
            try {
              await app.repo.media.update(m.id, { label: label.value });
              const ok = await link(label.value, m.id);
              toast(ok ? `"${label.value.trim()}" sözcüğüne bağlandı.` : 'Etiket kaydedildi (sözcük yalnız harflerden oluşmalı).', ok ? 'success' : 'warning');
              await reload();
            } catch (err) { toast(err.message, 'error'); }
          });
          const del = h('button.btn.btn-ghost.btn-icon.btn-sm', { title: 'Görseli sil', 'aria-label': 'Görseli sil', disabled: !canWrite }, icon('trash', 14));
          del.addEventListener('click', async () => {
            if (!(await confirmDialog({ title: 'Görsel silinsin mi?', message: 'Görsel kalıcı olarak silinir; bağlı olduğu sözcük görselsiz kalır.', confirmText: 'Sil', danger: true }))) return;
            try { await app.repo.media.remove(m.id); S.thumbs.delete(m.id); draw(); } catch (err) { toast(err.message, 'error'); }
          });
          return h('div.mat-media-item', null, img(m.id, 110, m.label), h('div.row', { style: { gap: '6px', flexWrap: 'nowrap' } }, label, del));
        }) : emptyState({ icon: 'folder', title: 'Henüz görsel yok', text: 'Kendi çektiğiniz ya da kullanım hakkına sahip olduğunuz görselleri yükleyin. Dosya adı sözcükle aynıysa (ör. top.jpg) görsel o sözcüğe kendiliğinden bağlanır.' }));
      };
      input.addEventListener('change', async () => {
        const files = [...input.files];
        input.value = '';
        let ok = 0; let linkedN = 0;
        pick.disabled = true;
        for (const f of files) {
          try {
            const j = await toJpeg(f);
            const label = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().toLocaleLowerCase('tr-TR').slice(0, 60);
            const m = await app.repo.media.put(j.blob, { label, width: j.width, height: j.height });
            ok++;
            if (await link(label, m.id)) linkedN++;
          } catch (err) { toast(`${f.name}: ${err.message}`, 'error', 7000); }
        }
        pick.disabled = false;
        if (ok) toast(`${ok} görsel yüklendi; ${linkedN} tanesi dosya adına göre sözcüğe bağlandı.`, 'success', 6000);
        draw();
      });
      draw();
      return h('div.card', null,
        h('div.card-head', null, h('h3', null, icon('folder', 17), 'Görsellerim'), pick, input),
        h('div.card-body', null, info,
          h('p.tiny.muted', null, 'Görseller yalnızca ekibinize özeldir. Yüklenirken küçültülür (en uzun kenar 1024 piksel) ve JPEG olarak saklanır. Altındaki kutuya sözcüğü yazarak görseli o sözcüğe bağlarsınız; üreticiler bu bağlantıyı kullanır. Danışan fotoğrafı yüklemeyin.'),
          h('div.mt-2', null, grid)));
    },

    bank() {
      const word = h('input.input', { placeholder: 'yeni sözcük', maxlength: 60 });
      const cat = select([{ id: '', label: 'Kategori yok' }, ...CATEGORIES], '');
      const age = select([{ id: '', label: 'Yaş bandı yok' }, ...AGE_BANDS], '');
      const addBtn = h('button.btn.btn-primary', { disabled: !canWrite }, icon('plus', 16), 'Ekle');
      const list = h('div');
      const search = h('input.input', { type: 'search', placeholder: 'Bankada ara…' });
      const draw = async () => {
        await reload();
        const all = buildBank({ custom: S.customLive });
        const q = search.value.trim().toLocaleLowerCase('tr-TR');
        const hidden = S.custom.filter((c) => c.hidden);
        const rows = all.filter((w) => !q || w.word.includes(q)).sort((a, b) => a.word.localeCompare(b.word, 'tr')).slice(0, 80);
        mount(list,
          h('p.small.muted', null, `Bankada ${all.length} sözcük: ${SEED_WORDS.length} çekirdek, ${all.filter((w) => w.source === 'custom').length} ekip sözcüğü${hidden.length ? `, ${hidden.length} gizli` : ''}.`),
          h('div.table-wrap', null, h('table.table', null,
            h('thead', null, h('tr', null, h('th', null, 'Sözcük'), h('th', null, 'Hece'), h('th', null, 'Kategori'), h('th', null, 'Yaş'), h('th', null, 'Görsel'), h('th', null, ''))),
            h('tbody', null, rows.map((w) => {
              const c = customOf(w.word);
              const cs = select([{ id: '', label: '—' }, ...CATEGORIES], w.category || '', { disabled: !canWrite });
              const as = select([{ id: '', label: '—' }, ...AGE_BANDS], w.ageBand || '', { disabled: !canWrite });
              const save = async (patch) => { try { await app.repo.words.save({ word: w.word, category: cs.value || null, ageBand: as.value || null, mediaId: c?.mediaId || null, hidden: false, ...patch }); draw(); } catch (err) { toast(err.message, 'error'); } };
              cs.addEventListener('change', () => save({}));
              as.addEventListener('change', () => save({}));
              const rm = h('button.btn.btn-ghost.btn-icon.btn-sm', { disabled: !canWrite, title: w.source === 'custom' ? 'Sözcüğü sil' : 'Çekirdek sözcüğü gizle', 'aria-label': 'Kaldır' }, icon(w.source === 'custom' ? 'trash' : 'x', 14));
              rm.addEventListener('click', async () => {
                try { if (w.source === 'custom' && c) await app.repo.words.remove(c.id); else await save({ hidden: true }); draw(); } catch (err) { toast(err.message, 'error'); }
              });
              return h('tr', null, h('td', null, h('b', null, w.word), w.source === 'custom' ? badge('ekip', 'info') : null), h('td.mono.small', null, w.syl.join('·')), h('td', null, cs), h('td', null, as), h('td', null, w.mediaId ? img(w.mediaId, 34, w.word) : h('span.faint', null, '—')), h('td', null, rm));
            })))),
          all.length > rows.length && !q ? h('p.tiny.muted', null, 'İlk 80 sözcük gösteriliyor; aramayla daraltın.') : null,
          hidden.length ? h('p.small.mt-2', null, h('b', null, 'Gizlenen sözcükler: '), hidden.map((c) => {
            const b = h('button.mat-chip', { type: 'button', title: 'Geri getir' }, c.word, ' ↺');
            b.addEventListener('click', async () => { try { await app.repo.words.remove(c.id); draw(); } catch (err) { toast(err.message, 'error'); } });
            return b;
          })) : null);
      };
      addBtn.addEventListener('click', async () => {
        const w = word.value.trim().toLocaleLowerCase('tr-TR');
        if (!/^[a-zçğıöşüâîû]{2,40}$/.test(w)) { toast('Sözcük yalnız harflerden oluşmalı (2–40 harf, boşluksuz).', 'warning'); return; }
        try { await app.repo.words.save({ word: w, category: cat.value || null, ageBand: age.value || null, mediaId: customOf(w)?.mediaId || null, hidden: false }); word.value = ''; toast(`"${w}" bankaya eklendi.`, 'success'); draw(); } catch (err) { toast(err.message, 'error'); }
      });
      search.addEventListener('input', debounce(draw, 200));
      draw();
      return h('div.card', null, h('div.card-head', null, h('h3', null, icon('book', 17), 'Sözcük bankası')),
        h('div.card-body', null,
          h('p.small.muted', { style: { marginTop: 0 } }, 'Çekirdek liste, çocukların gündelik dağarcığından somut sözcüklerdir. Danışanlarınıza uygun olmayanları gizleyebilir, kendi sözcüklerinizi ekleyebilir, kategori ve yaş bandını değiştirebilirsiniz. Yaş bandı öneridir; uygunluğa siz karar verirsiniz.'),
          h('div.row', { style: { gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' } }, field('Sözcük', word), field('Kategori', cat), field('Yaş bandı', age), addBtn),
          h('div.mt-3', null, search), h('div.mt-2', null, list)));
    },

    saved() {
      const host = h('div');
      const draw = async () => {
        const list = await app.repo.materials.list();
        if (!list.length) { mount(host, emptyState({ icon: 'save', title: 'Kayıtlı materyal yok', text: 'Bir materyal oluşturup "Kaydet"e bastığınızda burada listelenir; daha sonra yeniden açıp PDF alabilirsiniz.' })); return; }
        const view = h('div');
        mount(host, h('div.table-wrap', null, h('table.table', null,
          h('thead', null, h('tr', null, h('th', null, 'Başlık'), h('th', null, 'Tür'), h('th', null, 'Danışan'), h('th', null, 'Tarih'), h('th', null, ''))),
          h('tbody', null, list.map((m) => {
            const open = h('button.btn.btn-ghost.btn-sm', null, icon('eye', 14), 'Aç');
            open.addEventListener('click', () => {
              const d = { kind: m.kind, content: m.content, params: m.params };
              mount(view, h('div.card.mt-3', null, h('div.card-head', null, h('h3', null, m.title)), h('div.card-body', null, h('div.mat-preview', null, preview(d)), h('div.divider'), outputBar({ getDoc: () => d, defaultTitle: m.title }))));
              view.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            const del = h('button.btn.btn-ghost.btn-icon.btn-sm', { title: 'Sil', 'aria-label': 'Sil', disabled: !app.can('session.write') }, icon('trash', 14));
            del.addEventListener('click', async () => {
              if (!(await confirmDialog({ title: 'Materyal silinsin mi?', message: `"${m.title}" kalıcı olarak silinir.`, confirmText: 'Sil', danger: true }))) return;
              try { await app.repo.materials.remove(m.id); draw(); } catch (err) { toast(err.message, 'error'); }
            });
            return h('tr', null, h('td', null, h('b', null, m.title || '—')), h('td', null, KIND_LABEL[m.kind] || m.kind), h('td', null, S.patients.find((p) => p.id === m.patientId)?.code || '—'), h('td', null, fmtDate(m.createdAt)), h('td', null, h('span.row', { style: { gap: '4px', flexWrap: 'nowrap' } }, open, del)));
          })))), view);
      };
      draw();
      return h('div.card', null, h('div.card-head', null, h('h3', null, icon('save', 17), 'Kayıtlı materyaller')), h('div.card-body', null, host));
    },
  };

  // -------------------------------------------------------------------------
  // Sayfa
  // -------------------------------------------------------------------------
  const body = h('div');
  const bar = h('div.tabs', { role: 'tablist' });
  const hint = h('p.small.muted', { style: { margin: '0 0 14px' } });
  let active = TOOLS.some((t) => t.id === query.arac) ? query.arac : 'set';
  const show = (id) => {
    active = id;
    for (const b of bar.children) b.classList.toggle('on', b.dataset.id === id);
    hint.textContent = TOOLS.find((t) => t.id === id).hint;
    mount(body, tools[id]());
  };
  for (const t of TOOLS) {
    const b = h('button', { type: 'button', role: 'tab', dataset: { id: t.id } }, icon(t.icon, 15), t.label);
    b.addEventListener('click', () => show(t.id));
    bar.appendChild(b);
  }
  mount(root,
    h('div.page-head', null, h('div', null,
      h('div.eyebrow', null, icon('grid', 14), 'Terapi materyali'),
      h('h1', null, 'Materyal Atölyesi'),
      h('p', null, 'Hedef sese, pozisyona ve hece sayısına göre sözcük seçin; kart, çalışma sayfası, minimal çift ve bulmaca üretip PDF olarak indirin. Görseller sizin yüklediklerinizdir. Üretilen her materyali danışana vermeden önce gözden geçirin.'))),
    bar, hint, body);
  show(active);
  return () => cleanups.forEach((fn) => { try { fn(); } catch { /* yok say */ } });
}
