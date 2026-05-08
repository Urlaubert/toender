// Theme definitions. Each theme defines Freesound queries + tags + license default.
// Keep generic — adding a theme = adding a key here.

export const THEMES = {
  kiesel: {
    label: 'Kiesel',
    queries: ['pebble impact', 'stone hit', 'rock click', 'gravel'],
    tags: ['foley', 'percussion'],
    durationMax: 4,        // seconds; cards we want short by default
  },
};

export function getTheme(key) {
  return THEMES[key] ?? THEMES.kiesel;
}
