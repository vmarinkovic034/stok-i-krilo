// Osvežavanje cena na svaki sat — isto koliko traje keš, pa čitalac praktično
// uvek zatekne svež broj, a ne čeka da ga neko „probudi" prvim otvaranjem
// stranice.
//
// Posao radi cene-background, jer osam izvora ne mora da stane u trideset
// sekundi koliko ima zakazana funkcija.
import { bazniURL } from './_mejl.mjs';

export default async () => {
  const token = (process.env.ADMIN_TOKEN || '').trim();
  if (!token) {
    console.log('scheduled-cene: ADMIN_TOKEN nije podešen — posao nije pokrenut');
    return;
  }

  const cilj = `${bazniURL()}/.netlify/functions/cene-background?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(cilj, { signal: AbortSignal.timeout(15000) });
    console.log('scheduled-cene: pokrenuto, HTTP ' + res.status);
  } catch (e) {
    console.log('scheduled-cene: pokretanje nije uspelo — ' + e.message);
  }
};

export const config = { schedule: '23 * * * *' };
