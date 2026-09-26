/**
 * CHAT (.cha) dışa aktarımı — CLAN / TalkBank / AphasiaBank ile uyumlu temel biçim.
 * %mor satırı MorphologAI çözümlemesinden basitleştirilmiş olarak üretilir
 * (tür|kök-EK1-EK2). Resmî MOR dilbilgisi yerine geçmez.
 */
const POS_CHAT = { noun: 'n', verb: 'v', adj: 'adj', adv: 'adv', pron: 'pro', det: 'det', conj: 'conj', postp: 'post', num: 'num', interj: 'co', ques: 'qn', neg: 'neg', cop: 'cop', prop: 'n:prop', abbr: 'n', unknown: 'unk' };

function morToken(a) {
  if (!a) return null;
  const tags = a.morphemes.slice(1).filter((m) => m.type === 'infl').map((m) => m.tag.replace(/\./g, '&'));
  return `${POS_CHAT[a.pos] || 'unk'}|${a.root}${tags.length ? '-' + tags.join('-') : ''}`;
}

/**
 * CHAT (.cha) dosyasını MorphologAI transkript biçimine çevirir:
 * *PAR: satırları olduğu gibi, *INV/*EXA satırları "T:" ile; @ ve % satırları atlanır.
 */
export function fromChat(text) {
  const out = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    if (/^[@%]/.test(raw)) { cur = null; continue; }
    if (/^\t/.test(raw) && cur) { cur.text += ' ' + raw.trim(); continue; }
    const m = raw.match(/^\*([A-Z0-9]+):\s*(.*)$/);
    if (!m) continue;
    cur = { spk: m[1], text: m[2] };
    out.push(cur);
  }
  return out.map((u) => {
    let t = u.text.replace(/\u0015\d+_\d+\u0015/g, '').replace(/·\d+_\d+·/g, '').trim();
    t = t.replace(/\s+\+\.\.\.$/, '...');
    const exam = /^(INV|EXA|INT|TER)$/i.test(u.spk);
    return `${exam ? 'T: ' : ''}${t}`;
  }).join('\n');
}

export function toChat(result, { participantId = 'PAR', mediaName = null, corpus = 'MorphologAI', date = null, task = '' } = {}) {
  const L = ['@UTF8', '@Begin', '@Languages:\ttur', `@Participants:\t${participantId} Participant, INV Investigator`,
    `@ID:\ttur|${corpus}|${participantId}|||||Participant|||`, `@ID:\ttur|${corpus}|INV|||||Investigator|||`];
  if (mediaName) L.push(`@Media:\t${mediaName.replace(/\.[^.]+$/, '')}, audio`);
  if (date) L.push(`@Date:\t${new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace(/ /g, '-')}`);
  if (task) L.push(`@G:\t${task}`);
  L.push(`@Comment:\tMorphologAI ${result.engine} ile üretildi; %mor satırı otomatik çözümlemedir.`);
  for (const u of result.utterances) {
    const spk = u.speaker === 'examiner' ? 'INV' : participantId;
    const words = [];
    const mor = [];
    for (const t of u.tokens) {
      if (t.kind === 'word') {
        let w = t.text;
        if (t.reason === 'repetition' || t.reason === 'auto-repetition') w += ' [/]';
        else if (t.reason === 'retrace') w += ' [//]';
        if (t.target) w += ` [: ${t.target}]`;
        if (t.error) w += ` [* ${t.error.code === '*' ? '' : t.error.code}]`.replace(' ]', ']');
        words.push(w);
        if (!t.excluded && u.speaker !== 'examiner') mor.push(morToken(t.a));
      } else if (t.kind === 'filler') words.push(`&-${t.text}`);
      else if (t.kind === 'fragment') words.push(`&+${t.text}`);
      else if (t.kind === 'unintelligible') words.push('xxx');
      else if (t.kind === 'pause') words.push(t.pause || '(.)');
      else if (t.kind === 'event') words.push(`&=${t.text}`);
    }
    const term = u.incomplete ? '+...' : u.question ? '?' : '.';
    let line = `*${spk}:\t${words.join(' ')} ${term}`;
    if (u.start != null) {
      const ms = Math.round(u.start * 1000);
      line += ` \u0015${ms}_${ms + 1000}\u0015`;
    }
    L.push(line);
    if (mor.length) L.push(`%mor:\t${mor.filter(Boolean).join(' ')} ${term}`);
  }
  L.push('@End');
  return L.join('\n') + '\n';
}
