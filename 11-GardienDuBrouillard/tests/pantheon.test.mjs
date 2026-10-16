import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lcg, plain } from './helpers.mjs';

const { get } = load(11);
const g = name => get(name);
const Settings = g('Settings'), Trials = g('Trials'), Doctrines = g('Doctrines'), Fitness = g('Fitness'), Training = g('Training'),
  TrainingStore = g('TrainingStore'), Pantheon = g('Pantheon'), CrossTournament = g('CrossTournament'), Demo = g('Demo'),
  BossBrain = g('BossBrain'), NeuralBossController = g('NeuralBossController'), HandBossController = g('HandBossController'),
  NeuralNetwork = g('NeuralNetwork');

const small = (extra = {}) => ({ ...Settings.defaults(), populationSize: 10, fightsPerBoss: 1, maxFightTime: 20, ...extra });
function memoryStorage() {
  const data = {};
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } };
}
function runUntil(t, generation, budget = 2000) {
  for (let guard = 0; (t.generation < generation || t.phase === 'validate') && guard < 100000; guard++) t.work(budget);
}

test('épreuves : dans les plages des curseurs, ne changent que le joueur robot, retrouvées par leurs réglages', () => {
  assert.deepEqual(plain(Trials.settings('reference')), plain(Settings.defaults()), 'la référence = réglages d\'origine');
  const ids = new Set();
  for (const t of Trials.LIST) {
    assert.ok(!ids.has(t.id), 'identifiant unique');
    ids.add(t.id);
    assert.ok(t.label && t.description.length > 15);
    for (const k of Object.keys(t.changes)) assert.ok(Trials.ROBOT_KEYS.includes(k), t.id + ' ne change que le joueur robot');
    const s = Trials.settings(t.id);
    for (const [k, v] of Object.entries(s)) {
      const p = Settings.PARAMETERS[k];
      assert.ok(v >= p.min && v <= p.max, `${t.id}.${k}`);
      assert.ok(Math.abs(Math.round((v - p.min) / p.step) * p.step + p.min - v) < 1e-9, `${t.id}.${k} sur un cran`);
    }
    assert.equal(Trials.matching(s), t.id);
    // Les autres réglages (population, durée…) viennent de la base
    const base = small({ dodgeProbability: 0.95, estusCharges: 5 });
    const onBase = Trials.settings(t.id, base);
    assert.equal(onBase.populationSize, 10);
    assert.equal(onBase.maxFightTime, 20);
    for (const k of Trials.ROBOT_KEYS) assert.equal(onBase[k], s[k], 'le joueur robot de la base est remplacé : ' + k);
  }
  assert.equal(Trials.matching({ ...Settings.defaults(), dodgeProbability: 0.95 }), null);
  assert.throws(() => Trials.get('inconnue'), { name: 'RangeError' });
});

test('recettes : Gardien = note de référence, épreuves existantes, poids positifs, résumé lisible', () => {
  const gardien = Doctrines.get('gardien');
  assert.equal(Doctrines.LIST[0].id, 'gardien');
  assert.deepEqual(plain(gardien.weights), plain(Fitness.WEIGHTS));
  assert.equal(gardien.trial, 'reference');
  const ids = new Set();
  for (const d of Doctrines.LIST) {
    assert.ok(!ids.has(d.id));
    ids.add(d.id);
    Trials.get(d.trial);
    for (const k of ['dealt', 'received', 'win', 'whiff', 'drink', 'riposte']) assert.ok(Number.isFinite(d.weights[k]) && d.weights[k] >= 0, d.id + '.' + k);
    assert.equal(d.color.length, 3);
    assert.match(Doctrines.summary(d.id), /Note : dégâts infligés/);
    assert.deepEqual(plain(Doctrines.settings(d.id)), plain(Trials.settings(d.trial)));
  }
  // Recettes de note : elles diffèrent bien du Gardien dans le sens annoncé
  assert.ok(Doctrines.get('bourreau').weights.dealt > gardien.weights.dealt && Doctrines.get('bourreau').weights.received < gardien.weights.received);
  assert.ok(Doctrines.get('spectre').weights.received > gardien.weights.received && Doctrines.get('spectre').weights.dealt < gardien.weights.dealt);
  assert.match(Doctrines.summary('gardien'), /riposte qui touche \+ 15/);
  for (const d of Doctrines.LIST) assert.equal(d.weights.riposte, Fitness.WEIGHTS.riposte, d.id + ' : bonus de riposte de référence');
  assert.throws(() => Doctrines.get('brute'), { name: 'RangeError' }, 'la Brute a été retirée (identique au Gardien)');
  assert.throws(() => Doctrines.get('inconnue'), { name: 'RangeError' });
});

test('entraînement : la note suit la recette ; changement à la génération suivante, champion réexaminé', () => {
  const first = doctrine => {
    const t = new Training(small(), { seed: 4, doctrine });
    for (let guard = 0; t.index < 1 && guard < 1000; guard++) t.work(200);
    return t;
  };
  const a = first('gardien'), b = first('bourreau');
  // Même population de départ, mêmes combats : seule la note change
  assert.deepEqual(plain(a.genResults[0]), plain(b.genResults[0]));
  assert.equal(a.fitnesses[0], Fitness.compute([a.genResults[0]], Doctrines.get('gardien').weights));
  assert.equal(b.fitnesses[0], Fitness.compute([b.genResults[0]], Doctrines.get('bourreau').weights));
  assert.notEqual(a.fitnesses[0], b.fitnesses[0]);
  assert.equal(new Training(small(), { seed: 1 }).doctrine, 'gardien', 'recette par défaut');
  assert.throws(() => new Training(small(), { doctrine: 'inconnue' }), { name: 'RangeError' });

  const t = new Training(small(), { seed: 6 });
  runUntil(t, 1);
  const key = t.fightKey();
  t.setDoctrine('spectre');
  assert.equal(t.doctrine, 'gardien', 'pas avant la fin de la génération');
  assert.throws(() => t.setDoctrine('inconnue'), { name: 'RangeError' });
  for (let guard = 0; t.phase === 'train' && guard < 2000; guard++) t.work(500);
  assert.equal(t.doctrine, 'spectre');
  assert.notEqual(t.fightKey(), key);
  assert.equal(t.queue[0].recheck, true, 'le champion repasse l\'examen avec la nouvelle note');
  runUntil(t, 2);
  assert.equal(t.champion.key, t.fightKey());
});

test('sauvegarde : la recette est gardée, absente = Gardien, inconnue refusée', () => {
  const t = new Training(small(), { seed: 8, doctrine: 'chasseur' });
  runUntil(t, 1);
  const text = TrainingStore.serialize(t);
  assert.equal(JSON.parse(text).doctrine, 'chasseur');
  const back = TrainingStore.parse(text);
  assert.equal(back.doctrine, 'chasseur');
  assert.equal(back.champion.key, back.fightKey(), 'champion à jour');
  const old = JSON.parse(text);
  delete old.doctrine;
  assert.equal(TrainingStore.restore(old).doctrine, 'gardien', 'sauvegarde d\'avant le Panthéon');
  assert.throws(() => TrainingStore.restore({ ...JSON.parse(text), doctrine: 'inconnue' }), { name: 'RangeError' });
  // Recette choisie mais pas encore appliquée : sauvegardée, et le champion sera réexaminé
  t.setDoctrine('geolier');
  const pending = TrainingStore.restore(JSON.parse(TrainingStore.serialize(t)));
  assert.equal(pending.doctrine, 'geolier');
  assert.notEqual(pending.champion.key, pending.fightKey());
});

test('Panthéon : boss fournis, un par recette, architecture vérifiée', () => {
  const list = Pantheon.builtins();
  assert.deepEqual(plain(list.map(e => e.doctrine)), plain(Doctrines.LIST.map(d => d.id)), 'un boss fourni par recette, dans l\'ordre');
  for (const e of list) {
    assert.equal(e.builtin, true);
    assert.deepEqual(plain(e.brain.sizes), [16, 16, 6]);
    assert.equal(e.trial, Doctrines.get(e.doctrine).trial);
    assert.ok(e.winRate >= 0 && e.winRate <= 1);
    assert.match(Pantheon.describe(e), /fourni/);
  }
  const brains = new Set(list.map(e => JSON.stringify(e.brain.toJSON())));
  assert.equal(brains.size, list.length, 'des cerveaux différents');
  // Donnée d'une autre architecture : ignorée
  const bad = { bosses: [{ doctrine: 'bourreau', generations: 3, validationWinRate: 0.5, brain: new NeuralNetwork([8, 16, 3], lcg(1)).toJSON() }] };
  assert.deepEqual(plain(Pantheon.builtins(null, bad)), []);
});

test('Panthéon : ajout du champion, plafond (le plus ancien part), retrait, sauvegarde et relecture', () => {
  const t = new Training(small(), { seed: 3, doctrine: 'opportuniste' });
  assert.throws(() => Pantheon.fromTraining(t), { name: 'RangeError' }, 'rien à ajouter avant la première génération');
  t.updateSettings(Trials.settings('debutant', small()));
  runUntil(t, 1);
  const e = Pantheon.fromTraining(t, 1000);
  assert.equal(e.doctrine, 'opportuniste');
  assert.equal(e.trial, 'debutant');
  assert.equal(e.winRate, t.champion.winRate);
  assert.notEqual(e.brain, t.champion.brain, 'copie : l\'entraînement peut continuer');
  assert.deepEqual(plain(e.brain.toJSON()), plain(t.champion.brain.toJSON()));

  const builtins = Pantheon.builtins();
  let list = builtins.slice();
  const added = [];
  for (let k = 0; k < Pantheon.MAX_SAVED + 2; k++) {
    const entry = Pantheon.fromTraining(t, 2000 + k);
    added.push(entry);
    const res = Pantheon.add(list, entry);
    list = res.list;
    assert.equal(res.removed, k < Pantheon.MAX_SAVED ? null : added[k - Pantheon.MAX_SAVED]);
  }
  assert.equal(list.filter(x => !x.builtin).length, Pantheon.MAX_SAVED, 'plafond');
  assert.equal(list.filter(x => x.builtin).length, builtins.length, 'les boss fournis restent');
  assert.equal(Pantheon.find(list, added[0].id), null, 'le plus ancien est parti');
  list = Pantheon.remove(list, added[3].id);
  assert.equal(Pantheon.find(list, added[3].id), null);
  assert.equal(Pantheon.remove(list, builtins[0].id).length, list.length, 'un boss fourni ne se retire pas');

  const mem = memoryStorage();
  assert.equal(Pantheon.save(mem, list).ok, true);
  assert.equal(JSON.parse(mem.data[Pantheon.KEY]).length, list.filter(x => !x.builtin).length, 'seuls les boss ajoutés sont stockés');
  const back = Pantheon.load(mem, builtins);
  assert.equal(back.error, null);
  assert.deepEqual(plain(back.list.map(x => x.id)), plain(list.map(x => x.id)));
  assert.deepEqual(plain(back.list[back.list.length - 1].brain.toJSON()), plain(list[list.length - 1].brain.toJSON()));
});

test('Panthéon : stockage absent, bloqué, corrompu ou entrées invalides, sans exception', () => {
  const builtins = Pantheon.builtins();
  assert.equal(Pantheon.load(null, builtins).list.length, builtins.length);
  assert.equal(Pantheon.save(null, builtins).ok, false);
  const blocked = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('plein'); } };
  assert.match(Pantheon.load(blocked, builtins).error, /impossible/);
  assert.match(Pantheon.save(blocked, builtins).error, /plein/);
  const mem = memoryStorage();
  mem.setItem(Pantheon.KEY, '{pas du json');
  assert.equal(Pantheon.load(mem, builtins).list.length, builtins.length);
  assert.match(Pantheon.load(mem, builtins).error, /illisible/);
  const good = Pantheon.toData({ id: 'ajout-1', name: 'Mon boss', doctrine: 'spectre', trial: null, generation: 4, winRate: 0.5,
    brain: BossBrain.create(lcg(2)) });
  const bads = [
    { ...good, id: 'fourni-gardien' }, { ...good, name: '' }, { ...good, name: 'x'.repeat(41) }, { ...good, doctrine: 'inconnue' },
    { ...good, trial: 'inconnue' }, { ...good, generation: -1 }, { ...good, winRate: 2 },
    { ...good, brain: new NeuralNetwork([8, 16, 3], lcg(1)).toJSON() }, null];
  // Seules les MAX_SAVED dernières entrées sont lues
  mem.setItem(Pantheon.KEY, JSON.stringify(bads.concat([good])));
  const res = Pantheon.load(mem, builtins);
  assert.equal(res.list.length, builtins.length + 1, 'seule l\'entrée valide est gardée');
  assert.equal(res.list[res.list.length - 1].name, 'Mon boss');
  assert.match(res.error, new RegExp('^' + (Pantheon.MAX_SAVED - 1) + ' boss'));
  for (const b of bads) assert.throws(() => Pantheon.fromData(b));
});

test('duel : le boss qui tue le chevalier gagne, puis le plus rapide, puis celui qui fait le plus de dégâts', () => {
  const r = (winner, duration, damageToPlayer = 0) => ({ winner, duration, damageToPlayer });
  assert.equal(Demo.roundWinner(r('boss', 40), r('draw', 90, 99)), 'left');
  assert.equal(Demo.roundWinner(r('player', 10, 90), r('draw', 90, 0)), 'right', 'un match nul bat une défaite');
  assert.equal(Demo.roundWinner(r('boss', 30), r('boss', 20)), 'right', 'le plus rapide');
  assert.equal(Demo.roundWinner(r('boss', 20.2), r('boss', 20)), 'tie', 'moins de 0,5 s d\'écart');
  assert.equal(Demo.roundWinner(r('boss', 20.5), r('boss', 20)), 'right', 'seuil inclus');
  assert.equal(Demo.roundWinner(r('player', 30, 80), r('player', 20, 60)), 'left', 'aucun ne gagne : les dégâts');
  assert.equal(Demo.roundWinner(r('draw', 90, 50.5), r('draw', 90, 50)), 'tie');
  // Score du duel : chaque manche est comptée une fois, pour son vainqueur
  const d = new Demo(Demo.handSide(), Demo.handSide(), small());
  const play = (a, b) => {
    d.left.result = a;
    d.right.result = b;
    d.update(0.1);
    d.update(Demo.PAUSE);
  };
  play(r('boss', 20), r('boss', 30));
  play(r('player', 20, 10), r('boss', 30));
  play(r('boss', 20), r('boss', 30));
  play(r('draw', 90, 5), r('draw', 90, 5));
  assert.deepEqual(plain(d.score.duel), { left: 2, right: 1, ties: 1 });
  assert.equal(d.score.rounds, 4);
  assert.equal(d.score.left, 2, 'victoires contre le chevalier, à part');
  assert.equal(d.score.right, 3);
});

test('tournoi croisé : grille boss × épreuves, mêmes combats pour tous, budget respecté', () => {
  const brain = BossBrain.create(lcg(5));
  const contenders = [
    { name: 'a', makeController: () => new NeuralBossController(brain) },
    { name: 'main', makeController: () => new HandBossController() },
    { name: 'b', makeController: () => new NeuralBossController(brain) }];
  const trials = ['debutant', 'expert'].map(id => ({ id, label: Trials.get(id).label, settings: Trials.settings(id, small()) }));
  const tour = new CrossTournament(contenders, trials, 3, 123);
  assert.equal(tour.work(321), 321);
  let last = tour.progress();
  assert.ok(last >= 0 && last < 1, 'l\'avancement compte les combats terminés');
  for (let guard = 0; !tour.done && guard < 1000; guard++) {
    tour.work(5000);
    assert.ok(tour.progress() >= last);
    last = tour.progress();
  }
  assert.ok(tour.done);
  assert.equal(tour.progress(), 1);
  assert.equal(tour.work(100), 0);
  const grid = tour.grid();
  assert.equal(grid.length, 3);
  for (const row of grid) {
    assert.equal(row.length, 2);
    for (const c of row) assert.equal(c.fights, 3);
  }
  assert.deepEqual(plain(grid[0]), plain(grid[2].map(c => ({ ...c, name: 'a' }))), 'même cerveau, mêmes combats : mêmes résultats');
  // Chaque épreuve joue bien son joueur robot
  assert.equal(tour.comparisons[1].makeFight(contenders[0], 0).playerController.dodgeProbability, Trials.settings('expert').dodgeProbability);
  assert.throws(() => new CrossTournament([], trials), { name: 'RangeError' });
});

test('tournoi croisé : profil moyen, meilleur par épreuve, polyvalent, rang contre l\'adversaire d\'entraînement', () => {
  const cell = (winRate, extra = {}) => ({ fights: 10, winRate, avgDuration: 30, avgDamageDealt: 50, avgDamageTaken: 100, avgWhiffs: 1,
    avgAttacks: 10, avgCharges: 1, avgBreaths: 2, avgDrinks: 1, ...extra });
  const grid = [
    [cell(0.2), cell(0.2), cell(0.2)],
    [cell(0.65), cell(0.5), cell(0.5, { avgAttacks: 20 })],   // spécialiste de l'épreuve 0 : 65 contre 50 → 15 points
    [cell(0.5), cell(0.6), cell(0.46)]];   // 60 contre 48 ailleurs : 12 points, pas spécialiste
  const p = CrossTournament.profile(grid[1]);
  assert.ok(Math.abs(p.winRate - 0.55) < 1e-9);
  assert.ok(Math.abs(p.avgAttacks - 40 / 3) < 1e-9);
  assert.equal(CrossTournament.profile([{ ...cell(1), fights: 0 }]).winRate, 0, 'cases non jouées ignorées');
  assert.deepEqual(plain(CrossTournament.bestPerTrial(grid)), [1, 2, 1]);
  assert.equal(CrossTournament.mostVersatile(grid), 1);
  assert.equal(CrossTournament.rank(grid, 1, 0), 1);
  assert.equal(CrossTournament.rank(grid, 2, 2), 2);
  assert.equal(CrossTournament.rank(grid, 0, 2), 3);
  assert.equal(CrossTournament.rank([[cell(0.5)], [cell(0.5)], [cell(0.2)]], 1, 0), 1, 'ex aequo : même rang');
  const v = CrossTournament.verdicts(grid, ['A', 'B', 'C'], ['t0', 't1', 't2'], [-1, 0, 2]);
  assert.match(v[0], /« t0 ».*B \(65 %/);
  assert.match(v[3], /polyvalent : B, 55 %/);
  assert.ok(v.includes("B s'est entraîné contre le joueur « t0 » : 65 % contre lui, le meilleur score de cette colonne."));
  assert.ok(v.includes("C s'est entraîné contre le joueur « t2 » : 46 % contre lui, 2e score sur 3."));
  assert.ok(!v.some(s => /^A s'est/.test(s)), 'sans épreuve d\'entraînement connue, pas de phrase');
  assert.equal(v.length, 6);
});
