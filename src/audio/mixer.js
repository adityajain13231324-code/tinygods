// Procedural sound: every layer and effect is synthesised with the WebAudio API, so there
// are no sample files, nothing to license and nothing to download.
//
// Signal chain:  sources -> (pan) -> dry bus ----------------> compressor -> master -> out
//                                 \-> reverb send -> room ---^
//
// Layers cross-fade with the tension meter (0..100):
//   ambience  wind, bird song, distant crowd murmur     (fades as things get bad)
//   music     warm chord pads + soft plucks             (low tension)
//   drone     low detuned saws                          (mid tension)
//   chaos     pulsing rumble, clashing tones, heartbeat (high tension)
// One-shots are panned left/right by where they happen in the town and get a bit of room
// reverb; speech bubbles come with cartoon voice blips (a different pitch per villager).

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const rand = (a, b) => a + Math.random() * (b - a);
const WORLD_WIDTH = 1920;

// Four-chord loop (C maj7, A min7, F maj7, G6) as note frequencies.
const CHORDS = [
  [130.8, 261.6, 329.6, 392.0, 493.9],
  [110.0, 220.0, 261.6, 329.6, 392.0],
  [87.3, 174.6, 220.0, 261.6, 329.6],
  [98.0, 196.0, 246.9, 293.7, 329.6],
];

export class Mixer {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastPlayed = {};
    this.lastTension = -1;
    this.lastVoice = 0;
    this.chord = 0;
    this.crowd = 1;
    try {
      this.muted = localStorage.getItem('tinygods.muted') === '1';
    } catch { /* storage can be blocked; default to sound on */ }
  }

  /** Browsers only allow audio after a click or key press, so call this from one. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    this.ctx = c;

    this.comp = c.createDynamicsCompressor(); // keeps big brawls from clipping
    this.comp.threshold.value = -20;
    this.comp.ratio.value = 5;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.comp.connect(this.master).connect(c.destination);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.9);
    this.wet = c.createGain();
    this.wet.gain.value = 1;
    this.reverb.connect(this.wet).connect(this.comp);

    this.sfx = c.createGain(); // dry one-shots
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.comp);

    this.samples = {};
    this.noise = this.makeNoise();
    this.buildLayers();
    this.loadSamples();
    this.timers = [
      setInterval(() => this.playNote(), 1100),
      setInterval(() => this.chirp(), 2400),
      setInterval(() => this.nextChord(), 7000),
      setInterval(() => this.heartbeat(), 800),
      setInterval(() => this.crowdShout(), 1700),
    ];
    this.nextChord();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('tinygods.muted', this.muted ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // ---- building blocks ---------------------------------------------------------

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** A synthetic room: decaying noise, different on each ear. */
  makeImpulse(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    return buf;
  }

  noiseSource(loop = false) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    return src;
  }

  layerGain(initial) {
    const g = this.ctx.createGain();
    g.gain.value = initial;
    g.connect(this.comp);
    return g;
  }

  /** Where this sound's output goes: panned by world x, with a reverb send. */
  bus(x, wet = 0.18) {
    const c = this.ctx;
    const input = c.createGain();
    let out = input;
    if (typeof x === 'number' && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-0.8, Math.min(0.8, ((x / WORLD_WIDTH) * 2 - 1) * 0.75));
      input.connect(p);
      out = p;
    }
    out.connect(this.sfx);
    const send = c.createGain();
    send.gain.value = wet;
    out.connect(send).connect(this.reverb);
    return input;
  }

  // ---- layers ---------------------------------------------------------------------

  buildLayers() {
    const c = this.ctx;

    // Ambience: wind that slowly breathes, plus a murmur of the crowd.
    this.amb = this.layerGain(0.05);
    const wind = this.noiseSource(true);
    const windFilter = c.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 600;
    const gust = c.createOscillator();
    gust.frequency.value = 0.13;
    const gustDepth = c.createGain();
    gustDepth.gain.value = 260;
    gust.connect(gustDepth).connect(windFilter.frequency);
    gust.start();
    wind.connect(windFilter).connect(this.amb);
    wind.start();

    this.murmur = this.layerGain(0.02);
    const talk = this.noiseSource(true);
    const talkBand = c.createBiquadFilter();
    talkBand.type = 'bandpass';
    talkBand.frequency.value = 520;
    talkBand.Q.value = 0.8;
    this.talkBand = talkBand;
    const talkSwell = c.createOscillator();
    talkSwell.frequency.value = 0.37;
    const swellDepth = c.createGain();
    swellDepth.gain.value = 0.35;
    const talkAmp = c.createGain();
    talkAmp.gain.value = 0.65;
    talkSwell.connect(swellDepth).connect(talkAmp.gain);
    talkSwell.start();
    talk.connect(talkBand).connect(talkAmp).connect(this.murmur);
    talk.start();

    // Music bus (pads and plucks are scheduled in nextChord / playNote).
    this.music = this.layerGain(0.08);

    // Drone: two slightly detuned saws through a low-pass.
    this.drone = this.layerGain(0);
    const droneFilter = c.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 240;
    droneFilter.connect(this.drone);
    for (const f of [55, 55.8]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(droneFilter);
      o.start();
    }

    // Chaos: pulsing rumble plus clashing tones.
    this.chaos = this.layerGain(0);
    const rumble = this.noiseSource(true);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 320;
    const pulse = c.createGain();
    pulse.gain.value = 0.6;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = 0.4;
    lfo.connect(lfoDepth).connect(pulse.gain);
    lfo.start();
    rumble.connect(band).connect(pulse).connect(this.chaos);
    rumble.start();
    for (const f of [311.1, 329.6, 466.2]) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(this.chaos);
      o.start();
    }
  }

  /** Cross-fade the layers to match the current tension (0..100). */
  setTension(t) {
    if (!this.ctx || Math.abs(t - this.lastTension) < 1) return;
    this.lastTension = t;
    const now = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(0.085 * (1 - clamp01((t - 15) / 45)), now, 0.8);
    this.amb.gain.setTargetAtTime(0.05 * (1 - 0.6 * clamp01((t - 35) / 60)), now, 0.8);
    this.drone.gain.setTargetAtTime(0.11 * clamp01((t - 18) / 45), now, 0.8);
    this.chaos.gain.setTargetAtTime(0.1 * clamp01((t - 55) / 35), now, 0.8);
    this.updateMurmur();
  }

  /** How many villagers are still around (0..1): a dwindling town gets quieter. */
  setCrowd(fraction) {
    this.crowd = fraction;
    this.updateMurmur();
  }

  updateMurmur() {
    if (!this.ctx) return;
    const angry = clamp01((this.lastTension - 30) / 50);
    // a calm crowd chatters; an angry one is louder and lower, a muttering roar
    this.murmur.gain.setTargetAtTime(0.045 * this.crowd * (1 + angry * 0.9) * (1 - angry * 0.3), this.ctx.currentTime, 1.2);
    this.talkBand.frequency.setTargetAtTime(520 - angry * 230, this.ctx.currentTime, 1.2);
  }

  nextChord() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.chord = (this.chord + 1) % CHORDS.length;
    if (this.lastTension > 55) return; // no cosy pads in the middle of a massacre
    const t = this.ctx.currentTime;
    for (const [i, f] of CHORDS[this.chord].entries()) {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004); // a touch of drift
      const g = this.ctx.createGain();
      const peak = i === 0 ? 0.5 : 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 1.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 7.4);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 7.6);
    }
  }

  playNote() {
    if (!this.ctx || this.ctx.state !== 'running' || this.lastTension > 50 || Math.random() < 0.35) return;
    const chord = CHORDS[this.chord];
    const f = chord[1 + Math.floor(Math.random() * (chord.length - 1))] * (Math.random() < 0.5 ? 2 : 1);
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 1.6);
  }

  chirp() {
    if (!this.ctx || this.ctx.state !== 'running' || this.lastTension > 40 || Math.random() < 0.45) return;
    const x = rand(0, WORLD_WIDTH);
    const species = Math.floor(Math.random() * 3);
    const save = this.dest;
    this.dest = this.bus(x, 0.3);
    const base = rand(2200, 3600);
    if (species === 0) { // two-note whistle
      this.tone(base, base * 1.4, 0.07, 'sine', 0.03);
      this.tone(base * 1.2, base * 0.9, 0.08, 'sine', 0.025, 0.1);
    } else if (species === 1) { // quick trill
      for (let i = 0; i < 4; i++) this.tone(base * (1 + (i % 2) * 0.25), base * (1.1 + (i % 2) * 0.2), 0.04, 'sine', 0.022, i * 0.06);
    } else { // falling tweet
      this.tone(base * 1.5, base * 0.8, 0.16, 'sine', 0.03);
    }
    this.dest = save;
  }

  /** When the town is angry, villagers shout in the distance. */
  crowdShout() {
    if (!this.ctx || this.ctx.state !== 'running' || this.lastTension < 38) return;
    if (Math.random() < 0.75 - (this.lastTension - 38) / 100) return;
    this.play(Math.random() < 0.6 ? 'shout' : 'growl', rand(0, WORLD_WIDTH));
  }

  /** A low heartbeat that creeps in when the town is close to chaos. */
  heartbeat() {
    if (!this.ctx || this.ctx.state !== 'running' || this.lastTension < 60) return;
    const strength = clamp01((this.lastTension - 60) / 40);
    const save = this.dest;
    this.dest = this.sfx;
    this.tone(72, 38, 0.16, 'sine', 0.22 * strength);
    this.tone(66, 36, 0.18, 'sine', 0.16 * strength, 0.2);
    this.dest = save;
  }

  // ---- one-shot primitives (output goes to this.dest) -----------------------------

  tone(f0, f1, dur, type = 'sine', gain = 0.1, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  burst(dur, filterType, f0, f1, gain, delay = 0, q = 1) {
    const t = this.ctx.currentTime + delay;
    const src = this.noiseSource(false);
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.dest);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  /** A bell: a sine carrier with a decaying FM overtone. */
  bell(f, dur, gain, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    carrier.frequency.value = f;
    mod.frequency.value = f * 3.5;
    modGain.gain.setValueAtTime(f * 1.4, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + dur * 0.8);
    mod.connect(modGain).connect(carrier.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    carrier.connect(g).connect(this.dest);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  /** Throat-ish voice: a saw through two formant filters with vibrato. */
  voiceShape(f0, f1, dur, gain, delay = 0, kind = 'ah') {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 6.5;
    const vibDepth = this.ctx.createGain();
    vibDepth.gain.value = f0 * 0.03;
    vib.connect(vibDepth).connect(o.frequency);
    const formants = kind === 'ee' ? [300, 2300] : [750, 1200];
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const fc of formants) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fc;
      bp.Q.value = 6;
      o.connect(bp).connect(g);
    }
    g.connect(this.dest);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  /** Real recordings (public/sfx). Each file loads in the background; until then the synthesised sound plays. */
  loadSamples() {
    for (const f of SAMPLE_FILES) {
      fetch(`sfx/${f}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(f))))
        .then((b) => this.ctx.decodeAudioData(b))
        .then((buf) => { this.samples[f.replace(/.(ogg|wav)$/, '')] = buf; })
        .catch(() => { /* missing file: the synth stays as the fallback */ });
    }
  }

  /** Play one of the named recordings (picked at random from the list). Returns false when none has loaded. */
  sample(names, gain = 0.6, rate = 1, jitter = 0.07) {
    const ready = names.filter((n) => this.samples?.[n]);
    if (!ready.length) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = this.samples[ready[Math.floor(Math.random() * ready.length)]];
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 2 * jitter);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.dest);
    src.start();
    return true;
  }

  /** @param {string} name @param {number} [x] world x, for stereo position */
  play(name, x) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const sound = SOUNDS[name];
    if (!sound) return;
    const now = performance.now();
    if (now - (this.lastPlayed[name] ?? 0) < (sound.gap ?? 60)) return; // brawls would otherwise be a wall of noise
    this.lastPlayed[name] = now;
    const save = this.dest;
    this.dest = this.bus(x, sound.wet ?? 0.18);
    sound.play(this);
    this.dest = save;
  }

  /**
   * Cartoon voice blips for a speech bubble: a run of short notes at the villager's own pitch,
   * higher when happy, lower and rougher when angry, wobbling when scared.
   */
  voice(id, length, expression, x) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (now - this.lastVoice < 140) return;
    this.lastVoice = now;
    const base = 200 + ((id * 37) % 190);
    const mood = { happy: 1.15, love: 1.2, angry: 0.78, scared: 1.45, sad: 0.88, suspicious: 0.95 }[expression] ?? 1;
    const syllables = Math.max(2, Math.min(9, Math.round(length / 3.2)));
    const save = this.dest;
    this.dest = this.bus(x, 0.08);
    for (let i = 0; i < syllables; i++) {
      const f = base * mood * rand(0.85, 1.4);
      const type = expression === 'angry' ? 'sawtooth' : 'triangle';
      const t = this.ctx.currentTime + i * 0.072;
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (expression === 'scared' ? 1.25 : 0.93), t + 0.055);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(lp).connect(g).connect(this.dest);
      o.start(t);
      o.stop(t + 0.07);
    }
    this.dest = save;
  }
}

const SAMPLE_FILES = [
  ...['impactPunch_heavy', 'impactPunch_medium', 'impactWood_heavy', 'impactWood_medium', 'impactMetal_medium', 'impactPlate_heavy', 'impactSoft_heavy', 'impactSoft_medium', 'impactGeneric_light']
    .flatMap((n) => [0, 1, 2].map((i) => `${n}_${i}.ogg`)),
  ...['01', '03', '05', '07'].map((i) => `thwack-${i}.wav`),
  'gun-cz.wav', 'gun-sks.wav', 'gun-shotty.wav',
];
const pick = (base) => [0, 1, 2].map((i) => `${base}_${i}`);

const pitchJitter = () => rand(0.92, 1.08); // so repeated hits never sound identical

// Hits are built the way real impacts sound: a low body thump (the mass), a short filtered
// noise "slap" (skin, cloth, wood or steel meeting), and a quiet high crack for the attack.
const SOUNDS = {
  squeak: { gap: 120, play: (m) => { const f = rand(800, 1300); m.tone(f, f * 1.6, 0.09, 'sine', 0.05); } },
  pop: { gap: 150, play: (m) => { m.tone(420, 140, 0.1, 'sine', 0.12); m.bell(1200, 0.2, 0.02); } },
  // fist or open hand on a body: dull thump, soft flesh noise, a little grunt of breath
  slap: {
    play: (m) => {
      const p = pitchJitter();
      if (m.sample([...pick('impactPunch_heavy'), ...pick('impactPunch_medium'), ...pick('impactSoft_medium')], 0.8)) { m.tone(110 * p, 45, 0.14, 'sine', 0.18); return; }
      m.tone(120 * p, 45, 0.16, 'sine', 0.42);
      m.burst(0.07, 'lowpass', 1800 * p, 350, 0.34);
      m.burst(0.025, 'bandpass', 2600, 1800, 0.12, 0, 1.4);
      m.burst(0.16, 'bandpass', 700 * p, 400, 0.05, 0.03, 1.2);
    },
  },
  // a bat: woody crack over a heavy thump
  thwack: {
    play: (m) => {
      const p = pitchJitter();
      if (m.sample([...pick('impactWood_heavy'), ...pick('impactWood_medium'), 'thwack-01', 'thwack-03', 'thwack-05', 'thwack-07'], 0.85)) { m.tone(100 * p, 40, 0.18, 'sine', 0.2); return; }
      m.tone(900 * p, 260, 0.05, 'triangle', 0.16);
      m.burst(0.05, 'highpass', 2200, 1200, 0.22);
      m.tone(105 * p, 40, 0.22, 'sine', 0.45);
      m.burst(0.12, 'lowpass', 900 * p, 160, 0.3, 0.01);
    },
  },
  // a frying pan: a flat metal "bonk" with a short ring
  clang: {
    wet: 0.3,
    play: (m) => {
      const p = pitchJitter();
      if (m.sample([...pick('impactMetal_medium'), ...pick('impactPlate_heavy')], 0.8)) return;
      [430, 817, 1290, 1860, 2610].forEach((f, i) => m.tone(f * p, f * p * 0.99, 0.55 - i * 0.08, 'sine', 0.1 / (i + 1)));
      m.tone(110, 60, 0.12, 'sine', 0.3);
      m.burst(0.02, 'highpass', 4500, 3500, 0.16);
    },
  },
  // a knife: a wet slice (noise sweeping up) and a dull thud
  stab: {
    play: (m) => {
      const p = pitchJitter();
      if (m.sample(pick('impactGeneric_light'), 0.7, 1.15)) { m.burst(0.12, 'bandpass', 900 * p, 3200, 0.12, 0, 2); return; }
      m.burst(0.12, 'bandpass', 900 * p, 3200, 0.2, 0, 2);
      m.burst(0.05, 'lowpass', 1200, 300, 0.22, 0.04);
      m.tone(140 * p, 55, 0.12, 'sine', 0.26, 0.03);
    },
  },
  // pistol: a sharp crack, a boom, and a long reverberant tail from the town's walls
  gunshot: {
    gap: 100, wet: 0.55,
    play: (m) => {
      if (m.sample(['gun-cz', 'gun-sks'], 0.9, 1, 0.04)) return;
      m.burst(0.012, 'highpass', 3000, 2500, 0.8);
      m.burst(0.05, 'bandpass', 2400, 900, 0.55, 0, 0.7);
      m.tone(150, 42, 0.28, 'sine', 0.5);
      m.burst(0.5, 'lowpass', 1400, 90, 0.38, 0.01);
      m.burst(0.6, 'bandpass', 500, 250, 0.1, 0.06, 0.5);
    },
  },
  shotgun: {
    gap: 150, wet: 0.7,
    play: (m) => {
      if (m.sample(['gun-shotty'], 1, 1, 0.04)) return;
      m.burst(0.02, 'highpass', 2500, 2000, 0.9);
      m.burst(0.1, 'bandpass', 1800, 500, 0.7, 0, 0.6);
      m.tone(100, 28, 0.55, 'sine', 0.7);
      m.burst(0.7, 'lowpass', 1600, 70, 0.7, 0.01);
      m.burst(0.02, 'highpass', 3500, 3000, 0.25, 0.55); // pump action: clack-clack
      m.tone(900, 700, 0.02, 'square', 0.05, 0.55);
      m.burst(0.02, 'highpass', 3000, 2500, 0.2, 0.64);
      m.tone(700, 500, 0.02, 'square', 0.05, 0.64);
    },
  },
  // a big blast: a deep boom, a crackling debris rumble and a long shockwave tail
  explosion: {
    gap: 150, wet: 0.7,
    play: (m) => {
      m.sample(['gun-shotty'], 0.7, 0.45, 0.03); // a shotgun blast slowed right down is a deep boom
      m.tone(80, 22, 0.9, 'sine', 0.9);
      m.burst(0.12, 'lowpass', 4000, 400, 0.9);
      m.burst(1.4, 'lowpass', 1100, 60, 0.7, 0.02);
      m.burst(0.9, 'bandpass', 2600, 500, 0.12, 0.1, 0.6);
      for (let i = 0; i < 6; i++) m.burst(0.04, 'highpass', 3000 + i * 200, 1500, 0.1, 0.25 + i * 0.12 + Math.random() * 0.05); // falling debris
    },
  },
  // a shove: cloth and a soft thump, with a little "oof"
  shove: { gap: 80, play: (m) => { const p = pitchJitter(); m.burst(0.09, 'lowpass', 900 * p, 250, 0.28); m.tone(130 * p, 55, 0.14, 'sine', 0.3); m.voiceShape(300 * p, 200 * p, 0.12, 0.03, 0.02, 'ah'); } },
  splash: { gap: 300, wet: 0.4, play: (m) => { m.burst(0.4, 'bandpass', 1800, 500, 0.3, 0, 0.8); m.burst(0.2, 'highpass', 3000, 1500, 0.12, 0.05); m.tone(220, 80, 0.25, 'sine', 0.2); } },
  swing: { gap: 90, play: (m) => m.burst(0.16, 'bandpass', 350, 1500, 0.08, 0, 0.9) },
  // a scream with breath: a rising voice, a cracked second note, and a noisy edge
  scream: {
    gap: 200, wet: 0.3,
    play: (m) => {
      const high = Math.random() < 0.5;
      const p = (high ? 1.25 : 0.75) * rand(0.9, 1.1);
      m.voiceShape(470 * p, 980 * p, 0.22, 0.06, 0, 'ee');
      m.voiceShape(980 * p, 700 * p, 0.34, 0.06, 0.2, 'ah');
      m.voiceShape(720 * p, 420 * p, 0.25, 0.04, 0.52, 'ah');
      m.burst(0.6, 'bandpass', 2200 * p, 1400, 0.035, 0.05, 1.5);
    },
  },
  // a death: the body dropping, a last short cry
  thud: { gap: 80, play: (m) => { if (m.sample(pick('impactSoft_heavy'), 0.85, 0.8)) return; m.tone(85, 28, 0.4, 'sine', 0.5); m.burst(0.18, 'lowpass', 400, 80, 0.25); m.burst(0.05, 'bandpass', 1500, 600, 0.06, 0.02); } },
  // a low angry growl when a villager starts to scowl at an enemy
  growl: {
    gap: 260, wet: 0.15,
    play: (m) => {
      const p = rand(0.85, 1.25);
      const t = m.ctx.currentTime;
      const o = m.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(95 * p, t);
      o.frequency.exponentialRampToValueAtTime(70 * p, t + 0.7);
      const trem = m.ctx.createOscillator();
      trem.frequency.value = 26;
      const td = m.ctx.createGain();
      td.gain.value = 0.5;
      const g = m.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      trem.connect(td).connect(g.gain);
      for (const fc of [480, 900]) {
        const bp = m.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = fc * p;
        bp.Q.value = 4;
        o.connect(bp).connect(g);
      }
      g.connect(m.dest);
      o.start(t); trem.start(t);
      o.stop(t + 0.8); trem.stop(t + 0.8);
      m.burst(0.6, 'bandpass', 600, 400, 0.04, 0.05, 1);
    },
  },
  // someone yelling in the distance: a short angry shout
  shout: {
    gap: 500, wet: 0.5,
    play: (m) => {
      const p = rand(0.8, 1.3);
      m.voiceShape(260 * p, 330 * p, 0.2, 0.05, 0, 'ah');
      m.voiceShape(330 * p, 210 * p, 0.3, 0.05, 0.18, 'ah');
    },
  },
  jingle: { gap: 800, wet: 0.35, play: (m) => { [523, 659, 784, 1046].forEach((f, i) => m.bell(f, i === 3 ? 0.9 : 0.4, 0.07, i * 0.13)); } },
  bond: { gap: 400, wet: 0.35, play: (m) => { m.bell(784, 0.6, 0.05); m.bell(1175, 0.8, 0.05, 0.12); } },
  shutter: { gap: 300, play: (m) => { m.burst(0.025, 'highpass', 5000, 3500, 0.22); m.tone(1700, 800, 0.04, 'square', 0.05); m.burst(0.03, 'highpass', 4000, 2500, 0.16, 0.07); } },
  warp: { gap: 2000, wet: 0.5, play: (m) => { m.tone(420, 50, 1.6, 'sawtooth', 0.12); m.tone(425, 55, 1.6, 'square', 0.04); m.burst(1.4, 'bandpass', 300, 2500, 0.05); } },
};
