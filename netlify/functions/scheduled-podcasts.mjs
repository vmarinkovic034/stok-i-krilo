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

// Raspored je bio isključen 3. 10. 2026, uz obrazloženje da na portalu nema
// mesta gde se podkast čuje. To je bila pogrešna mera: ovaj posao ne pravi
// stranicu sa epizodama, nego VEST iz epizode, koja ide u iste nacrte kao i
// sve ostalo. Mesto je dakle uvek postojalo.
//
// Vraćeno 1. 11. 2026, kad je napravljena rubrika Stavovi. Podkast je jedini
// izvor pravih intervjua koji imamo — pres sobe proizvođača daju jubileje i
// pripravnike, a na podkastu čovek iz branše govori svoje, pod imenom.
//
// Ponedeljkom u 04:00 UTC, pre dnevnih vesti. Tri epizode po krugu.
// Ručno, sa svojim brojem:
//   /.netlify/functions/run-podcasts-background?token=ADMIN_TOKEN&maks=5
export const config = { schedule: '0 4 * * 1' };
