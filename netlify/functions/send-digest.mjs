// Ručno slanje digesta - dugme "Pošalji digest na mejl" u /admin.html
// GET /.netlify/functions/send-digest?token=ADMIN_TOKEN
import { readJSON, KEY_DRAFTS, json } from './_lib.mjs';
import { posaljiDigest } from './_mejl.mjs';

export default async (req) => {
  const admin = (process.env.ADMIN_TOKEN || '').trim();
  const url = new URL(req.url);
  const dat = url.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!admin) return json({ error: 'ADMIN_TOKEN nije podešen u Netlify env varijablama' }, 500);
  if (dat !== admin) return json({ error: 'Neispravan token' }, 401);

  const drafts = await readJSON(KEY_DRAFTS, []);
  if (!drafts.length) return json({ ok: true, poslato: false, razlog: 'Nema nacrta u redu.' });

  try {
    const r = await posaljiDigest(drafts.slice(0, 10));
    return json({ ok: true, ...r });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
