import test from 'node:test';
import assert from 'node:assert/strict';
import { load, lcg, plain, Vector } from './helpers.mjs';

function env(seed = 3) {
  const e = load(seed);
  const g = e.get;
  return { ...e, NeuralNetwork: g('NeuralNetwork'), BossBrain: g('BossBrain'), NeuralBossController: g('NeuralBossController'),
    Genetic: g('Genetic'), Fitness: g('Fitness'), Fight: g('Fight'), Arena: g('Arena'), Player: g('Player'), Boss: g('Boss'),
    ScriptedPlayerController: g('ScriptedPlayerController'), HandBossController: g('HandBossController'), Training: g('Training'),
    Comparison: g('Comparison'), Settings: g('Settings'), Combat: g('Combat'), seededRandom: g('seededRandom') };
}
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('cerveau : 12 entrées, 16 neurones cachés sigmoïdes, 5 sorties dans [0, 1]', () => {
  const { BossBrain } = env();
  const nn = BossBrain.create(lcg(1));
  assert.deepEqual(plain(nn.sizes), [12, 16, 5]);
  assert.equal(nn.paramCount(), 12 * 16 + 16 + 16 * 5 + 5);
  assert.equal(BossBrain.INPUT_LABELS.length, 12);
  assert.equal(BossBrain.OUTPUT_LABELS.length, 5);
  for (const x of [new Array(12).fill(0), new Array(12).fill(1), [0.3, 0.9, 0.1, 0.5, 0, 1, 0.7, 0.2, 0.4, 1, 0.5, 0.1]]) {
    const out = nn.predict(x);
    assert.equal(out.length, 5);
    for (const v of out) assert.ok(v > 0 && v < 1);
  }
});

test('entrées du boss : 12 valeurs normalisées dans [0, 1], valeurs exactes', () => {
  const { BossBrain, Arena, Player, Boss, Combat } = env();
  const arena = new Arena();
  const b = new Boss(500, 350), p = new Player(600, 350);
  b.facing = 0;
  p.vel.set(Combat.PLAYER.roll.maxSpeed / 2, 0);
  p.stamina = 40;
  b.cooldown = Combat.BOSS.cooldown / 4;
  b.hp = b.maxHp * 0.3;
  p.hp = 60;
  b.chargeCooldown = Combat.BOSS.charge.cooldown / 2;
  b.breathCooldown = Combat.BOSS.breath.cooldown;
  const x = BossBrain.inputs(b, p, arena);
  assert.equal(x.length, 12);
  for (const v of x) assert.ok(v >= 0 && v <= 1);
  assert.ok(close(x[0], 100 / arena.diagonal()));
  assert.ok(close(x[1], 0.5), 'joueur droit devant : 0,5');
  assert.ok(close(x[2], 0.5));
  assert.ok(close(x[3], 0.4));
  assert.ok(close(x[4], 0.25));
  assert.ok(close(x[5], 0.3));
  assert.equal(x[6], 0, 'aucun mur à moins de 200 px');
  assert.ok(close(x[8], 0.6), 'vie du joueur');
  assert.equal(x[9], 0, 'joueur pas vulnérable');
  assert.ok(close(x[10], 0.5), 'attente de la ruée');
  assert.equal(x[11], 1, 'attente du souffle');
  // Vulnérable : en train de boire, ou en récupération après une attaque
  p.drink = { t: 0, healed: false };
  assert.equal(BossBrain.inputs(b, p, arena)[9], 1);
  p.drink = null;
  p.action = Combat.newAttack('heavy', 0);
  p.action.t = 0.7;
  assert.equal(BossBrain.inputs(b, p, arena)[9], 1);
  p.action.t = 0.1;
  assert.equal(BossBrain.inputs(b, p, arena)[9], 0, 'préparation : pas vulnérable');
  p.action = null;
  // Joueur derrière à gauche / à droite
  b.facing = Math.PI / 2;
  assert.ok(BossBrain.inputs(b, p, arena)[1] < 0.5);
  b.facing = -Math.PI / 2;
  assert.ok(BossBrain.inputs(b, p, arena)[1] > 0.5);
  // Rayons vers les murs : boss collé au mur de droite, face au mur
  b.pos.set(arena.inner(0).right - 50, 350);
  b.facing = 0;
  const near = BossBrain.inputs(b, p, arena);
  assert.ok(close(near[6], 1 - (50 * Math.SQRT2) / 200, 1e-6));
  assert.ok(close(near[6], near[7], 1e-9));
});

test('sorties → décision : seuils stricts à 0,6, zone morte autour de 0,5', () => {
  const { BossBrain } = env();
  const d = o => BossBrain.decide(o);
  assert.equal(d([0.5, 0.6, 0.6]).attack, false, 'seuil strict');
  assert.equal(d([0.5, 0.6, 0.6]).dodge, false);
  assert.equal(d([0.5, 0.61, 0.61]).attack, true);
  assert.equal(d([0.5, 0.61, 0.61]).dodge, true);
  assert.equal(d([0.5, 0, 0]).mode, 'hold');
  assert.equal(d([0.55, 0, 0]).mode, 'hold');
  assert.equal(d([0.9, 0, 0]).mode, 'approach');
  assert.ok(close(d([0.9, 0, 0]).speed, 0.8));
  assert.equal(d([0.1, 0, 0]).mode, 'retreat');
  assert.ok(close(d([0, 0, 0]).speed, 1));
});

test('mutation : copie indépendante, taux 0 sans effet, bruit gaussien sur poids et biais', () => {
  const { BossBrain } = env();
  const nn = BossBrain.create(lcg(2));
  const before = plain(nn.toJSON());
  const child = nn.copy();
  child.mutate(0, lcg(1));
  assert.deepEqual(plain(child.toJSON()), before);
  child.mutate(1, () => 0, () => 1);   // chaque paramètre + 0,1
  assert.deepEqual(plain(nn.toJSON()), before, 'le parent est intact');
  const after = child.toJSON();
  after.weights[0].forEach((w, k) => assert.ok(close(w, before.weights[0][k] + 0.1, 1e-6)));
  after.biases[1].forEach(b => assert.ok(close(b, 0.1, 1e-6)));
  // Taux 0,5 : environ la moitié des 195 paramètres changent (aléatoire fixé)
  const half = nn.copy();
  half.mutate(0.5, lcg(9), () => 1);
  let changed = 0;
  half.toJSON().weights.flat().concat(half.toJSON().biases.flat()).forEach((v, k) => {
    if (v !== before.weights.flat().concat(before.biases.flat())[k]) changed++;
  });
  const total = before.weights.flat().length + before.biases.flat().length;
  assert.ok(changed > total * 0.35 && changed < total * 0.65, 'changés : ' + changed + ' / ' + total);
});

test('sélection par tournoi et élitisme', () => {
  const { Genetic, BossBrain } = env();
  const pop = [5, 50, 10, 40, 1].map((f, i) => ({ brain: BossBrain.create(lcg(i + 1)), fitness: f }));
  // Le tournoi garde le meilleur des candidats tirés
  const picks = [0, 0.2, 0.4, 0.6, 0.8];
  let k = 0;
  assert.equal(Genetic.tournamentSelection(pop, () => picks[k++]).fitness, 50);
  k = 0;
  const lowOnly = [0, 0.8, 0.0, 0.8, 0];
  assert.equal(Genetic.tournamentSelection(pop, () => lowOnly[k++]).fitness, 5);
  // Élitisme : le meilleur passe intact en tête, la taille est respectée, les autres sont mutés
  const next = Genetic.nextBrains(pop, 8, 0.5, 1, lcg(4));
  assert.equal(next.length, 8);
  assert.deepEqual(plain(next[0].toJSON()), plain(pop[1].brain.toJSON()));
  assert.notEqual(next[0], pop[1].brain, 'copie, pas le même objet');
  const none = Genetic.nextBrains(pop, 3, 0, 0, lcg(4));
  for (const b of none) assert.ok(pop.some(p => JSON.stringify(p.brain.toJSON()) === JSON.stringify(b.toJSON())));
});

test('fitness : dégâts infligés − reçus + bonus de victoire − pénalité par coup dans le vide', () => {
  const { Fitness } = env();
  const base = { winner: 'draw', damageToPlayer: 0, damageToBoss: 0, bossWhiffs: 0, playerMaxHp: 100, bossMaxHp: 200 };
  assert.equal(Fitness.ofFight(base), 0);
  assert.equal(Fitness.ofFight({ ...base, damageToPlayer: 50 }), 50);
  assert.equal(Fitness.ofFight({ ...base, damageToBoss: 100 }), -50, 'dégâts reçus rapportés à la vie du boss');
  assert.equal(Fitness.ofFight({ ...base, winner: 'boss', damageToPlayer: 100 }), 200);
  assert.equal(Fitness.ofFight({ ...base, winner: 'player' }), 0, 'pas de bonus si le joueur gagne');
  assert.equal(Fitness.ofFight({ ...base, bossWhiffs: 3 }), -12);
  // Frapper dans le vide coûte : à dégâts égaux, viser rapporte plus
  assert.ok(Fitness.ofFight({ ...base, damageToPlayer: 22, bossWhiffs: 0 }) > Fitness.ofFight({ ...base, damageToPlayer: 22, bossWhiffs: 5 }));
  assert.equal(Fitness.compute([{ ...base, damageToPlayer: 40 }, { ...base, damageToPlayer: 20 }]), 30);
  assert.throws(() => Fitness.compute([]), { name: 'RangeError' });
});

function scriptedFight(e, seed, controller, maxTime = 90) {
  return new e.Fight({
    arena: new e.Arena(),
    playerController: new e.ScriptedPlayerController(e.seededRandom(seed), {}),
    bossController: controller,
    maxTime: maxTime, seed: seed
  });
}

test('combat : reproductible à graine égale, invariants à chaque pas', () => {
  const e = env();
  const brain = e.BossBrain.create(lcg(5));
  const run = () => {
    const f = scriptedFight(e, 42, new e.NeuralBossController(brain), 40);
    const arena = f.arena;
    while (!f.over) {
      f.step();
      for (const ent of [f.player, f.boss]) {
        assert.ok(Number.isFinite(ent.pos.x) && Number.isFinite(ent.pos.y));
        const b = arena.inner(ent.r);
        assert.ok(ent.pos.x >= b.left - 1e-9 && ent.pos.x <= b.right + 1e-9 && ent.pos.y >= b.top - 1e-9 && ent.pos.y <= b.bottom + 1e-9);
        assert.ok(ent.hp >= 0 && ent.hp <= ent.maxHp);
      }
      assert.ok(f.player.stamina >= 0 && f.player.stamina <= 100);
      const d = Math.hypot(f.player.pos.x - f.boss.pos.x, f.player.pos.y - f.boss.pos.y);
      assert.ok(d >= f.player.r + f.boss.r - 1e-6 || f.player.pos.x === f.arena.inner(f.player.r).left, 'corps séparés');
    }
    return f.result;
  };
  const a = run(), b = run();
  assert.deepEqual(plain(a), plain(b));
  assert.ok(['boss', 'player', 'draw'].includes(a.winner));
  assert.ok(a.duration <= 40 + 1e-9);
});

test('combat : un coup touche une seule fois, pendant sa fenêtre active', () => {
  const e = env();
  const arena = new e.Arena();
  const idleBoss = { name: 'test', decide: () => ({ mode: 'hold', speed: 0, attack: false, dodge: false }) };
  const idlePlayer = { intent: () => ({ move: { x: 0, y: 0 }, lock: true }) };
  const f = new e.Fight({ arena, playerController: idlePlayer, bossController: idleBoss, maxTime: 30 });
  f.player.pos.set(500, 350);
  f.boss.pos.set(570, 350);
  f.boss.facing = Math.PI;
  f.boss.action = e.Combat.newAttack('boss', Math.PI);
  let hits = 0, firstHit = null;
  while (f.boss.action && !f.over) {
    const t = f.boss.action.t;
    f.step();
    for (const ev of f.events) if (ev.type === 'hit') { hits++; if (firstHit === null) firstHit = t; }
  }
  assert.equal(hits, 1);
  assert.ok(firstHit >= 0.6 - 1e-9 && firstHit < 0.6 + e.Combat.ATTACKS.boss.active, 'frappe après 0,6 s de préparation');
  assert.equal(f.player.hp, 100 - e.Combat.ATTACKS.boss.damage);
  assert.equal(f.boss.stats.whiffs, 0);
});

test('combat : la roulade au bon moment évite le coup (i-frames)', () => {
  const e = env();
  const arena = new e.Arena();
  const idleBoss = { name: 'test', decide: () => ({ mode: 'hold', speed: 0, attack: false, dodge: false }) };
  let rollAt = null;
  const roller = { intent: (p, b) => ({ move: { x: 0, y: 0 }, lock: true, roll: b.action && b.action.t >= rollAt && b.action.t < rollAt + 0.02 }) };
  const outcome = at => {
    rollAt = at;
    const f = new e.Fight({ arena, playerController: roller, bossController: idleBoss, maxTime: 30 });
    f.player.pos.set(500, 350);
    f.boss.pos.set(560, 350);
    f.boss.action = e.Combat.newAttack('boss', Math.PI);
    while (f.boss.action && !f.over) f.step(); // garde : un combat fini ne fait plus avancer les minuteries
    return f.player.hp;
  };
  assert.equal(outcome(0.5), 100, 'roulade 0,1 s avant la frappe : esquivé');
  // Sans roulade, le même coup touche
  assert.equal(outcome(5), 100 - e.Combat.ATTACKS.boss.damage);
});

test('entraînement : une génération complète, population constante, historique et meilleur boss, reproductible', () => {
  const e = env();
  const settings = { ...e.Settings.defaults(), populationSize: 6, fightsPerBoss: 2, maxFightTime: 8, elites: 1 };
  const run = () => {
    const t = new e.Training(settings, { seed: 3 });
    let guard = 0;
    while (t.generation < 2 && guard++ < 1000) t.work(5000);
    return t;
  };
  const t = run();
  assert.equal(t.generation, 2);
  assert.equal(t.population.length, 6);
  assert.equal(t.history.length, 2);
  for (const h of t.history) {
    assert.ok(Number.isFinite(h.best) && Number.isFinite(h.mean) && h.best >= h.mean);
    assert.ok(h.winRate >= 0 && h.winRate <= 1);
  }
  assert.ok(t.best.brain && t.best.fitness === Math.max(...t.history.map(h => h.best)));
  assert.equal(t.lastTop.length, 5);
  assert.deepEqual(plain(run().history), plain(t.history));
  // Budget respecté : work ne dépasse jamais le nombre de pas demandé
  const t2 = new e.Training(settings, { seed: 3 });
  assert.equal(t2.work(123), 123);
  assert.ok(t2.progress() > 0 && t2.progress() < 1);
  // Nouveaux réglages appliqués à la génération suivante seulement
  t2.updateSettings({ ...settings, populationSize: 10 });
  assert.equal(t2.population.length, 6);
  for (let guard = 0; t2.generation < 1 && guard < 1000; guard++) t2.work(5000);
  assert.equal(t2.population.length, 10);
});

test('validation : le candidat qui gagne le plus souvent est retenu', () => {
  const e = env();
  const settings = { ...e.Settings.defaults(), maxFightTime: 20 };
  const t = new e.Training({ ...settings, populationSize: 2 }, { seed: 1 });
  const a = e.BossBrain.create(lcg(1)), b = e.BossBrain.create(lcg(2));
  const best = t.validate([{ brain: a }, { brain: b }], 3);
  assert.ok(best.brain === a || best.brain === b);
  assert.ok(best.winRate >= 0 && best.winRate <= 1);
});

test('comparaison : mêmes combats pour chaque boss, statistiques exactes', () => {
  const e = env();
  const record = { name: 'x', results: [
    { winner: 'boss', duration: 10, damageToPlayer: 100, damageToBoss: 20, bossWhiffs: 1 },
    { winner: 'player', duration: 30, damageToPlayer: 44, damageToBoss: 200, bossWhiffs: 3 },
    { winner: 'draw', duration: 20, damageToPlayer: 0, damageToBoss: 0, bossWhiffs: 2 },
    { winner: 'boss', duration: 20, damageToPlayer: 100, damageToBoss: 40, bossWhiffs: 0 }] };
  const s = e.Comparison.summarize(record);
  assert.equal(s.fights, 4);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 1);
  assert.equal(s.draws, 1);
  assert.equal(s.winRate, 0.5);
  assert.equal(s.avgDuration, 20);
  assert.equal(s.avgWinDuration, 15);
  assert.equal(s.avgDamageDealt, 61);
  assert.equal(s.avgWhiffs, 1.5);

  // Deux boss identiques sur les mêmes graines : résultats identiques
  const brain = e.BossBrain.create(lcg(8));
  const c = new e.Comparison([
    { name: 'a', makeController: () => new e.NeuralBossController(brain) },
    { name: 'b', makeController: () => new e.NeuralBossController(brain) }
  ], { ...e.Settings.defaults(), maxFightTime: 10 }, 3);
  let guard = 0;
  while (!c.done && guard++ < 1000) c.work(4000);
  assert.ok(c.done);
  assert.equal(c.progress(), 1);
  assert.deepEqual(plain(c.records[0].results), plain(c.records[1].results));
});

test('boss à états : attente → attaque → recul → attente', () => {
  const e = env();
  const arena = new e.Arena();
  const ctrl = new e.HandBossController();
  const p = new e.Player(500, 350), b = new e.Boss(700, 350);
  b.cooldown = 1;
  assert.equal(ctrl.decide(b, p, arena).mode, 'approach', 'attente : se rapproche à distance d\'attente');
  assert.equal(ctrl.state, 'attente');
  b.cooldown = 0;
  let d = ctrl.decide(b, p, arena);
  assert.equal(ctrl.state, 'attaque');
  assert.equal(d.attack, false, 'trop loin pour frapper');
  b.pos.set(580, 350);
  d = ctrl.decide(b, p, arena);
  assert.equal(d.attack, true);
  b.action = e.Combat.newAttack('boss', Math.PI);
  d = ctrl.decide(b, p, arena);
  assert.equal(ctrl.state, 'recul');
  assert.equal(d.mode, 'retreat');
  b.action = null;
  b.cooldown = 1; // attaque pas encore prête : après le recul il attend
  for (let i = 0; i < 60; i++) ctrl.decide(b, p, arena);
  assert.equal(ctrl.state, 'attente');
});

test('joueur scripté : esquive décidée une fois par attaque, roulade juste avant la frappe, repos', () => {
  const e = env();
  const arena = new e.Arena();
  const p = new e.Player(500, 350), b = new e.Boss(580, 350);
  const always = new e.ScriptedPlayerController(() => 0, { dodgeProbability: 0.5 });
  b.action = e.Combat.newAttack('boss', Math.PI);
  b.action.t = 0.3;
  assert.equal(always.intent(p, b, arena, e.Combat.DT).roll, false, 'trop tôt');
  b.action.t = 0.6 - e.ScriptedPlayerController.ROLL_LEAD + 0.01;
  assert.equal(always.intent(p, b, arena, e.Combat.DT).roll, true);
  assert.equal(always.dodgesPlanned, 1, 'tirage unique pour cette attaque');
  const never = new e.ScriptedPlayerController(() => 0.99, { dodgeProbability: 0.5 });
  assert.equal(never.intent(p, b, arena, e.Combat.DT).roll, false, 'il a décidé de ne pas esquiver');
  // Repos sous 25 d'endurance : il recule et n'attaque pas
  const tired = new e.ScriptedPlayerController(() => 0.5, {});
  const q = new e.Player(500, 350);
  q.stamina = 10;
  const idleBoss = new e.Boss(560, 350);
  idleBoss.cooldown = 1;
  const it = tired.intent(q, idleBoss, arena, e.Combat.DT);
  assert.equal(it.move.y, 1);
  assert.equal(it.light || it.heavy, false);
  // Punition pendant la récupération du boss
  const punisher = new e.ScriptedPlayerController(() => 0.5, {});
  const rb = new e.Boss(560, 350);
  rb.action = e.Combat.newAttack('boss', Math.PI);
  rb.action.t = 0.8;
  const pi = punisher.intent(new e.Player(500, 350), rb, arena, e.Combat.DT);
  assert.ok(pi.light || pi.heavy);
});
