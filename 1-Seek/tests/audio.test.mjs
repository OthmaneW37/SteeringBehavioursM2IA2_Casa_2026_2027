import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const scope = vm.createContext({ Float32Array });
vm.runInContext(readFileSync(new URL('../audio.js', import.meta.url), 'utf8'), scope);
const { PsychedelicAudio, SeekAmbience } = vm.runInContext('({ PsychedelicAudio, SeekAmbience })', scope);

test('mappings : filtre, pitch et FM couvrent leurs plages et suivent la souris', () => {
  const leftTop = SeekAmbience.parameters(0, 0, 0);
  const rightBottom = SeekAmbience.parameters(1, 1, 1);
  assert.equal(leftTop.cutoff, 120);
  assert.ok(Math.abs(rightBottom.cutoff - 8000) < 1e-9);
  assert.equal(leftTop.pitch, 360);
  assert.equal(rightBottom.pitch, 90);
  assert.equal(leftTop.fmRate, 1);
  assert.equal(rightBottom.fmRate, 10);
  assert.equal(rightBottom.fmDepth, 105);
  assert.deepEqual(SeekAmbience.parameters(-10, 5, 30), SeekAmbience.parameters(0, 1, 1));
});

// Contrôle du cycle de vie ; le signal est testé avec Web Audio réel dans audio-browser.html.
function context() {
  const nodes = [];
  const parameter = () => ({ value: 0, cancelScheduledValues() {},
    setValueAtTime(value) { this.value = value; },
    setTargetAtTime(value) { this.value = value; } });
  const create = () => {
    const node = { gain: parameter(), frequency: parameter(), Q: parameter(), links: [],
      connect(to) { this.links.push(to); return to; }, disconnect() { this.links = []; },
      start() { this.started = true; }, stop() { this.stopped = true; },
      getFloatTimeDomainData(data) { data.fill(0.75); } };
    nodes.push(node); return node;
  };
  return { nodes, currentTime: 1, destination: {}, state: 'suspended',
    createGain: create, createOscillator: create, createBiquadFilter: create, createAnalyser: create,
    async resume() { this.state = 'running'; }, async close() { this.state = 'closed'; } };
}

test('arrêt : tout le mix est muet, toutes les sources arrêtées, contexte fermé ; redémarrage isolé', async () => {
  const contexts = [];
  const audio = new PsychedelicAudio(() => { const c = context(); contexts.push(c); return c; });
  assert.equal(contexts.length, 0, 'Pas de contexte avant activation');
  await audio.start();
  await audio.start();
  assert.equal(contexts.length, 1);
  audio.setVolume(0.23);
  assert.equal(audio.master.gain.value, 0.23);
  audio.setVolume(4);
  assert.equal(audio.volume, 1);
  audio.update(1, 0, 1);
  assert.ok(Math.abs(audio.filter.frequency.value - 8000) < 1e-9);
  assert.equal(audio.carrier.frequency.value, 360);
  assert.equal(audio.modulator.frequency.value, 10);
  assert.equal(audio.modulation(), 0.75, 'Couleur pilotée par le vrai signal du modulateur');
  const master = audio.master;
  const sources = [...audio.sources];
  await audio.stop();
  assert.equal(master.gain.value, 0);
  assert.ok(sources.every(s => s.stopped));
  assert.ok(contexts[0].nodes.every(n => n.links.length === 0));
  assert.equal(contexts[0].state, 'closed');
  assert.equal(audio.context, null);
  assert.equal(audio.modulation(), 0);
  await audio.stop();
  await audio.start();
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0].state, 'closed');
  assert.equal(contexts[1].state, 'running');
  await audio.stop();
});
