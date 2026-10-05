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
    godisnja: true,
    napomena: 'Eurostat PPI, NACE C23 — nemetalni mineralni proizvodi, uključuje staklo' },
  { id: 'pvc',    grupa: 'SIROVINE', naziv: 'PVC granulat',   jedinica: 'indeks EU27', decimale: 1,
    godisnja: true,
    napomena: 'Eurostat PPI, NACE C22 — guma i plastika, uključuje PVC' },
  // Euribor je najdirektniji pokazatelj tražnje koji postoji: stambeni krediti
  // i krediti za adaptaciju vezani su za njega.
  { id: 'euribor', grupa: 'TRAZNJA',  naziv: 'Euribor 3M',    jedinica: '%',         decimale: 3,
    godisnja: true, promenaJedinica: 'p.p.',
    napomena: 'ECB, mesečni prosek — dnevni niz se ne objavljuje' },
  // Dozvole su jedini pokazatelj na strani koji meri stvarnu tražnju, a ne
  // trošak. Kasne dva meseca, što je normalno za ovaj niz. Srbije nema u
  // Eurostatovom setu — polje za nju stoji prazno.
  { id: 'dozvole', grupa: 'TRAZNJA',  naziv: 'Građevinske dozvole EU', jedinica: 'indeks 2021=100', decimale: 1,
    godisnja: true,
    napomena: 'Eurostat, m² korisne površine, sezonski prilagođeno — podatak kasni oko dva meseca' },
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
// Vraća { v, pre12 }: poslednje objavljeno merenje i merenje od pre dvanaest
// meseci. Mesečni niz se iz dana u dan ne menja, pa bi dnevna promena na
// kartici bila večito prazna. Godina za godinu je ovde jedini broj koji nešto
// govori: da li staklo poskupljuje i da li se gradi više ili manje.
//
// Ključevi u `value` nose položaj u vremenskoj osi, a ne redni broj merenja —
// mesec bez podatka se preskače. Zato se do merenja od pre godinu dana ne
// dolazi brojanjem unazad, nego oduzimanjem dvanaest od položaja poslednjeg.
function izSerije(d) {
  if (!d.value) throw new Error('nema vrednosti');
  const polozaji = Object.keys(d.value).map(Number).filter(n => typeof d.value[n] === 'number');
  if (!polozaji.length) throw new Error('nijedan podatak nije broj');
  const zadnji = Math.max(...polozaji);
  const v = d.value[zadnji];
  const pre12 = d.value[zadnji - 12];
  return { v, pre12: typeof pre12 === 'number' ? pre12 : null };
}

async function eurostatPPI(nace) {
  const url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sts_inppd_m'
    + '?indic_bt=PRC_PRR_DOM&s_adj=NSA&unit=I15&geo=EU27_2020&lang=en&format=JSON&nace_r2=' + nace;
  return izSerije(await (await uzmi(url, {}, 20000)).json());
}

// Dozvole za gradnju, sve zgrade, kvadrati korisne površine, sezonski
// prilagođeno. Traži se osamnaest meseci: niz kasni oko dva meseca, pa prozor
// mora biti širi od dvanaest da bi u njemu bio i isti mesec prošle godine.
async function eurostatDozvole() {
  const url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sts_cobp_m'
    + '?indic_bt=BPRM_SQM&cpa2_1=CPA_F41001_41002&s_adj=SCA&unit=I21&geo=EU27_2020'
    + '&lang=en&format=JSON&lastTimePeriod=18';
  return izSerije(await (await uzmi(url, {}, 20000)).json());
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
  // Trinaest merenja: poslednje i isti mesec prošle godine. Za kamatu se
  // promena iskazuje u procentnim poenima, ne u procentima od same sebe.
  const url = 'https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA'
    + '?lastNObservations=13&format=csvdata';
  // ECB-u za trinaest merenja treba i preko dvanaest sekundi. Posao radi u
  // pozadinskoj funkciji, koja ima petnaest minuta, pa nema razloga za žurbu.
  const tekst = await (await uzmi(url, {}, 40000)).text();
  const redovi = tekst.trim().split('\n').filter(r => r.trim());
  if (redovi.length < 2) throw new Error('prazan CSV');
  const zaglavlje = redovi[0].split(',').map(x => x.trim().replace(/^"|"$/g, ''));
  const i = zaglavlje.indexOf('OBS_VALUE');
  if (i < 0) throw new Error('nema kolone OBS_VALUE');

  const brojevi = redovi.slice(1)
    .map(r => parseFloat((r.split(',')[i] || '').trim().replace(/^"|"$/g, '')))
    .filter(Number.isFinite);
  if (!brojevi.length) throw new Error('nijedna vrednost nije broj');

  const v = brojevi[brojevi.length - 1];
  const pre12 = brojevi.length >= 13 ? brojevi[brojevi.length - 13] : null;
  return { v, pre12 };
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
      eurostatPPI('C23'), eurostatPPI('C22'), euribor(), eurostatDozvole(),
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

  // Mesečni nizovi vraćaju { v, pre12 }, berze goli broj.
  const uzmiNiz = (p, ime) => {
    if (p.status === 'fulfilled' && p.value && Number.isFinite(p.value.v)) {
      dijag[ime] = p.value.pre12 === null ? 'ok, bez podatka od pre godinu dana' : 'ok';
      return p.value;
    }
    dijag[ime] = 'greška: ' + (p.status === 'rejected' ? p.reason?.message || 'nepoznato' : 'vrednost nije broj');
    return { v: null, pre12: null };
  };

  const [pAl, pCu, pBrent, pTtf, pGlass, pPvc, pEuribor, pDozvole] = poslovi;
  const al = uzmiRez(pAl, 'aluminijum');
  const cu = uzmiRez(pCu, 'bakar');
  const brent = uzmiRez(pBrent, 'brent');
  const ttf = uzmiRez(pTtf, 'ttf');
  const glass = uzmiNiz(pGlass, 'staklo');
  const pvc = uzmiNiz(pPvc, 'pvc');
  const eur3m = uzmiNiz(pEuribor, 'euribor');
  const dozvole = uzmiNiz(pDozvole, 'dozvole');

  // Merenje od pre godinu dana, po pokazatelju koji ga ima.
  const preGodinu = {
    glass: glass.pre12, pvc: pvc.pre12, euribor: eur3m.pre12, dozvole: dozvole.pre12,
  };

  const eurusd = typeof fx.eurusd === 'number' && fx.eurusd > 0 ? fx.eurusd : null;
  if (!eurusd) dijag.pretvaranje = 'bez EUR/USD — aluminijum i bakar se ne mogu prikazati u evrima';

  const sirove = {
    // Yahoo daje aluminijum u USD po toni, a bakar u USD po funti.
    al: al !== null && eurusd ? al / eurusd : null,
    cu: cu !== null && eurusd ? (cu * 2204.62) / eurusd : null,
    brent,
    ttf,
    glass: glass.v,
    pvc: pvc.v,
    euribor: eur3m.v,
    dozvole: dozvole.v,
    ...fx,
  };

  let istorija = {};
  try { istorija = (await store().get(KLJUC_ISTORIJA, { type: 'json', consistency: 'strong' })) || {}; } catch {}

  // Promena se meri prema poslednjem merenju iz nekog ranijeg dana, a ne prema
  // prethodnom očitavanju. Prolaz je na svaki sat, a kurs dinara i mesečni
  // indeksi se za taj sat ne pomere, pa bi na devet od četrnaest kartica
  // pisalo „+0,00%" — broj koji zauzima mesto, a ne govori ništa.
  const prethodniDan = (id) => {
    const niz = istorija[id];
    if (!Array.isArray(niz)) return null;
    for (let i = niz.length - 1; i >= 0; i--) {
      if (niz[i] && niz[i].d !== dan && typeof niz[i].v === 'number') return niz[i].v;
    }
    return null;
  };

  // Mesečni niz ne postaje netačan zato što povlačenje danas nije uspelo. ECB
  // ume da ne odgovori i za četrdeset sekundi, a Euribor se objavljuje jednom
  // mesečno — izbaciti ga sa strane zbog jednog neuspelog poziva znači
  // kazniti čitaoca za tuđu sporost. Berze i kursevi nemaju ovu rezervu: oni
  // se menjaju svaki dan i tu jučerašnji broj jeste pogrešan.
  const izIstorije = (id) => {
    const niz = istorija[id];
    if (!Array.isArray(niz) || !niz.length) return null;
    const t = niz[niz.length - 1];
    return t && typeof t.v === 'number' ? t : null;
  };

  const stavke = [];
  const poId = {};
  for (const p of POKAZATELJI) {
    let v = sirove[p.id];
    let rezerva = null;
    if ((typeof v !== 'number' || !Number.isFinite(v)) && p.godisnja) {
      const t = izIstorije(p.id);
      if (t) { v = t.v; rezerva = t.d; dijag[p.id + 'Rezerva'] = 'korišćeno merenje od ' + t.d; }
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const vrednost = Number(v.toFixed(p.decimale));

    // Mesečni niz se iz dana u dan ne menja, pa bi mu dnevna promena bila
    // večito prazna. Takav pokazatelj se poredi sa istim mesecom prošle
    // godine. Za kamatu se razlika iskazuje u procentnim poenima: Euribor sa
    // 3,05 na 2,64 nije „pao 13 odsto", nego za 0,41 procentni poen.
    const pre = p.godisnja ? preGodinu[p.id] : prethodniDan(p.id);
    let promena = null;
    if (typeof pre === 'number') {
      promena = p.promenaJedinica === 'p.p.'
        ? vrednost - pre
        : (pre !== 0 ? ((vrednost - pre) / pre) * 100 : null);
    }

    poId[p.id] = vrednost;
    if (!rezerva) upisiUIstoriju(istorija, p.id, vrednost, dan);
    stavke.push({
      id: p.id, grupa: p.grupa, naziv: p.naziv, jedinica: p.jedinica, decimale: p.decimale,
      vrednost,
      promena: promena === null ? null : Number(promena.toFixed(2)),
      promenaJedinica: p.promenaJedinica || '%',
      promenaOpis: p.godisnja ? 'god./god.' : 'dan',
      gore: promena === null ? null : (promena > 0 ? true : (promena < 0 ? false : null)),
      napomena: p.napomena || null,
      // Kad je vrednost iz rezerve, čitalac treba da zna od kog je dana.
      rezervaOd: rezerva,
    });
  }

  const rezultat = { ts: Date.now(), ocitano: sada.toISOString(), broj: stavke.length, stavke, poId, izvori: dijag };
  try { await store().setJSON(KLJUC_CENE, rezultat); } catch (e) { dijag.upis = 'greška: ' + e.message; }
  try { await store().setJSON(KLJUC_ISTORIJA, istorija); } catch (e) { dijag.upisIstorije = 'greška: ' + e.message; }
  return rezultat;
}
