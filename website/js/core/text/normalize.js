/**
 * Türkçe metin normalizasyonu ve ses bilgisi yardımcıları.
 *
 * Not: JavaScript'in varsayılan toLowerCase() fonksiyonu Türkçe'de yanlıştır
 * ("I" → "i" yapar, doğrusu "ı"). Bu yüzden her yerde tr-TR yerel ayarı kullanılır.
 */

export const VOWELS = new Set('aeıioöuüâîû');
const BACK = new Set('aıouâû');
const VOICELESS = new Set('çfhkpsşt'); // "fıstıkçı şahap"

export const isVowel = (ch) => VOWELS.has(ch);
export const isVoiceless = (ch) => VOICELESS.has(ch);

/** Türkçe küçük harfe çevirir; birleşik nokta (U+0307) artıklarını temizler. */
export function trLower(s) {
  return String(s ?? '').normalize('NFC').toLocaleLowerCase('tr-TR').replace(/̇/g, '');
}

/** Düzeltme işaretlerini (â, î, û) sözlük araması için sadeleştirir. */
export function stripCircumflex(s) {
  return s.replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u');
}

/** Sözlük/analiz anahtarı: küçük harf + düzeltme işaretsiz + tipografik kesme işareti → ' */
export function normKey(s) {
  return stripCircumflex(trLower(s)).replace(/[’‘`´]/g, "'");
}

export function lastVowel(s) {
  for (let i = s.length - 1; i >= 0; i--) if (VOWELS.has(s[i])) return s[i];
  return null;
}

export function vowelCount(s) {
  let n = 0;
  for (const ch of s) if (VOWELS.has(ch)) n++;
  return n;
}

/** Türkçe yazımda her ünlü bir hecedir. */
export const syllableCount = (word) => vowelCount(trLower(word));

/** İki yönlü (a/e) büyük ünlü uyumu. */
export function harmA(v) {
  return v && BACK.has(v) ? 'a' : 'e';
}

/** Dört yönlü (ı/i/u/ü) ünlü uyumu. */
export function harmI(v) {
  switch (v) {
    case 'a': case 'ı': case 'â': return 'ı';
    case 'o': case 'u': case 'û': return 'u';
    case 'ö': case 'ü': return 'ü';
    default: return 'i';
  }
}

/** Ters ünlü uyumlu kökler için (saat → saati): ünlüyü ince karşılığına çevirir. */
export function frontOf(v) {
  return { a: 'e', ı: 'i', o: 'ö', u: 'ü', â: 'e', û: 'ü' }[v] || v;
}

/**
 * Ünsüz yumuşaması (kitap → kitabı). Kelime sonundaki p/ç/t/k/g ünlüyle
 * başlayan ek aldığında b/c/d/ğ(g)'ye döner; "-nk" ile bitenlerde k → g (renk → rengi).
 */
export function voiceFinal(stem) {
  const last = stem[stem.length - 1];
  const prev = stem[stem.length - 2];
  switch (last) {
    case 'p': return stem.slice(0, -1) + 'b';
    case 'ç': return stem.slice(0, -1) + 'c';
    case 't': return stem.slice(0, -1) + 'd';
    case 'k': return stem.slice(0, -1) + (prev === 'n' ? 'g' : 'ğ');
    case 'g': return stem.slice(0, -1) + 'ğ';
    default: return null;
  }
}
