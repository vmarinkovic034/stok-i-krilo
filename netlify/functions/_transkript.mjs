// ==========================================================================
// ŠTOK I KRILO — transkripcija podkast epizoda (Groq Whisper turbo)
// Transkript se koristi SAMO da bi urednik/model razumeo o čemu se priča.
// Ne čuva se i ne objavljuje. Objavljuje se vest sa pripisivanjem i linkom.
// ==========================================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';
const MAX_MB = 24; // Groq limit je 25 MB po fajlu

export async function transkribuj(audioUrl, apiKey) {
  if (!apiKey) throw new Error('Nedostaje GROQ_API_KEY');

  const res = await fetch(audioUrl, {
    headers: { 'user-agent': 'StokIKriloBot/1.0' },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error('Audio ' + res.status);

  const buf = new Uint8Array(await res.arrayBuffer());
  const mb = buf.byteLength / 1048576;
  if (mb > MAX_MB) {
    // Duže epizode: uzimamo prvih ~24 MB. Kod 64 kbps to je oko 50 minuta,
    // kod 128 kbps oko 25 minuta - dovoljno da se uhvati suština razgovora.
    console.log('Epizoda ' + mb.toFixed(1) + ' MB - sečem na prvih ' + MAX_MB + ' MB');
  }
  const deo = mb > MAX_MB ? buf.slice(0, MAX_MB * 1048576) : buf;

  const fd = new FormData();
  fd.append('file', new Blob([deo], { type: 'audio/mpeg' }), 'epizoda.mp3');
  fd.append('model', MODEL);
  fd.append('response_format', 'text');
  fd.append('temperature', '0');

  const t = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + apiKey },
    body: fd,
    signal: AbortSignal.timeout(240000),
  });
  if (!t.ok) throw new Error('Groq ' + t.status + ': ' + (await t.text()).slice(0, 200));

  const txt = (await t.text()).trim();
  return { tekst: txt, mb: Number(mb.toFixed(1)), skracen: mb > MAX_MB };
}
