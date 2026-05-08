// Entry point: load settings, wire up UI, manage queue + audition flow.

import './style.css';
import { get, set, patch, on } from './state.js';
import { getTheme, THEMES } from './themes.js';
import { searchTheme } from './freesound.js';
import { rememberSample, setStatus, getStats, getSample } from './memory.js';
import { renderTopCard, onVote, setProgress, showToast } from './ui.js';
import { loadSample, play, stop as audioStop, getPeakInfo, ensureContextResumed } from './audio.js';
import { pushStarSample } from './github.js';

const SETTINGS_KEY = 'toender:settings';
const TARGET_QUEUE = 20;
const REFILL_THRESHOLD = 5;

let currentCardEls = null;
let isLoadingMore = false;

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

function $(id) { return document.getElementById(id); }

function applySettingsToForm() {
  const s = get('settings');
  $('freesound-key').value = s.freesoundKey ?? '';
  $('github-token').value = s.githubToken ?? '';
  $('github-repo').value = s.githubRepo ?? '';
  $('loudness-normalize').checked = !!s.loudnessNormalize;
  $('license-publishable').checked = !!s.licensePublishable;
  $('theme-select').value = get('theme');
}

function readSettingsFromForm() {
  patch('settings', {
    freesoundKey: $('freesound-key').value.trim(),
    githubToken: $('github-token').value.trim(),
    githubRepo: $('github-repo').value.trim(),
    loudnessNormalize: $('loudness-normalize').checked,
    licensePublishable: $('license-publishable').checked,
  });
  set('theme', $('theme-select').value);
  saveSettings();
}

async function refreshStats() {
  try {
    const stats = await getStats(get('theme'));
    set('stats', stats);
    $('stats').textContent = `neu ${stats.neu} | gut ${stats.gut} | stern ${stats.stern} | mittel ${stats.mittel} | raus ${stats.raus}`;
  } catch (err) {
    console.warn('refreshStats failed:', err);
    $('stats').textContent = '-';
  }
}

async function loadMore() {
  if (isLoadingMore) return;
  const s = get('settings');
  if (!s.freesoundKey) {
    showToast('Freesound API-Key fehlt — Setup oeffnen.');
    return;
  }
  isLoadingMore = true;
  try {
    const themeKey = get('theme');
    const theme = getTheme(themeKey);
    const fresh = await searchTheme({
      key: s.freesoundKey,
      theme: themeKey,
      queries: theme.queries,
      durationMax: theme.durationMax,
      publishable: s.licensePublishable,
      target: TARGET_QUEUE,
    });
    // Drop ones we've already audition'd in this theme
    const filtered = [];
    for (const f of fresh) {
      const existing = await getSample(f.id);
      if (existing && existing.status !== 'neu') continue;
      await rememberSample(f);
      filtered.push(f);
    }
    set('queue', [...get('queue'), ...filtered]);
    showToast(`${filtered.length} neue Samples geladen.`);
  } catch (err) {
    console.error(err);
    showToast(`Fehler: ${err.message}`);
  } finally {
    isLoadingMore = false;
  }
}

async function showNext() {
  audioStop();
  const queue = get('queue');
  if (queue.length === 0) {
    set('current', null);
    $('empty-state').hidden = false;
    $('card-stack').innerHTML = '';
    return;
  }
  $('empty-state').hidden = true;
  const sample = queue[0];
  set('queue', queue.slice(1));
  set('current', sample);

  currentCardEls = await renderTopCard($('card-stack'), sample, get('theme'));

  // Auto-play
  try {
    await ensureContextResumed();
    const detailContainer = $('waveform');
    await loadSample(sample.audioUrl, detailContainer);
    const opts = collectFxOpts();
    play({ ...opts, onEnded: () => setProgress(currentCardEls?.progressBar, 1) });
    startProgressTracker(sample.duration);
  } catch (err) {
    console.warn('Audio-Fehler:', err);
    showToast(`Audio-Fehler: ${err.message}`);
  }

  // Refill in background
  if (get('queue').length < REFILL_THRESHOLD) loadMore();
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

async function handleVote(status) {
  const sample = get('current');
  if (!sample) return;
  await setStatus(sample.id, status);

  if (status === 'stern') {
    const s = get('settings');
    if (s.githubToken && s.githubRepo) {
      pushStarSample({ token: s.githubToken, repo: s.githubRepo, sample })
        .then(({ audioPath }) => showToast(`Stern committet: ${audioPath}`))
        .catch((err) => showToast(`Stern-Sync fehlgeschlagen: ${err.message}`));
    } else {
      showToast('Stern lokal — GitHub-Token/Repo fehlt fuer Sync.');
    }
  }

  await refreshStats();
  setTimeout(showNext, 280);   // wait for fly-off animation
}

function wireDrawers() {
  $('btn-settings').addEventListener('click', () => {
    applySettingsToForm();
    refreshStats();
    $('settings-drawer').hidden = false;
  });
  $('settings-close').addEventListener('click', () => {
    readSettingsFromForm();
    $('settings-drawer').hidden = true;
  });
  $('btn-reload').addEventListener('click', async () => {
    readSettingsFromForm();
    set('queue', []);
    $('settings-drawer').hidden = true;
    await loadMore();
    showNext();
  });

  $('btn-detail').addEventListener('click', () => {
    if (!get('current')) return;
    $('detail-title').textContent = get('current').name;
    const meta = $('detail-meta');
    const s = get('current');
    const peak = getPeakInfo();
    meta.innerHTML = '';
    const lines = [
      `Lizenz: ${s.license}`,
      `Autor: ${s.author}`,
      `Dauer: ${s.duration?.toFixed(2)} s`,
      `Quelle: <a href="${s.url}" target="_blank" rel="noopener">Freesound</a>`,
    ];
    if (peak) lines.push(`Peak: ${peak.peakDb.toFixed(1)} dBFS`);
    if (s.attribution) lines.push(`Attribution: ${s.attribution}`);
    meta.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    $('detail-drawer').hidden = false;
  });
  $('detail-close').addEventListener('click', () => {
    $('detail-drawer').hidden = true;
  });
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

function wireVoteButtons() {
  for (const btn of document.querySelectorAll('.vote-btn')) {
    btn.addEventListener('click', () => handleVote(btn.dataset.vote));
  }
  onVote(handleVote);
}

function wireThemeName() {
  on('theme', (themeKey) => {
    const theme = getTheme(themeKey);
    $('theme-name').textContent = theme.label;
  });
  $('theme-name').textContent = getTheme(get('theme')).label;
}

function wireServiceWorker() {
  // Service worker disabled in Stufe 1 — caching surface caused stale-cache pain.
  // Unregister any existing SW from earlier deploys so users get fresh assets.
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
  }
}

async function boot() {
  try {
    loadSettings();
    applySettingsToForm();
    wireDrawers();
    wireFxControls();
    wireVoteButtons();
    wireThemeName();
    wireServiceWorker();

    const s = get('settings');
    if (!s.freesoundKey) {
      $('settings-drawer').hidden = false;
      showToast('Setup: Freesound API-Key + GitHub-Token eingeben.');
    } else {
      await loadMore();
      showNext();
    }
    await refreshStats();
  } catch (err) {
    console.error('Boot failed:', err);
    document.body.innerHTML = `<pre style="color:#fff;padding:1rem;white-space:pre-wrap">Fehler beim Start:\n${err.message}\n\n${err.stack ?? ''}</pre>`;
  }
}

boot();
