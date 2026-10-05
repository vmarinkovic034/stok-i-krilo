// ==========================================================================
// ŠTOK I KRILO — jednokratni uvoz arhive vesti u bazu uredništva
//   GET /.netlify/functions/news-import
//   GET /.netlify/functions/news-import?stanje=1   -> samo pogled, bez upisa
//
// Nema tokena namerno. Funkcija ne može da uradi ništa što već nije javno:
// upisuje tekstove koji su do danas stajali u index.html, koji svako može da
// pročita. A brava ispod znači da drugi poziv ne radi ništa.
//
// Brava je zaseban ključ u bazi. Ako se funkcija pozove dvaput uporedo, i
// drugi prolaz bi prošao bravu, pa se vesti dodatno spajaju po adresi — isti
// url ne može da uđe dvaput.
//
// Kad arhiva jednom uđe, ovaj fajl i _vesti-arhiva.mjs mogu da se obrišu.
// ==========================================================================
import { readJSON, writeJSON, KEY_APPROVED } from './_lib.mjs';
import { VESTI_ARHIVA } from './_vesti-arhiva.mjs';

const KLJUC_BRAVE = 'arhiva-uvezena.json';
const MAKS = 400;   // odobri.mjs seče na 200; arhiva od 34 mora da stane uz nacrte

const odgovor = (telo, status = 200) => new Response(JSON.stringify(telo, null, 1), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default async (req) => {
  const url = new URL(req.url);
  const brava = await readJSON(KLJUC_BRAVE, null);
  const odobrene = await readJSON(KEY_APPROVED, []);

  if (url.searchParams.has('stanje')) {
    return odgovor({
      uvezeno: Boolean(brava), brava,
      uArhivi: VESTI_ARHIVA.length,
      uBazi: odobrene.length,
      izArhive: odobrene.filter(d => d.poreklo === 'arhiva').length,
    });
  }

  if (brava) {
    return odgovor({ poruka: 'Arhiva je već uvezena, ništa nije promenjeno.', brava,
      uBazi: odobrene.length, izArhive: odobrene.filter(d => d.poreklo === 'arhiva').length });
  }

  const postojeci = new Set(odobrene.map(d => d.url).filter(Boolean));
  const novi = VESTI_ARHIVA
    .filter(v => v.url && !postojeci.has(v.url))
    .map(v => ({ ...v, approvedAt: v.datumISO }));

  // Redosled po datumu objave, kao što ga i /api/news posle drži.
  const spojene = [...odobrene, ...novi]
    .sort((a, b) => new Date(b.datumISO || b.approvedAt || 0) - new Date(a.datumISO || a.approvedAt || 0))
    .slice(0, MAKS);

  await writeJSON(KEY_APPROVED, spojene);
  const zapis = { kada: new Date().toISOString(), dodato: novi.length, ukupno: spojene.length };
  await writeJSON(KLJUC_BRAVE, zapis);

  return odgovor({ poruka: 'Arhiva je uvezena.', ...zapis,
    preskoceno: VESTI_ARHIVA.length - novi.length });
};
