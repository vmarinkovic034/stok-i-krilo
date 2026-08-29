// ==========================================================================
// ŠTOK I KRILO — vesti iz podkast epizoda
// Transkript je SAMO izvor razumevanja. Objavljuje se vest sa obaveznim
// pripisivanjem (podkast + govornik) i najviše JEDNIM kratkim citatom.
// Nikad prepričavanje cele epizode.
// ==========================================================================
import { fetchAllPodcasts, readJSON, writeJSON, KEY_DRAFTS, KEY_SEEN, CAT_IMG, json } from './_lib.mjs';
import { transkribuj } from './_transkript.mjs';
import { proveri, MARKER } from './_kvalitet.mjs';

const MODEL = 'claude-sonnet-5';
const MESECI = ['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];
const danas = () => { const d = new Date(); return d.getDate() + '. ' + MESECI[d.getMonth()] + ' ' + d.getFullYear(); };

const SISTEM = `Ti si urednik portala ŠTOK I KRILO — industrijskog portala za sektor prozora, vrata, stakla i fasada na Balkanu. Čitalac je vlasnik ili direktor proizvodnje stolarije, 5-80 zaposlenih, Srbija / BiH / Hrvatska / Crna Gora / Severna Makedonija.

Jezik: srpski, latinica, EKAVICA.

Dobijaš TRANSKRIPT podkast epizode. Tvoj zadatak NIJE da prepričaš epizodu. Zadatak je da izvučeš JEDNU tvrdnju ili uvid koji je vest za balkanskog proizvođača, i da o njoj napišeš kratak tekst.

═══ APSOLUTNA PRAVILA ═══
1. OBAVEZNO PRIPISIVANJE. Prvi pasus mora da imenuje podkast i govornika: "Na podkastu [ime], [ime govornika] iz [firma] kaže da..." Ako iz transkripta ne možeš da utvrdiš ko govori, napiši samo ime podkasta — nikad ne izmišljaj ime ili firmu.
2. NAJVIŠE JEDAN kratak direktan citat, do 25 reči, pod navodnicima.
3. NIJEDAN broj koji nije doslovno izgovoren u transkriptu.
4. Ne prepričavaj epizodu redom. Uzmi jednu temu i razvij je.
5. Tekst ima 3-4 pasusa, ne više. Kratko je ovde vrlina — ne pišeš zamenu za epizodu, nego razlog da je čovek posluša.
6. Poslednji pasus počinje tačno sa: ${MARKER}

═══ PASUS "ŠTA OVO ZNAČI ZA BALKAN?" ═══
Konkretna posledica za balkanskog proizvođača + JEDNA radnja u imperativu koju može da uradi ove nedelje.
Zabranjeno: "vredi pratiti", "ostaje da se vidi", "treba se prilagoditi", "važno je pratiti trendove".

═══ KADA PRESKOČITI ═══
Vrati "skip": true ako epizoda nema nijednu tvrdnju upotrebljivu balkanskom proizvođaču — reklama, ćaskanje o karijeri, lokalna tema bez šire poruke, ili loš transkript. Bolje nijedna vest nego prazna.

Stil: kratke rečenice, bez floskula, bez emodžija. Ne koristi: revolucionarno, inovativno, ključno, u današnje vreme, dodata vrednost, sinergija.

Vraćaš ISKLJUČIVO validan JSON niz, bez markdown ograda.`;

const KORISNIK = (ep, transkript) => `PODKAST: ${ep.podcast}
EPIZODA: ${ep.title}
OBJAVLJENO: ${ep.published || 'nepoznato'}
LINK: ${ep.url}
OPIS IZ FEEDA: ${ep.summary || '(nema)'}

TRANSKRIPT (jedini dozvoljeni izvor činjenica):
"""
${transkript.slice(0, 60000)}
"""

Vrati JSON niz sa TAČNO JEDNIM objektom:
[{
  "skip": false,
  "cat": "trziste" | "kompanije" | "proizvodnja" | "tehnologija" | "proizvodi" | "standardi" | "investicije",
  "catLabel": "TRŽIŠTE" | "INDUSTRIJA" | "PROIZVODNJA" | "TEHNOLOGIJA" | "OKOV" | "NOVI PROIZVOD" | "STANDARDI" | "INVESTICIJA" | "OBRAZOVANJE",
  "title": "naslov na srpskom, do 95 znakova, konkretan",
  "desc": "2 rečenice: ko je rekao, šta i gde",
  "body": "3-4 pasusa razdvojena sa \\\\n\\\\n, prvi pasus sadrži pripisivanje, poslednji počinje sa '${MARKER}'",
  "read": "3 min",
  "govornik": "ime i firma ako se jasno čuje, inače prazno"
}]
Za preskakanje: [{"skip": true, "razlog": "..."}]`;

async function claude(content, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SISTEM, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error('Anthropic ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const d = await res.json();
  let t = (d.content || []).map(c => c.text || '').join('').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a < 0 || b < 0) throw new Error('Odgovor nije JSON niz');
  return JSON.parse(t.slice(a, b + 1))[0];
}

// Dodatna provera specifična za podkast vesti
function proveriPodkast(vest, ep, transkript) {
  const p = proveri(vest, transkript);
  const body = String(vest.body || '');

  // Pripisivanje mora da postoji
  if (!body.toLowerCase().includes(ep.podcast.toLowerCase().split(' ')[0].toLowerCase())) {
    p.upozorenja.unshift({ tip: 'pripisivanje', tezina: 'visoka',
      tekst: 'Tekst ne imenuje podkast „' + ep.podcast + '". Pripisivanje je obavezno.' });
  }
  // Najviše jedan citat
  const citati = (body.match(/[„"][^""„]{15,}["""]/g) || []).length;
  if (citati > 1) {
    p.upozorenja.push({ tip: 'citati', tezina: 'srednja',
      tekst: 'Više od jednog direktnog citata (' + citati + '). Dozvoljen je jedan, kratak.' });
  }
  // Dužina - ne sme da bude zamena za epizodu
  if (body.length > 3200) {
    p.upozorenja.push({ tip: 'predugo', tezina: 'srednja',
      tekst: 'Tekst je dug (' + body.length + ' znakova). Vest o epizodi treba da bude kratka, ne prepričavanje.' });
  }

  const visoke = p.upozorenja.filter(u => u.tezina === 'visoka').length;
  const srednje = p.upozorenja.filter(u => u.tezina === 'srednja').length;
  p.ocena = Math.max(0, 100 - visoke * 30 - srednje * 12);
  p.status = visoke ? 'problem' : (srednje ? 'pregledati' : 'cisto');
  return p;
}

export async function generisiIzPodkasta({ maks = 2 } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!apiKey) return json({ error: 'Nedostaje ANTHROPIC_API_KEY' }, 500);
  if (!groqKey) return json({ error: 'Nedostaje GROQ_API_KEY (transkripcija)' }, 500);

  const { all, errors } = await fetchAllPodcasts(2);
  const seen = await readJSON(KEY_SEEN, []);
  const drafts = await readJSON(KEY_DRAFTS, []);
  const postojeci = new Set([...seen, ...drafts.map(d => d.url)]);

  // najnovije prvo
  const novi = all
    .filter(e => e.url && !postojeci.has(e.url))
    .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0))
    .slice(0, maks);

  if (!novi.length) return json({ ok: true, poruka: 'Nema novih epizoda.', epizoda: all.length, greske: errors });

  const now = new Date().toISOString();
  const dodati = [];
  const preskoceni = [];

  for (const ep of novi) {
    try {
      const { tekst, mb, skracen } = await transkribuj(ep.audio, groqKey);
      if (!tekst || tekst.length < 500) {
        preskoceni.push(ep.title + ' (transkript prekratak)');
        seen.push(ep.url);
        continue;
      }
      const w = await claude(KORISNIK(ep, tekst), apiKey);
      seen.push(ep.url);
      if (!w || w.skip || !w.title || !w.body) {
        preskoceni.push(ep.title + (w && w.razlog ? ' - ' + w.razlog : ''));
        continue;
      }
      dodati.push({
        id: 'p' + Date.now().toString(36) + dodati.length,
        status: 'nacrt', tip: 'podkast', createdAt: now,
        cat: w.cat || 'trziste',
        catLabel: w.catLabel || 'PODKAST',
        date: danas(),
        title: w.title,
        desc: w.desc || '',
        body: w.body,
        read: w.read || '3 min',
        source: ep.podcast,
        url: ep.url,
        img: CAT_IMG[w.cat] || CAT_IMG.trziste,
        epizoda: ep.title,
        govornik: w.govornik || '',
        transkriptMB: mb,
        transkriptSkracen: skracen,
        provera: proveriPodkast(w, ep, tekst),
      });
    } catch (e) {
      console.log('podkast greska [' + ep.title + ']: ' + e.message);
      errors.push(ep.podcast + ': ' + e.message);
    }
  }

  await writeJSON(KEY_DRAFTS, [...dodati, ...drafts].slice(0, 100));
  await writeJSON(KEY_SEEN, seen.slice(-800));

  return json({
    ok: true, epizoda: all.length, obradjeno: novi.length,
    nacrta: dodati.length, preskoceno: preskoceni, greske: errors,
    pregled: dodati.map(d => ({ naslov: d.title, podkast: d.source, ocena: d.provera.ocena, status: d.provera.status })),
  });
}
