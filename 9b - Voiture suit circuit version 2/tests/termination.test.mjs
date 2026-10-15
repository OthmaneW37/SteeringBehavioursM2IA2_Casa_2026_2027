import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const { get } = load();
const shouldStop = get('shouldStop');
const updateBestScore = get('updateBestScore');

const off = () => ({
  maxGenerations: { enabled: false, value: 100 },
  targetLaps: { enabled: false, value: 2 },
  stagnation: { enabled: false, value: 10 },
  maxTime: { enabled: false, value: 60 },
  successRate: { enabled: false, value: 0.6 },
});
const state = (over = {}) => ({
  generation: 0, lapsOnAllCircuits: 0, generationsWithoutImprovement: 0, elapsedSeconds: 0, successRate: 0, ...over,
});
const only = (key, value) => { const s = off(); s[key] = { enabled: true, value }; return s; };

test('aucune condition active : jamais d\'arrêt, même avec des valeurs énormes', () => {
  const r = shouldStop(state({ generation: 1e9, lapsOnAllCircuits: 99, generationsWithoutImprovement: 1e9, elapsedSeconds: 1e9, successRate: 1 }), off());
  assert.deepEqual({ ...r }, { stop: false, code: null, reason: null });
});

test('générations max : seuil inclusif', () => {
  const s = only('maxGenerations', 100);
  assert.equal(shouldStop(state({ generation: 99 }), s).stop, false);
  const r = shouldStop(state({ generation: 100 }), s);
  assert.equal(r.stop, true);
  assert.equal(r.code, 'maxGenerations');
  assert.match(r.reason, /100/);
  assert.equal(shouldStop(state({ generation: 101 }), s).stop, true);
});

test('score cible : N tours sur tous les circuits, seuil inclusif', () => {
  const s = only('targetLaps', 2);
  assert.equal(shouldStop(state({ lapsOnAllCircuits: 1 }), s).stop, false);
  assert.equal(shouldStop(state({ lapsOnAllCircuits: 2 }), s).code, 'targetLaps');
  assert.equal(shouldStop(state({ lapsOnAllCircuits: 3 }), s).stop, true);
});

test('stagnation : arrêt après exactement K générations sans progrès', () => {
  const s = only('stagnation', 10);
  assert.equal(shouldStop(state({ generationsWithoutImprovement: 9 }), s).stop, false);
  assert.equal(shouldStop(state({ generationsWithoutImprovement: 10 }), s).code, 'stagnation');
  assert.equal(shouldStop(state({ generationsWithoutImprovement: 0, generation: 500 }), s).stop, false);
});

test('temps max en secondes : seuil inclusif, fractions de seconde', () => {
  const s = only('maxTime', 60);
  assert.equal(shouldStop(state({ elapsedSeconds: 59.999 }), s).stop, false);
  assert.equal(shouldStop(state({ elapsedSeconds: 60 }), s).code, 'maxTime');
});

test('taux de réussite (règle d\'origine 60 %) : seuil inclusif', () => {
  const s = only('successRate', 0.6);
  assert.equal(shouldStop(state({ successRate: 0.58 }), s).stop, false);
  assert.equal(shouldStop(state({ successRate: 0.6 }), s).code, 'successRate');
});

test('condition désactivée ignorée même si son seuil est atteint', () => {
  const s = only('maxGenerations', 100);
  assert.equal(shouldStop(state({ generation: 5, elapsedSeconds: 1e6, generationsWithoutImprovement: 1e6 }), s).stop, false);
});

test('combinaisons : la première condition remplie donne la raison', () => {
  const s = off();
  for (const key of Object.keys(s)) s[key].enabled = true;
  // Seule la durée est atteinte
  assert.equal(shouldStop(state({ elapsedSeconds: 60 }), s).code, 'maxTime');
  // Générations et stagnation atteintes : générations d'abord
  assert.equal(shouldStop(state({ generation: 100, generationsWithoutImprovement: 10 }), s).code, 'maxGenerations');
  // Objectif de tours prioritaire sur tout le reste
  assert.equal(shouldStop(state({ lapsOnAllCircuits: 2, generation: 100, elapsedSeconds: 60 }), s).code, 'targetLaps');
  // Rien d'atteint
  assert.equal(shouldStop(state({ generation: 99, generationsWithoutImprovement: 9, elapsedSeconds: 59, lapsOnAllCircuits: 1, successRate: 0.5 }), s).stop, false);
});

test('suivi du meilleur score : amélioration stricte', () => {
  let p = { bestScore: -Infinity, generationsWithoutImprovement: 0 };
  p = updateBestScore(p, 100);
  assert.deepEqual({ ...p }, { bestScore: 100, generationsWithoutImprovement: 0 });
  p = updateBestScore(p, 100); // égalité : pas une amélioration
  assert.equal(p.generationsWithoutImprovement, 1);
  p = updateBestScore(p, 50);
  assert.deepEqual({ ...p }, { bestScore: 100, generationsWithoutImprovement: 2 });
  p = updateBestScore(p, 101);
  assert.deepEqual({ ...p }, { bestScore: 101, generationsWithoutImprovement: 0 });
});
