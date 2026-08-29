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
