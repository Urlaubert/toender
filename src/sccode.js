// sccode.org SuperCollider-Snippet-Source.
//
// Stand S-089 (2026-05-11): Statt Live-API (CORS-Proxy-unzuverlaessig)
// liefert dieser Modul jetzt eine statische Korpus-JSON aus
// public/sccode_corpus.json (gebaut via scripts/build_sccode_corpus.mjs
// aus Musik/wissen/sc/gold/-Cluster). 37 kuratierte Snippets in 7 Clustern.
//
// Vorher (S-088): Live-API mit Proxy-Kaskade. Problem: sccode.org sendet
// keine CORS-Header → fetch im Browser failt direkt, beide CORS-Proxies
// (allorigins, corsproxy.io) unzuverlaessig. Plus: API liefert nur
// Listing-Endpoint, kein Code-Body.
//
// Jetzt: 100% statisch, ueber GitHub-Pages-Cache verfuegbar, Code-Body
// drin, sccode.org-Attribution erhalten, Author + Cluster + Beschreibung
// im Sample, Detail-Sheet zeigt vollen Code.

let cachedCorpus = null;
let corpusPromise = null;

async function loadCorpus() {
  if (cachedCorpus) return cachedCorpus;
  if (corpusPromise) return corpusPromise;
  corpusPromise = (async () => {
    try {
      const baseUrl = import.meta.env?.BASE_URL ?? '/';
      const url = `${baseUrl}sccode_corpus.json`.replace(/\/\//g, '/');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Korpus leer oder kein Array');
      }
      cachedCorpus = data;
      console.info(`sccode-corpus: ${data.length} Snippets geladen`);
      return data;
    } catch (err) {
      console.warn('sccode-corpus konnte nicht geladen werden:', err.message);
      cachedCorpus = [];
      return cachedCorpus;
    }
  })();
  return corpusPromise;
}

function normalize(item, theme, queries) {
  const isOwn = item.author?.startsWith('Johannes');
  return {
    id: `sccode:${item.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    source: 'sccode',
    sourceId: item.slug,
    theme,
    status: 'neu',
    name: item.title,
    author: item.author,
    license: isOwn ? 'CC0' : 'sccode.org community (Lizenz pro Snippet pruefen)',
    licenseUrl: '',
    publishable: isOwn,
    attribution: isOwn ? null : `${item.title} by ${item.author} (sccode.org)`,
    duration: 0,
    tags: item.tags ?? [],
    url: isOwn ? null : `https://sccode.org/`,
    audioUrl: null,
    patternCode: item.code,
    codeLanguage: 'supercollider',
    embedUrl: null,
    description: item.description || `SuperCollider snippet from sccode.org, cluster: ${item.cluster}`,
    cluster: item.cluster,
  };
}

// Stichwort-Filter wie in den anderen Quellen: queries gegen
// title/author/cluster/description matchen.
function matchesQueries(item, queries) {
  if (!queries || queries.length === 0) return true;
  const haystack = [
    item.title, item.author, item.cluster, item.description,
    ...(item.tags ?? []),
    item.code?.slice(0, 200),  // erste 200 Code-Zeichen mit
  ].join(' ').toLowerCase();
  return queries.some((q) => haystack.includes(String(q).toLowerCase()));
}

export async function searchTheme({
  theme, queries, target = 20, pages = null,
}) {
  // pages-Map wird ignoriert — wir haben statische Liste, keine Pagination noetig.
  try {
    const corpus = await loadCorpus();
    const matched = corpus.filter((item) => matchesQueries(item, queries));
    // Wenn keine Treffer und keine Stichworte: liefer alles. Sonst:
    // wenn Stichworte da sind aber 0 Treffer, liefer alles (besser als leer).
    const items = (matched.length === 0 && corpus.length > 0)
      ? corpus.slice(0, target)
      : matched.slice(0, target);
    return items.map((i) => normalize(i, theme, queries));
  } catch (err) {
    console.warn('sccode searchTheme failed:', err.message);
    return [];
  }
}

// Kick off background-Load.
loadCorpus();
