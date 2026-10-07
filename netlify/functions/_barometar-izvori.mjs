// ==========================================================================
// ŠTOK I KRILO — barometar, izvori javnih cena prozora i njihovi parseri
//
// Kriterijum za ulazak izvora, isti za sve zemlje:
//   1. cena je javna, bez prijave i bez upita
//   2. vezana je za konkretnu dimenziju ili za m²
//   3. stoji u statičnom HTML-u — konfigurator u JavaScriptu se ne računa
//   4. iz strane se vidi status PDV-a i montaže
//
// Konfigurator je ono što vidi čovek; nama treba ono što sajt objavi kao
// tabelu. Danito je dobar primer: isti brojevi stoje i u kalkulatoru
// (bundlovan JS, hash se menja pri svakom deployu) i u tabeli na /cenovnik/.
// Tabela je stabilna i čita se jednim fetch-om.
//
// Svaki izvor nosi i ono što parser ne može da pročita sa strane: status
// PDV-a, montaže i to da li je cena tvrda ili „od". Bez ta tri polja cene iz
// različitih zemalja nisu uporedive — razlika u PDV-u je veća od raspona
// između najjeftinijeg i najskupljeg ponuđača na istom tržištu.
// ==========================================================================
import { zapis } from './_barometar-zapisi.mjs';

const UA = 'Mozilla/5.0 (compatible; StokIKriloBot/1.0; +https://stokikrilo.com)';

// Prekid je podesiv jer se isti posao zove iz dva mesta: pozadinska
// funkcija ima petnaest minuta i sme da čeka, obična ima deset sekundi.
export async function povuci(url, prekid = 25000) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(prekid),
  });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  return await res.text();
}

// ── POMOĆNE ───────────────────────────────────────────────────────────────

const ocisti = (h) => String(h || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#215;|&times;/g, '×')
  .replace(/\s+/g, ' ').trim();

// Broj iz teksta, uz razdvajanje hiljada od decimala. Pravilo: ako ima i
// tačku i zapetu, poslednji od njih je decimalni. Ako ima samo tačku, a iza
// nje tačno tri cifre i nije kraj broja sa dve decimale — to su hiljade.
// Bez ovoga `11.981 RSD` postane 11,981 dinara, što je greška od hiljadu puta.
export function broj(s) {
  const t = String(s || '').replace(/\s| /g, '');
  const m = t.match(/-?\d[\d.,]*/);
  if (!m) return null;
  let v = m[0];
  const zadnjaTacka = v.lastIndexOf('.');
  const zadnjaZapeta = v.lastIndexOf(',');
  if (zadnjaTacka >= 0 && zadnjaZapeta >= 0) {
    // onaj koji je dalje udesno je decimalni razdelnik
    if (zadnjaZapeta > zadnjaTacka) v = v.replace(/\./g, '').replace(',', '.');
    else v = v.replace(/,/g, '');
  } else if (zadnjaZapeta >= 0) {
    // zapeta sa tačno tri cifre iza i još cifara ispred je razdelnik hiljada
    const iza = v.length - zadnjaZapeta - 1;
    v = (iza === 3 && zadnjaZapeta > 0 && v.indexOf(',') !== zadnjaZapeta)
      ? v.replace(/,/g, '') : v.replace(',', '.');
  } else if (zadnjaTacka >= 0) {
    const iza = v.length - zadnjaTacka - 1;
    if (iza === 3) v = v.replace(/\./g, '');
  }
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Dimenzija iz teksta: 60×60 cm, 140 x 140, 150/140, 1160x1160mm.
// Vrednosti preko 400 se čitaju kao milimetri — prozor od 400 cm ne postoji
// kao kataloški artikal, a 1160 mm je uobičajen zapis kod rumunskih shopova.
export function dimenzija(s) {
  const t = String(s || '').replace(/ /g, ' ');
  const m = t.match(/(\d{2,4})\s*(?:×|x|X|\*|\/)\s*(\d{2,4})/);
  if (!m) return {};
  let sirina = +m[1], visina = +m[2];
  const mm = /mm/i.test(t) || sirina > 400 || visina > 400;
  if (mm) { sirina = Math.round(sirina / 10); visina = Math.round(visina / 10); }
  if (sirina < 20 || visina < 20 || sirina > 400 || visina > 400) return {};
  return { sirina, visina };
}

export function krilaIz(s) {
  const m = String(s || '').match(/(\d)\s*kril/i);
  if (m) return +m[1];
  if (/jednokril|enokriln|single/i.test(s)) return 1;
  if (/dvokril|dvokriln|double/i.test(s)) return 2;
  if (/trokril|trikriln/i.test(s)) return 3;
  return null;
}

// ── OPŠTI PARSER ZA TABELU DIMENZIJA I CENA ───────────────────────────────
// Obrazac: prva kolona nosi dimenziju, svaka naredna kolona je jedan sistem
// profila, a zaglavlje daje njegovo ime. Pokriva većinu cenovnika proizvođača
// u regionu. Ćelije tipa „na upit" se preskaču — to nije cena.
export function tabelaCena(html, opcije) {
  const { marker, valuta, valutaUEur = false, eurUZagradi = false } = opcije;
  const tabele = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => m[0]);
  const tabela = tabele.find(t => marker.test(t));
  if (!tabela) throw new Error('tabela nije nađena (marker ne pogađa)');

  const redovi = [...tabela.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m => m[0]);
  if (redovi.length < 2) throw new Error('tabela ima manje od dva reda');

  const zaglavlje = [...redovi[0].matchAll(/<th[\s\S]*?<\/th>/gi)].map(m => ocisti(m[0]));
  const sistemi = zaglavlje.slice(1);
  if (!sistemi.length) throw new Error('zaglavlje nema kolone sa sistemima');

  const out = [];
  for (const red of redovi.slice(1)) {
    const celije = [...red.matchAll(/<td[\s\S]*?<\/td>/gi)].map(m => ocisti(m[0]));
    if (celije.length < 2) continue;
    const { sirina, visina } = dimenzija(celije[0]);
    if (!sirina) continue;
    const krila = krilaIz(celije[0]);

    celije.slice(1).forEach((celija, i) => {
      if (/na upit|po dogovor|upit|—|^-$/i.test(celija) || !/\d/.test(celija)) return;
      let cena = null, cenaEur = null;
      if (eurUZagradi) {
        // oblik „31.127 RSD (≈ 265 €)" — oba broja su na strani, uzimamo oba
        const uZagradi = celija.match(/\(([^)]*€[^)]*)\)/);
        cena = broj(celija.split('(')[0]);
        cenaEur = uZagradi ? broj(uZagradi[1]) : null;
      } else {
        cena = broj(celija);
        if (valutaUEur) cenaEur = cena;
      }
      if (cena == null) return;
      out.push({ sirina, visina, krila, sistem: sistemi[i] || null, cena, cenaEur, valuta });
    });
  }
  if (!out.length) throw new Error('tabela nađena, ali nijedan red nije dao cenu');
  return out;
}

// ── REGISTAR IZVORA ───────────────────────────────────────────────────────
// Prvi izvor je Danito, jer na jednoj strani ima sve što nam treba: tačnu
// dimenziju, tvrdu cenu, dve valute, i doslovno napisano „Sve cene su BEZ
// montaže" i „sa PDV-om". Taj izvor služi i kao provera da lanac radi od
// kraja do kraja pre nego što se doda ostalih sedam.
export const IZVORI = [
  {
    id: 'danito-rs',
    zemlja: 'RS',
    firma: 'Danito',
    url: 'https://danito.rs/cenovnik/',
    tipIzvora: 'proizvodjac',
    materijal: 'PVC',
    pdv: 'uklj',
    pdvStopa: 20,
    montaza: 'bez',
    tipCene: 'tvrda',
    // VEKA 82MD ima troslojno staklo kao standard, ostala dva dvoslojno.
    // To nije detalj: troslojni paket diže cenu 25 do 50 odsto, pa bi bez
    // ovog razdvajanja isti prozor ulazio u uzorak kao dve različite cene.
    zastakljenjePoSistemu: { 'VEKA 82MD': 'troslojno' },
    podrazumevanoZastakljenje: 'dvoslojno',
    citaj: (html) => tabelaCena(html, {
      marker: /class=["']cene["']/i,
      valuta: 'RSD',
      eurUZagradi: true,
    }),
  },
];

// Jedan izvor od početka do kraja: povuci, pročitaj, pretvori u zapise.
export async function ocitajIzvor(izv, prekid) {
  const html = await povuci(izv.url, prekid);
  const redovi = izv.citaj(html);
  const datumNaStrani = datumSaStrane(html);
  return redovi.map(r => zapis({
    izvor: izv.id,
    zemlja: izv.zemlja,
    firma: izv.firma,
    url: izv.url,
    tipIzvora: izv.tipIzvora,
    naziv: [r.sistem, r.sirina + '×' + r.visina].filter(Boolean).join(' '),
    sirina: r.sirina,
    visina: r.visina,
    materijal: izv.materijal,
    sistem: r.sistem,
    zastakljenje: (izv.zastakljenjePoSistemu || {})[r.sistem] || izv.podrazumevanoZastakljenje || null,
    krila: r.krila,
    cena: r.cena,
    valuta: r.valuta || izv.valuta,
    cenaEur: r.cenaEur,
    pdv: izv.pdv,
    pdvStopa: izv.pdvStopa,
    montaza: izv.montaza,
    tipCene: izv.tipCene,
    datumNaStrani,
  }));
}

// Datum sa strane, ako ga sajt objavljuje. Nije isto što i datum očitavanja:
// cenovnik može da stoji nepromenjen mesecima, i to je podatak za sebe.
function datumSaStrane(html) {
  const meta = html.match(/<meta[^>]+(?:article:modified_time|article:published_time|dateModified)["'][^>]+content=["']([^"']+)/i);
  if (meta) return meta[1].slice(0, 10);
  const srp = html.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(20\d{2})/);
  if (srp) return `${srp[3]}-${String(srp[2]).padStart(2, '0')}-${String(srp[1]).padStart(2, '0')}`;
  return null;
}
