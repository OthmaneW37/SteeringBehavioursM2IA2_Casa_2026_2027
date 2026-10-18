import test from 'node:test';
import assert from 'node:assert/strict';
import { load, read, plain, lcg } from './helpers.mjs';

const { get } = load(31);
const g = n => get(n);
const Quality = g('Quality'), GameFeel = g('GameFeel'), Particles = g('Particles'), Lighting = g('Lighting'), Fog = g('Fog'),
  Fight = g('Fight'), Arena = g('Arena'), Combat = g('Combat'), ScriptedPlayerController = g('ScriptedPlayerController'),
  HandBossController = g('HandBossController'), seededRandom = g('seededRandom'), Settings = g('Settings'), Hud = g('Hud'),
  Effects = g('Effects'), Campfire = g('Campfire'), Bloodstain = g('Bloodstain'), DebugPanel = g('DebugPanel');
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function memoryStorage() {
  const data = {};
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

test('qualité graphique : 3 niveaux dans leurs bornes, du moins cher au plus beau ; choix gardé sans plantage', () => {
  const ids = Object.keys(Quality.LEVELS);
  assert.deepEqual(ids, ['bas', 'moyen', 'haut']);
  for (const id of ids) {
    const q = Quality.LEVELS[id];
    for (const [k, [lo, hi]] of Object.entries(Quality.RANGES)) assert.ok(q[k] >= lo && q[k] <= hi, `${id}.${k}`);
    assert.ok(Number.isInteger(q.particles) && Number.isInteger(q.fogEvery) && Number.isInteger(q.fogCells));
  }
  const [b, m, h] = ids.map(Quality.get);
  assert.ok(b.particles < m.particles && m.particles < h.particles);
  assert.ok(b.lightScale <= m.lightScale && m.lightScale <= h.lightScale);
  assert.ok(b.fogEvery >= m.fogEvery && m.fogEvery >= h.fogEvery);
  assert.equal(b.glow, false);
  assert.ok(b.renderScale < m.renderScale && m.renderScale <= h.renderScale && h.renderScale <= 1, "jamais plus d'un pixel par pixel CSS");
  assert.equal(Quality.DEFAULT, 'moyen');
  assert.throws(() => Quality.get('ultra'), { name: 'RangeError' });
  const mem = memoryStorage();
  assert.equal(Quality.load(mem), 'moyen');
  assert.equal(Quality.save(mem, 'haut'), true);
  assert.equal(Quality.load(mem), 'haut');
  mem.setItem(Quality.KEY, 'nimporte');
  assert.equal(Quality.load(mem), 'moyen', 'valeur inconnue : niveau par défaut');
  const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(Quality.load(blocked), 'moyen');
  assert.equal(Quality.save(blocked, 'bas'), false);
  assert.throws(() => Quality.save(mem, 'ultra'), { name: 'RangeError' });
});

test('effets d\'impact : gel exact, tremblement amorti et borné, flash ; ralenti seulement des animations finales', () => {
  const f = new GameFeel();
  assert.equal(f.timeScale(), 1);
  f.onEvents([{ type: 'hit', who: 'boss', kind: 'boss' }]);
  assert.equal(f.flash, 1);
  assert.ok(close(f.trauma, GameFeel.TRAUMA.playerHit));
  assert.equal(f.timeScale(), 0, 'gel d\'impact');
  f.update(GameFeel.HITSTOP.heavy - 0.01);
  assert.equal(f.timeScale(), 0);
  f.update(0.02);
  assert.equal(f.timeScale(), 1, 'le gel dure exactement HITSTOP.heavy');
  // Coup léger du joueur : gel plus court ; lourd : plus long
  const l = new GameFeel();
  l.onEvents([{ type: 'hit', who: 'player', kind: 'light' }]);
  assert.ok(close(l.hitStop, GameFeel.HITSTOP.light));
  assert.ok(close(l.trauma, GameFeel.TRAUMA.light));
  l.onEvents([{ type: 'hit', who: 'player', kind: 'heavy' }]);
  assert.ok(close(l.hitStop, GameFeel.HITSTOP.heavy), 'le plus long gel l\'emporte');
  // Trauma plafonné à 1, puis amorti à vitesse constante
  const t = new GameFeel();
  for (let i = 0; i < 10; i++) t.onEvents([{ type: 'crumble' }]);
  assert.equal(t.trauma, 1);
  for (const time of [0, 0.37, 1.9, 12.5]) {
    const s = t.shake(time);
    assert.ok(Math.abs(s.x) <= GameFeel.MAX_SHAKE + 1e-9 && Math.abs(s.y) <= GameFeel.MAX_SHAKE + 1e-9);
  }
  t.update(0.25);
  assert.ok(close(t.trauma, 1 - GameFeel.DECAY * 0.25));
  t.update(10);
  assert.equal(t.trauma, 0);
  assert.deepEqual(plain(t.shake(3)), { x: 0, y: 0 }, 'plus de tremblement');
  assert.ok(close(t.flash, 0));
  // Événements sans effet
  const n = new GameFeel();
  n.onEvents([{ type: 'mist' }, { type: 'dodged' }]);
  assert.equal(n.trauma, 0);
  assert.equal(n.timeScale(), 1);
  // Mort du boss : seules les animations ralentissent, pas le temps de la simulation
  const d = new GameFeel();
  d.onBossDeath();
  assert.equal(d.visualScale(), GameFeel.SLOW_SCALE);
  assert.equal(d.timeScale(), 1);
  d.update(GameFeel.SLOW_DURATION + 0.01);
  assert.equal(d.visualScale(), 1);
  d.reset();
  assert.deepEqual(plain({ a: d.trauma, b: d.hitStop, c: d.slowMo, e: d.flash }), { a: 0, b: 0, c: 0, e: 0 });
});

test('gel d\'impact : seulement en combat au clavier, jamais dans la simulation ni l\'entraînement', () => {
  for (const f of ['fight.js', 'training.js', 'comparison.js', 'tournament.js', 'demo.js', 'boss.js', 'player.js', 'scriptedPlayer.js', 'handBoss.js', 'bossBrain.js']) {
    assert.ok(!/GameFeel|timeScale|game\.feel/.test(read(f)), f + ' ignore les effets d\'impact');
  }
  const sketch = read('sketch.js');
  const uses = [...sketch.matchAll(/feel\.timeScale\(\)/g)].length;
  assert.equal(uses, 1, 'un seul usage du gel');
  const body = sketch.slice(sketch.indexOf('function updateCombat('), sketch.indexOf('\n}', sketch.indexOf('function updateCombat(')));
  assert.ok(body.includes('feel.timeScale()'), 'dans updateCombat (combat au clavier)');
  for (const fn of ['updateTraining', 'updateComparison', 'updateTournament', 'updateDemo', 'updateTitleFight']) {
    const i = sketch.indexOf('function ' + fn + '(');
    assert.ok(i >= 0, fn);
    const b = sketch.slice(i, sketch.indexOf('\n}', i));
    assert.ok(!b.includes('feel'), fn + ' sans effet d\'impact');
  }
});

test('particules : plafond, recyclage du plus ancien, durée de vie, réaction aux événements, braises à cadence fixe', () => {
  const p = new Particles(10, lcg(3));
  assert.equal(p.emit('dust', 100, 100, 6), 6);
  assert.equal(p.items.length, 6);
  p.emit('spark', 200, 200, 7);
  assert.equal(p.items.length, 10, 'plafond');
  assert.equal(p.items.filter(q => q.kind === 'spark').length, 7, 'les plus anciennes sont remplacées');
  assert.equal(p.items.filter(q => q.kind === 'dust').length, 3);
  assert.throws(() => p.emit('magie', 0, 0, 1), { name: 'RangeError' });
  // Durée de vie : tout disparaît après la plus longue vie possible
  const maxLife = Math.max(...Object.values(Particles.KINDS).map(k => k.life[1]));
  for (let t = 0; t < maxLife + 0.1; t += 0.05) {
    p.update(0.05);
    for (const q of p.items) assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y) && q.age < q.life);
  }
  assert.equal(p.items.length, 0);
  // Réactions
  const r = new Particles(1000, lcg(4));
  assert.equal(r.fromEvent({ type: 'hit', who: 'boss', x: 0, y: 0 }), 22);
  assert.equal(r.items.filter(q => q.kind === 'blood').length, 22, 'le joueur saigne');
  assert.equal(r.fromEvent({ type: 'hit', who: 'player', kind: 'heavy', x: 0, y: 0 }), 18, 'étincelles sur l\'armure du boss');
  assert.equal(r.fromEvent({ type: 'hit', who: 'player', kind: 'light', x: 0, y: 0 }), 10);
  assert.equal(r.fromEvent({ type: 'crumble', x: 0, y: 0 }), 40);
  assert.equal(r.fromEvent({ type: 'inconnu', x: 0, y: 0 }), 0);
  // Braises : EMBER_RATE par seconde, qui montent
  const e = new Particles(1000, lcg(5));
  let n = 0;
  for (let i = 0; i < 60; i++) n += e.ambient({ x: 100, y: 100 }, 1 / 60);
  assert.ok(Math.abs(n - Particles.EMBER_RATE) <= 1, 'cadence : ' + n);
  e.update(0.5);
  assert.ok(e.items.every(q => q.y < 100), 'les braises montent');
  // Plafond nul : rien n'est émis ; réduction du plafond : la réserve est tronquée
  const z = new Particles(0, lcg(1));
  assert.equal(z.emit('dust', 0, 0, 5), 0);
  r.setCap(5);
  assert.equal(r.items.length, 5);
});

test('éclairage : sources tirées de l\'état (feu, chevalier, boss, brume), puissances dans [0, 1]', () => {
  const arena = new Arena();
  const f = new Fight({ arena, playerController: new ScriptedPlayerController(seededRandom(1), Settings.defaults()),
    bossController: new HandBossController(), maxTime: 30, seed: 1, pillars: 4 });
  const fire = arena.campfirePos;
  const s0 = Lighting.sources(null, fire, 0);
  assert.equal(s0.length, 1, 'le feu seul');
  const s = Lighting.sources(f, fire, 2);
  assert.equal(s.length, 3, 'feu, chevalier, boss');
  for (const l of s) {
    assert.ok(l.power >= 0 && l.power <= 1 && l.r > 0);
    assert.equal(l.color.length, 3);
  }
  assert.deepEqual(plain(Lighting.sources(f, fire, 2)), plain(s), 'reproductible');
  assert.notDeepEqual(plain(Lighting.sources(f, fire, 2.1)[0].r), plain(s[0].r), 'le feu vacille');
  // Boss enragé : lueur rouge et plus grande ; mort : plus de lueur
  const calm = s[2];
  f.boss.hp = f.boss.maxHp * 0.2;
  const rage = Lighting.sources(f, fire, 2)[2];
  assert.ok(rage.r > calm.r && rage.color[0] > rage.color[2]);
  f.boss.hp = 0;
  assert.equal(Lighting.sources(f, fire, 2).length, 2);
  f.player.hp = 0;
  assert.equal(Lighting.sources(f, fire, 2).length, 1);
  // Nappe de brume : une lumière verte de plus
  f.zones.push(new (g('MistPatch'))(500, 350, 60, 6));
  f.zones[0].age = 1;
  const z = Lighting.sources(f, fire, 2);
  assert.equal(z.length, 2);
  assert.ok(z[1].color[1] > z[1].color[0], 'verte');
});

test('brouillard : bruit lisse, reproductible, borné ; densité qui dérive avec le temps', () => {
  for (let i = 0; i < 200; i++) {
    const x = i * 0.37, y = i * 0.71;
    const n = Fog.noise(x, y);
    assert.ok(n >= 0 && n <= 1);
    assert.equal(Fog.noise(x, y), n, 'reproductible');
    assert.ok(Math.abs(Fog.noise(x + 1e-4, y) - n) < 1e-2, 'continu');
    const d = Fog.density(x * 40, y * 40, i * 0.3);
    assert.ok(d >= 0 && d <= 1);
  }
  assert.ok(close(Fog.noise(3, 4, 1), Fog.hash(3, 4, 1)), 'aux points entiers, la valeur de la grille');
  // Continu partout, y compris au milieu des cellules et sur leurs bords (pas de marches)
  for (let k = 0; k < 30; k++) {
    for (const edge of [k + 0.5, k + 1]) {
      const y = 0.3 + k * 0.77;
      assert.ok(Math.abs(Fog.noise(edge - 1e-4, y) - Fog.noise(edge + 1e-4, y)) < 1e-2, 'continu en x = ' + edge);
      assert.ok(Math.abs(Fog.noise(y, edge - 1e-4) - Fog.noise(y, edge + 1e-4)) < 1e-2, 'continu en y = ' + edge);
    }
  }
  assert.notEqual(Fog.noise(3.5, 4.5, 1), Fog.noise(3.5, 4.5, 2), 'une autre graine donne un autre bruit');
  let moved = 0;
  for (let i = 0; i < 20; i++) if (Math.abs(Fog.density(i * 50, 300, 0) - Fog.density(i * 50, 300, 30)) > 1e-3) moved++;
  assert.ok(moved > 10, 'le brouillard dérive');
});

test('le rendu ne modifie jamais l\'état du combat', () => {
  const arena = new Arena();
  const f = new Fight({ arena, playerController: new ScriptedPlayerController(seededRandom(7), Settings.defaults()),
    bossController: new HandBossController(), maxTime: 60, seed: 7, pillars: 4 });
  for (let i = 0; i < 400 && !f.over; i++) f.step();
  // Des états variés à dessiner : une ruée en préparation, une nappe de brume, un pilier fissuré
  f.boss.action = Combat.newAttack('charge', 0);
  f.boss.action.target = { x: 800, y: 300 };
  f.boss.action.t = 0.45;
  f.zones.push(new (g('MistPatch'))(400, 300, 60, 6));
  f.pillars[0].hp = 1;
  const snap = () => JSON.stringify({
    p: [f.player.pos, f.player.vel, f.player.acc, f.player.hp, f.player.stamina, f.player.facing, f.player.action, f.player.roll, f.player.drink, f.player.estus],
    b: [f.boss.pos, f.boss.vel, f.boss.acc, f.boss.hp, f.boss.facing, f.boss.action, f.boss.cooldown, f.boss.chargeCooldown, f.boss.breathCooldown,
      f.boss.dodgeCooldown, f.boss.campTime, f.boss.stats, f.boss.wanderTheta, f.boss.time, f.boss.hurtTimer, f.boss.riposteTime,
      f.boss.rageTime, f.boss.stun, f.boss.dodge, f.boss.maxSpeed, f.boss.maxForce, f.player.hurtTimer, f.player.regenTimer, f.player.maxSpeed],
    z: f.zones.map(z => [z.pos, z.age]), pil: f.pillars.map(p => [p.pos, p.hp, p.shakeTimer]), t: f.time, over: f.over
  });
  const before = snap();
  const fx = new Effects(200);
  for (let k = 0; k < 3; k++) {
    for (const p of f.pillars) p.show(arena.campfirePos);
    for (const z of f.zones) z.show(1.5);
    f.player.show();
    f.boss.show();
    f.boss.showTelegraph();
    for (const kind of ['boss', 'breath']) { const a = f.boss.action; f.boss.action = Object.assign(Combat.newAttack(kind, 0), { target: { x: 400, y: 300 }, t: 0.3 }); f.boss.showTelegraph(); f.boss.action = a; }
    new Campfire(arena.campfirePos.x, arena.campfirePos.y).show(2);
    Hud.techniqueLabel(f.boss);
    Hud.bossLabel(f.boss);
    DebugPanel.drawWorld(f.boss, f.player, arena);
    Lighting.sources(f, arena.campfirePos, 1.2);
    for (const e of [{ type: 'hit', who: 'boss', x: 1, y: 2, damage: 22 }, { type: 'crash', x: 3, y: 4 }]) fx.add(e, 1);
    fx.update(0.1, arena.campfirePos);
    fx.showParticles();
    fx.show();
  }
  assert.equal(snap(), before, 'état identique après le dessin');
  // Et la suite du combat est la même qu'un combat jamais dessiné
  const twin = new Fight({ arena: new Arena(), playerController: new ScriptedPlayerController(seededRandom(7), Settings.defaults()),
    bossController: new HandBossController(), maxTime: 60, seed: 7, pillars: 4 });
  for (let i = 0; i < 400 && !twin.over; i++) twin.step();
  assert.deepEqual(plain(twin.player.pos), plain(f.player.pos));
});

test('interpolation du rendu : décalage exact, nul sans état précédent ou après une téléportation, sans toucher l\'état', () => {
  const Interpolation = g('Interpolation'), Player = g('Player');
  const p = new Player(100, 100);
  const prev = Interpolation.snapshot([p, null]);
  assert.equal(prev.size, 1);
  p.pos.set(110, 96);   // un pas plus tard
  assert.deepEqual(plain(Interpolation.offset(p, prev, 0)), { x: -10, y: 4 }, 'alpha 0 : dessiné à la position précédente');
  assert.deepEqual(plain(Interpolation.offset(p, prev, 1)), { x: 0, y: 0 }, 'alpha 1 : à la position actuelle');
  const half = Interpolation.offset(p, prev, 0.5);
  assert.ok(close(half.x, -5) && close(half.y, 2), 'à mi-chemin');
  assert.deepEqual(plain(p.pos), { x: 110, y: 96 }, "l'état n'est pas modifié");
  assert.deepEqual(plain(Interpolation.offset(new Player(0, 0), prev, 0)), { x: 0, y: 0 }, 'entité inconnue');
  assert.deepEqual(plain(Interpolation.offset(p, null, 0)), { x: 0, y: 0 });
  p.pos.set(500, 500);
  assert.deepEqual(plain(Interpolation.offset(p, prev, 0)), { x: 0, y: 0 }, 'téléportation : pas de traînée');
  assert.equal(Interpolation.alpha(Combat.DT / 4, Combat.DT), 0.25);
  assert.equal(Interpolation.alpha(-1, Combat.DT), 0);
  assert.equal(Interpolation.alpha(1, Combat.DT), 1);
  const f = new Fight({ arena: new Arena(), playerController: new ScriptedPlayerController(seededRandom(1), Settings.defaults()), bossController: new HandBossController() });
  assert.deepEqual(Interpolation.entitiesOf(f).length, 2);
});

test('brouillard : calculé une image sur fogEvery, composé dans le calque de lumière (sketch.js)', () => {
  const src = read('sketch.js');
  assert.ok(src.includes('game.fogLayer.update(game.time, q)'), 'la grille est passée au calque de lumière');
  assert.ok(!/game\.fogLayer\.draw\(/.test(src), "jamais étirée seule sur l'écran dans la vue principale");
  assert.ok(/pixelDensity\(Quality\.get\(/.test(src), 'densité de pixels réglée par la qualité');
});
