import { atlanticWeight } from './trade-winds-ocean.mjs?v=whirlpool-1';

// All sound selection, mixing and playback stays here, outside the scene engine.
// Harbor gains account for the supplied recordings: the cough peaks 7 dB below
// the main ambience, and the voices are louder than either on average.
export const SOUNDTRACK = Object.freeze({
  background: { file: 'backgroundmusic.wav', gain: .24 },
  atlantic: { file: 'atlanticmusic.wav', gain: .24 },
  sailing: { file: 'boat_sailing_loop.mp3', gain: .3 },
  harbor: { file: 'trade_post_main_background.mp3', gain: 1.2 },
  voices: { file: 'trade_post_voices_quiet.mp3', gain: .5 },
  seagulls: { file: 'trade_post_seagulls_quiet.mp3', gain: .6 },
  cough: { file: 'merchant_cough.mp3', gain: 4 },
  storm: { file: 'storm.mp3', gain: .65 },
  coin1: { file: 'coin1.mp3', gain: .65 },
  coin2: { file: 'coin2.mp3', gain: .65 },
  coin3: { file: 'coin3.mp3', gain: .65 },
});
const LOOPS = ['background', 'atlantic', 'sailing', 'harbor', 'voices', 'seagulls', 'cough', 'storm'];
const SEA = ['background', 'atlantic', 'sailing', 'storm'];
const HARBOR = ['harbor', 'voices', 'seagulls', 'cough'];
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };

// Audible before reaching the rain footprint; overlapping clouds never stack.
export function stormAudioLevel(ship, storms = []) {
  return storms.reduce((loudest, storm) => {
    const distance = Math.hypot((ship.x - storm.x) / storm.radius,
      (ship.z - storm.z) / (storm.radius * .78));
    const presence = smooth(storm.age / 4) * smooth((storm.life - storm.age) / 8);
    return Math.max(loudest, (1 - smooth((distance - .45) / 1.25)) * presence);
  }, 0);
}

export class TradeWindsAudio {
  constructor({ createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(),
    fetchAudio = url => fetch(url), random = Math.random,
    onError = error => console.warn('Trade Winds audio:', error) } = {}) {
    Object.assign(this, { createContext, fetchAudio, random, onError });
    this.context = null;
    this.buffers = new Map();
    this.tracks = new Map();
    this.effects = new Set();
    this.atPort = false;
    this.atlantic = false;
    this.audible = false;
    this.disposed = false;
  }

  // Called synchronously from a click/key gesture, including Set Sail. Decoding
  // may finish later; Web Audio can then start loops without another gesture.
  unlock() {
    if (this.disposed) return;
    try {
      if (!this.context) {
        this.context = this.createContext();
        const compressor = this.context.createDynamicsCompressor();
        this.master = this.context.createGain();
        this.master.gain.value = .8;
        compressor.connect(this.master);
        this.master.connect(this.context.destination);
        this.output = compressor;
        for (const name of LOOPS) {
          const gain = this.context.createGain();
          gain.gain.value = 0;
          gain.connect(this.output);
          this.tracks.set(name, { gain, source: null, volume: 0, offset: 0 });
        }
        for (const name of ['coin1', 'coin2', 'coin3']) this.load(name);
      }
      if (this.context.state !== 'running') this.context.resume().catch(this.onError);
    } catch (error) {
      // Unsupported or blocked audio must never prevent a voyage or transaction.
      this.onError(error);
    }
  }

  load(name) {
    if (!this.buffers.has(name)) {
      const entry = { buffer: null, ready: null };
      this.buffers.set(name, entry);
      entry.ready = (async () => {
        try {
          const response = await this.fetchAudio(new URL(`./assets/trade-winds/sounds/${SOUNDTRACK[name].file}`, import.meta.url));
          if (!response.ok) throw new Error(`Could not load ${SOUNDTRACK[name].file}`);
          entry.buffer = await this.context.decodeAudioData(await response.arrayBuffer());
        } catch (error) { this.onError(error); }
        return entry.buffer;
      })();
    }
    return this.buffers.get(name);
  }

  halt(name, reset = false) {
    const track = this.tracks.get(name);
    if (!track) return;
    if (track.source) {
      track.offset = (track.offset + this.context.currentTime - track.startedAt) % track.source.buffer.duration;
      track.source.stop();
      track.source.disconnect();
      track.source = null;
    }
    if (reset) track.offset = 0;
    track.volume = 0;
    track.gain.gain.cancelScheduledValues(this.context.currentTime);
    track.gain.gain.value = 0;
  }

  stopEffects() {
    for (const source of this.effects) source.stop();
    this.effects.clear();
  }

  stop() {
    this.audible = false;
    for (const name of LOOPS) this.halt(name);
    this.stopEffects();
  }

  update(dt, { started = false, hidden = false, paused = false, atPort = false,
    ship, speed = 0, storms = [] } = {}) {
    if (!this.context || this.disposed) return;
    this.audible = started && !hidden && (!paused || atPort);
    if (!this.audible || !ship) { this.stop(); return; }
    if (atPort !== this.atPort) {
      // The merchant replaces every sea layer immediately upon arrival.
      for (const name of atPort ? SEA : HARBOR) this.halt(name, atPort ? false : true);
      this.stopEffects();
      this.atPort = atPort;
    }
    const weight = atlanticWeight(ship.x, ship.z);
    if (weight > .55) this.atlantic = true;
    else if (weight < .45) this.atlantic = false;
    const levels = {};
    if (atPort) {
      for (const name of HARBOR) levels[name] = SOUNDTRACK[name].gain;
    } else {
      const music = this.atlantic ? 'atlantic' : 'background';
      levels[music] = SOUNDTRACK[music].gain;
      levels.sailing = SOUNDTRACK.sailing.gain * smooth((Math.abs(speed) - .15) / 4);
      levels.storm = SOUNDTRACK.storm.gain * stormAudioLevel(ship, storms);
    }
    for (const name of LOOPS) {
      const track = this.tracks.get(name);
      const target = levels[name] || 0;
      if (target > 0 && !track.source) {
        const { buffer } = this.load(name);
        if (!buffer || this.context.state !== 'running') continue;
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(track.gain);
        source.start(0, track.offset % buffer.duration);
        track.source = source;
        track.startedAt = this.context.currentTime;
      }
      const fade = name === 'background' || name === 'atlantic' ? .8 : .25;
      track.volume += (target - track.volume) * (1 - Math.exp(-Math.max(0, dt) / fade));
      track.gain.gain.setTargetAtTime(track.volume, this.context.currentTime, .03);
      if (!target && track.volume < .001) this.halt(name);
    }
  }

  playCoin() {
    if (!this.context || !this.audible || this.disposed) return;
    const name = `coin${1 + Math.min(2, Math.floor(this.random() * 3))}`;
    // Never play a delayed transaction sound after leaving the market. Coins
    // preload on the first gesture and are ready by the time the ledger opens.
    const { buffer } = this.load(name);
    if (!buffer || this.context.state !== 'running') return;
    if (this.effects.size >= 4) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = SOUNDTRACK[name].gain;
    source.connect(gain);
    gain.connect(this.output);
    source.onended = () => {
      this.effects.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    this.effects.add(source);
    source.start();
  }

  dispose() {
    this.stop();
    this.disposed = true;
    this.context?.close().catch(this.onError);
    this.buffers.clear();
  }
}
