// ==========================================================================
// ŠTOK I KRILO — povlačenje pokazatelja i beleženje istorije
//
// Do 5. 10. 2026. cene su se povlačile iz pregledača čitaoca, preko besplatnog
// posrednika r.jina.ai. Kad to padne, čitalac je video rezervne vrednosti iz
// koda, a iznad njih je pisalo „Ažurirano u 14:06". Nije imao načina da
// primeti razliku. Zato posao sada radi server.
//
// Uz to se pri svakom prolazu upisuje po jedna tačka dnevno u istoriju. Tako
// portal vremenom dobija svoj niz merenja — jedini podatak na portalu koji
// niko drugi nema.
// ==========================================================================
import { getStore } from '@netlify/blobs';

export const STORE_CENE = 'stok-vesti';
export const KLJUC_CENE = 'cene.json';
export const KLJUC_ISTORIJA = 'cene-istorija.json';
const MAKS_TACAKA = 400;          // ~godinu i po dnevnih merenja

const UA = 'Mozilla/5.0 (compatible; StokIKriloBot/1.0; +https://stokikrilo.com)';
const store = () => getStore(STORE_CENE);

// ── DEFINICIJA POKAZATELJA ────────────────────────────────────────────────
// `decimale` određuje samo koliko se cifara čuva; ispis po srpskom pravopisu
// radi stranica, jer formatiranje nije podatak.
//
// Silikon i EPDM su izbačeni 5. 10. 2026. Za njih ne postoji besplatan izvor,
// pa su brojevi stajali u kodu i niko ih nije menjao. Dva izmišljena broja
// obaraju poverenje u ostalih dvanaest koji su tačni.
export const POKAZATELJI = [
  { id: 'al',     grupa: 'METALI',   naziv: 'Aluminijum LME', jedinica: 'EUR/t',     decimale: 0 },
  { id: 'cu',     grupa: 'METALI',   naziv: 'Bakar LME',      jedinica: 'EUR/t',     decimale: 0 },
  { id: 'brent',  grupa: 'ENERGIJA', naziv: 'Nafta Brent',    jedinica: 'USD/bbl',   decimale: 2 },
  // Henry Hub je američka cena gasa i proizvođača u Pančevu ne dotiče.
  // Evropski trošak peći i ekstruzije određuje holandski TTF.
  { id: 'ttf',    grupa: 'ENERGIJA', naziv: 'Gas TTF',        jedinica: 'EUR/MWh',   decimale: 2 },
  { id: 'glass',  grupa: 'SIROVINE', naziv: 'Float staklo',   jedinica: 'indeks EU27', decimale: 1,
    napomena: 'Eurostat PPI, NACE C23 — nemetalni mineralni proizvodi, uključuje staklo' },
  { id: 'pvc',    grupa: 'SIROVINE', naziv: 'PVC granulat',   jedinica: 'indeks EU27', decimale: 1,
    napomena: 'Eurostat PPI, NACE C22 — guma i plastika, uključuje PVC' },
  // Euribor je najdirektniji pokazatelj tražnje koji postoji: stambeni krediti
  // i krediti za adaptaciju vezani su za njega.
  { id: 'euribor', grupa: 'SIROVINE', naziv: 'Euribor 3M',    jedinica: '%',         decimale: 3,
    napomena: 'ECB, mesečni prosek — dnevni niz se ne objavljuje' },
  { id: 'eurrsd', grupa: 'VALUTE',   naziv: 'EUR / RSD',      jedinica: '',          decimale: 2 },
  { id: 'eurbam', grupa: 'VALUTE',   naziv: 'EUR / BAM',      jedinica: '',          decimale: 4,
    napomena: 'Fiksni kurs' },
  { id: 'eurmkd', grupa: 'VALUTE',   naziv: 'EUR / MKD',      jedinica: '',          decimale: 2 },
  { id: 'eurall', grupa: 'VALUTE',   naziv: 'EUR / ALL',      jedinica: '',          decimale: 2 },
  { id: 'eurron', grupa: 'VALUTE',   naziv: 'EUR / RON',      jedinica: '',          decimale: 3 },
  // Turski profili i staklo drže donju granicu cene na Balkanu. Kad lira
  // oslabi, kroz mesec-dva stiže jeftinija turska ponuda kod istog kupca.
  { id: 'eurtry', grupa: 'VALUTE',   naziv: 'EUR / TRY',      jedinica: '',          decimale: 2 },
  { id: 'eurusd', grupa: 'VALUTE',   naziv: 'EUR / USD',      jedinica: '',          decimale: 4 },
];

const FX = { eurrsd: 'RSD', eurbam: 'BAM', eurmkd: 'MKD', eurall: 'ALL', eurron: 'RON', eurtry: 'TRY', eurusd: 'USD' };

async function uzmi(url, zaglavlja = {}, ms = 12000) {
  const r = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json,text/csv,*/*', ...zaglavlja },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r;
}

// ── KURSEVI ───────────────────────────────────────────────────────────────
async function kursevi(dijag) {
  try {
    const d = await (await uzmi('https://open.er-api.com/v6/latest/EUR')).json();
    if (d.result !== 'success' || !d.rates) throw new Error('neočekivan odgovor');
    const out = {};
    for (const [id, kod] of Object.entries(FX)) {
      if (typeof d.rates[kod] === 'number') out[id] = d.rates[kod];
    }
    dijag.kursevi = 'ok, ' + Object.keys(out).length + ' valuta';
    return out;
  } catch (e) { dijag.kursevi = 'greška: ' + e.message; return {}; }
}

// ── BERZA (Yahoo) ─────────────────────────────────────────────────────────
// Iz funkcije se zove direktno. Ranije je iz pregledača moralo preko
// posrednika zbog CORS-a, a posrednik je bio tuđi besplatan servis.
async function berza(oznaka) {
  const d = await (await uzmi('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(oznaka))).json();
  const meta = d?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error('nema cene');
  return meta.regularMarketPrice;
}

// ── EUROSTAT ──────────────────────────────────────────────────────────────
async function eurostatPPI(nace) {
  const url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sts_inppd_m'
    + '?indic_bt=PRC_PRR_DOM&s_adj=NSA&unit=I15&geo=EU27_2020&lang=en&format=JSON&nace_r2=' + nace;
  const d = await (await uzmi(url)).json();
  if (!d.value) throw new Error('nema vrednosti');
  const kljucevi = Object.keys(d.value).map(Number).sort((a, b) => a - b);
  const poslednja = d.value[kljucevi[kljucevi.length - 1]];
  if (typeof poslednja !== 'number') throw new Error('poslednja vrednost nije broj');
  return poslednja;
}

// ── EURIBOR (ECB) ─────────────────────────────────────────────────────────
// Portal podataka ECB-a, bez ključa. CSV je najkraći put — SDMX-JSON bi
// tražio razmotavanje tri nivoa ugnježđenja za jedan jedini broj.
//
// Dnevni niz (ključ D.U2...) vraća 404 — ECB ga ne objavljuje. Postoje samo
// mesečni, kvartalni i godišnji. Mesečni je dovoljan: Euribor se menja po
// nekoliko bazih poena mesečno i čitaocu ne treba jučerašnja decimala, nego
// smer u kom se krediti pomeraju.
async function euribor() {
  const url = 'https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA'
    + '?lastNObservations=1&format=csvdata';
  const tekst = await (await uzmi(url)).text();
  const redovi = tekst.trim().split('\n');
  if (redovi.length < 2) throw new Error('prazan CSV');
  const zaglavlje = redovi[0].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  const i = zaglavlje.indexOf('OBS_VALUE');
  if (i < 0) throw new Error('nema kolone OBS_VALUE');
  const polja = redovi[redovi.length - 1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  const v = parseFloat(polja[i]);
  if (!Number.isFinite(v)) throw new Error('vrednost nije broj');
  return v;
}

// ── ISTORIJA ──────────────────────────────────────────────────────────────
// Jedna tačka po danu i pokazatelju. Prolaz u toku dana prepisuje tačku tog
// dana, pa niz ostaje dnevni bez obzira koliko puta se funkcija pokrene.
function upisiUIstoriju(istorija, id, vrednost, dan) {
  const niz = istorija[id] || (istorija[id] = []);
  const poslednja = niz[niz.length - 1];
  if (poslednja && poslednja.d === dan) poslednja.v = vrednost;
  else niz.push({ d: dan, v: vrednost });
  if (niz.length > MAKS_TACAKA) niz.splice(0, niz.length - MAKS_TACAKA);
}

export async function osveziCene() {
  const dijag = {};
  const sada = new Date();
  const dan = sada.toISOString().slice(0, 10);

  const [fx, poslovi] = await Promise.all([
    kursevi(dijag),
    Promise.allSettled([
      berza('ALI=F'), berza('HG=F'), berza('BZ=F'), berza('TTF=F'),
      eurostatPPI('C23'), eurostatPPI('C22'), euribor(),
    ]),
  ]);

  // Svaki posao se prvo razreši u broj ili null, uz upis u dijagnostiku. Tek
  // posle se računa, da pretvaranje jedinica ne zavisi od reda izvršavanja.
  const uzmiRez = (p, ime) => {
    if (p.status === 'fulfilled' && typeof p.value === 'number' && Number.isFinite(p.value)) {
      dijag[ime] = 'ok';
      return p.value;
    }
    dijag[ime] = 'greška: ' + (p.status === 'rejected' ? p.reason?.message || 'nepoznato' : 'vrednost nije broj');
    return null;
  };

  const [pAl, pCu, pBrent, pTtf, pGlass, pPvc, pEuribor] = poslovi;
  const al = uzmiRez(pAl, 'aluminijum');
  const cu = uzmiRez(pCu, 'bakar');
  const brent = uzmiRez(pBrent, 'brent');
  const ttf = uzmiRez(pTtf, 'ttf');
  const glass = uzmiRez(pGlass, 'staklo');
  const pvc = uzmiRez(pPvc, 'pvc');
  const eur3m = uzmiRez(pEuribor, 'euribor');

  const eurusd = typeof fx.eurusd === 'number' && fx.eurusd > 0 ? fx.eurusd : null;
  if (!eurusd) dijag.pretvaranje = 'bez EUR/USD — aluminijum i bakar se ne mogu prikazati u evrima';

  const sirove = {
    // Yahoo daje aluminijum u USD po toni, a bakar u USD po funti.
    al: al !== null && eurusd ? al / eurusd : null,
    cu: cu !== null && eurusd ? (cu * 2204.62) / eurusd : null,
    brent,
    ttf,
    glass,
    pvc,
    euribor: eur3m,
    ...fx,
  };

  // Prethodno stanje treba zbog promene u odnosu na poslednje merenje.
  let staro = {};
  try { staro = (await store().get(KLJUC_CENE, { type: 'json', consistency: 'strong' }))?.poId || {}; } catch {}
  let istorija = {};
  try { istorija = (await store().get(KLJUC_ISTORIJA, { type: 'json', consistency: 'strong' })) || {}; } catch {}

  const stavke = [];
  const poId = {};
  for (const p of POKAZATELJI) {
    const v = sirove[p.id];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const vrednost = Number(v.toFixed(p.decimale));
    const pre = staro[p.id];
    const promena = typeof pre === 'number' && pre !== 0 ? ((vrednost - pre) / pre) * 100 : null;
    poId[p.id] = vrednost;
    upisiUIstoriju(istorija, p.id, vrednost, dan);
    stavke.push({
      id: p.id, grupa: p.grupa, naziv: p.naziv, jedinica: p.jedinica, decimale: p.decimale,
      vrednost,
      promena: promena === null ? null : Number(promena.toFixed(2)),
      gore: promena === null ? null : promena >= 0,
      napomena: p.napomena || null,
    });
  }

  const rezultat = { ts: Date.now(), ocitano: sada.toISOString(), broj: stavke.length, stavke, poId, izvori: dijag };
  try { await store().setJSON(KLJUC_CENE, rezultat); } catch (e) { dijag.upis = 'greška: ' + e.message; }
  try { await store().setJSON(KLJUC_ISTORIJA, istorija); } catch (e) { dijag.upisIstorije = 'greška: ' + e.message; }
  return rezultat;
}
