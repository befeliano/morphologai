/**
 * Konuşmacı ayrımı (terapist / danışan) — otomatik transkript bölümleri için.
 *
 * Üç kanıt birleştirilir; her bölümün etiketi ve kaynağı saklanır, klinisyen tek tıkla düzeltir:
 *  1. Tuş  : canlı kayıtta terapist "konuşuyorum" tuşunu basılı tuttuğu aralıklar (kesin).
 *  2. Metin: terapist yönergeleri ("anlatır mısınız", "neler görüyorsunuz", "başka ne var"),
 *            "-sınız/-siniz" hitaplı sorular (güçlü); yalnız onay sözcüğünden oluşan sözceler
 *            ("tamam", "evet", "hıhı", "sonra") (zayıf); birinci tekil kişi ("bilmiyorum") → danışan.
 *  3. Ses perdesi: bölümlerin F0 ortancası yarım ton ölçeğinde iki kümeye ayrılır; kümeler arası
 *            fark ≥ 3,5 yarım tonsa ve metin ipuçları hangi kümenin terapist olduğunu gösteriyorsa,
 *            ipucu olmayan bölümler ses perdesine göre etiketlenir.
 * Düzgün cümle kurmak ölçüt DEĞİLDİR: danışanın iyi sözcelerini terapiste atamak bozukluğu
 * olduğundan ağır gösterirdi.
 */

const THERAPIST_PROMPTS = [
  /anlat[ıi]r\s*m[ıi]s[ıi]n[ıi]z/i, /anlatabilir\s*m[iı]s[iı]n[iı]z/i, /\banlat[ıi]n\b/i, /\banlatır\s*mısın\b/i,
  /\bneler?\s+(görüyorsunuz|var|oluyor|yapıyorlar|yapıyor)\b/i, /\bne\s+(görüyorsunuz|oluyor|yapıyorlar)\b/i,
  /\bbaşka\s+(ne|neler|bir\s+şey|kim|kimler)\b/i, /\bkimler\s+var\b/i, /\bburadan\s+başla/i, /\bbaştan\s+başla/i,
  /\bdevam\s+ed(in|elim|iniz|ebilirsiniz)\b/i, /\bbiraz\s+daha\b/i, /\bsöyler\s+misiniz\b/i, /\bgösterir\s+misiniz\b/i,
  /\bresim(de|deki)\s+.*\?$/i, /\bbaşka\s*\?$/i, /\bbitirdiniz\s+mi\b/i, /\bhazır\s+mısınız\b/i,
];
// "-sınız/-siniz/-sunuz/-sünüz" hitaplı soru (terapist danışana saygı hitabıyla sorar)
const SECOND_PERSON_Q = /\b[\p{L}]+(s[ıiuü]n[ıiuü]z)\b.*\?\s*$/u;
const BACKCHANNEL = new Set(('tamam evet hı hıhı hıh hıı hım hmm hm he hee aynen tabii tabi peki güzel çok iyi süper harika '
  + 'anladım şimdi sonra devam olur ee eee ıhı mhm doğru bravo evet evet').split(/\s+/));
// Not: JS'de \b Türkçe harfleri (ı, ş, ğ…) sözcük karakteri saymaz; sınır için harf olmayan karakter aranır
const FIRST_PERSON = /[\p{L}]+(ıyorum|iyorum|uyorum|üyorum|amıyorum|emiyorum|madım|medim|dım|dim|dum|düm|tım|tim|tum|tüm|acağım|eceğim|ırım|irim|urum|ürüm)(?![\p{L}])/iu;

const words = (t) => t.toLocaleLowerCase('tr-TR').replace(/[.,!?…;:"'()]/g, ' ').split(/\s+/).filter(Boolean);

/** Metin ipucu: { speaker, strength: 'strong'|'weak'|null } */
export function textCue(text) {
  const t = String(text || '').trim();
  if (!t) return { speaker: null, strength: null };
  if (THERAPIST_PROMPTS.some((re) => re.test(t)) || SECOND_PERSON_Q.test(t)) return { speaker: 'examiner', strength: 'strong' };
  const w = words(t);
  if (w.length && w.length <= 4 && w.every((x) => BACKCHANNEL.has(x))) return { speaker: 'examiner', strength: 'weak' };
  if (FIRST_PERSON.test(t)) return { speaker: 'participant', strength: 'strong' };
  return { speaker: null, strength: null };
}

/** Bir bölümü cümlelere ayırır; zaman damgaları karakter uzunluğuna göre paylaştırılır. */
export function splitSentences(seg) {
  const parts = (String(seg.text || '').match(/[^.?!…]+[.?!…]*\s*/g) || []).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1 || seg.start == null || seg.end == null) return [{ ...seg }];
  const total = parts.reduce((s, p) => s + p.length, 0);
  let t = seg.start;
  return parts.map((p) => {
    const d = ((seg.end - seg.start) * p.length) / total;
    const out = { ...seg, text: p, start: Number(t.toFixed(2)), end: Number((t + d).toFixed(2)) };
    t += d;
    return out;
  });
}

const st = (hz) => 12 * Math.log2(hz / 100);

function segmentPitch(seg, track) {
  if (!track || !track.t || !track.hz || seg.start == null || seg.end == null) return null;
  const v = [];
  for (let i = 0; i < track.t.length; i++) {
    const t = track.t[i];
    if (t >= seg.start && t <= seg.end && track.hz[i] > 0) v.push(track.hz[i]);
  }
  if (v.length < 3) return null;
  v.sort((a, b) => a - b);
  return st(v[Math.floor(v.length / 2)]);
}

/** Tek boyutlu 2-ortalama kümeleme. */
function twoMeans(values) {
  let c1 = Math.min(...values);
  let c2 = Math.max(...values);
  let assign = [];
  for (let it = 0; it < 30; it++) {
    assign = values.map((v) => (Math.abs(v - c1) <= Math.abs(v - c2) ? 0 : 1));
    const a = values.filter((_, i) => assign[i] === 0);
    const b = values.filter((_, i) => assign[i] === 1);
    if (!a.length || !b.length) break;
    const n1 = a.reduce((s, x) => s + x, 0) / a.length;
    const n2 = b.reduce((s, x) => s + x, 0) / b.length;
    if (Math.abs(n1 - c1) < 1e-6 && Math.abs(n2 - c2) < 1e-6) break;
    c1 = n1; c2 = n2;
  }
  return { centers: [c1, c2], assign };
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/**
 * @param {Array<{text,start,end}>} segments  otomatik transkript bölümleri
 * @param {{f0Track?:{t:number[],hz:number[]}, therapistIntervals?:Array<[number,number]>}} o
 * @returns {{segments:Array, summary:{examiner:number, participant:number, bySource:object, pitch:object|null}}}
 */
export function labelSpeakers(segments, o = {}) {
  const intervals = o.therapistIntervals || [];
  const segs = segments.flatMap(splitSentences).map((s) => ({ ...s, cue: textCue(s.text), pitch: segmentPitch(s, o.f0Track) }));

  // Ses perdesi kümeleri
  let pitch = null;
  const withPitch = segs.filter((s) => s.pitch != null);
  if (withPitch.length >= 4) {
    const { centers, assign } = twoMeans(withPitch.map((s) => s.pitch));
    const sizes = [assign.filter((a) => a === 0).length, assign.filter((a) => a === 1).length];
    const sep = Math.abs(centers[1] - centers[0]);
    if (sep >= 3.5 && Math.min(...sizes) >= 2) {
      withPitch.forEach((s, i) => { s.cluster = assign[i]; });
      // Hangi küme terapist? Metin ipuçlarıyla (güçlü = 2, zayıf = 1 oy)
      const votes = [0, 0];
      for (const s of withPitch) {
        if (!s.cue.speaker) continue;
        const w = s.cue.strength === 'strong' ? 2 : 1;
        votes[s.cluster] += s.cue.speaker === 'examiner' ? w : -w;
      }
      if (votes[0] !== votes[1] && Math.max(Math.abs(votes[0]), Math.abs(votes[1])) >= 2) {
        const therapistCluster = votes[0] > votes[1] ? 0 : 1;
        pitch = {
          separationSt: Number(sep.toFixed(1)),
          therapistHz: Math.round(100 * 2 ** (centers[therapistCluster] / 12)),
          participantHz: Math.round(100 * 2 ** (centers[1 - therapistCluster] / 12)),
          therapistCluster,
        };
        // İki kümenin ortasına yakın bölümler belirsiz sayılır (ses perdesi kanıtı kullanılmaz)
        const cT = centers[therapistCluster];
        const cP = centers[1 - therapistCluster];
        for (const s of withPitch) {
          const margin = Math.abs(s.pitch - cP) - Math.abs(s.pitch - cT);
          if (Math.abs(margin) < Math.max(1.2, sep * 0.25)) s.cluster = null;
        }
      }
    }
  }

  const bySource = { button: 0, text: 0, pitch: 0, default: 0 };
  const out = segs.map((s) => {
    let speaker = 'participant';
    let source = 'default';
    const dur = s.start != null && s.end != null ? Math.max(0.01, s.end - s.start) : 0;
    const pressed = dur ? intervals.reduce((acc, [a, b]) => acc + overlap(s.start, s.end, a, b), 0) / dur : 0;
    if (pressed >= 0.5) { speaker = 'examiner'; source = 'button'; }
    else if (s.cue.strength === 'strong') { speaker = s.cue.speaker; source = 'text'; }
    else if (pitch && s.cluster != null) { speaker = s.cluster === pitch.therapistCluster ? 'examiner' : 'participant'; source = 'pitch'; }
    else if (s.cue.strength === 'weak') { speaker = s.cue.speaker; source = 'text'; }
    bySource[source]++;
    const { cue: _c, pitch: _p, cluster: _k, ...rest } = s;
    return { ...rest, speaker, speakerSource: source };
  });
  return {
    segments: out,
    summary: {
      examiner: out.filter((s) => s.speaker === 'examiner').length,
      participant: out.filter((s) => s.speaker === 'participant').length,
      bySource,
      pitch,
    },
  };
}
