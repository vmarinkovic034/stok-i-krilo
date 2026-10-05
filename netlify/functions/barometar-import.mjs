// ==========================================================================
// ŠTOK I KRILO — jednokratni upis barometra u bazu
//   GET /.netlify/functions/barometar-import
//   GET /.netlify/functions/barometar-import?stanje=1
//
// Kao i kod vesti i kompanija: bez tokena, jer upisuje podatke koji su do
// danas stajali u index.html i koje svako može da pročita. Brava znači da
// drugi poziv ne radi ništa.
// ==========================================================================
import { readJSON, writeJSON, KLJUC_BAROMETAR } from './_lib.mjs';
import { BAROMETAR_SEME } from './_barometar-seme.mjs';

const KLJUC_BRAVE = 'barometar-uvezen.json';

const odgovor = (telo) => new Response(JSON.stringify(telo, null, 1), {
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default async (req) => {
  const url = new URL(req.url);
  const brava = await readJSON(KLJUC_BRAVE, null);
  const postojeci = await readJSON(KLJUC_BAROMETAR, null);

  if (url.searchParams.has('stanje')) {
    return odgovor({ uvezeno: Boolean(brava), brava, uBazi: postojeci ? (postojeci.merenja || []).length : 0 });
  }
  if (brava) return odgovor({ poruka: 'Barometar je već upisan, ništa nije promenjeno.', brava });

  await writeJSON(KLJUC_BAROMETAR, BAROMETAR_SEME);
  const zapis = { kada: new Date().toISOString(), merenja: BAROMETAR_SEME.merenja.length };
  await writeJSON(KLJUC_BRAVE, zapis);
  return odgovor({ poruka: 'Barometar je upisan.', ...zapis });
};
