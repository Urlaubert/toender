// Xeno-Canto API client. Tier-/Vogelaufnahmen weltweit, vorwiegend CC.
// Docs: https://xeno-canto.org/explore/api
// Kein API-Key noetig, Rate-Limits via 429.
// CORS: xeno-canto.org sendet KEINE Access-Control-Header → wir muessen
// ueber einen Proxy gehen. allorigins.win ist gratis, CC-by-NC-genutzt.

const XENO = 'https://xeno-canto.org/api/2/recordings';
const PROXY = 'https://api.allorigins.win/raw?url=';

function proxied(url) {
  return PROXY + encodeURIComponent(url);
}

function licenseToken(licUrl) {
  if (!licUrl) return 'unknown';
  if (licUrl.includes('publicdomain') || licUrl.includes('zero')) return 'CC0';
  if (licUrl.includes('by-nc-sa')) return 'CC-BY-NC-SA';
  if (licUrl.includes('by-nc-nd')) return 'CC-BY-NC-ND';
  if (licUrl.includes('by-nc')) return 'CC-BY-NC';
  if (licUrl.includes('by-sa')) return 'CC-BY-SA';
  if (licUrl.includes('by-nd')) return 'CC-BY-ND';
  if (licUrl.includes('by/') || licUrl.includes('/by-')) return 'CC-BY';
  return 'unknown';
}

function isPublishable(token) {
  return ['CC0', 'CC-BY'].includes(token);
}

function parseLength(str) {
  // "0:23" → 23, "1:05" → 65
  if (!str) return 0;
  const parts = String(str).split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number(str) || 0;
}

function normalize(raw, theme) {
  const licUrl = raw.lic ? (raw.lic.startsWith('//') ? 'https:' + raw.lic : raw.lic) : '';
  const license = licenseToken(licUrl);
  const fileUrl = raw.file ? (raw.file.startsWith('//') ? 'https:' + raw.file : raw.file) : null;
  const species = [raw.gen, raw.sp].filter(Boolean).join(' ');
  const name = raw.en ? `${raw.en} (${species})` : species || `XC${raw.id}`;
  return {
    id: `xenocanto:${raw.id}`,
    source: 'xenocanto',
    sourceId: String(raw.id),
    theme,
    status: 'neu',
    name,
    author: raw.rec ?? 'unknown',
    license,
    licenseUrl: licUrl,
    publishable: isPublishable(license),
    attribution: license === 'CC0'
      ? null
      : `${name} by ${raw.rec ?? 'unknown'} (Xeno-Canto XC${raw.id}, ${license})`,
    duration: parseLength(raw.length),
    tags: [raw.type ?? '', raw.cnt ?? '', raw.q ?? ''].filter(Boolean),
    url: `https://xeno-canto.org/${raw.id}`,
    audioUrl: fileUrl,
    description: `${raw.type ?? ''} · ${raw.cnt ?? ''} · ${raw.loc ?? ''} · quality ${raw.q ?? '?'}`,
  };
}

export async function search({ query, durationMax, publishable, page = 1, sort = 'quality' }) {
  // Xeno-Canto: query nimmt Stichworte fuer Vogel-Name oder Gattung, plus
  // optional `q:A` (quality), `len:<5` (Dauer), `area:europe` etc.
  const parts = [query];
  if (durationMax) parts.push(`len:<${durationMax}`);
  if (publishable) parts.push('lic:cc-by'); // CC0 separat schwer filterbar, wir filtern client-seitig nach
  const finalQuery = parts.join(' ');

  const url = `${XENO}?query=${encodeURIComponent(finalQuery)}&page=${page}`;
  const res = await fetch(proxied(url));
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Xeno-Canto ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  let recs = (data.recordings ?? []).map((r) => normalize(r, undefined));
  if (publishable) {
    recs = recs.filter((r) => r.publishable);
  }
  // Quality-Sort: 'quality' (A,B,C...) wenn moeglich
  if (sort === 'quality') {
    recs.sort((a, b) => {
      const tagQ = (r) => (r.tags.find((t) => /^[A-E]$/.test(t)) ?? 'C');
      return tagQ(a).localeCompare(tagQ(b));
    });
  }
  return recs;
}

export async function searchTheme({
  theme, queries, durationMax, publishable,
  target = 20, pages = null,
}) {
  const seen = new Set();
  const out = [];
  const pagesMap = pages ?? new Map();
  for (const q of queries) {
    if (out.length >= target) break;
    const page = (pagesMap.get(q) ?? 0) + 1;
    pagesMap.set(q, page);
    try {
      const batch = await search({ query: q, durationMax, publishable, page });
      for (const s of batch) {
        if (!s.audioUrl) continue;
        if (seen.has(s.sourceId)) continue;
        seen.add(s.sourceId);
        out.push({ ...s, theme });
        if (out.length >= target) break;
      }
    } catch (err) {
      if (err.status === 429) throw err;
      console.warn(`Xeno-Canto-Suche fehlgeschlagen "${q}" (page ${page}):`, err.message);
    }
  }
  return out;
}
