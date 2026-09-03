// ==========================================================================
// ŠTOK I KRILO — jutarnji digest nacrta na mejl, sa linkovima za odobravanje
//
// Zašto potpisani linkovi: urednik ne unosi lozinku iz mejla. Svaki link nosi
// HMAC potpis koji važi za TAČNO JEDAN nacrt i TAČNO JEDNU akciju, i ističe.
// Klik na link otvara stranicu sa potvrdom - ne izvršava akciju odmah - da
// automatski skeneri linkova u mejlu ne bi objavili vest umesto urednika.
// ==========================================================================
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SAT = 3600 * 1000;
export const VAZI_SATI = 48;

function tajna() {
  const s = (process.env.LINK_SECRET || process.env.ADMIN_TOKEN || '').trim();
  if (!s) throw new Error('Ni LINK_SECRET ni ADMIN_TOKEN nisu podešeni');
  return s;
}

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function potpis(id, akcija, istice) {
  return b64url(createHmac('sha256', tajna()).update(`${id}|${akcija}|${istice}`).digest());
}

export function proveriPotpis(id, akcija, istice, dati) {
  if (!id || !akcija || !istice || !dati) return { ok: false, razlog: 'nepotpun-link' };
  if (!['approve', 'reject'].includes(akcija)) return { ok: false, razlog: 'nepoznata-akcija' };
  const rok = Number(istice);
  if (!Number.isFinite(rok)) return { ok: false, razlog: 'neispravan-rok' };
  if (Date.now() > rok) return { ok: false, razlog: 'istekao' };

  const ocekivan = Buffer.from(potpis(id, akcija, istice));
  const primljen = Buffer.from(String(dati));
  if (ocekivan.length !== primljen.length) return { ok: false, razlog: 'potpis' };
  if (!timingSafeEqual(ocekivan, primljen)) return { ok: false, razlog: 'potpis' };
  return { ok: true };
}

export function bazniURL() {
  return (process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://stok-i-krilo.netlify.app')
    .replace(/\/+$/, '');
}

export function link(id, akcija, istice) {
  const q = new URLSearchParams({ id, a: akcija, e: String(istice), s: potpis(id, akcija, istice) });
  return `${bazniURL()}/odobri?${q}`;
}

// ── HTML digesta ──────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BOJA = { zeleno: '#16a34a', zuto: '#d97706', crveno: '#dc2626' };
const RECI = {
  zeleno: 'Provera čista',
  zuto: 'Pregledati pre odobravanja',
  crveno: 'Obavezno pročitaj ceo tekst',
};

function karticaHTML(d, istice) {
  const st = (d.provera && d.provera.status) || 'zuto';
  const boja = BOJA[st] || BOJA.zuto;
  const ocena = d.provera ? d.provera.ocena : '–';
  const upoz = (d.provera && d.provera.upozorenja) || [];

  const zamerke = upoz.length
    ? '<div style="margin:12px 0 0;font:13px/1.5 Helvetica,Arial,sans-serif;color:#b45309;">' +
        upoz.map(u => '<div style="margin-bottom:4px;">• <b>' + esc(String(u.tip).replace(/-/g, ' ')) + '</b> — ' + esc(u.tekst) + '</div>').join('') +
      '</div>'
    : '<div style="margin:12px 0 0;font:13px/1.5 Helvetica,Arial,sans-serif;color:#15803d;">Automatska provera nije našla zamerke.</div>';

  return `
  <tr><td style="padding:0 0 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-left:4px solid ${boja};background:#ffffff;">
      <tr><td style="padding:20px 22px;">
        <div style="font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">
          ${esc(d.catLabel || 'VEST')} &nbsp;·&nbsp; ${esc(d.source || '')} &nbsp;·&nbsp;
          <span style="color:${boja};">${esc(String(ocena))}/100 — ${RECI[st] || ''}</span>
        </div>
        <div style="font:700 19px/1.35 Georgia,'Times New Roman',serif;color:#0b0f14;margin-bottom:10px;">${esc(d.title)}</div>
        <div style="font:15px/1.6 Helvetica,Arial,sans-serif;color:#374151;">${esc(d.desc || '')}</div>
        <div style="font:14px/1.65 Helvetica,Arial,sans-serif;color:#4b5563;margin-top:12px;white-space:pre-wrap;">${esc(d.body || '')}</div>
        ${zamerke}
        <div style="margin-top:14px;font:12px/1.5 Helvetica,Arial,sans-serif;">
          <a href="${esc(d.url || '#')}" style="color:#1a3a5c;">Original: ${esc(d.source || d.url || '')}</a>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;">
          <tr>
            <td style="background:#1a3a5c;">
              <a href="${esc(link(d.id, 'approve', istice))}" style="display:inline-block;padding:11px 22px;font:600 14px Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;">Odobri i objavi</a>
            </td>
            <td style="width:10px;"></td>
            <td style="border:1px solid #dc2626;">
              <a href="${esc(link(d.id, 'reject', istice))}" style="display:inline-block;padding:10px 20px;font:600 14px Helvetica,Arial,sans-serif;color:#dc2626;text-decoration:none;">Odbaci</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>`;
}

export function digestHTML(nacrti, istice) {
  const dat = new Date().toLocaleDateString('sr-RS', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html><html lang="sr"><body style="margin:0;background:#f5f6f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f7;padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">
    <tr><td style="background:#1a3a5c;padding:22px 24px;">
      <div style="font:700 20px/1 Georgia,serif;color:#ffffff;letter-spacing:.02em;">ŠTOK &amp; KRILO</div>
      <div style="font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#9fc0e0;margin-top:7px;">Uredništvo — nacrti za ${esc(dat)}</div>
    </td></tr>
    <tr><td style="padding:22px 0 6px;font:15px/1.6 Helvetica,Arial,sans-serif;color:#374151;">
      ${nacrti.length} ${nacrti.length === 1 ? 'nacrt čeka' : 'nacrta čeka'} odluku. Linkovi važe ${VAZI_SATI} sata i traže potvrdu na sledećoj strani — ništa se ne objavljuje samim klikom.
    </td></tr>
    ${nacrti.map(d => karticaHTML(d, istice)).join('')}
    <tr><td style="padding:6px 0 0;font:12px/1.6 Helvetica,Arial,sans-serif;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">
      Ceo uređivački pregled: <a href="${bazniURL()}/admin.html" style="color:#1a3a5c;">admin.html</a>.
      Nacrti koje ne dodirneš ostaju u redu i čekaju.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

// ── Slanje preko Resend-a ─────────────────────────────────────────────────
export async function posaljiDigest(nacrti) {
  if (!nacrti || !nacrti.length) return { poslato: false, razlog: 'nema-nacrta' };

  const kljuc = (process.env.RESEND_API_KEY || '').trim();
  const prima = (process.env.DIGEST_TO || '').trim();
  const salje = (process.env.DIGEST_FROM || 'ŠTOK I KRILO <onboarding@resend.dev>').trim();
  if (!kljuc) return { poslato: false, razlog: 'nema-RESEND_API_KEY' };
  if (!prima) return { poslato: false, razlog: 'nema-DIGEST_TO' };

  const istice = Date.now() + VAZI_SATI * SAT;
  const naslov = `Nacrti za odobravanje — ${nacrti.length} ${nacrti.length === 1 ? 'vest' : 'vesti'}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + kljuc, 'content-type': 'application/json' },
    body: JSON.stringify({ from: salje, to: [prima], subject: naslov, html: digestHTML(nacrti, istice) }),
    signal: AbortSignal.timeout(20000),
  });
  const telo = await res.json().catch(() => ({}));
  if (!res.ok) return { poslato: false, razlog: telo.message || ('HTTP ' + res.status) };
  return { poslato: true, id: telo.id, primalac: prima, nacrta: nacrti.length };
}
