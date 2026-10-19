import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './helpers.mjs';

const { get } = load(37);
const g = n => get(n);
const Wisp = g('Wisp'), Veilleur = g('Veilleur'), VeilleurController = g('VeilleurController'), VeilleurFight = g('VeilleurFight'),
  Vehicle = g('Vehicle'), Player = g('Player'), Boss = g('Boss'), Arena = g('Arena'), Combat = g('Combat'), Fight = g('Fight'), Steering = g('Steering'),
  HandBossController = g('HandBossController'), seededRandom = g('seededRandom'), ShowcasePlayerController = g('ShowcasePlayerController');
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const idle = { intent: () => ({ move: { x: 0, y: 0 }, lock: false, light: false, heavy: false, roll: false, drink: false, parry: false }) };
const quiet = { decide: () => ({ mode: 'keep', side: 1, cast: false, blink: false }) };

test('feu follet : entité Vehicle, pursue de la position future, séparation, s\'éteint après sa durée de vie', () => {
  const arena = new Arena();
  const w = new Wisp(400, 300, 0);
  assert.ok(w instanceof Vehicle);
  const p = new Player(500, 300);
  p.vel.set(0, 3);   // il descend
  w.vel.set(0, 0);
  w.control(p, [w], arena);
  const pursue = w.forces.find(f => f.name === 'pursue').force;
  assert.ok(pursue.x > 0 && pursue.y > 0, 'vise devant le chevalier, pas sa position actuelle');
  assert.ok(pursue.mag() <= Wisp.FORCE + 1e-9, 'force limitée : il tourne large');
  const mate = new Wisp(405, 300);
  w.acc.set(0, 0);
  w.control(p, [w, mate], arena);
  assert.ok(w.forces.find(f => f.name === 'separation').force.x < 0, 's\'écarte de son voisin');
  assert.ok(Wisp.SPEED < Combat.PLAYER.maxSpeed, 'le chevalier peut le distancer');
  const steps = Math.round(Wisp.LIFETIME / Combat.DT);
  for (let i = 0; i < steps - 1; i++) w.tick(Combat.DT);
  assert.equal(w.alive, true);
  w.tick(Combat.DT);
  w.tick(Combat.DT);
  assert.equal(w.alive, false, 'éteint après LIFETIME s');
});

test('Veilleur : garde ses distances (arrive), fuit (flee), saut de cendres (evade), incantation en secondes', () => {
  const arena = new Arena();
  const p = new Player(500, 350);
  const v = new Veilleur(600, 350);
  assert.ok(v instanceof Vehicle);
  v.control({ mode: 'keep', side: 1, cast: false, blink: false }, p, arena);
  const arrive = v.forces.find(f => f.name === 'arrive');
  assert.ok(close(Math.hypot(arrive.target.x - p.pos.x, arrive.target.y - p.pos.y), Veilleur.KEEP, 1e-6), 'vise un point à distance de garde');
  assert.ok(arrive.force.x > 0, 'trop près : il recule vers ce point');
  v.acc.set(0, 0);
  v.control({ mode: 'flee', side: 1, cast: false, blink: false }, p, arena);
  assert.ok(v.forces.find(f => f.name === 'flee').force.x > 0);
  // Saut de cendres : evade rapide, insaisissable, durée et attente en secondes
  v.control({ mode: 'keep', side: 1, cast: false, blink: true }, p, arena);
  assert.ok(v.blink && v.forces.some(f => f.name === 'evade'));
  assert.equal(v.maxSpeed, Veilleur.BLINK.maxSpeed);
  assert.equal(v.receiveHit(20), false, 'insaisissable pendant le saut');
  for (let t = 0; t < Veilleur.BLINK.duration + 0.02; t += Combat.DT) v.tick(Combat.DT);
  assert.equal(v.blink, null);
  assert.equal(v.maxSpeed, Veilleur.STATS.maxSpeed, 'vitesse normale restaurée exactement');
  assert.ok(v.blinkCooldown > 0);
  // Incantation : planté, puis CAST.count feux follets demandés au bout de CAST.windup s
  const c = new Veilleur(600, 350);
  c.castCooldown = 0;
  c.control({ mode: 'keep', side: 1, cast: true, blink: false }, p, arena);
  assert.ok(c.cast);
  const steps = Math.round(Veilleur.CAST.windup / Combat.DT);
  for (let i = 0; i < steps - 1; i++) c.tick(Combat.DT);
  assert.equal(c.pendingWisps, 0, 'pas encore');
  c.tick(Combat.DT);
  assert.equal(c.pendingWisps, Veilleur.CAST.count);
  assert.equal(c.castCooldown, Veilleur.CAST.cooldown);
  assert.equal(c.receiveHit(20), true);
  assert.equal(c.hp, c.maxHp - 20);
});

test('décisions du Veilleur : fuite sous la distance, saut quand il est serré, invocation sous le plafond', () => {
  const C = new VeilleurController();
  const v = new Veilleur(500, 350), p = new Player(500 - VeilleurController.FLEE_DISTANCE + 1, 350);
  assert.equal(C.decide(v, p, [], Combat.DT).mode, 'flee');
  p.pos.x = 500 - VeilleurController.FLEE_DISTANCE - 1;
  assert.equal(C.decide(v, p, [], Combat.DT).mode, 'keep');
  assert.equal(C.decide(v, p, [], Combat.DT).cast, true);
  const full = Array.from({ length: Veilleur.MAX_WISPS }, () => new Wisp(0, 0));
  assert.equal(C.decide(v, p, full, Combat.DT).cast, false, 'plafond de feux follets');
  const near = new Player(500 - VeilleurController.BLINK_DISTANCE + 5, 350);
  assert.equal(C.decide(v, near, [], Combat.DT).blink, false, 'pas tout de suite');
  near.action = Combat.newAttack('light', 0);
  assert.equal(C.decide(v, near, [], Combat.DT).blink, true, 'le chevalier attaque de près : il saute');
});

test('combat du niveau 2 : l\'épée dissipe les feux follets et touche le Veilleur, explosion au contact, roulade, plafond, fin', () => {
  const arena = new Arena();
  const f = new VeilleurFight({ arena, playerController: idle, controller: quiet, maxTime: 30 });
  const p = f.player, v = f.veilleur;
  p.pos.set(400, 350);
  v.pos.set(450, 350);
  f.wisps.push(new Wisp(440, 340));
  p.facing = 0;
  p.action = Combat.newAttack('heavy', 0);
  p.action.t = Combat.ATTACKS.heavy.windup;
  f.resolvePlayerHit();
  f.resolvePlayerHit();
  assert.equal(f.wisps[0].alive, false, 'feu follet dissipé');
  assert.equal(v.hp, v.maxHp - Combat.ATTACKS.heavy.damage, 'Veilleur touché une seule fois');
  // Contact : explosion et dégâts ; pendant la roulade, il passe à travers
  const w = new Wisp(p.pos.x + 5, p.pos.y);
  f.wisps.push(w);
  p.action = null;
  f.resolveWisps();
  assert.equal(p.hp, p.maxHp - Wisp.DAMAGE);
  assert.equal(w.alive, false);
  const w2 = new Wisp(p.pos.x + 5, p.pos.y);
  f.wisps.push(w2);
  p.roll = { t: 0 };
  f.resolveWisps();
  assert.equal(p.hp, p.maxHp - Wisp.DAMAGE, 'roulade : aucun dégât');
  assert.equal(w2.alive, true, 'le feu follet continue');
  // Plafond : jamais plus de MAX_WISPS feux follets vivants
  const g2 = new VeilleurFight({ arena, playerController: idle, controller: quiet, maxTime: 30 });
  g2.veilleur.pendingWisps = Veilleur.MAX_WISPS + 4;
  g2.spawnWisps();
  assert.equal(g2.wisps.length, Veilleur.MAX_WISPS);
  // Fin : le Veilleur tombe → victoire ; le chevalier tombe → défaite
  v.hp = 0;
  f.step();
  assert.equal(f.result.winner, 'player');
  const h = new VeilleurFight({ arena, playerController: idle, maxTime: 30 });
  h.player.hp = 0;
  h.step();
  assert.equal(h.result.winner, 'veilleur');
});

test('simulation courte du niveau 2 : valeurs finies, corps dans l\'arène, feux follets plafonnés, reproductible', () => {
  const arena = new Arena();
  const run = () => {
    const f = new VeilleurFight({ arena, playerController: new ShowcasePlayerController(seededRandom(3)), maxTime: 40, pillars: 4, seed: 9 });
    let steps = 0;
    while (!f.over) {
      f.step();
      if (++steps % 30 === 0) {
        for (const b of [f.player, f.veilleur]) {
          assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y));
          const box = arena.inner(b.r);
          assert.ok(b.pos.x >= box.left - 1e-6 && b.pos.x <= box.right + 1e-6 && b.pos.y >= box.top - 1e-6 && b.pos.y <= box.bottom + 1e-6);
        }
        assert.ok(f.wisps.filter(w => w.alive).length <= Veilleur.MAX_WISPS);
      }
    }
    return f.result;
  };
  const a = run(), b = run();
  assert.deepEqual(plain(a), plain(b));
  assert.ok(a.wispsSpawned > 3 && a.blinks > 0, 'il invoque et il saute');
});

test('coups retardés : une hallebarde sur trois se prépare plus longtemps ; vie du boss réglable (campagne)', () => {
  const arena = new Arena();
  const b = new Boss(500, 350), p = new Player(430, 350);
  const kinds = [];
  for (let i = 0; i < 6; i++) {
    b.action = null;
    b.cooldown = 0;
    b.startTechnique('attack', p, arena);
    kinds.push(b.action.delayed ? b.action.spec.windup : Combat.ATTACKS.boss.windup);
    assert.equal(b.action.kind, 'boss', 'même coup : la parade et le joueur robot le reconnaissent');
  }
  assert.deepEqual(kinds, [0.6, 0.6, 1.0, 0.6, 0.6, 1.0]);
  assert.ok(Combat.ATTACKS.bossDelayed.windup > Combat.ATTACKS.boss.windup + 0.3);
  assert.equal(Combat.ATTACKS.bossDelayed.parryable, true, 'on peut le parer, au bon moment');
  // Un humain qui pare au rythme habituel tombe trop tôt sur un coup retardé
  const f = new Fight({ arena, playerController: idle, bossController: new HandBossController() });
  f.player.pos.set(430, 350);
  f.boss.pos.set(500, 350);
  f.boss.action = Object.assign(Combat.newAttack('boss', Math.PI), { spec: Combat.ATTACKS.bossDelayed, delayed: true });
  f.player.action = Combat.newAttack('parry', 0);
  f.boss.action.t = Combat.ATTACKS.bossDelayed.windup;   // la frappe arrive
  f.player.action.t = Combat.ATTACKS.bossDelayed.windup - (Combat.ATTACKS.boss.windup - 0.06);   // parade levée au rythme de 0,6 s
  f.resolveHit(f.boss, f.player, 'boss');
  assert.equal(f.player.hp, f.player.maxHp - Combat.ATTACKS.bossDelayed.damage, 'parade tombée trop tôt : touché');
  // Vie du boss de campagne
  const strong = new Fight({ arena, playerController: idle, bossController: new HandBossController(), bossHp: 500 });
  assert.equal(strong.boss.maxHp, 500);
  assert.equal(strong.boss.hp, 500);
  assert.equal(new Fight({ arena, playerController: idle, bossController: new HandBossController() }).boss.maxHp, Combat.BOSS.maxHp);
});
