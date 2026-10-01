// ==========================================================================
// ŠTOK I KRILO — javni endpoint: samo ODOBRENE vesti
// GET /api/news
// ==========================================================================
import { readJSON, KEY_APPROVED } from './_lib.mjs';

export default async () => {
  const approved = await readJSON(KEY_APPROVED, []);
  // Redosled po datumu objave izvora, a ne po tome kad je urednik kliknuo
  // „Odobri". Inače starija vest odobrena kasnije ispadne na vrh portala.
  const items = approved
    .slice()
    .sort((a, b) => new Date(b.datumISO || b.approvedAt || 0) - new Date(a.datumISO || a.approvedAt || 0))
    .map(d => ({
      cat: d.cat, catLabel: d.catLabel, date: d.date, title: d.title,
      desc: d.desc, body: d.body, read: d.read, source: d.source, url: d.url, img: d.img,
    }));
  return new Response(JSON.stringify({ items }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
    },
  });
};
