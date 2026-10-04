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
const UA = 'Mozilla/5.0 (compatible; StokIKriloBot/1.0; +https://stokikrilo.com)';

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

const POLJA = ['publication-number','notice-title','buyer-name','buyer-country','classification-cpv',
  'deadline-receipt-request','deadline-receipt-tender-date-lot','publication-date',
  'total-value','links'];

// Jedan upit po zemlji. Ranije je išao jedan zajednički upit sa limitom 250 za
// svih deset zemalja — a Nemačka objavljuje toliko nabavki da je sama punila
// celu kvotu. Od 120 upotrebljivih, 109 je bilo nemačkih, dok iz Hrvatske,
// Slovenije i Bugarske nije prolazila nijedna. Portal se zove balkanski, pa
// svaka zemlja treba da ima svoj prozor, a ne da se takmiči za zajednički.
async function tedZaZemlju(kod, key, od) {
  const body = {
    query: `classification-cpv IN (${CPV.map(c => `"${c}"`).join(' ')}) AND buyer-country IN ("${kod}") AND publication-date >= ${od}`,
    fields: POLJA,
    page: 1, limit: 40,
    scope: 'ACTIVE',
  };
  const r = await fetch('https://api.ted.europa.eu/v3/notices/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json', 'TED-API-Key': key, 'user-agent': UA },
    body: JSON.stringify(body),
    // Deset uporednih zahteva TED servira sporije nego jedan, pa je osam
    // sekundi bilo premalo — četiri zemlje su padale na istek vremena.
    // Posao sada radi pozadinska funkcija, koja ima petnaest minuta.
    signal: AbortSignal.timeout(60000),
  });
  const raw = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + raw.slice(0, 160));
  const d = JSON.parse(raw);
  return d.notices || d.results || d.items || [];
}

// ── TED EU ────────────────────────────────────────────────────────────────
async function ted(dijag) {
  // Ključ isključivo iz Netlify promenljive. Ranije je ovde stajao i zapisan
  // u kodu, kao rezerva — a repozitorijum je javan, pa je svako mogao da ga
  // pročita i potroši dnevnu kvotu umesto nas.
  const key = (process.env.TED_API_KEY || '').trim();
  if (!key) { dijag.ted = 'nema TED_API_KEY'; return []; }

  const od = new Date(Date.now() - 25 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');

  try {
    // Zemlje se traže uporedo. Deset zahteva traje koliko i jedan, a funkcija
    // ima deset sekundi.
    const odgovori = await Promise.allSettled(ZEMLJE.map(z => tedZaZemlju(z, key, od)));

    const n = [];
    const sirovo = {};
    const padovi = [];
    odgovori.forEach((o, i) => {
      const kod = ZEMLJE[i];
      if (o.status === 'fulfilled') { sirovo[kod] = o.value.length; n.push(...o.value); }
      else { sirovo[kod] = 'pad'; padovi.push(kod + ': ' + o.reason.message); }
    });
    dijag.sirovoPoZemlji = sirovo;
    if (padovi.length) dijag.padovi = padovi;
    if (!n.length) { dijag.ted = 'nijedna zemlja nije vratila zapise' + (padovi.length ? ' — ' + padovi.join(' | ') : ''); return []; }

    dijag.uzorakPolja = n[0] ? Object.keys(n[0]) : [];

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

    // Izbor ide naizmenično po zemljama, a ne redom po datumu objave. Da se
    // seklo po datumu, četrdeset mesta bi opet popunile zemlje koje objavljuju
    // najviše, pa bi Hrvatska sa dva tendera ispala iako ih ima.
    const grupe = {};
    for (const t of cisti) (grupe[t.country] ||= []).push(t);
    const redovi = Object.values(grupe);
    const uravnotezeni = [];
    for (let i = 0; uravnotezeni.length < 40; i++) {
      let dodato = false;
      for (const red of redovi) {
        if (i >= red.length) continue;
        uravnotezeni.push(red[i]);
        dodato = true;
        if (uravnotezeni.length >= 40) break;
      }
      if (!dodato) break;
    }

    const poZemlji = {};
    for (const t of uravnotezeni) poZemlji[t.country] = (poZemlji[t.country] || 0) + 1;
    const konacno = uravnotezeni.map(({ _cpv, _pub, _ima, ...rest }) => rest);

    dijag.ted = 'ok, ' + n.length + ' zapisa -> ' + poCpv.length + ' po CPV-u -> ' + cisti.length + ' sa aktivnim rokom -> ' + konacno.length + ' prikazano';
    dijag.zemlje = poZemlji;
    return konacno;
  } catch (e) { dijag.ted = 'greška: ' + e.message; return []; }
}

// Povlačenje svih zemalja i upis u keš. Zove ga pozadinska funkcija, jer
// obična ima deset sekundi, a deset uporednih zahteva ka TED-u zna da potraje.
export async function osveziTendere() {
  const dijag = {};
  const [a, rs] = await Promise.all([ted(dijag), ucitajSrpske()]);
  dijag.srbijaUvoz = rs.length + ' uvezenih (XLSX izvoz sa Portala javnih nabavki)';
  const items = [...rs, ...a];
  const rezultat = { ts: Date.now(), broj: items.length, items, izvori: dijag };
  try { await store().setJSON(KEY, rezultat); } catch {}
  return rezultat;
}

// Pokreće osvežavanje i ne čeka ga. Odgovor čitaocu ne sme da visi zbog TED-a.
async function zatraziOsvezavanje(req) {
  const admin = (process.env.ADMIN_TOKEN || '').trim();
  if (!admin) return;
  const osnova = new URL(req.url).origin;
  try {
    await fetch(osnova + '/.netlify/functions/tenders-background?token=' + encodeURIComponent(admin),
      { signal: AbortSignal.timeout(3000) });
  } catch { /* 202 stiže odmah; ako ne stigne, sledeći zahtev pokušava ponovo */ }
}

export default async (req) => {
  const url = new URL(req.url);
  const debug = url.searchParams.has('debug');

  let c = null;
  try { c = await store().get(KEY, { type: 'json' }); } catch {}

  const svez = c && Date.now() - c.ts < TTL;
  // Keš koji je istekao se i dalje prikazuje, a osvežavanje kreće u pozadini.
  // Čitalac tako uvek dobije listu odmah; alternativa je prazna stranica dok
  // se čeka TED.
  if (!svez) await zatraziOsvezavanje(req);

  const telo = c
    ? { ...c, kes: true, svez: Boolean(svez) }
    : { ts: Date.now(), broj: 0, items: [], kes: false, svez: false, poruka: 'Prvo povlačenje je u toku.' };

  return new Response(JSON.stringify(debug ? telo : { ...telo, izvori: undefined }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': svez ? 'public, max-age=900' : 'no-store',
    },
  });
};
