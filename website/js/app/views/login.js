/** Giriş ve kayıt ekranı (yerel ve bulut modu). */
import { h, mount, icon, field, toast, modal } from '../ui/dom.js';
import { login, register, defaultAccountHint, DEFAULT_ACCOUNT, requestPasswordReset } from '../../data/auth.js';
import { brandMark } from '../layout.js';

export async function render(root, { mode = 'login' }, app) {
  if (app.ctx && mode === 'login') { app.navigate('/'); return; }
  const isReg = mode === 'register';
  const cloud = app.backend.isCloud;
  const showHint = !isReg && !cloud && (await defaultAccountHint());

  const art = h('section.auth-art', null,
    h('div.brand', null, h('span.brand-mark', null, brandMark(20)), h('div', null, 'MorphologAI', h('small', { style: { color: 'rgba(255,255,255,.75)' } }, 'Klinik konuşma ve dil analizi'))),
    h('div', null,
      h('h2', null, 'Konuşmayı duyun, dili ölçün.'),
      h('p.lead', null, cloud
        ? 'Dil ve konuşma terapistleri için kayıt, transkripsiyon, biçimbirim çözümlemesi ve klinik ölçütler — ekibinizle ortak, güvenli bir bulut veritabanında.'
        : 'Dil ve konuşma terapistleri için kayıt, transkripsiyon, biçimbirim çözümlemesi ve klinik ölçütler — tek panelde, verileriniz bu cihazda.'),
      h('ul', null,
        ...[
          ['brain', 'Afazi: MLU-m, fiil çekimi, parafazi, tarama göstergesi'],
          ['waves', 'Akıcılık: %SS, takılma türleri, konuşma hızı'],
          ['voice', 'Ses: jitter, shimmer, HNR, CPP, MPT, s/z'],
          ['spectrum', 'Akustik laboratuvar: spektrogram, perde, formant'],
        ].map(([ic, t]) => h('li', null, icon(ic, 18), t)))),
    h('div.demo-card', null,
      h('div', { style: { fontSize: '12.5px', opacity: 0.8 } }, 'Canlı çözümleme örneği'),
      h('div.demo-word', null, h('span', { style: { background: 'transparent', padding: 0 } }, 'hatırlamıyorum →'),
        h('span.r', null, 'hatırla'), h('span', null, '-mı'), h('span', null, '-yor'), h('span', null, '-um')),
      h('div', { style: { fontSize: '12px', opacity: 0.75, marginTop: '8px' } }, 'kök + olumsuzluk + şimdiki zaman + 1. tekil kişi · 4 biçimbirim')));

  const email = h('input.input', { type: 'email', autocomplete: 'username', placeholder: 'ad.soyad@ornek.com', required: true });
  const password = h('input.input', { type: 'password', autocomplete: isReg ? 'new-password' : 'current-password', placeholder: '••••••••', required: true });
  const remember = h('input', { type: 'checkbox', checked: true });
  const name = h('input.input', { placeholder: 'Ad Soyad', autocomplete: 'name' });
  const title = h('input.input', { placeholder: 'ör. Dkt., Uzm. Dkt., Dr.', value: 'Dkt.' });
  const orgName = h('input.input', { placeholder: 'ör. Afazi Tez Çalışması, Hastane DKT Birimi' });
  const submit = h('button.btn.btn-primary.btn-lg', { type: 'submit', style: { width: '100%' } }, isReg ? 'Hesap oluştur' : 'Giriş yap', icon('arrowRight', 18));
  const forgot = cloud && !isReg ? h('a.small', { href: '#', style: { marginLeft: 'auto' } }, 'Parolamı unuttum') : null;
  forgot?.addEventListener('click', (e) => { e.preventDefault(); forgotDialog(email.value); });

  const form = h('form', { novalidate: true },
    isReg ? h('div.form-grid', null, field('Unvan', title), field('Ad Soyad', name)) : null,
    field('E-posta', email),
    field('Parola', password, isReg ? 'En az 8 karakter.' : null),
    isReg ? field('Ekip / çalışma grubu adı (isteğe bağlı)', orgName, 'Boş bırakırsanız adınıza bir ekip oluşturulur. Bir ekip sizi e-postanızla eklediyse otomatik katılırsınız.') : null,
    !isReg ? h('div.row', { style: { marginBottom: '14px' } }, h('label.check', null, remember, h('span', null, 'Beni bu cihazda hatırla')), forgot) : null,
    submit);

  const box = h('div.auth-box');
  const showConfirmation = (addr) => mount(box,
    h('h1', null, 'E-postanızı doğrulayın'),
    h('p.sub', null, h('b', null, addr), ' adresine bir doğrulama bağlantısı gönderdik.'),
    h('div.callout.info', null, icon('info', 18), h('div', null,
      'Bağlantıya tıkladığınızda bu sayfaya dönüp oturumunuz açılır. E-posta birkaç dakika içinde gelmezse gereksiz (spam) klasörüne bakın.')),
    h('a.btn.btn-ghost', { href: '#/giris', style: { marginTop: '18px', width: '100%' } }, icon('arrowLeft', 16), 'Giriş ekranına dön'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      if (isReg) {
        if (!name.value.trim()) throw new Error('Ad soyad girin.');
        const r = await register({ email: email.value, password: password.value, name: name.value, title: title.value, orgName: orgName.value });
        if (r.needsConfirmation) { showConfirmation(r.email || email.value.trim()); return; }
        toast(r.joined ? `Hesabınız oluşturuldu; ${r.joined} ekibe katıldınız.` : 'Hesabınız ve ekibiniz oluşturuldu.', 'success');
      } else {
        await login(email.value, password.value, remember.checked);
      }
      await app.refreshContext();
      app.navigate('/');
    } catch (err) {
      toast(err.message || String(err), 'error', 7000);
    } finally {
      submit.disabled = false;
    }
  });

  const storageNote = cloud
    ? h('div.callout.info', { style: { marginTop: '18px' } }, icon('shield', 18),
      h('div', null, h('b', null, 'Bulut veritabanı bağlı. '), 'Ekip verileri Supabase\'te, yalnızca ekip üyelerinin erişebildiği biçimde saklanır; aynı hesapla her cihazdan çalışabilirsiniz.',
        h('div.tiny.faint', { style: { marginTop: '4px' } }, app.backend.projectHost)))
    : h('div.callout.info', { style: { marginTop: '18px' } }, icon('shield', 18),
      h('div', null, h('b', null, 'Veriler bu cihazda kalır. '), 'Danışan kayıtları tarayıcınızın yerel veritabanında saklanır; düzenli yedek almanız önerilir (Ayarlar → Veri).'));

  mount(box,
    h('h1', null, isReg ? 'Hesap oluşturun' : 'Tekrar hoş geldiniz'),
    h('p.sub', null, isReg ? (cloud ? 'Hesabınız ekibinizin bulut veritabanında oluşturulur.' : 'Hesabınız bu tarayıcıda, yerel veritabanında oluşturulur.') : 'Çalışma panelinize giriş yapın.'),
    form,
    h('p.small.muted', { style: { marginTop: '18px', textAlign: 'center' } },
      isReg ? 'Zaten hesabınız var mı? ' : 'Hesabınız yok mu? ',
      h('a', { href: isReg ? '#/giris' : '#/kayit' }, isReg ? 'Giriş yapın' : 'Kayıt olun')),
    showHint ? h('div.hint-card', null,
      h('div', { style: { fontWeight: 600, marginBottom: '4px', color: 'var(--text)' } }, 'İlk kurulum hesabı'),
      'E-posta: ', h('b', null, DEFAULT_ACCOUNT.email), h('br'),
      'Parola: ', h('b', null, DEFAULT_ACCOUNT.password), h('br'),
      h('span', null, 'Giriş yaptıktan sonra Ayarlar → Profil bölümünden parolanızı değiştirin; bu kutu o zaman kaybolur.'),
      h('button.btn.btn-soft.btn-sm', { type: 'button', style: { marginTop: '10px' }, on: { click: () => { email.value = DEFAULT_ACCOUNT.email; password.value = DEFAULT_ACCOUNT.password; password.focus(); } } }, icon('wand', 14), 'Bilgileri doldur')) : null,
    storageNote,
    h('p.tiny.faint', { style: { marginTop: '16px', textAlign: 'center' } }, h('a', { href: 'index.html' }, '← Tanıtım sayfası'), ' · ', h('a', { href: '#/yontem' }, 'Yöntem')));

  mount(root, h('div.bg-blobs', null, h('span.b1'), h('span.b2'), h('span.b3')), h('div.auth', null, art, h('section.auth-panel', null, box)));
  setTimeout(() => (isReg ? name : email).focus(), 50);
}

function forgotDialog(prefill) {
  const email = h('input.input', { type: 'email', value: prefill || '', placeholder: 'ad.soyad@ornek.com' });
  modal({
    title: 'Parola sıfırlama',
    body: h('div.stack', null, h('p.small.muted', null, 'Hesabınızın e-posta adresini girin; parolanızı yenilemeniz için bir bağlantı gönderelim.'), field('E-posta', email)),
    actions: [
      { label: 'Vazgeç' },
      {
        label: 'Bağlantı gönder', variant: 'btn-primary', icon: 'mail', onClick: async () => {
          await requestPasswordReset(email.value);
          toast('Sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.', 'success', 7000);
          return true;
        },
      },
    ],
  });
}
