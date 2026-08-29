# ŠTOK I KRILO — automatsko povlačenje vesti

## Kako radi

1. **Svakog radnog dana u 05:00 UTC** Netlify pokreće `scheduled-drafts`.
2. Funkcija povlači izvore (DGB, GLASWELT, OknoNet, Window+Door), preskače ono što je već obrađeno.
3. Claude piše srpsku verziju sa pasusom „Šta ovo znači za Balkan?".
4. **Automatska provera kvaliteta** (`_kvalitet.mjs`) proverava svaki tekst:
   - **Izmišljeni brojevi** — svaki broj u tekstu mora da postoji u izvornom tekstu. Ako ne postoji, nacrt se označava crveno.
   - **Prazan Balkan pasus** — mora da traži konkretnu radnju (proveri / uporedi / izračunaj / pitaj / prebroj...). Ako ne traži, označava se.
   - **Floskule** — lista od ~35 praznih fraza („u današnje vreme", „ostaje da se vidi", „pratiti trendove"...).
   - **Ijekavica** — portal je na ekavici.
   Ako provera nađe ozbiljan problem, ide **jedan automatski popravni krug**: modelu se vraćaju konkretne zamerke i on prepisuje tekst. Zadržava se bolja verzija.
5. Tekstovi se snimaju kao **nacrti** — ne idu na sajt.
6. Urednik otvara `/admin.html`, čita i klikne **Odobri** ili **Odbaci**.
7. Odobrene vesti se pojavljuju na portalu preko `/api/news`.

Ništa se ne objavljuje bez ljudskog odobrenja. Svaki nacrt u adminu ima ocenu 0-100 i obojenu ivicu:
**zelena** = provera čista · **žuta** = pregledati · **crvena** = obavezno pročitaj pre odobravanja.

Ocena nije garancija kvaliteta — ona hvata mehaničke greške. Prosuđivanje da li je pasus stvarno koristan i dalje je tvoje.

## Šta treba podesiti (jednokratno)

U Netlify: **Site configuration → Environment variables → Add a variable**

| Ime | Vrednost |
|---|---|
| `ANTHROPIC_API_KEY` | Ključ sa console.anthropic.com → API keys |
| `ADMIN_TOKEN` | Bilo koja duga lozinka koju sam smisliš (npr. 30+ znakova) |

Posle unosa: **Deploys → Trigger deploy → Clear cache and deploy site.**

## Provera da radi

1. Otvori `https://stok-i-krilo.netlify.app/admin.html`
2. Unesi `ADMIN_TOKEN`
3. Klikni **Povuci nove vesti sada** (traje do 2 minuta)
4. Pojaviće se nacrti — pročitaj ih i odobri one koje želiš

## Trošak

Jedan poziv dnevno, 5 vesti po pozivu. Očekivano **5-15 EUR mesečno** na Anthropic API. Netlify funkcije su u besplatnom paketu do 125.000 poziva mesečno.

## Bezbednost

`ADMIN_TOKEN` je jedina zaštita admin strane. Neka bude dugačak i nemoj ga deliti. `admin.html` ima `noindex` pa se ne pojavljuje u pretrazi, ali URL je javan — token je ono što štiti podatke.

## Dodavanje novog izvora

U `netlify/functions/_lib.mjs`, niz `SOURCES`. Ako izvor ima RSS — dodaj `rss`. Ako nema — dodaj `html` + `linkPattern` (regex koji hvata linkove članaka) + `base`.

## Ako nešto ne radi

Netlify → **Logs → Functions** → `scheduled-drafts` (automatsko) ili `run-drafts` (ručno dugme). Funkcija loguje svaki izvor posebno, pa se odmah vidi koji je pao. Ako jedan izvor blokira pristup, ostali i dalje rade.


---

# Podkasti kao izvor vesti

## Kako radi

1. **Ponedeljkom u 04:00 UTC** funkcija `scheduled-podcasts` čita RSS feedove osam podkasta.
2. Za najnovije epizode skida MP3 i šalje ga na **Groq Whisper turbo** za transkripciju (~0,05 EUR po epizodi).
3. Claude iz transkripta izvlači **jednu tvrdnju** koja je vest za balkanskog proizvođača i piše kratak tekst od 3-4 pasusa.
4. Transkript se **ne čuva i ne objavljuje** — koristi se samo da bi model razumeo o čemu se priča.
5. Nacrt ide u istu urednički red kao i ostale vesti, sa oznakom PODKAST.

Ručno: dugme **„Obradi nove podkaste"** u `/admin.html`. Traje 3-6 minuta.

## Uredničko pravilo — zašto je ovo dozvoljeno

Ne prenosi se epizoda. Prenosi se **tvrdnja sa pripisivanjem**, kao u svakom novinarstvu:
„Na podkastu X, N.N. iz firme Y kaže da…" + link na original.

Automatska provera odbija tekst koji:
- ne imenuje podkast (`pripisivanje`)
- ima više od jednog direktnog citata (`citati`)
- je duži od 3.200 znakova (`predugo` — vest o epizodi nije zamena za epizodu)
- sadrži broj koji nije izgovoren u transkriptu (`broj-bez-izvora`)

## Dodatna env varijabla

| Ime | Vrednost |
|---|---|
| `GROQ_API_KEY` | Sa console.groq.com → API Keys. Secret, scope Functions. |

Bez nje podkast funkcije vraćaju jasnu grešku, a ostatak portala radi normalno.

## Trošak

Transkripcija ~0,05 EUR po epizodi. Tri epizode nedeljno ≈ **manje od 1 EUR mesečno**.
Epizode duže od 24 MB se seku na prvih 24 MB (Groq limit) — obično 25-50 minuta razgovora, dovoljno za suštinu.

## Podkasti u listi

Clear Impact · GlassTalk · From the Fabricator · Two PiGs in a Pod · Powder Coater Podcast · All Things Facades · Marketing Passivhaus · Window Cast (NGA)

Feedovi provereni. Neaktivni (Glazing Insider, The Shapemakers, Everything Building Envelope) namerno izostavljeni.
