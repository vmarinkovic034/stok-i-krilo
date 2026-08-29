# ŠTOK I KRILO — automatsko povlačenje vesti

## Kako radi

1. **Svakog radnog dana u 05:00 UTC** Netlify pokreće `generate-drafts`.
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

Netlify → **Logs → Functions → generate-drafts**. Funkcija loguje svaki izvor posebno, pa se odmah vidi koji je pao. Ako jedan izvor blokira pristup, ostali i dalje rade.
