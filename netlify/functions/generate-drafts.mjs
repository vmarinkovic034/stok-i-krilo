// ==========================================================================
// ŠTOK I KRILO — dnevno povlačenje izvora + pisanje nacrta (Claude)
// Pokreće se automatski svakog radnog dana u 05:00 UTC.
// Ručno: GET /.netlify/functions/generate-drafts?token=ADMIN_TOKEN
// Nacrti NE idu na sajt dok ih urednik ne odobri na /admin.html
// ==========================================================================
import { fetchAll, readJSON, writeJSON, KEY_DRAFTS, KEY_SEEN, CAT_IMG, json } from './_lib.mjs';

const MODEL = 'claude-sonnet-5';
const MAX_NOVIH = 5;

const MESECI = ['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];
const danas = () => { const d = new Date(); return d.getDate() + '. ' + MESECI[d.getMonth()] + ' ' + d.getFullYear(); };

const SISTEM = `Ti si urednik portala ŠTOK I KRILO — industrijskog informacionog portala za sektor prozora, vrata, stakla i fasada na Balkanu. Izdavač je GP GALAXY iz Kragujevca. Čitaoci su vlasnici i direktori proizvodnje stolarije (5-80 zaposlenih), distributeri sistema, monteri i arhitekte u Srbiji, BiH, Hrvatskoj, Crnoj Gori i Severnoj Makedoniji.

Pišeš na srpskom, latinicom, ekavicom. Nikad ijekavica.

STIL:
- jasno, praktično, bez marketinških floskula i motivacionih fraza
- kratke rečenice, konkretni brojevi
- pišeš kao čovek iz fabrike, ne kao novinar koji prepričava saopštenje
- bez emodžija, bez uzvičnika, bez "revolucionarno", "inovativno rešenje", "u današnje vreme"

PRAVILA:
1. NIKAD ne izmišljaj brojeve, imena, datume ni citate. Koristi samo ono što piše u izvoru.
2. Ako izvor ne daje podatak, ne pominji ga.
3. Ne prevodi doslovno — prepiši za balkanskog čitaoca.
4. Svaki tekst se ZAVRŠAVA pasusom koji počinje redom "- Šta ovo znači za Balkan? -" i sadrži konkretnu poslovnu implikaciju i jednu akciju koju čitalac može da uradi ove nedelje. Ne uopštenu konstataciju.
5. Ako vest nema nikakvu vezu s balkanskim proizvođačem (npr. lokalni UK događaj bez šire poruke), vrati je sa "skip": true.

Vraćaš ISKLJUČIVO validan JSON, bez markdown ograda.`;

const KORISNIK = (items) => `Za svaku stavku ispod napiši vest za portal.

IZVORNE STAVKE:
${JSON.stringify(items, null, 1)}

Vrati JSON niz. Za svaku stavku objekat:
{
  "skip": false,
  "cat": "trziste" | "kompanije" | "proizvodnja" | "tehnologija" | "proizvodi" | "standardi" | "investicije",
  "catLabel": "TRŽIŠTE" | "INDUSTRIJA" | "PROIZVODNJA" | "TEHNOLOGIJA" | "OKOV" | "NOVI PROIZVOD" | "STANDARDI" | "INVESTICIJA" | "REGULATIVA" | "OBRAZOVANJE",
  "title": "naslov na srpskom, konkretan, do 95 znakova",
  "desc": "2-3 rečenice: ko, šta, gde, kada, zašto",
  "body": "pun tekst, 3-6 pasusa razdvojenih sa \\\\n\\\\n, ZAVRŠAVA se pasusom '- Šta ovo znači za Balkan? -'",
  "read": "3 min"
}

Ako stavku treba preskočiti: {"skip": true, "razlog": "kratko zašto"}.
Redosled izlaza mora odgovarati redosledu ulaza.`;

async function pisi(items, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SISTEM,
      messages: [{ role: 'user', content: KORISNIK(items) }],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error('Anthropic API ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  let txt = (data.content || []).map(c => c.text || '').join('').trim();
  txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = txt.indexOf('['), b = txt.lastIndexOf(']');
  if (a < 0 || b < 0) throw new Error('Odgovor nije JSON niz');
  return JSON.parse(txt.slice(a, b + 1));
}

export default async (req) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const admin = process.env.ADMIN_TOKEN;

  // Ručno pokretanje traži token; scheduled poziv nema query string.
  const url = new URL(req.url);
  const manual = url.searchParams.has('token');
  if (manual && (!admin || url.searchParams.get('token') !== admin)) {
    return json({ error: 'Neispravan token' }, 401);
  }
  if (!apiKey) return json({ error: 'Nedostaje ANTHROPIC_API_KEY u Netlify env varijablama' }, 500);

  const { all, errors } = await fetchAll(4);
  const seen = await readJSON(KEY_SEEN, []);
  const drafts = await readJSON(KEY_DRAFTS, []);
  const postojeci = new Set([...seen, ...drafts.map(d => d.url)]);

  const novi = all.filter(x => x.url && !postojeci.has(x.url)).slice(0, MAX_NOVIH);
  if (!novi.length) {
    return json({ ok: true, poruka: 'Nema novih vesti u izvorima.', povuceno: all.length, greske: errors });
  }

  const ulaz = novi.map(n => ({
    source: n.source, lang: n.lang, title: n.title, url: n.url,
    published: n.published || '', text: (n.excerpt || n.summary || '').slice(0, 2500),
  }));

  let napisano;
  try { napisano = await pisi(ulaz, apiKey); }
  catch (e) { return json({ error: 'Pisanje nije uspelo: ' + e.message, povuceno: all.length, greske: errors }, 502); }

  const now = new Date().toISOString();
  const dodati = [];
  napisano.forEach((w, i) => {
    const src = novi[i];
    if (!src) return;
    if (w && w.skip) { seen.push(src.url); return; }
    if (!w || !w.title || !w.body) return;
    dodati.push({
      id: 'd' + Date.now().toString(36) + i,
      status: 'nacrt',
      createdAt: now,
      cat: w.cat || 'trziste',
      catLabel: w.catLabel || 'TRŽIŠTE',
      date: danas(),
      title: w.title,
      desc: w.desc || '',
      body: w.body,
      read: w.read || '3 min',
      source: src.source,
      url: src.url,
      img: CAT_IMG[w.cat] || CAT_IMG.trziste,
    });
    seen.push(src.url);
  });

  await writeJSON(KEY_DRAFTS, [...dodati, ...drafts].slice(0, 100));
  await writeJSON(KEY_SEEN, seen.slice(-800));

  return json({
    ok: true, povuceno: all.length, novih: novi.length,
    nacrta: dodati.length, preskoceno: novi.length - dodati.length,
    greske: errors,
    naslovi: dodati.map(d => d.title),
  });
};

// Svakog radnog dana u 05:00 UTC (07:00 po lokalnom vremenu leti)
export const config = { schedule: '0 5 * * 1-5' };
