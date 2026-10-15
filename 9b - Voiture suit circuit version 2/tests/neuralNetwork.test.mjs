import test from 'node:test';
import assert from 'node:assert/strict';
import { load, seededRandom, seededGaussian, plain } from './helpers.mjs';

const { get } = load();
const NeuralNetwork = get('NeuralNetwork');
const Settings = get('Settings');

test('architecture par défaut identique à l\'originale : [6, 20, 2]', () => {
  const sizes = Settings.networkSizes(Settings.defaults());
  assert.deepEqual(plain(sizes), [6, 20, 2]);
  const nn = new NeuralNetwork(sizes);
  assert.equal(nn.input_nodes, 6);
  assert.equal(nn.hidden_nodes, 20);
  assert.equal(nn.output_nodes, 2);
  // 6×20 + 20 + 20×2 + 2 = 182 paramètres, comme les deux couches dense de TensorFlow.js
  assert.equal(nn.paramCount(), 182);
  // L'ancienne forme du constructeur donne la même architecture
  assert.deepEqual(plain(new NeuralNetwork(6, 20, 2).sizes), [6, 20, 2]);
});

test('tailles de couches et nombre de paramètres pour plusieurs architectures', () => {
  const cases = [
    [[6, 1, 2], 6 * 1 + 1 + 1 * 2 + 2],
    [[6, 16, 8, 3], 6 * 16 + 16 + 16 * 8 + 8 + 8 * 3 + 3],
    [[6, 64, 64, 64, 64, 64, 3], 6 * 64 + 64 + 4 * (64 * 64 + 64) + 64 * 3 + 3],
  ];
  for (const [sizes, count] of cases) {
    const nn = new NeuralNetwork(sizes, seededRandom(1));
    assert.deepEqual(plain(nn.sizes), sizes);
    assert.equal(nn.weights.length, sizes.length - 1);
    nn.weights.forEach((w, l) => assert.equal(w.length, sizes[l] * sizes[l + 1]));
    nn.biases.forEach((b, l) => assert.equal(b.length, sizes[l + 1]));
    assert.equal(nn.paramCount(), count);
    assert.equal(nn.activations.length, sizes.length);
  }
});

test('tailles invalides refusées', () => {
  for (const sizes of [[6, 2], [6, 0, 2], [6, 2.5, 2], [6, -1, 2], 'abc']) {
    assert.throws(() => new NeuralNetwork(sizes), { name: 'RangeError' });
  }
});

test('initialisation Glorot uniforme et biais nuls (comme une couche dense TensorFlow.js)', () => {
  const nn = new NeuralNetwork([6, 20, 2], seededRandom(7));
  const limit0 = Math.sqrt(6 / 26), limit1 = Math.sqrt(6 / 22);
  assert.ok(nn.weights[0].every(w => Math.abs(w) <= limit0 + 1e-6));
  assert.ok(nn.weights[1].every(w => Math.abs(w) <= limit1 + 1e-6));
  assert.ok(nn.biases.every(b => b.every(v => v === 0)));
  // Même graine ⇒ mêmes poids
  assert.deepEqual(Array.from(new NeuralNetwork([6, 20, 2], seededRandom(7)).weights[0]), Array.from(nn.weights[0]));
});

test('predict : sorties dans [0, 1], même avec des entrées extrêmes, et activations gardées', () => {
  const nn = new NeuralNetwork([6, 12, 7, 3], seededRandom(3));
  for (const inputs of [[0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1], [1e6, -1e6, 50, -50, 0, 1]]) {
    const out = nn.predict(inputs);
    assert.equal(out.length, 3);
    for (const v of out) assert.ok(v >= 0 && v <= 1 && Number.isFinite(v));
    assert.deepEqual(Array.from(nn.activations[0]), inputs.map(Math.fround));
    nn.activations.slice(1).forEach(a => a.forEach(v => assert.ok(v >= 0 && v <= 1)));
  }
  assert.throws(() => nn.predict([1, 2, 3]), { name: 'RangeError' });
});

test('predict : calcul exact sur un petit réseau', () => {
  const nn = new NeuralNetwork([2, 1, 1], () => 0.5);
  nn.weights[0].set([1, -2]);
  nn.biases[0].set([0.5]);
  nn.weights[1].set([3]);
  nn.biases[1].set([-1]);
  const sig = x => 1 / (1 + Math.exp(-x));
  const h = sig(1 * 0.4 - 2 * 0.1 + 0.5);
  assert.ok(Math.abs(nn.predict([0.4, 0.1])[0] - sig(3 * h - 1)) < 1e-6);
});

test('copy est indépendante ; mutate ne change que la copie', () => {
  const nn = new NeuralNetwork([6, 8, 8, 2], seededRandom(11));
  const before = nn.toJSON();
  const copy = nn.copy();
  assert.deepEqual(plain(copy.toJSON()), plain(before));
  const rng = seededRandom(5);
  copy.mutate(1, rng, seededGaussian(rng));
  assert.deepEqual(nn.toJSON(), before, 'l\'original est intact');
  assert.notDeepEqual(plain(copy.toJSON()), plain(before), 'la copie a muté');
  // La sortie de la copie ne modifie pas les activations de l'original
  nn.predict([1, 0, 0, 0, 0, 0]);
  const a = Array.from(nn.activations[1]);
  copy.predict([0, 1, 1, 1, 1, 1]);
  assert.deepEqual(Array.from(nn.activations[1]), a);
});

test('mutate : taux 0 ne change rien, bruit d\'écart-type 0.1 sur poids et biais', () => {
  const nn = new NeuralNetwork([6, 20, 2], seededRandom(2));
  const before = nn.toJSON();
  nn.mutate(0, seededRandom(1));
  assert.deepEqual(plain(nn.toJSON()), plain(before));

  // Taux 1 avec un bruit gaussien constant de 1 ⇒ chaque paramètre gagne exactement 0.1
  nn.mutate(1, () => 0, () => 1);
  const after = nn.toJSON();
  after.weights.forEach((w, l) => w.forEach((v, k) => assert.ok(Math.abs(v - before.weights[l][k] - 0.1) < 1e-6)));
  after.biases.forEach(b => b.forEach(v => assert.ok(Math.abs(v - 0.1) < 1e-6)));

  // Taux 0.5 : environ la moitié des paramètres changent (aléatoire fixé)
  const nn2 = new NeuralNetwork([6, 20, 2], seededRandom(2));
  const rng = seededRandom(9);
  nn2.mutate(0.5, rng, seededGaussian(rng));
  let changed = 0;
  nn2.weights.forEach((w, l) => w.forEach((v, k) => { if (v !== before.weights[l][k]) changed++; }));
  assert.ok(changed > 60 && changed < 100, 'changés : ' + changed);
});

test('toJSON / fromJSON : aller-retour et rejet des données incohérentes', () => {
  const nn = new NeuralNetwork([6, 5, 4, 3], seededRandom(4));
  const back = NeuralNetwork.fromJSON(JSON.parse(JSON.stringify(nn.toJSON())));
  const x = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  assert.deepEqual(Array.from(back.predict(x)), Array.from(nn.predict(x)));

  const data = nn.toJSON();
  assert.throws(() => NeuralNetwork.fromJSON(null), { name: 'TypeError' });
  assert.throws(() => NeuralNetwork.fromJSON({ ...data, sizes: [6, 5, 4, 2] }), { name: 'RangeError' });
  assert.throws(() => NeuralNetwork.fromJSON({ ...data, weights: data.weights.slice(1) }), { name: 'RangeError' });
  const bad = JSON.parse(JSON.stringify(data));
  bad.weights[0][3] = 'x';
  assert.throws(() => NeuralNetwork.fromJSON(bad), { name: 'RangeError' });
  const nan = JSON.parse(JSON.stringify(data));
  nan.biases[1][0] = null;
  assert.throws(() => NeuralNetwork.fromJSON(nan), { name: 'RangeError' });
});
