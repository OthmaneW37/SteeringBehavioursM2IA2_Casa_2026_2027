import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Node {
  constructor() { this.connections = []; this.gain = { value: 1,
    setValueAtTime(value) { this.value = value; },
    setTargetAtTime(value) { this.value = value; }
  }; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() {}
}
class Source extends Node {
  constructor(context) { super(); this.context = context; this.stopTimes = []; this.startTimes = []; this.loop = false; }
  start(time) { this.startTimes.push(time); }
  stop(time) { this.stopTimes.push(time); }
}
class Context {
  constructor() { this.currentTime = 10; this.sources = []; }
  createGain() { return new Node(); }
  createBufferSource() { const source = new Source(this); this.sources.push(source); return source; }
  createOscillator() { const oscillator = new Source(this); oscillator.frequency = {
    setValueAtTime() {}, setTargetAtTime() {}
  }; this.sources.push(oscillator); return oscillator; }
  createBuffer() { return {}; }
  get destination() { return new Node(); }
}

function load() {
  const context = vm.createContext({ WebAudiox: { getBufferFromJsfx: (ctx, lib) => ({ ctx, lib }) } });
  vm.runInContext(readFileSync(new URL('../effectsAudio.js', import.meta.url), 'utf8'), context);
  return vm.runInContext('({ SeekEffectsAudio })', context);
}

test('effets WebAudioX : fuite en boucle, explosion 0,7 s et leurre synthétiques', () => {
  const { SeekEffectsAudio } = load(); const context = new Context(); const audio = new SeekEffectsAudio();
  audio.attach(context);
  audio.setVolume(0.42); assert.equal(audio.master.gain.value, 0.42);
  const target = {};
  audio.startFlee(target);
  assert.equal(context.sources.length, 2); assert.equal(context.sources[0].loop, true);
  audio.stopFlee(target); assert.equal(context.sources[0].stopTimes.length, 1);
  audio.playExplosion(); audio.playDecoyRelease();
  assert.deepEqual(context.sources[2].stopTimes, [10.7]);
  assert.deepEqual(context.sources[3].stopTimes, [10.18]);
});

test('alarme : durée 0,4 s et blocage des répétitions pendant 1 s par cible', () => {
  const { SeekEffectsAudio } = load(); const context = new Context(); const audio = new SeekEffectsAudio();
  audio.attach(context); const target = {};
  audio.playAlarm(target); audio.playAlarm(target);
  assert.equal(context.sources.length, 1); assert.deepEqual(context.sources[0].stopTimes, [10.4]);
  context.currentTime = 11.01; audio.playAlarm(target);
  assert.equal(context.sources.length, 2);
});

test('activation pendant une fuite : sources parallèles, arrêt et reprise sans transition perdue', () => {
  const { SeekEffectsAudio } = load(); const context = new Context(); const audio = new SeekEffectsAudio();
  const first = { state: 'fleeing', detected: true, elapsedFleeMs: 500, maxFleeDuration: 2.5 };
  const second = { ...first };
  audio.synchronizeTargets([first, second]);
  assert.equal(context.sources.length, 0);
  audio.attach(context); audio.synchronizeTargets([first, second]);
  assert.equal(audio.fleeSources.size, 2);
  assert.equal(context.sources.length, 6, 'Deux sweeps, deux boucles et deux alarmes');
  audio.synchronizeTargets([first, second]);
  assert.equal(context.sources.length, 6, 'Pas de source ajoutée à chaque image');
  first.state = 'exhausted'; audio.synchronizeTargets([first, second]);
  assert.equal(audio.fleeSources.size, 1);
  audio.synchronizeTargets([]); assert.equal(audio.fleeSources.size, 0);
  audio.detach(); audio.attach(context); audio.synchronizeTargets([second]);
  assert.equal(audio.fleeSources.size, 1);
});

test('vrais buffers WebAudioX/jsfx : signal non silencieux pour chaque effet', () => {
  const scope = vm.createContext({ window: {}, console, Float32Array });
  for (const file of ['libraries/audio.js', 'libraries/jsfx.js', 'libraries/jsfxlib.js',
    'libraries/webaudiox.js', 'effectsAudio.js']) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), scope);
  }
  const Audio = vm.runInContext('SeekEffectsAudio', scope);
  const context = new Context();
  context.createBuffer = (channels, length, sampleRate) => {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => data };
  };
  const audio = new Audio(); audio.attach(context);
  for (const [name, buffer] of audio.buffers) {
    const samples = buffer.getChannelData(0);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    assert.ok(Number.isFinite(rms) && rms > 0.01, `${name} : RMS ${rms}`);
  }
});
