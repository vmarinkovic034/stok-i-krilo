// ==========================================================================
// ŠTOK I KRILO — automatska provera kvaliteta nacrta
// Cilj: uhvatiti dve stvari koje uništavaju kredibilitet portala:
//   1. IZMIŠLJENE BROJEVE (broj u tekstu koji ne postoji u izvoru)
//   2. GENERIČAN "Šta ovo znači za Balkan?" pasus (fraza umesto akcije)
// Ne blokira objavu - označava nacrt da urednik zna gde da gleda.
// ==========================================================================

export const MARKER = '- Šta ovo znači za Balkan? -';

// Fraze koje signaliziraju prazan tekst. Ako se pojave, nacrt se označava.
const FRAZE = [
  'u današnje vreme', 'u današnjem svetu', 'sve više i više', 'nikada nije bilo važnije',
  'ključno je napomenuti', 'važno je napomenuti', 'treba imati na umu', 'ne treba zaboraviti',
  'vredi razmisliti', 'ostaje da se vidi', 'vreme će pokazati', 'samo vreme će pokazati',
  'prati trendove', 'pratiti trendove', 'prilagoditi se novim', 'ići u korak s vremenom',
  'revolucionarno rešenje', 'inovativno rešenje', 'igra ključnu ulogu', 'igraju ključnu ulogu',
  'u eri digitalizacije', 'u savremenom poslovanju', 'nesumnjivo', 'bez sumnje',
  'na kraju dana', 'sve u svemu', 'zaključno', 'jedno je sigurno',
  'donosi brojne prednosti', 'niz prednosti', 'širok spektar', 'holistički pristup',
  'sinergija', 'dodata vrednost', 'win-win',
];

// Pisanje o izvoru umesto o temi. Najjasniji znak mašinskog teksta: model
// ispunjava pravilo "bez izmišljenih brojeva" tako što objavi šta ne zna.
const META = [
  /izvor(ni tekst)? (ne )?(kaže|kaze|daje|navodi|pominje|govori o cen)/i,
  /u dostupnom (tekstu|delu)/i,
  /zato to ovde ne tvrdimo/i,
  /mi ovde ne procenjujemo/i,
  /treba biti jasan/i,
  /\b(sve tri|obe) vesti\b/i,
  /\bovaj (tekst|pregled)\b/i,
];

// Obrti koji su se ponavljali iz teksta u tekst i pretvorili pasus u formular.
const SABLON = [
  /\bali\b[^.!?]{0,60}\b(isti|isto|poznat|važi|vazi)\b[^.!?]{0,25}\bsvuda\b/i,
  /\bali\b[^.!?]{0,30}\bmehanizam je (isti|poznat)\b/i,
  /vredi (ga )?znati (jer|zato što|zato sto)/i,
  /\bto ti je odgovor\b/i,
  /\bimaš odgovor\b/i,
  /\bimas odgovor\b/i,
];

// Engleski zapis brojeva i valute u srpskom tekstu.
const BROJ_FORMAT = [
  /£\s?\d/,
  /\$\s?\d/,
  /\d\s?(million|billion|thousand)\b/i,
  /\d{1,3},\d{3}\b/,
  /\d+(\.\d+)?m\b/,
];

// Bar jedan od ovih mora da postoji u Balkan pasusu — znak da traži radnju.
const AKCIJA = [
  'proveri', 'uporedi', 'izračunaj', 'pitaj', 'traži', 'zatraži', 'pogledaj', 'razdvoj',
  'napravi', 'uvedi', 'pozovi', 'izmeri', 'prebroj', 'testiraj', 'ugovori', 'zapiši',
  'prekontroliši', 'analiziraj', 'postavi', 'definiši', 'dogovori',
];

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'dj');

// Svi brojevi iz teksta, normalizovani (bez tacaka/zareza kao separatora hiljada)
function brojevi(t) {
  const out = new Set();
  for (const m of String(t || '').matchAll(/\d[\d.,\s]*\d|\d/g)) {
    const raw = m[0].replace(/\s/g, '');
    const cist = raw.replace(/[.,](?=\d{3}\b)/g, '');   // 1.240 -> 1240
    const bezDec = cist.replace(/[.,]\d+$/, '');         // 3,54 -> 3
    out.add(cist.replace(',', '.'));
    out.add(bezDec);
    out.add(raw);
  }
  return out;
}

// ── Ponavljanje između tekstova iz iste serije ──────────────────────────
// Šablon se po jednom tekstu ne vidi. Vidi se tek kad osam pasusa počne i
// završi se na isti način. Poredi prvih i poslednjih nekoliko reči Balkan
// pasusa i prijavljuje tekstove koji dele isti ulaz ili izlaz.

export function proveriPonavljanje(vesti) {
  const ulazi = new Map();
  const izlazi = new Map();

  vesti.forEach((v, i) => {
    const b = String(v.body || '');
    const k = b.indexOf(MARKER);
    if (k < 0) return;
    const bal = b.slice(k + MARKER.length).trim();
    const reci = norm(bal).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    if (reci.length < 8) return;
    const u = reci.slice(0, 4).join(' ');
    const z = reci.slice(-4).join(' ');
    if (!ulazi.has(u)) ulazi.set(u, []);
    if (!izlazi.has(z)) izlazi.set(z, []);
    ulazi.get(u).push(i);
    izlazi.get(z).push(i);
  });

  const pogodjeni = new Map();
  const upisi = (grupe, kako) => {
    for (const [fraza, idx] of grupe) {
      if (idx.length < 2) continue;
      for (const i of idx) {
        if (!pogodjeni.has(i)) pogodjeni.set(i, []);
        pogodjeni.get(i).push(kako + ' „' + fraza + '" deli još ' + (idx.length - 1) + ' tekst(a)');
      }
    }
  };
  upisi(ulazi, 'Isti početak Balkan pasusa:');
  upisi(izlazi, 'Isti završetak Balkan pasusa:');

  return pogodjeni;
}

export function proveri(vest, izvorTekst) {
  const upoz = [];
  const body = String(vest.body || '');
  const naslov = String(vest.title || '');
  const desc = String(vest.desc || '');
  const svePisano = naslov + '\n' + desc + '\n' + body;

  // ── 1. Balkan pasus postoji ────────────────────────────────────────────
  const idx = body.indexOf(MARKER);
  if (idx < 0) {
    upoz.push({ tip: 'struktura', tekst: 'Nedostaje pasus „Šta ovo znači za Balkan?".', tezina: 'visoka' });
  }
  const balkan = idx >= 0 ? body.slice(idx + MARKER.length).trim() : '';

  // ── 2. Balkan pasus traži konkretnu radnju ─────────────────────────────
  if (balkan) {
    if (balkan.length < 220) {
      upoz.push({ tip: 'plitko', tekst: 'Balkan pasus je kratak (' + balkan.length + ' znakova) — verovatno bez konkretne akcije.', tezina: 'srednja' });
    }
    const nb = norm(balkan);
    if (!AKCIJA.some(a => nb.includes(norm(a)))) {
      upoz.push({ tip: 'bez-akcije', tekst: 'Balkan pasus ne traži nijednu konkretnu radnju od čitaoca (proveri / uporedi / izračunaj / pitaj...).', tezina: 'visoka' });
    }
  }

  // ── 3. Generične fraze ─────────────────────────────────────────────────
  const ns = norm(svePisano);
  const nadjene = FRAZE.filter(f => ns.includes(norm(f)));
  if (nadjene.length) {
    upoz.push({ tip: 'floskula', tekst: 'Prazne fraze: ' + nadjene.join(', '), tezina: nadjene.length > 2 ? 'visoka' : 'srednja' });
  }

  // ── 4. IZMIŠLJENI BROJEVI ──────────────────────────────────────────────
  // Svaki broj u tekstu mora da postoji u izvoru. Izuzeci: godine, procenti
  // koji se javljaju u izvoru, i brojevi u Balkan pasusu (tvoj komentar sme
  // da sadrži npr. "trećina" ili "pet kupaca" kao ilustraciju).
  const uIzvoru = brojevi(izvorTekst);
  const tekstBezBalkana = idx >= 0 ? body.slice(0, idx) : body;
  const kandidati = [...brojevi(naslov + '\n' + desc + '\n' + tekstBezBalkana)];
  const sumnjivi = kandidati.filter(n => {
    if (n.length < 2) return false;                       // jednocifreni preskoči
    if (/^(19|20)\d{2}$/.test(n)) return false;           // godine
    return !uIzvoru.has(n);
  });
  if (sumnjivi.length) {
    upoz.push({
      tip: 'broj-bez-izvora',
      tekst: 'Brojevi kojih nema u izvoru: ' + [...new Set(sumnjivi)].slice(0, 8).join(', ') + '. Proveri pre objave.',
      tezina: 'visoka',
    });
  }

  // ── 4b. Pisanje o izvoru umesto o temi ─────────────────────────────────
  const meta = META.filter(r => r.test(svePisano));
  if (meta.length) {
    upoz.push({
      tip: 'o-izvoru',
      tekst: 'Tekst govori o izvoru umesto o temi (' + meta.length + ' mesta). Ako izvor nema podatak, ta rečenica se briše, ne objavljuje.',
      tezina: 'visoka',
    });
  }

  // ── 4c. Šablonski obrti u Balkan pasusu ────────────────────────────────
  const sablon = SABLON.filter(r => r.test(svePisano));
  if (sablon.length) {
    upoz.push({
      tip: 'sablon',
      tekst: 'Obrt koji se ponavlja iz teksta u tekst (' + sablon.length + '). Promeni formu pasusa.',
      tezina: 'visoka',
    });
  }

  // ── 4d. Engleski zapis brojeva i valute ────────────────────────────────
  const format = BROJ_FORMAT.filter(r => r.test(svePisano));
  if (format.length) {
    upoz.push({
      tip: 'broj-format',
      tekst: 'Strani zapis broja ili valute. Srpski: 1,3 miliona funti, 250.000 funti.',
      tezina: 'srednja',
    });
  }

  // ── 4e. Dve varijante prevoda u zagradi ────────────────────────────────
  if (/\b\p{L}{4,}\s\(\p{L}{4,}\)\s/u.test(body) && !/\b(EPD|LCA|BIV|FVSB)\b/.test(body)) {
    upoz.push({
      tip: 'dvostruki-prevod',
      tekst: 'Izgleda kao dve varijante prevoda u zagradi. Izaberi jednu.',
      tezina: 'srednja',
    });
  }

  // ── 4f. Obraćanje na "vi" (portal se obraća na "ti") ───────────────────
  const vikanje = [
    /\b(vaš|vaša|vaše|vašeg|vašem|vašu|vaših|vasim)\b/i,
    /\b(proverite|uporedite|pitajte|tražite|zatražite|izvucite|pogledajte|zapišite|pozovite|pošaljite|uzmite|prebrojte)\b/i,
  ].filter(r => r.test(body));
  if (vikanje.length) {
    upoz.push({
      tip: 'obracanje',
      tekst: 'Tekst se obraća na „vi". Portal se svuda obraća na „ti".',
      tezina: 'srednja',
    });
  }

  // ── 5. Ijekavica (portal je na ekavici) ────────────────────────────────
  const ije = ['rješenj', 'vrijednost', 'prije', 'poslije', 'mjesec', 'dijelov', 'trebalo bi da se promijeni', 'uvijek', 'vrijeme'];
  const nadjIje = ije.filter(w => ns.includes(w));
  if (nadjIje.length) {
    upoz.push({ tip: 'jezik', tekst: 'Ijekavica u tekstu: ' + nadjIje.join(', ') + '. Portal je na ekavici.', tezina: 'srednja' });
  }

  const visoke = upoz.filter(u => u.tezina === 'visoka').length;
  const srednje = upoz.filter(u => u.tezina === 'srednja').length;
  const ocena = Math.max(0, 100 - visoke * 30 - srednje * 12);

  return { ocena, status: visoke ? 'problem' : (srednje ? 'pregledati' : 'cisto'), upozorenja: upoz };
}
