// ==========================================================================
// ŠTOK I KRILO — mesečno očitavanje javnih cena prozora
//   GET /.netlify/functions/barometar-merenje-background?token=ADMIN_TOKEN
//
// Prolazi kroz registar izvora, čita objavljene cenovnike i upisuje svako
// očitavanje kao nov zapis. Ništa se ne prepisuje — vrednost baze raste
// svakog meseca, a ne stoji na mestu.
//
// Pozadinska funkcija jer osam izvora sa po dvadeset pet sekundi prekida ne
// staje u deset sekundi koliko ima obična. Pad jednog izvora ne ruši prolaz:
// greška se zabeleži i posao ide dalje. Jedan sajt koji je taj dan bio dole
// ne sme da nam pojede ceo mesec.
// ==========================================================================
import { IZVORI, ocitajIzvor } from './_barometar-izvori.mjs';
import { dodajZapise, upisiProlaz } from './_barometar-zapisi.mjs';

export async function ocitajSve(samoIzvor = null) {
  const spisak = samoIzvor ? IZVORI.filter(i => i.id === samoIzvor) : IZVORI;
  if (!spisak.length) throw new Error('nepoznat izvor: ' + samoIzvor);

  const svi = [];
  const poIzvoru = {};
  const greske = [];

  for (const izv of spisak) {
    try {
      const zapisi = await ocitajIzvor(izv);
      svi.push(...zapisi);
      poIzvoru[izv.id] = zapisi.length;
      console.log('[' + izv.id + '] ' + zapisi.length + ' cena');
    } catch (e) {
      poIzvoru[izv.id] = 'greska';
      greske.push(izv.id + ': ' + e.message);
      console.log('[' + izv.id + '] GREŠKA: ' + e.message);
    }
  }

  const upis = svi.length ? await dodajZapise(svi) : { dodato: 0, preskoceno: 0, ukupno: null };
  const izvestaj = { izvora: spisak.length, ocitano: svi.length, ...upis, poIzvoru, greske };
  await upisiProlaz(izvestaj);
  return izvestaj;
}

export default async (req) => {
  const admin = (process.env.ADMIN_TOKEN || '').trim();
  const url = new URL(req.url);
  const dat = url.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!admin || dat !== admin) {
    return new Response(JSON.stringify({ error: 'Neispravan token' }), {
      status: 401, headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const r = await ocitajSve(url.searchParams.get('izvor'));
    console.log('barometar: ' + JSON.stringify(r));
  } catch (e) {
    console.log('barometar: prolaz nije uspeo — ' + e.message);
  }
  return new Response('ok');
};
