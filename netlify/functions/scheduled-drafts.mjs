// Automatsko pokretanje: radnim danima u 05:00 UTC.
// Netlify ne dozvoljava HTTP poziv scheduled funkcije - zato postoji run-drafts.mjs.
import { generisi } from './_generator.mjs';
import { readJSON, KEY_DRAFTS } from './_lib.mjs';
import { posaljiDigest } from './_mejl.mjs';

export default async () => {
  const r = await generisi();
  const izvestaj = await r.clone().text();
  console.log('scheduled-drafts:', izvestaj);

  // Digest ide tek pošto su nacrti upisani. Ako slanje padne, generisanje
  // ostaje uspešno - nacrti čekaju u adminu kao i do sada.
  try {
    const drafts = await readJSON(KEY_DRAFTS, []);
    const r2 = await posaljiDigest(drafts.slice(0, 10));
    console.log('digest:', JSON.stringify(r2));
  } catch (e) {
    console.log('digest nije poslat: ' + e.message);
  }

  return r;
};

export const config = { schedule: '0 5 * * 1-5' };
