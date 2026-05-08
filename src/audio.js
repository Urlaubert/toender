// Audio engine: load a remote sample, decode, optionally peak-normalize, play with FX.
// Wavesurfer renders the waveform; playback uses our own Web Audio graph so
// Pitch/Speed/Reverse/Highpass/Trim/Gain are all under one roof.

import WaveSurfer from 'wavesurfer.js';

const TARGET_PEAK_DBFS = -3;
const TARGET_PEAK_LINEAR = 10 ** (TARGET_PEAK_DBFS / 20);

let ctx = null;
let wavesurfer = null;
let currentBuffer = null;
let currentSource = null;
let currentGain = null;
let currentFilter = null;
let onEndedCallback = null;

function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export async function ensureContextResumed() {
  const c = audioContext();
  if (c.state === 'suspended') await c.resume();
}

function peakOf(buffer) {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

function reverseBuffer(buffer) {
  const c = audioContext();
  const reversed = c.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = reversed.getChannelData(ch);
    for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
  }
  return reversed;
}

export async function loadSample(audioUrl, container) {
  await ensureContextResumed();

  // Wavesurfer for visualization. We let it fetch its own copy because rendering
  // on a decoded AudioBuffer requires the v7 backend dance and adds nothing.
  if (wavesurfer) wavesurfer.destroy();
  wavesurfer = WaveSurfer.create({
    container,
    waveColor: '#666',
    progressColor: '#ff6a00',
    cursorColor: '#ff6a00',
    height: 100,
    barWidth: 2,
    barGap: 1,
    interact: false,
  });
  wavesurfer.load(audioUrl);

  // Independent fetch + decode for our playback graph.
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`Audio-Fetch ${res.status}`);
  const arr = await res.arrayBuffer();
  currentBuffer = await audioContext().decodeAudioData(arr);
  return { duration: currentBuffer.duration, peak: peakOf(currentBuffer) };
}

export function stop() {
  if (currentSource) {
    try { currentSource.onended = null; currentSource.stop(); } catch {}
    currentSource = null;
  }
  if (wavesurfer) {
    try { wavesurfer.stop(); } catch {}
  }
}

// Play with FX. opts: { pitch, speed, reverse, highpass, trimStart, trimEnd, normalize, onEnded }
// pitch in semitones, speed in 0.25..4, highpass in Hz (0 = off), trims in seconds.
export function play(opts = {}) {
  if (!currentBuffer) return;
  stop();

  const c = audioContext();
  const buffer = opts.reverse ? reverseBuffer(currentBuffer) : currentBuffer;

  const src = c.createBufferSource();
  src.buffer = buffer;

  const pitchRatio = 2 ** ((opts.pitch ?? 0) / 12);
  const speedRatio = opts.speed ?? 1;
  src.playbackRate.value = pitchRatio * speedRatio;

  const gain = c.createGain();
  let gainValue = 1;
  if (opts.normalize) {
    const peak = peakOf(currentBuffer);
    if (peak > 0) gainValue = Math.min(8, TARGET_PEAK_LINEAR / peak);
  }
  gain.gain.value = gainValue;

  let lastNode = src;
  let filter = null;
  if (opts.highpass && opts.highpass > 0) {
    filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = opts.highpass;
    filter.Q.value = 0.7;
    lastNode.connect(filter);
    lastNode = filter;
  }
  lastNode.connect(gain).connect(c.destination);

  const trimStart = Math.max(0, opts.trimStart ?? 0);
  const trimEnd = opts.trimEnd && opts.trimEnd > trimStart ? opts.trimEnd : buffer.duration;
  const playDuration = Math.max(0, trimEnd - trimStart);

  src.onended = () => {
    currentSource = null;
    if (onEndedCallback) onEndedCallback();
  };
  onEndedCallback = opts.onEnded ?? null;

  src.start(0, trimStart, playDuration);
  if (wavesurfer) {
    try { wavesurfer.seekTo(buffer.duration > 0 ? trimStart / buffer.duration : 0); } catch {}
    try { wavesurfer.play(); } catch {}
  }

  currentSource = src;
  currentGain = gain;
  currentFilter = filter;
}

export function getPeakInfo() {
  if (!currentBuffer) return null;
  const peak = peakOf(currentBuffer);
  return {
    peak,
    peakDb: 20 * Math.log10(peak || 1e-9),
    duration: currentBuffer.duration,
  };
}

export function destroy() {
  stop();
  if (wavesurfer) {
    try { wavesurfer.destroy(); } catch {}
    wavesurfer = null;
  }
  currentBuffer = null;
}
