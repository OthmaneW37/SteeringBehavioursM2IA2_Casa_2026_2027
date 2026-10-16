import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { load, Vector } from './helpers.mjs';

function world() {
  const env = load(7);
  const g = env.get;
  const arena = new (g('Arena'))();
  return { ...env, arena, Player: g('Player'), Boss: g('Boss'), Combat: g('Combat'), Steering: g('Steering'),
    BossBrain: g('BossBrain'), Vehicle: g('Vehicle') };
}
const idle = { mode: 'hold', speed: 0, attack: false, dodge: false };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('vehicle.js est la copie intacte de celui de 4-Wander (fichier protégé)', () => {
  const hash = f => createHash('sha256').update(readFileSync(new URL(f, import.meta.url))).digest('hex');
  assert.equal(hash('../vehicle.js'), hash('../../4-Wander/vehicle.js'));
});

test('flee de Reynolds : vitesse désirée inversée puis force recalculée, limitée à maxForce', () => {
  const { Player, Steering } = world();
  const p = new Player(500, 300);
  p.vel.set(2, 1);
  const threat = new Vector(520, 300);
  const f = Steering.flee(p, threat);
  // désirée = (−maxSpeed, 0) ; force = désirée − vitesse = (−5.2, −1) limitée à 0.4
  const raw = new Vector(-p.maxSpeed - 2, -1);
  assert.ok(close(f.x, raw.x / raw.mag() * p.maxForce) && close(f.y, raw.y / raw.mag() * p.maxForce));
  // Ce n'est pas −seek() (que fait vehicle.js) : avec une vitesse non nulle, le résultat diffère
  const minusSeek = p.seek(threat).mult(-1);
  assert.ok(Math.abs(minusSeek.x - f.x) + Math.abs(minusSeek.y - f.y) > 0.05);
  assert.ok(f.mag() <= p.maxForce + 1e-12);
  // Le joueur et le boss utilisent cette version
  assert.ok(close(p.flee(threat).x, f.x));
});

test('evade fuit la position prédite, pas la position actuelle', () => {
  const { Player, Boss, Steering } = world();
  const p = new Player(500, 300);
  const b = new Boss(400, 400);
  b.vel.set(0, -2); // le boss monte : dans 0,25 s il sera 30 px plus haut, au niveau du joueur
  const predicted = Steering.predict(b, 0.25);
  assert.ok(close(predicted.y, 400 - 2 * 15));
  const e = Steering.evade(p, b);
  const f = Steering.flee(p, predicted);
  assert.ok(close(e.x, f.x) && close(e.y, f.y));
  assert.ok(close(p.evade(b).x, e.x));
});

test('stayInside : nulle au centre, vers l\'intérieur près des murs, limitée à maxForce', () => {
  const { Boss, Steering, arena } = world();
  const b = new Boss(500, 350);
  assert.equal(Steering.stayInside(b, arena, 70).mag(), 0);
  b.pos.set(arena.inner(b.r).right - 10, 350);
  b.vel.set(2, 0);
  const f = Steering.stayInside(b, arena, 70);
  assert.ok(f.x < 0, 'pousse vers la gauche');
  assert.ok(f.mag() <= b.maxForce + 1e-12);
  b.pos.set(500, arena.inner(b.r).top + 5);
  b.vel.set(0, -1);
  assert.ok(Steering.stayInside(b, arena, 70).y > 0);
});

test('phases d\'une attaque : préparation exacte de 0,6 s pour le boss (télégraphe)', () => {
  const { Combat } = world();
  const s = Combat.ATTACKS.boss;
  assert.equal(s.windup, 0.6);
  assert.equal(Combat.phase(s, 0), 'windup');
  assert.equal(Combat.phase(s, 0.599), 'windup');
  assert.equal(Combat.phase(s, 0.6), 'active');
  assert.equal(Combat.phase(s, 0.6 + s.active - 1e-6), 'active');
  assert.equal(Combat.phase(s, 0.6 + s.active), 'recovery');
  assert.equal(Combat.phase(s, Combat.duration(s)), 'done');
  // La lourde est plus lente que la légère
  assert.ok(Combat.ATTACKS.heavy.windup > Combat.ATTACKS.light.windup);
  assert.ok(Combat.ATTACKS.heavy.stamina > Combat.ATTACKS.light.stamina);
});

test('cône de frappe : portée + rayon de la cible, demi-ouverture incluse', () => {
  const { Combat, Player } = world();
  const target = new Player(0, 0);
  const s = Combat.ATTACKS.boss;
  const at = (x, y) => { target.pos.set(x, y); return Combat.inArc(new Vector(0, 0), 0, target, s.reach, s.arc); };
  assert.equal(at(s.reach + target.r, 0), true);
  assert.equal(at(s.reach + target.r + 0.01, 0), false);
  assert.equal(at(-50, 0), false, 'derrière');
  const a = s.arc / 2 - 1e-6;
  assert.equal(at(Math.cos(a) * 60, Math.sin(a) * 60), true);
  const b = s.arc / 2 + 1e-3;
  assert.equal(at(Math.cos(b) * 60, Math.sin(b) * 60), false);
  assert.ok(close(Combat.angleDiff(3 * Math.PI, 0), Math.PI) || close(Combat.angleDiff(3 * Math.PI, 0), -Math.PI));
  assert.ok(close(Combat.turnToward(0, 1, 0.25), 0.25));
  assert.ok(close(Combat.turnToward(0, 0.1, 0.25), 0.1));
});

test('endurance : coût des actions, refus si insuffisante, régénération après un délai', () => {
  const { Player, Boss, Combat, arena } = world();
  const p = new Player(300, 300), b = new Boss(600, 300);
  const intent = o => Object.assign({ move: { x: 0, y: 0 }, lock: true, light: false, heavy: false, roll: false }, o);
  p.control(intent({ light: true }), b, arena);
  assert.equal(p.stamina, 100 - Combat.ATTACKS.light.stamina);
  assert.ok(p.action && p.action.kind === 'light');
  // Pendant l'attaque, aucune autre action
  p.control(intent({ roll: true }), b, arena);
  assert.equal(p.roll, null);
  // Endurance insuffisante : refus
  const q = new Player(300, 300);
  q.stamina = Combat.ATTACKS.heavy.stamina - 1;
  q.control(intent({ heavy: true }), b, arena);
  assert.equal(q.action, null);
  assert.equal(q.stamina, Combat.ATTACKS.heavy.stamina - 1);
  // Régénération : rien pendant le délai, puis 45 points par seconde
  const r = new Player(300, 300);
  r.spend(50);
  r.tick(0.4);
  assert.equal(r.stamina, 50);
  r.tick(0.1);
  r.tick(0.2);
  assert.ok(close(r.stamina, 50 + 45 * 0.2));
  for (let i = 0; i < 100; i++) r.tick(0.1);
  assert.equal(r.stamina, 100);
});

test('roulade : evade loin du boss et invulnérabilité pendant exactement 0,3 s (fenêtre d\'esquive)', () => {
  const { Player, Boss, Combat, arena } = world();
  const b = new Boss(600, 300);
  const p = new Player(500, 300);
  p.control({ move: { x: 0, y: 0 }, lock: true, roll: true }, b, arena);
  assert.ok(p.roll);
  assert.equal(p.stamina, 100 - Combat.PLAYER.roll.stamina);
  assert.equal(p.maxSpeed, Combat.PLAYER.roll.maxSpeed);
  // Roulade : la force pousse à l'opposé du boss (vers la gauche)
  p.acc.set(0, 0);
  p.control({ move: { x: 0, y: 0 }, lock: true }, b, arena);
  assert.ok(p.acc.x < 0);
  // Fenêtre d'invulnérabilité
  p.tick(0.1); p.tick(0.1); p.tick(0.09);
  assert.equal(p.invulnerable, true);
  assert.equal(p.receiveHit(26), false);
  assert.equal(p.hp, 100);
  p.tick(0.011);
  assert.equal(p.invulnerable, false, 'à 0,301 s');
  assert.equal(p.receiveHit(26), true);
  assert.equal(p.hp, 74);
  // Fin de la roulade : vitesse normale rétablie
  p.tick(0.2);
  assert.equal(p.roll, null);
  assert.equal(p.maxSpeed, Combat.PLAYER.maxSpeed);
});

test('déplacement : seek au large, arrive (ralentissement) près des bords, verrouillage relatif au boss', () => {
  const { Player, Boss, arena } = world();
  const b = new Boss(800, 350);
  const free = new Player(400, 350);
  free.control({ move: { x: 1, y: 0 }, lock: false }, b, arena);
  assert.ok(close(free.acc.mag(), free.maxForce), 'au large : seek à pleine force');
  const edge = new Player(arena.inner(14).right - 3, 350);
  edge.control({ move: { x: 1, y: 0 }, lock: false }, b, arena);
  assert.ok(edge.acc.mag() < free.maxForce * 0.2, 'contre le mur : arrive presque à l\'arrêt');
  // Verrouillé : « haut » avance vers le boss, même si le boss est en bas
  const b2 = new Boss(400, 600);
  const p = new Player(400, 300);
  p.control({ move: { x: 0, y: -1 }, lock: true }, b2, arena);
  assert.ok(p.acc.y > 0 && Math.abs(p.acc.x) < 1e-9);
  assert.ok(close(p.facing, Math.PI / 2), 'orienté vers le boss');
  p.acc.set(0, 0);
  p.control({ move: { x: 1, y: 0 }, lock: true }, b2, arena);
  assert.ok(Math.abs(p.acc.x) > 0.1 && Math.abs(p.acc.y) < 1e-9, 'droite : tourne autour du boss');
});

test('boss : attente entre deux attaques (cooldown) et attaque télégraphiée', () => {
  const { Player, Boss, Combat, arena } = world();
  const p = new Player(500, 350), b = new Boss(580, 350);
  const attack = { mode: 'hold', speed: 0, attack: true, dodge: false };
  b.cooldown = 0.5;
  b.control(attack, p, arena, Combat.DT);
  assert.equal(b.action, null, 'attente pas finie');
  b.tick(0.5);
  assert.equal(b.cooldown, 0);
  b.control(attack, p, arena, Combat.DT);
  assert.ok(b.action, 'attaque lancée');
  assert.equal(b.cooldown, Combat.BOSS.cooldown);
  assert.equal(b.stats.attacks, 1);
  // Pendant la préparation, pas de nouvelle attaque ni d'esquive ; le boss freine sur place
  b.control(attack, p, arena, Combat.DT);
  assert.equal(b.stats.attacks, 1);
  // Après une attaque dans le vide, le coup compte comme raté
  for (let i = 0; i < 200; i++) b.tick(Combat.DT);
  assert.equal(b.action, null);
  assert.equal(b.stats.whiffs, 1);
});

test('boss : phase enragée à 30 % inclus, vitesse × 1,35 et attente × 0,55', () => {
  const { Player, Boss, Combat, arena } = world();
  const b = new Boss(500, 350);
  b.hp = 0.3 * b.maxHp + 1;
  assert.equal(b.enraged, false);
  assert.equal(b.attackCooldown(), Combat.BOSS.cooldown);
  b.receiveHit(1);
  assert.equal(b.hp, 0.3 * b.maxHp);
  assert.equal(b.enraged, true, 'seuil inclusif');
  assert.ok(b.rageTime >= 0, 'passage en phase enragée noté');
  assert.ok(close(b.attackCooldown(), Combat.BOSS.cooldown * 0.55));
  const p = new Player(300, 350);
  b.control({ mode: 'approach', speed: 1, attack: false, dodge: false }, p, arena, Combat.DT);
  assert.ok(close(b.maxSpeed, Combat.BOSS.maxSpeed * 1.35));
  const calm = new Boss(500, 350);
  calm.control({ mode: 'approach', speed: 1, attack: false, dodge: false }, p, arena, Combat.DT);
  assert.ok(close(calm.maxSpeed, Combat.BOSS.maxSpeed));
});

test('boss : esquive seulement si le joueur attaque', () => {
  const { Player, Boss, Combat, arena } = world();
  const p = new Player(500, 350), b = new Boss(580, 350);
  const dodge = { mode: 'hold', speed: 0, attack: false, dodge: true };
  b.control(dodge, p, arena, Combat.DT);
  assert.equal(b.dodge, null, 'le joueur n\'attaque pas');
  p.action = Combat.newAttack('light', 0);
  b.control(dodge, p, arena, Combat.DT);
  assert.ok(b.dodge);
  assert.equal(b.maxSpeed, Combat.BOSS.dodge.maxSpeed);
  // L'esquive utilise evade : le boss s'éloigne du joueur
  b.acc.set(0, 0);
  b.control(dodge, p, arena, Combat.DT);
  assert.ok(b.acc.x > 0);
  b.tick(Combat.BOSS.dodge.duration);
  assert.equal(b.dodge, null);
  assert.equal(b.maxSpeed, Combat.BOSS.maxSpeed);
  // Nouvelle esquive refusée tant que son attente n'est pas finie
  b.control(dodge, p, arena, Combat.DT);
  assert.equal(b.dodge, null);
});

test('boss : wander hors du rayon de détection (sans décision), arrive en spirale vers sa distance, flee pour reculer, il rôde', () => {
  const { Player, Boss, Combat, Steering, arena } = world();
  const far = new Player(100, 100), b = new Boss(700, 450);
  b.control({ mode: 'approach', speed: 1, attack: true, dodge: false }, far, arena, Combat.DT);
  assert.equal(b.wandering, true);
  assert.equal(b.action, null, 'pas d\'attaque pendant l\'errance');
  // Rayon réglable
  b.detectRadius = 1000;
  b.control({ mode: 'hold', speed: 0, attack: false, dodge: false }, far, arena, Combat.DT);
  assert.equal(b.wandering, false);

  // Approche : arrive vers un point du cercle de garde, en avance dans le sens latéral (approche en spirale)
  const B = Combat.BOSS;
  const p = new Player(500, 350);
  const near = new Boss(500 + B.keepDistance + 20, 350);
  near.vel.set(-2.5, 0); // il arrive à pleine vitesse sur le cercle de garde
  near.control({ mode: 'approach', speed: 1, strafe: -1, attack: false, dodge: false }, p, arena, Combat.DT);
  const point = Steering.orbitPoint(near, p.pos, B.keepDistance, -1, B.orbitLead);
  const expected = near.arrive(point);
  assert.ok(close(near.acc.x, expected.x) && close(near.acc.y, expected.y));
  assert.ok(point.y < 350, 'strafe −1 : point en avance vers le haut à l\'écran');
  assert.ok(close(Math.hypot(point.x - 500, point.y - 350), B.keepDistance), 'sur le cercle de garde');
  // Sans ordre latéral : il rôde, point en avance de prowlSpeed × orbitLead, sens prowlSide
  const prowl = new Boss(500 + B.keepDistance, 350);
  prowl.control({ mode: 'approach', speed: 1, strafe: 0.05, attack: false, dodge: false }, p, arena, Combat.DT);
  const pp = prowl.arrive(Steering.orbitPoint(prowl, p.pos, B.keepDistance, 1, B.prowlSpeed * B.orbitLead));
  assert.ok(close(prowl.acc.x, pp.x) && close(prowl.acc.y, pp.y));
  assert.ok(prowl.acc.mag() > 0.01, 'déjà à distance de garde, il ne reste pas planté');
  // Le sens de la rôde change toutes les prowlSwitch secondes
  const later = new Boss(500 + B.keepDistance, 350);
  later.time = B.prowlSwitch;
  later.control({ mode: 'hold', speed: 0, strafe: 0, attack: false, dodge: false }, p, arena, Combat.DT);
  // Sans approche : `seek` vers un point en avance sur le cercle où il se trouve, pondéré par la rôde
  const lo = later.seek(Steering.orbitPoint(later, p.pos, B.keepDistance, -1, B.orbitLead)).mult(B.prowlSpeed);
  assert.ok(close(later.acc.x, lo.x) && close(later.acc.y, lo.y), 'sens inversé après 3 s');
  assert.ok(later.acc.y < 0, 'sens −1 : il part vers le haut à l\'écran (tangente)');

  // Recul : flee de Reynolds + seek latéral (poids 1)
  const r = new Boss(600, 350);
  r.vel.set(-1, 0.5);
  r.control({ mode: 'retreat', speed: 1, strafe: 1, attack: false, dodge: false }, p, arena, Combat.DT);
  const f = Steering.flee(r, p.pos).add(r.seek(Steering.orbitPoint(r, p.pos, 100, 1, B.orbitLead)));
  assert.ok(close(r.acc.x, f.x) && close(r.acc.y, f.y));
});
