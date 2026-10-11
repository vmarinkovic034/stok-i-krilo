// ==========================================================================
// ŠTOK I KRILO — barometar, zvanični reper (kontekst, ne deo indeksa)
//
// Zašto indeks cena proizvođača, a ne cene iz nemačkih ili američkih
// prodavnica: nivo cena se ne može porediti (drugi proizvod, drugi PDV,
// ugradnja u ceni), ali PRAVAC se može. Zvanični indeks kaže da li prozori
// poskupljuju i koliko, i ima istoriju od decenija — našem barometru koji
// tek počinje to je ono što nedostaje.
//
// Izvori, oba javna i bez ključa:
//   Eurostat sts_inpp_m  — indeks cena proizvođača, 2021 = 100, mesečno
//     C22.23 proizvodi od plastike za građevinarstvo (u njima su PVC prozori)
//     C25.12 prozori i vrata od metala
//     Pokriva EU27/evrozonu, DE, FR, ES, IT, NL, FI, SE. NEMA Poljske, Srbije
//     i zemalja regiona (provereno 11. 10. 2026) — za njih ostaje samo
//     barometar.
//   FRED PCU332321332321 — SAD, metalni prozori i vrata, mesečno
//     (BLS PPI, preuzet preko St. Louis Fed).
//
// Napomena koja ide uz svaki prikaz: C22.23 nije samo PVC prozori, a C25.12
// je aluminijum i čelik. Ovo je kontekst tržišta, ne cena prozora.
// ==========================================================================

const UA = 'Mozilla/5.0 (compatible; StokIKriloBot/1.0; +https://stokikrilo.com)';

const EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sts_inpp_m';

export const SERIJE = [
  { id: 'eu27-metal', naziv: 'EU27 — prozori i vrata od metala', izvor: 'eurostat', nace: 'C2512', geo: 'EU27_2020' },
  { id: 'ea-plastika', naziv: 'Evrozona — plastični građevinski proizvodi', izvor: 'eurostat', nace: 'C2223', geo: 'EA20' },
  { id: 'de-plastika', naziv: 'Nemačka — plastični građevinski proizvodi', izvor: 'eurostat', nace: 'C2223', geo: 'DE' },
  { id: 'de-metal', naziv: 'Nemačka — prozori i vrata od metala', izvor: 'eurostat', nace: 'C2512', geo: 'DE' },
  { id: 'fr-plastika', naziv: 'Francuska — plastični građevinski proizvodi', izvor: 'eurostat', nace: 'C2223', geo: 'FR' },
  { id: 'it-plastika', naziv: 'Italija — plastični građevinski proizvodi', izvor: 'eurostat', nace: 'C2223', geo: 'IT' },
  { id: 'us-metal', naziv: 'SAD — prozori i vrata od metala', izvor: 'fred', serija: 'PCU332321332321' },
];

async function dohvati(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  return res;
}

// Eurostat JSON-stat: vrednosti su u spljoštenom nizu; pozicija se računa iz
// veličina dimenzija, ne pretpostavlja se redosled.
async function eurostat(s, od) {
  const u = `${EUROSTAT}?format=JSON&lang=EN&s_adj=NSA&unit=I21&indic_bt=PRC_PRR&nace_r2=${s.nace}&geo=${s.geo}&sinceTimePeriod=${od}`;
  const o = await (await dohvati(u)).json();
  const vreme = Object.keys(o.dimension.time.category.index);
  const redosled = o.id, velicine = o.size;
  const korak = {};
  let k = 1;
  for (let i = redosled.length - 1; i >= 0; i--) { korak[redosled[i]] = k; k *= velicine[i]; }
  const out = [];
  for (const [kljuc, v] of Object.entries(o.value || {})) {
    const ti = Math.floor((+kljuc % (korak.time * velicine[redosled.indexOf('time')])) / korak.time);
    out.push([vreme[ti], v]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

async function fred(s, od) {
  const t = await (await dohvati(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s.serija}&cosd=${od}-01`)).text();
  return t.trim().split('\n').slice(1)
    .map(r => r.split(','))
    .filter(r => r[1] && r[1] !== '.')
    .map(r => [r[0].slice(0, 7), +r[1]]);
}

function promena(niz, unazad) {
  if (niz.length <= unazad) return null;
  const a = niz[niz.length - 1][1], b = niz[niz.length - 1 - unazad][1];
  return b ? +((a / b - 1) * 100).toFixed(1) : null;
}

export async function reper() {
  const od = String(new Date().getUTCFullYear() - 3) + '-01';
  const out = [];
  for (const s of SERIJE) {
    try {
      const niz = s.izvor === 'eurostat' ? await eurostat(s, od) : await fred(s, od);
      if (!niz.length) throw new Error('prazna serija');
      out.push({
        id: s.id, naziv: s.naziv, izvor: s.izvor,
        poslednjiMesec: niz[niz.length - 1][0],
        vrednost: niz[niz.length - 1][1],
        mom: promena(niz, 1), kv3: promena(niz, 3), yoy: promena(niz, 12),
        niz,
      });
    } catch (e) { out.push({ id: s.id, naziv: s.naziv, greska: e.message }); }
  }
  return out;
}
