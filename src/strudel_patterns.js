// Strudel-Pattern-Loader. Minimaler Demo-Fallback (5 Snippets) — Hauptquelle
// fuer Code-Snippets ist sccode.org (siehe sccode.js) bzw. ein spaeteres
// Strudel-Examples-Scrape. Diese 5 sind nur damit das Theme nicht leer ist.
//
// Lizenz: eigene Patterns hier CC0. strudel.cc-Beispiele waeren CC-BY-NC-SA.

const STRUDEL_BASE = 'https://strudel.cc';

function encodePattern(code) {
  return btoa(unescape(encodeURIComponent(code)));
}

function patternToEmbedUrl(code) {
  return `${STRUDEL_BASE}/?code=${encodePattern(code)}`;
}

// 5 Demo-Patterns als Fallback wenn niemand die sccode-Quelle einsetzt.
const PATTERNS = [
  { name: 'Tresillo Demo', tags: ['beat', 'demo'], code: `s("bd(3,8)").gain(0.9)` },
  { name: 'Whale-Pad Demo', tags: ['drone', 'demo'], code: `note("c3 eb3 g3").s("sine").slow(8).vib(0.3).room(0.9).gain(0.4)` },
  { name: 'Acid-Bass Demo', tags: ['bass', 'demo'], code: `note("c2 c2 eb2 c2 g2 c2 bb1 c2").s("sawtooth").lpf(sine.range(200,1500).slow(4)).lpq(15)` },
  { name: 'Wind-Whistle Demo', tags: ['atmo', 'demo'], code: `s("white").lpf(sine.range(300,1500).slow(6)).lpq(8).gain(0.3)` },
  { name: 'Noise-Riser Demo', tags: ['fx', 'demo'], code: `s("white").lpf(range(200,8000).fast(0.25)).gain(line(0,0.7).slow(8))` },
];

export const STRUDEL_THEME_KEY = 'strudel-demo';
export const STRUDEL_THEME = {
  key: STRUDEL_THEME_KEY,
  label: 'Strudel-Demo (5)',
  queries: ['strudel'],
  durationMax: 0,
  builtin: false,
  source: 'strudel',
  sources: ['strudel'],
};

export const SCCODE_THEME_KEY = 'sccode-snippets';
export const SCCODE_THEME = {
  key: SCCODE_THEME_KEY,
  label: 'SuperCollider-Snippets',
  queries: ['ambient', 'drone', 'synth', 'rhythm'],
  durationMax: 0,
  builtin: false,
  sources: ['sccode'],
};

// Liefert die Pattern-Liste als Sample-Shape mit patternCode statt audioUrl.
export function getStrudelSamples(theme = STRUDEL_THEME_KEY) {
  return PATTERNS.map((p, i) => {
    const id = `strudel:${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return {
      id,
      source: 'strudel',
      sourceId: String(i),
      theme,
      status: 'neu',
      name: p.name,
      author: 'toender demo',
      license: 'CC0',
      publishable: true,
      attribution: null,
      duration: 4,
      tags: p.tags ?? [],
      url: patternToEmbedUrl(p.code),
      audioUrl: null,
      patternCode: p.code,
      codeLanguage: 'strudel',
      embedUrl: patternToEmbedUrl(p.code),
      description: p.code,
    };
  });
}
