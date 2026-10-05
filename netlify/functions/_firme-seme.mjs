// ==========================================================================
// ŠTOK I KRILO — početni spisak kompanija
//
// Do 5. 10. 2026. direktorijum je radio ovako: petnaest firmi tvrdo upisanih u
// index.html, a preko njih se pokušavalo povlačenje iz Gugl tabele. To
// povlačenje nije radilo nijednom — tabela je privatna i vraća 401, i sa
// servera i iz pregledača. Formular za upis firme takođe nije bio povezan
// (COMPANY_FORM_ENDPOINT je stajao prazan), pa niko ništa nije mogao ni da
// prijavi.
//
// Tabela je uz to imala osam firmi, a kod petnaest — istih osam plus sedam
// projektantskih biroa. Da je povlačenje proradilo, direktorijum bi se
// smanjio.
//
// Zato Gugl tabela ispada iz lanca. Kompanije idu u istu bazu u kojoj su
// vesti, uz isti admin panel za odobravanje. Opisi su prebačeni na ekavicu.
//
// Ovaj fajl je seme: kompanije-import.mjs ga jednom upiše i zaključa se.
// ==========================================================================
export const FIRME_SEME = 
[
  {
    "id": "kmp-001",
    "name": "Alumil YU Industry",
    "city": "Čačak",
    "country": "Srbija",
    "cat": "AL profili",
    "products": [
      "Ekstruzija aluminijuma",
      "Arhitektonski sistemi",
      "Fasadni sistemi"
    ],
    "verified": true,
    "url": "https://www.alumil.com/serbia",
    "desc": "Grčka grupacija Alumil u Srbiji ima vlastitu fabriku ekstruzije aluminijumskih profila u Čačku. Jedna od retkih lokalnih ekstruzija u regionu. Ove godine slavi 20 godina rada u Srbiji.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-002",
    "name": "ETEM Srbija",
    "city": "Beograd",
    "country": "Srbija",
    "cat": "AL profili",
    "products": [
      "Prozorski sistemi",
      "Fasadni sistemi",
      "Klizna vrata"
    ],
    "verified": true,
    "url": "https://www.etem.com",
    "desc": "ETEM (deo EL.PROM grupe) nudi aluminijumske arhitektonske sisteme za prozore, vrata i fasade. Aktivni na tržištu Srbije, BiH i regiona.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-003",
    "name": "AGC Flat Glass Jug",
    "city": "Beograd",
    "country": "Srbija",
    "cat": "Staklo",
    "products": [
      "Float staklo",
      "Niskoemisijsko staklo",
      "Sigurnosno staklo"
    ],
    "verified": true,
    "url": "https://www.agc-glass.eu",
    "desc": "AGC distribucija i obrada ravnog stakla za srpsko tržište. Deo AGC grupe - jednog od tri najveća svetska proizvođača ravnog stakla.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-004",
    "name": "Rolomatik",
    "city": "Beograd",
    "country": "Srbija",
    "cat": "Garažna vrata",
    "products": [
      "Garažna segmentna vrata",
      "Industrijska vrata",
      "Rolo vrata"
    ],
    "verified": false,
    "url": "https://rolomatik.com",
    "desc": "Srpski proizvođač i instalater garažnih i industrijskih vrata. Pokriva tržište Srbije i dela regiona.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-005",
    "name": "Aluline",
    "city": "Beograd",
    "country": "Srbija",
    "cat": "Garažna vrata",
    "products": [
      "Garažna rolo vrata",
      "Segmentna vrata",
      "Industrijska vrata"
    ],
    "verified": false,
    "url": "https://aluline.rs",
    "desc": "Aluline proizvodi i ugrađuje garažna rolo vrata i industrijska segmentna vrata na srpskom tržištu.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-006",
    "name": "Profilink",
    "city": "Beograd",
    "country": "Srbija",
    "cat": "PVC/AL sistemi",
    "products": [
      "PVC profili",
      "Aluminijumski sistemi",
      "Roletni sistemi"
    ],
    "verified": false,
    "url": "https://www.prozorivrata.com/profilink-prosiruje-svoj-portfolio-aluminijumskim-resenjima/",
    "desc": "Profilink je proširio portfolio aluminijumskim rešenjima. Distribuira profile i roletne sisteme za srpske proizvođače stolarije.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-007",
    "name": "Roto Frank Srbija",
    "city": "Novi Sad",
    "country": "Srbija",
    "cat": "Okov",
    "products": [
      "NT okretno-nagibni okov",
      "Klizni okov",
      "Sigurnosni okov"
    ],
    "verified": true,
    "url": "https://www.roto-frank.com",
    "desc": "Regionalni zastupnik Roto Frank okova za srpsko tržište. Roto je jedan od tri najveća svetska proizvođača okova za stolariju.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-008",
    "name": "Alphaline",
    "city": "Beograd",
    "country": "Srbija",
    "cat": "Okov",
    "products": [
      "Siegenia okov",
      "MACO okov",
      "Sigurnosni sistemi"
    ],
    "verified": false,
    "url": "https://alphaline.rs",
    "desc": "Distributer Siegenia i MACO okova za Srbiju. Nudi kompletnu paletu okova za PVC i aluminijumsku stolariju.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-009",
    "name": "Mega Plus",
    "city": "Beograd",
    "country": "Srbija",
    "cat": "Arhitekte / projektantski biro",
    "products": [
      "Projektovanje objekata",
      "Idejni i glavni projekti",
      "Legalizacija objekata"
    ],
    "verified": false,
    "url": "https://megaplus.rs",
    "desc": "Projektni biro osnovan 1991. u Beogradu, sa preko 220 izvedenih objekata za investitore poput Luke Beograd, MUP-a Srbije i Delhaize/Maxi. Bavi se kompletnom tehničkom dokumentacijom, od idejnog rešenja do upotrebne dozvole.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-010",
    "name": "Gušić Architecture",
    "city": "Beograd",
    "country": "Srbija",
    "cat": "Arhitekte / projektantski biro",
    "products": [
      "Stambeni objekti",
      "Izložbeni i kulturni prostori",
      "Enterijer"
    ],
    "verified": false,
    "url": "https://www.gusicarchitecture.com",
    "desc": "Nagrađivani beogradski studio Aleksandra Gušića, specijalizovan za stambenu i kulturnu arhitekturu. Osvojio Grand Prix Balkanskog arhitektonskog bijenala i više nagrada na Salonu arhitekture u Beogradu.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-011",
    "name": "Dva arhitekta",
    "city": "Zagreb",
    "country": "Hrvatska",
    "cat": "Arhitekte / projektantski biro",
    "products": [
      "Stambeni objekti",
      "Turistički objekti",
      "Enterijer"
    ],
    "verified": false,
    "url": "https://www.dva-arhitekta.hr",
    "desc": "Zagrebački studio osnovan 1992. godine, sa nagradama na Cemex Awards, Wienerberger Brick Award i World Architecture Festival. Projekat vinarije u Slavoniji nagrađen je od strane italijanskog magazina The Plan.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-012",
    "name": "Five Extra",
    "city": "Sarajevo",
    "country": "Bosna i Hercegovina",
    "cat": "Arhitekte / projektantski biro",
    "products": [
      "Projektovanje i inženjering",
      "Renoviranje i adaptacija",
      "Dizajn enterijera"
    ],
    "verified": false,
    "url": "https://fiveextra.ba",
    "desc": "Sarajevski arhitektonski biro osnovan 1996, sa preko 340 realizovanih projekata - od hotela Central i Ilidža Tower do poslovnih i industrijskih objekata širom BiH.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-013",
    "name": "STVAR",
    "city": "Ljubljana",
    "country": "Slovenija",
    "cat": "Arhitekte / projektantski biro",
    "products": [
      "Javni objekti",
      "Stanovanjski kompleksi",
      "Urbanizam"
    ],
    "verified": false,
    "url": "http://www.stvar.si",
    "desc": "Ljubljanski biro osnovan 2005. nakon pobede na javnom natečaju za Centralnu biblioteku u Celju. Projektovao je Nordijski centar Planica i vodi rekonstrukciju olimpijskog kupališkog kompleksa u Radovljici.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-014",
    "name": "Biro Vukčević",
    "city": "Podgorica",
    "country": "Crna Gora",
    "cat": "Arhitekte / projektantski biro",
    "products": [
      "Stambeni objekti",
      "Poslovni objekti",
      "Idejni projekti"
    ],
    "verified": false,
    "url": "https://birovukcevic.me",
    "desc": "Arhitektonski biro sa sedištem u Podgorici, aktivan na projektima stambene i poslovne izgradnje u Crnoj Gori.",
    "poreklo": "seme"
  },
  {
    "id": "kmp-015",
    "name": "Biro Brut",
    "city": "Skoplje",
    "country": "Severna Makedonija",
    "cat": "Arhitekte / projektantski biro",
    "products": [
      "Stambeni objekti",
      "Fasadni dizajn",
      "Enterijer"
    ],
    "verified": false,
    "url": "https://www.birobrut.com",
    "desc": "Skopski studio fokusiran na stambenu arhitekturu, fasadni dizajn i enterijer, sa realizovanim projektima u Skoplju, Ilindenu i regionu.",
    "poreklo": "seme"
  }
];
