// ==========================================================================
// ŠTOK I KRILO — pozadinsko povlačenje cena
//   GET /.netlify/functions/cene-background?token=ADMIN_TOKEN
//
// Osam izvora u jednom prolazu: kursevi, četiri berzanska ugovora, dva
// Eurostatova indeksa i Euribor sa ECB-a. Eurostat ume da odgovara i po
// nekoliko sekundi, pa obična funkcija sa deset sekundi nije sigurna.
// Pozadinska ima petnaest minuta.
//
// Rezultat ide u keš, a /api/cene samo čita keš.
// ==========================================================================
import { osveziCene } from './_cene.mjs';

export default async (req) => {
  const admin = (process.env.ADMIN_TOKEN || '').trim();
  const url = new URL(req.url);
  const dat = url.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!admin || dat !== admin) {
    return new Response(JSON.stringify({ error: 'Neispravan token' }), {
      status: 401, headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const r = await osveziCene();
    console.log('cene osvežene: ' + r.broj + ' pokazatelja — ' + JSON.stringify(r.izvori));
  } catch (e) {
    console.log('osvežavanje cena nije uspelo: ' + e.message);
  }
  return new Response('ok');
};
