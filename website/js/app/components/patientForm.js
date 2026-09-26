/** Danışan ekleme / düzenleme penceresi. */
import { h, modal, field, select, toast } from '../ui/dom.js';
import { DIAGNOSES, ETIOLOGIES, GROUPS } from '../constants.js';

export async function openPatientForm(app, patient = null) {
  const p = patient || {};
  const code = h('input.input', { value: p.code || (await app.repo.patients.nextCode('D')), placeholder: 'ör. D-001' });
  const fullName = h('input.input', { value: p.fullName || '', placeholder: 'İsteğe bağlı — araştırma çıktılarına yazılmaz', autocomplete: 'off' });
  const birthYear = h('input.input', { type: 'number', min: 1900, max: new Date().getFullYear(), value: p.birthYear || '', placeholder: 'ör. 1961' });
  const sex = select([{ id: '', label: 'Belirtilmedi' }, { id: 'K', label: 'Kadın' }, { id: 'E', label: 'Erkek' }, { id: 'D', label: 'Diğer' }], p.sex || '');
  const education = h('input.input', { type: 'number', min: 0, max: 30, value: p.education ?? '', placeholder: 'yıl' });
  const handed = select([{ id: '', label: 'Belirtilmedi' }, { id: 'sağ', label: 'Sağ' }, { id: 'sol', label: 'Sol' }, { id: 'iki', label: 'İki elli' }], p.handedness || '');
  const group = select(GROUPS, p.group || 'patient');
  const diagnosis = select([{ id: '', label: 'Belirtilmedi' }, ...DIAGNOSES], p.diagnosis || '');
  const etiology = select([{ id: '', label: 'Belirtilmedi' }, ...ETIOLOGIES], p.etiology || '');
  const onset = h('input.input', { type: 'date', value: p.onsetDate || '' });
  const consent = h('input', { type: 'checkbox', checked: !!p.consent });
  const notes = h('textarea.textarea', { rows: 3, placeholder: 'Klinik öykü, eşlik eden durumlar, ilaçlar…' }, p.notes || '');
  group.addEventListener('change', () => { if (group.value === 'control' && !diagnosis.value) diagnosis.value = 'kontrol'; });

  return new Promise((resolve) => {
    let done = false;
    modal({
      title: patient ? `Danışanı düzenle — ${patient.code}` : 'Yeni danışan',
      wide: true,
      body: h('div.stack', null,
        h('div.form-grid', null,
          field('Danışan kodu', code, 'Takma ad / kod — raporlarda ve dışa aktarımda kimlik yerine kullanılır.'),
          field('Ad soyad', fullName),
          field('Doğum yılı', birthYear),
          field('Cinsiyet', sex),
          field('Eğitim süresi (yıl)', education),
          field('El tercihi', handed),
          field('Grup', group, 'Kontrol grubu seansları, ekibinizin norm değerlerini oluşturur.'),
          field('Tanı', diagnosis),
          field('Etiyoloji', etiology),
          field('Başlangıç tarihi (inme / tanı)', onset, 'Başlangıçtan sonraki süre (ay) otomatik hesaplanır.')),
        field('Notlar', notes),
        h('label.check', null, consent, h('span', null, h('b', null, 'Bilgilendirilmiş onam alındı'), h('span.muted', null, ' — ses kaydı ve verilerin araştırma amaçlı kullanımı için')))),
      actions: [
        { label: 'Vazgeç' },
        {
          label: patient ? 'Kaydet' : 'Danışan ekle', variant: 'btn-primary', icon: 'save',
          onClick: async () => {
            const rec = await app.repo.patients.save({
              ...(patient || {}),
              code: code.value.trim(),
              fullName: fullName.value.trim(),
              birthYear: birthYear.value ? Number(birthYear.value) : null,
              sex: sex.value,
              education: education.value !== '' ? Number(education.value) : null,
              handedness: handed.value,
              group: group.value,
              diagnosis: diagnosis.value,
              etiology: etiology.value,
              onsetDate: onset.value || null,
              consent: consent.checked,
              consentAt: consent.checked ? (patient?.consentAt || new Date().toISOString()) : null,
              notes: notes.value.trim(),
            });
            toast(patient ? 'Danışan güncellendi.' : `${rec.code} eklendi.`, 'success');
            app.refreshCounts();
            app.normsCache.clear();
            done = true;
            resolve(rec);
          },
        },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
  });
}
