// Automatsko pokretanje: radnim danima u 05:00 UTC.
//
// Zakazana funkcija ima limit od 30 sekundi, a povlačenje izvora i pisanje
// nacrta traje minutima. Zato ovde ne radimo sam posao, nego samo pokrećemo
// drafts-background (limit 15 minuta) i odmah izlazimo.
import { bazniURL } from './_mejl.mjs';

export default async () => {
  const token = (process.env.ADMIN_TOKEN || '').trim();
  if (!token) {
    console.log('scheduled-drafts: ADMIN_TOKEN nije podešen — posao nije pokrenut');
    return;
  }

  const cilj = `${bazniURL()}/.netlify/functions/drafts-background?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(cilj, { signal: AbortSignal.timeout(15000) });
    console.log('scheduled-drafts: drafts-background pokrenut, HTTP ' + res.status);
  } catch (e) {
    console.log('scheduled-drafts: pokretanje nije uspelo — ' + e.message);
  }
};

export const config = { schedule: '0 5 * * 1-5' };
