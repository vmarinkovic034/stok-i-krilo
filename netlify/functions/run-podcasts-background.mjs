// Ručno pokretanje podkast obrade iz /admin.html
// Background funkcija - transkripcija traje duže od standardnog limita.
// GET /.netlify/functions/run-podcasts-background?token=ADMIN_TOKEN
import { generisiIzPodkasta } from './_podkast-generator.mjs';

export default async (req) => {
  const admin = process.env.ADMIN_TOKEN;
  const url = new URL(req.url);
  const dat = url.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!admin || dat !== admin) {
    return new Response(JSON.stringify({ error: 'Neispravan token' }), { status: 401 });
  }
  // maks se može zadati u adresi: &maks=5. Podrazumevano tri — svaka
  // epizoda znači skidanje do 24 MB zvuka, transkripciju i jedan poziv modela,
  // pa broj diže trošak i vreme.
  const maks = Math.min(8, Math.max(1, parseInt(url.searchParams.get('maks') || '3', 10) || 3));
  const r = await generisiIzPodkasta({ maks });
  console.log('run-podcasts:', await r.clone().text());
  return r;
};
