// ==========================================================================
// ŠTOK I KRILO — barometar, račun: od zapisa do vrednosti po zemlji
//
// Pravila, redom:
//  1. Uzimaju se samo zapisi bez montaže, PVC, sa poznatim statusom PDV-a.
//     Izvor koji ne piše da li je cena sa PDV-om ili bez ne ulazi u račun —
//     pogađanje bi pomerilo vrednost za 17–25%, a to je veće od razlike
//     između zemalja. Takvi izvori se prikazuju, ali se ne broje.
//  2. Cena se svodi na neto (bez PDV-a), da se zemlje porede među sobom.
//  3. Cena po m² pada sa veličinom (fiksni deo + promenljivi deo), pa se
//     obična medijana €/m² ne koristi. Za svaki izvor se Theil–Sen linijom
//     (medijana nagiba, otporna na odstupanja) procenjuje cena na
//     referentnoj veličini. Izvor ne sme da se ekstrapolira daleko od
//     veličina koje stvarno prodaje.
//  4. Svaki izvor glasa jednom. Katalog sa dvesta artikala nije dvesta
//     merenja tržišta.
//  5. Vrednost zemlje je medijana izvora. Tri izvora i više: „ok". Dva:
//     „okvirno". Manje: „nedovoljno podataka".
// ==========================================================================

export const REFERENCE = {
  A: { id: 'A', opis: 'jednokrilni 100×100 cm', krila: [1], povrsina: 1.0 },
  B: { id: 'B', opis: 'dvokrilni 140×140 cm', krila: [2], povrsina: 1.96 },
};

const medijana = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// Theil–Sen: cena = a + b·površina.
export function linija(tacke) {
  const nagibi = [];
  for (let i = 0; i < tacke.length; i++) {
    for (let j = i + 1; j < tacke.length; j++) {
      const dx = tacke[j][0] - tacke[i][0];
      if (Math.abs(dx) > 1e-6) nagibi.push((tacke[j][1] - tacke[i][1]) / dx);
    }
  }
  if (!nagibi.length) return null;
  const b = medijana(nagibi);
  const a = medijana(tacke.map(([x, y]) => y - b * x));
  return { a, b };
}

// Procena jednog izvora na referentnoj veličini, ili null sa razlogom.
export function proceniIzvor(zapisi, ref) {
  const tacke = zapisi
    .filter(z => z.povrsina && z.neto > 0 && ref.krila.includes(z.krila))
    .map(z => [z.povrsina, z.neto]);
  if (!tacke.length) return { razlog: 'nema prozora tog tipa' };
  const povrsine = [...new Set(tacke.map(t => t[0]))];
  const min = Math.min(...povrsine), max = Math.max(...povrsine);
  // Jedna veličina, i to blizu reference: medijana cena, bez linije.
  if (povrsine.length === 1) {
    if (Math.abs(min - ref.povrsina) / ref.povrsina > 0.1) return { razlog: 'samo jedna veličina, daleko od reference' };
    return { vrednost: medijana(tacke.map(t => t[1])), nacin: 'medijana', tacaka: tacke.length };
  }
  if (tacke.length < 3) return { razlog: 'manje od tri cene' };
  if (ref.povrsina < min * 0.8 || ref.povrsina > max * 1.25) return { razlog: 'referenca van opsega veličina izvora' };
  const l = linija(tacke);
  if (!l) return { razlog: 'linija se ne može postaviti' };
  const v = l.a + l.b * ref.povrsina;
  if (!(v > 0)) return { razlog: 'linija daje besmislenu cenu' };
  return { vrednost: v, nacin: 'linija', tacaka: tacke.length, fiksno: l.a, poM2: l.b };
}

// Zapisi iz najnovijeg prolaza svakog izvora, u okviru jednog meseca.
function najnovijiPoIzvoru(zapisi) {
  const poslednji = new Map();
  for (const z of zapisi) {
    if (!poslednji.has(z.izvor) || z.datumOcitavanja > poslednji.get(z.izvor)) poslednji.set(z.izvor, z.datumOcitavanja);
  }
  return zapisi.filter(z => z.datumOcitavanja === poslednji.get(z.izvor));
}

function neto(z) {
  if (z.pdv === 'bez') return z.cenaEur;
  if (z.pdv === 'uklj' && z.pdvStopa) return z.cenaEur / (1 + z.pdvStopa / 100);
  return null;
}

export function izracunaj(zapisi, refId = 'A') {
  const ref = REFERENCE[refId];
  if (!ref) throw new Error('nepoznata referenca');
  const osnova = najnovijiPoIzvoru(zapisi)
    .filter(z => z.montaza === 'bez' && (z.materijal === 'PVC' || !z.materijal) && z.cenaEur);
  const poZemlji = {};
  const izvoriBezPdv = new Set();
  for (const z of osnova) {
    const n = neto(z);
    if (n == null) { izvoriBezPdv.add(z.izvor); continue; }
    ((poZemlji[z.zemlja] ||= {})[z.izvor] ||= []).push({ ...z, neto: n });
  }
  const zemlje = {};
  for (const [zemlja, izvori] of Object.entries(poZemlji)) {
    const procene = [], odbaceni = [];
    for (const [izvor, zs] of Object.entries(izvori)) {
      const p = proceniIzvor(zs, ref);
      (p.vrednost != null ? procene : odbaceni).push({ izvor, ...p });
    }
    // Izvor koji odstupa više od 35% od medijane ostalih (kad ih ima bar tri) se izdvaja.
    let vazeci = procene;
    if (procene.length >= 3) {
      const m = medijana(procene.map(p => p.vrednost));
      vazeci = procene.filter(p => Math.abs(p.vrednost - m) / m <= 0.35);
      for (const p of procene) if (!vazeci.includes(p)) odbaceni.push({ izvor: p.izvor, razlog: 'odstupa više od 35% od medijane' });
    }
    const n = vazeci.length;
    zemlje[zemlja] = {
      vrednostNeto: n ? +medijana(vazeci.map(p => p.vrednost)).toFixed(2) : null,
      izvora: n,
      status: n >= 3 ? 'ok' : n === 2 ? 'okvirno' : 'nedovoljno podataka',
      izvoriDetalj: vazeci.map(p => ({ izvor: p.izvor, vrednost: +p.vrednost.toFixed(2), nacin: p.nacin, tacaka: p.tacaka })),
      odbaceni,
    };
  }
  return {
    referenca: ref,
    napomena: 'Cene bez montaže, neto (bez PDV-a), u evrima; medijana procena po izvoru.',
    zemlje,
    izvoriBezStatusaPdv: [...izvoriBezPdv],
  };
}
