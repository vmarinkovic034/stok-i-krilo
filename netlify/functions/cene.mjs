// ==========================================================================
// ŠTOK I KRILO — cene sa servera
//   GET /api/cene              -> keširan rezultat (1h)
//   GET /api/cene?debug=1      -> stanje svakog izvora
//   GET /api/cene?istorija=1   -> niz dnevnih merenja po pokazatelju
//
// Do 5. 10. 2026. cene je povlačio pregledač čitaoca preko tuđeg besplatnog
// posrednika. Kad posrednik padne, čitalac vidi rezervne brojeve iz koda i
// nema načina da to primeti. Sada povlači server, a stranica samo čita
// gotov rezultat sa vremenom poslednjeg očitavanja.
// ==========================================================================
import { getStore } from '@netlify/blobs';
import { STORE_CENE, KLJUC_CENE, KLJUC_ISTORIJA } from './_cene.mjs';

const TTL = 60 * 60 * 1000;
const store = () => getStore(STORE_CENE);

// Pokreće osvežavanje i ne čeka ga. Odgovor čitaocu ne sme da visi zbog
// Eurostata ili Jahua.
async function zatraziOsvezavanje(req) {
  const admin = (process.env.ADMIN_TOKEN || '').trim();
  if (!admin) return;
  const osnova = new URL(req.url).origin;
  try {
    await fetch(osnova + '/.netlify/functions/cene-background?token=' + encodeURIComponent(admin),
      { signal: AbortSignal.timeout(3000) });
  } catch { /* 202 stiže odmah; ako ne stigne, sledeći zahtev pokušava ponovo */ }
}

export default async (req) => {
  const url = new URL(req.url);
  const debug = url.searchParams.has('debug');

  if (url.searchParams.has('istorija')) {
    let ist = {};
    try { ist = (await store().get(KLJUC_ISTORIJA, { type: 'json' })) || {}; } catch {}
    return new Response(JSON.stringify(ist), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
  }

  let c = null;
  try { c = await store().get(KLJUC_CENE, { type: 'json' }); } catch {}

  const svez = c && Date.now() - c.ts < TTL;
  // Istekao keš se i dalje prikazuje, a osvežavanje kreće u pozadini. Bolje
  // je videti jučerašnji kurs sa tačnim vremenom očitavanja nego prazno polje.
  if (!svez) await zatraziOsvezavanje(req);

  const telo = c
    ? { ...c, kes: true, svez: Boolean(svez) }
    : { ts: Date.now(), ocitano: null, broj: 0, stavke: [], poId: {}, kes: false, svez: false,
        poruka: 'Prvo povlačenje je u toku.' };

  return new Response(JSON.stringify(debug ? telo : { ...telo, izvori: undefined }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': svez ? 'public, max-age=900' : 'no-store',
    },
  });
};
