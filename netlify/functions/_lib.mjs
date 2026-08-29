// ==========================================================================
// ŠTOK I KRILO — zajedničke funkcije za povlačenje i obradu vesti
// ==========================================================================
import { getStore } from '@netlify/blobs';

export const STORE = 'stok-vesti';
export const KEY_DRAFTS = 'drafts.json';
export const KEY_APPROVED = 'approved.json';
export const KEY_SEEN = 'seen-urls.json';

export function store() { return getStore(STORE); }

export async function readJSON(key, fallback) {
  try { const v = await store().get(key, { type: 'json' }); return v ?? fallback; }
  catch { return fallback; }
}
export async function writeJSON(key, value) { await store().setJSON(key, value); }

// ── IZVORI ────────────────────────────────────────────────────────────────
export const SOURCES = [
  { id: 'dgb', name: 'Double Glazing Blogger', lang: 'en', region: 'UK', tier: 1,
    rss: 'https://www.doubleglazingblogger.com/feed/' },
  { id: 'glaswelt', name: 'GLASWELT', lang: 'de', region: 'Nemacka', tier: 1,
    html: 'https://www.glaswelt.de/',
    linkPattern: /href="(\/(?:glas|fenster|fassade|fensterbau)\/[a-z0-9-]{20,})"/gi,
    base: 'https://www.glaswelt.de' },
  { id: 'oknonet', name: 'OknoNet', lang: 'pl', region: 'Poljska', tier: 1,
    html: 'https://oknonet.pl/',
    linkPattern: /href="(https:\/\/oknonet\.pl\/[a-z0-9-]{25,}\/)"/gi },
  { id: 'windowdoor', name: 'Window + Door', lang: 'en', region: 'SAD', tier: 1,
    html: 'https://www.windowanddoor.com/news',
    linkPattern: /href="(\/news\/[a-z0-9-]{15,})"/gi,
    base: 'https://www.windowanddoor.com' },
];

const UA = 'Mozilla/5.0 (compatible; StokIKriloBot/1.0; +https://stok-i-krilo.netlify.app)';

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

function parseRSS(xml, src) {
  const out = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const title = strip((it.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    const link  = strip((it.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
    const desc  = strip((it.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1]).slice(0, 900);
    const pub   = strip((it.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]);
    if (title && link) out.push({ source: src.name, sourceId: src.id, lang: src.lang, title, url: link, summary: desc, excerpt: desc, published: pub });
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
      const published =
        strip((page.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i) || [])[1]) ||
        strip((page.match(/(\d{2}\.\d{2}\.\d{4})/) || [])[1]);
      const paras = [...page.matchAll(/<p[^>]*>([\s\S]{60,}?)<\/p>/gi)]
        .map(x => strip(x[1])).filter(t => t.length > 60).slice(0, 6).join('\n\n');
      if (title) out.push({ source: src.name, sourceId: src.id, lang: src.lang, title, url: u, summary, published, excerpt: paras.slice(0, 2500) });
    } catch (e) { console.log('[' + src.id + '] preskoceno ' + u + ': ' + e.message); }
  }
  return out;
}

export async function fetchSource(src, limit = 5) {
  if (src.rss) { const xml = await grab(src.rss); return parseRSS(xml, src).slice(0, limit); }
  const list = await grab(src.html);
  return await parseHTML(list, src, limit);
}

export async function fetchAll(perSource = 4) {
  const all = [], errors = [];
  for (const src of SOURCES) {
    try {
      const items = await fetchSource(src, perSource);
      all.push(...items);
      console.log('[' + src.id + '] povuceno ' + items.length);
    } catch (e) {
      errors.push(src.id + ': ' + e.message);
      console.log('[' + src.id + '] GRESKA: ' + e.message);
    }
  }
  return { all, errors };
}

export const CAT_IMG = {
  trziste:     'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&fit=crop&auto=format&q=75',
  kompanije:   'https://images.unsplash.com/photo-1497366216548-37526070297c?w=900&fit=crop&auto=format&q=75',
  proizvodnja: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=900&fit=crop&auto=format&q=75',
  tehnologija: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=900&fit=crop&auto=format&q=75',
  proizvodi:   'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=900&fit=crop&auto=format&q=75',
  standardi:   'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=900&fit=crop&auto=format&q=75',
  investicije: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=900&fit=crop&auto=format&q=75',
};

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
];

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
