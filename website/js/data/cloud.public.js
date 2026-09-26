/**
 * Ekibin Supabase projesi — yerleşik (varsayılan) bağlantı.
 *
 * Buradaki anahtar "anon" (herkese açık) anahtardır: her Supabase istemcisinde tarayıcıya
 * zaten gönderilir ve tek başına hiçbir veriye erişim sağlamaz. Erişim, veritabanındaki
 * satır düzeyi güvenlik kurallarıyla (supabase/schema.sql) yalnız ekip üyelerine sınırlıdır.
 * ASLA service_role / secret anahtar yazmayın.
 *
 * Öncelik: /api/config (Vercel ortam değişkenleri ya da yerel .env.local) → bu dosya.
 * Yerel moda (yalnız bu tarayıcı) dönmek için url'yi boş bırakın.
 */
export const PUBLIC_CLOUD = {
  url: 'https://dmofnasuppfghikfgfph.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtb2ZuYXN1cHBmZ2hpa2ZnZnBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNzA5MDYsImV4cCI6MjEwNTk0NjkwNn0.PCVxzEaTJD6OFzX0GMGWv5OtN7wy47Y6qCcisjRa6-w',
  // Kapalı (davetle) kullanım: kayıt ekranı gösterilmez; hesaplar Supabase panelinden açılır
  // (Authentication → Users → Add user). Supabase'de de "Allow new users to sign up" kapatılmalı.
  // Vercel'de MORPHOLOGAI_ALLOW_SIGNUP=true tanımlanırsa kayıt yeniden açılır.
  allowSignup: false,
};
