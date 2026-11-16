// Key sounds, synthesised with Web Audio (no audio files). The context is created on the first
// key press, which is when browsers allow sound to start.
let actx = null, noise = null;

function audio() {
  if (actx === false) return null;
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const n = (actx.sampleRate * 0.12) | 0;
      noise = actx.createBuffer(1, n, actx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch { actx = false; return null; }
  }
  if (actx.state === "suspended") actx.resume();
  return actx;
}

export function playKey(kind) {
  if (kind === "off") return;
  const a = audio(); if (!a) return;
  const t = a.currentTime, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noise;
  if (kind === "click") {
    f.type = "highpass"; f.frequency.value = 2600;
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  } else {
    f.type = "bandpass"; f.frequency.value = 1200; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    const o = a.createOscillator(), og = a.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.06);
    og.gain.setValueAtTime(0.28, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(og).connect(a.destination); o.start(t); o.stop(t + 0.08);
  }
  src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + 0.1);
}

export function playErr(enabled, keyKind) {
  if (!enabled) { playKey(keyKind); return; }
  const a = audio(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = "triangle"; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.12);
  g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.15);
}
