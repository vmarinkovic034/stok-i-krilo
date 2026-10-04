// ==========================================================================
// ŠTOK I KRILO — pozadinsko povlačenje tendera
//   GET /.netlify/functions/tenders-background?token=ADMIN_TOKEN
//
// Zašto pozadinski: TED se pita zasebno za svaku od deset zemalja. Jedan
// zajednički upit je ranije vraćao gotovo samo nemačke nabavke, jer Nemačka
// sama popuni limit. Deset uporednih zahteva TED servira sporije nego jedan,
// pa je obična funkcija sa deset sekundi padala na istek vremena. Pozadinska
// ima petnaest minuta i mirno sačeka sve zemlje.
//
// Rezultat ide u keš, a /api/tenders samo čita keš.
// ==========================================================================
import { osveziTendere } from './tenders.mjs';

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
    const r = await osveziTendere();
    console.log('tenderi osveženi: ' + r.broj + ' — ' + JSON.stringify(r.izvori));
  } catch (e) {
    console.log('osvežavanje tendera nije uspelo: ' + e.message);
  }
  return new Response('ok');
};
