// ==========================================================================
// ŠTOK I KRILO — uredničke operacije nad nacrtima (zaštićeno ADMIN_TOKEN-om)
//   GET  /api/drafts                      -> lista nacrta + odobrenih
//   POST /api/drafts  {action, id, patch} -> approve | reject | update | unpublish
// ==========================================================================
import { readJSON, writeJSON, KEY_DRAFTS, KEY_APPROVED, json } from './_lib.mjs';

const auth = (req) => {
  const t = process.env.ADMIN_TOKEN;
  if (!t) return false;
  const url = new URL(req.url);
  return req.headers.get('x-admin-token') === t || url.searchParams.get('token') === t;
};

export default async (req) => {
  if (!auth(req)) return json({ error: 'Neovlašćen pristup' }, 401);

  let drafts = await readJSON(KEY_DRAFTS, []);
  let approved = await readJSON(KEY_APPROVED, []);

  if (req.method === 'GET') return json({ drafts, approved });

  if (req.method !== 'POST') return json({ error: 'Metod nije podržan' }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: 'Neispravan JSON' }, 400); }
  const { action, id, patch } = b || {};
  if (!action || !id) return json({ error: 'Nedostaje action ili id' }, 400);

  const i = drafts.findIndex(d => d.id === id);

  if (action === 'update') {
    if (i < 0) return json({ error: 'Nacrt nije pronađen' }, 404);
    drafts[i] = { ...drafts[i], ...(patch || {}) };
    await writeJSON(KEY_DRAFTS, drafts);
    return json({ ok: true, draft: drafts[i] });
  }

  if (action === 'approve') {
    if (i < 0) return json({ error: 'Nacrt nije pronađen' }, 404);
    const d = { ...drafts[i], ...(patch || {}), status: 'objavljeno', approvedAt: new Date().toISOString() };
    drafts.splice(i, 1);
    approved = [d, ...approved].slice(0, 200);
    await writeJSON(KEY_DRAFTS, drafts);
    await writeJSON(KEY_APPROVED, approved);
    return json({ ok: true, objavljeno: d.title });
  }

  if (action === 'reject') {
    if (i < 0) return json({ error: 'Nacrt nije pronađen' }, 404);
    const t = drafts[i].title;
    drafts.splice(i, 1);
    await writeJSON(KEY_DRAFTS, drafts);
    return json({ ok: true, odbaceno: t });
  }

  if (action === 'unpublish') {
    const j = approved.findIndex(d => d.id === id);
    if (j < 0) return json({ error: 'Vest nije pronađena' }, 404);
    const d = { ...approved[j], status: 'nacrt' };
    approved.splice(j, 1);
    drafts = [d, ...drafts];
    await writeJSON(KEY_DRAFTS, drafts);
    await writeJSON(KEY_APPROVED, approved);
    return json({ ok: true, vraceno: d.title });
  }

  return json({ error: 'Nepoznata akcija' }, 400);
};
