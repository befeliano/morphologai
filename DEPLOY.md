# MorphologAI — Kurulum ve yayına alma

Uygulama statik bir web sitesidir (derleme adımı yok). Vercel yalnızca `website/` klasörünü sunar.
Veriler iki yerden birinde durur:

| Mod | Ne zaman | Veriler nerede |
|---|---|---|
| **Bulut** | `SUPABASE_URL` ve `SUPABASE_ANON_KEY` tanımlıysa | Supabase (Postgres + Storage). Ekip üyeleri her cihazdan ortak çalışır |
| **Yerel** | Supabase ayarı yoksa | Yalnızca o tarayıcının veritabanı (IndexedDB) |

Önerilen: **Bulut modu.** Mac/Safari kullanıcıları için özellikle; Safari, 7 gün açılmayan sitelerin tarayıcı verisini silebilir.

---

## 1. Supabase'i yeni hesabına bağlama

### 1.1 Eski hesaptan çık, yenisiyle gir
1. https://supabase.com/dashboard → sağ üstte profil simgesi → **Sign out**.
2. Supabase'e GitHub ile giriyorsan, GitHub'da da **doğru hesapla** oturum açık olmalı.
   Yoksa Supabase seni yine eski hesaba sokar. Gerekirse önce https://github.com'dan çıkıp doğru hesapla gir.
3. Yeni hesapla giriş yap.

### 1.2 Proje oluştur
1. **New project**.
2. Ayarlar:
   - **Name:** `morphologai`
   - **Database password:** güçlü bir parola (bir yere kaydet)
   - **Region:** *Central EU (Frankfurt)*. Türkiye'ye en yakın bölge; AB veri koruma kapsamında.
3. Proje hazırlanırken 1–2 dakika bekle.

### 1.3 Veritabanını kur (tek seferlik)
1. Sol menü → **SQL Editor** → **New query**.
2. Bu depodaki `supabase/schema.sql` dosyasının **tamamını** yapıştır → **Run**.
3. "Success. No rows returned" görmelisin. Dosya tekrar çalıştırılabilir; mevcut verileri silmez.

Bu adım şunları kurar:
- **Tablolar:** danışan, seans, ses kaydı, akustik, sözlük, ekip, üyelik, işlem günlüğü.
- **Satır düzeyi güvenlik (RLS):** her ekip yalnızca kendi verisini görür. Rol kuralları: gözlemci / klinisyen / yönetici / sahip.
- **`recordings` ses deposu:** gizli, yalnızca ekip üyeleri erişebilir.

### 1.4 Giriş ayarları
**Authentication → Sign In / Providers → Email:**
- *Enable Email provider*: **açık**
- *Confirm email*: **açık** (önerilen). Kullanıcı e-postasını doğrulamadan giremez ve davetler ele geçirilemez.
- *Minimum password length*: **8** ya da üstü

**Authentication → URL Configuration:**
- **Site URL:** `https://SENIN-ADRESIN.vercel.app/app.html`
- **Redirect URLs:** şu iki satırı ekle:
  - `https://SENIN-ADRESIN.vercel.app/**`
  - `http://localhost:5500/**`

> Supabase'in yerleşik e-posta gönderimi saatte birkaç e-postayla sınırlıdır.
> Ekip büyürse **Authentication → Emails → SMTP Settings** bölümünden bir e-posta hizmeti bağla (ör. Resend, Brevo).

### 1.5 Anahtarları al
**Project Settings → API Keys** (ya da *Data API*):
- **Project URL** → `https://xxxx.supabase.co`
- **anon / publishable** anahtar → `eyJ…` ya da `sb_publishable_…`

⚠️ `service_role` / `secret` anahtarını **asla** kullanma. Uygulama bu anahtarı görürse bağlanmayı reddeder.

### 1.6 Yerelde dene
1. Proje kökünde `.env.example` dosyasını `.env.local` adıyla kopyala.
2. İki değeri doldur. `.env.local` git'e gönderilmez.
3. Sunucuyu yeniden başlat:
   ```
   powershell -ExecutionPolicy Bypass -File tools\serve.ps1
   ```
   Açılışta `Supabase: .env.local bulundu -> bulut modu` yazmalı.
4. http://localhost:5500/app.html → giriş ekranında **"Bulut veritabanı bağlı"** kutusu görünür.

---

## 2. GitHub'a gönderme

Bu bilgisayarda `git` kurulu değil. İki yol var:

**A) GitHub Desktop (en kolay)**
1. https://desktop.github.com → kur → GitHub hesabınla giriş yap.
2. *File → Add local repository* → `D:\yedek\MorphologAI`.
   "not a git repository" derse **create a repository**.
3. Sol altta özet: `MorphologAI v5` → **Commit to main**.
4. *Repository → Repository settings → Remote* → `https://github.com/KULLANICI-ADIN/morphologai.git` → **Push origin**.

**B) Git komut satırı**
Önce git'i kur:
```
winget install --id Git.Git -e
```
Sonra proje klasöründe:
```
git init -b main
git add .
git commit -m "MorphologAI v5"
git remote add origin https://github.com/KULLANICI-ADIN/morphologai.git
git push -u origin main
```
GitHub'daki depo README ile oluşturulduysa push reddedilir. O durumda önce şunu çalıştırıp sonra tekrar push et:
```
git pull origin main --allow-unrelated-histories
```

`.gitignore` şunları dışarıda bırakır: `.env.local`, yedek zip, `__pycache__`.

---

## 3. Vercel

1. https://vercel.com → **Add New… → Project** → GitHub'dan `morphologai`.
2. Proje ayarları:
   - **Root Directory:** `website` ← önemli
   - **Framework Preset:** Other
   - **Build / Output:** boş
3. **Environment Variables:** Production, Preview ve Development için ekle:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = anon/publishable anahtar
4. **Deploy.**
   - Panel: `https://…vercel.app/app.html`
   - Tanıtım sayfası: `https://…vercel.app/`

**Vercel'de eski Supabase hesabı bağlıysa** (Marketplace entegrasyonu):
1. Vercel → proje → **Settings → Integrations** (ya da *Storage*) → Supabase → **Remove / Disconnect**.
2. **Settings → Environment Variables**'da eski `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*` ve `POSTGRES_*` değişkenlerini sil.
3. Yukarıdaki iki değişkeni yeni projenin değerleriyle ekle.
4. **Deployments → … → Redeploy.**

Sonraki her `push` otomatik yayına alınır.

---

## 4. İlk kullanım (bulut)

1. Şevval `…/app.html` → **Kayıt olun** → kendi e-postası.
   Ekip adı örneği: "Afazi Tez Çalışması". Boş bırakılırsa "Şevval Şahin Ekibi" olur.
2. Gelen doğrulama e-postasındaki bağlantıya tıklar; uygulamaya dönünce oturum açıktır.
3. **Hocası için:**
   - Şevval: **Ekip ve üyeler → Üye ekle** → hocanın e-postası.
     Rol: *Gözlemci / Araştırmacı* (yalnız görüntüler) ya da *Yönetici*.
   - Kayıt bağlantısı panelde kopyalanıp hocaya iletilir.
   - Hoca aynı e-postayla kayıt olup e-postasını doğrulayınca ekibe **otomatik** katılır.
4. **Daha önce bu tarayıcıda yerel veri girdiysen:** **Ayarlar → Veri ve yedek → Bu tarayıcıdaki yerel veriler → Buluta aktar.**
5. **Mac / Safari:** Safari menüsü → **Dosya → Dock'a Ekle**. Uygulama ayrı bir pencerede açılır.
6. **Yazıya dökme:** **Ayarlar → Kayıt ve transkripsiyon → Modeli indir ve hazırla** ile Whisper modelini bir kez indir.
   Her bilgisayarda bir kez yeterli; sonra beklemeden çalışır.

---

## 5. Testler (yalnız yerel sunucuda)

- `http://localhost:5500/dev/tests.html` — morfoloji motoru (191 test)
- `http://localhost:5500/dev/cloud-test.html` — bulut katmanı (63 test).
  `supabase/schema.sql` tarayıcıda gerçek Postgres'te (PGlite) kurulur; satır düzeyi güvenlik, roller, davet, parçalı ses yükleme, yedek ve silme uçtan uca sınanır.

`dev/` klasörü Vercel'e yüklenmez (`.vercelignore`).

---

## 6. Güvenlik özeti

- **Erişim denetimi:** veritabanında RLS. İstemci kodu değiştirilse bile başka ekibin verisi okunamaz, yazılamaz.
- **Üyelik ve roller:** yalnızca güvenlikli fonksiyonlarla değişir. Kendini ekibe ekleme, rol yükseltme, profil e-postasını değiştirme engellidir.
- **SQL enjeksiyonu:**
  - Tüm sorgular PostgREST üzerinden parametreli çalışır.
  - SQL fonksiyonlarında dinamik SQL yoktur.
  - Yalnızca şema kurulumundaki sabit tablo adları biçimlendirilir.
- **XSS:**
  - Sıkı CSP: satır içi betik yok, izinli kaynaklar sabit.
  - Tüm metinler `textContent` ile basılır; ham HTML ekleme yasaktır.
  - Ses dosyası türleri `audio/*` ile sınırlı (veritabanı kısıtı + depo kuralı).
- **Harici kütüphaneler:** sürümleri sabit; klasik betikler SRI karmasıyla doğrulanır.
- **Dosyalar:**
  - CSV çıktılarında formül enjeksiyonu engellenir.
  - Yedek içe aktarmada her kayıt tür ve boyut denetiminden geçer.
- **Güvenlik başlıkları:** HSTS, X-Frame-Options (DENY), CORP, COOP, sıkı Permissions-Policy.
- **Oturum:**
  - Hareketsizlikte otomatik çıkış (varsayılan 30 dk; Ayarlar → Profil).
  - Yerel girişte kaba kuvvet denemelerine karşı bekleme süresi.
  - Çıkışta indirilen ses önbelleği silinir.
- **Gemini vekili (kapalı):** açılırsa yalnız oturumu doğrulanmış kullanıcıya ve aynı kökenden hizmet verir; anahtar sunucuda kalır.

## 7. KVKK notu

Sağlık verisi özel nitelikli kişisel veridir:
- Danışanlardan **açık rıza** alın.
- Mümkünse ad yerine **kod** kullanın. Ad alanı isteğe bağlıdır; grup analizleri ve CSV çıktıları varsayılan olarak ad içermez.
- Supabase projesini **AB bölgesinde** tutun.
- Araştırmada kullanmadan önce etik kurul onayını ve kurum politikalarını kontrol edin.

## 8. (İleride) Gemini yapay zekâ entegrasyonu

Şu an kapalıdır. Açmak için:
1. Vercel'de şu ortam değişkenlerini ekle:
   - `GEMINI_API_KEY = <anahtar>`
   - `MORPHOLOGAI_AI_ENABLED = true`
2. `website/js/ai/gemini.js` içinde `AI_ENABLED = true` yapıp push et.

Bulut modu ve oturum gerektirir.
