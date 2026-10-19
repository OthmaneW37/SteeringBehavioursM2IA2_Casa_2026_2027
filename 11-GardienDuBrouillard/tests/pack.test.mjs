import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './helpers.mjs';

function world(seed = 11) {
  const e = load(seed);
  const g = e.get;
  const names = ['Flocking', 'Steering', 'Creux', 'Vehicle', 'Player', 'Pillar', 'Arena', 'Combat', 'PackBrain', 'NeuralPackController',
    'HandPackController', 'PackPlayerController', 'PackFight', 'PackFitness', 'PackSettings', 'PackTraining', 'Settings', 'seededRandom',
    'NeuralNetwork', 'Genetic'];
  const out = { ...e };
  for (const n of names) out[n] = g(n);
  return out;
}
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const decision = d => Object.assign({ pursue: 0, flank: 0, evade: 0, flock: 0, bite: false }, d);
const fixedPack = d => ({ name: 'test', decide: () => decision(d) });
const fixedPlayer = i => ({ intent: () => Object.assign({ move: { x: 0, y: 0 }, lock: false, light: false, heavy: false, roll: false, drink: false, avoid: false }, i) });
const W = world();

test('flocking : voisins dans le rayon (inclus), sans soi-même ni les morts', () => {
  const { Flocking, Creux } = W;
  const a = new Creux(100, 100), b = new Creux(150, 100), c = new Creux(100, 300), dead = new Creux(110, 100);
  dead.hp = 0;
  const near = Flocking.neighbours(a, [a, b, c, dead], 50);
  assert.ok(near.length === 1 && near[0] === b, 'b est exactement à 50 px : inclus');
  assert.equal(Flocking.neighbours(a, [a, b, c], 49.9).length, 0);
});

test('séparation : s\'écarte des voisins, plus fort quand ils sont près, limitée à maxForce, nulle hors rayon', () => {
  const { Flocking, Creux } = W;
  const a = new Creux(100, 100);
  const right = new Creux(120, 100);
  const f = Flocking.separation(a, [right], 34);
  assert.ok(f.x < 0 && close(f.y, 0), 'vers la gauche, loin du voisin');
  assert.ok(f.mag() <= a.maxForce + 1e-9);
  // Deux voisins : l'un très proche à droite, l'autre plus loin en bas ; la force part surtout vers la gauche
  const g = Flocking.separation(a, [new Creux(108, 100), new Creux(100, 130)], 34);
  assert.ok(-g.x > -g.y, 'le plus proche compte le plus');
  assert.equal(Flocking.separation(a, [new Creux(200, 100)], 34).mag(), 0, 'hors rayon');
  assert.equal(Flocking.separation(a, [], 34).mag(), 0);
  // Force de Reynolds : désirée − vitesse (un Creux qui fuit déjà à pleine vitesse n'est plus poussé)
  a.vel.set(-a.maxSpeed, 0);
  assert.ok(Flocking.separation(a, [right], 34).mag() < 1e-9);
});

test('alignement et cohésion : vers la vitesse moyenne et vers le centre des voisins, limités à maxForce', () => {
  const { Flocking, Creux } = W;
  const a = new Creux(100, 100);
  const b = new Creux(140, 100), c = new Creux(100, 140);
  b.vel.set(0, 2); c.vel.set(0, 2);
  const al = Flocking.alignment(a, [b, c]);
  assert.ok(al.y > 0 && close(al.x, 0));
  assert.ok(close(al.mag(), a.maxForce));
  const co = Flocking.cohesion(a, [b, c]);
  assert.ok(co.x > 0 && co.y > 0 && close(co.x, co.y), 'vers (120, 120)');
  assert.ok(co.mag() <= a.maxForce + 1e-9);
  // Centre = MOYENNE des positions : deux voisins au même point (140, 100) → droit vers la droite
  const co2 = Flocking.cohesion(a, [new Creux(140, 100), new Creux(140, 100)]);
  assert.ok(co2.x > 0 && close(co2.y, 0, 1e-9));
  assert.equal(Flocking.alignment(a, []).mag(), 0);
  assert.equal(Flocking.cohesion(a, []).mag(), 0);
});

test('pursue vise la position future, evade la fuit ; la version du cours ne dessine pas', () => {
  const { Steering, Creux, Player } = W;
  const c = new Creux(100, 100);
  const p = new Player(300, 100);
  p.vel.set(0, 3);
  const f = c.pursue(p);
  assert.ok(f.y > 0, 'vise devant le chevalier (il descend)');
  const s = c.seek(p.pos);
  assert.ok(close(s.y, 0), 'seek vise sa position actuelle');
  const e = c.evade(p);
  assert.ok(e.x < 0 && e.y < 0, 'fuit la position future');
  assert.ok(e.mag() <= c.maxForce + 1e-9);
  // flee de Reynolds (steering.js) : désirée inversée puis force recalculée, et non −seek
  c.vel.set(-c.maxSpeed, 0);
  assert.ok(Steering.flee(c, p.pos).mag() < 1e-9, 'déjà en fuite à pleine vitesse : aucune force');
});

test('Creux : entité Vehicle, poids de la décision, somme limitée, flanc du côté libre', () => {
  const { Creux, Player, Arena, Vehicle, Flocking } = W;
  const arena = new Arena();
  const p = new Player(500, 350);
  const c = new Creux(400, 350);
  assert.ok(c instanceof Vehicle);
  c.perceive([c]);
  c.control(decision({ pursue: 1 }), p, arena);
  assert.ok(c.acc.x > 0 && close(c.acc.y, 0), 'pursue seul : vers le chevalier');
  assert.ok(c.acc.mag() <= c.maxForce + 1e-9);
  const d = new Creux(400, 350);
  d.perceive([d]);
  d.control(decision({ evade: 1 }), p, arena);
  assert.ok(d.acc.x < 0, 'evade seul : loin du chevalier');
  // Tous les poids à 1 : la somme des quatre comportements reste limitée à maxForce
  const e = new Creux(400, 350);
  e.perceive([e]);
  e.control(decision({ pursue: 1, flank: 1, evade: 0, flock: 1 }), p, arena);
  assert.ok(e.acc.mag() <= e.maxForce + 1e-9);
  assert.ok(e.forces.flank.mag() > 0 && e.forces.pursue.mag() > 0, 'forces gardées pour le debug');
  // Flanc : un voisin du côté des angles croissants autour du chevalier → on part vers les angles décroissants
  // (me est à l'angle π ; (445, 340) est à −π + 0,18, soit π + 0,18 : angle croissant)
  const me = new Creux(440, 350), mate = new Creux(445, 340);
  assert.equal(Creux.flankSide(me, p, [mate], 1), -1);
  assert.equal(Creux.flankSide(me, p, [new Creux(445, 360)], -1), 1);
  assert.equal(Creux.flankSide(me, p, [], -1), -1, 'sans voisin : sens gardé');
  const fp = me.flankPoint(p, 1);
  assert.ok(close(Math.hypot(fp.x - p.pos.x, fp.y - p.pos.y), Creux.FLANK_RADIUS, 1e-6), 'point sur le cercle de flanc');
  // Perception : voisins dans le rayon réglable seulement
  me.perception = 20;
  const seen = me.perceive([me, mate, new Creux(480, 350)]);
  assert.ok(seen.length === 1 && seen[0] === mate);
  assert.ok(Flocking.neighbours(me, [mate], 5).length === 0);
});

test('Creux : morsure à portée seulement, attente en secondes, coup reçu qui interrompt, mort', () => {
  const { Creux, Player, Arena, Combat } = W;
  const arena = new Arena();
  const p = new Player(500, 350);
  const reach = Creux.BITE.reach + p.r + Creux.BITE_MARGIN;
  const far = new Creux(500 - reach - 1, 350);
  far.perceive([far]);
  far.control(decision({ bite: true }), p, arena);
  assert.equal(far.action, null, 'hors de portée');
  const c = new Creux(500 - reach, 350);
  c.perceive([c]);
  c.control(decision({ bite: false }), p, arena);
  assert.equal(c.action, null, 'la décision dit non');
  c.control(decision({ bite: true }), p, arena);
  assert.equal(c.action.kind, 'bite', 'à portée exacte (seuil inclus)');
  assert.ok(close(c.biteCooldown, Creux.BITE_COOLDOWN));
  // Coup reçu pendant la préparation : la morsure est interrompue
  c.receiveHit(10);
  assert.equal(c.action, null);
  assert.equal(c.hp, c.maxHp - 10);
  // Attente : exactement BITE_COOLDOWN secondes
  const steps = Math.round(Creux.BITE_COOLDOWN / Combat.DT);
  for (let i = 0; i < steps - 1; i++) c.tick(Combat.DT);
  assert.ok(c.biteCooldown > 0);
  c.tick(Combat.DT);
  assert.ok(c.biteCooldown <= 1e-9);
  // Morsure menée à terme sans toucher : comptée dans le vide
  c.startBite(0);
  for (let t = 0; t < Combat.duration(Creux.BITE) + 0.05; t += Combat.DT) c.tick(Combat.DT);
  assert.equal(c.action, null);
  assert.equal(c.stats.whiffs, 1);
  // Mort : plus de force de pilotage, plus de morsure
  c.receiveHit(1000);
  assert.equal(c.alive, false);
  c.acc.set(0, 0);
  c.control(decision({ pursue: 1, bite: true }), p, arena);
  assert.equal(c.action, null);
  assert.equal(c.forces, null);
});

test('cerveau de la meute : 12 entrées dans [0, 1], seuil strict de morsure, UN réseau partagé', () => {
  const { PackBrain, NeuralPackController, Creux, Player, Arena, seededRandom } = W;
  const arena = new Arena();
  const brain = PackBrain.create(seededRandom(4));
  assert.deepEqual(plain(brain.sizes), plain(PackBrain.SIZES));
  const p = new Player(500, 350);
  p.facing = 0;   // regarde vers la droite
  const a = new Creux(600, 350), b = new Creux(400, 350), mate = new Creux(610, 380);
  for (const c of [a, b]) c.perceive([a, b, mate]);
  const ia = PackBrain.inputs(a, p, arena), ib = PackBrain.inputs(b, p, arena);
  assert.equal(ia.length, PackBrain.INPUT_LABELS.length);
  for (const v of ia.concat(ib)) assert.ok(v >= 0 && v <= 1);
  assert.ok(close(ia[1], 1) && close(ib[1], 0), 'il regarde a, il tourne le dos à b');
  assert.ok(ia[9] < 0.2 && close(ib[9], 1), 'a a un voisin juste à côté (en angle), b est seul de son côté');
  // Un seul cerveau : deux Creux, deux situations, deux décisions
  const ctrl = new NeuralPackController(brain);
  const da = ctrl.decide(a, p, arena);
  const oa = ctrl.lastOutputs.slice();
  ctrl.decide(b, p, arena);
  assert.ok(ctrl.brain === brain);
  assert.notDeepEqual(Array.from(oa), Array.from(ctrl.lastOutputs));
  assert.ok(da.pursue >= 0 && da.pursue <= 1);
  assert.equal(PackBrain.decide([0, 0, 0, 0, 0.6]).bite, false, 'seuil strict');
  assert.equal(PackBrain.decide([0, 0, 0, 0, 0.61]).bite, true);
  assert.ok(close(PackBrain.angularGap(a, p.pos, []), Math.PI));
});

test('meute à la main : recule quand le chevalier attaque de près, poursuit sinon, sans flanc', () => {
  const { HandPackController, Creux, Player, Arena, Combat } = W;
  const arena = new Arena();
  const h = new HandPackController();
  const p = new Player(500, 350);
  const near = new Creux(500 - HandPackController.RECUL_DISTANCE + 1, 350);
  assert.equal(h.decide(near, p, arena).pursue, 1);
  p.action = Combat.newAttack('light', 0);
  const d = h.decide(near, p, arena);
  assert.equal(d.evade, 1);
  assert.equal(d.pursue, 0);
  assert.equal(d.flank, 0);
  assert.equal(h.decide(new Creux(300, 350), p, arena).evade, 0, 'loin : il continue');
});

test('encerclement : trois Creux répartis l\'encerclent, trois du même côté non, rayon et morts respectés', () => {
  const { PackFight, Creux } = W;
  const center = { x: 500, y: 350 };
  const around = n => Array.from({ length: n }, (_, k) => new Creux(500 + 60 * Math.cos(2 * Math.PI * k / n), 350 + 60 * Math.sin(2 * Math.PI * k / n)));
  const e3 = PackFight.encirclement(center, around(3));
  assert.equal(e3.surrounded, true);
  assert.ok(close(e3.coverage, 1, 1e-9), 'répartition régulière : couverture 1');
  assert.ok(close(e3.gap, 2 * Math.PI / 3, 1e-9));
  const side = [0, 0.3, 0.6].map(a => new Creux(500 + 60 * Math.cos(a), 350 + 60 * Math.sin(a)));
  const es = PackFight.encirclement(center, side);
  assert.equal(es.surrounded, false);
  assert.ok(es.coverage < 0.5);
  assert.equal(PackFight.encirclement(center, around(2)).surrounded, false, 'deux Creux ne suffisent jamais');
  const four = around(4);
  four[0].hp = 0;
  assert.equal(PackFight.encirclement(center, four).count, 3, 'un mort ne compte pas');
  const far = around(3).map(c => { c.pos.x = 500 + (c.pos.x - 500) * 3; c.pos.y = 350 + (c.pos.y - 350) * 3; return c; });
  assert.equal(PackFight.encirclement(center, far).count, 0, 'hors du rayon');
  // Écart d'exactement 180° : pas encerclé (il reste une sortie)
  const half = [Math.PI / 2, Math.PI, 3 * Math.PI / 2].map(a => new Creux(500 + 60 * Math.cos(a), 350 + 60 * Math.sin(a)));
  assert.equal(PackFight.encirclement(center, half).surrounded, false);
});

test('combat de meute : un coup lourd touche tous les Creux du cône une fois, un pilier pare', () => {
  const { PackFight, Arena, Combat } = W;
  const arena = new Arena();
  const f = new PackFight({ arena, size: 3, playerController: fixedPlayer({}), packController: fixedPack({}), maxTime: 10 });
  const p = f.player;
  p.pos.set(500, 350);
  f.creux[0].pos.set(540, 340);
  f.creux[1].pos.set(545, 365);
  f.creux[2].pos.set(460, 350);   // derrière lui
  p.facing = 0;
  p.action = Combat.newAttack('heavy', 0);
  p.action.t = Combat.ATTACKS.heavy.windup;
  f.resolvePlayerHit();
  f.resolvePlayerHit();
  const dmg = Combat.ATTACKS.heavy.damage;
  assert.equal(f.creux[0].hp, f.creux[0].maxHp - dmg);
  assert.equal(f.creux[1].hp, f.creux[1].maxHp - dmg, 'les deux Creux du cône, une seule fois chacun');
  assert.equal(f.creux[2].hp, f.creux[2].maxHp, 'celui de derrière est épargné');
  assert.equal(f.damageToPack, 2 * dmg);
  // Avec un pilier entre les deux, le coup est paré
  const g = new PackFight({ arena, size: 1, pillars: 1, playerController: fixedPlayer({}), packController: fixedPack({}), maxTime: 10 });
  const pil = g.pillars[0];
  g.player.pos.set(pil.pos.x - 45, pil.pos.y);
  g.creux[0].pos.set(pil.pos.x + 45, pil.pos.y);
  g.player.action = Combat.newAttack('heavy', 0);
  g.player.action.t = Combat.ATTACKS.heavy.windup;
  g.player.action.spec = Object.assign({}, Combat.ATTACKS.heavy, { reach: 120 });
  g.resolvePlayerHit();
  assert.equal(g.creux[0].hp, g.creux[0].maxHp);
  assert.equal(g.events[0].type, 'blocked');
});

test('combat de meute : morsure qui touche, roulade qui l\'évite, une seule fois par morsure', () => {
  const { PackFight, Arena, Combat, Creux } = W;
  const arena = new Arena();
  const f = new PackFight({ arena, size: 1, playerController: fixedPlayer({}), packController: fixedPack({}), maxTime: 10 });
  const c = f.creux[0], p = f.player;
  p.pos.set(500, 350);
  c.pos.set(470, 350);
  c.startBite(0);
  c.action.t = Creux.BITE.windup;
  f.resolveBite(c);
  f.resolveBite(c);
  assert.equal(p.hp, p.maxHp - Creux.BITE.damage, 'une seule fois');
  assert.equal(f.damageToPlayer, Creux.BITE.damage);
  c.action = null;
  c.startBite(0);
  c.action.t = Creux.BITE.windup;
  p.roll = { t: 0 };
  f.resolveBite(c);
  assert.equal(p.hp, p.maxHp - Creux.BITE.damage, 'images d\'invulnérabilité');
  assert.equal(f.events.at(-1).type, 'dodged');
  // Fin du combat : la meute gagne quand le chevalier meurt, le chevalier quand la meute est détruite
  p.hp = 0;
  f.step();
  assert.equal(f.result.winner, 'pack');
  const g = new PackFight({ arena, size: 2, playerController: fixedPlayer({}), packController: fixedPack({}), maxTime: 10 });
  for (const k of g.creux) k.hp = 0;
  g.step();
  assert.equal(g.result.winner, 'player');
  assert.equal(g.result.killed, 2);
  // Corps : deux Creux qui se chevauchent sont écartés (ni entre eux, ni avec le chevalier)
  const k = new PackFight({ arena, size: 2, playerController: fixedPlayer({}), packController: fixedPack({}), maxTime: 10 });
  k.creux[0].pos.set(400, 300);
  k.creux[1].pos.set(405, 300);
  k.resolveBodies();
  assert.ok(Math.hypot(k.creux[1].pos.x - k.creux[0].pos.x, k.creux[1].pos.y - k.creux[0].pos.y) >= 2 * Creux.STATS.r - 1e-6);
  const h = new PackFight({ arena, size: 2, playerController: fixedPlayer({}), packController: fixedPack({}), maxTime: 0.5 });
  h.run();
  assert.equal(h.result.winner, 'draw');
  assert.ok(close(h.result.duration, 0.5, Combat.DT + 1e-9));
});

test('simulation courte : valeurs finies, corps dans l\'arène, combats reproductibles, plafond de la meute', () => {
  const { PackFight, Arena, HandPackController, PackPlayerController, seededRandom, Creux } = W;
  const arena = new Arena();
  const run = seed => {
    const f = new PackFight({ arena, size: 6, pillars: 4, maxTime: 20, seed,
      playerController: new PackPlayerController(seededRandom(seed)), packController: new HandPackController() });
    let steps = 0;
    while (!f.over) {
      f.step();
      steps++;
      if (steps % 30 === 0) {
        for (const b of [f.player].concat(f.creux)) {
          assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y) && Number.isFinite(b.vel.x));
          const box = arena.inner(b.r);
          assert.ok(b.pos.x >= box.left - 1e-6 && b.pos.x <= box.right + 1e-6 && b.pos.y >= box.top - 1e-6 && b.pos.y <= box.bottom + 1e-6);
          assert.ok(b.vel.mag() <= Math.max(b.maxSpeed, 4) + 1e-6);
        }
        assert.equal(f.creux.length, 6, 'jamais plus de Creux que la taille de la meute');
      }
    }
    return f.result;
  };
  const a = run(31), b = run(31);
  assert.deepEqual(plain(a), plain(b), 'même graine, même combat');
  assert.ok(a.surrounded >= 0 && a.surrounded <= 1 && a.coverage >= 0 && a.coverage <= 1);
  assert.ok(a.killed >= 0 && a.killed <= 6);
  assert.equal(new PackFight({ arena, size: 4, playerController: fixedPlayer({}), packController: fixedPack({}) }).creux.length, 4);
  assert.ok(new PackFight({ arena, size: 4, perception: 90, playerController: fixedPlayer({}), packController: fixedPack({}) }).creux.every(c => c.perception === 90));
  assert.ok(Creux.STATS.maxSpeed < 3.2, 'le chevalier peut toujours distancer un Creux');
});

test('note collective : dégâts, pertes, victoire, encerclement plafonné sous la victoire, morsures dans le vide', () => {
  const { PackFitness } = W;
  const base = { damageToPlayer: 0, playerMaxHp: 100, killed: 0, packSize: 5, winner: 'player', surrounded: 0, biteWhiffs: 0 };
  const w = PackFitness.WEIGHTS;
  assert.equal(PackFitness.ofFight(base), 0);
  assert.ok(close(PackFitness.ofFight({ ...base, damageToPlayer: 50 }), w.dealt / 2));
  assert.ok(close(PackFitness.ofFight({ ...base, killed: 5 }), -w.lost));
  assert.ok(close(PackFitness.ofFight({ ...base, winner: 'pack' }), w.win));
  assert.ok(close(PackFitness.ofFight({ ...base, surrounded: 0.5 }), w.surround / 2));
  assert.ok(close(PackFitness.ofFight({ ...base, biteWhiffs: 3 }), -3 * w.whiff));
  // Encercler tout le combat sans mordre rapporte moins que gagner
  assert.ok(PackFitness.ofFight({ ...base, surrounded: 1 }) < PackFitness.ofFight({ ...base, winner: 'pack' }));
  assert.throws(() => PackFitness.compute([]), { name: 'RangeError' });
  assert.ok(close(PackFitness.compute([{ ...base, winner: 'pack' }, base]), w.win / 2));
});

test('joueur robot face à la meute : roule ROLL_LEAD s avant la frappe, acculé il se bat au lieu de fuir', () => {
  const { PackPlayerController, Player, Creux, Arena, Combat } = W;
  const arena = new Arena();
  const always = new PackPlayerController(() => 0, { dodgeProbability: 1 });
  const p = new Player(500, 350);
  const c = new Creux(470, 350);
  c.startBite(0);
  c.action.t = Creux.BITE.windup - PackPlayerController.ROLL_LEAD - 0.02;
  assert.equal(always.intent(p, [c], arena, Combat.DT).roll, false, 'trop tôt');
  c.action.t = Creux.BITE.windup - PackPlayerController.ROLL_LEAD;
  const i = always.intent(p, [c], arena, Combat.DT);
  assert.equal(i.roll, true);
  assert.equal(i.focus, c);
  // Sans endurance : un pas de côté hors de portée au lieu de rouler
  const tired = new Player(500, 350);
  tired.stamina = PackPlayerController.ROLL_RESERVE - 1;
  const step = always.intent(tired, [c], arena, Combat.DT);
  assert.equal(step.roll, false);
  assert.ok(step.move.x > 0, 'il s\'éloigne du Creux');
  // Encerclé au milieu : il sort du cercle
  const mid = new Player(500, 350);
  const ring = [0, 2.1, 4.2].map(a => new Creux(500 + 50 * Math.cos(a), 350 + 50 * Math.sin(a)));
  ring[0].pos.x += 10; // centre des Creux un peu décalé : une direction de sortie existe
  const out = new PackPlayerController(() => 0.99, { dodgeProbability: 0 }).intent(mid, ring, arena, Combat.DT);
  assert.ok(Math.hypot(out.move.x, out.move.y) > 0.9 && !out.lock);
  // Acculé dans un coin : aucune place pour reculer, il attaque le plus proche
  const b = arena.inner(14);
  const cornered = new Player(b.left + 2, b.top + 2);
  const pack = [[40, 10], [10, 40], [35, 35]].map(([dx, dy]) => new Creux(b.left + dx, b.top + dy));
  const ctrl = new PackPlayerController(() => 0.99, { dodgeProbability: 0 });
  assert.equal(PackPlayerController.room(cornered, PackPlayerController.awayFrom(cornered, pack), arena), false);
  const fight = ctrl.intent(cornered, pack, arena, Combat.DT);
  assert.equal(fight.lock, true);
  assert.ok(fight.light || fight.heavy, 'il frappe');
});

test('entraînement de la meute : générations, champion validé sur des combats de test, reproductible', () => {
  const { PackTraining, PackSettings, Settings, NeuralNetwork } = W;
  const small = Object.assign(Settings.defaults(), PackSettings.defaults(), { packPopulation: 10, packFights: 1, packSize: 3, maxFightTime: 4 });
  const saved = PackTraining.VALIDATION_FIGHTS;
  PackTraining.VALIDATION_FIGHTS = 2;
  try {
    const t = new PackTraining(small, { seed: 3 });
    assert.equal(t.population.length, 10);
    assert.ok(t.population[0] instanceof NeuralNetwork);
    while (t.generation < 2 || t.phase === 'validate') t.work(5000);
    assert.ok(t.generation >= 2);
    assert.equal(t.history.length, t.generation);
    assert.ok(t.champion && t.champion.brain);
    assert.ok(t.champion.winRate >= 0 && t.champion.winRate <= 1);
    for (const h of t.history) assert.ok(h.best >= h.mean - 1e-9);
    assert.equal(t.population.length, 10);
    const u = new PackTraining(small, { seed: 3 });
    while (u.generation < t.generation) u.work(3000);
    assert.deepEqual(plain(u.history.slice(0, 2)), plain(t.history.slice(0, 2)), 'même graine, même entraînement (budget différent)');
    assert.ok(t.progress() >= 0 && t.progress() <= 1);
    // Un candidat qui gagne moins souvent à l'examen ne remplace pas le champion
    const champ = t.champion;
    t.queue = [{ brain: t.population[1], generation: 99 }];
    t.vResults = Array.from({ length: PackTraining.VALIDATION_FIGHTS }, () => ({ winner: 'player', damageToPlayer: 0, playerMaxHp: 100, killed: 3, packSize: 3, surrounded: 0, coverage: 0, duration: 1, biteWhiffs: 0 }));
    t.champion = Object.assign({}, champ, { winRate: 0.5 });
    const kept = t.champion;
    t.finishCandidate();
    assert.equal(t.champion, kept, 'champion gardé');
  } finally {
    PackTraining.VALIDATION_FIGHTS = saved;
  }
});

test('réglages de la meute : valeurs hors plage refusées, défauts dans les plages', () => {
  const { PackSettings } = W;
  for (const [name, p] of Object.entries(PackSettings.PARAMETERS)) {
    assert.equal(PackSettings.check(name, p.initial), p.initial);
    for (const bad of [p.min - 1, p.max + 1, NaN, '1', undefined]) {
      assert.throws(() => PackSettings.check(name, bad), { name: 'RangeError' }, `${name} = ${bad}`);
    }
  }
  assert.throws(() => PackSettings.check('packSize', 4.5), { name: 'RangeError' });
  assert.throws(() => PackSettings.check('inconnu', 1), { name: 'RangeError' });
  assert.deepEqual(plain(PackSettings.validate(PackSettings.defaults())), plain(PackSettings.defaults()));
});

test('le rendu de la meute ne modifie jamais l\'état du combat ; lumières et debug lus sans recalcul', () => {
  const { PackFight, Arena, PackPlayerController, NeuralPackController, PackBrain, seededRandom, get } = W;
  const Hud = get('Hud'), DebugPanel = get('DebugPanel'), Lighting = get('Lighting'), Effects = get('Effects');
  const arena = new Arena();
  const make = () => new PackFight({ arena, size: 5, pillars: 4, maxTime: 60, seed: 21,
    playerController: new PackPlayerController(seededRandom(21)), packController: new NeuralPackController(PackBrain.create(seededRandom(2))) });
  const f = make();
  for (let i = 0; i < 300 && !f.over; i++) f.step();
  f.creux[0].startBite(0.5);
  f.creux[1].hp = 0;
  const snap = () => JSON.stringify({
    p: [f.player.pos, f.player.vel, f.player.acc, f.player.hp, f.player.stamina, f.player.facing, f.player.action && f.player.action.t],
    c: f.creux.map(c => [c.pos, c.vel, c.acc, c.hp, c.facing, c.action && c.action.t, c.biteCooldown, c.hurtTimer, c.deadTime, c.side, c.near.length, c.stats]),
    t: f.time, s: f.surroundTime, e: f.lastEncirclement
  });
  const before = snap();
  const fx = new Effects(100);
  for (let k = 0; k < 3; k++) {
    f.player.show();
    for (const c of f.creux) { c.show(); c.showTelegraph(); c.showDebug(); }
    DebugPanel.drawPackWorld(f);
    DebugPanel.drawPack(f.packController, f, 0, 0, 60);
    Hud.drawPack(f.creux, 100);
    const lights = Lighting.sources(f, arena.campfirePos, 1);
    assert.equal(lights.length, 2 + f.alivePack.length, 'feu, chevalier, puis une lumière par Creux vivant');
    fx.add({ type: 'creuxDeath', x: 1, y: 2 }, 1);
    fx.update(0.1);
    fx.showParticles();
    fx.show();
  }
  assert.equal(snap(), before, 'état identique après le dessin');
  // Le debug lit les valeurs gardées pour le Creux visé
  const rows = DebugPanel.packRows(f.packController, f.focus);
  assert.equal(rows.length, PackBrain.INPUT_LABELS.length + PackBrain.OUTPUT_LABELS.length);
  assert.equal(DebugPanel.packRows(null, f.focus).length, 0);
  // La suite est celle d'un combat jamais dessiné
  const twin = make();
  for (let i = 0; i < 300 && !twin.over; i++) twin.step();
  assert.deepEqual(plain(twin.player.pos), plain(f.player.pos));
});
