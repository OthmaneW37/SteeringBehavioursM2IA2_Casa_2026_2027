import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lcg, plain } from './helpers.mjs';

function env(seed = 3) {
  const e = load(seed);
  const g = e.get;
  return { ...e, Training: g('Training'), TrainingStore: g('TrainingStore'), Settings: g('Settings'), BossBrain: g('BossBrain'),
    Demo: g('Demo'), Fitness: g('Fitness'), NeuralNetwork: g('NeuralNetwork') };
}
// Petit entraînement rapide, aux minimums des curseurs : 10 boss, 1 combat de 20 s au plus
const small = Settings => ({ ...Settings.defaults(), populationSize: 10, fightsPerBoss: 1, maxFightTime: 20 });
function runUntil(t, generation, budget = 500) {
  for (let guard = 0; (t.generation < generation || t.phase === 'validate') && guard < 100000; guard++) t.work(budget);
}
function memoryStorage() {
  const data = {};
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } };
}

test('champion validé : examen sur des combats de test fixes, remplacé seulement par plus fort', () => {
  const { Training, Settings } = env();
  const t = new Training(small(Settings), { seed: 5 });
  assert.equal(t.champion, null);
  assert.equal(t.bestBrain(), null);
  // Fin de la première génération : phase d'examen des candidats
  for (let guard = 0; t.phase === 'train' && guard < 2000; guard++) t.work(500);
  assert.equal(t.generation, 1);
  assert.equal(t.phase, 'validate');
  assert.equal(t.queue.length, Training.VALIDATION_CANDIDATES);
  assert.match(t.status(), /Examen/);
  runUntil(t, 1);
  assert.equal(t.phase, 'train');
  assert.ok(t.champion, 'un champion après le premier examen');
  assert.equal(t.bestBrain(), t.champion.brain);
  assert.equal(t.history[0].championWinRate, t.champion.winRate);
  // La note d'examen d'un cerveau est reproductible (combats de test fixes)
  const again = t.validate([{ brain: t.champion.brain }], Training.VALIDATION_FIGHTS, Training.VALIDATION_SEED);
  assert.equal(again.winRate, t.champion.winRate);
  assert.ok(Math.abs(again.fitness - t.champion.fitness) < 1e-9);
  // Sur plusieurs générations, la courbe du champion ne descend jamais
  runUntil(t, 5);
  const curve = t.history.map(h => h.championWinRate);
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i] >= curve[i - 1], 'courbe du champion : ' + curve);
});

test('champion : comparaison par taux de victoire, puis par note ; remesuré si le joueur robot change', () => {
  const { Training, Settings } = env();
  assert.equal(Training.better({ winRate: 0.5, fitness: 0 }, null), true);
  assert.equal(Training.better({ winRate: 0.6, fitness: -50 }, { winRate: 0.5, fitness: 90 }), true);
  assert.equal(Training.better({ winRate: 0.5, fitness: 10 }, { winRate: 0.5, fitness: 20 }), false);
  assert.equal(Training.better({ winRate: 0.5, fitness: 20 }, { winRate: 0.5, fitness: 20 }), false, 'égalité : on garde l\'ancien');
  const t = new Training(small(Settings), { seed: 2 });
  runUntil(t, 1);
  const champ = t.champion;
  t.updateSettings({ ...small(Settings), dodgeProbability: 0.95 });
  for (let guard = 0; t.phase === 'train' && guard < 2000; guard++) t.work(500);
  assert.equal(t.queue[0].recheck, true, 'le champion repasse l\'examen en premier');
  assert.equal(t.queue[0].brain, champ.brain);
  runUntil(t, 2);
  assert.equal(t.champion.key, t.fightKey());
});

test('sauvegarde complète : aller-retour (population, génération, courbe, champion), puis reprise', () => {
  const { Training, TrainingStore, Settings } = env();
  const t = new Training(small(Settings), { seed: 9 });
  runUntil(t, 2);
  const text = TrainingStore.serialize(t);
  const back = TrainingStore.parse(text);
  assert.equal(back.generation, 2);
  assert.equal(back.seed, 9);
  assert.equal(back.population.length, 10);
  assert.deepEqual(plain(back.population.map(b => b.toJSON())), plain(t.population.map(b => b.toJSON())));
  assert.deepEqual(plain(back.history), plain(t.history));
  assert.deepEqual(plain(back.champion.brain.toJSON()), plain(t.champion.brain.toJSON()));
  assert.equal(back.champion.winRate, t.champion.winRate);
  assert.equal(back.champion.key, back.fightKey());
  // Sauvegarde dont l'examen avait une autre taille : le champion sera réexaminé
  const old = JSON.parse(text);
  old.validationFights = 16;
  const reloaded = TrainingStore.restore(old);
  assert.notEqual(reloaded.champion.key, reloaded.fightKey());
  // Sauvegardé à nouveau avant d'avoir repassé l'examen : la marque est conservée
  const again = TrainingStore.parse(TrainingStore.serialize(reloaded));
  assert.notEqual(again.champion.key, again.fightKey(), "le champion doit toujours repasser l'examen");
  assert.deepEqual(plain(back.settings), plain(t.settings));
  // La reprise continue l'entraînement normalement
  runUntil(back, 3);
  assert.equal(back.generation, 3);
  assert.equal(back.history.length, 3);
  assert.match(TrainingStore.fileName(back), /generation-3\.json$/);
});

test('sauvegarde : fichiers invalides refusés avec un message clair', () => {
  const { Training, TrainingStore, Settings } = env();
  const t = new Training(small(Settings), { seed: 4 });
  runUntil(t, 1);
  const good = JSON.parse(TrainingStore.serialize(t));
  const bad = [
    d => { d.format = 'autre'; },
    d => { d.version = 2; },
    d => { d.settings.populationSize = 5000; },
    d => { d.settings.mutationRate = 'beaucoup'; },
    d => { d.generation = -1; },
    d => { d.generation = 1.5; },
    d => { d.seed = 0; },
    d => { d.population = []; },
    d => { d.population[0].sizes = [8, 20, 3]; },
    d => { d.population[0].weights[0][3] = null; },
    d => { d.history[0].best = 'x'; },
    d => { delete d.history; },
    d => { d.champion.brain.sizes = [6, 20, 2]; },
  ];
  for (const [i, change] of bad.entries()) {
    const d = JSON.parse(JSON.stringify(good));
    change(d);
    assert.throws(() => TrainingStore.restore(d), e => e.name === 'RangeError' || e.name === 'TypeError', 'variante ' + i);
  }
  // Cerveau cohérent mais d'une autre architecture (8-20-3) : refusé par la vérification d'architecture
  const { NeuralNetwork } = env();
  const other = JSON.parse(JSON.stringify(good));
  other.population[0] = JSON.parse(JSON.stringify(new NeuralNetwork([8, 20, 3], lcg(1)).toJSON()));
  assert.throws(() => TrainingStore.restore(other), { name: 'RangeError', message: /architecture/ });
  assert.throws(() => TrainingStore.parse('pas du json'), { name: 'RangeError', message: /illisible/ });
  assert.throws(() => TrainingStore.restore(null), { name: 'TypeError' });
  // Sans champion (sauvegarde faite avant le premier examen) : accepté
  const d = JSON.parse(JSON.stringify(good));
  d.champion = null;
  assert.equal(TrainingStore.restore(d).champion, null);
});

test('sauvegarde automatique : stockage bloqué, plein ou corrompu sans exception', () => {
  const { Training, TrainingStore, Settings } = env();
  const t = new Training(small(Settings), { seed: 4 });
  runUntil(t, 1);
  const mem = memoryStorage();
  assert.equal(TrainingStore.save(mem, t).ok, true);
  assert.equal(TrainingStore.load(mem).training.generation, 1);
  assert.deepEqual(plain(TrainingStore.load(memoryStorage())), { training: null, error: null });
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('x'); } };
  assert.match(TrainingStore.load(blocked).error, /SecurityError/);
  assert.equal(TrainingStore.save(blocked, t).ok, false);
  assert.equal(TrainingStore.clear(blocked), false);
  const full = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  assert.match(TrainingStore.save(full, t).error, /QuotaExceeded/);
  assert.equal(TrainingStore.save(null, t).ok, false);
  mem.data[TrainingStore.KEY] = '{ cassé';
  const broken = TrainingStore.load(mem);
  assert.equal(broken.training, null);
  assert.match(broken.error, /ignorée/);
  assert.equal(TrainingStore.clear(mem), true);
  assert.equal(TrainingStore.load(mem).training, null);
});

test('démonstration : même combat des deux côtés, score des manches, nouvelle manche après la pause', () => {
  const { Demo, Settings, BossBrain } = env();
  const settings = { ...Settings.defaults(), maxFightTime: 5 };
  const champion = BossBrain.create(lcg(3));
  const d = new Demo('random', champion, settings);
  assert.equal(d.round, 1);
  // Le joueur robot démarre identique des deux côtés
  assert.deepEqual(plain(d.left.player.pos), plain(d.right.player.pos));
  assert.equal(d.left.playerController.dodgeProbability, settings.dodgeProbability);
  assert.equal(d.right.bossController.brain, champion);
  assert.match(Demo.verdict(d.left), /en cours/);
  for (let i = 0; i < 1000 && !d.over; i++) d.step();
  assert.ok(d.over);
  d.update(0.1);
  assert.equal(d.score.rounds, 1);
  assert.equal(d.score.left, d.left.result.winner === 'boss' ? 1 : 0, 'score de gauche = résultat du combat');
  assert.equal(d.score.right, d.right.result.winner === 'boss' ? 1 : 0, 'score de droite = résultat du combat');
  d.update(0.1);
  assert.equal(d.score.rounds, 1, 'la manche n\'est comptée qu\'une fois');
  assert.ok(['Le boss gagne', 'Le chevalier gagne', 'Match nul'].some(s => Demo.verdict(d.left).startsWith(s)));
  d.update(Demo.PAUSE);
  assert.equal(d.round, 2);
  assert.equal(d.over, false, 'nouvelle manche lancée');
  // Boss de gauche au hasard différent d'une manche à l'autre ; boss écrit à la main au choix
  const hand = new Demo('hand', champion, settings);
  assert.equal(hand.left.bossController.name, 'Boss à états');
  assert.match(Demo.leftLabel('hand'), /main/);
  assert.match(Demo.leftLabel('random'), /hasard/);
});
