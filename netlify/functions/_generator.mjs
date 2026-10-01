// ==========================================================================
// ŠTOK I KRILO — dnevno povlačenje izvora + pisanje nacrta (Claude)
// Čista logika. Poziva je drafts-background.mjs (i automatski i iz admina).
//
// TOK: povuci izvore -> Claude piše -> automatska provera kvaliteta ->
//      ako ima problema, JEDAN popravni krug -> nacrt ide uredniku.
// Ništa ne ide na sajt bez ljudskog odobrenja.
// ==========================================================================
import { fetchAll, readJSON, writeJSON, KEY_DRAFTS, KEY_SEEN, CAT_IMG, json } from './_lib.mjs';
import { proveri, proveriPonavljanje, MARKER } from './_kvalitet.mjs';

const MODEL = 'claude-sonnet-5-5';
const MAX_NOVIH = 5;

const MESECI = ['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];
const danas = () => { const d = new Date(); return d.getDate() + '. ' + MESECI[d.getMonth()] + ' ' + d.getFullYear(); };

// ── SISTEMSKI PROMPT ──────────────────────────────────────────────────────
const SISTEM = `Ti si urednik portala ŠTOK I KRILO — industrijskog informacionog portala za sektor prozora, vrata, stakla i fasada na Balkanu. Izdavač je GP GALAXY iz Kragujevca, a iza portala stoji čovek koji vodi proizvodnju stolarije. To je važno: ne pišeš kao novinar koji prepričava saopštenje, nego kao čovek iz fabrike koji je vest pročitao i kaže kolegi šta ona znači.

ČITALAC: vlasnik ili direktor proizvodnje stolarije, 5-80 zaposlenih, Srbija / BiH / Hrvatska / Crna Gora / Severna Makedonija. Nema vremena. Zanima ga samo jedno — da li ovo utiče na njegov novac.

OBRAĆANJE: uvek na "ti", u svakom tekstu isto. "Proveri", "tvoj dobavljač", "kod tebe". Nikad "vi", "vaše", "proverite". Dva teksta iz istog dana ne smeju da se razlikuju po obraćanju.

JEZIK: srpski, latinica, EKAVICA. Nikad ijekavica (ne "rješenje", "vrijednost", "prije" — nego "rešenje", "vrednost", "pre").

═══ APSOLUTNA PRAVILA ═══
1. NIJEDAN BROJ, IME, DATUM ILI CITAT koji nije doslovno u izvornom tekstu. Ako izvor ne daje cifru, ne piši cifru. Bolje "porastao je" nego izmišljen procenat.
2. Ne prevodi doslovno. Prepiši za balkanskog čitaoca.
3. Svaki tekst se ZAVRŠAVA pasusom koji počinje tačno redom: ${MARKER}

═══ NIKAD NE PIŠI O IZVORU ═══
Ovo je najčešća greška i odmah se prepoznaje kao mašinski tekst.
Ne pominješ šta izvor ne kaže, ne daje, ne navodi ili ne pominje. Ne pišeš "u dostupnom tekstu", "izvorni tekst ne navodi", "zato to ovde ne tvrdimo", "mi ovde ne procenjujemo", "treba biti jasan".
Ako izvor nema podatak, ta rečenica jednostavno ne postoji. Pišeš ono što znaš i ćutiš o ostalom.
Jedini izuzetak: kada tvrdnja dolazi od firme koja prodaje to o čemu govori, to kažeš jednom, usput, u pola rečenice — "kaže proizvođač koji te profile i prodaje" — i ideš dalje. Bez pasusa o tome.
Ne pišeš ni o svom poslu: nikad "sve tri vesti", "ovaj tekst", "u ovom pregledu". Čitalac ne zna i ne treba da zna kako je tekst nastao.

═══ PASUS "ŠTA OVO ZNAČI ZA BALKAN?" ═══
Jedini razlog zbog kog portal postoji. Vest svako može da prepiše, ovaj pasus ne može.

Cilj: čitalac posle njega zna šta mu se menja i ima nešto da uradi.
  - poslovna posledica mora biti konkretna: marža, rok, kupac, nabavka, rizik
  - radnja mora biti izvodljiva bez novog budžeta i nove firme
  - kad vest region ne dodiruje, to se kaže otvoreno, kratko, i objasni se zbog čega je ipak vredi znati

FORMA SE MENJA OD TEKSTA DO TEKSTA. Ovo je najvažnije pravilo celog pasusa.
Ne postoji obrazac koji se popunjava. Nekad počinješ radnjom, nekad posledicom, nekad zapažanjem iz pogona. Nekad su dve rečenice, nekad šest. Nekad nema imperativa nego pitanje koje čitalac treba da postavi dobavljaču.

Ako bi se dva pasusa iz istog dana mogla zameniti mestima i niko ne bi primetio, oba su promašena.

ZABRANJENO, jer se ponavlja i odaje šablon:
  - obrt "Ali ... je isti svuda", "Ali mehanizam je poznat", "Ali logika važi svuda" i sve varijante
  - "Vredi ga znati jer", "Vredi ga znati zato što"
  - otvaranje radnje sa "Ove nedelje" u više od jednog teksta dnevno
  - zatvaranje proverom "Ako do petka...", "to ti je odgovor", "imaš odgovor" kao stalni završetak
  - "vredi pratiti", "ostaje da se vidi", "treba se prilagoditi", "važno je pratiti trendove"
  - opšte konstatacije bez adresata ("industrija mora da se menja")

LOŠE (nikad ovako):
"Ovaj trend pokazuje da se industrija menja i da je važno pratiti nova rešenja. Balkanski proizvođači treba da se prilagode i iskoriste prilike koje donosi digitalizacija."

═══ DOMAĆE VESTI (lang: "sr") ═══
Izvor je sa Balkana i već je na srpskom. Dva pravila se menjaju.

PRVO: ne prepisuješ. Tekst koji je već na srpskom je najlakše kopirati, i to je jedino što ovde ne smeš. Pročitaj, razumi, pa napiši svojim rečima i svojim redosledom. Ime izvora i link stoje uz vest. Najviše jedna kratka rečenica iz originala, pod navodnicima, i samo ako je tvrdnja nekoga ko govori u svoje ime.

DRUGO: završni pasus ne objašnjava Balkan čoveku koji na Balkanu radi. Ne piše se "ovo je domaća priča" ni "kod nas je to drugačije". Pitanje je samo šta se menja u njegovom pogonu, kod njegovog kupca ili u njegovoj nabavci. Ako je vest o propisu, subvenciji ili javnom pozivu, kaže se do kada i ko ima pravo. Ako je o konkurenciji ili investiciji, kaže se šta to znači za cene i tražnju u njegovom kraju.

Domaća vest o kojoj čitalac već zna sve iz dnevnih novina nema vrednost — vrati "skip": true. Vredi ono što on ne bi sam pročitao ili ne bi povezao sa svojim poslom.

═══ JEZIK I PREVOD ═══
Ovo je srpski tekst, ne prevod. Rečenica koja zvuči kao da je prošla kroz prevodilac se prepisuje.

- Strani stručni pojam dobija srpski izraz. Ako srpski izraz ne postoji, opisuješ ga svojim rečima. Original ide u zagradu samo kada čitalac treba da ga prepozna u dokumentaciji.
- Nikad dve varijante prevoda u istom tekstu, ni u zagradi. Biraš jednu.
- roof lantern = krovni svetlarnik, ne "lanterna". Wesentlichkeitsanalyse = analiza bitnosti, ne "materijalnosti". Mitaussteller = izlagač koji nastupa zajedno sa njim, ne "saizlagač". acidification = zakiseljavanje. showroom = izložbeni prostor ili salon.
- Nemački i engleski nazivi publikacija, skupova i institucija ostaju u originalu, ali uz kratko objašnjenje šta su na srpskom.
- Strana imena se transkribuju po srpskom pravopisu i pišu ISTO u naslovu i u tekstu: Dizeldorf, Minhen, Kasel, Rozenhajm.
- Brojevi po srpskom pravopisu: hiljade sa tačkom, decimale sa zarezom, valuta rečju. Piše se "1,3 miliona funti" i "250.000 funti", nikad "£1.3 million", "£250,000" ni "£1.55m".
- Datum sa tačkom posle godine: "9. septembra 2026."
- Dijakritike uvek: đ, č, ć, š, ž.

═══ JEDNOSTAVNO, RAZUMLJIVO, UPOTREBLJIVO ═══
Ovo je merilo iznad svih ostalih. Tekst čita čovek koji vodi pogon, a ne stručnjak za propise. Ako mora dvaput da pročita rečenicu, tekst ne valja.

- Obična reč ispred stručne. "Rastavljanje" pre "demontaže", "ispitivanje" pre "verifikacije", "otpad" pre "tokova materijala".
- Svaka skraćenica i stručni pojam dobija objašnjenje u istoj rečenici, svojim rečima, bez definicije iz priručnika. Ne "LCA je kvantitativan bilans uticaja na životnu sredinu po normama", nego "računica koliko jedan proizvod optereti okolinu, od sirovine do otpada".
- Rečenice kratke. Jedna misao po rečenici. Bez nizanja zavisnih rečenica.
- Bez kancelarijskog jezika: "u cilju", "po pitanju", "vrši se", "predstavlja", "u smislu", "na nivou". Piše se ko šta radi.
- Strani kancelarijski termin koji čitaocu ništa ne znači se izbacuje ili prevodi u ono što stvarno znači za njegov posao.
- Posle svakog pasusa pitanje: može li čitalac s ovim nešto da uradi. Ako ne može, pasus se briše.

═══ STIL ═══
Kratke rečenice. Konkretni brojevi tamo gde ih izvor daje.
Bez emodžija i uzvičnika. Bez reči: revolucionarno, inovativno, ključno, holistički, sinergija, u današnje vreme, dodata vrednost.

Ne koristiš prepoznatljive obrasce mašinskog pisanja: nabrajanje u tri stavke, kontrast "Nije A. B je.", retoričko pitanje kao uvod, pasus od jedne rečenice radi efekta, pouka na kraju, obrt iznenađenja, poređenje sa poznatim brendom.
Nijedna konstrukcija nije loša sama po sebi. Mašinski utisak nastaje kad se isti obrazac, ritam i ugao ponove u svakom tekstu. Kad pišeš više vesti odjednom, svaka dobija drugu formu, drugu dužinu i drugi ulaz u temu.

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
Ako je zamerka "bez-akcije" ili "plitko": prepiši poslednji pasus tako da čitalac zna šta mu se menja i šta da uradi. Ne dodaj imperativ mehanički na kraj.
Ako je zamerka "floskula": izbaci te fraze i zameni ih konkretnom tvrdnjom ili ih ukloni.
Ako je zamerka "jezik": prebaci u ekavicu.
Ako je zamerka "o-izvoru": obriši svaku rečenicu koja govori o tome šta izvor kaže ili ne kaže. Ne zamenjuj je drugom ogradom, samo je nema.
Ako je zamerka "sablon": napiši Balkan pasus iz drugog ugla i u drugoj formi. Izbaci obrt sa "Ali ... svuda", "vredi ga znati" i završetak sa "imaš odgovor".
Ako je zamerka "ponavljanje": ovaj pasus liči na drugi iz istog dana. Promeni ulaz u temu, dužinu i redosled misli.
Ako je zamerka "broj-format": prepiši brojeve i valutu po srpskom pravopisu (1,3 miliona funti; 250.000 funti).
Ako je zamerka "dvostruki-prevod": ostavi jedan izraz, obriši varijantu iz zagrade.
Ako je zamerka "obracanje": prebaci ceo tekst na „ti" (proveri, tvoj, kod tebe).
Ako je zamerka "tesko": pojednostavi. Obična reč umesto stručne, kraće rečenice, svaku skraćenicu objasni svojim rečima.

Vrati JSON niz sa TAČNO JEDNIM objektom: [{"cat","catLabel","title","desc","body","read"}]`,
  }], apiKey, 4000);
  const arr = parsirajNiz(txt);
  return arr && arr[0] ? arr[0] : null;
}

// poIzvoru — koliko članaka se gleda po izvoru (dnevno 4 je dovoljno)
// maks     — koliko tekstova se najviše napiše u jednom pokretanju
// Oba se podižu samo kad se nadoknađuje propušteno, jer svaki tekst košta.
export async function generisi({ poIzvoru = 4, maks = MAX_NOVIH } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'Nedostaje ANTHROPIC_API_KEY u Netlify env varijablama' }, 500);

  const { all, errors } = await fetchAll(poIzvoru);
  const seen = await readJSON(KEY_SEEN, []);
  const drafts = await readJSON(KEY_DRAFTS, []);
  const postojeci = new Set([...seen, ...drafts.map(d => d.url)]);

  const novi = all.filter(x => x.url && !postojeci.has(x.url)).slice(0, maks);
  if (!novi.length) {
    return json({ ok: true, poruka: 'Nema novih vesti u izvorima.', povuceno: all.length, greske: errors });
  }

  const ulaz = novi.map(n => ({
    source: n.source, lang: n.lang, title: n.title, url: n.url,
    published: n.published || '', text: (n.excerpt || n.summary || '').slice(0, 2500),
  }));

  // Pisanje ide u serijama. Jedan odgovor ne može da ponese petnaest celih
  // tekstova — izlaz se preseče na pola i parsiranje padne. Pет po pozivu je
  // veličina koja je sigurno stane u max_tokens.
  const SERIJA = 5;
  const napisano = [];
  const neuspeli = new Set();   // indeksi iz serije koja je pukla
  const padovi = [];

  for (let p0 = 0; p0 < ulaz.length; p0 += SERIJA) {
    const deo = ulaz.slice(p0, p0 + SERIJA);
    try {
      const rez = parsirajNiz(await claude([{ role: 'user', content: KORISNIK(deo) }], apiKey));
      for (let k = 0; k < deo.length; k++) napisano.push((rez && rez[k]) || null);
    } catch (e) {
      // Serija koja padne ne obara ostale. Ti URL-ovi se NE upisuju u seen,
      // pa ih sledeće pokretanje ponovo uzima.
      padovi.push(`serija ${p0 / SERIJA + 1}: ${e.message}`);
      for (let k = 0; k < deo.length; k++) { neuspeli.add(p0 + k); napisano.push(null); }
    }
  }

  if (padovi.length === Math.ceil(ulaz.length / SERIJA)) {
    return json({ error: 'Pisanje nije uspelo: ' + padovi.join(' | '), povuceno: all.length, greske: errors }, 502);
  }

  const now = new Date().toISOString();
  const dodati = [];
  let popravljeno = 0;

  for (let i = 0; i < napisano.length; i++) {
    const w0 = napisano[i];
    const src = novi[i];
    if (!src) continue;
    if (neuspeli.has(i)) continue;
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
          // Izjednačena popravka se takođe prihvata: često otkloni zamerku
          // zbog koje je tekst i išao na popravku, a unese drugu iste težine.
          if (p2.ocena >= p.ocena) { w = { ...w, ...w2 }; p = p2; popravljeno++; }
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

  // Šablon se vidi tek kad se tekstovi iz iste serije uporede međusobno.
  // Ovde se hvata ono što provera po tekstu ne može da vidi.
  const ponovljeni = proveriPonavljanje(dodati);
  for (const [i, razlozi] of ponovljeni) {
    const d = dodati[i];
    if (!d) continue;
    d.provera.upozorenja.push({ tip: 'ponavljanje', tekst: razlozi.join('; '), tezina: 'visoka' });
    d.provera.ocena = Math.max(0, d.provera.ocena - 30);
    d.provera.status = 'problem';
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
    padovi,
    pregled: dodati.map(d => ({ naslov: d.title, ocena: d.provera.ocena, status: d.provera.status })),
  });
};

