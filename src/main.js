// Entry point: load settings, wire up UI, manage tabs + audition flow.

import './style.css';
import { get, set, patch, on } from './state.js';
import { getTheme, loadThemes, allThemes, saveCustomTheme, deleteCustomTheme, slugify, BUILTINS } from './themes.js';
import { searchTheme } from './freesound.js';
import {
  rememberSample, setStatus, getStats, getSample,
  getKept, getMittelForReAudition,
} from './memory.js';
import {
  renderTopCard, renderKeptList, renderThemesList,
  onVote, onTapPad, onHoldStart, onHoldEnd, onWaveClick,
  onKeptTap, onKeptLongPress,
  setProgress, showToast, statusToFlyDir, flyOff,
} from './ui.js';
import {
  loadSample, play, playFromOffset, setLoop, stop as audioStop,
  getPeakInfo, getCurrentDuration, ensureContextResumed,
} from './audio.js';
import { pushStarSample, deleteStarSample } from './github.js';

const SETTINGS_KEY = 'toender:settings';
const TARGET_QUEUE = 20;
const REFILL_THRESHOLD = 5;
const UNDO_VISIBLE_MS = 3000;

let currentCardEls = null;
let isLoadingMore = false;
let undoTimer = null;
let currentKeptId = null;
let activeActionSample = null;

function $(id) { return document.getElementById(id); }

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) patch('settings', JSON.parse(raw));
  } catch (err) {
    console.warn('Settings konnten nicht geladen werden:', err);
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(get('settings')));
}

function applySettingsToForm() {
  const s = get('settings');
  $('freesound-key').value = s.freesoundKey ?? '';
  $('github-token').value = s.githubToken ?? '';
  $('github-repo').value = s.githubRepo ?? '';
  $('loudness-normalize').checked = !!s.loudnessNormalize;
  $('license-publishable').checked = !!s.licensePublishable;
}

function readSettingsFromForm() {
  patch('settings', {
    freesoundKey: $('freesound-key').value.trim(),
    githubToken: $('github-token').value.trim(),
    githubRepo: $('github-repo').value.trim(),
    loudnessNormalize: $('loudness-normalize').checked,
    licensePublishable: $('license-publishable').checked,
  });
  saveSettings();
}

// ===== Tab-Routing =====

function switchTab(name) {
  set('view', name);
  for (const view of document.querySelectorAll('.view')) {
    view.hidden = view.dataset.view !== name;
  }
  for (const btn of document.querySelectorAll('.tab-btn')) {
    btn.classList.toggle('active', btn.dataset.tab === name);
  }
  // Per-Tab-Render
  audioStop();
  setLoop(false);
  currentKeptId = null;
  if (name === 'behalten') refreshBehalten();
  if (name === 'themes') refreshThemesList();
  if (name === 'du') { applySettingsToForm(); refreshStats(); }
  if (name === 'audition') {
    // Auto-Play wieder anwerfen wenn current da ist
    if (get('current')) playCurrent();
  }
}

// ===== Stats =====

async function refreshStats() {
  try {
    const all = await getStats();
    const ofTheme = await getStats(get('theme'));
    const lines = [
      `Theme ${get('theme')}:`,
      `  neu ${ofTheme.neu}  gut ${ofTheme.gut}  stern ${ofTheme.stern}  mittel ${ofTheme.mittel}  raus ${ofTheme.raus}`,
      ``,
      `Alle Themes:`,
      `  neu ${all.neu}  gut ${all.gut}  stern ${all.stern}  mittel ${all.mittel}  raus ${all.raus}`,
    ];
    $('stats').textContent = lines.join('\n');
    set('stats', ofTheme);
  } catch (err) {
    console.warn('refreshStats failed:', err);
    $('stats').textContent = '-';
  }
}

// ===== Audition: Queue laden =====

async function loadMore({ filter = null, query = null } = {}) {
  if (isLoadingMore) return [];
  const s = get('settings');
  if (!s.freesoundKey) {
    showToast('Freesound API-Key fehlt — Du-Tab oeffnen.');
    return [];
  }
  isLoadingMore = true;
  const themeKey = get('theme');
  const theme = getTheme(themeKey);
  // query kann String mit Kommas oder Array sein
  let queries;
  if (Array.isArray(query)) queries = query;
  else if (typeof query === 'string') queries = query.split(',').map((q) => q.trim()).filter(Boolean);
  else queries = theme.queries;
  const effectiveFilter = filter ?? get('stackFilter');

  try {
    const fresh = await searchTheme({
      key: s.freesoundKey,
      theme: themeKey,
      queries,
      durationMax: theme.durationMax,
      publishable: s.licensePublishable,
      target: TARGET_QUEUE,
    });

    // Re-Anzeige als Marker statt Filter: nicht nur 'neu', sondern Status mit
    // beruecksichtigen je nach Stack-Filter.
    const filtered = [];
    for (const f of fresh) {
      const existing = await getSample(f.id);
      // 'neu' = nur unbewertete
      if (effectiveFilter === 'neu' && existing && existing.status !== 'neu') continue;
      // 'mittel' = nur Mittel-Eimer
      if (effectiveFilter === 'mittel' && (!existing || existing.status !== 'mittel')) continue;
      // 'all' = alles
      const merged = await rememberSample({
        ...f,
        // Wenn existing existiert, nimm dessen Status; sonst 'neu' aus Freesound.
        status: existing?.status ?? f.status ?? 'neu',
      });
      filtered.push(merged);
    }

    // Mittel-Re-Audition: zusaetzlich bestehende Mittel-Samples mit aufnehmen
    // wenn der User explizit "Mittel re-audition" gewaehlt hat.
    if (effectiveFilter === 'mittel') {
      const mittels = await getMittelForReAudition(themeKey, TARGET_QUEUE);
      for (const m of mittels) {
        if (!filtered.some((x) => x.id === m.id)) filtered.push(m);
      }
    }

    set('queue', [...get('queue'), ...filtered]);
    if (filtered.length === 0) {
      showToast(`Keine passenden Samples — Filter zu eng oder alle gehoert.`);
    } else {
      showToast(`${filtered.length} Samples geladen.`);
    }
    return filtered;
  } catch (err) {
    console.error(err);
    if (err.status === 401 || err.status === 403) {
      showToast(`Freesound-Key ungueltig (HTTP ${err.status}) — Du-Tab.`);
    } else if (err.status === 429) {
      showToast(`Freesound-Limit (HTTP 429) — spaeter nochmal.`);
    } else {
      showToast(`Fehler: ${err.message}`);
    }
    return [];
  } finally {
    isLoadingMore = false;
  }
}

async function showNext() {
  audioStop();
  setLoop(false);
  const queue = get('queue');
  if (queue.length === 0) {
    set('current', null);
    await showEmptyStack();
    return;
  }
  $('empty-stack').hidden = true;
  $('onboarding').hidden = true;
  $('card-stack').style.display = '';

  const sample = queue[0];
  set('queue', queue.slice(1));
  set('current', sample);

  currentCardEls = await renderTopCard($('card-stack'), sample, get('theme'));
  updateStackCounter();

  await playCurrent();

  if (get('queue').length < REFILL_THRESHOLD) loadMore();
}

async function playCurrent() {
  const sample = get('current');
  if (!sample?.audioUrl) return;
  try {
    await ensureContextResumed();
    await loadSample(sample.audioUrl);
    const opts = collectFxOpts();
    play({ ...opts, onEnded: () => setProgress(currentCardEls?.progressBar, 1) });
    startProgressTracker(sample.duration);
  } catch (err) {
    console.warn('Audio-Fehler:', err);
    showToast(`Audio-Fehler: ${err.message}`);
  }
}

function updateStackCounter() {
  const q = get('queue').length;
  const cur = get('current') ? 1 : 0;
  $('stack-counter').textContent = `${q + cur} im Stack`;
}

async function showEmptyStack() {
  $('card-stack').innerHTML = '';
  $('card-stack').style.display = 'none';
  const stats = await getStats(get('theme'));
  $('empty-stats').textContent =
    `Theme "${get('theme')}": ${stats.stern} ★ · ${stats.gut} + · ${stats.mittel} ~ · ${stats.raus} x · ${stats.neu} neu.`;
  $('empty-stack').hidden = false;
}

let progressInterval = null;
function startProgressTracker(duration) {
  clearInterval(progressInterval);
  if (!duration) return;
  const start = performance.now();
  progressInterval = setInterval(() => {
    const elapsed = (performance.now() - start) / 1000;
    setProgress(currentCardEls?.progressBar, elapsed / duration);
    if (elapsed >= duration) clearInterval(progressInterval);
  }, 50);
}

function collectFxOpts() {
  const s = get('settings');
  return {
    pitch: parseInt($('fx-pitch').value, 10) || 0,
    speed: parseFloat($('fx-speed').value) || 1,
    reverse: $('fx-reverse').checked,
    highpass: parseInt($('fx-highpass').value, 10) || 0,
    trimStart: parseFloat($('fx-trim-start').value) || 0,
    trimEnd: parseFloat($('fx-trim-end').value) || 0,
    normalize: !!s.loudnessNormalize,
  };
}

// ===== Vote + Undo =====

async function handleVote(status) {
  const sample = get('current');
  if (!sample) return;

  // Backup-Snapshot fuer Undo
  set('lastVote', { sampleId: sample.id, prevStatus: sample.status ?? 'neu', sampleSnapshot: { ...sample } });

  await setStatus(sample.id, status);

  // Wenn Stern + Sync moeglich: pushen
  if (status === 'stern') {
    const s = get('settings');
    if (s.githubToken && s.githubRepo) {
      pushStarSample({ token: s.githubToken, repo: s.githubRepo, sample })
        .then(({ audioPath }) => showToast(`Stern committet: ${audioPath}`))
        .catch((err) => showToast(`Stern-Sync fehlgeschlagen: ${err.message}`));
    } else {
      showToast('Stern lokal — GitHub-Token/Repo im Du-Tab.');
    }
  }

  showUndoPill(sample.id, status);
  await refreshStats();

  // Karte fliegt weg, dann naechste
  if (currentCardEls?.card) flyOff(currentCardEls.card, statusToFlyDir(status));
  setTimeout(showNext, 280);
}

function showUndoPill(sampleId, status) {
  clearTimeout(undoTimer);
  const pill = $('undo-pill');
  const label = $('undo-label');
  label.textContent = `${labelForStatus(status)} zurueck`;
  pill.hidden = false;
  undoTimer = setTimeout(() => { pill.hidden = true; }, UNDO_VISIBLE_MS);
}

function labelForStatus(status) {
  return ({ raus: 'Raus', mittel: 'Mittel', gut: 'Gut', stern: 'Stern' })[status] ?? status;
}

async function handleUndo() {
  const lv = get('lastVote');
  if (!lv) return;
  await setStatus(lv.sampleId, lv.prevStatus);
  // Sample zurueck an Stack-Anfang, current = neu setzen
  const restored = await getSample(lv.sampleId);
  if (restored) {
    set('queue', [restored, ...get('queue')]);
  }
  set('lastVote', null);
  $('undo-pill').hidden = true;
  await refreshStats();
  await showNext();
}

// ===== Tap-Pad / Hold / Wave-Click =====

function handleTapPad() {
  if (!get('current')) return;
  setLoop(false);
  playFromOffset(0);
  startProgressTracker(get('current').duration);
}

function handleHoldStart() {
  if (!get('current')) return;
  setLoop(true);
  playFromOffset(0, { loop: true });
}

function handleHoldEnd() {
  // Letzter Durchgang noch zu Ende spielen, dann stoppen
  setLoop(false);
}

function handleWaveClick(ratio) {
  const sample = get('current');
  if (!sample) return;
  const dur = sample.duration ?? getCurrentDuration() ?? 0;
  setLoop(false);
  playFromOffset(ratio * dur);
}

// ===== Behalten-Tab =====

async function refreshBehalten() {
  const items = await getKept({
    filter: get('behaltenFilter'),
    search: get('behaltenSearch'),
  });
  const ok = renderKeptList($('behalten-list'), items, currentKeptId);
  $('behalten-empty').hidden = ok;
  $('behalten-counter').textContent = `${items.length} Eintrag${items.length === 1 ? '' : 'e'}`;
}

async function handleKeptTap(sample) {
  if (currentKeptId === sample.id) {
    audioStop();
    setLoop(false);
    currentKeptId = null;
    await refreshBehalten();
    return;
  }
  currentKeptId = sample.id;
  await refreshBehalten();
  try {
    await ensureContextResumed();
    await loadSample(sample.audioUrl);
    setLoop(true);
    play({ ...collectFxOpts(), loop: true });
  } catch (err) {
    showToast(`Audio-Fehler: ${err.message}`);
    currentKeptId = null;
    await refreshBehalten();
  }
}

function handleKeptLongPress(sample) {
  activeActionSample = sample;
  $('action-title').textContent = sample.name;
  $('action-sheet').hidden = false;
}

async function handleAction(action) {
  const s = activeActionSample;
  if (!s) return;
  $('action-sheet').hidden = true;
  audioStop();
  setLoop(false);
  currentKeptId = null;

  if (action === 'upgrade') {
    const next = s.status === 'mittel' ? 'gut' : s.status === 'gut' ? 'stern' : 'stern';
    await setStatus(s.id, next);
    showToast(`→ ${labelForStatus(next)}`);
    if (next === 'stern') triggerStarSync(s);
  } else if (action === 'downgrade') {
    const next = s.status === 'stern' ? 'gut' : s.status === 'gut' ? 'mittel' : 'mittel';
    await setStatus(s.id, next);
    showToast(`→ ${labelForStatus(next)}`);
  } else if (action === 'back-to-stack') {
    await setStatus(s.id, 'neu');
    set('queue', [{ ...s, status: 'neu' }, ...get('queue')]);
    showToast(`→ Stack`);
    switchTab('audition');
    await showNext();
    return;
  } else if (action === 'fx') {
    activeActionSample = s;
    set('current', s);
    try {
      await ensureContextResumed();
      await loadSample(s.audioUrl, $('waveform'));
      $('detail-title').textContent = s.name;
      $('detail-sheet').hidden = false;
    } catch (err) {
      showToast(`Audio-Fehler: ${err.message}`);
    }
    return;
  } else if (action === 'sync') {
    triggerStarSync(s);
  } else if (action === 'rename' || action === 'tag') {
    showToast(`${action} kommt in 2b`);
  } else if (action === 'unstar') {
    if (s.status !== 'stern') { showToast('Kein Stern.'); return; }
    await setStatus(s.id, 'gut');
    const settings = get('settings');
    if (settings.githubToken && settings.githubRepo) {
      deleteStarSample({ token: settings.githubToken, repo: settings.githubRepo, sample: s })
        .then(() => showToast('Stern entfernt + Repo aufgeraeumt.'))
        .catch((err) => showToast(`Repo-Delete fehlgeschlagen: ${err.message}`));
    } else {
      showToast('Stern lokal entfernt (kein Token fuer Repo-Cleanup).');
    }
  }

  activeActionSample = null;
  await refreshStats();
  await refreshBehalten();
}

function triggerStarSync(sample) {
  const s = get('settings');
  if (!s.githubToken || !s.githubRepo) {
    showToast('Kein Token/Repo — nur lokal.');
    return;
  }
  pushStarSample({ token: s.githubToken, repo: s.githubRepo, sample })
    .then(({ audioPath }) => showToast(`Stern: ${audioPath}`))
    .catch((err) => showToast(`Sync-Fehler: ${err.message}`));
}

// ===== Themes-Tab =====

function refreshThemesList() {
  const themes = allThemes();
  renderThemesList($('themes-list'), themes, get('theme'));
  for (const item of $('themes-list').querySelectorAll('.theme-item')) {
    const key = item.dataset.key;
    item.addEventListener('click', () => {
      set('theme', key);
      set('queue', []);
      refreshThemesList();
      switchTab('audition');
      const t = getTheme(key);
      $('theme-name').textContent = t.label;
      loadMore().then(() => showNext());
    });
    // Long-Press: nur Custom-Themes loeschbar
    if (!BUILTINS[key]) {
      attachThemeLongPress(item, key);
    }
  }
  $('themes-counter').textContent = `${Object.keys(themes).length} Themes`;
}

function attachThemeLongPress(el, key) {
  let timer = null;
  let triggered = false;
  function start() {
    triggered = false;
    timer = setTimeout(() => {
      triggered = true;
      if (navigator.vibrate) navigator.vibrate(40);
      openThemeEditSheet(key);
    }, 500);
  }
  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
  }
  function move(ev) {
    // Wenn der Finger sich bewegt, abbrechen damit Scrollen geht
    if (timer) { clearTimeout(timer); timer = null; }
  }
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointermove', move);
  // Klick-Handler wird in refreshThemesList() gesetzt; wenn Long-Press
  // ausgeloest hat, verhindere den Klick.
  el.addEventListener('click', (ev) => {
    if (triggered) { ev.stopImmediatePropagation(); ev.preventDefault(); triggered = false; }
  }, true);
}

let editingThemeKey = null;
function openThemeEditSheet(key) {
  const theme = getTheme(key);
  if (!theme || BUILTINS[key]) {
    showToast('Built-in-Themes sind nicht bearbeitbar.');
    return;
  }
  editingThemeKey = key;
  $('edit-theme-key').textContent = key;
  $('edit-theme-name').value = theme.label ?? '';
  $('edit-theme-queries').value = (theme.queries ?? []).join(', ');
  $('edit-theme-duration').value = theme.durationMax ?? 8;
  $('edit-theme-sheet').hidden = false;
}

async function handleEditThemeApply() {
  if (!editingThemeKey) return;
  const label = $('edit-theme-name').value.trim();
  const queries = $('edit-theme-queries').value.split(',').map((q) => q.trim()).filter(Boolean);
  const durMax = parseFloat($('edit-theme-duration').value) || 8;
  if (!label || queries.length === 0) {
    showToast('Name und mind. ein Stichwort.');
    return;
  }
  await saveCustomTheme({ key: editingThemeKey, label, queries, durationMax: durMax });
  showToast(`Theme "${label}" aktualisiert.`);
  $('edit-theme-sheet').hidden = true;
  refreshThemesList();
  // Wenn das aktive Theme bearbeitet wurde, Anzeige aktualisieren
  if (get('theme') === editingThemeKey) {
    $('theme-name').textContent = label;
  }
  editingThemeKey = null;
}

async function handleEditThemeDelete() {
  if (!editingThemeKey) return;
  if (!confirm(`Theme "${editingThemeKey}" wirklich loeschen?`)) return;
  await deleteCustomTheme(editingThemeKey);
  if (get('theme') === editingThemeKey) {
    set('theme', 'kiesel');
    $('theme-name').textContent = getTheme('kiesel').label;
  }
  $('edit-theme-sheet').hidden = true;
  refreshThemesList();
  editingThemeKey = null;
}

// ===== Onboarding =====

function maybeShowOnboarding() {
  const s = get('settings');
  if (s.freesoundKey) {
    $('onboarding').hidden = true;
    setVoteButtonsEnabled(true);
    return false;
  }
  showOnboarding();
  return true;
}

function showOnboarding(reasonToast = null) {
  $('card-stack').style.display = 'none';
  $('card-stack').innerHTML = '';
  $('empty-stack').hidden = true;
  $('onboarding').hidden = false;
  setVoteButtonsEnabled(false);
  if (reasonToast) showToast(reasonToast, 4000);
}

function setVoteButtonsEnabled(enabled) {
  for (const btn of document.querySelectorAll('.vote-btn')) {
    btn.disabled = !enabled;
  }
}

async function handleOnboardingGo() {
  const key = $('onb-freesound-key').value.trim();
  const ghToken = $('onb-github-token').value.trim();
  const ghRepo = $('onb-github-repo').value.trim();
  if (!key) {
    showToast('Freesound-Key noetig.');
    return;
  }
  patch('settings', { freesoundKey: key, githubToken: ghToken, githubRepo: ghRepo });
  saveSettings();
  $('onboarding').hidden = true;
  $('card-stack').style.display = '';
  setVoteButtonsEnabled(true);
  await loadMore();
  await showNext();
}

// ===== Stack-Filter-Sheet =====

function handleStackFilterApply() {
  const radio = document.querySelector('input[name="stack-filter"]:checked');
  const filter = radio ? radio.value : 'neu';
  set('stackFilter', filter);
  set('queue', []);
  $('filter-sheet').hidden = true;
  loadMore({ filter }).then(() => showNext());
}

async function handleSearchApply() {
  const queryRaw = $('search-query').value.trim();
  const saveAs = $('search-save-as').value.trim();
  if (!queryRaw) {
    showToast('Stichwort fehlt.');
    return;
  }
  const queries = queryRaw.split(',').map((q) => q.trim()).filter(Boolean);

  // Wenn User Namen angegeben hat -> als neues Theme speichern und aktivieren.
  // Sonst: ad-hoc-Suche innerhalb des aktuellen Themes (Stack ersetzen).
  if (saveAs) {
    const key = slugify(saveAs);
    await saveCustomTheme({ key, label: saveAs, queries, durationMax: 8 });
    set('theme', key);
    refreshThemesList();
    $('theme-name').textContent = saveAs;
    showToast(`Theme "${saveAs}" angelegt.`);
  }

  set('queue', []);
  $('search-sheet').hidden = true;
  $('search-query').value = '';
  $('search-save-as').value = '';
  loadMore({ query: queries }).then(() => showNext());
}

// FAB im Themes-Tab: kleines Sheet zum manuellen Theme-Anlegen.
async function handleNewThemeApply() {
  const label = $('new-theme-name').value.trim();
  const queries = $('new-theme-queries').value.trim();
  const durMax = parseFloat($('new-theme-duration').value) || 8;
  if (!label || !queries) {
    showToast('Name und Stichworte fehlen.');
    return;
  }
  const qList = queries.split(',').map((q) => q.trim()).filter(Boolean);
  const key = slugify(label);
  await saveCustomTheme({ key, label, queries: qList, durationMax: durMax });
  showToast(`Theme "${label}" angelegt.`);
  $('new-theme-sheet').hidden = true;
  $('new-theme-name').value = '';
  $('new-theme-queries').value = '';
  refreshThemesList();
}

// ===== FX-Sheet =====

function openDetailSheet() {
  if (!get('current')) {
    showToast('Kein Sample geladen.');
    return;
  }
  const s = get('current');
  $('detail-title').textContent = s.name;
  const peak = getPeakInfo();
  const lines = [
    `Lizenz: ${s.license}`,
    `Autor: ${s.author}`,
    `Dauer: ${s.duration?.toFixed(2)} s`,
    `Quelle: <a href="${s.url}" target="_blank" rel="noopener">${s.source}</a>`,
  ];
  if (peak) lines.push(`Peak: ${peak.peakDb.toFixed(1)} dBFS`);
  if (s.attribution) lines.push(`Attribution: ${s.attribution}`);
  $('detail-meta').innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  // Wavesurfer-Container fuellen
  loadSample(s.audioUrl, $('waveform')).catch((err) => console.warn(err));
  $('detail-sheet').hidden = false;
}

// ===== Tastatur-Shortcuts =====

function wireKeyboardShortcuts() {
  window.addEventListener('keydown', (ev) => {
    // Nicht in Eingabefeldern
    const tag = ev.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (get('view') !== 'audition') return;
    if (!get('current')) return;

    const map = {
      ArrowLeft: () => handleVote('raus'),
      ArrowRight: () => handleVote('gut'),
      ArrowUp: () => handleVote('stern'),
      ArrowDown: () => handleVote('mittel'),
      ' ': () => handleTapPad(),
      l: () => toggleLoop(),
      L: () => toggleLoop(),
      f: () => openDetailSheet(),
      F: () => openDetailSheet(),
    };
    if (map[ev.key]) {
      ev.preventDefault();
      map[ev.key]();
    }
  });
}

function toggleLoop() {
  if (!get('current')) return;
  // einfaches Toggle: wenn aktuell loop -> stoppen; sonst loop start
  setLoop(true);
  playFromOffset(0, { loop: true });
  showToast('Loop ein. Erneut L = aus.');
}

// ===== Wiring =====

function wireTabs() {
  for (const btn of document.querySelectorAll('.tab-btn')) {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  }
}

function wireVoteButtons() {
  for (const btn of document.querySelectorAll('.vote-btn')) {
    btn.addEventListener('click', () => handleVote(btn.dataset.vote));
  }
  onVote(handleVote);
  onTapPad(handleTapPad);
  onHoldStart(handleHoldStart);
  onHoldEnd(handleHoldEnd);
  onWaveClick(handleWaveClick);
  onKeptTap(handleKeptTap);
  onKeptLongPress(handleKeptLongPress);
  $('undo-btn').addEventListener('click', handleUndo);
}

function wireSheets() {
  $('btn-detail').addEventListener('click', openDetailSheet);
  $('detail-close').addEventListener('click', () => { $('detail-sheet').hidden = true; });

  $('btn-filter').addEventListener('click', () => {
    $('filter-sheet').hidden = false;
  });
  $('filter-close').addEventListener('click', () => { $('filter-sheet').hidden = true; });
  $('filter-apply').addEventListener('click', handleStackFilterApply);

  $('btn-search').addEventListener('click', () => {
    $('search-query').value = '';
    $('search-save-as').value = '';
    $('search-sheet').hidden = false;
    setTimeout(() => $('search-query').focus(), 50);
  });
  $('search-close').addEventListener('click', () => { $('search-sheet').hidden = true; });
  $('search-apply').addEventListener('click', handleSearchApply);
  $('search-query').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') handleSearchApply();
  });

  $('edit-theme-close').addEventListener('click', () => { $('edit-theme-sheet').hidden = true; editingThemeKey = null; });
  $('edit-theme-apply').addEventListener('click', handleEditThemeApply);
  $('edit-theme-delete').addEventListener('click', handleEditThemeDelete);

  $('btn-new-theme').addEventListener('click', () => {
    $('new-theme-name').value = '';
    $('new-theme-queries').value = '';
    $('new-theme-duration').value = '8';
    $('new-theme-sheet').hidden = false;
    setTimeout(() => $('new-theme-name').focus(), 50);
  });
  $('new-theme-close').addEventListener('click', () => { $('new-theme-sheet').hidden = true; });
  $('new-theme-apply').addEventListener('click', handleNewThemeApply);

  $('action-close').addEventListener('click', () => { $('action-sheet').hidden = true; activeActionSample = null; });
  for (const btn of $('action-sheet').querySelectorAll('[data-action]')) {
    btn.addEventListener('click', () => handleAction(btn.dataset.action));
  }
}

function wireFxControls() {
  const fxIds = ['fx-pitch', 'fx-speed', 'fx-reverse', 'fx-highpass', 'fx-trim-start', 'fx-trim-end'];
  for (const id of fxIds) {
    $(id).addEventListener('input', () => {
      $('fx-pitch-out').value = $('fx-pitch').value;
      $('fx-speed-out').value = parseFloat($('fx-speed').value).toFixed(2);
      audioStop();
      play(collectFxOpts());
    });
  }
}

function wireBehaltenFilters() {
  for (const chip of document.querySelectorAll('#behalten-filters .chip')) {
    chip.addEventListener('click', () => {
      for (const c of document.querySelectorAll('#behalten-filters .chip')) c.classList.remove('active');
      chip.classList.add('active');
      set('behaltenFilter', chip.dataset.filter);
      refreshBehalten();
    });
  }
  $('behalten-search').addEventListener('input', (ev) => {
    set('behaltenSearch', ev.target.value.trim());
    refreshBehalten();
  });
}

function wireDuTab() {
  $('btn-save-settings').addEventListener('click', () => {
    readSettingsFromForm();
    showToast('Gespeichert.');
  });
}

function wireEmptyStack() {
  $('empty-reload').addEventListener('click', () => {
    set('queue', []);
    loadMore().then(() => showNext());
  });
  $('empty-mittel').addEventListener('click', () => {
    set('stackFilter', 'mittel');
    set('queue', []);
    loadMore({ filter: 'mittel' }).then(() => showNext());
  });
  $('empty-behalten').addEventListener('click', () => switchTab('behalten'));
}

function wireOnboarding() {
  $('btn-onboarding-go').addEventListener('click', handleOnboardingGo);
}

function wireThemeName() {
  on('theme', (themeKey) => {
    const theme = getTheme(themeKey);
    $('theme-name').textContent = theme.label;
  });
  $('theme-name').textContent = getTheme(get('theme')).label;
}

function wireServiceWorker() {
  // Service worker disabled in Stufe 2a — wieder rein in 2c via vite-plugin-pwa.
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

// ===== Boot =====

async function boot() {
  try {
    loadSettings();
    await loadThemes();          // Custom-Themes aus IndexedDB einlesen
    applySettingsToForm();

    wireTabs();
    wireVoteButtons();
    wireSheets();
    wireFxControls();
    wireBehaltenFilters();
    wireDuTab();
    wireEmptyStack();
    wireOnboarding();
    wireThemeName();
    wireKeyboardShortcuts();
    wireServiceWorker();

    switchTab('audition');

    if (maybeShowOnboarding()) {
      // Wartet auf User-Eingabe in Onboarding.
      return;
    }

    // Onboarding-Inputs mit gespeicherten Werten vorbefuellen, falls User
    // sie via Auth-Fehler nochmal sieht.
    const s0 = get('settings');
    $('onb-freesound-key').value = s0.freesoundKey ?? '';
    $('onb-github-token').value = s0.githubToken ?? '';
    $('onb-github-repo').value = s0.githubRepo ?? '';

    const loaded = await loadMore();
    if (loaded.length === 0) {
      // Wenn nach loadMore() der Stack komplett leer und keine Behaltenen da sind,
      // ist der Key vermutlich ungueltig oder kaputt — Onboarding wieder zeigen.
      const allStats = await getStats();
      const total = allStats.gut + allStats.stern + allStats.mittel + allStats.raus + allStats.neu;
      if (total === 0) {
        showOnboarding('Konnte keine Samples laden. Pruefe Freesound-API-Key.');
      } else {
        await showEmptyStack();
      }
    } else {
      await showNext();
    }
    await refreshStats();
  } catch (err) {
    console.error('Boot failed:', err);
    document.body.innerHTML = `<pre style="color:#fff;padding:1rem;white-space:pre-wrap">Fehler beim Start:\n${err.message}\n\n${err.stack ?? ''}</pre>`;
  }
}

boot();
