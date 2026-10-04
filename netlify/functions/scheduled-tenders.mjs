// Osvežavanje tendera na svaka tri sata — isti razmak kao što traje keš, pa
// čitalac praktično uvek zatekne svež spisak, a ne čeka da ga neko „probudi"
// prvim otvaranjem stranice.
//
// Posao radi tenders-background, jer deset upita ka TED-u ne stane u trideset
// sekundi koliko ima zakazana funkcija.
import { bazniURL } from './_mejl.mjs';

export default async () => {
  const token = (process.env.ADMIN_TOKEN || '').trim();
  if (!token) {
    console.log('scheduled-tenders: ADMIN_TOKEN nije podešen — posao nije pokrenut');
    return;
  }

  const cilj = `${bazniURL()}/.netlify/functions/tenders-background?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(cilj, { signal: AbortSignal.timeout(15000) });
    console.log('scheduled-tenders: pokrenuto, HTTP ' + res.status);
  } catch (e) {
    console.log('scheduled-tenders: pokretanje nije uspelo — ' + e.message);
  }
};

export const config = { schedule: '7 */3 * * *' };
