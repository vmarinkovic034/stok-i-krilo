// ==========================================================================
// ŠTOK I KRILO — barometar, skladište pojedinačnih očitavanja cena
//
// Pravilo od koga ceo barometar zavisi: stara cena se nikada ne prepisuje
// novom. Svako očitavanje je nov zapis sa svojim datumom. Posle dvanaest
// meseci imamo niz, posle trideset šest imamo istoriju tržišta koju niko
// drugi nema. Ako bismo prepisivali, imali bismo samo trenutnu sliku —
// a nju ima svako ko ume da otvori sajt.
//
// Zapisi stoje odvojeno od `barometar.json`, koji nosi ručno uneta merenja
// fiksne korpe sa ugradnjom. To su dve različite serije i ne smeju da se
// mešaju: ovde je jedinična cena artikla bez montaže, tamo je opseg iz
// prijavljenih projekata sa montažom. Razlika između te dve stvari je blizu
// dvostruka.
// ==========================================================================
import { readJSON, writeJSON } from './_lib.mjs';

export const KLJUC_ZAPISI = 'barometar-zapisi.json';
export const KLJUC_PROLAZI = 'barometar-prolazi.json';

// Koliko zapisa čuvamo ukupno. Osam velikih kataloga daje oko 3.000 zapisa
// mesečno; 150.000 je oko četiri godine. Kad se pređe, režu se najstariji.
const MAX_ZAPISA = 150000;

// Jedno očitavanje. Polja koja ne znamo ostaju null — nikad se ne pogađaju.
export function zapis({
  izvor, zemlja, firma, url, tipIzvora,
  naziv, sirina, visina, materijal, sistem, zastakljenje, krila,
  cena, valuta, cenaEur,
  pdv, pdvStopa, montaza, tipCene,
  roletna = false, komarnik = false,
  datumNaStrani = null,
}) {
  const povrsina = (sirina && visina) ? +(sirina * visina / 10000).toFixed(4) : null;
  return {
    izvor, zemlja, firma, url, tipIzvora,
    naziv: naziv || null,
    sirina: sirina ?? null, visina: visina ?? null, povrsina,
    materijal: materijal || null, sistem: sistem || null,
    zastakljenje: zastakljenje || null, krila: krila ?? null,
    cena, valuta, cenaEur: cenaEur ?? null,
    eurPoM2: (cenaEur && povrsina) ? +(cenaEur / povrsina).toFixed(2) : null,
    pdv, pdvStopa: pdvStopa ?? null, montaza, tipCene,
    roletna, komarnik,
    datumNaStrani,
    datumOcitavanja: new Date().toISOString().slice(0, 10),
    outlier: null,
  };
}

export async function ucitajZapise() {
  return await readJSON(KLJUC_ZAPISI, []);
}

// Dodaje zapise iz jednog prolaza. Ne proverava duplikate po sadržaju —
// isti artikal iste nedelje po istoj ceni je legitiman nov zapis, jer
// potvrđuje da se cena nije pomerila. Duplikat po danu i artiklu se ipak
// preskače, da ručno pokretanje dvaput zaredom ne naduva uzorak.
export async function dodajZapise(novi) {
  const stari = await ucitajZapise();
  const kljuc = (z) => [z.izvor, z.naziv, z.sirina, z.visina, z.sistem, z.datumOcitavanja].join('|');
  const vec = new Set(stari.map(kljuc));
  const zaUpis = novi.filter(z => !vec.has(kljuc(z)));
  const sve = stari.concat(zaUpis);
  const rezani = sve.length > MAX_ZAPISA ? sve.slice(sve.length - MAX_ZAPISA) : sve;
  await writeJSON(KLJUC_ZAPISI, rezani);
  return { dodato: zaUpis.length, preskoceno: novi.length - zaUpis.length, ukupno: rezani.length };
}

// Izveštaj poslednjih prolaza — koji izvor je dao koliko i gde je puklo.
// Background funkcija odmah vrati 202, pa se bez ovoga ne vidi šta se desilo.
export async function upisiProlaz(izvestaj) {
  const prolazi = await readJSON(KLJUC_PROLAZI, []);
  prolazi.push({ kada: new Date().toISOString(), ...izvestaj });
  await writeJSON(KLJUC_PROLAZI, prolazi.slice(-40));
}
