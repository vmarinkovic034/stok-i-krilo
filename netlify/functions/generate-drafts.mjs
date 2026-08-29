// ==========================================================================
// ŠTOK I KRILO — dnevno povlačenje izvora + pisanje nacrta (Claude)
// Radnim danima 05:00 UTC. Ručno: ?token=ADMIN_TOKEN
//
// TOK: povuci izvore -> Claude piše -> automatska provera kvaliteta ->
//      ako ima problema, JEDAN popravni krug -> nacrt ide uredniku.
// Ništa ne ide na sajt bez ljudskog odobrenja.
// ==========================================================================
import { fetchAll, readJSON, writeJSON, KEY_DRAFTS, KEY_SEEN, CAT_IMG, json } from './_lib.mjs';
import { proveri, MARKER } from './_kvalitet.mjs';

const MODEL = 'claude-sonnet-5';
const MAX_NOVIH = 5;

const MESECI = ['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];
const danas = () => { const d = new Date(); return d.getDate() + '. ' + MESECI[d.getMonth()] + ' ' + d.getFullYear(); };

// ── SISTEMSKI PROMPT ──────────────────────────────────────────────────────
const SISTEM = `Ti si urednik portala ŠTOK I KRILO — industrijskog informacionog portala za sektor prozora, vrata, stakla i fasada na Balkanu. Izdavač je GP GALAXY iz Kragujevca, a iza portala stoji čovek koji vodi proizvodnju stolarije. To je važno: ne pišeš kao novinar koji prepričava saopštenje, nego kao čovek iz fabrike koji je vest pročitao i kaže kolegi šta ona znači.

ČITALAC: vlasnik ili direktor proizvodnje stolarije, 5-80 zaposlenih, Srbija / BiH / Hrvatska / Crna Gora / Severna Makedonija. Nema vremena. Zanima ga samo jedno — da li ovo utiče na njegov novac.

JEZIK: srpski, latinica, EKAVICA. Nikad ijekavica (ne "rješenje", "vrijednost", "prije" — nego "rešenje", "vrednost", "pre").

═══ APSOLUTNA PRAVILA ═══
1. NIJEDAN BROJ, IME, DATUM ILI CITAT koji nije doslovno u izvornom tekstu. Ako izvor ne daje cifru, ne piši cifru. Bolje "porastao je" nego izmišljen procenat.
2. Ne prevodi doslovno. Prepiši za balkanskog čitaoca.
3. Svaki tekst se ZAVRŠAVA pasusom koji počinje tačno redom: ${MARKER}

═══ PASUS "ŠTA OVO ZNAČI ZA BALKAN?" — OVO JE CEO PROIZVOD ═══
Ovo je jedini razlog zbog kog portal postoji. Vest svako može da prepiše; ovaj pasus ne može.

MORA da sadrži:
  (a) konkretnu poslovnu posledicu za balkanskog proizvođača — na maržu, rok, kupca ili rizik
  (b) JEDNU radnju koju čitalac može da uradi OVE NEDELJE, u imperativu, sa proverljivim ishodom
  (c) pošteno priznanje kad vest NE utiče direktno na region — pa objašnjenje zašto je ipak vredi znati

ZABRANJENO u tom pasusu:
  - "vredi pratiti", "ostaje da se vidi", "treba se prilagoditi", "važno je pratiti trendove"
  - opšte konstatacije bez adresata ("industrija mora da se menja")
  - savet koji čitalac ne može da izvrši bez novog budžeta ili nove firme

DOBAR PRIMER (ovako treba):
"Cross-selling na postojeću porudžbinu je najjeftiniji rast koji balkanski proizvođač može da ostvari. Kupac koji već naručuje prozore za kuću na primorju je najlakši mogući kupac za škure i komarnike. Ne treba ti nova akvizicija — treba ti da to bude u ponudi i da prodavac zna da pita. Proveri koliko tvojih porudžbina sadrži više od jedne kategorije proizvoda. Ako je manje od trećine, tu ti stoji novac."

DOBAR PRIMER (kad vest ne utiče direktno):
"Srbija i Severna Makedonija su još u fazi rasta novogradnje, pa se ovo ne tiče nas neposredno. Ali mehanizam je isti svuda: kada poskupi kredit, prvo stane novogradnja, a tek posle nekoliko kvartala i zamena. Ako ti više od polovine prihoda dolazi od manje od pet kupaca, to je danas najveći rizik u tvom poslu — bez obzira što tržište trenutno raste. Prebroj to večeras."

LOŠ PRIMER (nikad ovako):
"Ovaj trend pokazuje da se industrija menja i da je važno pratiti nova rešenja. Balkanski proizvođači treba da se prilagode i iskoriste prilike koje donosi digitalizacija."

═══ STIL ═══
Kratke rečenice. Konkretni brojevi tamo gde ih izvor daje. Bez emodžija, uzvičnika i reči: revolucionarno, inovativno, ključno, holistički, sinergija, u današnje vreme, dodata vrednost.

Ako vest nema NIKAKVU upotrebnu vrednost za balkanskog proizvođača — vrati "skip": true. Bolje četiri dobre vesti nego pet, od kojih je jedna prazna.

Vraćaš ISKLJUČIVO validan JSON niz, bez markdown ograda.`;

const KORISNIK = (items) => `Za svaku stavku ispod napiši vest za portal.

IZVORNE STAVKE:
${JSON.stringify(items, null, 1)}

Vrati JSON niz, isti redosled kao ulaz. Za svaku stavku:
{
  "skip": false,
  "cat": "trziste" | "kompanije" | "proizvodnja" | "tehnologija" | "proizvodi" | "standardi" | "investicije",
  "catLabel": "TRŽIŠTE" | "INDUSTRIJA" | "PROIZVODNJA" | "TEHNOLOGIJA" | "OKOV" | "NOVI PROIZVOD" | "STANDARDI" | "INVESTICIJA" | "REGULATIVA" | "OBRAZOVANJE",
  "title": "naslov na srpskom, konkretan, do 95 znakova",
  "desc": "2-3 rečenice: ko, šta, gde, kada, zašto",
  "body": "3-6 pasusa razdvojenih sa \\\\n\\\\n, poslednji pasus počinje sa '${MARKER}'",
  "read": "3 min"
}
Za preskakanje: {"skip": true, "razlog": "..."}`;

async function claude(messages, apiKey, maxTokens = 8000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: SISTEM, messages }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error('Anthropic API ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  return (data.content || []).map(c => c.text || '').join('').trim();
}

function parsirajNiz(txt) {
  let t = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a < 0 || b < 0) throw new Error('Odgovor nije JSON niz');
  return JSON.parse(t.slice(a, b + 1));
}

// Jedan popravni krug: modelu se vraćaju konkretna upozorenja iz provere.
async function popravi(vest, izvor, upozorenja, apiKey) {
  const zamerke = upozorenja.map(u => '- [' + u.tip + '] ' + u.tekst).join('\n');
  const txt = await claude([{
    role: 'user',
    content: `Ovaj tekst nije prošao uredničku proveru. Popravi ga.

ZAMERKE:
${zamerke}

IZVORNI TEKST (jedini dozvoljeni izvor činjenica i brojeva):
"""${(izvor.excerpt || izvor.summary || '').slice(0, 2500)}"""
Naslov izvora: ${izvor.title}

TVOJ TEKST:
${JSON.stringify({ title: vest.title, desc: vest.desc, body: vest.body }, null, 1)}

Ako je zamerka "broj-bez-izvora": obriši ili zameni opisom svaki broj kojeg nema u izvornom tekstu. Ne izmišljaj zamenu.
Ako je zamerka "bez-akcije" ili "plitko": prepiši poslednji pasus tako da traži jednu konkretnu radnju u imperativu, sa proverljivim ishodom.
Ako je zamerka "floskula": izbaci te fraze i zameni ih konkretnom tvrdnjom ili ih ukloni.
Ako je zamerka "jezik": prebaci u ekavicu.

Vrati JSON niz sa TAČNO JEDNIM objektom: [{"cat","catLabel","title","desc","body","read"}]`,
  }], apiKey, 4000);
  const arr = parsirajNiz(txt);
  return arr && arr[0] ? arr[0] : null;
}

export default async (req) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const admin = process.env.ADMIN_TOKEN;

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
  try { napisano = parsirajNiz(await claude([{ role: 'user', content: KORISNIK(ulaz) }], apiKey)); }
  catch (e) { return json({ error: 'Pisanje nije uspelo: ' + e.message, povuceno: all.length, greske: errors }, 502); }

  const now = new Date().toISOString();
  const dodati = [];
  let popravljeno = 0;

  for (let i = 0; i < napisano.length; i++) {
    const w0 = napisano[i];
    const src = novi[i];
    if (!src) continue;
    if (w0 && w0.skip) { seen.push(src.url); continue; }
    if (!w0 || !w0.title || !w0.body) { seen.push(src.url); continue; }

    const izvorTekst = (src.excerpt || '') + '\n' + (src.summary || '') + '\n' + (src.title || '');
    let w = w0;
    let p = proveri(w, izvorTekst);

    // Jedan popravni krug ako ima ozbiljnih zamerki
    if (p.status === 'problem') {
      try {
        const w2 = await popravi(w, src, p.upozorenja, apiKey);
        if (w2 && w2.body && w2.title) {
          const p2 = proveri(w2, izvorTekst);
          if (p2.ocena > p.ocena) { w = { ...w, ...w2 }; p = p2; popravljeno++; }
        }
      } catch (e) { console.log('popravka nije uspela: ' + e.message); }
    }

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
      provera: p,
    });
    seen.push(src.url);
  }

  await writeJSON(KEY_DRAFTS, [...dodati, ...drafts].slice(0, 100));
  await writeJSON(KEY_SEEN, seen.slice(-800));

  return json({
    ok: true,
    povuceno: all.length,
    novih: novi.length,
    nacrta: dodati.length,
    popravljeno,
    preskoceno: novi.length - dodati.length,
    greske: errors,
    pregled: dodati.map(d => ({ naslov: d.title, ocena: d.provera.ocena, status: d.provera.status })),
  });
};

export const config = { schedule: '0 5 * * 1-5' };
