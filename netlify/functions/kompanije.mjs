// ==========================================================================
// ŠTOK I KRILO — direktorijum kompanija
//   GET /api/kompanije
//
// Do 5. 10. 2026. stranica je pokušavala da povuče Gugl tabelu direktno iz
// pregledača. Tabela je privatna i vraća 401, pa povlačenje nije uspelo
// nijednom — portal je ceo život prikazivao petnaest firmi upisanih u kod.
//
// Sada kompanije stoje u istoj bazi kao vesti. Prednost nije samo u tome što
// radi: prijava nove firme i njeno odobravanje mogu da idu kroz isti admin
// panel kao vesti, umesto kroz tabelu do koje portal nema pristup.
// ==========================================================================
import { readJSON, KLJUC_FIRME } from './_lib.mjs';

export default async () => {
  const sve = await readJSON(KLJUC_FIRME, []);
  const firme = sve
    .filter(f => f && f.name && f.odobreno !== false)
    .map(f => ({
      id: f.id, name: f.name, city: f.city, country: f.country, cat: f.cat,
      products: Array.isArray(f.products) ? f.products : [],
      verified: Boolean(f.verified), url: f.url || '', desc: f.desc || '',
    }));

  return new Response(JSON.stringify({ firme }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
    },
  });
};
