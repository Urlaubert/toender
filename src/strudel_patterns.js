// Strudel-Pattern-Manifest. Kuratierte Snippets aus strudel.cc/examples
// und eigenen Ideen. Liefert Patterns als "Sample"-Objekte mit
// patternCode statt audioUrl — die Audition-Karte erkennt das und
// rendert einen Strudel-iframe im FX-Sheet.
//
// Lizenz: strudel.cc-Beispiele sind CC-BY-NC-SA 4.0 (Felix Roos).
// Eigene Patterns hier: CC0.

const STRUDEL_BASE = 'https://strudel.cc';

function encodePattern(code) {
  return btoa(unescape(encodeURIComponent(code)));
}

function patternToEmbedUrl(code) {
  return `${STRUDEL_BASE}/?code=${encodePattern(code)}`;
}

// Kategorisierung passend zu den Story-Themes.
// Tags helfen spaeter bei der Suche/Filter.
const PATTERNS = [
  // === Beat / Rhythmus ===
  {
    name: 'Tresillo 3-of-8',
    tags: ['beat', 'percussion', 'euclid'],
    code: `s("bd(3,8)").gain(0.9)`,
  },
  {
    name: 'Cinquillo 5-of-8 + Hihat',
    tags: ['beat', 'percussion', 'euclid'],
    code: `stack(
  s("bd(5,8)"),
  s("hh*16").gain(0.3)
)`,
  },
  {
    name: 'Afro-Cuban Polyrhythm',
    tags: ['beat', 'percussion', 'polyrhythm'],
    code: `stack(
  s("bd(3,8)"),
  s("rim(5,8)"),
  s("cb(2,8)")
)`,
  },
  {
    name: 'Bossa Nova 5-of-16',
    tags: ['beat', 'percussion', 'euclid'],
    code: `stack(
  s("bd(5,16)"),
  s("hh*16").gain(0.3)
)`,
  },
  {
    name: 'Bulgarian 7-of-8',
    tags: ['beat', 'percussion', 'odd-meter'],
    code: `s("bd(7,8)").gain(0.9)`,
  },

  // === Drone / Atmo ===
  {
    name: 'Underwater Drone',
    tags: ['drone', 'atmo', 'underwater'],
    code: `note("c2 g1")
  .s("sawtooth")
  .lpf(sine.range(200, 600).slow(8))
  .room(0.8)
  .gain(0.5)`,
  },
  {
    name: 'Whale-like Pad',
    tags: ['drone', 'atmo', 'whale'],
    code: `note("c3 eb3 g3 bb3")
  .s("sine")
  .slow(8)
  .vib(0.3)
  .vibmod(0.5)
  .room(0.9)
  .gain(0.4)`,
  },
  {
    name: 'Wind Whistle',
    tags: ['drone', 'atmo', 'wind'],
    code: `s("white")
  .lpf(sine.range(300, 1500).slow(6))
  .lpq(8)
  .gain(0.3)`,
  },
  {
    name: 'Bell Texture',
    tags: ['atmo', 'tonal'],
    code: `note("c5 e5 g5 b5 d6").s("sine")
  .struct("x(3,8)")
  .room(0.8)
  .delay(0.5)
  .gain(0.3)`,
  },

  // === Bass ===
  {
    name: 'Acid Bass',
    tags: ['bass', 'synth'],
    code: `note("c2 c2 eb2 c2 g2 c2 bb1 c2")
  .s("sawtooth")
  .lpf(sine.range(200, 1500).slow(4))
  .lpq(15)
  .gain(0.7)`,
  },
  {
    name: 'Sub Bass Drone',
    tags: ['bass', 'sub'],
    code: `note("c1").s("sine").gain(0.8)`,
  },

  // === Melodisch ===
  {
    name: 'Minor-Pentatonic Bass',
    tags: ['bass', 'melodic'],
    code: `note("c2 eb2 g2 bb2")
  .euclid(5, 8)
  .s("sawtooth")
  .lpf(500)
  .gain(0.6)`,
  },
  {
    name: 'Arpeggiator',
    tags: ['melodic', 'synth'],
    code: `note("c4 e4 g4 b4 d5 g4 b4 e5")
  .s("triangle")
  .gain(0.5)
  .room(0.4)`,
  },

  // === FX / Riser ===
  {
    name: 'Noise Riser',
    tags: ['fx', 'riser'],
    code: `s("white")
  .lpf(range(200, 8000).fast(0.25))
  .gain(line(0, 0.7).slow(8))`,
  },
  {
    name: 'Reverse Cymbal',
    tags: ['fx', 'cymbal'],
    code: `s("crash").rev().slow(4).room(0.7).gain(0.5)`,
  },
];

export const STRUDEL_THEME_KEY = 'strudel-patterns';
export const STRUDEL_THEME = {
  key: STRUDEL_THEME_KEY,
  label: 'Strudel-Patterns',
  queries: ['strudel'],   // formal — Code-Quelle nutzt das nicht wirklich
  durationMax: 0,
  builtin: false,
  source: 'strudel',
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
      author: 'strudel.cc / toender',
      license: 'CC-BY-NC-SA',
      publishable: false,
      attribution: `Strudel pattern "${p.name}" (CC-BY-NC-SA 4.0)`,
      duration: 4,           // virtuell, fuer DNA-Marker
      tags: p.tags ?? [],
      url: patternToEmbedUrl(p.code),
      audioUrl: null,        // KEIN Audio-Preview — wird im Detail-Sheet via Iframe gerendert
      patternCode: p.code,
      embedUrl: patternToEmbedUrl(p.code),
      description: p.code,
    };
  });
}
