import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './helpers.mjs';

function world(seed = 9) {
  const e = load(seed);
  const g = e.get;
  return { ...e, Pillar: g('Pillar'), Player: g('Player'), Boss: g('Boss'), Combat: g('Combat'), Steering: g('Steering'), Arena: g('Arena'),
    Fight: g('Fight'), ScriptedPlayerController: g('ScriptedPlayerController'), HandBossController: g('HandBossController'),
    seededRandom: g('seededRandom'), Settings: g('Settings'), Vehicle: g('Vehicle') };
}
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const still = { mode: 'hold', speed: 0, strafe: 0, attack: false, dodge: false, charge: false, breath: false, order: ['attack'] };
// Contrôleurs figés pour des combats entièrement maîtrisés
const fixedBoss = d => ({ name: 'test', decide: () => Object.assign({}, still, d) });
const fixedPlayer = i => ({ intent: () => Object.assign({ move: { x: 0, y: 0 }, lock: false, light: false, heavy: false, roll: false, drink: false, avoid: false }, i) });

test('pilier : entité Vehicle immobile, collision, fissures puis effondrement, point abrité', () => {
  const { Pillar, Player, Combat, Vehicle } = world();
  const p = new Pillar(300, 300);
  assert.ok(p instanceof Vehicle);
  assert.equal(p.maxSpeed, 0);
  assert.equal(p.radius, Combat.PILLAR.r);
  // Collision : le corps est remis sur le bord, sa vitesse vers le pilier est annulée, la tangente gardée
  const k = new Player(300 + 20, 300);
  k.vel.set(-2, 1);
  assert.equal(p.pushOut(k), true);
  assert.ok(close(k.pos.x, 300 + p.radius + k.r));
  assert.ok(close(k.vel.x, 0) && close(k.vel.y, 1));
  assert.equal(p.pushOut(k), false, 'au contact exact : plus de chevauchement');
  // Un corps qui s'éloigne garde sa vitesse
  const out = new Player(300 + 30, 300);
  out.vel.set(2, 0);
  p.pushOut(out);
  assert.equal(out.vel.x, 2);
  // Chocs : fissuré, puis effondré ; un pilier effondré ne bloque plus rien
  assert.equal(p.crack(), false);
  assert.equal(p.hp, Combat.PILLAR.hp - 1);
  assert.equal(p.crack(), true, 'deuxième choc : effondré');
  assert.equal(p.alive, false);
  assert.equal(p.crack(), false);
  const ghost = new Player(305, 300);
  assert.equal(p.pushOut(ghost), false);
  assert.equal(ghost.pos.x, 305);
  // Abri : derrière le pilier, à l'opposé de la menace
  const q = new Pillar(500, 300);
  const c = q.coverPoint({ x: 300, y: 300 }, 14);
  assert.ok(close(c.x, 500 + q.radius + 14 + 8) && close(c.y, 300));
});

test('géométrie : ligne de vue coupée par un pilier, rayon qui s\'arrête sur un pilier', () => {
  const { Pillar, Combat, Arena } = world();
  const p = new Pillar(500, 350);
  assert.equal(Combat.blocker({ x: 400, y: 350 }, { x: 600, y: 350 }, [p]), p);
  assert.equal(Combat.blocker({ x: 400, y: 350 + p.radius + 1 }, { x: 600, y: 350 + p.radius + 1 }, [p]), null, 'frôle sans couper');
  assert.equal(Combat.blocker({ x: 400, y: 350 }, { x: 450, y: 350 }, [p]), null, 'pilier au-delà de la cible');
  assert.equal(Combat.blocker({ x: 400, y: 350 }, { x: 600, y: 350 }, null), null);
  p.hp = 0;
  assert.equal(Combat.blocker({ x: 400, y: 350 }, { x: 600, y: 350 }, [p]), null, 'pilier effondré');
  const arena = new Arena();
  const q = new Pillar(500, 350);
  assert.ok(close(arena.rayDistance({ x: 400, y: 350 }, 0, 200, [q]), 100 - q.radius), 'rayon arrêté au bord du pilier');
  assert.equal(arena.rayDistance({ x: 400, y: 350 }, Math.PI, 200, [q]), 200, 'pilier derrière : ignoré');
  assert.equal(arena.rayDistance({ x: 500, y: 350 }, 0, 200, [q]), 0, 'départ dans le pilier');
  q.hp = 0;
  assert.equal(arena.rayDistance({ x: 400, y: 350 }, 0, 200, [q]), 200);
});

test('orbitPoint : cible en avance sur le cercle ; seek vers elle fait tourner autour du joueur', () => {
  const { Steering, Boss } = world();
  const b = new Boss(600, 350);   // à droite du centre (500, 350)
  b.vel.set(0, 0);
  // seek vers un point en avance sur le cercle : la force part du bon côté (sens horaire = vers le bas)
  const cw = b.seek(Steering.orbitPoint(b, { x: 500, y: 350 }, 100, 1, 100));
  assert.ok(cw.y > 0, 'côté +1 : vers le bas à l\'écran');
  assert.ok(cw.mag() <= b.maxForce + 1e-9, 'force limitée par seek');
  const ccw = b.seek(Steering.orbitPoint(b, { x: 500, y: 350 }, 100, -1, 100));
  assert.ok(ccw.y < 0);
  assert.ok(close(cw.x, ccw.x) && close(cw.y, -ccw.y), 'symétrique');
  // Agent sur le centre : direction arbitraire, pas de NaN
  const z = new Boss(500, 350);
  const pz = Steering.orbitPoint(z, { x: 500, y: 350 }, 70, 1, 50);
  assert.ok(Number.isFinite(pz.x) && Number.isFinite(pz.y));
  // orbitPoint : avance de `lead` le long du cercle (angle lead / rayon)
  const pt = Steering.orbitPoint(b, { x: 500, y: 350 }, 70, 1, 70 * Math.PI / 2);
  assert.ok(close(pt.x, 500, 1e-9) && close(pt.y, 420, 1e-9), 'quart de tour');
  const keep = Steering.orbitPoint(b, { x: 500, y: 350 }, 70, 1, 0);
  assert.ok(close(keep.x, 570) && close(keep.y, 350), 'lead 0 = keepDistancePoint');
});

test('combat : piliers aux emplacements de l\'arène, corps jamais dans un pilier', () => {
  const { Fight, Arena, ScriptedPlayerController, HandBossController, seededRandom, Settings, Combat } = world();
  const arena = new Arena();
  const s = Settings.defaults();
  assert.equal(new Fight({ arena, playerController: fixedPlayer({}), bossController: fixedBoss({}) }).pillars.length, 0, '0 par défaut');
  const f = new Fight({ arena, playerController: new ScriptedPlayerController(seededRandom(3), s), bossController: new HandBossController(),
    maxTime: 60, seed: 3, pillars: 6 });
  assert.equal(f.pillars.length, 6);
  assert.deepEqual(plain(f.pillars.map(p => ({ x: p.pos.x, y: p.pos.y }))), plain(arena.pillarSlots));
  assert.equal(f.boss.pillars, f.pillars);
  assert.equal(f.player.pillars, f.pillars);
  // Emplacements : loin des départs et du feu de camp
  for (const p of arena.pillarSlots) {
    for (const q of [arena.playerStart, arena.bossStart, arena.campfirePos]) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > Combat.PILLAR.r + Combat.BOSS.r + 20);
  }
  for (let i = 0; i < 3600 && !f.over; i++) {
    f.step();
    for (const p of f.pillars) {
      if (!p.alive) continue;
      for (const e of [f.player, f.boss]) {
        assert.ok(Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) >= p.radius + e.r - 1e-6, 'corps dans un pilier au pas ' + i);
      }
    }
    for (const v of [f.player.pos.x, f.player.pos.y, f.boss.pos.x, f.boss.pos.y]) assert.ok(Number.isFinite(v));
  }
});

test('combat : un pilier entre le boss et le joueur pare la hallebarde (une fois, sans dégâts)', () => {
  const { Fight, Arena, Combat } = world();
  const arena = new Arena();
  const f = new Fight({ arena, playerController: fixedPlayer({}), bossController: fixedBoss({}), maxTime: 10, pillars: 0 });
  const P = f.pillars;
  // Joueur juste derrière un pilier, dans le cône du boss
  f.boss.pos.set(500, 350);
  f.player.pos.set(500 + 95, 350);
  const pil = new (world().Pillar)(500 + 55, 350, 12);
  P.push(pil);
  f.boss.action = Combat.newAttack('boss', 0);
  f.boss.action.t = Combat.ATTACKS.boss.windup + 0.01;
  f.resolveHit(f.boss, f.player, 'boss');
  assert.equal(f.player.hp, f.player.maxHp, 'paré');
  assert.equal(f.events.filter(e => e.type === 'blocked').length, 1);
  f.events = [];
  f.resolveHit(f.boss, f.player, 'boss');
  assert.equal(f.events.length, 0, 'un seul événement par coup');
  // Sans pilier, le même coup touche
  P.length = 0;
  f.boss.action = Combat.newAttack('boss', 0);
  f.boss.action.t = Combat.ATTACKS.boss.windup + 0.01;
  f.resolveHit(f.boss, f.player, 'boss');
  assert.equal(f.player.hp, f.player.maxHp - Combat.ATTACKS.boss.damage);
});

test('ruée contre un pilier : boss étourdi 1,6 s, pilier fissuré puis effondré, l\'évitement l\'ignore ensuite', () => {
  const { Fight, Arena, Combat, Pillar, Steering } = world();
  const arena = new Arena();
  const f = new Fight({ arena, playerController: fixedPlayer({}), bossController: fixedBoss({}), maxTime: 30, pillars: 0 });
  const pil = new Pillar(600, 350);
  f.pillars.push(pil);
  f.player.pos.set(800, 350);
  f.boss.pos.set(600 - pil.radius - f.boss.r - 30, 350);
  f.boss.facing = 0;
  const charge = () => {
    f.boss.action = Combat.newAttack('charge', 0);
    f.boss.action.target = { x: 900, y: 350 };
    f.boss.action.t = Combat.ATTACKS.charge.windup;
    f.boss.chargeCooldown = 99;
    for (let i = 0; i < 60 && !f.boss.stun; i++) f.step();
  };
  charge();
  assert.ok(f.boss.stun, 'étourdi');
  assert.equal(f.boss.action, null, 'la ruée s\'arrête net');
  assert.equal(f.boss.stats.crashes, 1);
  assert.equal(pil.hp, Combat.PILLAR.hp - 1);
  assert.equal(f.boss.canAct(), false);
  // Étourdi : il ne bouge plus et ne lance rien, même si on le lui demande
  f.bossController = fixedBoss({ attack: true, charge: true, dodge: true });
  f.boss.cooldown = 0;
  let t = 0;
  while (f.boss.stun && t < 5) { f.step(); t += Combat.DT; }
  assert.ok(Math.abs(t - Combat.BOSS.stun) < 2 * Combat.DT, 'durée ' + t);
  assert.equal(f.boss.stats.attacks, 0, 'aucune technique pendant l\'étourdissement');
  // Deuxième choc : le pilier s'effondre
  f.bossController = fixedBoss({});
  f.boss.pos.set(600 - pil.radius - f.boss.r - 30, 350);
  f.boss.vel.set(0, 0);
  charge();
  assert.equal(pil.alive, false);
  assert.equal(f.boss.stats.crashes, 2);
  // Pilier effondré : plus de collision ni d'évitement
  f.boss.pos.set(600, 350);
  f.step();
  assert.ok(Math.hypot(f.boss.pos.x - 600, f.boss.pos.y - 350) < 5, 'il peut passer là où était le pilier');
});

test('esquive : seulement quand le joueur attaque, prioritaire, puis riposte si le boss n\'est pas touché', () => {
  const { Boss, Player, Arena, Combat } = world();
  const arena = new Arena();
  const b = new Boss(500, 350), p = new Player(560, 350);
  const want = { mode: 'hold', speed: 0, strafe: 0, attack: true, dodge: true, charge: false, breath: false, order: ['attack'] };
  b.cooldown = 1;
  b.control(want, p, arena, Combat.DT);
  assert.equal(b.dodge, null, 'le joueur n\'attaque pas : pas d\'esquive');
  p.action = Combat.newAttack('light', 0);
  b.cooldown = 0;
  b.control(want, p, arena, Combat.DT);
  assert.ok(b.dodge, 'esquive prioritaire sur la hallebarde');
  assert.equal(b.action, null);
  assert.equal(b.dodgeCooldown, Combat.BOSS.dodge.cooldown);
  assert.equal(b.maxSpeed, Combat.BOSS.dodge.maxSpeed);
  // Fin de l'esquive sans être touché : riposte (hallebarde prête)
  b.cooldown = 1.2;
  for (let t = 0; t < Combat.BOSS.dodge.duration + 0.02; t += Combat.DT) b.tick(Combat.DT);
  assert.equal(b.dodge, null);
  assert.equal(b.cooldown, 0, 'riposte');
  assert.equal(b.stats.ripostes, 1);
  assert.equal(b.maxSpeed, b.baseSpeed, 'limites normales restaurées');
  // Pendant l'attente de l'esquive : impossible
  b.control(want, p, arena, Combat.DT);
  assert.equal(b.dodge, null);
  assert.ok(b.action, 'il frappe à la place');
  // Touché pendant l'esquive : pas de riposte
  const c = new Boss(500, 350);
  c.control(want, p, arena, Combat.DT);
  c.cooldown = 1.2;
  c.receiveHit(10);
  for (let t = 0; t < Combat.BOSS.dodge.duration + 0.02; t += Combat.DT) c.tick(Combat.DT);
  assert.ok(c.cooldown > 0, 'pas de riposte');
  assert.equal(c.stats.ripostes, 0);
  // Pendant une technique : pas d'esquive
  const d = new Boss(500, 350);
  d.action = Combat.newAttack('boss', 0);
  d.action.t = 1.5;
  d.control(want, p, arena, Combat.DT);
  assert.equal(d.dodge, null);
});

test('riposte qui touche : coup levé dans la fenêtre après une riposte, compté seulement s\'il touche', () => {
  const { Fight, Arena, Combat } = world();
  const arena = new Arena();
  const W = Combat.BOSS.dodge.riposteWindow;
  const make = () => {
    const f = new Fight({ arena, playerController: fixedPlayer({}), bossController: fixedBoss({}), maxTime: 30 });
    f.boss.pos.set(500, 350);
    f.player.pos.set(560, 350);
    f.boss.facing = 0;
    f.boss.time = 5;   // horloge du boss déjà en marche
    return f;
  };
  const swing = (f, delay) => {
    f.boss.riposteTime = f.boss.time - delay;
    f.boss.cooldown = 0;
    f.boss.startTechnique('attack', f.player, arena);
    return f.boss.action.riposte;
  };
  assert.equal(swing(make(), 0), true, 'juste après la riposte');
  assert.equal(swing(make(), W), true, 'fin de fenêtre incluse');
  assert.equal(swing(make(), W + 0.01), false, 'trop tard');
  const none = make();
  none.boss.cooldown = 0;
  none.boss.startTechnique('attack', none.player, arena);
  assert.equal(none.boss.action.riposte, false, 'sans riposte');
  // Le coup touche : riposte qui touche comptée (et dans le résultat du combat)
  const f = make();
  swing(f, 0);
  f.boss.action.t = Combat.ATTACKS.boss.windup + 0.01;
  f.resolveHit(f.boss, f.player, 'boss');
  assert.equal(f.boss.stats.riposteHits, 1);
  f.finish('draw');
  assert.equal(f.result.bossRiposteHits, 1);
  // Le coup rate (joueur hors de portée) : rien
  const g = make();
  swing(g, 0);
  g.player.pos.set(800, 350);
  g.boss.action.t = Combat.ATTACKS.boss.windup + 0.01;
  g.resolveHit(g.boss, g.player, 'boss');
  assert.equal(g.boss.stats.riposteHits, 0);
});

test('hallebarde : levée seulement si le joueur est à portée (+ marge), ruée et souffle toujours possibles', () => {
  const { Boss, Player, Arena, Combat } = world();
  const arena = new Arena();
  const limit = Combat.ATTACKS.boss.reach + Combat.PLAYER.r + Combat.BOSS.swingMargin;
  const swing = { mode: 'hold', speed: 0, strafe: 0, attack: true, dodge: false, charge: false, breath: false, order: ['attack'] };
  const far = new Boss(500, 350);
  far.control(swing, new Player(500 + limit + 1, 350), arena, Combat.DT);
  assert.equal(far.action, null, 'trop loin : il ne frappe pas l\'air');
  const edge = new Boss(500, 350);
  edge.control(swing, new Player(500 + limit, 350), arena, Combat.DT);
  assert.ok(edge.action, 'seuil inclus');
  const ranged = new Boss(500, 350);
  ranged.control({ ...swing, attack: false, charge: true, order: ['charge'] }, new Player(800, 350), arena, Combat.DT);
  assert.equal(ranged.action.kind, 'charge');
});

test('immobilité mesurée : le temps libre passé immobile près du joueur est compté', () => {
  const { Boss, Player, Arena, Combat } = world();
  const arena = new Arena();
  const b = new Boss(500, 350), p = new Player(560, 350);
  b.control(still, p, arena, Combat.DT);
  assert.ok(close(b.stats.idleTime, Combat.DT), 'immobile au départ');
  b.vel.set(1, 0);
  b.control(still, p, arena, Combat.DT);
  assert.ok(close(b.stats.idleTime, Combat.DT), 'il bouge : pas compté');
  const w = new Boss(500, 350);
  w.control(still, new Player(100, 100), arena, Combat.DT);
  assert.equal(w.stats.idleTime, 0, 'joueur hors du rayon : pas compté');
});

test('joueur robot : il court s\'abriter derrière un pilier pour boire, et boit une fois caché', () => {
  const { Player, Boss, Pillar, ScriptedPlayerController: S, Arena, Combat, seededRandom } = world();
  const arena = new Arena();
  const ctrl = new S(seededRandom(2), { dodgeProbability: 0, attackInterval: 0.9 });
  const p = new Player(400, 350), b = new Boss(250, 350);
  p.hp = S.DRINK_HP - 5;
  const pil = new Pillar(470, 350);
  p.pillars = [pil];
  // Pas caché, boss proche : il vise le point abrité
  p.pos.set(400, 250);
  let it = ctrl.intent(p, b, arena, Combat.DT);
  assert.equal(it.drink, false);
  assert.ok(it.target, 'va s\'abriter');
  const cover = pil.coverPoint(b.pos, p.r);
  assert.ok(close(it.target.x, cover.x) && close(it.target.y, cover.y));
  // Caché derrière le pilier, boss assez loin : il boit
  p.pos.set(cover.x, cover.y);
  it = ctrl.intent(p, b, arena, Combat.DT);
  assert.equal(it.drink, true);
  // Caché mais boss tout près : il ne boit pas
  b.pos.set(cover.x - S.COVER_DRINK_DISTANCE + 10, cover.y + 60);
  it = ctrl.intent(p, b, arena, Combat.DT);
  assert.equal(it.drink, false);
  // Sans pilier : il recule (comme avant)
  p.pillars = [];
  p.pos.set(400, 250);
  b.pos.set(250, 350);
  it = ctrl.intent(p, b, arena, Combat.DT);
  assert.equal(it.target, undefined);
  assert.equal(it.move.y, 1);
  // L'intention `target` fait `arrive` vers ce point
  const q = new Player(300, 300);
  q.control({ move: { x: 0, y: 0 }, target: { x: 400, y: 300 }, lock: false }, b, arena);
  assert.ok(q.acc.x > 0);
  assert.ok(close(q.acc.y, 0));
});

test('boss à états : tourne autour du joueur en attente, esquive toujours voulue, pas de ruée à travers un pilier', () => {
  const { HandBossController: H, Boss, Player, Pillar, Arena, Combat } = world();
  const arena = new Arena();
  const h = new H();
  const b = new Boss(500, 350), p = new Player(800, 350);
  b.cooldown = 1;
  b.chargeCooldown = 99;
  b.breathCooldown = 99;
  const d1 = h.decide(b, p, arena);
  assert.equal(d1.dodge, true);
  assert.ok(Math.abs(d1.strafe) > 0.5, 'il tourne autour du joueur');
  h.clock = H.TOUR_DUREE;
  assert.equal(Math.sign(h.decide(b, p, arena).strafe), -Math.sign(d1.strafe), 'sens inversé après TOUR_DUREE');
  // Ruée : seulement si aucun pilier sur la trajectoire
  b.chargeCooldown = 0;
  b.pillars = [new Pillar(650, 350)];
  assert.equal(H.rangedTechnique(b, p, 300), null);
  b.pillars = [new Pillar(650, 200)];
  assert.equal(H.rangedTechnique(b, p, 300), 'charge');
});

test('anti-camping : coin = deux murs proches ; compteur qui monte, redescend, puis mort dévorée par le brouillard', () => {
  const { Fight, Arena, Combat } = world();
  const arena = new Arena();
  const C = Combat.BOSS.camping;
  const b = arena.inner(Combat.BOSS.r);
  // Coin : à moins de `margin` de deux murs ; un seul mur ne suffit pas
  assert.equal(arena.inCorner({ x: b.left + 10, y: b.top + 10 }, Combat.BOSS.r, C.margin), true);
  assert.equal(arena.inCorner({ x: b.right - 10, y: b.bottom - 10 }, Combat.BOSS.r, C.margin), true);
  assert.equal(arena.inCorner({ x: b.left + 10, y: 350 }, Combat.BOSS.r, C.margin), false, 'le long d\'un mur : pas un coin');
  assert.equal(arena.inCorner({ x: b.left + C.margin, y: b.top + 10 }, Combat.BOSS.r, C.margin), false, 'seuil exclu');
  assert.equal(arena.inCorner({ x: 500, y: 350 }, Combat.BOSS.r, C.margin), false);
  // Boss immobile dans un coin, joueur loin : compteur exact, puis mort à `limit` s
  const make = (antiCamping) => {
    const f = new Fight({ arena, playerController: fixedPlayer({}), bossController: fixedBoss({}), maxTime: 60, antiCamping });
    f.player.pos.set(500, 600);
    f.boss.detectRadius = 1;    // il erre sans décision… mais on le recolle dans le coin à chaque pas
    return f;
  };
  const f = make(undefined);
  const corner = { x: b.left + 20, y: b.top + 20 };
  let t = 0;
  while (!f.over && t < 10) {
    f.boss.pos.set(corner.x, corner.y);
    f.boss.vel.set(0, 0);
    f.step();
    t += Combat.DT;
    if (Math.abs(t - 3) < Combat.DT / 2) assert.ok(Math.abs(f.boss.campTime - 3) < 2 * Combat.DT, 'compteur ' + f.boss.campTime);
  }
  assert.ok(Math.abs(t - C.limit) < 2 * Combat.DT, 'mort au bout de ' + t + ' s');
  assert.equal(f.result.winner, 'player');
  assert.equal(f.result.bossCamped, true);
  assert.equal(f.damageToBoss, Combat.BOSS.maxHp, 'toute sa vie comptée perdue');
  // Sortir du coin fait redescendre le compteur (recover s par seconde), sans mort
  const g = make(undefined);
  g.boss.campTime = 4;
  g.boss.pos.set(500, 350);
  for (let i = 0; i < 60; i++) { g.boss.pos.set(500, 350); g.step(); }
  assert.ok(Math.abs(g.boss.campTime - (4 - C.recover)) < 0.05, 'redescend : ' + g.boss.campTime);
  assert.equal(g.over, false);
  // Règle désactivable (antiCamping: false) : pas de mort
  const h = make(false);
  for (let i = 0; i < (C.limit + 1) * 60; i++) { h.boss.pos.set(corner.x, corner.y); h.step(); }
  assert.equal(h.boss.alive, true);
  assert.equal(h.boss.campTime, 0);
});

test('anti-camping : la note punit la mort dans un coin', () => {
  const { Fitness } = { Fitness: load(3).get('Fitness') };
  const base = { winner: 'draw', damageToPlayer: 40, damageToBoss: 50, bossWhiffs: 0, playerMaxHp: 100, bossMaxHp: 200 };
  // Même combat, mais le boss finit dévoré : défaite et toute sa vie perdue
  const camped = { ...base, winner: 'player', damageToBoss: 200, bossCamped: true };
  assert.ok(Fitness.ofFight(camped) < Fitness.ofFight(base) - 70);
});
