/**
 * Yeni seans: modül + danışan + görev seçimi, ardından
 *   • Canlı kayıt stüdyosu (kayıpsız WAV, anlık transkript ve biçimbirim, klinik notlar)
 *   • Ses dosyası yükleme (Chrome / cihaz içi Whisper / elle transkript)
 *   • Metin ile analiz
 */
import { h, mount, icon, num, clock, fmtBytes, fmtDur, toast, field, select, confirmDialog, emptyState } from '../ui/dom.js';
import { MODULES, moduleOf, taskOf } from '../constants.js';
import { openPatientForm } from '../components/patientForm.js';
import { wordPill } from '../components/morphView.js';
import { Recorder, LiveVad, listInputDevices } from '../../core/audio/recorder.js';
import { LiveTranscriber, sttCapabilities, onDeviceStatus, transcribeAudioBuffer, segmentsToTranscript, browserInfo } from '../../core/stt/webspeech.js';
import { whisperTranscribe, WHISPER_MODELS, hasWebGPU, defaultWhisperModel } from '../../core/stt/whisper.js';
import { analyzeTranscript } from '../../core/analysis.js';
import { parseWavHeader } from '../../core/audio/wav.js';
import { analyzeAudio, saveSession } from '../pipeline.js';
import { fromChat } from '../../export/chat.js';
import { transcriptHelp, transcriptToolbar } from '../components/transcriptTools.js';

const ACCEPT = 'audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.webm,.wma,.aif,.aiff';

export async function render(root, { query }, app) {
  app.setCrumbs([{ label: 'Yeni seans' }]);
  if (!app.can('session.write')) {
    mount(root, emptyState({ icon: 'lock', title: 'Yetkiniz yok', text: 'Gözlemci rolündeki üyeler seans oluşturamaz.' }));
    return;
  }
  const state = {
    module: query.module && MODULES.some((m) => m.id === query.module) ? query.module : 'aphasia',
    patientId: query.patient || '',
    taskType: '',
    taskDetail: '',
    method: query.mode || 'live',
  };
  state.taskType = moduleOf(state.module).defaultTask;
  let cleanupFn = null;
  const cleanup = () => { if (cleanupFn) { cleanupFn(); cleanupFn = null; } };

  const showSetup = async () => {
    cleanup();
    app.setGuard(null);
    app.setCrumbs([{ label: 'Yeni seans' }]);
    const patients = await app.repo.patients.list();
    if (state.patientId && !patients.some((p) => p.id === state.patientId)) state.patientId = '';

    const modGrid = h('div.choice-grid', { style: { gridTemplateColumns: 'repeat(4, minmax(0,1fr))' } });
    const taskSel = h('select.select');
    const promptBox = h('div.prompt-card');
    const detail = h('input.input', { placeholder: '', value: state.taskDetail });
    const methodGrid = h('div.choice-grid');
    const patSel = h('select.select');

    const fillPatients = () => {
      mount(patSel, h('option', { value: '' }, patients.length ? '— Danışan seçin —' : '— Önce danışan ekleyin —'),
        ...patients.map((p) => h('option', { value: p.id, selected: p.id === state.patientId }, `${p.code}${p.fullName ? ' · ' + p.fullName : ''}${p.group === 'control' ? ' (kontrol)' : ''}`)));
    };
    const fillTasks = () => {
      const mod = moduleOf(state.module);
      if (!mod.tasks.includes(state.taskType)) state.taskType = mod.defaultTask;
      mount(taskSel, ...mod.tasks.map((id) => h('option', { value: id, selected: id === state.taskType }, taskOf(id).label)));
      const t = taskOf(state.taskType);
      detail.placeholder = t.hint || 'Görev ayrıntısı (isteğe bağlı)';
      mount(promptBox, h('div.p-label', null, 'Danışana yönerge'), h('div.p-text', null, t.prompt || 'Serbest görev — yönergenizi siz verin.'));
    };
    const drawModules = () => {
      mount(modGrid, ...MODULES.map((m) => {
        const c = h(`button.choice${m.id === state.module ? '.on' : ''}`, { type: 'button' },
          h('span.c-check', null, icon('check', 13)),
          h(`div.c-ic.ic.${m.tone}`, null, icon(m.icon, 22)), h('h4', null, m.label), h('p', null, m.description));
        c.addEventListener('click', () => { state.module = m.id; if (!m.transcript && state.method === 'text') state.method = 'live'; drawModules(); fillTasks(); drawMethods(); });
        return c;
      }));
    };
    const drawMethods = () => {
      const mod = moduleOf(state.module);
      const items = [
        ['live', 'mic', 'emerald', 'Canlı kayıt', 'Mikrofonla kaydedin; ses kayıpsız WAV olarak saklanır, konuşma anında yazıya dökülür ve çözümlenir.'],
        ['upload', 'upload', 'indigo', 'Ses dosyası yükle', 'Profesyonel mikrofon / ses kayıt cihazıyla alınmış WAV, MP3, M4A, FLAC… dosyasını çözümleyin.'],
        ['text', 'fileText', 'lavender', 'Metin / transkript', mod.transcript ? 'Hazır bir transkripti yapıştırın ya da .txt / .cha (CHAT) dosyası yükleyin.' : 'Bu modül ses kaydı gerektirir.'],
      ];
      mount(methodGrid, ...items.map(([id, ic, tone, title, desc]) => {
        const disabled = id === 'text' && !mod.transcript;
        const c = h(`button.choice${state.method === id ? '.on' : ''}`, { type: 'button', disabled, style: disabled ? { opacity: 0.5, cursor: 'not-allowed' } : null },
          h('span.c-check', null, icon('check', 13)), h(`div.c-ic.ic.${tone}`, null, icon(ic, 22)), h('h4', null, title), h('p', null, desc));
        if (!disabled) c.addEventListener('click', () => { state.method = id; drawMethods(); });
        return c;
      }));
    };
    patSel.addEventListener('change', () => { state.patientId = patSel.value; });
    taskSel.addEventListener('change', () => { state.taskType = taskSel.value; fillTasks(); });
    detail.addEventListener('input', () => { state.taskDetail = detail.value; });
    const newPatBtn = h('button.btn.btn-soft', { type: 'button' }, icon('userPlus', 16), 'Yeni danışan');
    newPatBtn.addEventListener('click', async () => {
      const p = await openPatientForm(app);
      if (p) { patients.push(p); state.patientId = p.id; fillPatients(); }
    });
    const goBtn = h('button.btn.btn-primary.btn-lg', null, 'Devam et', icon('arrowRight', 18));
    goBtn.addEventListener('click', () => {
      if (!state.patientId) { toast('Lütfen bir danışan seçin ya da ekleyin.', 'warning'); patSel.focus(); return; }
      if (state.method === 'live') showLive();
      else if (state.method === 'upload') showUpload();
      else showText();
    });

    fillPatients();
    drawModules();
    fillTasks();
    drawMethods();
    app.setActions([]);
    mount(root,
      h('div.page-head', null, h('div', null, h('div.eyebrow', null, icon('plus', 14), 'Yeni seans'), h('h1', null, 'Seans hazırlığı'), h('p', null, 'Klinik modülü, danışanı ve görevi seçin; ardından canlı kayıt, ses dosyası ya da metinle devam edin.'))),
      h('div.stack', null,
        h('div.card', null, h('div.card-head', null, h('h2', null, h('span.badge.info', null, '1'), 'Klinik modül')), h('div.card-body', null, modGrid)),
        h('div.grid.grid-2', null,
          h('div.card', null, h('div.card-head', null, h('h2', null, h('span.badge.info', null, '2'), 'Danışan')),
            h('div.card-body', null, h('div.row', { style: { flexWrap: 'nowrap' } }, h('div', { style: { flex: 1 } }, patSel), newPatBtn),
              h('p.small.muted.mt-2', null, 'Kontrol grubu katılımcılarının seansları ekibinizin norm değerlerini oluşturur.'))),
          h('div.card', null, h('div.card-head', null, h('h2', null, h('span.badge.info', null, '3'), 'Görev')),
            h('div.card-body', null, h('div.form-grid', null, field('Görev türü', taskSel), field('Ayrıntı', detail)), h('div.mt-2', null, promptBox)))),
        h('div.card', null, h('div.card-head', null, h('h2', null, h('span.badge.info', null, '4'), 'Kayıt yöntemi')), h('div.card-body', null, methodGrid)),
        h('div.row', { style: { justifyContent: 'flex-end' } }, goBtn)));
  };

  // -------------------------------------------------------------------------
  // Canlı kayıt
  // -------------------------------------------------------------------------
  const showLive = async () => {
    cleanup();
    const mod = moduleOf(state.module);
    const task = taskOf(state.taskType);
    const patient = await app.repo.patients.get(state.patientId);
    app.setCrumbs([{ label: 'Yeni seans', href: '#/seans/yeni' }, { label: `Canlı kayıt · ${patient.code}` }]);
    await app.lexicon();
    const caps = sttCapabilities();
    const devices = await listInputDevices();
    const devSel = select(devices.length ? devices.map((d) => ({ id: d.deviceId, label: d.label })) : [{ id: '', label: 'Varsayılan mikrofon' }], localStorage.getItem('morphologai.mic') || '');
    const sttOn = h('input', { type: 'checkbox', checked: mod.transcript && caps.available, disabled: !caps.available });
    const autoWhisper = h('input', { type: 'checkbox', checked: true });
    const localStatus = await onDeviceStatus();
    const useLocal = localStatus === 'available';
    const b = browserInfo();

    const recState = h('span.rec-state', null, h('span.pulse'), 'Hazır');
    const timer = h('div.timer', null, '00:00', h('small', null, 'kayıt süresi'));
    const orbCanvas = h('canvas', { width: 340, height: 340, style: { width: '170px', height: '170px' } });
    const micBtn = h('button.mic-btn', { 'aria-label': 'Kaydı başlat' }, icon('mic', 40));
    const pauseBtn = h('button.btn.btn-ghost', { disabled: true }, icon('pause', 16), 'Duraklat');
    const stopBtn = h('button.btn.btn-danger', { disabled: true }, icon('stop', 15), 'Bitir ve çözümle');
    const cancelBtn = h('button.btn.btn-text', null, 'Vazgeç');
    const wave = h('canvas.wave-live', { width: 1200, height: 192 });
    const silenceBar = h('span');
    const silenceText = h('span', null, 'Sessizlik: 0,0 sn');
    const silence = h('div.silence-meter', null, icon('clock', 14), silenceText, h('div.bar', null, silenceBar));
    const feed = h('div.feed', { 'aria-live': 'polite' });
    const interim = h('div.interim', null, mod.transcript ? 'Konuşma burada anında yazıya dökülür…' : 'Bu modülde transkript gerekmez; akustik ölçümler kayıttan sonra yapılır.');
    const sttNote = h('div');
    const markerInput = h('input.input', { placeholder: 'Zaman damgalı not… (Enter)', style: { height: '36px' } });
    const markerList = h('div.marker-list');
    const presets = ['İpucu verildi', 'Model sunuldu', 'Görev tekrarlandı', 'Yorgunluk', 'Dikkat dağıldı'];

    // canlı ölçütler
    const mv = {};
    const metric = (key, label, value = '—', note = '') => {
      mv[key] = h('div.m-value', null, value);
      return h('div.metric', null, h('div.m-label', null, label), mv[key], note ? h('div.m-note', null, note) : null);
    };
    const liveMetrics = mod.transcript
      ? h('div.metric-grid', null, metric('utt', 'Sözce', '0'), metric('words', 'Sözcük', '0'), metric('mluw', 'MLU-w'), metric('mlum', 'MLU-m'),
        metric('wpm', 'Sözcük/dk'), metric('long', 'Uzun duraksama', '0', '≥ 2 sn'), metric('fill', 'Dolgu'), metric('speak', 'Konuşma oranı'))
      : h('div.metric-grid', null, metric('phon', 'Şu anki fonasyon', '0,0 sn'), metric('best', 'En uzun fonasyon', '0,0 sn', 'MPT tahmini'),
        metric('f0', 'Anlık F0', '—', 'Hz'), metric('level', 'Ses düzeyi', '—', 'dBFS'));

    const segments = [];
    const markers = [];
    let totals = { words: 0, morphemes: 0, utts: 0, fillers: 0 };
    let recorder = null;
    let transcriber = null;
    const vad = new LiveVad({ longPauseSec: (app.settings.longPauseMs || 2000) / 1000 });
    let recording = false;
    let paused = false;
    let raf = 0;
    const levels = [];
    let peakHold = 0;
    let phonRun = 0;
    let phonBest = 0;
    let lastPitchAt = 0;

    const addMarker = (text) => {
      const t = recorder ? recorder.elapsed : 0;
      if (!text.trim()) return;
      markers.push({ t: Number(t.toFixed(2)), text: text.trim() });
      markerList.prepend(h('div.marker-item', null, h('span.t', null, clock(t)), h('span', null, text.trim())));
      markerInput.value = '';
    };
    markerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addMarker(markerInput.value); } });

    const onFinal = (seg) => {
      segments.push(seg);
      const { utterances } = analyzeTranscript(seg.text, app.settings);
      let w = 0;
      let m = 0;
      const pills = [];
      for (const u of utterances) {
        for (const t of u.tokens) {
          if (t.kind === 'word') { pills.push(wordPill(t)); if (!t.excluded) { w++; m += t.a ? t.a.morphemeCount : 1; } }
          else if (t.kind === 'filler') { totals.fillers++; pills.push(h('span.word-pill.excluded', null, t.text)); }
        }
      }
      if (w) { totals.words += w; totals.morphemes += m; totals.utts += 1; }
      const item = h('div.utt', null, h('div.t', null, clock(seg.start)),
        h('div', null, h('div.txt', null, seg.text), h('div.words', null, pills),
          h('div.meta', null, h('span', null, `${w} sözcük`), h('span', null, `${m} biçimbirim`), seg.confidence ? h('span', null, `güven %${Math.round(seg.confidence * 100)}`) : null)));
      feed.appendChild(item);
      feed.scrollTop = feed.scrollHeight;
      updateMetrics();
    };
    const updateMetrics = () => {
      if (!mod.transcript) return;
      const el = recorder ? recorder.elapsed : 0;
      mv.utt.textContent = num(totals.utts, 0);
      mv.words.textContent = num(totals.words, 0);
      mv.mluw.textContent = totals.utts ? num(totals.words / totals.utts, 2) : '—';
      mv.mlum.textContent = totals.utts ? num(totals.morphemes / totals.utts, 2) : '—';
      mv.wpm.textContent = el > 10 ? num((totals.words / el) * 60, 0) : '—';
      mv.long.textContent = num(vad.longPauses, 0);
      mv.fill.textContent = num(totals.fillers, 0);
      mv.speak.textContent = el > 3 ? `%${num((100 * vad.speaking) / el, 0)}` : '—';
    };

    const drawOrb = (db) => {
      const ctx = orbCanvas.getContext('2d');
      const W = orbCanvas.width;
      ctx.clearRect(0, 0, W, W);
      const lvl = Math.max(0, Math.min(1, (db + 60) / 50));
      peakHold = Math.max(lvl, peakHold * 0.94);
      const cx = W / 2;
      const base = W * 0.33;
      const color = paused ? '245,158,11' : recording ? '239,68,68' : '16,185,129';
      for (let i = 3; i >= 1; i--) {
        ctx.beginPath();
        ctx.arc(cx, cx, base + (peakHold * W * 0.17 * i) / 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${0.07 * (4 - i)})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, cx, W * 0.47, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lvl);
      ctx.strokeStyle = `rgba(${color},0.85)`;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();
    };
    const drawWave = () => {
      const ctx = wave.getContext('2d');
      const W = wave.width;
      const H = wave.height;
      ctx.clearRect(0, 0, W, H);
      const n = levels.length;
      const bars = 200;
      const bw = W / bars;
      const style = getComputedStyle(document.documentElement);
      const on = style.getPropertyValue('--primary').trim() || '#6366f1';
      const off = style.getPropertyValue('--border-2').trim() || '#cbd5e1';
      for (let i = 0; i < bars; i++) {
        const v = levels[n - bars + i];
        if (v == null) continue;
        const a = Math.max(0.02, Math.min(1, (v.db + 60) / 50));
        const bh = a * (H - 12);
        ctx.fillStyle = v.speech ? on : off;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(i * bw + 1, (H - bh) / 2, Math.max(1, bw - 2), bh, 2) : ctx.rect(i * bw + 1, (H - bh) / 2, Math.max(1, bw - 2), bh);
        ctx.fill();
      }
    };
    let lastDb = -90;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (recorder) timer.firstChild.textContent = clock(recorder.elapsed);
      drawOrb(recording && !paused ? lastDb : -90);
      const now = performance.now();
      if (!mod.transcript && recorder && recording && !paused && now - lastPitchAt > 120) {
        lastPitchAt = now;
        const f0 = recorder.livePitch();
        mv.f0.textContent = f0 ? num(f0, 0) : '—';
        mv.level.textContent = num(lastDb, 0);
      }
    };
    raf = requestAnimationFrame(loop);

    const onLevel = (db) => {
      lastDb = db;
      const r = vad.push(db, 0.05);
      levels.push({ db, speech: r.isSpeech });
      if (levels.length > 2000) levels.splice(0, 1000);
      drawWave();
      const s = r.silence;
      silenceText.textContent = `Sessizlik: ${num(s, 1)} sn`;
      silenceBar.style.width = `${Math.min(100, (s / 5) * 100)}%`;
      silence.classList.toggle('long', s >= vad.longPauseSec);
      if (!mod.transcript) {
        if (r.isSpeech) phonRun += 0.05; else if (s > 0.15) phonRun = 0;
        phonBest = Math.max(phonBest, phonRun);
        mv.phon.textContent = `${num(phonRun, 1)} sn`;
        mv.best.textContent = `${num(phonBest, 1)} sn`;
      } else if (Math.random() < 0.2) updateMetrics();
    };

    const setState = (st) => {
      recState.className = st === 'rec' ? 'rec-state on' : st === 'paused' ? 'rec-state paused' : 'rec-state';
      recState.lastChild.textContent = st === 'rec' ? 'Kaydediliyor' : st === 'paused' ? 'Duraklatıldı' : st === 'busy' ? 'Hazırlanıyor…' : 'Hazır';
      micBtn.classList.toggle('rec', st === 'rec');
      micBtn.classList.toggle('paused', st === 'paused');
      mount(micBtn, icon(st === 'rec' ? 'pause' : st === 'paused' ? 'play' : 'mic', 40));
    };

    const start = async () => {
      setState('busy');
      localStorage.setItem('morphologai.mic', devSel.value || '');
      recorder = new Recorder({ deviceId: devSel.value || null, onLevel });
      let track;
      try {
        track = await recorder.start();
      } catch (err) {
        setState('idle');
        recorder = null;
        const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        toast(denied ? 'Mikrofon izni verilmedi. Adres çubuğundaki kilit simgesinden izin verin.' : `Mikrofon açılamadı: ${err.message || err}`, 'error', 7000);
        return;
      }
      // İzin sonrası cihaz adları görünür
      listInputDevices().then((list) => {
        if (list.length) mount(devSel, ...list.map((d) => h('option', { value: d.deviceId, selected: d.deviceId === (devSel.value || track.getSettings().deviceId) }, d.label)));
      });
      recording = true;
      paused = false;
      setState('rec');
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
      devSel.disabled = true;
      sttOn.disabled = true;
      app.setGuard(() => (recording ? 'Kayıt devam ediyor. Sayfadan ayrılırsanız kayıt kaybolur.' : null));
      if (sttOn.checked && caps.available) {
        transcriber = new LiveTranscriber({
          track: caps.trackInput ? track : null,
          clock: () => recorder.elapsed,
          processLocally: useLocal,
          onFinal,
          onInterim: (t) => { interim.textContent = t || ''; interim.style.display = t ? '' : 'none'; },
          onError: (e) => {
            const msg = e.code === 'network'
              ? 'Konuşma tanıma servisine ulaşılamadı ("network"). Bu genellikle sayfa Google Chrome dışında bir tarayıcıda (ör. uygulama içi tarayıcı, Brave) açıldığında ya da internet/VPN engeli olduğunda olur. Ses kaydı sürüyor; transkripti sonra ekleyebilirsiniz.'
              : e.message;
            mount(sttNote, h('div.callout.warn.mt-2', null, icon('alert', 18), h('div', null, msg)));
            if (e.fatal) transcriber = null;
          },
        });
        try { transcriber.start(); } catch (err) { mount(sttNote, h('div.callout.warn.mt-2', null, icon('alert', 18), h('div', null, String(err.message || err)))); }
      }
    };
    const togglePause = () => {
      if (!recorder || !recording) return;
      if (!paused) { recorder.pause(); transcriber?.pause(); paused = true; setState('paused'); mount(pauseBtn, icon('play', 16), 'Devam et'); }
      else { recorder.resume(); transcriber?.resume(); paused = false; setState('rec'); mount(pauseBtn, icon('pause', 16), 'Duraklat'); }
    };
    micBtn.addEventListener('click', () => { if (!recorder) start(); else togglePause(); });
    pauseBtn.addEventListener('click', togglePause);
    cancelBtn.addEventListener('click', async () => {
      if (recorder && recording) {
        const ok = await confirmDialog({ title: 'Kayıt iptal edilsin mi?', message: 'Bu kayıt ve transkript kaydedilmeden silinecek.', confirmText: 'İptal et', danger: true });
        if (!ok) return;
      }
      showSetup();
    });
    stopBtn.addEventListener('click', async () => {
      if (!recorder) return;
      if (recorder.elapsed < 2) { toast('Kayıt çok kısa (en az 2 saniye).', 'warning'); return; }
      stopBtn.disabled = true;
      pauseBtn.disabled = true;
      micBtn.disabled = true;
      setState('busy');
      recState.lastChild.textContent = 'Son sonuçlar alınıyor…';
      if (transcriber) await transcriber.stop(1800);
      const rec = await recorder.stop();
      recording = false;
      app.setGuard(null);
      const transcriptText = mod.transcript ? segmentsToTranscript(segments) : '';
      const deviceLabel = devSel.selectedOptions[0]?.textContent || null;
      // Anlık transkript çıkmadıysa (kapalı, desteklenmiyor ya da hizmete ulaşılamadı) cihaz içi Whisper ile yazıya dök
      const needWhisper = mod.transcript && !segments.length && autoWhisper.checked;
      await processAndSave({
        blob: rec.blob,
        fileName: null,
        audioInfo: { sampleRate: rec.sampleRate, channels: 1, bitsPerSample: 16, format: 'WAV PCM' },
        transcriptText,
        engine: segments.length ? (useLocal ? 'webspeech-local' : 'webspeech-cloud') : 'none',
        transcribe: needWhisper ? 'whisper' : null,
        whisperModel: defaultWhisperModel(app.orgSettings.transcription?.whisperModel),
        segments,
        markers,
        source: 'live',
        device: deviceLabel,
        recordedAt: new Date(Date.now() - rec.durationSec * 1000).toISOString(),
      });
    });

    const keyHandler = (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); markerInput.focus(); }
      if (e.code === 'Space' && recorder) { e.preventDefault(); togglePause(); }
    };
    document.addEventListener('keydown', keyHandler);
    cleanupFn = () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', keyHandler);
      try { transcriber?.stop(200); } catch { /* yok say */ }
      if (recorder && recording) recorder.cancel();
      recording = false;
      app.setGuard(null);
    };

    const whisperOpt = h('label.check.mt-2', null, autoWhisper, h('span.small', null, h('b', null, 'Anlık transkript çıkmazsa kayıttan sonra Whisper ile yazıya dök'), h('div.tiny.muted', null, 'Cihaz içi; ses bilgisayardan çıkmaz. İlk kullanımda model indirilir.')));
    const sttInfo = !mod.transcript ? null : !caps.available
      ? h('div.callout.warn', null, icon('alert', 18), h('div', null,
        h('b', null, caps.blockedReason || `${b.name} anlık konuşma tanımayı desteklemiyor. `), ' ',
        'Kayıt normal alınır; bitirdiğinizde konuşma cihaz içi Whisper ile otomatik yazıya dökülür. Anlık yazı görmek için sayfayı Google Chrome ile açın.', whisperOpt))
      : h('div.callout.info', null, icon(useLocal ? 'cpu' : 'cloud', 18), h('div', null,
        useLocal ? h('span', null, h('b', null, 'Cihaz içi konuşma tanıma etkin. '), 'Ses bilgisayarınızdan çıkmaz.')
          : h('span', null, h('b', null, `Anlık transkripsiyon ${caps.cloudProvider || 'tarayıcı'} sunucularında yapılır. `), 'Ses kaydının kendisi yalnızca bu cihazda saklanır. İstemiyorsanız anlık transkripsiyonu kapatın; kayıttan sonra cihaz içi Whisper kullanılır.'),
        caps.trackInput ? null : h('div.tiny.muted.mt-1', null, 'Not: Bu tarayıcıda tanıma varsayılan mikrofonu kullanır; seçtiğiniz cihaz yalnızca kayıt için kullanılır.'),
        whisperOpt));

    app.setActions([]);
    mount(root,
      h('div.page-head', null, h('div', null,
        h('div.eyebrow', null, icon(mod.icon, 14), `${mod.label} · ${task.label}`),
        h('h1', null, `Canlı seans — ${patient.code}`),
        h('p', null, `${patient.fullName ? patient.fullName + ' · ' : ''}Kaydı başlatmak için mikrofon düğmesine basın. `, h('span.kbd', null, 'Boşluk'), ' duraklat/devam, ', h('span.kbd', null, 'N'), ' not ekle.'))),
      h('div.live', null,
        h('div.stack', null,
          h('div.card.live-stage', null,
            h('div.live-top', null, recState, h('div.row', null, h('div', { style: { width: '260px' } }, devSel),
              mod.transcript ? h('label.switch', null, sttOn, h('span.track'), 'Anlık transkript') : null)),
            h('div.live-center', null,
              h('div.mic-orb', null, orbCanvas, micBtn),
              h('div', null, timer, h('div.row.mt-2', null, pauseBtn, stopBtn, cancelBtn), silence)),
            wave,
            sttNote),
          mod.transcript ? h('div.card', null,
            h('div.card-head', null, h('h2', null, icon('fileText', 18), 'Anlık transkript'), h('span.sub', null, 'Her kesin sonuç bir sözcedir; kayıttan sonra düzenleyebilirsiniz')),
            h('div.card-body', null, feed, h('div.mt-2', null, interim))) : null),
        h('div.stack.live-side', null,
          h('div.prompt-card', null, h('div.p-label', null, 'Danışana yönerge'), h('div.p-text', null, task.prompt || '—'), state.taskDetail ? h('div.small.muted.mt-1', null, state.taskDetail) : null),
          sttInfo,
          h('div.card', null, h('div.card-head', null, h('h3', null, icon('activity', 17), 'Canlı göstergeler')), h('div.card-body', null, liveMetrics,
            h('p.tiny.muted.mt-2', null, 'Canlı değerler yaklaşıktır; kesin ölçümler kayıt bittikten sonra ses dosyasından hesaplanır.'))),
          h('div.card', null, h('div.card-head', null, h('h3', null, icon('flag', 17), 'Klinisyen notları')),
            h('div.card-body', null, markerInput,
              h('div.row.mt-1', { style: { gap: '6px' } }, presets.map((p) => h('button.btn.btn-ghost.btn-sm', { type: 'button', on: { click: () => addMarker(p) } }, p))),
              h('div.mt-2', null, markerList))))));
    setState('idle');
  };

  // -------------------------------------------------------------------------
  // İşleme ve kayıt (canlı + yükleme ortak)
  // -------------------------------------------------------------------------
  const processAndSave = async (p) => {
    cleanup();
    const bar = h('span');
    const label = h('div.small.muted', null, 'Başlatılıyor…');
    const steps = h('div.stack', { style: { gap: '8px', marginTop: '16px' } });
    const log = (t, ok = true) => steps.appendChild(h('div.row.small', null, h('span', { style: { color: ok ? 'var(--accent-600)' : 'var(--warn)' } }, icon(ok ? 'checkCircle' : 'alert', 16)), t));
    const extra = h('div');
    mount(root, h('div', { style: { maxWidth: '680px', margin: '40px auto' } },
      h('div.card', null, h('div.card-body', { style: { padding: '28px' } },
        h('div.row', null, h('div.spinner'), h('h2', { style: { fontSize: '18px' } }, 'Seans çözümleniyor')),
        h('div.progress.mt-3', null, bar), h('div.mt-1', null, label), steps, extra))));
    const progress = (v, t) => { bar.style.width = `${Math.round(v * 100)}%`; if (t) label.textContent = t; };
    app.setGuard(() => 'Seans işleniyor ve kaydediliyor. Sayfadan ayrılırsanız işlem yarıda kalır ve kayıt kaybolabilir.');
    try {
      let acoustic = null;
      let measures = null;
      let dec = null;
      if (p.blob) {
        const r = await analyzeAudio(app, p.blob, { module: state.module, taskType: state.taskType, onProgress: (v, t) => progress(v * 0.6, t) });
        ({ acoustic, measures, dec } = r);
        log(`Ses çözümlendi: ${fmtDur(acoustic.durationSec)}, ${acoustic.runs} konuşma akışı, ${acoustic.pauses.length} duraksama · kayıt kalitesi: ${acoustic.quality.level}`);
      }
      let transcriptText = p.transcriptText || '';
      let engine = p.engine;
      let segments = p.segments || [];
      let txError = null;
      // Yazıya dökme başarısız olsa bile seans (ve ses kaydı) kaydedilir; transkript sonra eklenebilir
      if (p.transcribe === 'webspeech' && dec) {
        try {
          progress(0.6, 'Chrome konuşma tanıma ile yazıya dökülüyor (dosya gerçek zamanlı çalınır)…');
          const live = h('div.interim.mt-2', null, '…');
          mount(extra, live);
          segments = await transcribeAudioBuffer(dec.decoded, {
            listen: p.listen,
            onInterim: (t) => { live.textContent = t || '…'; },
            onSegment: (s) => { live.textContent = s.text; },
            onProgress: (v, t) => progress(0.6 + 0.3 * v, `Yazıya dökülüyor… ${clock(t)} / ${clock(dec.durationSec)}`),
          });
          transcriptText = segmentsToTranscript(segments);
          engine = 'webspeech-cloud';
          log(`${segments.length} sözce yazıya döküldü`);
        } catch (err) {
          txError = err;
          log(`Yazıya dökülemedi: ${err.message}`, false);
        }
        mount(extra);
      } else if (p.transcribe === 'whisper' && dec) {
        try {
          progress(0.6, 'Cihaz içi Whisper hazırlanıyor…');
          segments = await whisperTranscribe(dec.samples, {
            model: p.whisperModel,
            segments: acoustic?.speechSegments,
            onLoad: (v, t) => progress(0.6 + 0.1 * v, t),
            onStatus: (s) => { if (s === 'loading') progress(0.6, 'Whisper modeli yükleniyor…'); if (s === 'fallback') log('Ekran kartı (WebGPU) kullanılamadı; işlemciyle devam ediliyor (daha yavaş).', false); },
            onProgress: (v, t) => progress(0.7 + 0.22 * v, t),
          });
          transcriptText = segmentsToTranscript(segments);
          engine = `whisper:${p.whisperModel}`;
          log(`Whisper: ${segments.length} bölüm yazıya döküldü`);
        } catch (err) {
          txError = err;
          log(`Whisper çalıştırılamadı: ${err.message}`, false);
        }
      }
      progress(0.92, 'Dil çözümlemesi ve kayıt…');
      const session = await saveSession(app, {
        patientId: state.patientId, module: state.module, taskType: state.taskType, taskDetail: state.taskDetail,
        source: p.source, blob: p.blob, fileName: p.fileName, audioInfo: p.audioInfo, acoustic, measures,
        transcriptText, engine, segments, markers: p.markers || [], device: p.device, recordedAt: p.recordedAt,
        onUploadProgress: app.backend.isCloud ? (v) => progress(0.93 + 0.06 * v, `Ses kaydı buluta yükleniyor… %${Math.round(v * 100)}`) : null,
      });
      progress(1, 'Tamamlandı');
      log('Seans kaydedildi');
      app.setGuard(null);
      if (txError) toast(`Seans ve ses kaydı kaydedildi, ancak otomatik yazıya dökme başarısız oldu: ${txError.message} Transkript sekmesinden yeniden deneyebilir ya da elle yazabilirsiniz.`, 'warning', 12000);
      else if (p.transcribe && !segments.length) toast('Seans kaydedildi, ancak kayıtta yazıya dökülecek konuşma bulunamadı. Transkript sekmesinden elle ekleyebilirsiniz.', 'warning', 9000);
      else toast('Seans kaydedildi. Transkripti gözden geçirip "Doğrulandı" olarak işaretleyin.', 'success', 6000);
      app.navigate(`/seans/${session.id}${txError ? '?tab=transcript' : ''}`);
    } catch (err) {
      console.error(err);
      app.setGuard(null);
      log(`Hata: ${err.message || err}`, false);
      label.textContent = 'İşlem tamamlanamadı.';
      mount(extra, h('div.row.mt-3', null, h('button.btn.btn-ghost', { on: { click: () => showSetup() } }, icon('arrowLeft', 16), 'Başa dön')));
    }
  };

  // -------------------------------------------------------------------------
  // Ses dosyası yükleme
  // -------------------------------------------------------------------------
  const showUpload = async () => {
    cleanup();
    const mod = moduleOf(state.module);
    const task = taskOf(state.taskType);
    const patient = await app.repo.patients.get(state.patientId);
    app.setCrumbs([{ label: 'Yeni seans', href: '#/seans/yeni' }, { label: `Ses dosyası · ${patient.code}` }]);
    const caps = sttCapabilities();
    let file = null;
    let info = null;
    const input = h('input', { type: 'file', accept: ACCEPT, hidden: true });
    const dz = h('div.dropzone', { tabindex: '0', role: 'button' },
      h('div.dz-ic', null, icon('upload', 26)),
      h('h3', null, 'Ses dosyasını buraya sürükleyin ya da seçin'),
      h('p', null, 'WAV, MP3, M4A/AAC, FLAC, OGG/Opus, WebM · profesyonel kayıt cihazı dosyaları (24-bit, 48/96 kHz) desteklenir'));
    const fileCard = h('div');
    const when = h('input.input', { type: 'datetime-local' });
    const methodName = 'tx';
    const opt = (val, title, desc, disabled = false, checked = false) => {
      const r = h('input', { type: 'radio', name: methodName, value: val, disabled, checked });
      return h('label.check', { style: { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '12px', opacity: disabled ? 0.55 : 1 } }, r,
        h('div', null, h('b', null, title), h('div.small.muted', null, desc)));
    };
    const defaultTx = !mod.transcript ? 'none' : 'whisper';
    const txOpts = h('div.stack', { style: { gap: '8px' } },
      mod.transcript ? opt('whisper', 'Cihaz içi Whisper (önerilen)', `Ses bilgisayarınızdan çıkmaz; sessiz bölümler atlanır. İlk kullanımda model indirilir ve saklanır. ${hasWebGPU() ? 'Ekran kartı (WebGPU) hızlandırması kullanılır.' : 'Bu tarayıcıda WebGPU yok; işlemciyle çalışır (daha yavaş).'}`, false, defaultTx === 'whisper') : null,
      mod.transcript ? opt('webspeech', 'Chrome konuşma tanıma', caps.fileTranscription ? 'Dosya sessizce, gerçek zamanlı çalınarak yazıya dökülür (5 dk kayıt ≈ 5 dk). Ses Google sunucularında işlenir.' : `${caps.blockedReason || 'Bu tarayıcıda desteklenmiyor.'} Yalnızca güncel Google Chrome'da çalışır.`, !caps.fileTranscription, false) : null,
      mod.transcript ? opt('manual', 'Transkripti ben yazacağım / yapıştıracağım', 'En doğru yöntem: dinleyerek yazın ya da hazır transkripti yapıştırın.', false, defaultTx === 'manual') : null,
      mod.transcript ? opt('file', 'Transkript dosyası yükle', '.txt ya da CLAN/AphasiaBank .cha dosyası') : null,
      opt('none', 'Transkript yok (yalnızca akustik)', mod.transcript ? 'Transkripti daha sonra ekleyebilirsiniz.' : 'Bu modül için önerilen seçenek.', false, defaultTx === 'none'));
    const whisperSel = select(WHISPER_MODELS.map((m) => ({ id: m.id, label: `${m.label} (${m.size})${m.webgpuOnly && !hasWebGPU() ? ' — bu tarayıcıda yok' : ''}` })), defaultWhisperModel(app.orgSettings.transcription?.whisperModel));
    const listen = h('input', { type: 'checkbox' });
    const manualTa = h('textarea.textarea.tx-area', { rows: 10, placeholder: 'Her satıra bir sözce yazın…\nT: Terapist satırları "T:" ile başlar.' });
    const txFile = h('input', { type: 'file', accept: '.txt,.cha,text/plain', hidden: true });
    const txFileBtn = h('button.btn.btn-ghost.btn-sm', { type: 'button', on: { click: () => txFile.click() } }, icon('fileText', 15), 'Dosya seç');
    const txFileName = h('span.small.muted', null, 'Seçilmedi');
    let txFileText = '';
    txFile.addEventListener('change', async () => {
      const f = txFile.files[0];
      if (!f) return;
      const t = await f.text();
      txFileText = /\.cha$/i.test(f.name) || /^@Begin/m.test(t) ? fromChat(t) : t;
      txFileName.textContent = `${f.name} · ${txFileText.split('\n').filter(Boolean).length} satır`;
    });
    const extraBox = h('div.mt-2');
    const current = () => (txOpts.querySelector('input:checked') || {}).value || 'none';
    const drawExtra = () => {
      const v = current();
      if (v === 'whisper') mount(extraBox, field('Whisper modeli', whisperSel, 'Türkçe için "Large v3 Turbo" en doğrudur ancak ilk indirme büyüktür (WebGPU gerekir).'));
      else if (v === 'webspeech') mount(extraBox, h('label.check', null, listen, h('span', null, 'Yazıya dökerken sesi hoparlörden de çal')));
      else if (v === 'manual') mount(extraBox, transcriptToolbar(manualTa), manualTa, transcriptHelp());
      else if (v === 'file') mount(extraBox, h('div.row', null, txFileBtn, txFileName), txFile);
      else mount(extraBox);
    };
    txOpts.addEventListener('change', drawExtra);

    const setFile = async (f) => {
      if (!f) return;
      if (f.size > 1024 * 1024 * 1024) { toast('Dosya çok büyük (1 GB üstü).', 'error'); return; }
      file = f;
      const head = await f.slice(0, 256 * 1024).arrayBuffer();
      info = parseWavHeader(head);
      const url = URL.createObjectURL(f);
      const audio = h('audio', { controls: true, src: url, style: { width: '100%', marginTop: '10px' } });
      audio.addEventListener('loadedmetadata', () => { durEl.textContent = fmtDur(audio.duration); });
      const durEl = h('b', null, '…');
      const lm = new Date(f.lastModified || Date.now());
      when.value = new Date(lm.getTime() - lm.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      mount(fileCard, h('div.card.mt-2', null, h('div.card-body', null,
        h('div.row.between', null, h('div.row', null, h('span.ic.indigo', { style: { width: '40px', height: '40px', borderRadius: '12px', display: 'grid', placeItems: 'center' } }, icon('fileAudio', 20)),
          h('div', null, h('b', null, f.name), h('div.small.muted', null, `${fmtBytes(f.size)} · ${f.type || 'bilinmeyen tür'}`))),
          h('button.btn.btn-text.btn-sm', { type: 'button', on: { click: () => { file = null; mount(fileCard); } } }, icon('x', 14), 'Kaldır')),
        h('div.metric-grid.mt-2', null,
          h('div.metric', null, h('div.m-label', null, 'Süre'), h('div.m-value', null, durEl)),
          h('div.metric', null, h('div.m-label', null, 'Örnekleme hızı'), h('div.m-value', null, info ? `${num(info.sampleRate / 1000, 1)} kHz` : '—')),
          h('div.metric', null, h('div.m-label', null, 'Bit derinliği'), h('div.m-value', null, info ? `${info.bitsPerSample}-bit` : '—')),
          h('div.metric', null, h('div.m-label', null, 'Kanal'), h('div.m-value', null, info ? (info.channels === 1 ? 'Mono' : info.channels === 2 ? 'Stereo' : info.channels) : '—'))),
        audio)));
    };
    input.addEventListener('change', () => setFile(input.files[0]));
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); setFile(e.dataTransfer.files[0]); });

    const go = h('button.btn.btn-primary.btn-lg', null, icon('sparkles', 18), 'Çözümlemeyi başlat');
    go.addEventListener('click', async () => {
      if (!file) { toast('Önce bir ses dosyası seçin.', 'warning'); return; }
      const v = current();
      let transcriptText = '';
      if (v === 'manual') transcriptText = manualTa.value;
      if (v === 'file') { if (!txFileText) { toast('Transkript dosyası seçin.', 'warning'); return; } transcriptText = txFileText; }
      await processAndSave({
        blob: file, fileName: file.name, audioInfo: info ? { sampleRate: info.sampleRate, channels: info.channels, bitsPerSample: info.bitsPerSample, format: `WAV ${info.format}` } : null,
        transcriptText, engine: v === 'manual' ? 'manual' : v === 'file' ? 'imported' : 'none', transcribe: v === 'webspeech' || v === 'whisper' ? v : null,
        whisperModel: whisperSel.value, listen: listen.checked, source: 'upload', recordedAt: when.value ? new Date(when.value).toISOString() : new Date().toISOString(),
      });
    });

    drawExtra();
    mount(root,
      h('div.page-head', null, h('div', null, h('div.eyebrow', null, icon(mod.icon, 14), `${mod.label} · ${task.label}`), h('h1', null, `Ses dosyası — ${patient.code}`),
        h('p', null, 'Dosyanın kendisi ekip veritabanında saklanır; çözümleme tamamen bu bilgisayarda yapılır.'))),
      h('div.grid.grid-main', null,
        h('div.stack', null,
          h('div.card', null, h('div.card-body', null, dz, input, fileCard)),
          h('div.card', null, h('div.card-head', null, h('h2', null, icon('fileText', 18), 'Transkript')), h('div.card-body', null, txOpts, extraBox))),
        h('div.stack', null,
          h('div.card', null, h('div.card-head', null, h('h3', null, icon('calendar', 17), 'Kayıt bilgisi')),
            h('div.card-body', null, field('Kayıt tarihi ve saati', when, 'Varsayılan: dosyanın değiştirilme zamanı.'),
              h('div.prompt-card.mt-2', null, h('div.p-label', null, 'Görev'), h('div.p-text', { style: { fontSize: '14px' } }, task.label), state.taskDetail ? h('div.small.muted', null, state.taskDetail) : null))),
          h('div.callout.info', null, icon('info', 18), h('div', null, h('b', null, 'İpucu: '), 'Profesyonel kayıtlarda en doğru sonuç için mono, 44,1/48 kHz WAV ve kırpılma olmayan (tepe < −3 dBFS) düzey önerilir.')),
          h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn.btn-ghost', { on: { click: () => showSetup() } }, icon('arrowLeft', 16), 'Geri'), go))));
  };

  // -------------------------------------------------------------------------
  // Metin ile analiz
  // -------------------------------------------------------------------------
  const showText = async () => {
    cleanup();
    const mod = moduleOf(state.module);
    const task = taskOf(state.taskType);
    const patient = await app.repo.patients.get(state.patientId);
    app.setCrumbs([{ label: 'Yeni seans', href: '#/seans/yeni' }, { label: `Metin · ${patient.code}` }]);
    await app.lexicon();
    const ta = h('textarea.textarea.tx-area', { rows: 16, placeholder: 'Her satıra bir sözce yazın.\n\nT: Bu resimde neler oluyor?\nAnne bulaşık yıkıyor.\nSu yere taşıyor [/] taşıyor.\nÇocuk ııı kurabiye alıyor.' });
    const when = h('input.input', { type: 'datetime-local', value: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) });
    const preview = h('div.small.muted.mt-1');
    const upd = () => {
      const r = analyzeTranscript(ta.value, app.settings);
      const inc = r.utterances.filter((u) => u.included);
      const w = inc.reduce((s, u) => s + u.wordsIncluded, 0);
      const m = inc.reduce((s, u) => s + u.morphemesIncluded, 0);
      preview.textContent = `${r.utterances.length} sözce (${inc.length} dahil) · ${w} sözcük · MLU-w ${inc.length ? num(w / inc.length) : '—'} · MLU-m ${inc.length ? num(m / inc.length) : '—'}`;
    };
    ta.addEventListener('input', () => { clearTimeout(ta._t); ta._t = setTimeout(upd, 250); });
    const fileIn = h('input', { type: 'file', accept: '.txt,.cha,text/plain', hidden: true });
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0];
      if (!f) return;
      const t = await f.text();
      ta.value = /\.cha$/i.test(f.name) || /^@Begin/m.test(t) ? fromChat(t) : t;
      upd();
    });
    const go = h('button.btn.btn-primary.btn-lg', null, icon('sparkles', 18), 'Çözümle ve kaydet');
    go.addEventListener('click', async () => {
      if (!ta.value.trim()) { toast('Transkript boş.', 'warning'); return; }
      await processAndSave({ blob: null, transcriptText: ta.value, engine: 'manual', source: 'text', recordedAt: new Date(when.value).toISOString() });
    });
    mount(root,
      h('div.page-head', null, h('div', null, h('div.eyebrow', null, icon(mod.icon, 14), `${mod.label} · ${task.label}`), h('h1', null, `Metin ile analiz — ${patient.code}`), h('p', null, 'Transkripti yazın ya da yapıştırın. Kodlama kuralları sağ tarafta.'))),
      h('div.grid.grid-main', null,
        h('div.card', null, h('div.card-body', null,
          h('div.row.between', { style: { marginBottom: '8px' } }, transcriptToolbar(ta), h('button.btn.btn-ghost.btn-sm', { type: 'button', on: { click: () => fileIn.click() } }, icon('upload', 15), '.txt / .cha yükle'), fileIn),
          ta, preview)),
        h('div.stack', null,
          h('div.card', null, h('div.card-body', null, field('Seans tarihi ve saati', when))),
          h('div.card', null, h('div.card-head', null, h('h3', null, icon('book', 17), 'Transkripsiyon kuralları')), h('div.card-body', null, transcriptHelp())),
          h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn.btn-ghost', { on: { click: () => showSetup() } }, icon('arrowLeft', 16), 'Geri'), go))));
    ta.focus();
  };

  // Başlangıç
  if (query.mode && query.patient) {
    if (query.mode === 'live') await showLive();
    else if (query.mode === 'upload') await showUpload();
    else await showSetup();
  } else {
    await showSetup();
  }
  return () => cleanup();
}
