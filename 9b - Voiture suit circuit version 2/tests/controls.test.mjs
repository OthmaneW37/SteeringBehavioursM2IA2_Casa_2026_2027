import test from 'node:test';
import assert from 'node:assert/strict';
import { load, readHtml, readJs, fakeDocument, plain, FILES } from './helpers.mjs';

const { get } = load();
const Settings = get('Settings');
const Controls = get('Controls');
const NetworkView = get('NetworkView');
const html = readHtml();

test('chaque identifiant utilisé par le JavaScript existe dans index.html', () => {
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const used = new Set(Controls.allIds());
  // Identifiants littéraux de main.js et controls.js (byId('...'), getElementById, parent('...'))
  for (const file of ['main.js', 'controls.js']) {
    for (const m of readJs(file).matchAll(/(?:byId|getElementById|parent|el\(doc,)\s*\(?\s*'([^']+)'\s*\)/g)) used.add(m[1]);
  }
  assert.ok(used.size > 60);
  for (const id of used) assert.ok(htmlIds.has(id), `#${id} manque dans index.html`);
});

test('chaque curseur a les attributs de sa plage dans Settings.PARAMETERS', () => {
  const doc = fakeDocument(html);
  const sliders = Object.values(doc.elements).filter(e => e.tag === 'input' && e.attrs.type === 'range');
  assert.equal(sliders.length, Object.keys(Controls.SLIDERS).length, 'tous les curseurs sont décrits');
  for (const el of sliders) {
    const entry = Controls.SLIDERS[el.id];
    assert.ok(entry, `curseur #${el.id} sans réglage`);
    const p = Settings.PARAMETERS[entry.param];
    assert.equal(Number(el.attrs.min), p.min, `${el.id} min`);
    assert.equal(Number(el.attrs.max), p.max, `${el.id} max`);
    assert.equal(Number(el.attrs.step), p.step, `${el.id} step`);
    assert.equal(Number(el.attrs.value), p.initial, `${el.id} value`);
    // Le texte affiché à côté correspond à la valeur initiale
    const display = new RegExp(`id="${entry.display}">([^<]*)<`).exec(html)[1];
    assert.equal(display, Controls.format(entry.param, p.initial), `${entry.display}`);
  }
});

test('plages : valeurs hors plage refusées par RangeError', () => {
  for (const [name, p] of Object.entries(Settings.PARAMETERS)) {
    assert.equal(Settings.check(name, p.min), p.min);
    assert.equal(Settings.check(name, p.max), p.max);
    assert.equal(Settings.check(name, p.initial), p.initial);
    assert.ok(p.initial >= p.min && p.initial <= p.max);
    for (const bad of [p.min - 1, p.max + 1, NaN, Infinity, '5', undefined]) {
      assert.throws(() => Settings.check(name, bad), { name: 'RangeError' }, `${name} = ${bad}`);
    }
  }
  assert.throws(() => Settings.check('neurons', 12.5), { name: 'RangeError' });
  assert.throws(() => Settings.check('inconnu', 1), { name: 'RangeError' });
});

test('scripts chargés dans l\'ordre des dépendances, main.js en dernier, sans TensorFlow', () => {
  const scripts = [...html.matchAll(/<script src="js\/([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(scripts, FILES.slice(0, 7).concat(['Ray.js', 'Track.js'], FILES.slice(8), ['main.js']));
  assert.ok(!/tfjs/.test(html), 'TensorFlow.js n\'est plus utilisé');
  assert.ok(/p5@1\.9\.0/.test(html));
});

test('réglages par défaut lus depuis le HTML = Settings.defaults() (comportement d\'origine)', () => {
  const doc = fakeDocument(html);
  Controls.init(doc);
  const s = Controls.readSettings(doc);
  assert.deepEqual(plain(s), plain(Settings.defaults()));
  assert.deepEqual(plain(Settings.networkSizes(s)), [6, 20, 2]);
  assert.equal(s.termination.successRate.enabled, true);
  assert.equal(s.termination.successRate.value, 0.6);
});

test('applySettings puis readSettings : aller-retour', () => {
  const doc = fakeDocument(html);
  Controls.init(doc);
  const s = plain(Settings.defaults());
  s.hiddenLayers = [32, 16, 8];
  s.brake = true;
  s.populationSize = 120;
  s.mutationRate = 0.07;
  s.lapsPerRun = 3;
  s.termination.maxTime = { enabled: true, value: 1200 };
  s.termination.successRate = { enabled: false, value: 0.8 };
  s.circuits = ['ovale', 'goulets'];
  s.carTypes = { mode: 'melange', ids: ['citadine', 'drift'] };
  Controls.applySettings(doc, s);
  assert.deepEqual(plain(Controls.readSettings(doc)), s);
  assert.equal(doc.elements.neurons1Val.textContent, '32');
  assert.equal(doc.elements.circuitSet.value, 'personnalise');
  // Préréglage de circuits : l'ordre du préréglage est conservé
  s.circuits = plain(get('Circuits').SETS.melange.ids);
  s.carTypes = { mode: 'unique', ids: ['camion'] };
  Controls.applySettings(doc, s);
  assert.equal(doc.elements.circuitSet.value, 'melange');
  assert.deepEqual(plain(Controls.readSettings(doc)), s);
});

test('contrôle hors plage dans le DOM : readSettings refuse', () => {
  const doc = fakeDocument(html);
  Controls.init(doc);
  doc.elements.populationSize.value = '500';
  assert.throws(() => Controls.readSettings(doc), { name: 'RangeError' });
  doc.elements.populationSize.value = '50';
  doc.elements.carTypeMode.value = 'melange';
  for (const o of doc.elements.carTypeMix.options) o.selected = false;
  assert.throws(() => Controls.readSettings(doc), { name: 'RangeError' }, 'mélange sans type');
});

test('affichage du réseau : positions dans le panneau, styles selon le poids', () => {
  for (const sizes of [[6, 20, 2], [6, 64, 64, 64, 64, 64, 3], [6, 1, 3]]) {
    const pos = NetworkView.layout(sizes, NetworkView.WIDTH, NetworkView.HEIGHT);
    assert.deepEqual(pos.map(c => c.length), sizes);
    for (const col of pos) for (const p of col) {
      assert.ok(p.x >= 0 && p.x <= NetworkView.WIDTH && p.y >= 0 && p.y <= NetworkView.HEIGHT, JSON.stringify(p));
    }
    for (let l = 1; l < pos.length; l++) assert.ok(pos[l][0].x > pos[l - 1][0].x, 'colonnes de gauche à droite');
  }
  const pos = NetworkView.edgeStyle(1, 2), neg = NetworkView.edgeStyle(-2, 2), weak = NetworkView.edgeStyle(0.1, 2);
  assert.ok(neg.weight > pos.weight && pos.weight > weak.weight, 'épaisseur ∝ |poids|');
  assert.ok(pos.color[2] > pos.color[0], 'positif : bleu');
  assert.ok(neg.color[0] > neg.color[2], 'négatif : rouge');
  assert.ok(NetworkView.nodeColor(1)[0] > NetworkView.nodeColor(0)[0], 'activation forte : plus lumineux');
  assert.deepEqual(plain(NetworkView.outputTexts([0.25, 0.8])), ['Virage : gauche 0.50', 'Poussée : 0.80']);
  assert.match(NetworkView.outputTexts([0.5, 0.5, 0.9])[2], /Frein : 0\.90 \(actif\)/);
});
