// ==========================================================================
// ŠTOK I KRILO — tenderi sa servera (browser ne sme zbog CORS-a)
// GET /api/tenders            -> keširan rezultat (3h)
// GET /api/tenders?debug=1    -> dijagnostika svakog izvora
// GET /api/tenders?fresh=1    -> zaobiđi keš
// ==========================================================================
import { getStore } from '@netlify/blobs';
import { ucitajSrpske } from './tenders-import.mjs';

const CPV = ['44221000','44221100','44221200','45421000','45421100','44112400'];
const KEY = 'tenders-cache.json';
const TTL = 3 * 60 * 60 * 1000;

const store = () => getStore('stok-vesti');
const UA = 'Mozilla/5.0 (compatible; StokIKriloBot/1.0; +https://stok-i-krilo.netlify.app)';

const dana = (d) => {
  if (!d) return null;
  const t = new Date(d); if (isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / 86400000));
};
const datum = (d) => {
  if (!d) return '';
  const t = new Date(d); if (isNaN(t)) return String(d).slice(0, 10);
  const M = ['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];
  return t.getDate() + '. ' + M[t.getMonth()] + ' ' + t.getFullYear();
};
const tipZaCpv = (c) => {
  const s = String(c || '');
  if (s.startsWith('44112') || s.startsWith('44163')) return ['fasada', 'Fasade'];
  if (s.startsWith('45421100')) return ['montaza', 'Montaža'];
  if (s.startsWith('45421')) return ['stolarija', 'Stolarija'];
  if (s.startsWith('44221')) return ['stolarija', 'Stolarija'];
  return ['ostalo', 'Ostalo'];
};
// TED vraća ISO3 kodove (HRV, SVN, DEU...)
const ZASTAVE = {
  HRV:['hrvatska','Hrvatska','🇭🇷'], SVN:['slovenija','Slovenija','🇸🇮'], ROU:['rumunija','Rumunija','🇷🇴'],
  BGR:['bugarska','Bugarska','🇧🇬'], ITA:['italija','Italija','🇮🇹'], DEU:['nemacka','Nemačka','🇩🇪'],
  AUT:['austrija','Austrija','🇦🇹'], CHE:['svajcarska','Švajcarska','🇨🇭'], GRC:['grcka','Grčka','🇬🇷'],
  HUN:['madjarska','Mađarska','🇭🇺'], SRB:['srbija','Srbija','🇷🇸'],
};
// Zemlje koje prikazujemo - region + zapadna Evropa gde balkanske firme realno izvoze
const ZEMLJE = ['HRV','SVN','ROU','BGR','ITA','DEU','AUT','CHE','GRC','HUN'];
// Samo CPV kodovi koji su stvarno stolarija / fasada / staklo
const CPV_OK = ['44221','45421','441124'];

// TED vraća classification-cpv kao niz - treba pogledati SVE kodove, ne samo prvi
const sviCpv = (v) => {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(sviCpv);
  if (typeof v === 'object') return Object.values(v).flatMap(sviCpv);
  return [String(v)];
};

const tekst = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return tekst(v[0]);
  if (typeof v === 'object') return tekst(v.eng || v.en || v.deu || Object.values(v)[0]);
  return String(v);
};

// ── TED EU ────────────────────────────────────────────────────────────────
async function ted(dijag) {
  // Ključ iz env varijable; ako nije podešen, koristi se onaj iz koda (besplatan, javan).
  const key = process.env.TED_API_KEY || 'dec3c29a94794d2896513c7a7f29da92';
  if (!key) { dijag.ted = 'nema TED_API_KEY'; return []; }

  const od = new Date(Date.now() - 25 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  const body = {
    query: `classification-cpv IN (${CPV.map(c => `"${c}"`).join(' ')}) AND buyer-country IN (${ZEMLJE.map(c => `"${c}"`).join(' ')}) AND publication-date >= ${od}`,
    fields: ['publication-number','notice-title','buyer-name','buyer-country','classification-cpv',
             'deadline-receipt-request','deadline-receipt-tender-date-lot','publication-date',
             'total-value','links'],
    page: 1, limit: 250,
    scope: 'ACTIVE',
  };

  try {
    const r = await fetch('https://api.ted.europa.eu/v3/notices/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json', 'TED-API-Key': key, 'user-agent': UA },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const raw = await r.text();
    if (!r.ok) { dijag.ted = 'HTTP ' + r.status + ': ' + raw.slice(0, 200); return []; }
    const d = JSON.parse(raw);
    const n = d.notices || d.results || d.items || [];
    dijag.ted = 'ok, ' + n.length + ' zapisa';
    dijag.uzorakPolja = n[0] ? Object.keys(n[0]) : [];
    dijag.uzorakRok = n.slice(0, 3).map(x => ({
      dr: x['deadline-receipt-request'],
      dt: x['deadline-receipt-tender-date-lot'],
    }));

    const mapirani = n.map((x, i) => {
      const c = String(tekst(x['buyer-country']) || '').toUpperCase().slice(0, 3);
      const cpvSvi = sviCpv(x['classification-cpv']);
      const nas = cpvSvi.find(c => CPV_OK.some(p => c.startsWith(p)));
      const [tip, tipL] = tipZaCpv(nas || cpvSvi[0]);
      const z = ZASTAVE[c];
      if (!z) return null;
      const rok = tekst(x['deadline-receipt-request']) || tekst(x['deadline-receipt-tender-date-lot']);
      return {
        id: 'ted' + i, country: z[0], countryLabel: z[1], flag: z[2],
        title: tekst(x['notice-title']).slice(0, 200) || 'Nabavka',
        buyer: tekst(x['buyer-name']) || 'Naručilac',
        location: z[1], type: tip, typeLabel: tipL,
        cpv: nas || cpvSvi[0] || '', cpvLabel: tipL,
        procedure: 'EU postupak',
        value: tekst(x['total-value']) || '', valueEur: '',
        published: datum(x['publication-date']), deadline: datum(rok), daysLeft: dana(rok),
        url: (x.links && (x.links.pdf?.ENG || x.links.html?.ENG)) ||
             ('https://ted.europa.eu/en/notice/-/detail/' + (x['publication-number'] || '')),
        live: true, src: 'TED EU',
        _cpv: cpvSvi.join(' '), _ima: !!nas,
        _pub: x['publication-date'] || '',
      };
    }).filter(Boolean);

    // Zadrži samo stvarnu stolariju/fasadu/staklo i nešto što još nije isteklo
    const poCpv = mapirani.filter(t => t._ima);
    const cisti = poCpv
      .filter(t => t.daysLeft !== null && t.daysLeft > 0)
      .sort((a, b) => String(b._pub).localeCompare(String(a._pub)));

    const poZemlji = {};
    const uravnotezeni = cisti.filter(t => {
      poZemlji[t.country] = (poZemlji[t.country] || 0) + 1;
      return poZemlji[t.country] <= 6;
    }).slice(0, 40)
      .map(({ _cpv, _pub, _ima, ...rest }) => rest);

    dijag.ted = 'ok, ' + n.length + ' zapisa -> ' + poCpv.length + ' po CPV-u -> ' + cisti.length + ' sa aktivnim rokom -> ' + uravnotezeni.length + ' prikazano';
    dijag.zemlje = poZemlji;
    return uravnotezeni;
  } catch (e) { dijag.ted = 'greška: ' + e.message; return []; }
}

export default async (req) => {
  const url = new URL(req.url);


  const debug = url.searchParams.has('debug');
  const fresh = url.searchParams.has('fresh');

  if (!fresh && !debug) {
    try {
      const c = await store().get(KEY, { type: 'json' });
      if (c && Date.now() - c.ts < TTL) {
        return new Response(JSON.stringify({ ...c, kes: true }), {
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=1800' },
        });
      }
    } catch {}
  }

  const dijag = {};
  const [a, rs] = await Promise.all([ted(dijag), ucitajSrpske()]);
  dijag.srbijaUvoz = rs.length + ' uvezenih (XLSX izvoz sa Portala javnih nabavki)';
  const items = [...rs, ...a];
  const rezultat = { ts: Date.now(), broj: items.length, items, izvori: dijag };

  try { await store().setJSON(KEY, rezultat); } catch {}

  return new Response(JSON.stringify(debug ? rezultat : { ...rezultat, izvori: undefined }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};
