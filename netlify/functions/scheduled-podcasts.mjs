// Automatska obrada podkasta — ponedeljkom u 04:00 UTC, pre dnevnih vesti.
//
// Isti razlog kao kod vesti: transkripcija traje 3-6 minuta, a zakazana
// funkcija ima 30 sekundi. Posao radi run-podcasts-background.
import { bazniURL } from './_mejl.mjs';

export default async () => {
  const token = (process.env.ADMIN_TOKEN || '').trim();
  if (!token) {
    console.log('scheduled-podcasts: ADMIN_TOKEN nije podešen — posao nije pokrenut');
    return;
  }

  const cilj = `${bazniURL()}/.netlify/functions/run-podcasts-background?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(cilj, { signal: AbortSignal.timeout(15000) });
    console.log('scheduled-podcasts: run-podcasts-background pokrenut, HTTP ' + res.status);
  } catch (e) {
    console.log('scheduled-podcasts: pokretanje nije uspelo — ' + e.message);
  }
};

// Raspored je isključen 3. 10. 2026. Funkcija se palila svakog ponedeljka,
// zvala model i pravila epizode — a na portalu nema nijednog mesta gde se
// podkast čuje. Dakle trošak bez čitaoca.
//
// Kod ostaje netaknut. Kad se napravi sekcija na sajtu, vraća se red:
//   export const config = { schedule: '0 4 * * 1' };
//
// Do tada se obrada pokreće ručno:
//   /.netlify/functions/run-podcasts-background?token=ADMIN_TOKEN
export const config = {};
