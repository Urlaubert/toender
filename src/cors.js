// CORS-Proxy-Kaskade. Versucht mehrere Proxies in Reihenfolge, merkt sich
// fuer die Session welcher zuletzt funktioniert hat. Wenn alle versagen,
// versucht direkt (manche Quellen senden CORS-Header inzwischen vielleicht).
//
// Hintergrund: api.allorigins.win ist wackelig (CORS-Wand und 408 Timeouts),
// corsproxy.io ist meist schneller aber auch nicht 100%. Wir fragen beide.

const PROXIES = [
  // corsproxy.io: einfache URL, schnell wenn online
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  // allorigins: alternativer Pfad, langsamer aber stabilere History
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

let preferredIdx = 0;

export async function proxiedFetch(url, options = {}) {
  // Erst praeferierten Proxy, dann andere durchprobieren, am Ende direkt.
  const order = [];
  for (let i = 0; i < PROXIES.length; i++) {
    order.push((preferredIdx + i) % PROXIES.length);
  }
  let lastErr = null;
  for (const idx of order) {
    try {
      const res = await fetch(PROXIES[idx](url), options);
      if (res.ok) {
        preferredIdx = idx;     // diesen Proxy fuer naechsten Call merken
        return res;
      }
      lastErr = new Error(`Proxy ${idx} HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  // Letzter Versuch: direkt (klappt nur wenn Quelle CORS sendet).
  try {
    const res = await fetch(url, options);
    if (res.ok) return res;
    lastErr = new Error(`Direct HTTP ${res.status}`);
  } catch (err) {
    lastErr = err;
  }
  throw lastErr ?? new Error('Alle Proxies fehlgeschlagen');
}
