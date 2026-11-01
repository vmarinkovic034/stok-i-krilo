// ==========================================================================
// ŠTOK I KRILO — zajedničke funkcije za povlačenje i obradu vesti
// ==========================================================================
import { getStore } from '@netlify/blobs';

export const STORE = 'stok-vesti';
export const KEY_DRAFTS = 'drafts.json';
export const KEY_APPROVED = 'approved.json';
export const KEY_SEEN = 'seen-urls.json';
// Izveštaj poslednjeg pokretanja. Background funkcija odmah vrati 202 i svoj
// rezultat ostavlja samo u Netlify logovima — ovde ga čuvamo da urednik vidi
// šta se desilo i bez otvaranja Netlify panela.
export const KEY_LAST_RUN = 'last-run.json';
// Direktorijum kompanija. Stajao je u Gugl tabeli do koje portal nije imao
// pristup — vidi _firme-seme.mjs.
export const KLJUC_FIRME = 'firme.json';
// Barometar cena prozora — merenja fiksne korpe, jedno po krugu.
export const KLJUC_BAROMETAR = 'barometar.json';

export function store() { return getStore(STORE); }

// consistency: 'strong' je obavezno. Podrazumevano čitanje iz Blobs-a je
// eventualno konzistentno, pa zapis upisan pre nekoliko sekundi ne mora da se
// vidi. To je pravilo pogodilo digest: nacrti se upišu, pa se odmah zatim
// pročitaju radi slanja — i mejl je stizao sa manje nacrta nego što ih stvarno
// ima. Dana 3. 10. 2026. upisano je pet nacrta, a mejl je najavio dva.
export async function readJSON(key, fallback) {
  try { const v = await store().get(key, { type: 'json', consistency: 'strong' }); return v ?? fallback; }
  catch { return fallback; }
}
export async function writeJSON(key, value) { await store().setJSON(key, value); }

// ── FILTER PO TEMI ────────────────────────────────────────────────────────



// Reči po kojima se iz opšteg građevinskog portala izdvaja ono što se tiče
// stolarije. Lista se slobodno dopunjuje — širi je filter, više materijala i
// veći trošak; uži filter, manje promašaja.
// Lista pokriva srpski, hrvatski, bosanski i crnogorski, a preko preslovljavanja
// i makedonski: „прозорец" postane „prozorec" i pogodi koren „prozor", „стакло"
// postane „staklo", „столарија" postane „stolarija".
export const KLJUCNE_RECI = [
  'prozor', 'vrata', 'vrati', 'stakl', 'ostakljen', 'zastakljen', 'staklopaket',
  'fasad', 'stolarij', 'bravarij', 'okov', 'profil',
  // „alumini" namerno, jer pokriva i aluminij, i aluminijum, i makedonsko
  // „алуминиум", i bugarsko „алуминий" — sva tri su ranije promašivala.
  'pvc', 'alumini', 'drvo alu', 'termoprekid', 'termo prekid',
  'roletn', 'zaluzin', 'senil', 'komarnik', 'zavesa zid',
  'u-vrednost', 'uf ', 'uw ', 'energetska efikasnost zgrad', 'energetski pasos',
  'nadstresnic', 'zimska basta', 'krovni prozor', 'svetlarnik',
];

// Ministarstvo objavljuje ćirilicom, portali latinicom. Filter mora da radi
// na oba pisma, pa se sve prvo prevodi u latinicu bez dijakritika.
//
// Mapa pokriva i makedonsku i bugarsku ćirilicu, jer su u izvore ušli
// Porta3 iz Skoplja i Строител iz Sofije. Bugarsko „ъ" se namerno čita kao
// „a": „стъкло" tako postane „staklo" i pogodi isti koren kao naše „staklo".
const CIR = {
  а:'a', б:'b', в:'v', г:'g', д:'d', ђ:'dj', е:'e', ж:'z', з:'z', и:'i', ј:'j',
  к:'k', л:'l', љ:'lj', м:'m', н:'n', њ:'nj', о:'o', п:'p', р:'r', с:'s', т:'t',
  ћ:'c', у:'u', ф:'f', х:'h', ц:'c', ч:'c', џ:'dz', ш:'s',
  // makedonski i bugarski
  ѓ:'g', ќ:'k', ѕ:'dz', ъ:'a', ь:'', ю:'ju', я:'ja', щ:'st', ы:'i', э:'e', і:'i',
};

// Skidanje akcenata ide pre preslovljavanja, pa isti korak sredi i grčke
// naglaske (κούφωμα → κουφωμα) i naše kvačice. Grčko završno „ς" se izjednačava
// sa „σ", inače reč na kraju rečenice ne bi pogodila koren.
const normRec = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ς/g, 'σ')
  .replace(/[Ѐ-ӿ]/g, c => CIR[c] ?? c)
  .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'dj');

// Bugarski ima svoju reč za stolariju — „дограма" — i nje nema ni u jednom
// našem korenu. Bez ove liste bi Строител davao nulu.
export const KLJUCNE_BG = [
  'dograma', 'prozor', 'vrati', 'stakl', 'ostakl', 'fasad', 'alumini', 'pvc',
  'energijn', 'toploizolac', 'sanir', 'ograzdane', 'remont',
];

// Grčki se ne preslovljava, pa reči stoje u originalu. Porede se korenovi bez
// nastavaka, jer grčki menja završetak po padežu i broju.
export const KLJUCNE_GR = [
  'κουφωμ', 'παραθυρ', 'τζαμ', 'υαλοπιν', 'προσοψ', 'αλουμιν',
  'μονωτικ', 'θερμομον', 'ενεργειακ', 'ανακαινισ', 'pvc',
];

// Reči po kojima se iz izvora javne uprave izdvajaju pozivi koji se tiču
// zamene stolarije. Ministarstvo retko napiše „prozor" — piše „energetska
// sanacija" i „subvencije", a stolarija je uvek deo tog paketa.
export const KLJUCNE_SUBVENCIJE = [
  'subvencij', 'bespovratn', 'javni poziv', 'konkurs',
  'energetsk sanacij', 'energetska sanacija', 'energetsku sanaciju',
  'energetska efikasnost', 'energetske efikasnosti', 'energetsku efikasnost',
  'stolarij', 'prozor', 'zamena stolarije', 'domacinstv',
];

// ── PREPOZNAVANJE ISTE VESTI IZ DVA IZVORA ────────────────────────

// Do sada se duplikat prepoznavao samo po adresi. To je bilo dovoljno dok je
// svaki izvor pisao svoje. Otkad u listi stoje i portali koji prenose ista
// saopštenja branše — OKNA.ua, glassonweb i Fereastra često objave isti
// Kommerlingov ili Hydrin podatak istog dana — dve različite adrese nose
// istu vest. Bez ove provere model piše obe i obe osvanu na portalu.
const STOP_RECI = new Set([
  'the','and','for','with','from','that','this','new','its','has','have','will',
  'are','was','were','out','all','more','than','into','over','after','about',
  'their','they','first','also','been','what','when','which','would','could',
  'should','says','said','year','years','pentru','care','este','sunt','intre',
  'kod','sa','po','pri','ali','ili','nije','bez','kao','koji','koje','koja',
  'svoje','posle','prema','preko','nova','novi','novo',
]);

// Skup nosivih reči naslova. Kratke reči i veznici ispadaju, jer se poklapaju
// uvek i između nepovezanih vesti.
export function naslovKljuc(t) {
  return new Set(
    normRec(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
      .filter(w => w.length >= 4 && !STOP_RECI.has(w))
  );
}

// Poklapanje se meri prema kraćem naslovu, ne prema uniji. Tako se hvata i
// slučaj kad jedan izvor doda mesto ili sajam: „Hydro sales up 15.8% in Q3"
// i „Hydro sales up 15.8% in Q3, Extrusions division" su ista vest.
// Naslov sa manje od tri nosive reči se ne poredi — prekratak je da bi se
// iz njega bilo šta zaključilo.
export function naslovSlican(a, b, prag = 0.6) {
  const A = a instanceof Set ? a : naslovKljuc(a);
  const B = b instanceof Set ? b : naslovKljuc(b);
  if (A.size < 3 || B.size < 3) return false;
  let presek = 0;
  for (const w of A) if (B.has(w)) presek++;
  return presek / Math.min(A.size, B.size) >= prag;
}

// Da li stavka iz opšteg izvora uopšte govori o onome što nas zanima.
// Izvor može da ponese svoju listu reči; bez nje važi lista za stolariju.
export function ticeSeStolarije(item, reci = KLJUCNE_RECI) {
  const t = normRec((item.title || '') + ' ' + (item.summary || '') + ' ' + (item.excerpt || ''));
  return reci.some(k => t.includes(normRec(k)));
}

// ── IZVORI ────────────────────────────────────────────────────────────────
export const SOURCES = [
  // stranicenje: feed podržava ?paged=N, pa se može ići unazad kroz arhivu.
  { id: 'dgb', name: 'Double Glazing Blogger', lang: 'en', region: 'UK', tier: 1, stranicenje: true,
    rss: 'https://www.doubleglazingblogger.com/feed/' },
  { id: 'glaswelt', name: 'GLASWELT', lang: 'de', region: 'Nemacka', tier: 1,
    html: 'https://www.glaswelt.de/',
    linkPattern: /href="(\/(?:glas|fenster|fassade|fensterbau)\/[a-z0-9-]{20,})"/gi,
    base: 'https://www.glaswelt.de' },
  { id: 'oknonet', name: 'OknoNet', lang: 'pl', region: 'Poljska', tier: 1,
    html: 'https://oknonet.pl/',
    linkPattern: /href="(https:\/\/oknonet\.pl\/[a-z0-9-]{25,}\/)"/gi },
  // Ranije se čitao HTML stranice regularnim izrazom i to je prestalo da vraća
  // išta čim je sajt promenio šablon. Sajt nudi svoj feed, pa nema razloga da
  // pogađamo strukturu stranice.
  { id: 'windowdoor', name: 'Window + Door', lang: 'en', region: 'SAD', tier: 1,
    rss: 'https://www.windowanddoor.com/rss.xml' },
  // Evropsko udruženje proizvođača prozora, vrata i fasada (Brisel). Objavljuje
  // retko, jednu do dve vesti mesečno, ali su to stavovi o CPR-u, standardima i
  // oznakama koji za nekoliko godina važe i za balkanske proizvođače. Feed je
  // skraćen na kraju; poslednja stavka bez zatvorenog taga ispada, ostale prolaze.
  // rubrika: 'stav' — ovde ljudi govore pod imenom i funkcijom o CPR-u, Digitalnom
  // pasosu proizvoda, PFAS-u. Takva vest ide u rubriku Stavovi i za nju važe
  // obrnuta pravila: navod je obavezan, ne najviše jedan. Bez toga model
  // prepriča izjavu, ime nestane i ostane bezlična vest o propisu.
  // foto: saopštenja EuroWindoor-a su objavljena da bi ih nacionalna udruženja
  // prenosila svojim članovima, pa se slika sme preuzeti uz potpis izvora.
  { id: 'eurowindoor', name: 'EuroWindoor', lang: 'en', region: 'EU', tier: 1, rubrika: 'stav', foto: true,
    rss: 'https://www.eurowindoor.eu/category/news/feed/' },
  // Britanski tehnički portal o prozorima, vratima i fasadnim detaljima.
  // Dnevno objavi jednu do tri stavke; deo su ugovori britanskih izvođača,
  // koje model preskače kao nebitne za Balkan.
  { id: 'wit', name: 'Window Industry Today', lang: 'en', region: 'UK', tier: 1,
    rss: 'https://window-industry-today.com/rss.xml' },
  // Britanski list o prozorima i vratima (Fenestration Bulletin). Mešavina
  // proizvodnih vesti i potrošačkih saveta; potrošačke model preskače.
  { id: 'fenbul', name: 'Fenestration Bulletin', lang: 'en', region: 'UK', tier: 1,
    rss: 'https://www.fenestration.news/NewsFeeds/RSSfeed/1001' },

  // Rumunski list posvećen isključivo stolariji — PVC i ALU prozori, vrata i
  // fasade, izdanje grupe Agenda Construcţiilor. Do danas je Rumunija, najjače
  // tržište u našem barometru, bila bez ijednog izvora vesti.
  // Objavljuje dnevno, dva do četiri teksta. Sajt je Joomla; `rssAgendaConstructiilor.php`
  // nije odgovorio pri proveri 31. 10. 2026, pa ide preko HTML-a sa strane /stiri/.
  // robots.txt zabranjuje samo administrativne putanje, nijedan AI bot nije imenovan.
  // Adrese u HTML-u su relativne (/stiri/...), pa ide uz `base`. Alat koji
  // čita stranu ume da ih prikaže kao apsolutne — pattern se piše prema
  // onome što stoji u izvornom HTML-u, ne prema onome što alat ispiše.
  { id: 'fereastra', name: 'Fereastra', lang: 'ro', region: 'Rumunija', tier: 1,
    html: 'https://www.fereastra.ro/stiri/',
    linkPattern: /href="(\/stiri\/[a-z-]+\/[a-z0-9-]{20,})"/gi,
    base: 'https://www.fereastra.ro' },

  // Ukrajinski portal sa posebnim engleskim izdanjem. Piše ga sopstvena redakcija,
  // dnevno pet do deset stavki, i prati evropsku branšu u celini — VFF-ove prognoze,
  // studije Interconnection Consultinga, ALUMIL, preuzimanja u industriji stakla.
  // Autorski tekst, ne saopštenje: sme da se citira i linkuje, ne sme da se prenosi.
  // robots.txt otvoren, nijedan AI bot nije imenovan (provereno 31. 10. 2026).
  { id: 'oknaua', name: 'OKNA.ua', lang: 'en', region: 'Evropa', tier: 1,
    html: 'https://okna.ua/en/news/',
    linkPattern: /href="(https:\/\/okna\.ua\/en\/news\/\d{8}\/[a-z0-9-]{10,})"/gi },

  // Evropski portal o ravnom staklu i fasadama. Donosi i pozicije udruženja
  // (Glass for Europe, GGF) koje druge naše izvore zaobilaze. Njegov /rss.xml
  // postoji ali je mrtav — poslednja stavka iz februara 2022 — pa ide preko HTML-a.
  // robots.txt je podrazumevani Drupal, nijedan AI bot nije imenovan.
  { id: 'glassonweb', name: 'glassonweb', lang: 'en', region: 'Evropa', tier: 1,
    html: 'https://www.glassonweb.com/news',
    linkPattern: /href="(\/news\/[a-z0-9-]{20,})"/gi,
    base: 'https://www.glassonweb.com' },

  // ── DOMAĆI IZVORI ──────────────────────────────────────────────────────
  // Opšti građevinski portali, ne specijalizovani za stolariju. Zato nose
  // oznaku opsti: true — propuštaju se samo stavke čiji naslov ili najava
  // pominju prozore, vrata, staklo, fasadu ili okov. Bez tog filtera bi se
  // trošio model na sportske hale, osvetljenje i UPS uređaje.
  { id: 'gradnja', name: 'Gradnja.rs', lang: 'sr', region: 'Srbija', tier: 1, opsti: true, stranicenje: true, dubina: 25,
    rss: 'https://www.gradnja.rs/feed/' },
  { id: 'gradjevinarstvo-vesti', name: 'Gradjevinarstvo.rs', lang: 'sr', region: 'Srbija', tier: 1, opsti: true,
    rss: 'https://www.gradjevinarstvo.rs/rss/vesti' },
  { id: 'gradjevinarstvo-tekstovi', name: 'Gradjevinarstvo.rs', lang: 'sr', region: 'Srbija', tier: 1, opsti: true,
    rss: 'https://www.gradjevinarstvo.rs/rss/tekstovi' },

  // Ministarstvo rudarstva i energetike — javni pozivi i subvencije za
  // energetsku sanaciju. Najveći deo feeda je o struji, gasu i rudnicima, pa
  // ide kroz svoju listu reči. Objavljuje ćirilicom; filter to podnosi.
  // Stavke nemaju pojedinačan datum, pa padaju na datum obrade — zato ovaj
  // izvor ne ulazi u povlačenje po datumskom prozoru.
  { id: 'mre', name: 'Ministarstvo rudarstva i energetike', lang: 'sr', region: 'Srbija', tier: 1,
    opsti: true, kljucne: KLJUCNE_SUBVENCIJE,
    rss: 'https://mre.gov.rs/rss/?change_lang=cr' },

  // ── OSTATAK BALKANA ────────────────────────────────────────────────────
  // Portal se zove balkanski, pa mora da ima i Makedoniju, Bosnu, Crnu Goru,
  // Bugarsku i Grčku. Svi su opšti portali — specijalizovanog lista za
  // stolariju sa feedom u ovim zemljama nema — pa idu kroz filter po rečima.
  //
  // Jezik: bosanski i crnogorski nose lang 'sr' da bi dobili urednička pravila
  // za domaću vest, jer prevod nije potreban. Makedonski, bugarski i grčki
  // imaju svoje oznake i prolaze kroz prevod.
  { id: 'porta3', name: 'Porta3', lang: 'mk', region: 'Makedonija', tier: 1, opsti: true, dubina: 25, stranicenje: true,
    rss: 'https://www.porta3.mk/feed/' },
  { id: 'akta', name: 'Akta.ba', lang: 'sr', region: 'BiH', tier: 1, opsti: true, dubina: 40,
    rss: 'https://www.akta.ba/rss' },
  { id: 'ecoportal', name: 'Ecoportal.me', lang: 'sr', region: 'Crna Gora', tier: 1, opsti: true, dubina: 30, stranicenje: true,
    rss: 'https://www.ecoportal.me/feed/' },
  { id: 'stroitel', name: 'Строител', lang: 'bg', region: 'Bugarska', tier: 1,
    opsti: true, kljucne: KLJUCNE_BG, dubina: 40,
    rss: 'https://vestnikstroitel.bg/rss' },
  { id: 'b2green', name: 'B2Green', lang: 'el', region: 'Grcka', tier: 1,
    opsti: true, kljucne: KLJUCNE_GR, dubina: 40, stranicenje: true,
    rss: 'https://news.b2green.gr/feed' },
];

const UA = 'Mozilla/5.0 (compatible; StokIKriloBot/1.0; +https://stokikrilo.com)';

async function grab(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  return await res.text();
}

const strip = (h) => String(h || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#8217;|&#039;|&#39;/g, "'")
  .replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#8211;|&#8212;/g, '-')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

// Slika iz saopštenja. Uzima se SAMO sa izvora koji nose `foto: true` — to su
// oni čiji je sadržaj saopštenje objavljeno da bi se prenosilo (EuroWindoor to
// piše doslovno u svom biltenu) ili pres soba proizvođača. Autorski tekst nije
// isto: tamo sme navod i link, slika ne. Dozvola za čitanje nije dozvola za
// objavljivanje, pa se spisak širi odlukom, ne automatski.
const SLIKA_NASTAVAK = /\.(jpe?g|png|webp)(\?|$)/i;
function slikaIzStavke(it) {
  const kandidati = [
    (it.match(/<media:content[^>]+url=["']([^"']+)/i) || [])[1],
    (it.match(/<media:thumbnail[^>]+url=["']([^"']+)/i) || [])[1],
    (it.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i) || [])[1],
    (it.match(/<img[^>]+src=["']([^"']+)/i) || [])[1],
  ];
  for (const u of kandidati) {
    if (u && /^https:\/\//i.test(u) && SLIKA_NASTAVAK.test(u)) return u.replace(/&amp;/g, '&');
  }
  return null;
}

function parseRSS(xml, src) {
  const out = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const title = strip((it.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const link  = strip((it.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
    const desc  = strip((it.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1]).slice(0, 900);
    const pub   = strip((it.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]);
    const slika = src.foto ? slikaIzStavke(it) : null;
    if (title && link) out.push({ source: src.name, sourceId: src.id, lang: src.lang, rubrika: src.rubrika || null, title, url: link, summary: desc, excerpt: desc, published: pub, slika });
  }
  return out;
}

async function parseHTML(list, src, limit) {
  const urls = [];
  for (const m of list.matchAll(src.linkPattern)) {
    const u = m[1].startsWith('http') ? m[1] : (src.base || '') + m[1];
    if (!urls.includes(u)) urls.push(u);
    if (urls.length >= limit) break;
  }
  const out = [];
  for (const u of urls) {
    try {
      const page = await grab(u);
      const title =
        strip((page.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || [])[1]) ||
        strip((page.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
      const summary =
        strip((page.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i) || [])[1]) ||
        strip((page.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [])[1]);
      // Datum se traži redom, od najpouzdanijeg zapisa ka najslabijem.
      // Ranije se gledalo samo `article:published_time` i domaći zapis
      // 30.09.2026, pa je svaki sajt koji nosi datum drugačije padao na datum
      // obrade — ista greška koja je 1. 10. 2026. stavljala septembarske članke
      // na portal kao današnje. Provereno 31. 10. 2026: Fereastra i OKNA.ua
      // nose <time datetime>, glassonweb nema nijednu oznaku nego samo tekst.
      // Tekstualni zapis ide POSLEDNJI, jer na strani ume da stoji i današnji
      // datum u zaglavlju — na Fereastri baš tako i stoji.
      const published =
        strip((page.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i) || [])[1]) ||
        strip((page.match(/<time[^>]+datetime=["']([^"']+)/i) || [])[1]) ||
        strip((page.match(/"datePublished"\s*:\s*"([^"]+)"/i) || [])[1]) ||
        strip((page.match(/(\d{2}\.\d{2}\.\d{4})/) || [])[1]) ||
        strip((page.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i) || [])[1]);
      let paras = [...page.matchAll(/<p[^>]*>([\s\S]{60,}?)<\/p>/gi)]
        .map(x => strip(x[1])).filter(t => t.length > 60).slice(0, 6).join('\n\n');
      // Sajt bez ijednog <p> taga. OKNA.ua telo vesti drži u <div>-ovima, pa
      // je gornji izraz vraćao prazan tekst i model bi dobio samo og:description
      // od stotinak znakova — premalo da se iz toga napiše vest.
      // itemprop="articleBody" je schema.org oznaka i radi i na drugim sajtovima.
      if (paras.length < 200) {
        const telo = (page.match(/itemprop=["']articleBody["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i) || [])[1];
        if (telo) paras = strip(telo);
      }
      const slika = src.foto
        ? ((page.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || [])[1] || null)
        : null;
      if (title) out.push({ source: src.name, sourceId: src.id, lang: src.lang, rubrika: src.rubrika || null, title, url: u, summary, published, excerpt: paras.slice(0, 2500), slika: slika && /^https:\/\//i.test(slika) ? slika : null });
    } catch (e) { console.log('[' + src.id + '] preskoceno ' + u + ': ' + e.message); }
  }
  return out;
}

export async function fetchSource(src, limit = 5, strane = 1) {
  // Opšti portal objavi tридесетak vesti dnevno, a o stolariji jednu-dve
  // nedeljno. Ako se iz njega uzme samo prvih nekoliko stavki, filter nema
  // šta da prosejava i izvor stalno vraća nulu. Zato takav izvor sme da nosi
  // svoju dubinu. Ne poskupljuje posao: filter radi pre rezanja, pa model i
  // dalje dobija samo ono što je u temi.
  if (src.opsti && src.dubina) limit = Math.max(limit, src.dubina);
  if (src.rss) {
    // Više strana se traži samo za nadoknadu arhive i samo tamo gde feed to
    // podržava. Dnevno povlačenje ostaje na prvoj strani.
    const koliko = src.stranicenje ? Math.max(1, strane) : 1;
    let xml = '';
    const sveStavke = [];
    for (let p = 1; p <= koliko; p++) {
      const adresa = p === 1 ? src.rss : src.rss + (src.rss.includes('?') ? '&' : '?') + 'paged=' + p;
      try {
        xml = await grab(adresa);
        const deo = parseRSS(xml, src);
        if (!deo.length) break;          // dalje strane su prazne
        sveStavke.push(...deo);
      } catch (e) {
        // Pad prve strane znači da izvor nije ni pročitan. Ranije se i to
        // tiho vraćalo kao nula stavki, pa je u izveštaju izgledalo isto kao
        // „izvor radi, ali danas nema ništa u temi" — dve sasvim različite
        // stvari. Zato prva strana puca naglas, a dalje strane i dalje tiho.
        if (p === 1) throw e;
        console.log('[' + src.id + '] strana ' + p + ' nije uspela: ' + e.message);
        break;
      }
    }
    let stavke = sveStavke;
    // Opšti portal se prvo proseje, pa tek onda seče na limit. Obrnuto bi
    // prvih nekoliko stavki pojelo kvotu i stolarija bi ostala neuzeta.
    if (src.opsti) {
      const pre = stavke.length;
      stavke = stavke.filter(x => ticeSeStolarije(x, src.kljucne || KLJUCNE_RECI));
      console.log('[' + src.id + '] filter: ' + stavke.length + ' od ' + pre);
    }
    return stavke.slice(0, limit);
  }
  const list = await grab(src.html);
  return await parseHTML(list, src, limit);
}

export async function fetchAll(perSource = 4, strane = 1) {
  const all = [], errors = [];
  // Koliko je koji izvor dao. Bez toga se iz izveštaja ne vidi da li izvor
  // ćuti zato što nema ničeg novog ili zato što je pukao, a logovi Netlify-a
  // nisu pri ruci dok se radi.
  const brojPoIzvoru = {};
  for (const src of SOURCES) {
    try {
      const items = await fetchSource(src, perSource, strane);
      all.push(...items);
      brojPoIzvoru[src.id] = items.length;
      console.log('[' + src.id + '] povuceno ' + items.length);
    } catch (e) {
      errors.push(src.id + ': ' + e.message);
      brojPoIzvoru[src.id] = 'greska';
      console.log('[' + src.id + '] GRESKA: ' + e.message);
    }
  }
  return { all, errors, brojPoIzvoru };
}

// CAT_IMG (osam stok fotografija, jedna po kategoriji) uklonjen 1. 11. 2026.
// Vest više ne nosi sliku; naslovnicu crta portal iz naslova vesti.

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// ── PODKASTI ──────────────────────────────────────────────────────────────
// Feedovi provereni preko iTunes API-ja. Datum = poslednja epizoda u trenutku
// dodavanja. Neaktivni izbačeni (Glazing Insider, Shapemakers, Everything
// Building Envelope - svi stali 2025. ili ranije).
export const PODCASTS = [
  { id: 'clearimpact', name: 'Clear Impact Podcast', feed: 'https://feeds.castos.com/kdrw0',
    fokus: 'Prozori, vrata, komponente, vođenje proizvodne firme. Vodi ga čovek iz industrije.', tier: 1 },
  { id: 'glasstalk', name: 'GlassTalk', feed: 'https://feeds.captivate.fm/glasstalk/',
    fokus: 'Staklo i staklarstvo, tehnologija obrade.', tier: 1 },
  { id: 'fabricator', name: 'From the Fabricator', feed: 'https://rss.buzzsprout.com/1619728.rss',
    fokus: 'Za fabrikante stakla i stolarije - proizvodnja i operativa.', tier: 1 },
  { id: 'twopigs', name: 'Two PiGs in a Pod', feed: 'https://feed.podbean.com/twopigsinapod/feed.xml',
    fokus: 'Ljudi iz britanske glazing industrije, karijere i firme.', tier: 2 },
  { id: 'powdercoater', name: 'Powder Coater Podcast', feed: 'https://www.rosskote.com/feed.xml',
    fokus: 'Plastifikacija aluminijuma - direktno relevantno za AL stolariju.', tier: 1 },
  { id: 'facades', name: 'All Things Facades', feed: 'https://anchor.fm/s/ed8beac8/podcast/rss',
    fokus: 'Fasadni sistemi i omotač zgrade.', tier: 2 },
  { id: 'passivhaus', name: 'Marketing Passivhaus', feed: 'https://feeds.transistor.fm/marketing-passivhaus',
    fokus: 'Energetska efikasnost i kako se ona prodaje krajnjem kupcu.', tier: 2 },
  { id: 'windowcast', name: 'Window Cast (NGA)', feed: 'https://anchor.fm/s/e3ffd85c/podcast/rss',
    fokus: 'Glasilo National Glass Association. Retko izlazi, ali kvalitetno.', tier: 2 },
  // Dodato 1. 11. 2026. Podkast kanadskog lista Fenestration Review. Svaka
  // epizoda je razgovor sa imenovanim čovekom iz branše — „Greg Schirk, SAWDAC",
  // „John Westerfield, Crystalite". Zato nosi rubrika: 'stav'.
  { id: 'fenconv', name: 'Fenestration Conversations', feed: 'https://feeds.captivate.fm/fenestration-conversati/',
    fokus: 'Razgovori sa ljudima iz branše prozora i vrata, list Fenestration Review.', tier: 1, rubrika: 'stav' },
  // Glas industrije stakla; epizode o glasstec-u, cirkularnoj ekonomiji i
  // odnosima sa kupcima, uvek sa imenovanim gostom.
  { id: 'glasscast', name: 'Glass Cast', feed: 'https://anchor.fm/s/e3b3c048/podcast/rss',
    fokus: 'Staklo i fasade, sajmovi i tržišni pregledi, uz imenovanog gosta.', tier: 1, rubrika: 'stav' },
];

// Stanje feedova provereno 1. 11. 2026: svih osam postojećih radi i svi nose
// audio. Sveži su clearimpact (27. 10.), glasstalk (16. 10.), fabricator
// (31. 10.), twopigs (28. 10.), powdercoater (13. 10.) i passivhaus (23. 10.).
// Uspavani su facades (poslednja 12. 6. 2026) i windowcast (20. 4. 2026) —
// ostaju u listi jer obojica povremeno objave, a prazan feed ne košta ništa.
// Paradigm Industry Insiders je proveren i NIJE uzet: poslednja epizoda
// 7. 1. 2026, deset meseci ćutanja.

// Iz podcast RSS-a vadi epizode zajedno sa linkom na audio fajl (enclosure).
export async function fetchPodcastEpisodes(pod, limit = 3) {
  const res = await fetch(pod.feed, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(res.status + ' ' + pod.feed);
  const xml = await res.text();
  const out = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const g = (re) => strip((it.match(re) || [])[1]);
    const audio = (it.match(/<enclosure[^>]+url=["']([^"']+)["']/i) || [])[1];
    const title = g(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const link = g(/<link[^>]*>([\s\S]*?)<\/link>/i) || audio;
    if (!title || !audio) continue;
    out.push({
      podcast: pod.name, podcastId: pod.id, tip: 'podkast',
      rubrika: pod.rubrika || null,
      title, url: link, audio,
      summary: g(/<description[^>]*>([\s\S]*?)<\/description>/i).slice(0, 1500),
      published: g(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function fetchAllPodcasts(perShow = 2) {
  const all = [], errors = [];
  for (const p of PODCASTS) {
    try {
      const eps = await fetchPodcastEpisodes(p, perShow);
      all.push(...eps);
      console.log('[pod:' + p.id + '] ' + eps.length + ' epizoda');
    } catch (e) {
      errors.push('pod:' + p.id + ': ' + e.message);
      console.log('[pod:' + p.id + '] GRESKA: ' + e.message);
    }
  }
  return { all, errors };
}
