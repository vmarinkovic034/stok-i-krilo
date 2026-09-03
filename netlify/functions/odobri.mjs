// ==========================================================================
// ŠTOK I KRILO — odobravanje nacrta iz mejla, bez lozinke
//   GET  /odobri?id=..&a=approve|reject&e=..&s=..  -> stranica sa potvrdom
//   POST /odobri  (isti parametri)                 -> izvršava akciju
//
// Dva koraka namerno: skeneri linkova u mejlu prate GET, ali ne šalju POST.
// Bez ovoga bi antivirus ili Gmail proxy mogao da objavi vest umesto urednika.
// ==========================================================================
import { readJSON, writeJSON, KEY_DRAFTS, KEY_APPROVED } from './_lib.mjs';
import { proveriPotpis } from './_mejl.mjs';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function strana(naslov, telo, status = 200) {
  return new Response(`<!doctype html><html lang="sr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(naslov)} — ŠTOK I KRILO</title>
<style>
  body{margin:0;background:#f5f6f7;font:16px/1.6 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;}
  .hdr{background:#1a3a5c;color:#fff;padding:20px 24px;}
  .hdr b{font:700 19px/1 Georgia,serif;letter-spacing:.02em;}
  .hdr div{font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#9fc0e0;margin-top:7px;}
  .box{max-width:620px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;padding:28px;}
  h1{font:700 24px/1.3 Georgia,serif;margin:0 0 14px;}
  p{margin:0 0 14px;color:#374151;}
  .t{font:700 18px/1.4 Georgia,serif;color:#0b0f14;background:#f9fafb;border-left:3px solid #1a3a5c;padding:14px 16px;margin:0 0 20px;}
  button{border:0;padding:13px 26px;font:600 15px inherit;cursor:pointer;}
  .go{background:#1a3a5c;color:#fff;} .no{background:#dc2626;color:#fff;}
  a{color:#1a3a5c;} .m{font-size:14px;color:#6b7280;}
</style></head><body>
<div class="hdr"><b>ŠTOK &amp; KRILO</b><div>Uredništvo</div></div>
<div class="box">${telo}</div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

const PORUKE = {
  'istekao': 'Link je istekao. Linkovi iz digesta važe 48 sati — nacrt i dalje čeka u <a href="/admin.html">admin panelu</a>.',
  'potpis': 'Potpis linka nije ispravan. Otvori nacrt u <a href="/admin.html">admin panelu</a>.',
  'nepotpun-link': 'Link je nepotpun — verovatno je prelomljen u mejlu. Otvori <a href="/admin.html">admin panel</a>.',
  'nepoznata-akcija': 'Nepoznata akcija.',
  'neispravan-rok': 'Link je oštećen.',
};

export default async (req) => {
  const url = new URL(req.url);
  const q = req.method === 'POST'
    ? new URLSearchParams(await req.text())
    : url.searchParams;

  const id = q.get('id'), a = q.get('a'), e = q.get('e'), s = q.get('s');

  let v;
  try { v = proveriPotpis(id, a, e, s); }
  catch (err) { return strana('Greška', '<h1>Server nije podešen</h1><p>' + esc(err.message) + '</p>', 500); }
  if (!v.ok) return strana('Link ne važi', '<h1>Link ne važi</h1><p>' + (PORUKE[v.razlog] || 'Neispravan link.') + '</p>', 400);

  let drafts = await readJSON(KEY_DRAFTS, []);
  const i = drafts.findIndex(d => d.id === id);

  // ── Korak 1: potvrda ────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    if (i < 0) return strana('Nema nacrta', '<h1>Nacrt više ne postoji</h1><p class="m">Verovatno je već obrađen. Pogledaj <a href="/admin.html">admin panel</a>.</p>', 404);
    const d = drafts[i];
    const objavi = a === 'approve';
    return strana(objavi ? 'Potvrdi objavljivanje' : 'Potvrdi odbacivanje', `
      <h1>${objavi ? 'Objaviti ovu vest?' : 'Odbaciti ovaj nacrt?'}</h1>
      <div class="t">${esc(d.title)}</div>
      <p class="m">${esc(d.catLabel || '')} · ${esc(d.source || '')}${d.provera ? ' · ocena ' + esc(String(d.provera.ocena)) + '/100' : ''}</p>
      <p>${objavi ? 'Vest odmah ide na portal.' : 'Nacrt se briše iz reda i neće se ponovo povlačiti.'}</p>
      <form method="POST" action="/odobri">
        <input type="hidden" name="id" value="${esc(id)}">
        <input type="hidden" name="a" value="${esc(a)}">
        <input type="hidden" name="e" value="${esc(e)}">
        <input type="hidden" name="s" value="${esc(s)}">
        <button class="${objavi ? 'go' : 'no'}" type="submit">${objavi ? 'Da, objavi' : 'Da, odbaci'}</button>
      </form>
      <p class="m" style="margin-top:18px;">Ako si otvorio greškom, samo zatvori stranicu — ništa se nije promenilo.</p>`);
  }

  // ── Korak 2: izvršenje ──────────────────────────────────────────────────
  if (i < 0) return strana('Nema nacrta', '<h1>Nacrt više ne postoji</h1><p class="m">Verovatno je već obrađen sa drugog uređaja.</p>', 404);

  if (a === 'approve') {
    let approved = await readJSON(KEY_APPROVED, []);
    const d = { ...drafts[i], status: 'objavljeno', approvedAt: new Date().toISOString() };
    drafts.splice(i, 1);
    approved = [d, ...approved].slice(0, 200);
    await writeJSON(KEY_DRAFTS, drafts);
    await writeJSON(KEY_APPROVED, approved);
    return strana('Objavljeno', `<h1>Objavljeno</h1><div class="t">${esc(d.title)}</div>
      <p>Vest je na portalu. Ako se predomisliš, u <a href="/admin.html">admin panelu</a> stoji dugme <b>Skini sa sajta</b>.</p>`);
  }

  const naslov = drafts[i].title;
  drafts.splice(i, 1);
  await writeJSON(KEY_DRAFTS, drafts);
  return strana('Odbačeno', `<h1>Odbačeno</h1><div class="t">${esc(naslov)}</div>
    <p>Nacrt je uklonjen iz reda.</p>`);
};
