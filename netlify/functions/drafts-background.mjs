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
import { readJSON, writeJSON, KEY_DRAFTS, KEY_APPROVED, KEY_SEEN, KEY_LAST_RUN } from './_lib.mjs';
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

  // Nadoknada propuštenog: ?poizvoru=10&maks=15 gleda dublje u izvore i piše
  // više tekstova odjednom. Bez parametara ostaje dnevni režim (4 i 5).
  const broj = (ime, podrazumevano, gornja) => {
    const v = parseInt(url.searchParams.get(ime) || '', 10);
    return Number.isFinite(v) && v > 0 ? Math.min(v, gornja) : podrazumevano;
  };
  const opcije = { poIzvoru: broj('poizvoru', 4, 20), maks: broj('maks', 5, 25) };

  const zapis = { pokrenuto: new Date().toISOString(), opcije };

  // ?ponovo=1 — briše sve nacrte i objavljene vesti i zaboravlja obrađene
  // URL-ove, pa se isti izvori ponovo pišu po novim uredničkim pravilima.
  // Stari sadržaj se pre brisanja odlaže u arhivu, da ništa ne nestane.
  if (url.searchParams.get('ponovo') === '1') {
    const stariNacrti = await readJSON(KEY_DRAFTS, []);
    const stareVesti = await readJSON(KEY_APPROVED, []);
    await writeJSON('arhiva-pre-ponovnog-pisanja.json', {
      kada: new Date().toISOString(), nacrti: stariNacrti, objavljeno: stareVesti,
    });
    await writeJSON(KEY_DRAFTS, []);
    await writeJSON(KEY_APPROVED, []);
    await writeJSON(KEY_SEEN, []);
    zapis.ponovo = { obrisano_nacrta: stariNacrti.length, obrisano_objavljenih: stareVesti.length };
    console.log('ponovo=1:', JSON.stringify(zapis.ponovo));
  }

  let r;
  try {
    r = await generisi(opcije);
    const tekst = await r.clone().text();
    console.log('drafts-background:', tekst);
    try { zapis.generisanje = JSON.parse(tekst); }
    catch { zapis.generisanje = { sirovo: tekst.slice(0, 1000) }; }
  } catch (e) {
    console.log('generisanje je puklo: ' + e.message);
    zapis.generisanje = { greska: e.message };
  }

  // Digest ide tek pošto su nacrti upisani. Ako slanje padne, generisanje
  // ostaje uspešno — nacrti čekaju u adminu kao i do sada.
  try {
    const drafts = await readJSON(KEY_DRAFTS, []);
    zapis.digest = await posaljiDigest(drafts.slice(0, 10));
    console.log('digest:', JSON.stringify(zapis.digest));
  } catch (e) {
    console.log('digest nije poslat: ' + e.message);
    zapis.digest = { poslato: false, razlog: e.message };
  }

  zapis.zavrseno = new Date().toISOString();
  try { await writeJSON(KEY_LAST_RUN, zapis); } catch (e) { console.log('zapis nije sacuvan: ' + e.message); }

  return r || new Response('ok');
};
