import test from 'node:test';
import assert from 'node:assert/strict';
import { load, seededRandom, plain } from './helpers.mjs';

const { get } = load();
const ConfigStore = get('ConfigStore');
const Settings = get('Settings');
const NeuralNetwork = get('NeuralNetwork');

// Faux localStorage
function memoryStorage() {
  const data = {};
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
  };
}
// Stockage bloqué par le navigateur : chaque accès lève une erreur
const blockedStorage = {
  getItem() { throw new Error('SecurityError: accès refusé'); },
  setItem() { throw new Error('QuotaExceededError'); },
};
const names = st => plain(ConfigStore.readAll(st).configs.map(c => c.name));
const NOW = new Date('2026-10-15T12:00:00Z');

function custom() {
  const s = plain(Settings.defaults());
  s.hiddenLayers = [16, 8];
  s.brake = true;
  s.populationSize = 80;
  s.mutationRate = 0.05;
  s.lapsPerRun = 2;
  s.termination.stagnation = { enabled: true, value: 40 };
  s.termination.targetLaps = { enabled: true, value: 2 };
  s.circuits = ['ovale', 'epingles', 'goulets'];
  s.carTypes = { mode: 'melange', ids: ['sportive', 'camion'] };
  return s;
}

test('sérialisation : aller-retour complet avec cerveau', () => {
  const s = custom();
  const brain = new NeuralNetwork(Settings.networkSizes(s), seededRandom(3));
  const config = ConfigStore.create('Labo 1', s, brain, NOW);
  assert.equal(config.savedAt, '2026-10-15T12:00:00.000Z');
  const text = ConfigStore.serialize(config);
  const back = ConfigStore.parse(text);
  assert.deepEqual(plain(back), plain(config));
  assert.deepEqual(plain(back.settings), s);
  const restored = ConfigStore.brainOf(back);
  const x = [0.2, 0.4, 0.1, 0.9, 0.5, 0.3, 0.7, 0.6];
  assert.deepEqual(Array.from(restored.predict(x)), Array.from(brain.predict(x)));
});

test('sérialisation : configuration sans cerveau', () => {
  const config = ConfigStore.create('Sans cerveau', plain(Settings.defaults()), null, NOW);
  assert.equal(config.brain, null);
  assert.equal(ConfigStore.brainOf(config), null);
  assert.equal(ConfigStore.parse(ConfigStore.serialize(config)).brain, null);
});

test('import : rejet des valeurs hors plage et des fichiers invalides', () => {
  const good = JSON.parse(ConfigStore.serialize(ConfigStore.create('ok', custom(), null, NOW)));
  const variants = [
    c => { c.settings.populationSize = 5000; },
    c => { c.settings.populationSize = 55; c.settings.mutationRate = 1.5; },
    c => { c.settings.mutationRate = -0.1; },
    c => { c.settings.hiddenLayers = [16, 8, 4, 4, 4, 4]; },     // 6 couches > 5
    c => { c.settings.hiddenLayers = [0]; },                       // 0 neurone
    c => { c.settings.hiddenLayers = [65]; },                      // > 64
    c => { c.settings.hiddenLayers = [12.5]; },                    // pas entier
    c => { c.settings.termination.maxTime.value = 5; },
    c => { c.settings.termination.stagnation.enabled = 'oui'; },
    c => { c.settings.termination.targetLaps = { enabled: true, value: 4 }; }, // > tours par évaluation
    c => { c.settings.circuits = ['circuit-inconnu']; },
    c => { c.settings.circuits = []; },
    c => { c.settings.carTypes = { mode: 'melange', ids: ['fusée'] }; },
    c => { c.settings.carTypes = { mode: 'unique', ids: ['berline', 'camion'] }; },
    c => { c.settings.speedLimit = '6'; },
    c => { c.name = '   '; },
    c => { c.name = 'x'.repeat(61); },
    c => { c.format = 'autre-chose'; },
    c => { c.version = 3; },
    c => { delete c.settings; },
  ];
  for (const [i, change] of variants.entries()) {
    const c = JSON.parse(JSON.stringify(good));
    change(c);
    assert.throws(() => ConfigStore.parse(JSON.stringify(c)), e => e.name === 'RangeError' || e.name === 'TypeError', 'variante ' + i);
  }
  assert.throws(() => ConfigStore.parse('{ pas du json'), { name: 'RangeError', message: /illisible/ });
  assert.throws(() => ConfigStore.parse('[]'), { name: 'TypeError' });
});

test('import : cerveau incompatible avec l\'architecture refusé', () => {
  const s = custom(); // réseau [6, 16, 8, 3]
  const config = JSON.parse(ConfigStore.serialize(ConfigStore.create('a', s, null, NOW)));
  config.brain = new NeuralNetwork([8, 20, 2], seededRandom(1)).toJSON();
  assert.throws(() => ConfigStore.parse(JSON.stringify(config)), { name: 'RangeError', message: /ne correspond pas/ });
  config.brain = { sizes: [6, 16, 8, 3], weights: [[1]], biases: [] };
  assert.throws(() => ConfigStore.parse(JSON.stringify(config)), { name: 'RangeError' });
});

test('stockage : sauver, remplacer, renommer, supprimer', () => {
  const storage = memoryStorage();
  assert.deepEqual(plain(ConfigStore.readAll(storage)), { configs: [], error: null, failed: false });
  const a = ConfigStore.create('A', plain(Settings.defaults()), null, NOW);
  const b = ConfigStore.create('B', custom(), null, NOW);
  assert.equal(ConfigStore.save(storage, a).ok, true);
  assert.equal(ConfigStore.save(storage, b).ok, true);
  assert.deepEqual(names(storage), ['A', 'B']);

  // Même nom : remplacement
  const a2 = ConfigStore.create('A', custom(), null, NOW);
  ConfigStore.save(storage, a2);
  const all = ConfigStore.readAll(storage).configs;
  assert.equal(all.length, 2);
  assert.equal(ConfigStore.find(all, 'A').settings.populationSize, 80);

  assert.equal(ConfigStore.rename(storage, 'A', 'B').ok, false, 'nom déjà pris');
  assert.equal(ConfigStore.rename(storage, 'Z', 'Y').ok, false, 'introuvable');
  assert.throws(() => ConfigStore.rename(storage, 'A', ''), { name: 'RangeError' });
  assert.equal(ConfigStore.rename(storage, 'A', ' Nouveau nom ').ok, true);
  assert.deepEqual(names(storage).sort(), ['B', 'Nouveau nom']);

  assert.equal(ConfigStore.remove(storage, 'B').ok, true);
  assert.equal(ConfigStore.remove(storage, 'B').ok, false);
  assert.deepEqual(names(storage), ['Nouveau nom']);
});

test('stockage : entrées corrompues ignorées, contenu illisible signalé', () => {
  const storage = memoryStorage();
  const good = ConfigStore.create('ok', plain(Settings.defaults()), null, NOW);
  const bad = JSON.parse(JSON.stringify(good));
  bad.name = 'bad';
  bad.settings.populationSize = 9999;
  storage.setItem(ConfigStore.KEY, JSON.stringify([good, bad]));
  const read = ConfigStore.readAll(storage);
  assert.deepEqual(plain(read.configs.map(c => c.name)), ['ok']);
  assert.match(read.error, /1 configuration/);

  storage.setItem(ConfigStore.KEY, '{{{');
  const broken = ConfigStore.readAll(storage);
  assert.equal(broken.configs.length, 0);
  assert.match(broken.error, /corrompu/);
});

test('stockage indisponible : aucune exception, erreurs retournées', () => {
  const config = ConfigStore.create('A', plain(Settings.defaults()), null, NOW);
  for (const storage of [blockedStorage, null]) {
    const read = ConfigStore.readAll(storage);
    assert.equal(read.configs.length, 0);
    assert.equal(read.failed, true);
    assert.ok(read.error.length > 0);
    assert.equal(ConfigStore.save(storage, config).ok, false);
    assert.equal(ConfigStore.rename(storage, 'A', 'B').ok, false);
    assert.equal(ConfigStore.remove(storage, 'A').ok, false);
    assert.equal(ConfigStore.writeAll(storage, []).ok, false);
  }
  // Lecture possible mais écriture refusée (quota)
  const readOnly = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  const res = ConfigStore.save(readOnly, config);
  assert.equal(res.ok, false);
  assert.match(res.error, /Quota/);
});

test('nom de fichier d\'export sans accents ni caractères spéciaux', () => {
  const config = ConfigStore.create('Épingles & chicanes : été', plain(Settings.defaults()), null, NOW);
  assert.equal(ConfigStore.fileName(config), 'config-epingles-chicanes-ete.json');
});
