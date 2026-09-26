# MorphologAI — web uygulaması

Dil ve konuşma terapistleri için Türkçe konuşma ve dil analiz platformu.
Derleme adımı yoktur: saf HTML + CSS + JavaScript (ES modülleri). Tüm çözümleme tarayıcıda çalışır.
Kurulum, Supabase bağlantısı ve yayına alma: **[../DEPLOY.md](../DEPLOY.md)**.

## Hızlı başlangıç (yerel)

```powershell
powershell -ExecutionPolicy Bypass -File ..\tools\serve.ps1
```

Ardından `http://localhost:5500/app.html`.

- **Supabase ayarı yoksa** yerel mod çalışır. İlk kurulum hesabı: `sevval@morphologai.local` / `Morpholog2026!`.
- **Proje kökünde `.env.local` varsa** (bkz. `.env.example`) bulut modu çalışır.

**Desteklenen tarayıcılar:** Chrome, Edge, Safari 16.4+ (macOS), Firefox, Brave.

| Tarayıcı | Anlık yazıya dökme | Cihaz içi Whisper |
|---|---|---|
| Chrome, Edge | Var | Var (WebGPU varsa hızlı) |
| Safari | Siri/dikte açıksa | Var |
| Brave, Firefox | Yok | Var |

## Klasör yapısı

```
website/
├── index.html · style.css · landing.js   Tanıtım sayfası
├── app.html · assets/app.css              Panel (tek sayfa uygulama, açık/koyu tema)
├── vercel.json                            Güvenlik başlıkları (CSP, HSTS…), önbellek
├── api/config.js                          İstemci yapılandırması (Supabase URL + anon anahtar)
├── api/ai/gemini.js                       Gemini vekili (KAPALI; oturum doğrulamalı)
├── data/lexicon/                          Zemberek-NLP sözlükleri (Apache-2.0)
├── dev/                                   Testler (yayına alınmaz)
└── js/
    ├── app/        Arayüz: main (yönlendirici), layout, views/ (analiz dahil), components/, ui/
    ├── core/
    │   ├── text/     Biçimbirim motoru, bağlam, eş sesliler, transkript ayrıştırıcı
    │   ├── metrics/  Dil, akıcılık, kekemelik, tarama, cohort (grup analizi)
    │   ├── audio/    Çözme, akustik (VAD, F0), DSP, ses raporu, DDK, kayıt
    │   └── stt/      Chrome konuşma tanıma, cihaz içi Whisper
    ├── data/       backend (yerel/bulut seçimi), auth.{local,cloud}, repo.{local,cloud},
    │               roles, backup, typed, mime, audioCache, db (IndexedDB)
    ├── export/     PDF, CSV, CHAT (.cha), TextGrid
    └── workers/    Akustik, Whisper, kayıt işçisi
../supabase/schema.sql   Bulut veritabanı şeması (tablolar, RLS, fonksiyonlar, depo)
```

## Testler

- `/dev/tests.html` — morfoloji ve bağlam motoru (191 test).
- `/dev/cloud-test.html` — bulut katmanı (63 test). `schema.sql` PGlite (tarayıcıda Postgres) üzerinde kurulur; RLS, roller, davet, parçalı yükleme, yedek ve silme sınanır.

## Mimari notlar

- **Altyapıdan bağımsız veri katmanı:** ekranlar yalnızca `data/auth.js` ve `data/repo.js` ile konuşur. Bunlar bulut ya da yerel uygulamaya yönlendirir.
- **Çok kiracılı:** her kayıt `org_id` taşır. Bulutta erişim Postgres RLS ile, yerelde depo katmanında sınırlanır.
- **Ses kayıtları:** bulutta gizli `recordings` kovasında tutulur. 45 MB üstü dosyalar 20 MB'lık parçalarla yüklenir (ücretsiz planda dosya başına 50 MB sınırı). İndirilen sesler tarayıcıda önbelleklenir.
- **Tekrarlanabilirlik:** her seans motor sürümünü (`morphologai-morph@x.y.z`) saklar.
- **Her ses kaydında** akıcılık (duraksama, konuşma oranı) ve F0 ölçülür. Sözcük/dakika için transkript gerekir.
