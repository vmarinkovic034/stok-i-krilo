// ==========================================================================
// ŠTOK I KRILO — posrednik ka TED-u (javne nabavke Evropske unije)
//   GET /api/ted  ->  { notices: [...] }
//
// Zašto funkcija, a ne poziv iz pregledača: TED traži ključ u zaglavlju. Dok
// se zvao direktno iz stranice, ključ je stajao u izvoru svake stranice i u
// javnom repozitorijumu, pa ga je svako mogao pročitati i potrošiti — TED ima
// dnevno ograničenje po ključu. Uz to je zahtev išao preko corsproxy.io, dakle
// kroz tuđi server, zajedno sa ključem.
//
// Ovde ključ ostaje na Netlify-u, a pregledač dobija samo rezultat.
// ==========================================================================
import { json } from './_lib.mjs';

// Šifre iz jedinstvenog rečnika nabavki (CPV) koje se tiču stolarije, montaže,
// fasada i stakla. Sve ostalo u TED-u je putna infrastruktura i slično.
const CPV = ['44221000', '44221100', '44221200', '45421000', '45421100', '44112400', '44163100'];
const ZEMLJE = ['HR', 'SI', 'RO', 'BG', 'IT', 'DE', 'AT', 'FR'];

const POLJA = [
  'publication-number', 'title', 'buyer-name', 'buyer-country', 'notice-type',
  'cpv-code', 'estimated-value', 'deadline-date', 'dispatch-date',
  'place-of-performance', 'ted-url',
];

// Objave starije od pola godine nemaju smisla — rok za prijavu je odavno prošao.
function odKada() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export default async () => {
  const kljuc = (process.env.TED_API_KEY || '').trim();
  // Bez ključa se vraća uredan odgovor, ne greška. Stranica tada prikaže samo
  // domaće tendere i ne prijavljuje kvar — portal radi i bez EU tendera.
  if (!kljuc) return json({ notices: [], podeseno: false });

  const upit = 'cpv-code IN ("' + CPV.join('","') + '")'
    + ' AND (buyer-country IN ("' + ZEMLJE.join('","') + '"))'
    + ' AND publication-date >= ' + odKada();

  try {
    const res = await fetch('https://api.ted.europa.eu/v3/notices/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'TED-API-Key': kljuc },
      body: JSON.stringify({
        query: upit,
        fields: POLJA,
        page: 1,
        limit: 30,
        sort: [{ field: 'publication-date', order: 'desc' }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.log('TED HTTP ' + res.status + ': ' + t.slice(0, 300));
      return json({ notices: [], podeseno: true, greska: 'HTTP ' + res.status });
    }

    const d = await res.json();
    const notices = d.notices || d.results || d.items || [];
    return json({ notices, podeseno: true });
  } catch (e) {
    console.log('TED nije odgovorio: ' + e.message);
    return json({ notices: [], podeseno: true, greska: e.message });
  }
};
