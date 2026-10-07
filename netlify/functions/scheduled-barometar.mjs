// Očitavanje cena prozora jednom mesečno, prvog u mesecu u 04:11.
//
// Mesečno, a ne nedeljno, iz dva razloga. Proizvođači menjaju cenovnik
// nekoliko puta godišnje, pa nedeljno očitavanje daje četiri ista zapisa
// umesto jednog i razvodnjava uzorak. I indeks se objavljuje mesečno, pa
// češće merenje ne bi imalo gde da se prikaže.
//
// Minut 11, a ne nulti — tada polovina Netlifajevih poslova kreće odjednom.
import { bazniURL } from './_mejl.mjs';

export default async () => {
  const token = (process.env.ADMIN_TOKEN || '').trim();
  if (!token) {
    console.log('scheduled-barometar: ADMIN_TOKEN nije podešen — posao nije pokrenut');
    return;
  }

  const cilj = `${bazniURL()}/.netlify/functions/barometar-merenje-background?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(cilj, { signal: AbortSignal.timeout(15000) });
    console.log('scheduled-barometar: pokrenuto, HTTP ' + res.status);
  } catch (e) {
    console.log('scheduled-barometar: pokretanje nije uspelo — ' + e.message);
  }
};

export const config = { schedule: '11 4 1 * *' };
