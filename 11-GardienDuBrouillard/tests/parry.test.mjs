import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './helpers.mjs';

const { get } = load(17);
const g = n => get(n);
const Combat = g('Combat'), Player = g('Player'), Boss = g('Boss'), Creux = g('Creux'), Fight = g('Fight'), PackFight = g('PackFight'),
  Arena = g('Arena'), HumanController = g('HumanController'), GameFeel = g('GameFeel'), Effects = g('Effects'), Hud = g('Hud');
const still = { mode: 'hold', speed: 0, strafe: 0, attack: false, dodge: false, charge: false, breath: false, order: ['attack'] };
const fixedBoss = d => ({ name: 'test', decide: () => Object.assign({}, still, d) });
const idle = { intent: () => ({ move: { x: 0, y: 0 }, lock: false, light: false, heavy: false, roll: false, drink: false, parry: false }) };
const quietPack = { decide: () => ({ pursue: 0, flank: 0, evade: 0, flock: 0, bite: false }) };

/** Parade dans sa fenêtre active, orientée vers `facing`. */
function parrying(player, facing, t = Combat.ATTACKS.parry.windup) {
  player.action = Combat.newAttack('parry', facing);
  player.action.t = t;
}

/** Un combat où le boss, à 60 px à droite du chevalier, a sa hallebarde en pleine frappe. */
function swingAt(kind = 'boss') {
  const f = new Fight({ arena: new Arena(), playerController: idle, bossController: fixedBoss({}), maxTime: 10 });
  f.player.pos.set(400, 350);
  f.boss.pos.set(460, 350);
  f.boss.action = Combat.newAttack(kind, Math.PI);   // tourné vers le chevalier
  f.boss.action.t = Combat.ATTACKS[kind].windup;
  if (kind === 'charge') {
    f.boss.action.target = { x: 300, y: 350 };
    f.boss.pos.set(440, 350);   // la ruée touche au contact (portée 42 px)
  }
  return f;
}

test('parade : règle pure (attaque parable, fenêtre active, attaquant devant le bouclier)', () => {
  const p = new Player(400, 350), b = new Boss(460, 350);
  const swing = Combat.newAttack('boss', Math.PI);
  assert.equal(Combat.parries(p, b, swing), false, 'sans parade');
  parrying(p, 0);
  assert.equal(Combat.parries(p, b, swing), true, 'face au boss, fenêtre active');
  parrying(p, 0, 0);
  assert.equal(Combat.parries(p, b, swing), false, 'encore en mise en garde');
  parrying(p, 0, Combat.ATTACKS.parry.windup + Combat.ATTACKS.parry.active);
  assert.equal(Combat.parries(p, b, swing), false, 'fenêtre passée : récupération');
  parrying(p, Math.PI);
  assert.equal(Combat.parries(p, b, swing), false, 'dos tourné au boss');
  const edge = Combat.ATTACKS.parry.arc / 2;
  parrying(p, edge);
  assert.equal(Combat.parries(p, b, swing), true, 'bord du bouclier (seuil inclus)');
  parrying(p, edge + 0.02);
  assert.equal(Combat.parries(p, b, swing), false, 'juste hors du bouclier');
  parrying(p, 0);
  assert.equal(Combat.parries(p, b, Combat.newAttack('charge', Math.PI)), false, 'la ruée ne se pare pas');
  assert.equal(Combat.ATTACKS.boss.parryable, true);
  assert.equal(Creux.BITE.parryable, true);
});

test('hallebarde parée : aucun dégât, boss déséquilibré exactement le temps prévu, puis il reprend', () => {
  const f = swingAt();
  parrying(f.player, 0);
  f.resolveHit(f.boss, f.player, 'boss');
  assert.equal(f.player.hp, f.player.maxHp, 'aucun dégât');
  assert.equal(f.boss.action, null, 'le coup s\'arrête');
  assert.equal(f.boss.stun.riposte, true);
  assert.equal(f.boss.stun.duration, Combat.BOSS.parry.stagger);
  assert.equal(f.player.stats.parries, 1);
  assert.equal(f.boss.stats.parried, 1);
  assert.equal(f.events[0].type, 'parry');
  assert.equal(f.boss.canAct(), false, 'déséquilibré : il ne peut rien faire');
  const steps = Math.round(Combat.BOSS.parry.stagger / Combat.DT);
  for (let i = 0; i < steps - 1; i++) f.boss.tick(Combat.DT);
  assert.ok(f.boss.stun, 'encore déséquilibré juste avant la fin');
  f.boss.tick(Combat.DT);
  assert.equal(f.boss.stun, null, 'il reprend après exactement la durée prévue');
  // Une ruée écrasée contre un pilier garde sa propre durée, sans riposte critique
  f.boss.crash();
  assert.equal(f.boss.stun.duration, Combat.BOSS.stun);
  assert.equal(f.boss.stun.riposte, false);
});

test('parade ratée ou ruée : le coup touche, et le chevalier en récupération est vulnérable', () => {
  const late = swingAt();
  parrying(late.player, 0, Combat.ATTACKS.parry.windup + Combat.ATTACKS.parry.active + 0.01);
  late.resolveHit(late.boss, late.player, 'boss');
  assert.equal(late.player.hp, late.player.maxHp - Combat.ATTACKS.boss.damage, 'trop tard : touché');
  assert.equal(late.player.vulnerable, true, 'récupération de la parade : vulnérable');
  const charge = swingAt('charge');
  parrying(charge.player, 0);
  charge.resolveHit(charge.boss, charge.player, 'boss');
  assert.equal(charge.player.hp, charge.player.maxHp - Combat.ATTACKS.charge.damage, 'la ruée passe le bouclier');
  assert.equal(charge.boss.stun, null);
});

test('riposte critique : × CRITICAL une seule fois par parade, sur le boss comme sur un Creux', () => {
  const f = swingAt();
  parrying(f.player, 0);
  f.resolveHit(f.boss, f.player, 'boss');
  const hit = () => {
    f.player.action = Combat.newAttack('light', 0);
    f.player.action.t = Combat.ATTACKS.light.windup;
    f.player.pos.set(f.boss.pos.x - 40, f.boss.pos.y);
    f.resolveHit(f.player, f.boss, 'player');
  };
  hit();
  const crit = Combat.ATTACKS.light.damage * Combat.CRITICAL;
  assert.equal(f.boss.hp, f.boss.maxHp - crit);
  assert.equal(f.damageToBoss, crit);
  assert.equal(f.events.at(-1).critical, true);
  assert.equal(f.player.stats.criticals, 1);
  hit();
  assert.equal(f.boss.hp, f.boss.maxHp - crit - Combat.ATTACKS.light.damage, 'le coup suivant est normal');
  assert.equal(f.events.at(-1).critical, false);
  // Creux : morsure parée, déséquilibre, coup lourd critique
  const pf = new PackFight({ arena: new Arena(), size: 1, playerController: idle, packController: quietPack, maxTime: 10 });
  const c = pf.creux[0];
  pf.player.pos.set(400, 350);
  c.pos.set(430, 350);
  c.startBite(Math.PI);
  c.action.t = Creux.BITE.windup;
  parrying(pf.player, 0);
  pf.resolveBite(c);
  assert.equal(pf.player.hp, pf.player.maxHp);
  assert.equal(c.stun.riposte, true);
  assert.equal(c.stun.duration, Creux.PARRY_STAGGER);
  assert.equal(pf.player.stats.parries, 1);
  pf.player.action = Combat.newAttack('heavy', 0);
  pf.player.action.t = Combat.ATTACKS.heavy.windup;
  pf.resolvePlayerHit();
  assert.equal(c.alive, false, 'riposte critique d\'un coup lourd : 90 dégâts, le Creux tombe');
  assert.equal(pf.damageToPack, Combat.ATTACKS.heavy.damage * Combat.CRITICAL);
  // Creux déséquilibré : il ne mord pas et freine
  const c2 = new Creux(430, 350);
  c2.parried();
  c2.perceive([c2]);
  c2.control({ pursue: 1, flank: 0, evade: 0, flock: 0, bite: true }, pf.player, pf.arena);
  assert.equal(c2.action, null);
  assert.equal(c2.forces, null);
});

test('chevalier : la parade coûte de l\'endurance, se lance au clavier (U, Maj), n\'est pas un coup pour le boss', () => {
  const arena = new Arena();
  const b = new Boss(460, 350);
  const p = new Player(400, 350);
  const intent = { move: { x: 0, y: 0 }, lock: true, light: false, heavy: false, roll: false, drink: false, parry: true };
  p.control(intent, b, arena);
  assert.equal(p.action.kind, 'parry');
  assert.equal(p.stamina, p.maxStamina - Combat.ATTACKS.parry.stamina);
  assert.ok(Math.abs(p.action.facing) < 1e-9, 'verrouillé : bouclier vers le boss');
  assert.equal(p.isAttacking(), false, 'le boss n\'esquive pas une parade');
  const tired = new Player(400, 350);
  tired.stamina = Combat.ATTACKS.parry.stamina - 1;
  tired.control(intent, b, arena);
  assert.equal(tired.action, null, 'pas assez d\'endurance');
  const h = new HumanController();
  for (const k of ['u', 'Shift']) {
    h.reset();
    h.keyDown(k);
    assert.equal(h.intent(new Player(0, 0), b, arena, Combat.DT).parry, true, k);
  }
});

test('retours visuels : parade et critique (textes, étincelles, gel plus long), invite de riposte', () => {
  const fx = new Effects(100);
  fx.add({ type: 'parry', x: 1, y: 2 }, 0);
  assert.ok(fx.items.some(i => i.text === 'PARADE !'));
  assert.ok(fx.particles.items.length > 0, 'étincelles');
  fx.add({ type: 'hit', who: 'player', kind: 'light', damage: 42, critical: true, x: 1, y: 2 }, 0);
  assert.ok(fx.items.some(i => /CRITIQUE/.test(i.text)));
  const feel = new GameFeel();
  feel.onEvents([{ type: 'hit', who: 'player', kind: 'heavy', critical: false }]);
  const heavy = feel.hitStop;
  feel.reset();
  feel.onEvents([{ type: 'hit', who: 'player', kind: 'light', critical: true }]);
  assert.ok(feel.hitStop > heavy, 'un critique gèle plus longtemps qu\'un coup lourd');
  feel.reset();
  feel.onEvents([{ type: 'parry' }]);
  assert.ok(feel.hitStop > 0 && feel.trauma > 0);
  const b = new Boss(0, 0);
  b.parried();
  assert.match(Hud.bossLabel(b).text, /RIPOSTE/);
  b.crash();
  assert.equal(Hud.bossLabel(b).text, 'Étourdi !');
});
