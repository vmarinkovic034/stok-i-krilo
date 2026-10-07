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
// Tri oblika tabele su se pokazala u regionu i parser podnosi sva tri:
//   A) dimenzija u prvoj koloni, svaka naredna je jedan sistem profila
//      (danito.rs)
//   B) naziv proizvoda u prvoj koloni, dimenzija u drugoj, sistemi dalje
//      (pvcmarcijus.rs)
//   C) više tabela na strani, proizvod se čita iz naslova iznad tabele,
//      a kolone su „bez ugradnje" i „sa ugradnjom" (aluport.net)
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
// nje tačno tri cifre — to su hiljade.
// Bez ovoga `11.981 RSD` postane 11,981 dinara, što je greška od hiljadu puta.
export function broj(s) {
  const t = String(s || '').replace(/\s| /g, '');
  const m = t.match(/-?\d[\d.,]*/);
  if (!m) return null;
  let v = m[0];
  const zadnjaTacka = v.lastIndexOf('.');
  const zadnjaZapeta = v.lastIndexOf(',');
  if (zadnjaTacka >= 0 && zadnjaZapeta >= 0) {
    if (zadnjaZapeta > zadnjaTacka) v = v.replace(/\./g, '').replace(',', '.');
    else v = v.replace(/,/g, '');
  } else if (zadnjaZapeta >= 0) {
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

// Zastakljenje iz naziva kolone ili naslova. „2S" i „3S" su oznake koje
// koristi Marcijus, a reči pokrivaju ostale. Troslojni paket diže cenu 25 do
// 50 odsto, pa izvor koji ga ne razlikuje ne sme da uđe u isti uzorak.
export function zastakljenjeIz(s) {
  const t = String(s || '');
  if (/\b3S\b|troslojn|trostruk|triple|tripan|trikratn/i.test(t)) return 'troslojno';
  if (/\b2S\b|dvoslojn|dvostruk|double/i.test(t)) return 'dvoslojno';
  return null;
}

// Sve tabele sa strane, svaka sa naslovom koji joj stoji neposredno iznad.
// Potrebno za sajtove koji vrstu proizvoda pišu u naslovu, a ne u tabeli.
export function tabeleSaNaslovom(html) {
  const out = [];
  const re = /<table[\s\S]*?<\/table>/gi;
  let m, pos = 0;
  while ((m = re.exec(html))) {
    const pre = html.slice(pos, m.index);
    const naslovi = [...pre.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
    out.push({
      naslov: naslovi.length ? ocisti(naslovi[naslovi.length - 1][1]) : null,
      tabela: m[0],
    });
    pos = m.index + m[0].length;
  }
  return out;
}

// Redovi jedne tabele. Zaglavlje daje imena kolona; svaka kolona sa cenom
// može da nosi svoj sistem, zastakljenje i status montaže — Aluport u dve
// kolone daje cenu bez i sa ugradnjom, a to su dva različita podatka.
function redoviTabele(tabela, o = {}) {
  const {
    kolonaDimenzija = 0, kolonaNaziva = null, samoRedovi = null,
    kolone = null, valuta, eurUZagradi = false, valutaUEur = false,
    naslov = null,
  } = o;

  const redovi = [...tabela.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m => m[0]);
  if (redovi.length < 2) return [];

  const zaglavlje = [...redovi[0].matchAll(/<t[hd][\s\S]*?<\/t[hd]>/gi)].map(m => ocisti(m[0]));
  const prvaCena = Math.max(kolonaDimenzija, kolonaNaziva ?? -1) + 1;

  const out = [];
  for (const red of redovi.slice(1)) {
    const celije = [...red.matchAll(/<td[\s\S]*?<\/td>/gi)].map(m => ocisti(m[0]));
    if (celije.length <= prvaCena) continue;

    const nazivRed = kolonaNaziva != null ? celije[kolonaNaziva] : celije[kolonaDimenzija];
    if (samoRedovi && !samoRedovi.test(nazivRed)) continue;

    const { sirina, visina } = dimenzija(celije[kolonaDimenzija]);
    if (!sirina) continue;
    const krila = krilaIz(nazivRed) ?? krilaIz(naslov);

    celije.slice(prvaCena).forEach((celija, i) => {
      if (/na upit|po dogovor|^—$|^-$/i.test(celija) || !/\d/.test(celija)) return;
      const opis = kolone ? (kolone[i] || {}) : {};
      let cena = null, cenaEur = null;
      if (eurUZagradi) {
        const uZagradi = celija.match(/\(([^)]*€[^)]*)\)/);
        cena = broj(celija.split('(')[0]);
        cenaEur = uZagradi ? broj(uZagradi[1]) : null;
      } else {
        cena = broj(celija);
        if (valutaUEur) cenaEur = cena;
      }
      if (cena == null) return;
      const imeKolone = zaglavlje[prvaCena + i] || '';
      out.push({
        sirina, visina, krila,
        sistem: opis.sistem ?? (kolone ? null : imeKolone || null),
        zastakljenje: opis.zastakljenje ?? zastakljenjeIz(imeKolone) ?? zastakljenjeIz(naslov),
        montaza: opis.montaza ?? null,
        materijal: opis.materijal ?? null,
        cena, cenaEur, valuta,
      });
    });
  }
  return out;
}

// Jedna tabela, nađena po markeru u njenom HTML-u.
export function tabelaCena(html, o) {
  const tabele = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => m[0]);
  const tabela = tabele.find(t => o.marker.test(t));
  if (!tabela) throw new Error('tabela nije nađena (marker ne pogađa)');
  const out = redoviTabele(tabela, o);
  if (!out.length) throw new Error('tabela nađena, ali nijedan red nije dao cenu');
  return out;
}

// Više tabela, izabranih po naslovu iznad njih.
export function tabelePoNaslovu(html, o) {
  const sve = tabeleSaNaslovom(html);
  const izabrane = sve.filter(t => o.naslovFilter.test(t.naslov || ''));
  if (!izabrane.length) {
    throw new Error('nijedan naslov ne pogađa (nađeno tabela: ' + sve.length + ')');
  }
  const out = [];
  for (const t of izabrane) {
    const dodatno = o.poNaslovu ? o.poNaslovu(t.naslov) : {};
    out.push(...redoviTabele(t.tabela, { ...o, ...dodatno, naslov: t.naslov }));
  }
  if (!out.length) throw new Error('naslovi pogođeni, ali nijedan red nije dao cenu');
  return out;
}

// ── KATALOZI (lista proizvoda, ne tabela) ─────────────────────────────────
// Veliki lanci ne objavljuju cenovnik nego listu artikala, a dimenzija,
// broj komora i boja stoje u nazivu proizvoda. Podatak se čita iz stanja
// koje stranica sama ugrađuje u HTML, ne iz izgleda strane — izgled se
// menja svakog meseca, ugrađeni podaci ne.

// Naziv artikla u red za barometar, ili null ako artikal ne ulazi u uzorak.
// Ne ulaze: dekor boje (stejar, antracit...) jer podižu cenu, i artikli bez
// dimenzije (konfiguratori, gde cena znači „od").
export function artikalRO(naziv, cena) {
  if (!/fereastr/i.test(naziv)) return null;
  const { sirina, visina } = dimenzija(naziv);
  if (!sirina) return null;
  if (!/alb[ăa]/i.test(naziv)) return null;
  if (/stejar|antracit|nuc|auriu|gri\b|maro|mahon|culoare|decor/i.test(naziv)) return null;
  const camere = (naziv.match(/(\d)\s*camere/i) || [])[1];
  // „fixă + deschidere" je dva krila, jedno nepokretno. Samo „deschidere
  // dublă" je jedno krilo sa dve funkcije (kip i otvaranje) — ne dva krila.
  const krila = /fix[ăa]/i.test(naziv) ? 2 : 1;
  return {
    sirina, visina, krila,
    sistem: camere ? camere + ' camere' : null,
    zastakljenje: /tripan|triplu|3 sticle/i.test(naziv) ? 'troslojno' : 'dvoslojno',
    cena, valuta: 'RON',
  };
}

// Proizvodi iz ugrađenog JSON stanja strane. Isti artikal se u stanju javlja
// po više puta, pa se duplikati sklanjaju po nazivu i ceni.
export function proizvodiIzStanja(html, { naslovRe, filter }) {
  const re = new RegExp(
    '"title":"(' + naslovRe + '[^"]{10,160})"[\\s\\S]{0,1800}?"defaultPrice":\\{[^}]*?"price":([\\d.]+),"currencyCode":"(\\w+)"',
    'g');
  const vidjeno = new Set(), out = [];
  let m;
  while ((m = re.exec(html))) {
    const kljuc = m[1] + '|' + m[2];
    if (vidjeno.has(kljuc)) continue;
    vidjeno.add(kljuc);
    const red = filter(m[1], +m[2]);
    if (red) out.push(red);
  }
  if (!out.length) throw new Error('u stanju strane nema artikala koji prolaze filter');
  return out;
}

// ── REGISTAR IZVORA ───────────────────────────────────────────────────────
export const IZVORI = [
  // Prvi izvor, i merilo za ostale: tačna dimenzija, tvrda cena, dve valute,
  // i doslovno napisano „Sve cene su BEZ montaže" i „sa PDV-om".
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
    // Zaglavlje tabele ne kaže kakvo je staklo, a VEKA 82MD ima troslojno
    // kao standard. Bez ovoga bi mu cena ulazila u uzorak dvoslojnih i
    // izgledala kao da je isti prozor skuplji trideset odsto.
    zastakljenjePoSistemu: { 'VEKA 82MD': 'troslojno' },
    podrazumevanoZastakljenje: 'dvoslojno',
    citaj: (html) => tabelaCena(html, {
      marker: /class=["']cene["']/i,
      valuta: 'RSD',
      eurUZagradi: true,
    }),
  },

  // Naziv proizvoda u prvoj koloni, dimenzija u drugoj. Tabela nosi i
  // roletne, komarnike i zavese, pa se propuštaju samo redovi za prozore —
  // inače bi u uzorak cena prozora ušla cena venecijanera.
  // Strana doslovno piše: „Cene su date bez montaže i dostave na objekat."
  // PDV se ne pominje.
  {
    id: 'marcijus-rs',
    zemlja: 'RS',
    firma: 'PVC Marcijus',
    url: 'https://www.pvcmarcijus.rs/cenovnik/',
    tipIzvora: 'proizvodjac',
    materijal: 'PVC',
    pdv: 'ne_pise',
    montaza: 'bez',
    tipCene: 'tvrda',
    citaj: (html) => tabelaCena(html, {
      marker: /tablepress/i,
      kolonaNaziva: 0,
      kolonaDimenzija: 1,
      samoRedovi: /PROZOR/i,
      valuta: 'EUR',
      valutaUEur: true,
    }),
  },

  // Osamnaest tabela na strani, sve sa istim zaglavljem. Vrsta proizvoda se
  // čita iz naslova iznad tabele. Dve kolone cena, „bez ugradnje" i „sa
  // ugradnjom" — to su dva različita podatka i oba se čuvaju. Iz njih se
  // dobija koeficijent montaže, jedini način da se portalske cene (koje su
  // uglavnom sa ugradnjom) uopšte uporede sa cenama iz cenovnika.
  // Napomena na strani: „Cene su date za standardne bele PVC prozore sa
  // dvoslojnim staklom." PDV se ne pominje.
  {
    id: 'aluport-rs',
    zemlja: 'RS',
    firma: 'Aluport',
    url: 'https://www.aluport.net/cene',
    tipIzvora: 'proizvodjac',
    pdv: 'ne_pise',
    montaza: null,                 // stoji po koloni, ne po izvoru
    tipCene: 'tvrda',
    podrazumevanoZastakljenje: 'dvoslojno',
    citaj: (html) => tabelePoNaslovu(html, {
      naslovFilter: /PROZOR/i,
      valuta: 'EUR',
      valutaUEur: true,
      kolone: [{ montaza: 'bez' }, { montaza: 'uklj' }],
      poNaslovu: (n) => ({
        kolone: [
          { montaza: 'bez', materijal: /\bALU\b/i.test(n) ? 'ALU' : 'PVC' },
          { montaza: 'uklj', materijal: /\bALU\b/i.test(n) ? 'ALU' : 'PVC' },
        ],
      }),
    }),
  },
];

// Prva strana kategorije, 56 artikala. Pored nje stoje i dva konfiguratora
// sa cenom „od" — ona se filtrom odbacuju, jer nemaju dimenziju.
// Strana doslovno piše: „Toate prețurile conțin TVA" (sve cene sadrže PDV).
// Montaže nema — to je maloprodaja robe.
IZVORI.push({
  id: 'hornbach-ro',
  zemlja: 'RO',
  firma: 'Hornbach',
  url: 'https://www.hornbach.ro/c/lemn-ferestre-usi/ferestre/ferestre-pvc/S21004/',
  tipIzvora: 'webshop',
  materijal: 'PVC',
  pdv: 'uklj',
  pdvStopa: 21,
  montaza: 'bez',
  tipCene: 'tvrda',
  citaj: (html) => proizvodiIzStanja(html, { naslovRe: 'Fereastr', filter: artikalRO }),
});

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
    naziv: [r.materijal || izv.materijal, r.sistem, r.sirina + '×' + r.visina,
            r.krila ? r.krila + 'kr' : null].filter(Boolean).join(' '),
    sirina: r.sirina,
    visina: r.visina,
    materijal: r.materijal || izv.materijal,
    sistem: r.sistem,
    zastakljenje: r.zastakljenje
      || (izv.zastakljenjePoSistemu || {})[r.sistem]
      || izv.podrazumevanoZastakljenje
      || null,
    krila: r.krila,
    cena: r.cena,
    valuta: r.valuta || izv.valuta,
    cenaEur: r.cenaEur,
    pdv: izv.pdv,
    pdvStopa: izv.pdvStopa,
    montaza: r.montaza || izv.montaza,
    tipCene: izv.tipCene,
    datumNaStrani,
  }));
}

// Datum sa strane, ako ga sajt objavljuje. Nije isto što i datum očitavanja:
// cenovnik može da stoji nepromenjen mesecima, i to je podatak za sebe.
//
// Uzima se samo iz meta oznaka. Prva verzija je tražila bilo koji datum u
// tekstu i na Danitu pokupila „Akcija važi do 31.10.2026" — datum koji sa
// cenovnikom nema veze. Prazno polje je bolje od pogrešnog datuma, jer se
// na osnovu ovog polja kasnije zaključuje kada se cena stvarno pomerila.
function datumSaStrane(html) {
  const meta = html.match(/<meta[^>]+(?:article:modified_time|article:published_time|dateModified)["'][^>]+content=["']([^"']+)/i);
  if (meta) return meta[1].slice(0, 10);
  const ld = html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
  if (ld) return ld[1];
  return null;
}
