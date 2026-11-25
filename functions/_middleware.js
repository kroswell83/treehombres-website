// Cloudflare Pages middleware: puts the visitor's city in the H1 on the
// landing pages, server-side (no flicker).
//
// Pages mark their H1 like:  <h1 data-svc="Tree Removal">Tree Removal in Williamson &amp; Travis County</h1>
// We swap the text to "Tree Removal in Round Rock, TX" only when the city is on the allowlist.
//
// Order:
//   1. ?loc=<Google Ads location ID>  (Ads final URL suffix: loc={loc_physical_ms})
//   2. Cloudflare's request.cf.city   (only if the visitor is in Texas, US)
//   3. Otherwise the default H1 stays.
//
// Keyword echo (Nov 24): ?kw=<Google Ads keyword> -> "<Keyword> in <City>, TX" (see parseKeyword).
// A town inside the keyword wins over loc. No valid kw = the city behavior above, unchanged.
//
// _routes.json limits this to the landing pages and /api/*, so CSS, images, etc. never run it.

const PAGES = new Set(['/', '/tree-service', '/tree-removal', '/emergency-tree-removal', '/tree-trimming']);

const CITIES = ['Georgetown', 'Round Rock', 'Cedar Park', 'Leander', 'Hutto',
  'Liberty Hill', 'Jarrell', 'Florence', 'Pflugerville', 'Austin'];

// Google Ads geo target IDs (geotargets-2026-10-06.csv): the 10 cities, plus the
// ZIP codes inside them (Google often reports a ZIP instead of a city).
const LOC_IDS = {
  // cities
  '1026424': 'Georgetown', '1026748': 'Round Rock', '1026276': 'Cedar Park',
  '1026553': 'Leander', '1026492': 'Hutto', '9052318': 'Liberty Hill',
  '9189231': 'Jarrell', '1026396': 'Florence', '1026687': 'Pflugerville',
  '1026201': 'Austin',
  // ZIP codes
  '9028237': 'Georgetown', '9028239': 'Georgetown', '9028243': 'Georgetown', // 78626 78628 78633
  '9028267': 'Round Rock', '9028268': 'Round Rock', '9028275': 'Round Rock', // 78664 78665 78681
  '9028226': 'Cedar Park', // 78613
  '9028249': 'Leander', '9028253': 'Leander', // 78641 78645
  '9028244': 'Hutto', // 78634
  '9028250': 'Liberty Hill', // 78642
  '9027416': 'Jarrell', // 76537
  '9027411': 'Florence', // 76527
  '9028263': 'Pflugerville', // 78660
  // Austin 787xx
  '9028276': 'Austin', '9028277': 'Austin', '9028278': 'Austin', '9028279': 'Austin',
  '9028280': 'Austin', '9028281': 'Austin', '9028283': 'Austin', '9028284': 'Austin',
  '9028285': 'Austin', '9028287': 'Austin', '9028288': 'Austin', '9028289': 'Austin',
  '9028290': 'Austin', '9028291': 'Austin', '9028292': 'Austin', '9028293': 'Austin',
  '9028294': 'Austin', '9028295': 'Austin', '9028296': 'Austin', '9028297': 'Austin',
  '9028298': 'Austin', '9028299': 'Austin', '9028300': 'Austin', '9028301': 'Austin',
  '9028302': 'Austin', '9028303': 'Austin', '9028304': 'Austin', '9028305': 'Austin',
  '9028306': 'Austin', '9028307': 'Austin', '9028308': 'Austin', '9028309': 'Austin',
  '9028310': 'Austin', '9028311': 'Austin', '9028312': 'Austin', '9028313': 'Austin',
  '9028314': 'Austin', '9028315': 'Austin', '9028316': 'Austin', '9028317': 'Austin',
  '9028318': 'Austin', '9028319': 'Austin', '9028320': 'Austin', '9028321': 'Austin',
  '9028322': 'Austin', '9053746': 'Austin',
};

export function pickCity(url, cf) {
  // 1. Google Ads location ID
  const loc = (url.searchParams.get('loc') || '').replace(/\D/g, '');
  if (loc && LOC_IDS[loc]) return LOC_IDS[loc];
  // 2. Cloudflare geolocation, Texas only (there's a Georgetown, Florence and Austin in other states)
  if (cf && cf.country === 'US' && cf.regionCode === 'TX' && cf.city) {
    const c = String(cf.city).trim().toLowerCase();
    const hit = CITIES.find(x => x.toLowerCase() === c);
    if (hit) return hit;
  }
  // 3. keep the default H1
  return null;
}

// ---------- Keyword echo: ?kw=<Google Ads keyword> ----------
// Ads final URL suffix adds kw={keyword}. Returns null (= ignore kw) if any check fails.
const KW_NEED = ['tree', 'trimming', 'trimmer', 'trimmers', 'pruning', 'removal', 'cutting'];
const KW_BLOCK = ['cheap', 'free', 'price', 'prices', 'cost', 'costs', 'arborist', 'arborists'];

export function parseKeyword(url) {
  // URLSearchParams already turns both %20 and + into spaces.
  const raw = url.searchParams.get('kw');
  if (raw == null) return null;
  const s = raw.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!s || s.length > 40 || !/^[a-z ]+$/.test(s)) return null; // letters and spaces only, 40 max

  const words = s.split(' ');
  // "tree" also counts inside "trees" / "treeservice"
  const hasNeed = words.some(w => KW_NEED.includes(w) || w.startsWith('tree'));
  if (!hasNeed || words.some(w => KW_BLOCK.includes(w))) return null;

  let k = ' ' + s + ' ';
  k = k.replace(/ treeservices? /g, m => m.includes('services') ? ' tree services ' : ' tree service ');
  k = k.replace(/ tx $/, ' ');                       // drop a trailing "tx"

  // A town in the keyword wins over loc / Cloudflare. Take the first one that appears.
  let town = null, at = Infinity;
  for (const c of CITIES) {
    const i = k.indexOf(' ' + c.toLowerCase() + ' ');
    if (i !== -1 && i < at) { town = c; at = i; }
  }
  if (town) k = k.replace(' ' + town.toLowerCase() + ' ', ' ');
  k = k.replace(/ tx $/, ' ');                       // "georgetown tx" -> drop the tx left behind

  k = k.replace(/ near me /g, ' near you ');
  k = k.replace(/\s+/g, ' ').trim();
  k = k.replace(/^(in )+/, '').replace(/( in)+$/, '').trim(); // "tree service in <town>" leaves a dangling "in"
  if (!k) return null;

  const title = k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { text: title, town };
}

// The H1 text for this request, or null to leave the page's default H1 alone.
export function buildH1(svc, url, cf) {
  const kw = parseKeyword(url);
  if (kw) {
    const city = kw.town || pickCity(url, cf);
    return kw.text + (city ? ' in ' + city + ', TX' : ' in Williamson & Travis County');
  }
  const city = pickCity(url, cf); // no usable kw: today's behavior
  return city ? svc + ' in ' + city + ', TX' : null;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !PAGES.has(url.pathname)) return next();

  // Ask for a full page (no 304), since the H1 can differ per visitor.
  let res;
  try {
    const headers = new Headers(request.headers);
    headers.delete('If-None-Match');
    headers.delete('If-Modified-Since');
    res = await next(new Request(request, { headers }));
  } catch (e) {
    console.error('city-h1: could not fetch page, serving it untouched', e && e.message);
    return next();
  }

  // Anything unexpected below: serve the page with its default H1.
  try {
    const type = res.headers.get('Content-Type') || '';
    if (res.status !== 200 || !type.includes('text/html')) return res;

    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'private, no-cache');
    out.headers.delete('ETag');
    // Quick check: nothing to change when there's no usable kw and no city.
    if (!parseKeyword(url) && !pickCity(url, request.cf)) return out;

    return new HTMLRewriter()
      .on('h1[data-svc]', {
        element(el) {
          const svc = el.getAttribute('data-svc');
          if (!svc) return;
          const text = buildH1(svc, url, request.cf);
          if (text) el.setInnerContent(text); // plain text, escaped
        },
      })
      .transform(out);
  } catch (e) {
    console.error('city-h1: rewrite failed, serving default H1', e && e.message);
    return res;
  }
}
