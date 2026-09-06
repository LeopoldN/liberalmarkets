import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { TradeWindsAudio, SOUNDTRACK, stormAudioLevel } from '../trade-winds-audio.mjs';
import { toWorld } from '../trade-winds-engine.mjs';

class AudioContextStub {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  sources = [];
  createGain() {
    return { connect() {}, disconnect() {}, gain: {
      value: 0, cancelScheduledValues() {},
      setTargetAtTime(value) { this.value = value; },
    } };
  }
  createDynamicsCompressor() { return this.createGain(); }
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, start() { this.started = true; },
      stop() { this.stopped = true; this.onended?.(); } };
    this.sources.push(source);
    return source;
  }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  async decodeAudioData(buffer) { return { duration: 20, name: buffer }; }
}
const sailing = { started: true, ship: toWorld(-77, 18), speed: 20 };
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  const context = new AudioContextStub(), requested = [], errors = [];
  const audio = new TradeWindsAudio({ createContext: () => context,
    fetchAudio: async url => { requested.push(url); return { ok: true, arrayBuffer: async () => url.pathname }; },
    onError: e => errors.push(e), ...options });
  audio.unlock();
  return { audio, context, requested, errors };
}
async function settle(audio, state) {
  audio.update(.1, state);
  await flush();
  audio.update(10, state);
}
const live = context => context.sources.filter(source => source.started && !source.stopped);

test('only requested sound assets are configured and every path exists', () => {
  assert.equal(Object.keys(SOUNDTRACK).length, 11);
  for (const { file } of Object.values(SOUNDTRACK))
    assert.ok(existsSync(new URL(`../assets/trade-winds/sounds/${file}`, import.meta.url)), file);
});

test('sea music changes region, crossfades, and stays stable in the boundary buffer', async () => {
  const { audio, context } = setup();
  await settle(audio, sailing);
  assert.equal(live(context).filter(s => s.loop).length, 2);
  assert.ok(audio.tracks.get('background').volume > .23);
  const atlantic = { ...sailing, ship: toWorld(-67, 26) };
  audio.update(.1, atlantic); await flush(); audio.update(.1, atlantic);
  assert.ok(audio.tracks.get('background').volume > 0);
  assert.ok(audio.tracks.get('atlantic').volume > 0);
  await settle(audio, atlantic);
  assert.equal(audio.tracks.get('background').source, null);
  audio.update(.1, { ...sailing, ship: toWorld(-70, 20.7) });
  assert.equal(audio.atlantic, true);
  await settle(audio, sailing);
  assert.equal(audio.tracks.get('atlantic').source, null);
});

test('sailing follows motion in either direction and stops when anchored', async () => {
  const { audio } = setup();
  await settle(audio, sailing);
  assert.ok(audio.tracks.get('sailing').source.loop);
  await settle(audio, { ...sailing, speed: 0 });
  assert.equal(audio.tracks.get('sailing').source, null);
  await settle(audio, { ...sailing, speed: -10 });
  assert.ok(audio.tracks.get('sailing').volume > .29);
});

test('market replaces sea audio immediately, plays all four harbor layers, and restores music on departure', async () => {
  const { audio, context } = setup();
  const storm = { ...sailing.ship, radius: 400, age: 10, life: 100 };
  await settle(audio, { ...sailing, storms: [storm] });
  const port = { ...sailing, atPort: true, paused: true };
  audio.update(0, port);
  assert.equal(live(context).length, 0, 'sea sources stop before harbor decoding');
  await settle(audio, port);
  assert.equal(live(context).length, 4);
  for (const name of ['harbor', 'voices', 'seagulls', 'cough'])
    assert.ok(audio.tracks.get(name).source.loop);
  // Relative mean recording levels in dB, plus the configured linear gain.
  const db = (name, recorded) => recorded + 20 * Math.log10(SOUNDTRACK[name].gain);
  assert.ok(db('cough', -39.1) > db('harbor', -35));
  assert.ok(db('harbor', -35) > db('voices', -32.4));
  assert.ok(db('voices', -32.4) > db('seagulls', -44.1));
  await settle(audio, sailing);
  assert.equal(audio.tracks.get('cough').source, null);
  assert.ok(audio.tracks.get('background').source);
});

test('storm proximity follows the elliptical cloud footprint, lifecycle, and strongest overlap', () => {
  const storm = { x: 0, z: 0, radius: 400, age: 10, life: 100 };
  const level = x => stormAudioLevel({ x, z: 0 }, [storm]);
  assert.equal(level(800), 0);
  assert.ok(level(550) > 0, 'audible before entering the rain');
  assert.ok(level(400) > level(550));
  assert.ok(level(200) > level(400));
  assert.equal(level(0), 1);
  assert.equal(stormAudioLevel({ x: 0, z: 0 }, [storm, storm]), 1);
  assert.equal(stormAudioLevel({ x: 0, z: 550 * .78 }, [storm]), level(550));
  assert.equal(stormAudioLevel({ x: 0, z: 0 }, [{ ...storm, age: 0 }]), 0);
  assert.equal(stormAudioLevel({ x: 0, z: 0 }, [{ ...storm, age: 100 }]), 0);
});

test('coin choices cover all three recordings and effects stop with hidden tabs or pauses', async () => {
  let random = 0;
  const { audio, context } = setup({ random: () => random });
  await settle(audio, { ...sailing, atPort: true, paused: true });
  for (random of [0, .4, .99]) audio.playCoin();
  assert.deepEqual(live(context).filter(s => !s.loop).map(s => s.buffer.name.split('/').at(-1)),
    ['coin1.mp3', 'coin2.mp3', 'coin3.mp3']);
  audio.update(0, { ...sailing, atPort: true, paused: true, hidden: true });
  assert.equal(live(context).length, 0);
  audio.playCoin();
  assert.equal(live(context).length, 0);
  await settle(audio, sailing);
  audio.update(0, { ...sailing, paused: true });
  assert.equal(live(context).length, 0);
  await settle(audio, sailing);
  audio.dispose();
  assert.equal(live(context).length, 0);
  assert.equal(context.state, 'closed');
});

test('late loads cannot start audio in a hidden tab and failures do not retry every frame', async () => {
  const { audio, context } = setup();
  audio.update(.1, sailing);
  audio.update(0, { ...sailing, hidden: true });
  await flush();
  assert.equal(live(context).length, 0);
  let requests = 0;
  const failed = setup({ fetchAudio: async () => { requests++; return { ok: false }; } });
  await settle(failed.audio, sailing);
  for (let i = 0; i < 100; i++) failed.audio.update(.1, sailing);
  assert.equal(requests, 5);
  assert.equal(failed.errors.length, 5);
  assert.equal(live(failed.context).length, 0);
});
