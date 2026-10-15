import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain, Vector } from './helpers.mjs';

function env(seed = 4) {
  const e = load(seed);
  const g = e.get;
  const names = ['Combat', 'Arena', 'Player', 'Boss', 'Fight', 'MistPatch', 'Bloodstain', 'Steering', 'BossBrain',
    'HandBossController', 'ScriptedPlayerController', 'NeuralBossController', 'seededRandom', 'Settings'];
  const out = { ...e };
  for (const n of names) out[n] = g(n);
  out.arena = new out.Arena();
  return out;
}
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const idleBoss = { name: 'test', decide: () => ({ mode: 'hold', speed: 0, attack: false, dodge: false, charge: false, breath: false }) };
const idlePlayer = { intent: () => ({ move: { x: 0, y: 0 }, lock: true }) };

// ---------- Fioles d'Estus ----------

test('fiole : une charge, soin de 25 exactement à 0,6 s, 1 s pour boire, marche lente', () => {
  const { Player, Boss, Combat, arena } = env();
  const E = Combat.PLAYER.estus;
  const p = new Player(300, 300), b = new Boss(700, 300);
  assert.equal(p.estus, E.charges);
  p.hp = 40;
  p.control({ move: { x: 0, y: 0 }, lock: true, drink: true }, b, arena);
  assert.ok(p.drink);
  assert.equal(p.estus, E.charges - 1);
  assert.equal(p.canAct(), false, 'pas d\'autre action en buvant');
  assert.equal(p.vulnerable, true);
  // Marche lente pendant la gorgée
  p.control({ move: { x: 1, y: 0 }, lock: false }, b, arena);
  assert.equal(p.maxSpeed, E.maxSpeed);
  p.tick(0.3); p.tick(0.29);
  assert.equal(p.hp, 40, 'pas encore soigné à 0,59 s');
  p.tick(0.011);
  assert.equal(p.hp, 40 + E.heal, 'soigné à 0,601 s');
  p.tick(0.3);
  assert.ok(p.drink, 'encore en train de boire à 0,9 s');
  p.tick(0.11);
  assert.equal(p.drink, null);
  p.control({ move: { x: 1, y: 0 }, lock: false }, b, arena);
  assert.equal(p.maxSpeed, Combat.PLAYER.maxSpeed, 'vitesse normale après la gorgée');
  // Le soin ne dépasse pas la vie maximale
  const full = new Player(300, 300);
  full.hp = 95;
  full.control({ move: { x: 0, y: 0 }, lock: true, drink: true }, b, arena);
  full.tick(0.7);
  assert.equal(full.hp, 100);
});

test('fiole : un coup avant le soin interrompt la gorgée (fiole perdue), après le soin non', () => {
  const { Player, Boss, arena } = env();
  const b = new Boss(700, 300);
  const p = new Player(300, 300);
  p.hp = 50;
  p.control({ move: { x: 0, y: 0 }, lock: true, drink: true }, b, arena);
  p.tick(0.3);
  assert.equal(p.receiveHit(20), true);
  assert.equal(p.drink, null, 'gorgée interrompue');
  assert.equal(p.hp, 30);
  p.tick(1);
  assert.equal(p.hp, 30, 'pas de soin après l\'interruption');
  assert.equal(p.stats.drinksInterrupted, 1);
  const q = new Player(300, 300);
  q.hp = 50;
  q.control({ move: { x: 0, y: 0 }, lock: true, drink: true }, b, arena);
  q.tick(0.7);
  q.receiveHit(20);
  assert.equal(q.hp, 55, 'soin déjà reçu');
  assert.equal(q.stats.drinksInterrupted, 0);
});

test('fiole : impossible sans charge ; le combat fixe le nombre de fioles ; réapparition = fioles rendues', () => {
  const { Player, Boss, Fight, Combat, arena } = env();
  const p = new Player(300, 300), b = new Boss(700, 300);
  p.estus = 0;
  p.control({ move: { x: 0, y: 0 }, lock: true, drink: true }, b, arena);
  assert.equal(p.drink, null);
  const f = new Fight({ arena, playerController: idlePlayer, bossController: idleBoss, maxTime: 5, estus: 4 });
  assert.equal(f.player.estus, 4);
  p.respawn(100, 100);
  assert.equal(p.estus, Combat.PLAYER.estus.charges);
});

// ---------- Brume ----------

test('brume : la nappe apparaît où le souffle vise, brûle (même en roulade) et ralentit, puis disparaît', () => {
  const { Fight, Combat, arena } = env();
  const B = Combat.BOSS.breath;
  const f = new Fight({ arena, playerController: idlePlayer, bossController: idleBoss, maxTime: 30 });
  f.player.pos.set(300, 300);
  f.boss.pos.set(700, 300);
  f.boss.pendingZone = { x: 300, y: 300 };
  f.step();
  assert.equal(f.zones.length, 1);
  assert.equal(f.boss.pendingZone, null);
  assert.ok(f.events.some(e => e.type === 'mist'));
  const hp0 = f.player.hp;
  for (let i = 0; i < 60; i++) f.step();
  assert.ok(f.player.inMist);
  assert.ok(Math.abs((hp0 - f.player.hp) - B.dps) < 0.5, 'environ dps points par seconde : ' + (hp0 - f.player.hp));
  assert.ok(close(f.mistDamage, f.damageToPlayer, 1e-6));
  assert.equal(f.lastCause, 'brume');
  // Ralentissement (marche) ; l'invulnérabilité ne protège pas de la brûlure
  f.player.control({ move: { x: 1, y: 0 }, lock: false }, f.boss, arena);
  assert.ok(close(f.player.maxSpeed, Combat.PLAYER.maxSpeed * B.slow));
  f.player.roll = { t: 0 };
  const before = f.player.hp;
  f.updateZones(0.5);
  assert.ok(f.player.hp < before);
  f.player.roll = null;
  // Disparition après sa durée de vie
  for (let i = 0; i < B.lifetime * 60; i++) f.updateZones(1 / 60);
  assert.equal(f.zones.length, 0);
});

test('brume : au plus 3 nappes, la plus ancienne disparaît ; le joueur garde la référence', () => {
  const { Fight, Combat, arena } = env();
  const f = new Fight({ arena, playerController: idlePlayer, bossController: idleBoss, maxTime: 30 });
  for (let i = 0; i < 5; i++) {
    f.boss.pendingZone = { x: 100 + i * 150, y: 600 };
    f.updateZones(0.01);
  }
  assert.equal(f.zones.length, Combat.BOSS.breath.maxZones);
  assert.deepEqual(plain(f.zones.map(z => z.pos.x)), [400, 550, 700]);
  assert.equal(f.player.zones, f.zones);
});

test('évitement des nappes : nul si rien sur le chemin, pousse sur le côté si une nappe est devant', () => {
  const { Player, MistPatch, Steering } = env();
  const p = new Player(300, 300);
  p.vel.set(3, 0);
  assert.equal(Steering.avoidZones(p, []).mag(), 0);
  const far = new MistPatch(300, 600, 60, 6);
  assert.equal(Steering.avoidZones(p, [far]).mag(), 0);
  const ahead = new MistPatch(390, 320, 60, 6); // devant, un peu en dessous
  const f = Steering.avoidZones(p, [ahead]);
  assert.ok(f.mag() > 0 && f.mag() <= p.maxForce + 1e-12);
  assert.ok(f.y < 0, 'contourne par le haut, loin du centre de la nappe');
  // Le joueur robot l'utilise (intent.avoid), pas l'humain
  p.zones = [ahead];
  p.control({ move: { x: 0, y: 0 }, lock: false, avoid: false }, null, { clampPoint: q => ({ x: q.x, y: q.y, clamped: false }) });
  const without = p.acc.copy();
  p.acc.set(0, 0);
  p.control({ move: { x: 0, y: 0 }, lock: false, avoid: true }, null, { clampPoint: q => ({ x: q.x, y: q.y, clamped: false }) });
  assert.notDeepEqual(plain(p.acc), plain(without));
});

// ---------- Ruée ----------

test('ruée : visée sur la position prédite, figée avant la fin de la préparation, charge rapide', () => {
  const { Player, Boss, Combat, Steering, arena } = env();
  const C = Combat.BOSS.charge;
  const b = new Boss(300, 350), p = new Player(600, 350);
  p.vel.set(0, 3); // le joueur descend
  const decision = { mode: 'hold', speed: 0, attack: false, dodge: false, charge: true, breath: false, order: ['charge'] };
  b.control(decision, p, arena, Combat.DT);
  assert.ok(b.action && b.action.kind === 'charge');
  assert.ok(close(b.chargeCooldown, C.cooldown));
  assert.equal(b.stats.charges, 1);
  const predicted = Steering.predict(p, C.predict);
  const aimAngle = Math.atan2(b.action.target.y - b.pos.y, b.action.target.x - b.pos.x);
  assert.ok(close(aimAngle, Math.atan2(predicted.y - b.pos.y, predicted.x - b.pos.x), 1e-9), 'vise devant le joueur');
  assert.ok(b.action.target.y > 350, 'la visée anticipe la descente');
  // Visée figée à partir de windup − lockBefore
  b.action.t = Combat.ATTACKS.charge.windup - C.lockBefore + 0.01;
  const locked = plain(b.action.target);
  p.pos.set(600, 100);
  b.control(decision, p, arena, Combat.DT);
  assert.deepEqual(plain(b.action.target), locked);
  // Phase de charge : vitesse de ruée
  b.action.t = Combat.ATTACKS.charge.windup + 0.01;
  b.control(decision, p, arena, Combat.DT);
  assert.equal(b.maxSpeed, C.maxSpeed);
  // Fin : vitesse normale rendue, coup dans le vide compté
  for (let i = 0; i < 200 && b.action; i++) b.tick(Combat.DT);
  assert.equal(b.action, null);
  assert.equal(b.maxSpeed, Combat.BOSS.maxSpeed);
  assert.equal(b.stats.whiffs, 1);
});

test('ruée : touche une seule fois au contact, cause « ruée » ; enragé, attente × 0,55', () => {
  const { Fight, Combat, arena } = env();
  const chargeOnce = { name: 'test', n: 0, decide() { return { mode: 'hold', speed: 0, attack: false, dodge: false, charge: this.n++ === 0, breath: false, order: ['charge'] }; } };
  const f = new Fight({ arena, playerController: idlePlayer, bossController: chargeOnce, maxTime: 10 });
  f.player.pos.set(500, 350);
  f.boss.pos.set(300, 350);
  let hits = 0;
  for (let i = 0; i < 200; i++) { f.step(); hits += f.events.filter(e => e.type === 'hit' && e.who === 'boss').length; }
  assert.equal(hits, 1);
  assert.equal(f.player.hp, 100 - Combat.ATTACKS.charge.damage);
  assert.equal(f.lastCause, 'ruée');
  const b = f.boss;
  b.hp = b.maxHp * 0.3;
  assert.ok(close(b.techniqueCooldown(Combat.BOSS.charge.cooldown), Combat.BOSS.charge.cooldown * 0.55));
});

// ---------- Souffle et choix des techniques ----------

test('souffle : nappe demandée une seule fois au début de la frappe, pas compté comme coup dans le vide', () => {
  const { Player, Boss, Combat, arena } = env();
  const b = new Boss(300, 350), p = new Player(600, 350);
  const decision = { mode: 'hold', speed: 0, attack: false, dodge: false, charge: false, breath: true, order: ['breath'] };
  b.control(decision, p, arena, Combat.DT);
  assert.equal(b.action.kind, 'breath');
  assert.ok(close(b.breathCooldown, Combat.BOSS.breath.cooldown));
  b.action.t = Combat.ATTACKS.breath.windup + 0.01;
  b.control(decision, p, arena, Combat.DT);
  assert.ok(b.pendingZone);
  assert.ok(Math.abs(b.pendingZone.x - 600) < 5, 'nappe là où sera le joueur');
  b.pendingZone = null;
  b.control(decision, p, arena, Combat.DT);
  assert.equal(b.pendingZone, null, 'une seule nappe');
  for (let i = 0; i < 100 && b.action; i++) b.tick(Combat.DT);
  assert.equal(b.stats.whiffs, 0);
});

test('choix de technique : la plus forte sortie prête passe en premier', () => {
  const { BossBrain, Player, Boss, Combat, arena } = env();
  const d = BossBrain.decide([0.5, 0.7, 0, 0.9, 0.65]);
  assert.deepEqual(plain(d.order), ['charge', 'attack', 'breath']);
  assert.equal(d.charge && d.attack && d.breath, true);
  assert.equal(BossBrain.decide([0.5, 0.6, 0.6, 0.6, 0.6]).charge, false, 'seuil strict');
  // Tout est prêt : la ruée, sortie la plus forte, passe avant la hallebarde
  const all = new Boss(300, 350);
  all.control(d, new Player(380, 350), arena, Combat.DT);
  assert.equal(all.action.kind, 'charge');
  // La ruée voulue n'est pas prête : il prend la hallebarde
  const b = new Boss(300, 350), p = new Player(380, 350);
  b.chargeCooldown = 2;
  b.control(d, p, arena, Combat.DT);
  assert.equal(b.action.kind, 'boss');
  // Rien n'est prêt : rien ne se passe
  const c = new Boss(300, 350);
  c.cooldown = 1; c.chargeCooldown = 1; c.breathCooldown = 1;
  c.control(d, p, arena, Combat.DT);
  assert.equal(c.action, null);
});

test('boss à états : souffle sur un joueur qui boit, ruée sur un joueur lointain', () => {
  const { HandBossController, Player, Boss, arena } = env();
  const h = new HandBossController();
  const b = new Boss(300, 350);
  b.cooldown = 1;
  const drinking = new Player(420, 350);
  drinking.drink = { t: 0, healed: false };
  assert.equal(h.decide(b, drinking, arena).breath, true);
  const far = new Player(800, 350);
  const d = new HandBossController().decide(b, far, arena);
  assert.equal(d.charge, true);
  b.chargeCooldown = 3;
  assert.equal(new HandBossController().decide(b, far, arena).charge, false, 'ruée pas prête');
});

// ---------- Joueur robot ----------

test('joueur robot : sort de la ligne de ruée, roule quand le boss arrive, s\'écarte du souffle, évite la brume', () => {
  const { ScriptedPlayerController, Player, Boss, Combat, arena } = env();
  const good = () => new ScriptedPlayerController(() => 0, { dodgeProbability: 0.5 });   // réagit bien
  const bad = () => new ScriptedPlayerController(() => 0.99, { dodgeProbability: 0.5 }); // reste planté
  const p = new Player(600, 350);
  const b = new Boss(300, 350);
  b.action = Combat.newAttack('charge', 0);
  b.action.target = new Vector(800, 350);
  const it = good().intent(p, b, arena, Combat.DT);
  assert.notEqual(it.move.x, 0, 'il sort de la ligne');
  assert.equal(it.avoid, true);
  assert.equal(bad().intent(p, b, arena, Combat.DT).move.x, 0, 'mauvaise réaction : planté');
  b.action.t = Combat.ATTACKS.charge.windup + 0.1;
  b.pos.set(540, 350);
  assert.equal(good().intent(p, b, arena, Combat.DT).roll, true, 'roule au dernier moment');
  // Souffle visé sur lui
  const c = new Boss(300, 350);
  c.action = Combat.newAttack('breath', 0);
  c.action.target = new Vector(600, 350);
  assert.notEqual(good().intent(p, c, arena, Combat.DT).move.x, 0);
});

test('joueur robot : boit sous 45 PV seulement à l\'abri', () => {
  const { ScriptedPlayerController, Player, Boss, Combat, arena } = env();
  const r = () => new ScriptedPlayerController(() => 0.5, {});
  const p = new Player(300, 350);
  p.hp = 40;
  const near = new Boss(380, 350);
  near.cooldown = 1;
  const it = r().intent(p, near, arena, Combat.DT);
  assert.equal(it.drink, false, 'boss trop proche');
  assert.equal(it.move.y, 1, 'il recule pour pouvoir boire');
  const far = new Boss(700, 350);
  assert.equal(r().intent(p, far, arena, Combat.DT).drink, true);
  // Pendant une longue récupération du boss, même proche
  near.action = Combat.newAttack('boss', 0);
  near.action.t = 0.8;
  assert.equal(r().intent(p, near, arena, Combat.DT).drink, true);
  // Plus de fiole : il ne boit pas
  p.estus = 0;
  assert.equal(r().intent(p, far, arena, Combat.DT).drink, false);
  // Vie haute : il ne boit pas
  const healthy = new Player(300, 350);
  assert.equal(r().intent(healthy, far, arena, Combat.DT).drink, false);
});

// ---------- Taches de sang ----------

test('taches de sang : texte selon la cause, au plus 8, sauvegarde protégée', () => {
  const { Bloodstain } = env();
  assert.match(Bloodstain.labelFor('ruée'), /ruée/);
  assert.match(Bloodstain.labelFor('brume'), /brume/);
  assert.match(Bloodstain.labelFor(null), /Gardien/);
  const list = [];
  for (let i = 0; i < 11; i++) Bloodstain.add(list, i * 10, 50, 'hallebarde', i + 1);
  assert.equal(list.length, Bloodstain.MAX_STAINS);
  assert.equal(list[0].pos.x, 30, 'les plus anciennes s\'effacent');
  const data = {};
  const mem = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  assert.equal(Bloodstain.save(mem, list), true);
  const back = Bloodstain.load(mem);
  assert.deepEqual(plain(back.map(b => [b.pos.x, b.pos.y, b.label])), plain(list.map(b => [b.pos.x, b.pos.y, b.label])));
  data[Bloodstain.KEY] = '{{{';
  assert.deepEqual(plain(Bloodstain.load(mem)), []);
  data[Bloodstain.KEY] = JSON.stringify([{ x: 'a', y: 1, label: 'x' }, { x: 5, y: 6, label: 'ok' }]);
  assert.equal(Bloodstain.load(mem).length, 1, 'entrée invalide ignorée');
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.deepEqual(plain(Bloodstain.load(blocked)), []);
  assert.equal(Bloodstain.save(blocked, list), false);
  assert.deepEqual(plain(Bloodstain.load(null)), []);
});

test('combat complet avec les nouvelles mécaniques : reproductible, invariants, statistiques', () => {
  const { Fight, HandBossController, ScriptedPlayerController, seededRandom, arena } = env();
  const run = () => {
    const f = new Fight({ arena, playerController: new ScriptedPlayerController(seededRandom(11), {}), bossController: new HandBossController(), maxTime: 60, seed: 11, estus: 2 });
    while (!f.over) {
      f.step();
      assert.ok(Number.isFinite(f.player.hp) && f.player.hp >= 0 && f.player.hp <= 100);
      assert.ok(f.zones.length <= 3);
      assert.ok(f.player.estus >= 0 && f.player.estus <= 2);
    }
    return f.result;
  };
  const a = run(), b = run();
  assert.deepEqual(plain(a), plain(b));
  for (const k of ['bossCharges', 'bossBreaths', 'mistDamage', 'drinks', 'drinksInterrupted']) assert.ok(Number.isFinite(a[k]), k);
});
