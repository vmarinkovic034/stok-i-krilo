// ==========================================================================
// ŠTOK I KRILO — uredničke operacije nad direktorijumom (ADMIN_TOKEN)
//   GET  /api/firme                        -> na čekanju + objavljene
//   POST /api/firme  {akcija, id, izmena}  -> odobri | odbaci | skini | izmeni
//
// Prijava firme sa sajta odmah upada u direktorijum sa `odobreno: false`.
// Urednik je ovde pusti na sajt ili odbaci. Do 5. 10. 2026. prijava je
// stizala samo na mejl, pa se firma u direktorijum upisivala prekucavanjem.
// ==========================================================================
import { readJSON, writeJSON, KLJUC_FIRME, json } from './_lib.mjs';

const auth = (req) => {
  const t = (process.env.ADMIN_TOKEN || '').trim();
  if (!t) return false;
  const url = new URL(req.url);
  return req.headers.get('x-admin-token') === t || url.searchParams.get('token') === t;
};

export default async (req) => {
  if (!auth(req)) return json({ error: 'Neovlašćen pristup' }, 401);

  const sve = await readJSON(KLJUC_FIRME, []);

  if (req.method === 'GET') {
    return json({
      naCekanju: sve.filter(f => f.odobreno === false),
      objavljene: sve.filter(f => f.odobreno !== false),
    });
  }

  if (req.method !== 'POST') return json({ error: 'Metod nije podržan' }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: 'Neispravan JSON' }, 400); }
  const { akcija, id, izmena } = b || {};
  if (!akcija || !id) return json({ error: 'Nedostaje akcija ili id' }, 400);

  const i = sve.findIndex(f => f.id === id);
  if (i < 0) return json({ error: 'Firma nije pronađena' }, 404);
  const naziv = sve[i].name;

  if (akcija === 'odobri') {
    sve[i] = { ...sve[i], ...(izmena || {}), odobreno: true, odobrenoKada: new Date().toISOString() };
    await writeJSON(KLJUC_FIRME, sve);
    return json({ ok: true, objavljeno: sve[i].name });
  }

  if (akcija === 'izmeni') {
    sve[i] = { ...sve[i], ...(izmena || {}) };
    await writeJSON(KLJUC_FIRME, sve);
    return json({ ok: true, izmenjeno: sve[i].name });
  }

  if (akcija === 'skini') {
    // Skidanje sa sajta nije brisanje. Firma se vraća među prijave, pa može
    // da se ispravi i vrati bez ponovnog kucanja.
    sve[i] = { ...sve[i], odobreno: false };
    await writeJSON(KLJUC_FIRME, sve);
    return json({ ok: true, skinuto: naziv });
  }

  if (akcija === 'odbaci') {
    sve.splice(i, 1);
    await writeJSON(KLJUC_FIRME, sve);
    return json({ ok: true, odbaceno: naziv });
  }

  return json({ error: 'Nepoznata akcija' }, 400);
};
