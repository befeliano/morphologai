/** Seans ayrıntısı: oynatıcı, özet, transkript düzenleme, biçimbirim, akustik laboratuvar, rapor. */
import { h, mount, icon, num, fmtDateTime, fmtDur, fmtBytes, badge, toast, confirmDialog, emptyState, download, safeName, select, field, modal, debounce, clock } from '../ui/dom.js';
import { moduleOf, taskOf, labelOf, SOURCES, TENSE_TR, CASE_TR, MODULES } from '../constants.js';
import { analyzeSession, summarize, ENGINE_ID } from '../../core/analysis.js';
import { POS_LABEL } from '../../core/text/lexicon.js';
import { setOverrides } from '../../core/text/morphology.js';
import { createPlayer } from '../components/player.js';
import { createLab, voiceReportCard, ddkCard } from '../components/lab.js';
import { chips, posTag, openCorrection, ambiguityBadge, POS_OPTIONS } from '../components/morphView.js';
import { screeningCard, languageMetricGrid, exclusionSummary, stutteringCard, speechProfileCard } from '../components/summaryViews.js';
import { computeFluency } from '../../core/metrics/fluency.js';
import { transcriptToolbar, transcriptHelp } from '../components/transcriptTools.js';
import { barChart, chartImage } from '../ui/charts.js';
import { sessionsCsv, wordsCsv } from '../../export/csv.js';
import { toChat } from '../../export/chat.js';
import { toTextGrid } from '../../export/textgrid.js';
import { buildSessionPdf } from '../../export/pdf.js';
import { extFor } from '../../data/mime.js';
import { openSessionEditor } from '../components/sessionEdit.js';
import { analyzeAudio, splitAcoustic } from '../pipeline.js';
import { transcribeAudioBuffer, segmentsToTranscript, sttCapabilities } from '../../core/stt/webspeech.js';
import { whisperTranscribe, WHISPER_MODELS, hasWebGPU, defaultWhisperModel } from '../../core/stt/whisper.js';
import { decodeToMono16k } from '../../core/audio/decode.js';

export async function render(root, { params, query }, app) {
  let session = await app.repo.sessions.get(params.id);
  if (!session) { mount(root, emptyState({ icon: 'folder', title: 'Seans bulunamadı', text: 'Silinmiş olabilir ya da başka bir ekibe ait.' })); return; }
  const patient = await app.repo.patients.get(session.patientId);
  const mod = moduleOf(session.module);
  const task = taskOf(session.taskType);
  const audioRec = session.audioId ? await app.repo.audio.get(session.audioId) : null;
  let heavy = await app.repo.acoustic.get(session.id);
  await app.lexicon();
  const norms = await app.norms(session.taskType);
  const canWrite = app.can('session.write');

  app.setCrumbs([{ label: 'Geçmiş seanslar', href: '#/seanslar' }, { label: patient ? patient.code : 'Danışan', href: patient ? `#/danisan/${patient.id}` : null }, { label: fmtDateTime(session.recordedAt) }]);

  // ---- Durum ----
  let text = session.transcript?.text || '';
  let corrections = { ...(session.corrections || {}) };
  let dirty = false;
  let current = null;
  const acousticFull = () => (session.acoustic ? { ...session.acoustic, ...(heavy || {}) } : null);
  const recompute = () => {
    current = text.trim() ? analyzeSession({ transcript: text, acoustic: session.acoustic, settings: app.settings, corrections, norms, final: true }) : null;
    return current;
  };
  recompute();

  const cleanups = [];
  let player = null;
  if (audioRec) {
    player = createPlayer({
      blob: audioRec.blob,
      peaks: heavy?.peaks || null,
      duration: audioRec.durationSec || session.acoustic?.durationSec,
      pauses: session.acoustic?.pauses || [],
      markers: session.markers || [],
      utterances: current?.utterances || [],
    });
    cleanups.push(() => player.destroy());
  }

  // ---- Başlık ve eylemler ----
  const saveBtn = h('button.btn.btn-primary.btn-sm', { disabled: true }, icon('save', 15), 'Kaydet');
  const setDirty = (d) => { dirty = d; saveBtn.disabled = !d || !canWrite; saveBtn.lastChild.textContent = d ? 'Değişiklikleri kaydet' : 'Kaydedildi'; };
  setDirty(false);
  saveBtn.lastChild.textContent = 'Kaydet';
  const save = async (extra = {}) => {
    if (!canWrite) return;
    const analysis = current ? summarize(current) : null;
    session = await app.repo.sessions.save({
      ...session,
      ...extra,
      transcript: { ...(session.transcript || {}), text, editedAt: new Date().toISOString(), editedBy: app.ctx.user.id },
      corrections,
      analysis,
      fluency: analysis?.fluency || (session.acoustic ? computeFluency(session.acoustic, null, app.settings) : null),
    });
    setDirty(false);
    toast('Seans kaydedildi.', 'success');
    drawHeader();
  };
  saveBtn.addEventListener('click', () => save());
  app.setGuard(() => (dirty ? 'Kaydedilmemiş değişiklikler var.' : null));
  cleanups.push(() => app.setGuard(null));

  const statusBtn = h('button.btn.btn-ghost.btn-sm');
  const drawStatus = () => mount(statusBtn, icon(session.status === 'verified' ? 'checkCircle' : 'edit', 15), session.status === 'verified' ? 'Doğrulandı' : 'Doğrulandı olarak işaretle');
  drawStatus();
  statusBtn.addEventListener('click', async () => {
    if (!canWrite) return;
    await save({ status: session.status === 'verified' ? 'draft' : 'verified', verifiedAt: session.status === 'verified' ? null : new Date().toISOString(), verifiedBy: app.ctx.user.id });
    drawStatus();
  });
  const pdfBtn = h('button.btn.btn-ghost.btn-sm', null, icon('file', 15), 'PDF rapor');
  pdfBtn.addEventListener('click', () => exportPdf());
  const editBtn = h('button.btn.btn-ghost.btn-sm', { title: 'Tarih, danışan, modül ve görev bilgilerini düzenle', disabled: !canWrite }, icon('calendar', 15), 'Bilgiler');
  editBtn.addEventListener('click', async () => {
    if (dirty && !(await confirmDialog({ title: 'Kaydedilmemiş değişiklikler var', message: 'Transkriptteki kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?', confirmText: 'Devam et' }))) return;
    const fresh = await app.repo.sessions.get(session.id);
    const saved = fresh && (await openSessionEditor(app, fresh));
    if (saved) { dirty = false; app.setGuard(null); app.navigate(`/seans/${session.id}?tab=${tab}`, { replace: true }); }
  });
  app.setActions([editBtn, statusBtn, pdfBtn, saveBtn]);

  const head = h('div');
  const drawHeader = () => {
    const dur = session.acoustic?.durationSec ?? audioRec?.durationSec ?? current?.language?.timing?.spanSec;
    mount(head, h('div.page-head', null, h('div', null,
      h('div.eyebrow', null, icon(mod.icon, 14), `${mod.label} · ${task.label}`),
      h('h1', null, patient ? patient.code : '—', h('span', { style: { fontWeight: 500, color: 'var(--muted)', fontSize: '19px', marginLeft: '10px' } }, fmtDateTime(session.recordedAt))),
      h('div.row.mt-1', null,
        session.status === 'verified' ? badge('Transkript doğrulandı', 'ok', true) : badge('Taslak', 'warn', true),
        badge(labelOf(SOURCES, session.source) || session.source),
        dur ? badge(fmtDur(dur)) : null,
        session.taskDetail ? badge(session.taskDetail, 'outline') : null,
        session.transcript?.engine && session.transcript.engine !== 'none' ? badge(`Transkript: ${engineLabel(session.transcript.engine)}`, 'outline') : null,
        session.demo ? badge('örnek veri', 'outline') : null,
        patient?.fullName ? h('span.small.muted', null, patient.fullName) : null))));
  };
  drawHeader();

  // Motor sürümü uyarısı
  const versionNote = session.analysis?.engine && session.analysis.engine !== ENGINE_ID && canWrite
    ? h('div.callout.info', { style: { marginBottom: '14px' } }, icon('refresh', 18), h('div', { style: { flex: 1 } },
      h('b', null, 'Çözümleme motoru güncellendi. '), `Bu seans ${session.analysis.engine} ile kaydedilmişti; ekranda ${ENGINE_ID} sonuçları gösteriliyor. Kaydederseniz sonuçlar güncellenir.`),
      h('button.btn.btn-soft.btn-sm', { on: { click: () => save() } }, 'Güncelle ve kaydet'))
    : null;

  // ---- Ses kartı ----
  let audioCard = null;
  if (audioRec) {
    const q = session.acoustic?.quality;
    audioCard = h('div.card', { style: { marginBottom: '18px' } },
      h('div.card-head', null, h('h2', null, icon('headphones', 18), 'Ses kaydı'),
        h('div.row', null,
          q ? badge(`Kalite: ${q.level} · SNR ${num(q.snrDb, 0)} dB`, q.level === 'iyi' ? 'ok' : q.level === 'orta' ? 'warn' : 'danger') : null,
          h('span.small.muted', null, [audioRec.format || audioRec.mimeType, audioRec.sampleRate ? `${num(audioRec.sampleRate / 1000, 1)} kHz` : null, audioRec.bitsPerSample ? `${audioRec.bitsPerSample}-bit` : null, fmtBytes(audioRec.sizeBytes)].filter(Boolean).join(' · ')),
          h('button.btn.btn-ghost.btn-sm', { on: { click: () => download(audioRec.blob, `${baseName()}.${extFor(audioRec.mimeType)}`) } }, icon('download', 14), 'İndir'))),
      h('div.card-body', null, player.el,
        q && q.notes.length ? h('div.small.muted.mt-1', null, q.notes.join(' ')) : null,
        !session.acoustic && canWrite ? h('div.callout.warn.mt-2', null, icon('alert', 18), h('div', { style: { flex: 1 } }, 'Bu kayıt için akustik ölçüm yok (eski sürüm).'), h('button.btn.btn-soft.btn-sm', { on: { click: () => reanalyzeAudio() } }, 'Sesi çözümle')) : null));
  }

  // ---- Sekmeler ----
  const TABS = [
    { id: 'summary', label: 'Özet', icon: 'gauge' },
    mod.transcript || text ? { id: 'transcript', label: 'Transkript', icon: 'fileText' } : null,
    session.module === 'fluency' ? { id: 'stutter', label: 'Takılmalar', icon: 'waves' } : null,
    mod.transcript || text ? { id: 'morph', label: 'Biçimbirim', icon: 'layers' } : null,
    audioRec ? { id: 'lab', label: 'Akustik laboratuvar', icon: 'spectrum' } : null,
    { id: 'report', label: 'Rapor ve notlar', icon: 'note' },
  ].filter(Boolean);
  let tab = TABS.some((t) => t.id === query.tab) ? query.tab : 'summary';
  const tabBar = h('div.tabs', { role: 'tablist' });
  const panel = h('div');
  let lab = null;
  const drawTabs = () => mount(tabBar, ...TABS.map((t) => h(`button${t.id === tab ? '.on' : ''}`, { role: 'tab', on: { click: () => { tab = t.id; history.replaceState(null, '', `#/seans/${session.id}?tab=${t.id}`); drawTabs(); drawPanel(); } } }, icon(t.icon, 15), t.label)));

  const drawPanel = () => {
    if (lab && tab !== 'lab') { /* laboratuvar ayrı tutulur */ }
    if (tab === 'summary') mount(panel, summaryPanel());
    else if (tab === 'transcript') mount(panel, transcriptPanel());
    else if (tab === 'stutter') mount(panel, stutteringCard(current?.stuttering, current?.fluency));
    else if (tab === 'morph') mount(panel, morphPanel());
    else if (tab === 'lab') {
      if (!lab) {
        lab = createLab({ blob: audioRec.blob, session, acoustic: acousticFull(), analysis: current, markers: session.markers || [], patientCode: patient?.code });
        cleanups.push(() => lab.destroy());
      }
      mount(panel, lab.el);
    } else if (tab === 'report') mount(panel, reportPanel());
  };

  // ---- Özet ----
  const acousticFluency = () => session.fluency || (session.acoustic ? computeFluency(session.acoustic, null, app.settings) : null);
  const summaryPanel = () => {
    if (session.module === 'voice') return voiceSummary();
    if (session.module === 'motor') return motorSummary();
    if (!current) {
      return h('div.stack', null,
        speechProfileCard(session.acoustic, acousticFluency()),
        h('div.card', null, h('div.card-body', null, emptyState({
          icon: 'fileText', title: 'Transkript yok',
          text: 'Dil ölçütleri (MLU, sözcük/dakika, parafazi…) için transkript gerekir. Transkript sekmesinden yazabilir ya da sesi otomatik yazıya dökebilirsiniz.',
          action: h('button.btn.btn-primary', { on: { click: () => { tab = 'transcript'; drawTabs(); drawPanel(); } } }, icon('edit', 16), 'Transkripte git'),
        }))));
    }
    const L = current.language;
    const F = current.fluency;
    const posCanvas = h('canvas', { id: 'chart-pos', role: 'img', 'aria-label': 'Sözcük türü dağılımı' });
    const tenseCanvas = h('canvas', { id: 'chart-tense', role: 'img', 'aria-label': 'Zaman eki dağılımı' });
    const caseCanvas = h('canvas', { role: 'img', 'aria-label': 'Hâl eki dağılımı' });
    const posItems = Object.entries(L.pos).map(([k, v]) => ({ label: POS_LABEL[k] || k, value: v })).sort((a, b) => b.value - a.value);
    const tenseItems = Object.entries(L.verbs.tense).map(([k, v]) => ({ label: TENSE_TR[k] || k, value: v })).sort((a, b) => b.value - a.value);
    const caseItems = Object.entries(L.nouns.cases).map(([k, v]) => ({ label: CASE_TR[k] || k, value: v })).sort((a, b) => b.value - a.value);
    setTimeout(() => {
      if (posItems.length) barChart(posCanvas, posItems, { valueLabel: 'Sözcük' });
      if (tenseItems.length) barChart(tenseCanvas, tenseItems, { valueLabel: 'Fiil' });
      if (caseItems.length) barChart(caseCanvas, caseItems, { valueLabel: 'Ad' });
    }, 0);
    const chartCard = (title, sub, canvas, has, n) => h('div.card', null, h('div.card-head', null, h('h3', null, icon('chart', 17), title), h('span.sub', null, sub)),
      h('div.card-body', null, has ? h('div.chart-box', { style: { height: `${Math.max(150, Math.min(320, 40 + n * 30))}px` } }, canvas) : h('p.small.muted', null, 'Veri yok.')));
    const pauseCanvas = h('canvas', { role: 'img', 'aria-label': 'Duraksama süresi dağılımı' });
    if (F) setTimeout(() => barChart(pauseCanvas, [
      { label: '0,25–1 sn', value: F.pauseBins.short }, { label: '1–2 sn', value: F.pauseBins.medium },
      { label: '2–3 sn', value: F.pauseBins.long }, { label: '≥ 3 sn', value: F.pauseBins.veryLong }], { horizontal: false, valueLabel: 'Duraksama' }), 0);
    const f0 = session.acoustic?.f0;
    return h('div.stack', null,
      session.module === 'fluency' ? stutteringCard(current.stuttering, F) : screeningCard(current.screening, { acousticMissing: !F }),
      h('div.card', null,
        h('div.card-head', null, h('h2', null, icon('activity', 18), 'Klinik ölçütler'), h('span.sub', null, 'Ölçüt adının yanındaki (i) tanımı gösterir')),
        h('div.card-body', null, languageMetricGrid(L, F), h('div.mt-2', null, exclusionSummary(L)))),
      h('div.grid.grid-auto', null,
        chartCard('Sözcük türleri', `${L.words.produced} sözcük`, posCanvas, posItems.length, posItems.length),
        chartCard('Zaman / kip ekleri', `${L.verbs.finite} çekimli fiil`, tenseCanvas, tenseItems.length, tenseItems.length),
        chartCard('Hâl ekleri', `${L.nouns.total} ad`, caseCanvas, caseItems.length, caseItems.length)),
      F ? h('div.grid.grid-auto', null,
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('clock', 17), 'Duraksama süreleri'), h('span.sub', null, `${F.pauseCount} duraksama`)), h('div.card-body', null, h('div.chart-box.sm', null, pauseCanvas))),
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('voice', 17), 'Ses ve prozodi')), h('div.card-body', null,
          f0 ? h('div.metric-grid', null,
            h('div.metric', null, h('div.m-label', null, 'F0 ortalama'), h('div.m-value', null, `${num(f0.mean, 0)}`, h('small', null, 'Hz'))),
            h('div.metric', null, h('div.m-label', null, 'F0 SS'), h('div.m-value', null, `${num(f0.sd, 1)}`, h('small', null, 'Hz'))),
            h('div.metric', null, h('div.m-label', null, 'F0 aralığı'), h('div.m-value', null, `${num(f0.rangeSt, 1)}`, h('small', null, 'yarım ton'))),
            h('div.metric', null, h('div.m-label', null, 'Şiddet ort.'), h('div.m-value', null, `${num(session.acoustic.intensity?.meanDb, 0)}`, h('small', null, 'dBFS'))))
            : h('p.small.muted', null, 'Perde ölçülemedi.'),
          h('p.tiny.muted.mt-2', null, 'Ayrıntılı spektrogram, perde ve formant incelemesi için Akustik laboratuvar sekmesini kullanın.')))) : null,
      L.errors.unknownList.length || L.errors.phonologicalCandidates.length ? h('div.card', null,
        h('div.card-head', null, h('h3', null, icon('alert', 17), 'Sözlük dışı sözcükler'), h('span.sub', null, 'olası neolojizm, fonolojik parafazi, özel ad ya da transkripsiyon hatası')),
        h('div.card-body', null, h('div.row', { style: { gap: '6px' } }, L.errors.unknownList.map((w) => {
          const cand = L.errors.phonologicalCandidates.find((c) => c.word === w);
          return badge(cand ? `${w} → ${cand.target}?` : w, cand ? 'warn' : 'danger');
        })), h('p.tiny.muted.mt-2', null, 'Parafazi olduğunu düşündüklerinizi transkriptte [* p] / [* n] ile kodlayın; hedef sözcüğü [: hedef] ile ekleyin.'))) : null);
  };

  const voiceSummary = () => {
    const v = session.voice;
    const redo = canWrite && audioRec ? h('button.btn.btn-soft.btn-sm', { on: { click: () => reanalyzeAudio() } }, icon('refresh', 14), 'Yeniden ölç') : null;
    const blocks = [];
    if (session.taskType === 'sz') {
      const sz = session.sz;
      blocks.push(h('div.card', null, h('div.card-head', null, h('h2', null, icon('voice', 18), 's/z oranı'), redo),
        h('div.card-body', null, sz && sz.ratio ? h('div.metric-grid', null,
          h('div.metric.hero', null, h('div.m-label', null, 's/z oranı'), h('div.m-value', null, num(sz.ratio, 2)), h('div.m-note', null, sz.ratio > 1.4 ? '> 1,4 — larinks patolojisi açısından anlamlı olabilir' : '≤ 1,4 — beklenen aralıkta')),
          h('div.metric', null, h('div.m-label', null, '/s/ süresi'), h('div.m-value', null, `${num(sz.s, 2)} sn`)),
          h('div.metric', null, h('div.m-label', null, '/z/ süresi'), h('div.m-value', null, `${num(sz.z, 2)} sn`)))
          : h('div.callout.warn', null, icon('alert', 18), h('div', null, sz?.error || 'Ölçülemedi.')),
        h('p.tiny.muted.mt-2', null, 's/z oranı (Eckel & Boone, 1981): sessiz /s/ ve sesli /z/ uzatma sürelerinin oranı. En uzun iki ses bölümü sırasıyla /s/ ve /z/ kabul edilir; Akustik laboratuvarda doğrulayın.'))));
    } else {
      blocks.push(h('div.card', null, h('div.card-head', null, h('h2', null, icon('voice', 18), 'Maksimum fonasyon süresi'), redo),
        h('div.card-body', null, h('div.metric-grid', null,
          h('div.metric.hero', null, h('div.m-label', null, 'MPT (en uzun ses bölümü)'), h('div.m-value', null, session.mpt ? `${num(session.mpt, 2)} sn` : '—'), h('div.m-note', null, 'Yetişkinde genellikle > 15 sn; < 10 sn dikkat')),
          session.voice?.ok ? h('div.metric', null, h('div.m-label', null, 'Sesli (perdeli) en uzun süre'), h('div.m-value', null, `${num(session.voice.mptSec, 2)} sn`)) : null))));
      blocks.push(voiceReportCard(v, 'En uzun sesli bölüm (baş ve sondan kırpılarak)'));
    }
    const f0 = session.acoustic?.f0;
    if (f0) blocks.push(h('div.card', null, h('div.card-head', null, h('h3', null, icon('activity', 17), 'Genel perde istatistiği')), h('div.card-body', null, h('div.metric-grid', null,
      [['F0 ortalama', `${num(f0.mean, 1)} Hz`], ['F0 SS', `${num(f0.sd, 1)} Hz`], ['F0 5.–95. yüzdelik', `${num(f0.p5, 0)}–${num(f0.p95, 0)} Hz`], ['Aralık', `${num(f0.rangeSt, 1)} yarım ton`]]
        .map(([k, val]) => h('div.metric', null, h('div.m-label', null, k), h('div.m-value', { style: { fontSize: '17px' } }, val)))))));
    blocks.push(speechProfileCard(session.acoustic, acousticFluency(), { title: 'Tüm kaydın akıcılık ve ses profili' }));
    blocks.push(h('div.callout.info', null, icon('info', 18), h('div', null, 'Seçtiğiniz herhangi bir aralık için ses raporunu ', h('b', null, 'Akustik laboratuvar'), ' sekmesinden alabilirsiniz (Praat\'taki gibi: aralığı seçip "Ses raporu").')));
    return h('div.stack', null, blocks);
  };

  const motorSummary = () => {
    const redo = canWrite && audioRec ? h('button.btn.btn-soft.btn-sm', { on: { click: () => reanalyzeAudio() } }, icon('refresh', 14), 'Yeniden ölç') : null;
    return h('div.stack', null,
      h('div.row', { style: { justifyContent: 'flex-end' } }, redo),
      ddkCard(session.ddk, `${task.label} · tüm kayıt`),
      speechProfileCard(session.acoustic, acousticFluency(), { title: 'Tüm kaydın akıcılık ve ses profili' }),
      h('div.callout.info', null, icon('info', 18), h('div', null, 'Belirli bir bölümü ölçmek için Akustik laboratuvarda aralığı seçip "DDK" düğmesini kullanın.')));
  };

  // ---- Transkript düzenleyici ----
  const transcriptPanel = () => {
    const ta = h('textarea.textarea.tx-area', { rows: 22, disabled: !canWrite, spellcheck: false }, text);
    const list = h('div.utt-list');
    const stats = h('div.small.muted');
    const drawList = () => {
      if (!current) { mount(list, h('p.small.muted', null, 'Transkript boş.')); stats.textContent = ''; return; }
      stats.textContent = `${current.language.utterances.total} sözce · ${current.language.utterances.included} dahil · MLU-m ${num(current.language.mluM)} · MLU-w ${num(current.language.mluW)}`;
      mount(list, ...current.utterances.map((u, i) => {
        const body = h('div.body');
        if (u.speaker === 'examiner') body.appendChild(h('span.spk', null, 'T'));
        for (const t of u.tokens) {
          if (t.kind === 'word') body.appendChild(h(`span${t.excluded ? '.x' : t.error ? '.e' : ''}`, { title: t.a ? `${t.a.morphemes.map((m) => m.display).join('-')} · ${t.a.posLabel}${t.error ? ' · ' + t.error.label : ''}${t.reason ? ' · ' + t.reason : ''}` : '' }, t.text));
          else if (t.kind === 'filler') body.appendChild(h('span.f', null, t.text));
          else if (t.kind === 'pause') body.appendChild(h('span.f', null, t.pause));
          else if (t.kind === 'unintelligible') body.appendChild(h('span.f', null, 'xxx'));
          else if (t.kind === 'fragment') body.appendChild(h('span.f', null, `${t.text}-`));
          body.appendChild(document.createTextNode(' '));
        }
        const row = h(`div.utt-row${u.included ? '' : '.ex'}`, { title: u.included ? '' : `MLU dışı: ${u.excludeReason}` },
          h('div.n', null, i + 1), body,
          h('div.counts', null, u.speaker === 'examiner' ? 'terapist' : u.included ? `${u.wordsIncluded} s · ${u.morphemesIncluded} b` : 'dışı', u.start != null ? h('div', null, clock(u.start)) : null));
        row.addEventListener('click', () => {
          if (player && u.start != null) {
            const next = current.utterances.slice(i + 1).find((x) => x.start != null);
            player.playRange(Math.max(0, u.start - 0.2), next ? next.start : u.start + 6);
          }
          const lines = ta.value.split('\n');
          let pos = 0;
          for (let k = 0; k < Math.min(u.lineNo, lines.length); k++) pos += lines[k].length + 1;
          ta.focus();
          ta.setSelectionRange(pos, pos + (lines[u.lineNo] || '').length);
        });
        return row;
      }));
    };
    const onInput = debounce(() => {
      text = ta.value;
      recompute();
      drawList();
      if (player) player.setUtterances(current?.utterances || []);
      setDirty(true);
    }, 350);
    ta.addEventListener('input', onInput);
    drawList();
    const keyer = (e) => {
      if (!player) return;
      if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); player.toggle(); }
      if (e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); player.seek(player.audio.currentTime - 2); }
      if (e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); player.seek(player.audio.currentTime + 2); }
    };
    ta.addEventListener('keydown', keyer);

    const tools = [];
    if (canWrite && audioRec && mod.transcript) {
      const caps = sttCapabilities();
      const redo = h('button.btn.btn-ghost.btn-sm', null, icon('wand', 15), 'Sesten yeniden yazıya dök');
      redo.addEventListener('click', () => retranscribeDialog(ta, caps, () => { drawList(); }));
      tools.push(redo);
    }
    const insertTime = h('button.btn.btn-ghost.btn-sm', { title: 'İmlecin bulunduğu satırın başına oynatıcının zamanını ekler', disabled: !player }, icon('clock', 15), 'Zaman damgası');
    insertTime.addEventListener('click', () => {
      if (!player) return;
      const s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      const t = player.audio.currentTime;
      const stamp = `[${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}] `;
      const rest = ta.value.slice(lineStart).replace(/^\s*\[\d{1,2}:\d{2}(?:[.,]\d)?\]\s*/, '');
      ta.value = ta.value.slice(0, lineStart) + stamp + rest;
      ta.dispatchEvent(new Event('input'));
    });
    return h('div.editor', null,
      h('div.card', null,
        h('div.card-head', null, h('h2', null, icon('edit', 18), 'Transkript'), h('div.row', null, insertTime, ...tools)),
        h('div.card-body', null,
          canWrite ? transcriptToolbar(ta) : null,
          ta,
          h('div.row.between.mt-1', null, stats, player ? h('span.tiny.faint', null, h('span.kbd', null, 'Ctrl+Boşluk'), ' oynat/duraklat · ', h('span.kbd', null, 'Ctrl+←/→'), ' 2 sn') : null))),
      h('div.stack', null,
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('list', 17), 'Sözceler'), h('span.sub', null, player ? 'tıklayınca o bölüm çalar' : '')), h('div.card-body', null, list)),
        h('details.card', null, h('summary', { style: { padding: '14px 20px', cursor: 'pointer', fontWeight: 600 } }, 'Transkripsiyon kuralları'), h('div.card-body', null, transcriptHelp()))));
  };

  const retranscribeDialog = (ta, caps, after) => {
    const method = select([
      ...WHISPER_MODELS.map((m) => ({ id: `whisper:${m.id}`, label: `Cihaz içi ${m.label} (${m.size})${m.webgpuOnly && !hasWebGPU() ? ' — bu tarayıcıda yok' : ''}` })),
      { id: 'webspeech', label: caps.fileTranscription ? 'Chrome konuşma tanıma (gerçek zamanlı, Google sunucusu)' : `Chrome konuşma tanıma — ${caps.blockedReason ? `${caps.browser} desteklemiyor` : 'bu tarayıcıda yok'}` },
    ], `whisper:${defaultWhisperModel(app.orgSettings.transcription?.whisperModel)}`);
    const bar = h('span');
    const status = h('div.small.muted.mt-1');
    modal({
      title: 'Sesten yeniden yazıya dök',
      body: h('div.stack', null, h('p.small.muted', null, 'Otomatik transkript mevcut metnin yerine yazılır (beğenmezseniz sayfadan kaydetmeden çıkın). Whisper cihaz içinde çalışır; ilk kullanımda modeli indirir, sonra saklar.'),
        field('Yöntem', method), h('div.progress', null, bar), status),
      actions: [{ label: 'Kapat' }, {
        label: 'Başlat', variant: 'btn-primary', icon: 'wand', onClick: async (m) => {
          const prevGuard = app.guard;
          app.setGuard(() => 'Yazıya dökme sürüyor; sayfadan ayrılırsanız işlem yarıda kalır.');
          try { return await runRetranscribe(m); } finally { app.setGuard(prevGuard); }
        },
      }],
    });
    const runRetranscribe = async (m) => {
      status.textContent = 'Ses hazırlanıyor…';
      const dec = await decodeToMono16k(audioRec.blob);
      let segs;
      if (method.value === 'webspeech') {
        segs = await transcribeAudioBuffer(dec.decoded, { onProgress: (v, t) => { bar.style.width = `${v * 100}%`; status.textContent = `${clock(t)} / ${clock(dec.durationSec)}`; } });
      } else {
        const model = method.value.slice(8);
        segs = await whisperTranscribe(dec.samples, {
          model,
          segments: session.acoustic?.speechSegments,
          onLoad: (v, t) => { bar.style.width = `${v * 100}%`; status.textContent = t; },
          onStatus: (s) => { if (s === 'loading') status.textContent = 'Whisper modeli yükleniyor…'; if (s === 'fallback') status.textContent = 'Ekran kartı kullanılamadı; işlemciyle devam ediliyor…'; },
          onProgress: (v, t) => { bar.style.width = `${v * 100}%`; status.textContent = t; },
        });
      }
      if (!segs.length) throw new Error('Kayıtta yazıya dökülecek konuşma bulunamadı; mevcut transkript değiştirilmedi.');
      ta.value = segmentsToTranscript(segs);
      session.transcript = { ...(session.transcript || {}), engine: method.value === 'webspeech' ? 'webspeech-cloud' : method.value, segments: segs };
      ta.dispatchEvent(new Event('input'));
      after();
      toast(`${segs.length} sözce yazıya döküldü${segs.loops ? ` (${segs.loops} bölümde Whisper tekrar döngüsü ayıklandı — dinleyerek kontrol edin)` : ''}. Gözden geçirip kaydedin.`, 'success', 8000);
      m.close();
      return false;
    };
  };

  // ---- Biçimbirim tablosu ----
  const morphPanel = () => {
    if (!current) return h('div.card', null, h('div.card-body', null, emptyState({ icon: 'layers', title: 'Transkript yok', text: 'Önce transkript ekleyin.' })));
    const q = h('input.input', { type: 'search', placeholder: 'Sözcük ya da kök ara…' });
    const posF = select([{ id: '', label: 'Tüm türler' }, ...POS_OPTIONS], '');
    const flagF = select([{ id: '', label: 'Tümü' }, { id: 'amb', label: 'Belirsiz' }, { id: 'unk', label: 'Sözlükte yok' }, { id: 'fix', label: 'Düzeltilen' }, { id: 'ctx', label: 'Bağlamla seçilen' }], '');
    const uniqueOnly = h('input', { type: 'checkbox', checked: true });
    const host = h('div');
    const tokens = [];
    current.utterances.forEach((u) => { if (u.speaker === 'examiner') return; u.tokens.forEach((t) => { if (t.kind === 'word') tokens.push({ t, u }); }); });
    const counts = { amb: tokens.filter(({ t }) => t.a?.ambiguous).length, unk: tokens.filter(({ t }) => t.a && !t.a.known && t.a.pos !== 'prop').length, fix: Object.keys(corrections).length };
    const draw = () => {
      const term = q.value.trim().toLocaleLowerCase('tr-TR');
      const seen = new Set();
      const rows = [];
      for (const { t, u } of tokens) {
        const a = t.a;
        if (!a) continue;
        if (uniqueOnly.checked) { if (seen.has(t.norm)) continue; seen.add(t.norm); }
        if (posF.value && a.pos !== posF.value) continue;
        if (flagF.value === 'amb' && !a.ambiguous) continue;
        if (flagF.value === 'unk' && (a.known || a.pos === 'prop')) continue;
        if (flagF.value === 'fix' && !corrections[t.norm]) continue;
        if (flagF.value === 'ctx' && !(a.context && !a.context.confirmed)) continue;
        if (term && !t.norm.includes(term) && !(a.root || '').includes(term)) continue;
        const n = uniqueOnly.checked ? tokens.filter((x) => x.t.norm === t.norm).length : null;
        const fixBtn = h('button.btn.btn-text.btn-sm', { disabled: !canWrite }, icon('edit', 14), 'Düzelt');
        fixBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openCorrection(fixBtn, t, async (analysis, { team }) => {
            corrections[t.norm] = { ...analysis, source: 'manual' };
            if (team) {
              try {
                await app.repo.lexicon.save(t.norm, { ...analysis, source: 'override' });
                setOverrides(await app.repo.lexicon.map());
                toast(`"${t.text}" ekip sözlüğüne kaydedildi.`, 'success');
              } catch (err) { toast(err.message, 'error'); }
            }
            recompute();
            setDirty(true);
            mount(panel, morphPanel());
          }, { canTeam: app.can('lexicon.write') });
        });
        rows.push(h('tr', null,
          h('td.num', null, uniqueOnly.checked ? n : u.index + 1),
          h('td', null, h('b', null, t.text), t.excluded ? h('div.tiny.muted', null, t.reason) : null, t.error ? h('div.tiny', { style: { color: 'var(--danger)' } }, t.error.label) : null),
          h('td', null, chips(a), a.fromTarget ? h('div.tiny.muted', null, `hedef: ${a.fromTarget}`) : null),
          h('td', null, posTag(a.pos, a.posLabel)),
          h('td.num', null, a.morphemeCount),
          h('td', null, ambiguityBadge(corrections[t.norm] ? { ...a, source: 'manual' } : a), a.context && !a.context.confirmed ? h('div.tiny.muted', null, a.context.rule) : null),
          h('td', { style: { textAlign: 'right' } }, fixBtn)));
      }
      mount(host, rows.length ? h('div.table-wrap', null, h('table.table', null,
        h('thead', null, h('tr', null, h('th.num', null, uniqueOnly.checked ? 'Adet' : 'Sözce'), h('th', null, 'Sözcük'), h('th', null, 'Kök + ekler'), h('th', null, 'Tür'), h('th.num', null, 'Biçimbirim'), h('th', null, 'Not'), h('th'))),
        h('tbody', null, rows))) : emptyState({ icon: 'search', title: 'Eşleşen sözcük yok', text: '' }));
    };
    [q].forEach((x) => x.addEventListener('input', debounce(draw, 150)));
    [posF, flagF, uniqueOnly].forEach((x) => x.addEventListener('change', draw));
    draw();
    return h('div.card', null,
      h('div.card-head', null, h('h2', null, icon('layers', 18), 'Biçimbirim çözümlemesi'),
        h('div.row', null, badge(`${counts.amb} belirsiz`, counts.amb ? 'warn' : ''), badge(`${counts.unk} sözlükte yok`, counts.unk ? 'danger' : ''), badge(`${counts.fix} düzeltme`, counts.fix ? 'ok' : ''))),
      h('div.card-body', null,
        h('div.row', { style: { marginBottom: '12px' } },
          h('div.input-icon', { style: { flex: '1 1 220px' } }, icon('search', 16), q),
          h('div', { style: { width: '170px' } }, posF), h('div', { style: { width: '190px' } }, flagF),
          h('label.check', null, uniqueOnly, 'Farklı sözcükler')),
        h('p.small.muted', { style: { marginBottom: '10px' } }, 'Mor: kök · yeşil: çekim eki (MLU-m\'de +1) · sarı: yapım eki (sayılmaz). Çipin üzerine gelince ekin işlevi görünür. "Düzelt" ile olası diğer çözümlemeleri görebilir ya da elle bölütleyebilirsiniz.'),
        host));
  };

  // ---- Rapor ve notlar ----
  const reportPanel = () => {
    const notes = h('textarea.textarea', { rows: 6, disabled: !canWrite, placeholder: 'Klinik gözlemler, davranış, ipucu kullanımı, öneriler…' }, session.notes || '');
    notes.addEventListener('input', () => { session.notes = notes.value; setDirty(true); });
    const taskSel = select(mod.tasks.map((id) => ({ id, label: taskOf(id).label })), session.taskType, { disabled: !canWrite });
    const detail = h('input.input', { value: session.taskDetail || '', disabled: !canWrite });
    const when = h('input.input', { type: 'datetime-local', disabled: !canWrite, value: toLocalInput(session.recordedAt) });
    const modSel = select(MODULES.map((m) => ({ id: m.id, label: m.label })), session.module || 'aphasia', { disabled: !canWrite });
    const metaSave = h('button.btn.btn-soft.btn-sm', { disabled: !canWrite }, icon('save', 14), 'Bilgileri kaydet');
    metaSave.addEventListener('click', async () => {
      await save({ taskType: taskSel.value, taskDetail: detail.value, recordedAt: new Date(when.value).toISOString(), module: modSel.value, notes: notes.value });
      app.navigate(`/seans/${session.id}?tab=report`);
    });
    const exp = (ic, title, desc, fn, disabled = false) => h('button.choice', { type: 'button', disabled, style: disabled ? { opacity: 0.5 } : null, on: { click: fn } },
      h('div.c-ic.ic.indigo', null, icon(ic, 20)), h('h4', null, title), h('p', null, desc));
    const del = h('button.btn.btn-text.btn-sm', { style: { color: 'var(--danger)' }, disabled: !app.can('session.delete') }, icon('trash', 15), 'Seansı sil');
    del.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Seans silinsin mi?', message: 'Seans, ses kaydı ve analiz sonuçları kalıcı olarak silinecek.', confirmText: 'Kalıcı olarak sil', danger: true }))) return;
      dirty = false;
      await app.repo.sessions.remove(session.id);
      toast('Seans silindi.', 'success');
      app.refreshCounts();
      app.navigate(patient ? `/danisan/${patient.id}` : '/seanslar');
    });
    return h('div.stack', null,
      h('div.card', null, h('div.card-head', null, h('h2', null, icon('download', 18), 'Rapor ve dışa aktarım')),
        h('div.card-body', null, h('div.choice-grid', null,
          exp('file', 'PDF klinik rapor', 'Danışan, seans, ölçütler, tarama göstergesi, grafikler, transkript ve biçimbirim tablosu.', () => exportPdf()),
          exp('file', 'Anonim PDF', 'Ad soyad olmadan (yalnızca kod) — araştırma ve paylaşım için.', () => exportPdf(true)),
          exp('fileText', 'CSV (seans)', 'Tüm ölçütler tek satırda — SPSS, R, Excel.', () => exportCsv(), !current && !session.voice && !session.ddk),
          exp('list', 'CSV (sözcük)', 'Her sözcüğün kök, ek, tür ve biçimbirim sayısı.', () => exportWords(), !current),
          exp('fileText', 'CHAT (.cha)', 'CLAN / AphasiaBank biçimi, %mor satırıyla.', () => exportChat(), !current),
          exp('spectrum', 'Praat TextGrid', 'Sözce, konuşma/sessizlik ve duraksama katmanları.', () => exportTg(), !session.acoustic),
          exp('database', 'JSON', 'Seansın tüm verisi (ses hariç).', () => exportJson()),
          exp('headphones', 'Ses dosyası', audioRec ? `${fmtBytes(audioRec.sizeBytes)} · özgün biçim` : 'Ses kaydı yok', () => download(audioRec.blob, `${baseName()}.${extFor(audioRec.mimeType)}`), !audioRec)))),
      h('div.grid.grid-2', null,
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('note', 17), 'Klinisyen notları')), h('div.card-body', null, notes,
          (session.markers || []).length ? h('div.mt-2', null, h('div.tiny.muted', { style: { fontWeight: 600 } }, 'SEANS SIRASINDA ALINAN NOTLAR'),
            h('div.marker-list.mt-1', null, session.markers.map((m) => h('div.marker-item', { style: { cursor: player ? 'pointer' : 'default' }, on: { click: () => player && player.seek(m.t) } }, h('span.t', null, clock(m.t)), h('span', null, m.text))))) : null)),
        h('div.card', null, h('div.card-head', null, h('h3', null, icon('info', 17), 'Seans bilgileri')), h('div.card-body', null,
          h('div.form-grid', null, field('Modül', modSel), field('Görev', taskSel), field('Ayrıntı', detail), field('Tarih ve saat', when)),
          h('div.row.between.mt-2', null, metaSave, del),
          h('div.divider'),
          h('div.small.muted', null,
            `Çözümleme: ${ENGINE_ID} · akustik: ${session.acoustic?.version || '—'} · transkript: ${engineLabel(session.transcript?.engine)} · cihaz: ${session.device || '—'}`, h('br'),
            `Oluşturma: ${fmtDateTime(session.createdAt)} · son güncelleme: ${fmtDateTime(session.updatedAt)}${session.verifiedAt ? ' · doğrulama: ' + fmtDateTime(session.verifiedAt) : ''}`)))));
  };

  // ---- Dışa aktarım işlevleri ----
  function baseName() { return `MorphologAI_${safeName(patient?.code || 'seans')}_${(session.recordedAt || '').slice(0, 10)}_${safeName(taskOf(session.taskType).label)}`; }
  async function exportPdf(anonymize = false) {
    const t = toast('PDF hazırlanıyor…', 'info', 2500);
    try {
      const charts = {};
      if (current) {
        const tmp = h('div', { style: { position: 'fixed', left: '-10000px', top: '0', width: '520px', height: '300px' } });
        document.body.appendChild(tmp);
        const mk = async (items, key) => {
          if (!items.length) return;
          const box = h('div', { style: { width: '520px', height: `${Math.max(160, 40 + items.length * 28)}px` } });
          const c = h('canvas');
          box.appendChild(c);
          tmp.appendChild(box);
          const ch = await barChart(c, items, {});
          ch.options.animation = false;
          ch.update('none');
          charts[key] = chartImage(c);
        };
        const L = current.language;
        await mk(Object.entries(L.pos).map(([k, v]) => ({ label: POS_LABEL[k] || k, value: v })).sort((a, b) => b.value - a.value), 'pos');
        await mk(Object.entries(L.verbs.tense).map(([k, v]) => ({ label: TENSE_TR[k] || k, value: v })).sort((a, b) => b.value - a.value), 'tense');
        tmp.remove();
      }
      const doc = await buildSessionPdf({
        session, patient, analysis: current || emptyAnalysis(), acoustic: session.acoustic, org: app.ctx.org,
        clinician: `${app.ctx.user.title ? app.ctx.user.title + ' ' : ''}${app.ctx.user.name}`, charts, anonymize,
      });
      doc.download(`${baseName()}${anonymize ? '_anonim' : ''}.pdf`);
      t();
      toast('PDF raporu indirildi.', 'success');
    } catch (err) {
      console.error(err);
      toast(`PDF oluşturulamadı: ${err.message || err}`, 'error');
    }
  }
  function emptyAnalysis() {
    return analyzeSession({ transcript: '', acoustic: session.acoustic, settings: app.settings });
  }
  function exportCsv() {
    download(new Blob([sessionsCsv([{ session, patient, a: current ? summarize(current) : (session.analysis || {}) }])], { type: 'text/csv;charset=utf-8' }), `${baseName()}.csv`);
  }
  function exportWords() {
    download(new Blob([wordsCsv([{ session, patient, a: summarize(current) }])], { type: 'text/csv;charset=utf-8' }), `${baseName()}_sozcukler.csv`);
  }
  function exportChat() {
    const cha = toChat(current, { mediaName: audioRec ? `${baseName()}.${extFor(audioRec.mimeType)}` : null, date: session.recordedAt, task: taskOf(session.taskType).label });
    download(new Blob([cha], { type: 'text/plain;charset=utf-8' }), `${baseName()}.cha`);
  }
  function exportTg() {
    download(new Blob([toTextGrid({ durationSec: session.acoustic.durationSec, utterances: current?.utterances || [], acoustic: session.acoustic, markers: session.markers || [] })], { type: 'text/plain;charset=utf-8' }), `${baseName()}.TextGrid`);
  }
  function exportJson() {
    const data = { app: 'MorphologAI', exportedAt: new Date().toISOString(), patient: patient ? { code: patient.code, group: patient.group, diagnosis: patient.diagnosis, birthYear: patient.birthYear, sex: patient.sex } : null, session: { ...session, analysis: current ? summarize(current) : session.analysis } };
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${baseName()}.json`);
  }

  async function reanalyzeAudio() {
    const t = toast('Ses yeniden çözümleniyor…', 'info', 60000);
    try {
      const { acoustic, measures } = await analyzeAudio(app, audioRec.blob, { module: session.module, taskType: session.taskType });
      const { summary, heavy: hv } = splitAcoustic(acoustic);
      await app.repo.acoustic.put(session.id, hv);
      const lang = text.trim() ? recompute()?.language : null;
      session = await app.repo.sessions.save({
        ...session, acoustic: summary, voice: measures.voice, ddk: measures.ddk, sz: measures.sz, mpt: measures.mptSec ?? session.mpt,
        fluency: computeFluency(summary, lang, app.settings),
      });
      t();
      toast('Akustik ölçümler güncellendi.', 'success');
      dirty = false;
      app.navigate(`/seans/${session.id}?tab=${tab}`);
    } catch (err) {
      t();
      toast(`Çözümlenemedi: ${err.message || err}`, 'error');
    }
  }

  drawTabs();
  mount(root, head, versionNote, audioCard, tabBar, panel);
  drawPanel();
  return () => cleanups.forEach((fn) => { try { fn(); } catch { /* yok say */ } });
}

function engineLabel(e) {
  if (!e) return '—';
  if (e === 'manual') return 'elle';
  if (e === 'imported') return 'dosyadan';
  if (e === 'none') return 'yok';
  if (e === 'webspeech-cloud') return 'Chrome (bulut)';
  if (e === 'webspeech-local') return 'Chrome (cihaz içi)';
  if (e.startsWith('whisper')) return `Whisper (${e.split('/').pop()})`;
  return e;
}

function toLocalInput(iso) {
  const d = new Date(iso || Date.now());
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
