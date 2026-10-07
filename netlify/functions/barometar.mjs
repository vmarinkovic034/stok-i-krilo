// ==========================================================================
// ŠTOK I KRILO — barometar cena prozora
//   GET /api/barometar             → ručno merena korpa (sa ugradnjom)
//   GET /api/barometar?zapisi=1    → automatska očitavanja (bez montaže)
//   GET /api/barometar?prolazi=1   → izveštaj poslednjih prolaza robota
//   GET /api/barometar?proba=<id>  → suvi prolaz jednog izvora, bez upisa
//
// Proba ne traži token jer ništa ne menja i vraća samo ono što je i inače
// javno na tuđem sajtu. Služi da se posle svake izmene parsera vidi da li
// još pogađa stranu — sajtovi menjaju šablon bez najave, a tiho pokvaren
// parser je gori od parsera koji pukne naglas.
//
// Dve serije, namerno odvojene. Korpa je opseg iz prijavljenih projekata,
// sa ugradnjom, sa agregatora ponuda. Zapisi su jedinične cene artikala iz
// objavljenih cenovnika, bez montaže. Razlika između to dvoje je blizu
// dvostruka, pa spajanje daje broj koji ne znači ništa.
// ==========================================================================
import { readJSON, KLJUC_BAROMETAR } from './_lib.mjs';
import { KLJUC_ZAPISI, KLJUC_PROLAZI } from './_barometar-zapisi.mjs';
import { IZVORI, ocitajIzvor } from './_barometar-izvori.mjs';

const json = (telo, kes) => new Response(JSON.stringify(telo), {
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': kes,
    'access-control-allow-origin': '*',
  },
});

export default async (req) => {
  const q = new URL(req.url).searchParams;

  const proba = q.get('proba');
  if (proba) {
    const izv = IZVORI.find(i => i.id === proba);
    if (!izv) {
      return json({ greska: 'nepoznat izvor', poznati: IZVORI.map(i => i.id) }, 'no-store');
    }
    try {
      const zapisi = await ocitajIzvor(izv, 8000);
      return json({ izvor: izv.id, url: izv.url, ocitano: zapisi.length, zapisi }, 'no-store');
    } catch (e) {
      return json({ izvor: izv.id, url: izv.url, greska: e.message }, 'no-store');
    }
  }

  if (q.get('prolazi')) {
    return json({ prolazi: await readJSON(KLJUC_PROLAZI, []) }, 'no-store');
  }

  if (q.get('zapisi')) {
    let zapisi = await readJSON(KLJUC_ZAPISI, []);
    const zemlja = q.get('zemlja');
    if (zemlja) zapisi = zapisi.filter(z => z.zemlja === zemlja);
    const od = q.get('od');
    if (od) zapisi = zapisi.filter(z => z.datumOcitavanja >= od);
    // Pregled bez prelistavanja celog niza: koliko zapisa po zemlji i
    // koliko nezavisnih izvora je stvarno dalo podatak. Broj izvora je
    // važniji od broja zapisa — jedan katalog sa dvesta artikala nije
    // dvesta merenja tržišta, nego jedno.
    const poZemlji = {};
    for (const z of zapisi) {
      const p = poZemlji[z.zemlja] || (poZemlji[z.zemlja] = { zapisa: 0, izvori: new Set() });
      p.zapisa++; p.izvori.add(z.izvor);
    }
    const sazetak = Object.fromEntries(
      Object.entries(poZemlji).map(([k, v]) => [k, { zapisa: v.zapisa, izvora: v.izvori.size }])
    );
    return json({ ukupno: zapisi.length, sazetak, zapisi }, 'public, max-age=900');
  }

  const b = await readJSON(KLJUC_BAROMETAR, null);
  if (!b) return json({ merenja: [], poruka: 'Barometar još nije upisan.' }, 'no-store');

  // Merenja su poređana po broju, pa je poslednje uvek na kraju.
  const merenja = (Array.isArray(b.merenja) ? b.merenja : [])
    .slice().sort((x, y) => (x.broj || 0) - (y.broj || 0));
  return json({ ...b, merenja }, 'public, max-age=1800');
};
