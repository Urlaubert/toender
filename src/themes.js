// Theme definitions. Each theme defines Freesound queries + tags + license default.
// Stufe 2a: hardcoded; Stufe 2b zieht das in IndexedDB/JSON-Config um.

export const THEMES = {
  kiesel: {
    label: 'Kiesel',
    queries: ['pebble impact', 'stone hit', 'rock click', 'gravel'],
    tags: ['foley', 'percussion'],
    durationMax: 4,
  },
  wind: {
    label: 'Wind',
    queries: ['wind howl', 'wind gust', 'breeze ambience'],
    tags: ['ambience', 'field-recording'],
    durationMax: 15,
  },
  wasser: {
    label: 'Wasser',
    queries: ['water drop', 'stream creek', 'wave splash', 'rain on surface'],
    tags: ['water', 'field-recording'],
    durationMax: 8,
  },
};

export function getTheme(key) {
  return THEMES[key] ?? THEMES.kiesel;
}
