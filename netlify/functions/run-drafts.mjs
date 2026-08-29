// HTTP okidač za dugme "Povuci nove vesti sada" u /admin.html
// GET /.netlify/functions/run-drafts?token=ADMIN_TOKEN
import { generisi } from './_generator.mjs';
import { json } from './_lib.mjs';

export default async (req) => {
  const admin = process.env.ADMIN_TOKEN;
  const url = new URL(req.url);
  const dat = url.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!admin) return json({ error: 'ADMIN_TOKEN nije podešen u Netlify env varijablama' }, 500);
  if (dat !== admin) return json({ error: 'Neispravan token' }, 401);
  return await generisi();
};
