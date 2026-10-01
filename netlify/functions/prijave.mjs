// ==========================================================================
// ŠTOK I KRILO — prijem svih prijava sa sajta
//   POST /api/prijave        -> newsletter | firma | demo   (javno)
//   GET  /api/prijave?token= -> spisak za uredništvo        (zaštićeno)
//
// Zašto ovako: ključ nijednog servisa ne sme u pregledač, pa prijave idu
// kroz server. Svaka se prvo upisuje u Blobs, pa se tek onda pokušava
// obaveštenje na mejl. Ako mejl padne, prijava je i dalje sačuvana — kontakt
// se ne gubi ni kad spoljni servis ne radi.
// ==========================================================================
import { store, json } from './_lib.mjs';

// Svaka prijava je zaseban zapis, ne red u jednom velikom JSON-u. Razlog:
// upis u zajednički niz je čitaj-izmeni-upiši, pa dve prijave koje stignu
// blizu jedna drugoj mogu da se pregaze i kontakt se tiho izgubi.
//
// Ključ nosi vrstu, adresu i dan. Ista osoba koja se istog dana prijavi
// dvaput prepiše svoj zapis — to je upravo željeno ponašanje. Dve različite
// osobe nikad ne dele ključ.
const PREFIKS = 'prijave/';
const kljucZa = (tip, email, kada) =>
  PREFIKS + tip + '__' + email.replace(/[^a-z0-9@._-]/gi, '_') + '__' + kada.slice(0, 10);

const TIPOVI = {
  newsletter: { naziv: 'Newsletter', polja: ['email'] },
  firma: { naziv: 'Prijava firme', polja: ['naziv', 'grad', 'email', 'kategorija', 'telefon', 'proizvodi', 'sajt', 'opis'] },
  demo: { naziv: 'Zahtev za demo', polja: ['ime', 'kompanija', 'email', 'zaposlenih', 'poruka', 'povod'] },
};

const ispravanEmail = (s) => /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(s || '').trim());
const skrati = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

async function obavesti(prijava) {
  const kljuc = (process.env.RESEND_API_KEY || '').trim();
  const prima = (process.env.DIGEST_TO || '').trim();
  const salje = (process.env.DIGEST_FROM || 'ŠTOK I KRILO <onboarding@resend.dev>').trim();
  if (!kljuc || !prima) return { poslato: false, razlog: 'mejl nije podešen' };

  const red = (k, v) => v
    ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;vertical-align:top">${k}</td>
         <td style="padding:6px 0;font-size:14px;color:#111827">${String(v).replace(/</g, '&lt;')}</td></tr>`
    : '';

  const telo = `<!doctype html><html lang="sr"><body style="margin:0;background:#f5f6f7;font-family:system-ui,sans-serif">
<table role="presentation" width="100%" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e5e7eb">
<tr><td style="background:#1a3a5c;padding:18px 24px;color:#fff;font-size:15px;font-weight:600">
  Nova prijava sa sajta — ${TIPOVI[prijava.tip].naziv}</td></tr>
<tr><td style="padding:20px 24px">
  <table role="presentation">${Object.entries(prijava.podaci).map(([k, v]) => red(k, v)).join('')}</table>
  <p style="color:#9ca3af;font-size:12px;margin:18px 0 0">Primljeno ${new Date(prijava.kada).toLocaleString('sr-RS')}</p>
</td></tr></table></td></tr></table></body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + kljuc, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: salje, to: [prima],
        subject: 'Prijava sa sajta: ' + TIPOVI[prijava.tip].naziv + (prijava.podaci.email ? ' — ' + prijava.podaci.email : ''),
        html: telo,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = await res.json().catch(() => ({}));
      return { poslato: false, razlog: t.message || ('HTTP ' + res.status) };
    }
    return { poslato: true };
  } catch (e) {
    return { poslato: false, razlog: e.message };
  }
}

// Brevo je izborni korak. Dok nema svoj nalog, prijave žive u Blobs-u i stižu
// na mejl. Kad se nalog napravi, dovoljno je upisati BREVO_API_KEY i
// BREVO_LISTA_NEWSLETTER u Netlify — kod se ne dira.
//
// Portal je industrijski medij, ne proizvođač. Zato ovo ne sme da ide u
// Sunčev nalog: čitaoci su i Sunčevi konkurenti, a jedini potvrđen pošiljalac
// tamo je news.suncemarinkovic.com.
async function uBrevo(prijava) {
  const kljuc = (process.env.BREVO_API_KEY || '').trim();
  if (!kljuc) return { upisano: false, razlog: 'nije podešen' };

  const lista = parseInt(process.env[
    prijava.tip === 'newsletter' ? 'BREVO_LISTA_NEWSLETTER' : 'BREVO_LISTA_PRIJAVE'
  ] || '', 10);

  const atributi = {};
  if (prijava.podaci.ime) atributi.IME = prijava.podaci.ime;
  if (prijava.podaci.naziv) atributi.FIRMA = prijava.podaci.naziv;
  if (prijava.podaci.kompanija) atributi.FIRMA = prijava.podaci.kompanija;
  if (prijava.podaci.grad) atributi.GRAD = prijava.podaci.grad;
  if (prijava.podaci.telefon) atributi.TELEFON = prijava.podaci.telefon;

  try {
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': kljuc, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: prijava.podaci.email,
        attributes: atributi,
        listIds: Number.isFinite(lista) ? [lista] : undefined,
        updateEnabled: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = await res.json().catch(() => ({}));
      return { upisano: false, razlog: t.message || ('HTTP ' + res.status) };
    }
    return { upisano: true, lista: Number.isFinite(lista) ? lista : null };
  } catch (e) {
    return { upisano: false, razlog: e.message };
  }
}

export default async (req) => {
  // ── Uredništvo: spisak prijava ───────────────────────────────────────────
  if (req.method === 'GET') {
    const admin = (process.env.ADMIN_TOKEN || '').trim();
    const url = new URL(req.url);
    const dat = url.searchParams.get('token') || req.headers.get('x-admin-token');
    if (!admin || dat !== admin) return json({ error: 'Neovlašćen pristup' }, 401);
    const s = store();
    // Isti razlog: uredništvo treba da vidi i prijavu koja je stigla malopre.
    const { blobs } = await s.list({ prefix: PREFIKS, consistency: 'strong' });
    const prijave = (await Promise.all(
      blobs.map(b => s.get(b.key, { type: 'json' }).catch(() => null))
    )).filter(Boolean).sort((a, b) => new Date(b.kada) - new Date(a.kada));
    return json({ prijave });
  }

  if (req.method !== 'POST') return json({ error: 'Metod nije podržan' }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: 'Neispravan zahtev' }, 400); }

  const tip = String(b?.tip || '').trim();
  if (!TIPOVI[tip]) return json({ error: 'Nepoznata vrsta prijave' }, 400);

  // Mamac za robote: polje je u formi sakriveno, čovek ga nikad ne popuni.
  // Robotu se vraća uredan odgovor da ne pokušava ponovo, a ništa se ne čuva.
  if (skrati(b.vebsajt, 200)) return json({ ok: true });

  if (!ispravanEmail(b.email)) return json({ error: 'Unesite ispravnu email adresu.' }, 400);

  const podaci = { email: skrati(b.email, 200).toLowerCase() };
  for (const p of TIPOVI[tip].polja) {
    if (p === 'email') continue;
    const v = skrati(b[p], 2000);
    if (v) podaci[p] = v;
  }

  const prijava = {
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    tip, podaci,
    kada: new Date().toISOString(),
  };

  // Upis ide prvi i jedini je obavezan korak.
  const s = store();
  const kljuc = kljucZa(tip, podaci.email, prijava.kada);
  // consistency: 'strong' je ovde obavezno. Podrazumevano čitanje je
  // eventualno konzistentno, pa zapis upisan pre nekoliko sekundi još ne mora
  // da se vidi — provera duplikata bi tada uvek prolazila kao da ga nema.
  const vecPostoji = await s.get(kljuc, { type: 'json', consistency: 'strong' }).catch(() => null);
  await s.setJSON(kljuc, prijava);

  // Ista prijava istog dana ne uznemirava uredništvo drugi put.
  if (vecPostoji) return json({ ok: true, duplikat: true });

  // Obaveštenje i Brevo idu posle upisa i nezavisno jedno od drugog. Ako bilo
  // koje padne, prijava je već sačuvana i vidi se u adminu.
  const [mejl, brevo] = await Promise.all([obavesti(prijava), uBrevo(prijava)]);
  if (!mejl.poslato) console.log('prijava ' + prijava.id + ' bez mejla: ' + mejl.razlog);
  if (!brevo.upisano && brevo.razlog !== 'nije podešen') console.log('prijava ' + prijava.id + ' bez Brevo: ' + brevo.razlog);

  // Posetiocu se uvek javlja uspeh — prijava jeste sačuvana. Stanje spoljnih
  // servisa je naša briga, ne njegova.
  return json({ ok: true, mejl: mejl.poslato, brevo: brevo.upisano });
};
