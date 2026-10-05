// ==========================================================================
// ŠTOK I KRILO — jednokratni upis početnog spiska kompanija
//   GET /.netlify/functions/kompanije-import
//   GET /.netlify/functions/kompanije-import?stanje=1   -> samo pogled
//
// Isto kao kod vesti: bez tokena, jer upisuje podatke koji su do danas stajali
// u index.html i koje svako može da pročita. Brava znači da drugi poziv ne
// radi ništa, a spajanje po nazivu firme sprečava dvostruki unos ako se ipak
// pozove dvaput uporedo.
// ==========================================================================
import { readJSON, writeJSON, KLJUC_FIRME } from './_lib.mjs';
import { FIRME_SEME } from './_firme-seme.mjs';

const KLJUC_BRAVE = 'firme-uvezene.json';

const kljuc = (ime) => String(ime || '').trim().toLowerCase();

const odgovor = (telo) => new Response(JSON.stringify(telo, null, 1), {
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default async (req) => {
  const url = new URL(req.url);
  const brava = await readJSON(KLJUC_BRAVE, null);
  const postojece = await readJSON(KLJUC_FIRME, []);

  if (url.searchParams.has('stanje')) {
    return odgovor({ uvezeno: Boolean(brava), brava, uSemenu: FIRME_SEME.length, uBazi: postojece.length });
  }
  if (brava) {
    return odgovor({ poruka: 'Spisak je već upisan, ništa nije promenjeno.', brava, uBazi: postojece.length });
  }

  const imena = new Set(postojece.map(f => kljuc(f.name)));
  const nove = FIRME_SEME
    .filter(f => f.name && !imena.has(kljuc(f.name)))
    .map(f => ({ ...f, odobreno: true, upisano: new Date().toISOString() }));

  const spojene = [...postojece, ...nove];
  await writeJSON(KLJUC_FIRME, spojene);
  const zapis = { kada: new Date().toISOString(), dodato: nove.length, ukupno: spojene.length };
  await writeJSON(KLJUC_BRAVE, zapis);

  return odgovor({ poruka: 'Spisak kompanija je upisan.', ...zapis });
};
