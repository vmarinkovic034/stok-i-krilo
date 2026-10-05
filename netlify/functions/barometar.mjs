// ==========================================================================
// ŠTOK I KRILO — barometar cena prozora
//   GET /api/barometar
//
// Fiksna korpa od tri elementa u tri klase opreme, merena po istoj
// specifikaciji na više tržišta. Jedini podatak na portalu koji niko drugi
// ne objavljuje — zato i stoji u bazi, da svako novo merenje ostane
// zabeleženo i da se vremenom dobije niz, a ne jedna slika.
// ==========================================================================
import { readJSON, KLJUC_BAROMETAR } from './_lib.mjs';

export default async () => {
  const b = await readJSON(KLJUC_BAROMETAR, null);
  if (!b) {
    return new Response(JSON.stringify({ merenja: [], poruka: 'Barometar još nije upisan.' }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  // Merenja su poređana po broju, pa je poslednje uvek na kraju.
  const merenja = (Array.isArray(b.merenja) ? b.merenja : []).slice().sort((x, y) => (x.broj || 0) - (y.broj || 0));
  return new Response(JSON.stringify({ ...b, merenja }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=1800',
      'access-control-allow-origin': '*',
    },
  });
};
