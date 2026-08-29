// Automatsko pokretanje: radnim danima u 05:00 UTC.
// Netlify ne dozvoljava HTTP poziv scheduled funkcije - zato postoji run-drafts.mjs.
import { generisi } from './_generator.mjs';

export default async () => {
  const r = await generisi();
  console.log('scheduled-drafts:', await r.clone().text());
  return r;
};

export const config = { schedule: '0 5 * * 1-5' };
