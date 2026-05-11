// Smoke-Test: simuliert mehrere "Mehr laden"-Klicks und prueft Dedup.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const sccodeCorpus = JSON.parse(readFileSync(join(ROOT, 'public', 'sccode_corpus.json'), 'utf-8'));
const strudelCorpus = JSON.parse(readFileSync(join(ROOT, 'public', 'strudel_corpus.json'), 'utf-8'));

function matchesQueries(item, queries) {
  if (!queries || queries.length === 0) return true;
  const hay = [item.title, item.author, item.cluster, item.description, ...(item.tags ?? []), item.code?.slice(0,200)].join(' ').toLowerCase();
  return queries.some(q => hay.includes(String(q).toLowerCase()));
}
function makeSccodeSearch() {
  const pages = new Map();
  return function({ queries, target = 20 }) {
    const matched = sccodeCorpus.filter(i => matchesQueries(i, queries));
    const isBroadDefault = queries && queries.length >= 3 && queries.every(q => String(q).length < 10);
    const useFull = matched.length === 0 || (isBroadDefault && matched.length < sccodeCorpus.length / 2);
    const pool = useFull ? sccodeCorpus : matched;
    const offsetKey = '__sccode_offset__';
    const offset = pages.get(offsetKey) ?? 0;
    const slice = pool.slice(offset, offset + target);
    pages.set(offsetKey, offset + slice.length);
    if (offset + slice.length >= pool.length) pages.set(offsetKey, 0);
    return slice.map(i => ({ id: `sccode:${i.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}` }));
  };
}

console.log('=== Sccode-Smoke-Test (Default-Queries) ===');
console.log(`Korpus: ${sccodeCorpus.length} Snippets`);
let search = makeSccodeSearch();
let queue = [], queueIds = new Set();
for (let i = 1; i <= 4; i++) {
  const fresh = search({ queries: ['ambient', 'drone', 'synth', 'rhythm'], target: 20 });
  let added = 0, skipped = 0;
  for (const f of fresh) {
    if (queueIds.has(f.id)) { skipped++; continue; }
    queue.push(f); queueIds.add(f.id); added++;
  }
  console.log(`Reload ${i}: target=20, got=${fresh.length}, added=${added}, skipped=${skipped}, queueLen=${queue.length}`);
}

console.log();
console.log('=== Sccode-Smoke-Test (spezifische Query "fm") ===');
search = makeSccodeSearch();
queue = []; queueIds = new Set();
for (let i = 1; i <= 4; i++) {
  const fresh = search({ queries: ['fm'], target: 20 });
  let added = 0, skipped = 0;
  for (const f of fresh) {
    if (queueIds.has(f.id)) { skipped++; continue; }
    queue.push(f); queueIds.add(f.id); added++;
  }
  console.log(`Reload ${i}: got=${fresh.length}, added=${added}, skipped=${skipped}, queueLen=${queue.length}`);
}
