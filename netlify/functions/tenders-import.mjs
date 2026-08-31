// ==========================================================================
// ŠTOK I KRILO — uvoz srpskih tendera iz XLSX izvoza sa Portala javnih nabavki
// Portal blokira automatsko povlačenje, ali dozvoljava izvoz u Excel.
// Urednik izveze fajl i ubaci ga ovde; ništa se ne izmišlja.
//
// POST /.netlify/functions/tenders-import  { rows: [...] }   (ADMIN_TOKEN)
// GET  ...?token=...                        -> trenutno uvezeni
// ==========================================================================
import { getStore } from '@netlify/blobs';

const KEY = 'tenders-rs.json';
const store = () => getStore('stok-vesti');
const json = (b, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// Ćirilica -> latinica
const C2L = { 'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z','И':'I','Ј':'J','К':'K',
  'Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O','П':'P','Р':'R','С':'S','Т':'T','Ћ':'Ć','У':'U','Ф':'F',
  'Х':'H','Ц':'C','Ч':'Č','Џ':'Dž','Ш':'Š','а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'đ','е':'e','ж':'ž',
  'з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s',
  'т':'t','ћ':'ć','у':'u','ф':'f','х':'h','ц':'c','ч':'č','џ':'dž','ш':'š' };
const lat = (s) => String(s || '').split('').map(c => C2L[c] ?? c).join('').replace(/\s+/g, ' ').trim();

// Samo javni pozivi su prilike. Dodele, ispravke i izmene nisu.
const JE_POZIV = (naziv) => /јавни позив|javni poziv/i.test(String(naziv || ''));

const tipIzNaziva = (t) => {
  const s = t.toLowerCase();
  if (/fasad|фасад/i.test(t)) return ['fasada', 'Fasade'];
  if (/stakl|стакл/i.test(t)) return ['staklo', 'Staklo'];
  if (/ugradnj|montaž|уградњ|монтаж/i.test(t)) return ['montaza', 'Montaža'];
  if (/stolarij|prozor|vrat|столариј|прозор|врат/i.test(t)) return ['stolarija', 'Stolarija'];
  return ['ostalo', 'Ostalo'];
};

const MES = ['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];
const dat = (d) => { const t = new Date(d); if (isNaN(t)) return ''; return t.getDate() + '. ' + MES[t.getMonth()] + ' ' + t.getFullYear(); };

export async function ucitajSrpske() {
  try { return (await store().get(KEY, { type: 'json' })) || []; } catch { return []; }
}

export default async (req) => {
  const admin = process.env.ADMIN_TOKEN;
  const url = new URL(req.url);
  const dat_tok = url.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!admin || dat_tok !== admin) return json({ error: 'Neispravan token' }, 401);

  if (req.method === 'GET') {
    const p = await ucitajSrpske();
    return json({ broj: p.length, items: p });
  }
  if (req.method === 'DELETE') {
    await store().setJSON(KEY, []);
    return json({ ok: true, obrisano: true });
  }
  if (req.method !== 'POST') return json({ error: 'Metod nije podržan' }, 405);

  let b; try { b = await req.json(); } catch { return json({ error: 'Neispravan JSON' }, 400); }
  const rows = Array.isArray(b?.rows) ? b.rows : [];
  if (!rows.length) return json({ error: 'Nema redova u fajlu' }, 400);

  const danas = Date.now();
  const stari = [];
  const nePozivi = [];
  const items = [];

  for (const r of rows) {
    const broj = String(r['Број огласа'] || r['Broj oglasa'] || '').trim();
    const narucilac = String(r['Наручилац'] || r['Narucilac'] || '').trim();
    const naziv = String(r['Назив набавке'] || r['Naziv nabavke'] || '').trim();
    const vrsta = String(r['Назив огласа'] || r['Naziv oglasa'] || '').trim();
    const objava = r['Датум објаве'] || r['Datum objave'] || '';
    if (!broj || !naziv) continue;

    if (!JE_POZIV(vrsta)) { nePozivi.push(broj); continue; }

    const t = new Date(objava);
    const staro = !isNaN(t) && (danas - t.getTime()) > 60 * 86400000;
    if (staro) { stari.push(broj); continue; }

    const naslov = lat(naziv);
    const [tip, tipL] = tipIzNaziva(naziv);
    items.push({
      id: 'rs_' + broj.replace(/[^\w]/g, ''),
      country: 'srbija', countryLabel: 'Srbija', flag: '🇷🇸',
      title: naslov,
      buyer: lat(narucilac) || 'Naručilac',
      location: 'Srbija',
      type: tip, typeLabel: tipL,
      cpv: '', cpvLabel: tipL,
      procedure: lat(vrsta) || 'Javni poziv',
      value: '', valueEur: '',
      published: dat(objava),
      deadline: '', daysLeft: null,
      broj,
      url: 'https://jnportal.ujn.gov.rs/oglasi-svi',
      live: false, src: 'Portal javnih nabavki (uvoz)',
    });
  }

  // najnovije prvo, bez duplikata
  const jedinstveni = [];
  const vidjeni = new Set();
  for (const it of items) { if (!vidjeni.has(it.id)) { vidjeni.add(it.id); jedinstveni.push(it); } }

  await store().setJSON(KEY, jedinstveni.slice(0, 200));

  return json({
    ok: true,
    ukupnoRedova: rows.length,
    uvezeno: jedinstveni.length,
    preskocenoNijePoziv: nePozivi.length,
    preskocenoStarije60dana: stari.length,
    naslovi: jedinstveni.slice(0, 10).map(x => x.title),
  });
};
