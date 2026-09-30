// ==========================================================================
// ŠTOK I KRILO — pozadinsko povlačenje izvora, pisanje nacrta i digest
//
// Zašto background: povlačenje četiri izvora plus pisanje pet tekstova traje
// nekoliko minuta. Standardna Netlify funkcija ima 10 sekundi, zakazana 30 —
// ni jedno ni drugo nije dovoljno, pa je posao svaki put padao na timeout.
// Background funkcija ima 15 minuta i odmah vraća 202.
//
// Poziva je scheduled-drafts.mjs (automatski) i dugme u /admin.html (ručno).
// GET /.netlify/functions/drafts-background?token=ADMIN_TOKEN
// ==========================================================================
import { generisi } from './_generator.mjs';
import { readJSON, KEY_DRAFTS } from './_lib.mjs';
import { posaljiDigest } from './_mejl.mjs';

export default async (req) => {
  const admin = (process.env.ADMIN_TOKEN || '').trim();
  const url = new URL(req.url);
  const dat = url.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!admin || dat !== admin) {
    return new Response(JSON.stringify({ error: 'Neispravan token' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const r = await generisi();
  console.log('drafts-background:', await r.clone().text());

  // Digest ide tek pošto su nacrti upisani. Ako slanje padne, generisanje
  // ostaje uspešno — nacrti čekaju u adminu kao i do sada.
  try {
    const drafts = await readJSON(KEY_DRAFTS, []);
    const r2 = await posaljiDigest(drafts.slice(0, 10));
    console.log('digest:', JSON.stringify(r2));
  } catch (e) {
    console.log('digest nije poslat: ' + e.message);
  }

  return r;
};
