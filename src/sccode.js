// sccode.org API client — minimaler funktionierender Pfad.
//
// Realitaet (S-088 Pruefung):
// - /api/code listet die letzten N Codes mit {id, name, owner} — funktioniert, JSON.
// - /api/code/{id}/json returnt HTML (Server-Bug oder API-Doku stimmt nicht).
// - /api/tag returnt HTML.
// - sccode.org sendet KEINE CORS-Header → fetch im Browser failt direkt.
//
// Pragmatischer Ansatz fuer Toender:
// 1. /api/code via Proxy-Kaskade holen — Listen-Endpoint klappt.
// 2. Client-seitig nach Stichworten in Code-Namen filtern.
// 3. Code-Body NICHT laden (geht nicht ueber API). Detail-Sheet zeigt nur
//    Titel + Autor + Link "Auf sccode.org oeffnen" — User klickt rueber.
// 4. Sample-DNA-Marker informiert "Code-Snippet, lokal lesen+kopieren".
//
// Volle Code-Bibliothek waere via Server-Side-Scrape mit eigenem Tool
// (Musik/tools/sccode_corpus/) als nightly/manueller Job — siehe IDEEN.md.

import { proxiedFetch } from './cors.js';

const API_LIST = 'https://sccode.org/api/code';
const VIEW_URL = 'https://sccode.org/';

function normalize(raw, theme) {
  const author = raw.owner?.name ?? raw.owner?.id ?? 'unknown';
  return {
    id: `sccode:${raw.id}`,
    source: 'sccode',
    sourceId: String(raw.id),
    theme,
    status: 'neu',
    name: raw.name ?? `SC-${raw.id}`,
    author,
    license: 'unknown',          // sccode-Listing hat keine Lizenz-Info, nur Detail-Page
    licenseUrl: '',
    publishable: false,
    attribution: `${raw.name ?? 'SC-' + raw.id} by ${author} (sccode.org)`,
    duration: 0,
    tags: [],                    // Listen-Endpoint liefert keine Tags
    url: VIEW_URL + raw.id,
    audioUrl: null,
    patternCode: null,           // Code-Body kommt nicht ueber API
    codeLanguage: 'supercollider',
    description: 'Code auf sccode.org ansehen — Link im Detail-Sheet.',
  };
}

// Holt N Pages der /api/code-Liste, filtert nach Stichwort im Namen.
async function searchByName({ queries, target = 20, maxPages = 5 }) {
  const out = [];
  const seen = new Set();
  // Stichworte lowercase als Match-Filter
  const needles = queries.map((q) => String(q).toLowerCase());

  for (let page = 1; page <= maxPages && out.length < target; page++) {
    const url = `${API_LIST}?page=${page}`;
    let data;
    try {
      const res = await proxiedFetch(url);
      if (!res.ok) continue;
      data = await res.json();
    } catch (err) {
      console.warn(`sccode page ${page} failed:`, err.message);
      continue;
    }
    if (!Array.isArray(data) || data.length === 0) break;
    for (const item of data) {
      if (out.length >= target) break;
      if (seen.has(item.id)) continue;
      const nameLower = (item.name ?? '').toLowerCase();
      if (needles.length === 0 || needles.some((n) => nameLower.includes(n))) {
        seen.add(item.id);
        out.push(item);
      }
    }
  }
  return out;
}

export async function searchTheme({
  theme, queries, target = 20, pages = null,
}) {
  // pages-Map wird ignoriert — wir paginieren intern bis maxPages erreicht.
  try {
    const items = await searchByName({ queries, target });
    return items.map((i) => normalize(i, theme));
  } catch (err) {
    console.warn('sccode searchTheme failed:', err.message);
    return [];
  }
}
