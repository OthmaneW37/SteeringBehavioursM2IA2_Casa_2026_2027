import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Adaptateur vectoriel minimal pour exercer le vrai vehicle.js sans DOM.
class Vector {
  constructor(x = 0, y = 0) { this.set(x, y); }
  set(x, y) { this.x = x; this.y = y; return this; }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  setMag(n) { const m = this.mag(); return m ? this.mult(n / m) : this; }
  limit(n) { return this.mag() > n ? this.setMag(n) : this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  heading() { return Math.atan2(this.y, this.x); }
  setHeading(angle) { const m = this.mag(); return this.set(Math.cos(angle) * m, Math.sin(angle) * m); }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
  static random2D() { const angle = Vector.rng() * 2 * Math.PI; return new Vector(Math.cos(angle), Math.sin(angle)); }
}
// Aléatoire reproductible (générateur congruentiel linéaire)
function seededRandom(seed = 12345) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}
function scene(w = 800, h = 600) {
  const rand = seededRandom();
  Vector.rng = rand;
  const intervals = [];
  const context = vm.createContext({
    createVector: (x, y) => new Vector(x, y), p5: { Vector }, width: w, height: h,
    random: (a, b) => (b === undefined ? rand() * a : a + rand() * (b - a)),
    color: (...channels) => 'rgb(' + channels.join(',') + ')',
    setInterval: fn => intervals.push(fn), clearInterval: () => {},
  });
  for (const file of ['vehicle.js', 'steering.js', 'follower.js', 'population.js', 'target.js', 'pointTarget.js',
    'targetFuyante.js', 'targetGroup.js',
    'gradientBackground.js', 'fmSynth.js', 'menuToggle.js', 'targetControls.js', 'scenarios.js']) {
    vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  }
  return Object.assign(vm.runInContext('({ Vehicle, Follower, Target, PointTarget, TargetFuyante, steering: Steering, targetGroup: TargetGroup, ' +
    'gradient: GradientBackground, fm: FMSynth, menu: MenuToggle, targetControls: TargetControls, scenarios: Scenarios, ' +
    'population: SeekPopulation })', context),
  { context, intervals });
}
const rng = () => 0.1;
const target = new Vector(400, 300);

test('population : bornes, conservation des instances et valeurs invalides', () => {
  const { Vehicle, population: p } = scene();
  const vehicles = [];
  const resize = n => p.resize(vehicles, n, target, 800, 600, (x, y) => new Vehicle(x, y), rng);
  resize(20);
  const first = vehicles[0]; first.vel.set(2, 1);
  resize(35); assert.equal(vehicles.length, 35); assert.equal(vehicles[0], first);
  resize(8); assert.equal(vehicles.length, 8); assert.equal(first.vel.x, 2);
  resize(8); assert.equal(vehicles[0], first);
  resize(200); assert.equal(vehicles.length, 200);
  resize(1); assert.equal(vehicles.length, 1);
  for (const n of [0, 201, 1.5, NaN, '20']) assert.throws(() => resize(n), { name: 'RangeError' });
});

test('slider : input met à jour population et compteur sans change', () => {
  const { Vehicle, population: p } = scene();
  const events = {}; const slider = { value: '20', addEventListener: (name, fn) => events[name] = fn };
  const output = {}; const vehicles = [];
  p.bindSlider(slider, output, vehicles, target, () => ({ width: 800, height: 600 }),
    (x, y) => new Vehicle(x, y), rng);
  for (const count of [1, 57, 200, 8]) {
    slider.value = String(count); events.input();
    assert.equal(vehicles.length, count); assert.equal(output.value, `${count} / 200`);
  }
  assert.equal(events.change, undefined);
});

test('edges fourni : quatre seuils stricts, angles et vitesse conservée', () => {
  const { Vehicle } = scene();
  for (const [x, y, expectedX, expectedY] of [
    [817, 100, -16, 100], [-17, 100, 816, 100],
    [100, 617, 100, -16], [100, -17, 100, 616],
    [817, -17, -16, 616], [816, 616, 816, 616], [-16, -16, -16, -16],
  ]) {
    const v = new Vehicle(x, y); v.vel.set(2, -3); v.edges();
    assert.deepEqual([v.pos.x, v.pos.y], [expectedX, expectedY]);
    assert.deepEqual([v.vel.x, v.vel.y], [2, -3]);
  }
});

test('seek fourni : forces proches/lointaines limitées et cible intacte', () => {
  const { Vehicle } = scene();
  for (const position of [new Vector(0.001, 0), new Vector(800, 600), new Vector(0, 0)]) {
    const v = new Vehicle(0, 0); const original = [position.x, position.y];
    const force = v.seek(position);
    assert.ok(force.mag() <= v.maxForce + 1e-12);
    if (position.mag()) assert.ok(force.x > 0);
    assert.deepEqual([position.x, position.y], original);
    v.vel.set(100, 100); v.applyBehaviors(position); v.update();
    assert.ok(v.vel.mag() <= v.maxSpeed + 1e-12);
    assert.equal(v.acc.mag(), 0);
  }
});

test('arrivée : seuil inclusif, même instance et paramètres préservés', () => {
  const { Vehicle, population: p } = scene();
  const v = new Vehicle(416.01, 300);
  assert.equal(p.hasArrived(v, target), false);
  v.pos.x = 416; assert.equal(p.hasArrived(v, target), true);
  v.vel.set(3, 1); v.acc.set(1, 2);
  const parameters = [v.r, v.maxSpeed, v.maxForce];
  p.step(v, target, 800, 600, rng);
  assert.equal(v.vel.mag(), 0); assert.equal(v.acc.mag(), 0);
  assert.ok(Math.hypot(v.pos.x - target.x, v.pos.y - target.y) > 20);
  assert.deepEqual([v.r, v.maxSpeed, v.maxForce], parameters);
});

test('arrivée avant/après déplacement, après wrap, et une seule réapparition', () => {
  const { Vehicle, population: p } = scene();
  const before = new Vehicle(400, 300);
  before.update = () => assert.fail('Pas de locomotion après une arrivée avant déplacement');
  let calls = 0;
  p.step(before, target, 800, 600, () => { calls++; return 0.1; });
  assert.equal(calls, 2);
  const after = new Vehicle(418, 300); after.vel.set(-4, 0);
  p.step(after, target, 800, 600, rng); assert.equal(after.vel.mag(), 0);
  const wrap = new Vehicle(815, 100); wrap.vel.set(4, 0);
  p.step(wrap, new Vector(0, 100), 800, 600, rng);
  assert.equal(wrap.vel.mag(), 0); assert.ok(wrap.pos.x >= 0);
});

test('tirage : marges, repli déterministe borné, petite géométrie impossible', () => {
  const { Vehicle, population: p } = scene();
  const point = p.spawnPosition(target, 800, 600, 16, rng);
  assert.ok(point.x >= 16 && point.x <= 784 && point.y >= 16 && point.y <= 584);
  let calls = 0;
  const fallback = p.spawnPosition(target, 800, 600, 16, () => { calls++; return 0.5; });
  assert.equal(calls, 64); assert.equal(fallback.x, 16); assert.equal(fallback.y, 16);
  assert.ok(p.spawnPosition(new Vector(20, 20), 40, 40, 16, () => 0.5));
  const smallTarget = new Vector(5, 5);
  assert.equal(p.spawnPosition(smallTarget, 10, 10, 16, rng), null);
  const v = new Vehicle(5, 5); v.vel.set(1, 2);
  assert.equal(p.respawn(v, smallTarget, 10, 10, rng), false);
  assert.deepEqual([v.pos.x, v.pos.y, v.vel.x, v.vel.y], [5, 5, 1, 2]);
  const vehicles = [];
  p.resize(vehicles, 200, smallTarget, 10, 10, (x, y) => new Vehicle(x, y), rng);
  assert.equal(vehicles.length, 200);
});

test('population : arrivées simultanées et véhicules supprimés non mis à jour', () => {
  const { Vehicle, population: p } = scene();
  const vehicles = [new Vehicle(400, 300), new Vehicle(400, 300)];
  for (const v of vehicles) p.step(v, target, 800, 600, rng);
  assert.equal(vehicles.length, 2);
  assert.ok(vehicles.every(v => !p.hasArrived(v, target)));
  const removed = vehicles[1]; removed.update = () => assert.fail('Véhicule supprimé');
  p.resize(vehicles, 1, target, 800, 600, () => assert.fail('Création inutile'));
  for (const v of vehicles) p.step(v, target, 800, 600, rng);
});

test('réglages : valeurs initiales identiques à celles de vehicle.js', () => {
  const { Vehicle, population: p } = scene();
  const settings = p.createSettings(); const v = new Vehicle(0, 0);
  assert.equal(settings.maxSpeed, v.maxSpeed); assert.equal(settings.maxForce, v.maxForce);
});

test('réglages : setParameter met à jour tous les véhicules et les réglages', () => {
  const { Vehicle, population: p } = scene();
  const settings = p.createSettings();
  const vehicles = [new Vehicle(1, 1), new Vehicle(2, 2), new Vehicle(3, 3)];
  p.setParameter(vehicles, settings, 'maxSpeed', 9);
  p.setParameter(vehicles, settings, 'maxForce', 0.5);
  assert.ok(vehicles.every(v => v.maxSpeed === 9 && v.maxForce === 0.5));
  assert.equal(settings.maxSpeed, 9); assert.equal(settings.maxForce, 0.5);
  assert.ok(vehicles.every(v => v.r === 16));
});

test('réglages : bornes inclusives, valeurs et noms invalides rejetés sans effet', () => {
  const { Vehicle, population: p } = scene();
  const settings = p.createSettings(); const vehicles = [new Vehicle(0, 0)];
  const { maxSpeed, maxForce } = p.PARAMETERS;
  for (const [name, range] of [['maxSpeed', maxSpeed], ['maxForce', maxForce]]) {
    p.setParameter(vehicles, settings, name, range.min); assert.equal(vehicles[0][name], range.min);
    p.setParameter(vehicles, settings, name, range.max); assert.equal(vehicles[0][name], range.max);
    for (const bad of [range.min - 0.001, range.max + 0.001, NaN, Infinity, '4', null, undefined]) {
      assert.throws(() => p.setParameter(vehicles, settings, name, bad), { name: 'RangeError' });
      assert.equal(vehicles[0][name], range.max); assert.equal(settings[name], range.max);
    }
  }
  assert.throws(() => p.setParameter(vehicles, settings, 'r', 5), { name: 'RangeError' });
  assert.equal(vehicles[0].r, 16);
});

test('réglages : le maximum de vitesse reste sous le diamètre du disque d\'arrivée', () => {
  const { population: p } = scene();
  assert.ok(p.PARAMETERS.maxSpeed.max < 2 * p.ARRIVAL_RADIUS);
});

test('sliders de réglage : input met à jour véhicules et affichage', () => {
  const { Vehicle, population: p } = scene();
  const settings = p.createSettings(); const vehicles = [new Vehicle(0, 0), new Vehicle(5, 5)];
  const events = {}; const slider = { value: '4', addEventListener: (name, fn) => events[name] = fn };
  const output = {};
  p.bindParameterSlider(slider, output, 'maxSpeed', vehicles, settings);
  assert.equal(output.value, '4.0');
  slider.value = '12.5'; events.input();
  assert.ok(vehicles.every(v => v.maxSpeed === 12.5)); assert.equal(output.value, '12.5');
  const forceSlider = { value: '0.1', addEventListener: (name, fn) => events[`f${name}`] = fn };
  p.bindParameterSlider(forceSlider, output, 'maxForce', vehicles, settings);
  forceSlider.value = '0.25'; events.finput();
  assert.ok(vehicles.every(v => v.maxForce === 0.25)); assert.equal(output.value, '0.25');
  assert.equal(events.change, undefined);
});

test('réglages : un véhicule ajouté ensuite reprend les valeurs courantes', () => {
  const { Vehicle, population: p } = scene();
  const settings = p.createSettings(); const vehicles = [];
  const create = (x, y) => { const v = new Vehicle(x, y); p.applySettings(v, settings); return v; };
  p.resize(vehicles, 3, target, 800, 600, create, rng);
  p.setParameter(vehicles, settings, 'maxSpeed', 10);
  p.setParameter(vehicles, settings, 'maxForce', 0.4);
  p.resize(vehicles, 6, target, 800, 600, create, rng);
  assert.ok(vehicles.every(v => v.maxSpeed === 10 && v.maxForce === 0.4));
});

test('réglages : effet réel sur seek et update, edges toujours appliqué', () => {
  const { Vehicle, population: p } = scene();
  const settings = p.createSettings(); const v = new Vehicle(100, 100);
  p.setParameter([v], settings, 'maxForce', 0.5);
  assert.ok(Math.abs(v.seek(new Vector(500, 100)).mag() - 0.5) < 1e-9);
  p.setParameter([v], settings, 'maxSpeed', 10);
  v.vel.set(0, 0); v.applyForce(new Vector(50, 0)); v.update();
  assert.ok(Math.abs(v.vel.mag() - 10) < 1e-9);
  const edge = new Vehicle(815, 100); edge.vel.set(10, 0); p.setParameter([edge], settings, 'maxSpeed', 10);
  p.step(edge, target, 800, 600, rng);
  assert.equal(edge.pos.x, -16); assert.ok(edge.vel.mag() > 0);
});

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('Follower.flee : vitesse désirée inversée puis force recalculée', () => {
  const { Vehicle, Follower } = scene();
  assert.ok(new Follower(0, 0) instanceof Vehicle);
  const f = new Follower(100, 100); f.maxForce = 10; f.vel.set(2, 0);
  const away = new Vector(200, 100);
  const flee = f.flee(away); const seek = f.seek(away);
  // desired = (-4, 0) ; force = desired - vel = (-6, 0)
  assert.ok(close(flee.x, -6) && close(flee.y, 0));
  // inverser la force finale de seek donnerait (-2, 0) : ce n'est pas le même résultat
  assert.ok(close(-seek.x, -2));
  assert.ok(!close(flee.x, -seek.x));
});

test('Follower.flee : force limitée, cible intacte, véhicule immobile sur la cible', () => {
  const { Follower } = scene();
  const f = new Follower(0, 0); const t = new Vector(30, 40); const original = [t.x, t.y];
  const force = f.flee(t);
  assert.ok(force.mag() <= f.maxForce + 1e-12);
  assert.ok(force.x < 0 && force.y < 0);
  assert.deepEqual([t.x, t.y], original);
  const onTarget = new Follower(5, 5); onTarget.vel.set(1, 0);
  const still = onTarget.flee(new Vector(5, 5));
  assert.ok(Number.isFinite(still.x) && Number.isFinite(still.y));
});

test('Follower : seek par défaut, flee quand fleeing est vrai', () => {
  const { Follower } = scene();
  const chaser = new Follower(0, 0); const t = new Vector(100, 0);
  chaser.applyBehaviors(t); assert.ok(chaser.acc.x > 0);
  const runner = new Follower(0, 0); runner.fleeing = true;
  runner.applyBehaviors(t); assert.ok(runner.acc.x < 0);
});

test('mode fuite : setFleeing, valeurs invalides et nouveaux véhicules', () => {
  const { Follower, population: p } = scene();
  const settings = p.createSettings(); assert.equal(settings.fleeing, false);
  const vehicles = [new Follower(1, 1), new Follower(2, 2)];
  p.setFleeing(vehicles, settings, true);
  assert.ok(vehicles.every(v => v.fleeing === true)); assert.equal(settings.fleeing, true);
  for (const bad of [1, 'true', null, undefined]) {
    assert.throws(() => p.setFleeing(vehicles, settings, bad), { name: 'TypeError' });
  }
  assert.equal(settings.fleeing, true);
  const created = new Follower(3, 3); p.applySettings(created, settings);
  assert.equal(created.fleeing, true);
});

test('case à cocher : change met à jour tous les véhicules', () => {
  const { Follower, population: p } = scene();
  const settings = p.createSettings(); const vehicles = [new Follower(1, 1)];
  const events = {}; const box = { checked: false, addEventListener: (name, fn) => events[name] = fn };
  p.bindFleeCheckbox(box, vehicles, settings); assert.equal(vehicles[0].fleeing, false);
  box.checked = true; events.change(); assert.equal(vehicles[0].fleeing, true);
  box.checked = false; events.change(); assert.equal(vehicles[0].fleeing, false);
});

test("mode fuite : pas de réapparition à l'arrivée, le véhicule s'éloigne", () => {
  const { Follower, population: p } = scene();
  const runner = new Follower(405, 300); runner.fleeing = true;
  const before = Math.hypot(runner.pos.x - target.x, runner.pos.y - target.y);
  p.step(runner, target, 800, 600, () => assert.fail('Pas de réapparition en mode fuite'));
  assert.ok(runner.pos.x > 405);
  for (let i = 0; i < 40; i++) p.step(runner, target, 800, 600, rng);
  assert.ok(Math.hypot(runner.pos.x - target.x, runner.pos.y - target.y) > before);
  const chaser = new Follower(405, 300);
  p.step(chaser, target, 800, 600, rng);
  assert.equal(chaser.vel.mag(), 0);
});

// ---------------------------------------------------------------------------
// Cible : PointTarget est une Target (target.js fourni, inchangé)
// ---------------------------------------------------------------------------

test("PointTarget : c'est une Target (donc un Vehicle), rayon et vitesse initiaux", () => {
  const { Vehicle, Target, PointTarget, intervals } = scene();
  const t = new PointTarget(100, 100);
  assert.ok(t instanceof Target); assert.ok(t instanceof Vehicle);
  assert.equal(t.r, 50); assert.equal(t.autonomous, true);
  assert.ok(t.vel.mag() >= 1 && t.vel.mag() <= 6);
  assert.equal(intervals.length, 1);
});

test('PointTarget : autonome elle se déplace, vitesse limitée à maxSpeed', () => {
  const { PointTarget } = scene();
  const t = new PointTarget(400, 300);
  const start = [t.pos.x, t.pos.y];
  for (let i = 0; i < 50; i++) {
    t.update();
    assert.ok(t.vel.mag() <= t.maxSpeed + 1e-9);
  }
  assert.ok(Math.hypot(t.pos.x - start[0], t.pos.y - start[1]) > 1);
});

test("PointTarget : le rayon change avec l'intervalle de Target, dans [20, 50]", () => {
  const { PointTarget, intervals } = scene();
  const t = new PointTarget(400, 300);
  const radii = new Set();
  for (let i = 0; i < 10; i++) {
    intervals[0]();
    assert.ok(t.r >= 20 && t.r <= 50);
    assert.ok(t.vel.mag() >= 1 && t.vel.mag() <= 6);
    radii.add(t.r);
  }
  assert.ok(radii.size > 1);
});

test('PointTarget : réapparaît du côté opposé sur les quatre bords', () => {
  const { PointTarget } = scene();
  for (const [x, y, expectedX, expectedY] of [
    [817, 100, -16, 100], [-17, 100, 816, 100], [100, 617, 100, -16], [100, -17, 100, 616],
  ]) {
    const t = new PointTarget(x, y); t.r = 16;
    t.edges();
    assert.deepEqual([t.pos.x, t.pos.y], [expectedX, expectedY]);
  }
});

test('PointTarget : le wrap tient compte de son rayon courant', () => {
  const { PointTarget } = scene();
  const big = new PointTarget(840, 100); big.r = 50; big.edges();
  assert.equal(big.pos.x, 840);
  big.pos.x = 851; big.edges(); assert.equal(big.pos.x, -50);
});

test('PointTarget : mode curseur, follow place la cible dans le canvas uniquement', () => {
  const { PointTarget } = scene();
  const t = new PointTarget(400, 300);
  t.autonomous = false;
  assert.equal(t.follow(120, 80, 800, 600), true);
  assert.deepEqual([t.pos.x, t.pos.y], [120, 80]);
  assert.equal(t.follow(0, 0, 800, 600), true);
  assert.equal(t.follow(800, 600, 800, 600), true);
  for (const [x, y] of [[-1, 10], [801, 10], [10, -1], [10, 601]]) {
    assert.equal(t.follow(x, y, 800, 600), false);
    assert.deepEqual([t.pos.x, t.pos.y], [800, 600]);
  }
});

test('PointTarget : en mode curseur elle ne bouge pas seule, en autonome elle ignore follow', () => {
  const { PointTarget } = scene();
  const t = new PointTarget(400, 300);
  t.autonomous = false;
  for (let i = 0; i < 20; i++) t.update();
  assert.deepEqual([t.pos.x, t.pos.y], [400, 300]);
  t.autonomous = true;
  assert.equal(t.follow(10, 10, 800, 600), false);
  assert.deepEqual([t.pos.x, t.pos.y], [400, 300]);
  t.update();
  assert.notDeepEqual([t.pos.x, t.pos.y], [400, 300]);
});

test('mode curseur : les véhicules suivent la cible placée par follow', () => {
  const { Follower, PointTarget, population: p } = scene();
  const t = new PointTarget(400, 300); t.autonomous = false; t.follow(350, 100, 800, 600);
  const f = new Follower(100, 100);
  p.step(f, t, 800, 600, rng);
  assert.ok(f.vel.x > 0);
});

// ---------------------------------------------------------------------------
// Arrivée : la taille de la cible décide
// ---------------------------------------------------------------------------

test('arrivée : targetInfo accepte un vecteur (rayon par défaut) ou une cible avec rayon', () => {
  const { PointTarget, population: p } = scene();
  const plain = p.targetInfo(target);
  assert.equal(plain.pos, target); assert.equal(plain.radius, p.ARRIVAL_RADIUS);
  const t = new PointTarget(10, 20); t.r = 33;
  const info = p.targetInfo(t);
  assert.equal(info.pos, t.pos); assert.equal(info.radius, 33);
});

test("arrivée : le rayon de la Target décide, seuil inclusif au bord du disque", () => {
  const { Follower, PointTarget, population: p } = scene();
  const t = new PointTarget(400, 300); t.autonomous = false;
  const v = new Follower(435, 300);
  t.r = 40; assert.equal(p.hasArrived(v, t), true);
  t.r = 35; assert.equal(p.hasArrived(v, t), true);
  t.r = 34.99; assert.equal(p.hasArrived(v, t), false);
  t.r = 20; assert.equal(p.hasArrived(v, t), false);
  assert.equal(p.hasArrived(v, target), false);
});

test("arrivée : si le rayon de la Target grandit, un véhicule proche l'atteint sans bouger", () => {
  const { Follower, PointTarget, population: p, intervals } = scene();
  const t = new PointTarget(400, 300); t.autonomous = false;
  const v = new Follower(400 + 29, 300);
  t.r = 20; assert.equal(p.hasArrived(v, t), false);
  t.r = 50; assert.equal(p.hasArrived(v, t), true);
  p.step(v, t, 800, 600, rng);
  assert.equal(v.vel.mag(), 0);
  assert.ok(Math.hypot(v.pos.x - t.pos.x, v.pos.y - t.pos.y) > t.r);
  assert.equal(intervals.length, 1);
});

test('arrivée : un véhicule qui réapparaît reste hors de la cible, rayon compris', () => {
  const { Follower, PointTarget, population: p } = scene();
  const t = new PointTarget(93, 73); t.autonomous = false; t.r = 50;
  const v = new Follower(93, 73);
  assert.equal(p.respawn(v, t, 800, 600, rng), true);
  assert.ok(Math.hypot(v.pos.x - t.pos.x, v.pos.y - t.pos.y) > t.r + 4);
  assert.equal(v.vel.mag(), 0);
});

test("arrivée : cible plus grande que l'espace libre, le véhicule est conservé", () => {
  const { Follower, PointTarget, population: p } = scene(100, 100);
  const t = new PointTarget(50, 50); t.autonomous = false; t.r = 100;
  const v = new Follower(60, 60); v.vel.set(1, 2);
  assert.equal(p.spawnPosition(t, 100, 100, 16, rng), null);
  assert.equal(p.respawn(v, t, 100, 100, rng), false);
  assert.deepEqual([v.pos.x, v.pos.y, v.vel.x, v.vel.y], [60, 60, 1, 2]);
  const vehicles = [];
  p.resize(vehicles, 5, t, 100, 100, (x, y) => new Follower(x, y), rng);
  assert.equal(vehicles.length, 5);
});

test('arrivée : le véhicule poursuit la position de la cible et réapparaît à son arrivée', () => {
  const { Follower, PointTarget, population: p } = scene();
  const t = new PointTarget(400, 300); t.autonomous = false; t.r = 30;
  const v = new Follower(300, 300); v.maxForce = 10;
  let arrived = false;
  for (let i = 0; i < 60 && !arrived; i++) {
    p.step(v, t, 800, 600, rng);
    arrived = v.vel.mag() === 0;
  }
  assert.ok(arrived);
  assert.ok(Math.hypot(v.pos.x - t.pos.x, v.pos.y - t.pos.y) > t.r);
});

// ---------------------------------------------------------------------------
// Curseurs vitesse max (0 à 20) et force max (0 à 10)
// ---------------------------------------------------------------------------

test('curseurs : plages 0 à 20 pour la vitesse et 0 à 10 pour la force, bornes incluses', () => {
  const { Follower, population: p } = scene();
  const { maxSpeed, maxForce } = p.PARAMETERS;
  assert.deepEqual([maxSpeed.min, maxSpeed.max], [0, 20]);
  assert.deepEqual([maxForce.min, maxForce.max], [0, 10]);
  const settings = p.createSettings(); const vehicles = [new Follower(0, 0), new Follower(1, 1)];
  for (const [name, range] of [['maxSpeed', maxSpeed], ['maxForce', maxForce]]) {
    p.setParameter(vehicles, settings, name, range.min);
    assert.ok(vehicles.every(v => v[name] === range.min));
    p.setParameter(vehicles, settings, name, range.max);
    assert.ok(vehicles.every(v => v[name] === range.max));
    for (const bad of [range.min - 0.01, range.max + 0.01]) {
      assert.throws(() => p.setParameter(vehicles, settings, name, bad), { name: 'RangeError' });
    }
  }
});

test('curseurs : vitesse max 0 immobilise, force max 0 supprime le pilotage, sans NaN', () => {
  const { Follower, population: p } = scene();
  const settings = p.createSettings();
  const still = new Follower(100, 100); p.setParameter([still], settings, 'maxSpeed', 0);
  for (let i = 0; i < 5; i++) p.step(still, new Vector(500, 500), 800, 600, rng);
  assert.deepEqual([still.pos.x, still.pos.y], [100, 100]);
  const drifting = new Follower(100, 100); drifting.vel.set(2, 0);
  p.setParameter([drifting], settings, 'maxForce', 0);
  p.step(drifting, new Vector(100, 500), 800, 600, rng);
  assert.deepEqual([drifting.pos.x, drifting.pos.y, drifting.vel.x, drifting.vel.y], [102, 100, 2, 0]);
});

test('curseurs : à vitesse max 20 un véhicule ne saute pas la plus petite Target', () => {
  const { Follower, PointTarget, population: p } = scene();
  const t = new PointTarget(400, 300); t.autonomous = false; t.r = 20;
  const v = new Follower(100, 300); v.maxSpeed = 20; v.maxForce = 10;
  let arrived = false;
  for (let i = 0; i < 40 && !arrived; i++) {
    p.step(v, t, 800, 600, rng);
    arrived = v.vel.mag() === 0;
  }
  assert.ok(arrived);
});

test("curseurs : toutes les flèches suivent un réglage, y compris celles ajoutées ensuite", () => {
  const { Follower, PointTarget, population: p } = scene();
  const settings = p.createSettings(); const vehicles = []; const t = new PointTarget(400, 300);
  const create = (x, y) => { const v = new Follower(x, y); p.applySettings(v, settings); return v; };
  p.resize(vehicles, 10, t, 800, 600, create, rng);
  p.setParameter(vehicles, settings, 'maxSpeed', 17.5);
  p.setParameter(vehicles, settings, 'maxForce', 7.25);
  p.resize(vehicles, 25, t, 800, 600, create, rng);
  assert.equal(vehicles.length, 25);
  assert.ok(vehicles.every(v => v.maxSpeed === 17.5 && v.maxForce === 7.25));
});

// ---------------------------------------------------------------------------
// Fond : un dégradé circulaire centré sur le curseur, animé par la FM
// ---------------------------------------------------------------------------

const plain = value => JSON.parse(JSON.stringify(value));
// distance circulaire entre deux teintes, en degrés
const circ = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
// état FM minimal, comme celui de FMSynth.modulationState
const fmAt = (nx, ny, extra = {}) => ({ nx, ny, depth: 1 - ny, ratio: 2, vibrato: 0, vibratoPhase: 0, ...extra });

test('dégradé : réglages initiaux, bornes et valeurs invalides', () => {
  const { gradient: g } = scene();
  const settings = g.createSettings();
  assert.deepEqual(Object.keys(g.PARAMETERS), ['speed', 'rings', 'reactivity']);
  for (const [name, range] of Object.entries(g.PARAMETERS)) {
    assert.equal(settings[name], range.initial);
    g.setParameter(settings, name, range.min); assert.equal(settings[name], range.min);
    g.setParameter(settings, name, range.max); assert.equal(settings[name], range.max);
    for (const bad of [range.min - 0.01, range.max + 0.01, NaN, Infinity, '1', null, undefined]) {
      assert.throws(() => g.setParameter(settings, name, bad), { name: 'RangeError' });
      assert.equal(settings[name], range.max);
    }
  }
  assert.throws(() => g.setParameter(settings, 'inconnu', 1), { name: 'RangeError' });
  assert.equal(g.createSettings().rings, 1);
});

test('dégradé : sliders de réglage mettent à jour les réglages sans change', () => {
  const { gradient: g } = scene();
  const settings = g.createSettings(); const events = {};
  const input = { value: '1', addEventListener: (name, fn) => events[name] = fn };
  const output = {};
  g.bindSlider(input, output, 'rings', settings);
  assert.equal(output.value, '1');
  input.value = '9'; events.input();
  assert.equal(settings.rings, 9); assert.equal(output.value, '9');
  const reactivity = { value: '0.25', addEventListener: (name, fn) => events['r' + name] = fn };
  g.bindSlider(reactivity, output, 'reactivity', settings);
  assert.equal(settings.reactivity, 0.25); assert.equal(output.value, '0.25');
  assert.equal(events.change, undefined);
});

test("dégradé : step avance la phase selon la vitesse, 0 fige l'écoulement", () => {
  const { gradient: g } = scene();
  const settings = g.createSettings(); const state = g.createState();
  g.step(state, settings, fmAt(0.5, 1));
  const first = state.phase; assert.ok(first > 0); assert.equal(state.time, 1);
  settings.speed = 2; const before = state.phase; g.step(state, settings, fmAt(0.5, 1));
  assert.ok(close(state.phase - before, 2 * first));
  settings.speed = 0; const frozen = state.phase; g.step(state, settings, fmAt(0.5, 1));
  assert.equal(state.phase, frozen);
});

test("dégradé : une modulation plus profonde accélère l'écoulement, sauf sans réactivité", () => {
  const { gradient: g } = scene();
  const run = (reactivity, ny) => {
    const settings = g.createSettings(); settings.reactivity = reactivity;
    const state = g.createState();
    for (let i = 0; i < 30; i++) g.step(state, settings, fmAt(0.5, ny));
    return state.phase;
  };
  assert.ok(run(1, 0) > run(1, 1));
  assert.ok(close(run(0, 0), run(0, 1)));
});

test('dégradé : le centre rattrape le curseur, la hauteur et la profondeur FM sont suivies', () => {
  const { gradient: g } = scene();
  const settings = g.createSettings(); const state = g.createState();
  g.step(state, settings, fmAt(0.9, 0.1, { ratio: 3, vibrato: -0.5, vibratoPhase: 7 }), { nx: 0.1, ny: 0.9 });
  assert.ok(close(state.fx, 0.18)); assert.ok(close(state.fy, 0.82));
  assert.ok(close(state.pitch, 0.7)); assert.ok(close(state.depth, 0.45));
  assert.equal(state.ratio, 3); assert.equal(state.vibrato, -0.5); assert.equal(state.vibratoPhase, 7);
  for (let i = 0; i < 20; i++) g.step(state, settings, fmAt(0.9, 0.1), { nx: 0.1, ny: 0.9 });
  assert.ok(Math.abs(state.fx - 0.1) < 1e-6 && Math.abs(state.fy - 0.9) < 1e-6);
  assert.ok(Math.abs(state.pitch - 0.9) < 1e-5);
  // sans curseur connu, le centre reste au milieu
  const idle = g.createState(); g.step(idle, settings, fmAt(0.9, 0.1));
  assert.equal(idle.fx, 0.5); assert.equal(idle.fy, 0.5);
});

test('dégradé : focusFrom ramène le curseur dans [0, 1], sans NaN', () => {
  const { gradient: g } = scene();
  assert.deepEqual(plain(g.focusFrom({ x: 200, y: 150 }, 800, 600)), { nx: 0.25, ny: 0.25 });
  assert.deepEqual(plain(g.focusFrom({ x: 0, y: 600 }, 800, 600)), { nx: 0, ny: 1 });
  assert.deepEqual(plain(g.focusFrom({ x: -30, y: 900 }, 800, 600)), { nx: 0, ny: 1 });
  assert.deepEqual(plain(g.focusFrom({ x: 5, y: 5 }, 0, 0)), { nx: 0.5, ny: 0.5 });
});

test('dégradé : arrêts de couleur, offsets croissants, couleurs valides', () => {
  const { gradient: g } = scene();
  for (const rings of [1, 5, 12]) {
    for (const phase of [0, 33, 1000, 123456]) {
      const options = { hueShift: 123, wobble: 40, ratio: 3.5, modPhase: 9, brightness: 1 };
      const stops = g.rainbowStops(phase, rings, options);
      assert.equal(stops.length, rings * g.STOPS_PER_RING + 1);
      assert.equal(stops[0].offset, 0); assert.equal(stops[stops.length - 1].offset, 1);
      for (let i = 1; i < stops.length; i++) assert.ok(stops[i].offset > stops[i - 1].offset);
      for (const s of stops) {
        assert.ok(s.hue >= 0 && s.hue < 360);
        assert.equal(s.saturation, 100);
        assert.ok(s.lightness >= 25 && s.lightness <= 75);
      }
    }
  }
  const pure = g.rainbowStops(0, 1);
  assert.equal(new Set(pure.map(s => Math.round(s.hue))).size, g.STOPS_PER_RING);
});

test("dégradé : sans modulation c'est un dégradé de couleurs pur, la hauteur décale les teintes", () => {
  const { gradient: g } = scene();
  const rings = 3; const phase = 40;
  const pure = g.rainbowStops(phase, rings);
  pure.forEach((s, j) => {
    const offset = j / (rings * g.STOPS_PER_RING);
    assert.ok(circ(s.hue, (offset * rings * 360 - phase + 720) % 360) < 1e-6);
  });
  const shifted = g.rainbowStops(phase, rings, { hueShift: 90 });
  shifted.forEach((s, j) => assert.ok(circ(s.hue, pure[j].hue + 90) < 1e-6));
});

test('dégradé : la teinte est modulée en fréquence (indice, ratio et phase du vibrato)', () => {
  const { gradient: g } = scene();
  const rings = 3; const wobble = 30;
  const pure = g.rainbowStops(0, rings);
  const base = { wobble, ratio: 2, modPhase: 0 };
  const modulated = g.rainbowStops(0, rings, base);
  const deviations = modulated.map((s, j) => circ(s.hue, pure[j].hue));
  assert.ok(deviations.every(d => d <= wobble + 1e-6));
  assert.ok(Math.max(...deviations) > 0.8 * wobble);
  const deeper = g.rainbowStops(0, rings, { ...base, wobble: 2 * wobble });
  assert.ok(Math.max(...deeper.map((s, j) => circ(s.hue, pure[j].hue))) > Math.max(...deviations));
  const otherRatio = g.rainbowStops(0, rings, { ...base, ratio: 3 });
  const otherPhase = g.rainbowStops(0, rings, { ...base, modPhase: 1.5 });
  assert.ok(otherRatio.some((s, j) => circ(s.hue, modulated[j].hue) > 1));
  assert.ok(otherPhase.some((s, j) => circ(s.hue, modulated[j].hue) > 1));
  // l'écart suit exactement wobble * sin(ratio * cycle + phase)
  modulated.forEach((s, j) => {
    const cycle = (j / (rings * g.STOPS_PER_RING)) * rings * 2 * Math.PI;
    assert.ok(circ(s.hue, pure[j].hue + wobble * Math.sin(2 * cycle)) < 1e-6);
  });
});

test('dégradé : une modulation profonde éclaircit les couleurs', () => {
  const { gradient: g } = scene();
  const dark = g.rainbowStops(0, 3, { brightness: 0 }); const bright = g.rainbowStops(0, 3, { brightness: 1 });
  assert.ok(bright.every((s, i) => s.lightness >= dark[i].lightness - 1e-9));
  assert.ok(bright.some((s, i) => s.lightness > dark[i].lightness));
});

test('dégradé : layers centre exactement le dégradé sur le curseur, un seul dégradé', () => {
  const { gradient: g } = scene();
  const settings = g.createSettings();
  assert.deepEqual(Object.keys(g.layers(g.createState(), settings, 800, 600)), ['a']);
  for (const [fx, fy] of [[0, 0], [1, 1], [0.2, 0.3], [0.8, 0.9]]) {
    const state = g.createState(); state.fx = fx; state.fy = fy; state.time = 123;
    const { a } = g.layers(state, settings, 800, 600);
    assert.ok(close(a.x, fx * 800) && close(a.y, fy * 600));
  }
  // le centre suit le curseur de bout en bout
  const state = g.createState();
  for (let i = 0; i < 20; i++) g.step(state, settings, fmAt(0.5, 0.5), g.focusFrom({ x: 700, y: 100 }, 800, 600));
  const { a } = g.layers(state, settings, 800, 600);
  assert.ok(Math.abs(a.x - 700) < 1 && Math.abs(a.y - 100) < 1);
});

test('dégradé : layers reste dans les bornes pour toutes positions et profondeurs', () => {
  const { gradient: g } = scene();
  for (const [w, h] of [[800, 600], [320, 480], [1920, 1080], [10, 10]]) {
    const settings = g.createSettings(); const state = g.createState();
    for (let i = 0; i < 60; i++) {
      g.step(state, settings, fmAt((i % 11) / 10, (i % 7) / 6, { vibrato: Math.sin(i), vibratoPhase: i }),
        g.focusFrom({ x: (i * 37) % (w + 20) - 10, y: (i * 53) % (h + 20) - 10 }, w, h));
      const { a } = g.layers(state, settings, w, h);
      assert.ok(a.radius > 0);
      assert.ok(a.x >= 0 && a.x <= w && a.y >= 0 && a.y <= h);
      assert.ok(a.stops.every(s => s.hue >= 0 && s.hue < 360));
    }
  }
});

test('dégradé : le rayon respire avec le vibrato et gonfle avec la profondeur, selon la réactivité', () => {
  const { gradient: g } = scene();
  const settings = g.createSettings();
  const radius = (vibrato, depth) => {
    const state = g.createState(); state.vibrato = vibrato; state.depth = depth;
    return g.layers(state, settings, 800, 600).a.radius;
  };
  assert.ok(radius(1, 0) > radius(-1, 0));
  assert.ok(radius(0, 1) > radius(0, 0));
  settings.reactivity = 0;
  assert.ok(close(radius(1, 1), radius(-1, 0)));
});

test('dégradé : la hauteur règle la teinte, et sans réactivité aucune déformation', () => {
  const { gradient: g } = scene();
  const settings = g.createSettings(); settings.reactivity = 0;
  const state = g.createState(); state.pitch = 0.25; state.depth = 1; state.phase = 0; state.ratio = 3; state.vibratoPhase = 2;
  const drawing = g.layers(state, settings, 800, 600);
  assert.ok(circ(drawing.a.stops[0].hue, 90) < 1e-6);
  assert.deepEqual(plain(drawing.a.stops), plain(g.rainbowStops(0, settings.rings, { hueShift: 90, wobble: 0, ratio: 3, modPhase: 2, brightness: 0 })));
  settings.reactivity = 1;
  assert.notDeepEqual(plain(g.layers(state, settings, 800, 600).a.stops), plain(drawing.a.stops));
});

function fakeCanvas2d() {
  const calls = [];
  const ctx = {
    calls, globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: null,
    save: () => calls.push(['save']), restore: () => calls.push(['restore']),
    setTransform: (...a) => calls.push(['setTransform', ...a]),
    createRadialGradient: (...a) => {
      calls.push(['radial', ...a]);
      return { addColorStop: (offset, color) => calls.push(['stop', offset, color]) };
    },
    fillRect: (...a) => calls.push(['fillRect', ...a, ctx.globalCompositeOperation, ctx.globalAlpha]),
    drawImage: (...a) => calls.push(['drawImage', ...a]),
  };
  return ctx;
}

test('dégradé : paint peint un seul dégradé radial plein écran, sans mélange', () => {
  const { gradient: g } = scene();
  const settings = g.createSettings(); const state = g.createState();
  state.time = 10; state.fx = 0.3; state.fy = 0.6;
  const drawing = g.layers(state, settings, 800, 600);
  const ctx = fakeCanvas2d();
  g.paint(ctx, 800, 600, drawing);
  const names = ctx.calls.map(c => c[0]);
  assert.equal(names[0], 'save'); assert.equal(names[names.length - 1], 'restore');
  assert.equal(names.filter(n => n === 'save').length, names.filter(n => n === 'restore').length);
  const fills = ctx.calls.filter(c => c[0] === 'fillRect');
  assert.equal(fills.length, 1);
  assert.deepEqual(fills[0].slice(1), [0, 0, 800, 600, 'source-over', 1]);
  const radials = ctx.calls.filter(c => c[0] === 'radial');
  assert.equal(radials.length, 1);
  assert.deepEqual(radials[0].slice(1), [drawing.a.x, drawing.a.y, 0, drawing.a.x, drawing.a.y, drawing.a.radius]);
  const stops = ctx.calls.filter(c => c[0] === 'stop');
  assert.equal(stops.length, drawing.a.stops.length);
  assert.ok(stops.every(s => s[2].startsWith('hsl(')));
});

test('dégradé : rendu hors écran à 1/4 de résolution, réutilisé puis recréé au redimensionnement', () => {
  const { gradient: g } = scene();
  const created = [];
  const renderer = g.createRenderer((w, h) => {
    const off = fakeCanvas2d(); const canvas = { width: w, height: h, getContext: () => off };
    created.push(canvas); return canvas;
  });
  const drawing = g.layers(g.createState(), g.createSettings(), 800, 600);
  const target2d = fakeCanvas2d();
  renderer.draw(target2d, 800, 600, drawing);
  assert.equal(created.length, 1);
  assert.deepEqual([created[0].width, created[0].height], [200, 150]);
  const set = created[0].getContext().calls.find(c => c[0] === 'setTransform');
  assert.deepEqual(set.slice(1), [0.25, 0, 0, 0.25, 0, 0]);
  const blit = target2d.calls.find(c => c[0] === 'drawImage');
  assert.deepEqual(blit.slice(1), [created[0], 0, 0, 800, 600]);
  renderer.draw(target2d, 800, 600, drawing);
  assert.equal(created.length, 1);
  renderer.draw(target2d, 801, 600, drawing);
  assert.equal(created.length, 2);
  assert.deepEqual([created[1].width, created[1].height], [201, 150]);
  renderer.draw(target2d, 1, 1, drawing);
  assert.deepEqual([created[2].width, created[2].height], [1, 1]);
});

test('dégradé : draw utilise le contexte du canvas principal et un canvas hors écran', () => {
  const { gradient: g, context } = scene();
  const off = fakeCanvas2d(); const main = fakeCanvas2d(); let made = 0;
  context.document = { createElement: () => { made++; return { width: 0, height: 0, getContext: () => off }; } };
  context.drawingContext = main;
  g.draw(g.createState(), g.createSettings(), 800, 600);
  assert.equal(made, 1);
  assert.equal(main.calls.filter(c => c[0] === 'drawImage').length, 1);
  assert.equal(off.calls.filter(c => c[0] === 'fillRect').length, 1);
});

// ---------------------------------------------------------------------------
// Bords : le canvas est un tore (Vehicle.edges + pilotage par le plus court chemin)
// ---------------------------------------------------------------------------

test("bords : nearestImage choisit l'image de la cible à travers le bord quand elle est plus proche", () => {
  const { Follower } = scene();
  // période du tore : largeur + 2 * r = 832, hauteur + 2 * r = 632
  const v = new Follower(10, 10);
  const far = new Vector(790, 590); const original = [far.x, far.y];
  const image = v.nearestImage(far);
  assert.ok(close(image.x, -42) && close(image.y, -42));
  assert.deepEqual([far.x, far.y], original);
  const near = v.nearestImage(new Vector(200, 100));
  assert.ok(close(near.x, 200) && close(near.y, 100));
  const edge = new Follower(0, 300);
  assert.ok(close(edge.nearestImage(new Vector(415, 300)).x, 415));
  assert.ok(close(edge.nearestImage(new Vector(417, 300)).x, 417 - 832));
  // la distance à l'image est toujours au plus la demi-période
  for (const [x, y] of [[0, 0], [799, 599], [400, 300], [123, 456]]) {
    for (const [tx, ty] of [[0, 0], [800, 600], [250, 90], [790, 10]]) {
      const w = new Follower(x, y); const i = w.nearestImage(new Vector(tx, ty));
      assert.ok(Math.abs(i.x - x) <= 416 + 1e-9 && Math.abs(i.y - y) <= 316 + 1e-9);
    }
  }
});

test('bords : poursuite et fuite visent le chemin le plus court, à travers le bord', () => {
  const { Follower } = scene();
  const chaser = new Follower(10, 10);
  chaser.applyBehaviors(new Vector(790, 590));
  assert.ok(chaser.acc.x < 0 && chaser.acc.y < 0);
  const runner = new Follower(10, 10); runner.fleeing = true;
  runner.applyBehaviors(new Vector(790, 590));
  assert.ok(runner.acc.x > 0 && runner.acc.y > 0);
});

test('bords : un véhicule rejoint par le bord une cible proche de l\'autre côté, bien plus vite', () => {
  const { Follower, population: p } = scene();
  const goal = new Vector(780, 300);
  const v = new Follower(20, 300); v.maxForce = 10;
  let steps = 0; let arrived = false; let wrapped = false;
  while (steps < 200 && !arrived) {
    const before = v.pos.x;
    p.step(v, goal, 800, 600, rng);
    wrapped = wrapped || v.pos.x - before > 400;
    arrived = v.vel.mag() === 0;
    steps++;
  }
  assert.ok(arrived); assert.ok(wrapped);
  // par l'intérieur il faudrait plus de 190 pas à vitesse 4
  assert.ok(steps < 60);
});

test('bords : la sortie par chaque bord ramène de l\'autre côté, en poursuite comme en fuite', () => {
  const { Follower, population: p } = scene();
  // start près d'un bord ; flee : cible juste en deçà qui chasse le véhicule vers le bord ;
  // chase : cible de l'autre côté du canvas, que le plus court chemin atteint par ce bord
  const cases = [
    { name: 'droite', start: [790, 300], flee: [700, 300], chase: [20, 300], wrapped: v => v.pos.x < 100 },
    { name: 'gauche', start: [10, 300], flee: [100, 300], chase: [780, 300], wrapped: v => v.pos.x > 700 },
    { name: 'bas', start: [400, 590], flee: [400, 500], chase: [400, 20], wrapped: v => v.pos.y < 100 },
    { name: 'haut', start: [400, 10], flee: [400, 100], chase: [400, 580], wrapped: v => v.pos.y > 500 },
  ];
  for (const c of cases) {
    for (const fleeing of [true, false]) {
      const v = new Follower(c.start[0], c.start[1]); v.fleeing = fleeing;
      v.maxSpeed = 8; v.maxForce = 10;
      const goal = new Vector(...(fleeing ? c.flee : c.chase));
      let wrapped = false;
      for (let i = 0; i < 200 && !wrapped; i++) {
        p.step(v, goal, 800, 600, rng);
        assert.ok(v.pos.x >= -16 && v.pos.x <= 816 && v.pos.y >= -16 && v.pos.y <= 616);
        wrapped = c.wrapped(v);
      }
      assert.ok(wrapped, 'bord ' + c.name + (fleeing ? ' (fuite)' : ' (poursuite)'));
      assert.ok(v.vel.mag() > 0);
    }
  }
});

test('fuite : dans le rayon de fuite le véhicule fuit, au-delà il freine', () => {
  const { Follower } = scene();
  const f = new Follower(400, 300);
  assert.equal(f.fleeRadius, 300);
  f.fleeing = true; f.vel.set(3, 0);
  f.applyBehaviors(new Vector(500, 300));
  assert.ok(f.acc.x < 0);
  assert.ok(close(f.acc.x, f.flee(new Vector(500, 300)).x));
  // cible à 350 px : menace lointaine, le véhicule freine (force opposée à la vitesse, limitée)
  const far = new Follower(400, 300); far.fleeing = true; far.vel.set(3, 4);
  far.applyBehaviors(new Vector(750, 300));
  assert.ok(close(Math.hypot(far.acc.x, far.acc.y), far.maxForce));
  assert.ok(close(far.acc.x / far.maxForce, -0.6) && close(far.acc.y / far.maxForce, -0.8));
  // à l'arrêt et loin : aucune force, pas de NaN
  const still = new Follower(400, 300); still.fleeing = true;
  still.applyBehaviors(new Vector(750, 300));
  assert.ok(Number.isFinite(still.acc.x) && Number.isFinite(still.acc.y));
  assert.equal(still.acc.mag(), 0);
  // la distance se mesure à l'image la plus proche : 312 px à travers le bord, donc loin aussi
  const wrapped = new Follower(790, 300); wrapped.fleeing = true; wrapped.vel.set(2, 0);
  wrapped.applyBehaviors(new Vector(270, 300));
  assert.ok(wrapped.acc.x < 0 && wrapped.acc.y === 0);
});

test('fuite : les véhicules ne s\'entassent plus contre les bords en se téléportant', () => {
  const { Follower, population: p } = scene();
  const settings = p.createSettings(); const vehicles = [];
  const create = (x, y) => { const v = new Follower(x, y); p.applySettings(v, settings); return v; };
  p.resize(vehicles, 60, target, 800, 600, create, seededRandom(7));
  p.setFleeing(vehicles, settings, true);
  p.setParameter(vehicles, settings, 'maxSpeed', 12);
  p.setParameter(vehicles, settings, 'maxForce', 2);
  let wrapsInLast100 = 0; let wrapsTotal = 0;
  let previous = vehicles.map(v => [v.pos.x, v.pos.y]);
  for (let frame = 0; frame < 600; frame++) {
    vehicles.forEach((v, i) => {
      p.step(v, target, 800, 600, rng);
      assert.ok(v.pos.x >= -16 && v.pos.x <= 816 && v.pos.y >= -16 && v.pos.y <= 616);
      const jumped = Math.abs(v.pos.x - previous[i][0]) > 400 || Math.abs(v.pos.y - previous[i][1]) > 300;
      if (jumped) { wrapsTotal++; if (frame >= 500) wrapsInLast100++; }
    });
    previous = vehicles.map(v => [v.pos.x, v.pos.y]);
  }
  assert.equal(wrapsInLast100, 0);
  assert.ok(wrapsTotal < 60);
  // chaque véhicule s'est arrêté assez loin de la cible (distance sur le tore)
  for (const v of vehicles) {
    assert.ok(v.vel.mag() < 1e-6);
    const image = v.nearestImage(target);
    assert.ok(Math.hypot(image.x - v.pos.x, image.y - v.pos.y) >= v.fleeRadius - 1e-6);
  }
});

test('bords : en poursuite, des véhicules lancés à grande vitesse traversent les bords sans jamais sortir', () => {
  const { Follower, PointTarget, population: p } = scene();
  const settings = p.createSettings(); const vehicles = []; const t = new PointTarget(400, 300);
  const create = (x, y) => { const v = new Follower(x, y); p.applySettings(v, settings); return v; };
  p.resize(vehicles, 40, t, 800, 600, create, seededRandom(11));
  p.setParameter(vehicles, settings, 'maxSpeed', 20);
  p.setParameter(vehicles, settings, 'maxForce', 10);
  vehicles.forEach((v, i) => v.vel.set(20 * Math.cos(i), 20 * Math.sin(i)));
  let wraps = 0;
  let previous = vehicles.map(v => [v.pos.x, v.pos.y]);
  for (let frame = 0; frame < 400; frame++) {
    t.update(); t.edges();
    vehicles.forEach((v, i) => {
      p.step(v, t, 800, 600, rng);
      assert.ok(v.pos.x >= -16 && v.pos.x <= 816 && v.pos.y >= -16 && v.pos.y <= 616);
      // un grand saut avec une vitesse non nulle est une traversée de bord (une arrivée remet la vitesse à zéro)
      const jumped = Math.abs(v.pos.x - previous[i][0]) > 400 || Math.abs(v.pos.y - previous[i][1]) > 300;
      if (jumped && v.vel.mag() > 0) wraps++;
    });
    previous = vehicles.map(v => [v.pos.x, v.pos.y]);
  }
  assert.ok(wraps > 0);
});

// ---------------------------------------------------------------------------
// Synthèse FM : la position de la cible règle hauteur, timbre et panoramique
// ---------------------------------------------------------------------------

test('FM : la hauteur suit exactement x, de façon exponentielle sur trois octaves', () => {
  const { fm } = scene();
  assert.ok(close(fm.carrierFrequency(0, 800), 110));
  assert.ok(close(fm.carrierFrequency(800, 800), 880));
  assert.ok(close(fm.carrierFrequency(800 / 3, 800), 220));
  assert.ok(close(fm.carrierFrequency((2 * 800) / 3, 800), 440));
  let previous = 0;
  for (let x = 0; x <= 800; x += 4) {
    const f = fm.carrierFrequency(x, 800);
    assert.ok(f > previous); previous = f;
    // x / largeur se relit exactement dans la fréquence (échelle logarithmique)
    assert.ok(Math.abs(Math.log2(f / 110) / 3 - x / 800) < 1e-9);
  }
  assert.equal(fm.carrierFrequency(-50, 800), 110);
  assert.equal(fm.carrierFrequency(5000, 800), 880);
  assert.ok(Number.isFinite(fm.carrierFrequency(10, 0)));
});

test("FM : l'indice de modulation est maximal en haut, nul en bas", () => {
  const { fm } = scene();
  assert.equal(fm.modulationIndex(0, 600, 4), 4);
  assert.equal(fm.modulationIndex(600, 600, 4), 0);
  assert.equal(fm.modulationIndex(300, 600, 4), 2);
  assert.equal(fm.modulationIndex(-10, 600, 4), 4);
  assert.equal(fm.modulationIndex(900, 600, 4), 0);
  assert.equal(fm.modulationIndex(100, 600, 0), 0);
  assert.ok(Number.isFinite(fm.modulationIndex(5, 0, 4)));
  let previous = Infinity;
  for (let y = 0; y <= 600; y += 6) {
    const index = fm.modulationIndex(y, 600, 8);
    assert.ok(index < previous); previous = index;
  }
});

test('FM : modulationState donne des paramètres cohérents pour toute position', () => {
  const { fm } = scene();
  const settings = fm.createSettings();
  for (const [x, y] of [[0, 0], [800, 600], [400, 300], [123, 456], [-20, 700]]) {
    for (const seconds of [0, 0.37, 12.5]) {
      const s = fm.modulationState(x, y, 800, 600, settings, seconds);
      assert.ok(close(s.modulator, s.carrier * settings.ratio));
      assert.ok(close(s.deviation, s.index * s.modulator));
      assert.ok(close(s.pan, 2 * s.nx - 1) && s.pan >= -1 && s.pan <= 1);
      assert.ok(s.depth >= 0 && s.depth <= 1 && close(s.depth, s.index / settings.maxIndex));
      assert.ok(close(s.vibratoPhase, 2 * Math.PI * fm.VIBRATO_RATE * seconds));
      assert.ok(close(s.vibrato, Math.sin(s.vibratoPhase)));
      assert.ok(close(s.vibratoDeviation, s.carrier * fm.VIBRATO_DEPTH));
      assert.equal(s.ratio, settings.ratio);
    }
  }
  const flat = fm.createSettings(); flat.maxIndex = 0;
  const pure = fm.modulationState(400, 100, 800, 600, flat, 1);
  assert.equal(pure.depth, 0); assert.equal(pure.deviation, 0);
  assert.deepEqual(plain(fm.modulationState(10, 20, 800, 600, settings, 3)), plain(fm.modulationState(10, 20, 800, 600, settings, 3)));
});

test('FM : un déplacement de la cible change hauteur, indice et panoramique dans le bon sens', () => {
  const { fm } = scene();
  const settings = fm.createSettings();
  let previous = fm.modulationState(0, 300, 800, 600, settings, 0);
  for (let x = 20; x <= 800; x += 20) {
    const s = fm.modulationState(x, 300, 800, 600, settings, 0);
    assert.ok(s.carrier > previous.carrier && s.pan > previous.pan && s.index === previous.index);
    previous = s;
  }
  previous = fm.modulationState(400, 0, 800, 600, settings, 0);
  for (let y = 20; y <= 600; y += 20) {
    const s = fm.modulationState(400, y, 800, 600, settings, 0);
    assert.ok(s.index < previous.index && s.carrier === previous.carrier);
    previous = s;
  }
});

test('FM : réglages ratio 0,5 à 4 et indice max 0 à 8, bornes incluses et valeurs invalides', () => {
  const { fm } = scene();
  const settings = fm.createSettings();
  assert.equal(settings.ratio, 2); assert.equal(settings.maxIndex, 4);
  assert.deepEqual([fm.PARAMETERS.ratio.min, fm.PARAMETERS.ratio.max], [0.5, 4]);
  assert.deepEqual([fm.PARAMETERS.maxIndex.min, fm.PARAMETERS.maxIndex.max], [0, 8]);
  for (const [name, range] of Object.entries(fm.PARAMETERS)) {
    fm.setParameter(settings, name, range.min); assert.equal(settings[name], range.min);
    fm.setParameter(settings, name, range.max); assert.equal(settings[name], range.max);
    for (const bad of [range.min - 0.01, range.max + 0.01, NaN, Infinity, '2', null, undefined]) {
      assert.throws(() => fm.setParameter(settings, name, bad), { name: 'RangeError' });
      assert.equal(settings[name], range.max);
    }
  }
  assert.throws(() => fm.setParameter(settings, 'inconnu', 1), { name: 'RangeError' });
});

test('FM : sliders de ratio et d\'indice mettent à jour les réglages et le son suit', () => {
  const { fm } = scene();
  const settings = fm.createSettings(); const events = {};
  const input = { value: '3', addEventListener: (name, fn) => events[name] = fn };
  const output = {};
  fm.bindSlider(input, output, 'ratio', settings);
  assert.equal(settings.ratio, 3); assert.equal(output.value, '3.0');
  input.value = '1.5'; events.input();
  assert.equal(settings.ratio, 1.5); assert.equal(output.value, '1.5');
  assert.equal(events.change, undefined);
  const s = fm.modulationState(400, 300, 800, 600, settings, 0);
  assert.ok(close(s.modulator, s.carrier * 1.5));
});

function fakeAudio() {
  const log = { contexts: [], oscillators: [], gains: [], panners: [], connections: [], starts: [],
    resumes: 0, suspends: 0, targets: [], cancels: [], timeouts: [] };
  const param = owner => ({ isParam: true, owner, value: 0,
    cancelScheduledValues(time) { log.cancels.push([this, time]); },
    setTargetAtTime(value, time, constant) { log.targets.push([this, value, time, constant]); } });
  function node(kind) {
    const n = { kind, connect(target) { log.connections.push([n, target]); }, start() { log.starts.push(n); } };
    n.frequency = param(n); n.gain = param(n); n.pan = param(n);
    return n;
  }
  class FakeContext {
    constructor() { this.currentTime = 0; this.destination = { kind: 'destination' }; log.contexts.push(this); }
    createGain() { const n = node('gain'); log.gains.push(n); return n; }
    createOscillator() { const n = node('oscillator'); log.oscillators.push(n); return n; }
    createStereoPanner() { const n = node('panner'); log.panners.push(n); return n; }
    resume() { log.resumes++; }
    suspend() { log.suspends++; }
  }
  const timers = { setTimeout: (fn, ms) => { log.timeouts.push({ fn, ms }); return log.timeouts.length; } };
  // aide de lecture du graphe audio : vers quoi un nœud est-il connecté ?
  const to = from => log.connections.filter(c => c[0] === from).map(c => c[1]);
  const lastTarget = param => [...log.targets].reverse().find(t => t[0] === param);
  return { FakeContext, timers, log, to, lastTarget };
}

// retrouve les nœuds du synthé FM dans le graphe audio factice
function fmGraph(audio) {
  const { log, to } = audio;
  const paramLinks = log.connections.filter(c => c[1].isParam);
  const carrierFrequency = paramLinks[0][1];
  const carrier = carrierFrequency.owner;
  const lfo = log.oscillators.find(o => o.frequency.value === 5.5);
  const modulator = log.oscillators.find(o => o !== carrier && o !== lfo);
  const amplitude = to(carrier)[0];
  const panner = to(amplitude)[0];
  const master = to(panner)[0];
  return { carrier, lfo, modulator, modulatorGain: to(modulator)[0], vibratoGain: to(lfo)[0],
    amplitude, panner, master, paramLinks };
}

test("FM : aucun contexte audio avant le geste de l'utilisateur, un seul graphe ensuite", () => {
  const { fm } = scene(); const audio = fakeAudio(); const { FakeContext, timers, log } = audio;
  const engine = fm.createEngine(() => FakeContext, timers);
  assert.equal(engine.isRunning(), false); assert.equal(log.contexts.length, 0);
  assert.equal(engine.clock(), null);
  assert.equal(engine.start(), true); assert.equal(engine.isRunning(), true);
  assert.equal(engine.start(), true);
  assert.equal(log.contexts.length, 1); assert.equal(log.resumes, 2);
  assert.equal(log.oscillators.length, 3);
  assert.equal(log.starts.length, 3);
  assert.equal(new Set(log.starts).size, 3);
});

test('FM : modulateur et vibrato sont branchés sur la fréquence de la porteuse', () => {
  const { fm } = scene(); const audio = fakeAudio();
  const engine = fm.createEngine(() => audio.FakeContext, audio.timers);
  engine.start();
  const g = fmGraph(audio);
  assert.equal(g.paramLinks.length, 2);
  assert.equal(g.paramLinks[0][1], g.paramLinks[1][1]);
  assert.equal(g.carrier.kind, 'oscillator');
  assert.ok(audio.to(g.modulator).includes(g.modulatorGain));
  assert.ok(audio.to(g.modulatorGain).includes(g.carrier.frequency));
  assert.ok(audio.to(g.lfo).includes(g.vibratoGain));
  assert.ok(audio.to(g.vibratoGain).includes(g.carrier.frequency));
  assert.ok(audio.to(g.master).some(d => d.kind === 'destination'));
  assert.equal(g.lfo.frequency.value, fm.VIBRATO_RATE);
  // l'entrée du son est progressive
  const ramp = audio.lastTarget(g.amplitude.gain);
  assert.equal(ramp[1], fm.AMPLITUDE);
});

test('FM : update fait suivre au son la position de la cible, paramètre par paramètre', () => {
  const { fm } = scene(); const audio = fakeAudio();
  const engine = fm.createEngine(() => audio.FakeContext, audio.timers);
  const settings = fm.createSettings();
  const first = fm.modulationState(300, 100, 800, 600, settings, 1.25);
  engine.update(first);
  assert.equal(audio.log.targets.length, 0);
  engine.start();
  const g = fmGraph(audio);
  const before = audio.log.targets.length;
  engine.update(first);
  assert.equal(audio.log.targets.length - before, 5);
  const check = (state) => {
    assert.equal(audio.lastTarget(g.carrier.frequency)[1], state.carrier);
    assert.equal(audio.lastTarget(g.modulator.frequency)[1], state.modulator);
    assert.equal(audio.lastTarget(g.modulatorGain.gain)[1], state.deviation);
    assert.equal(audio.lastTarget(g.vibratoGain.gain)[1], state.vibratoDeviation);
    assert.equal(audio.lastTarget(g.panner.pan)[1], state.pan);
  };
  check(first);
  // les valeurs précédentes sont annulées avant chaque suivi, pour ne pas accumuler d'événements
  assert.equal(audio.log.cancels.length, 5);
  const second = fm.modulationState(700, 500, 800, 600, settings, 2);
  engine.update(second);
  check(second);
  assert.ok(second.carrier > first.carrier && second.index < first.index && second.pan > first.pan);
  assert.equal(audio.log.cancels.length, 10);
});

test("FM : l'horloge du son donne la phase exacte du vibrato", () => {
  const { fm } = scene(); const audio = fakeAudio();
  class LateContext extends audio.FakeContext { constructor() { super(); this.currentTime = 3; } }
  const engine = fm.createEngine(() => LateContext, audio.timers);
  assert.equal(engine.clock(), null);
  engine.start();
  assert.equal(engine.clock(), 0);
  audio.log.contexts[0].currentTime = 5.5;
  assert.equal(engine.clock(), 2.5);
  const state = fm.modulationState(400, 300, 800, 600, fm.createSettings(), engine.clock());
  assert.ok(close(state.vibratoPhase, 2 * Math.PI * 5.5 * 2.5));
  assert.ok(close(state.vibrato, Math.sin(2 * Math.PI * 5.5 * 2.5)));
});

test('FM : arrêt progressif, suspension différée, reprise avant la suspension', () => {
  const { fm } = scene(); const audio = fakeAudio(); const { log } = audio;
  const engine = fm.createEngine(() => audio.FakeContext, audio.timers);
  engine.stop(); assert.equal(log.timeouts.length, 0);
  engine.start();
  const g = fmGraph(audio);
  engine.stop();
  assert.equal(engine.isRunning(), false);
  assert.equal(audio.lastTarget(g.amplitude.gain)[1], 0);
  assert.equal(log.timeouts.length, 1); assert.equal(log.timeouts[0].ms, fm.SUSPEND_DELAY_MS);
  assert.equal(log.suspends, 0);
  log.timeouts[0].fn(); assert.equal(log.suspends, 1);
  const targetsAfterStop = log.targets.length;
  engine.update(fm.modulationState(100, 100, 800, 600, fm.createSettings(), 0));
  assert.equal(log.targets.length, targetsAfterStop);
  // reprise avant la fin du délai : le contexte n'est pas suspendu
  engine.start(); engine.stop();
  engine.start();
  log.timeouts[log.timeouts.length - 1].fn();
  assert.equal(log.suspends, 1);
  assert.equal(engine.isRunning(), true);
  assert.equal(log.contexts.length, 1);
  assert.equal(audio.lastTarget(g.amplitude.gain)[1], fm.AMPLITUDE);
});

test('FM : volume borné, mémorisé avant le démarrage et appliqué au gain principal', () => {
  const { fm } = scene(); const audio = fakeAudio(); const { log } = audio;
  const engine = fm.createEngine(() => audio.FakeContext, audio.timers);
  assert.equal(engine.getVolume(), fm.INITIAL_VOLUME);
  engine.setVolume(0.2); assert.equal(engine.getVolume(), 0.2);
  assert.equal(log.targets.length, 0);
  engine.start();
  const { master } = fmGraph(audio);
  assert.ok(Math.abs(master.gain.value - 0.2 * fm.MASTER_MAX) < 1e-9);
  engine.setVolume(1);
  assert.ok(Math.abs(audio.lastTarget(master.gain)[1] - fm.MASTER_MAX) < 1e-9);
  engine.setVolume(0);
  assert.equal(audio.lastTarget(master.gain)[1], 0);
  for (const bad of [-0.01, 1.01, NaN, '0.5', null, undefined]) {
    assert.throws(() => engine.setVolume(bad), { name: 'RangeError' });
  }
  assert.equal(engine.getVolume(), 0);
});

test('FM : slider de volume et case à cocher', () => {
  const { fm } = scene(); const audio = fakeAudio(); const { log } = audio;
  const engine = fm.createEngine(() => audio.FakeContext, audio.timers);
  const events = {}; const slider = { value: '0.5', addEventListener: (name, fn) => events[name] = fn };
  const output = {};
  engine.bindVolumeSlider(slider, output); assert.equal(output.value, '50 %');
  slider.value = '0.8'; events.input(); assert.equal(engine.getVolume(), 0.8); assert.equal(output.value, '80 %');
  assert.equal(events.change, undefined);
  const box = { checked: false, addEventListener: (name, fn) => events['box' + name] = fn };
  engine.bindCheckbox(box);
  assert.equal(engine.isRunning(), false); assert.equal(log.contexts.length, 0);
  box.checked = true; events.boxchange(); assert.equal(engine.isRunning(), true);
  box.checked = false; events.boxchange(); assert.equal(engine.isRunning(), false);
  assert.equal(log.timeouts.length, 1);
});

test('FM : sans API audio, start échoue sans erreur et la case revient décochée', () => {
  const { fm } = scene(); const audio = fakeAudio();
  const engine = fm.createEngine(() => undefined, audio.timers);
  assert.equal(engine.start(), false); assert.equal(engine.isRunning(), false);
  assert.doesNotThrow(() => engine.stop());
  assert.doesNotThrow(() => engine.update(fm.modulationState(1, 1, 800, 600, fm.createSettings(), 0)));
  assert.equal(engine.clock(), null);
  const events = {}; const box = { checked: true, addEventListener: (name, fn) => events[name] = fn };
  engine.bindCheckbox(box); events.change();
  assert.equal(box.checked, false);
});

// ---------------------------------------------------------------------------
// Cible : un point avec un cercle autour (affichage seulement, même comportement)
// ---------------------------------------------------------------------------

// remplace les fonctions de dessin p5 par des espions
function drawingSpy(context) {
  const calls = [];
  for (const name of ['push', 'pop', 'noFill', 'fill', 'stroke', 'strokeWeight', 'circle']) {
    context[name] = (...args) => calls.push([name, ...args]);
  }
  context.drawingContext = { setLineDash: pattern => calls.push(['setLineDash', pattern]) };
  return calls;
}

test('cible : show dessine un cercle au rayon de la Target et un point au centre', () => {
  const { PointTarget, context } = scene();
  const calls = drawingSpy(context);
  const t = new PointTarget(300, 200); t.r = 35;
  t.show();
  const circles = calls.filter(c => c[0] === 'circle');
  assert.deepEqual(circles.map(c => c.slice(1)), [[300, 200, 70], [300, 200, 70], [300, 200, PointTarget.DOT_DIAMETER]]);
  assert.ok(PointTarget.DOT_DIAMETER < 2 * 20);
  assert.equal(calls.filter(c => c[0] === 'push').length, 1);
  assert.equal(calls.filter(c => c[0] === 'pop').length, 1);
  assert.equal(calls[0][0], 'push'); assert.equal(calls[calls.length - 1][0], 'pop');
  // le cercle n'est pas rempli, le point l'est
  const indexOf = name => calls.findIndex(c => c[0] === name);
  assert.ok(indexOf('noFill') < indexOf('circle'));
  assert.ok(calls.findIndex(c => c[0] === 'fill') < calls.lastIndexOf(circles[2]));
  assert.equal(calls.filter(c => c[0] === 'setLineDash').length, 0);
});

test('cible : le cercle suit le rayon courant de la Target et la position', () => {
  const { PointTarget, context } = scene();
  const calls = drawingSpy(context);
  const t = new PointTarget(10, 20);
  for (const r of [20, 50]) {
    calls.length = 0; t.r = r; t.show();
    assert.equal(calls.find(c => c[0] === 'circle')[3], 2 * r);
  }
  calls.length = 0; t.pos.set(123, 456); t.show();
  assert.ok(calls.filter(c => c[0] === 'circle').every(c => c[1] === 123 && c[2] === 456));
});

test('cible : en mode fuite un cercle pointillé montre la distance de fuite', () => {
  const { Follower, PointTarget, context } = scene();
  const calls = drawingSpy(context);
  const t = new PointTarget(300, 200); t.r = 35;
  assert.equal(t.zoneRadius, 0);
  assert.equal(Follower.FLEE_RADIUS, 300);
  assert.equal(new Follower(0, 0).fleeRadius, Follower.FLEE_RADIUS);
  t.zoneRadius = Follower.FLEE_RADIUS;
  t.show();
  const circles = calls.filter(c => c[0] === 'circle');
  assert.deepEqual(circles.map(c => c[3]), [600, 70, 70, PointTarget.DOT_DIAMETER]);
  const dashes = calls.filter(c => c[0] === 'setLineDash').map(c => c[1]);
  assert.deepEqual(plain(dashes), [[8, 8], []]);
  // le pointillé est actif pendant le tracé du grand cercle seulement
  assert.ok(calls.findIndex(c => c[0] === 'setLineDash') < calls.findIndex(c => c[0] === 'circle'));
  assert.ok(calls.lastIndexOf(calls.filter(c => c[0] === 'setLineDash')[1]) < calls.indexOf(circles[1]));
});

test('cible : le comportement ne change pas, le rayon de la Target décide toujours de l\'arrivée', () => {
  const { Follower, PointTarget, population: p } = scene();
  const t = new PointTarget(400, 300); t.autonomous = false; t.r = 40;
  assert.equal(p.hasArrived(new Follower(435, 300), t), true);
  assert.equal(p.hasArrived(new Follower(445, 300), t), false);
  assert.ok(t instanceof Object.getPrototypeOf(PointTarget));
});

// ---------------------------------------------------------------------------
// Menu des paramètres : afficher / masquer
// ---------------------------------------------------------------------------

function fakeMenu(hidden = false) {
  const attributes = {}; const handlers = {};
  const button = { textContent: '', setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener: (name, fn) => { handlers[name] = fn; } };
  const panel = { hidden };
  return { button, panel, attributes, handlers };
}

test('menu : état initial affiché, le bouton le reflète', () => {
  const { menu: m } = scene(); const f = fakeMenu(false);
  const toggle = m.bind(f.button, f.panel);
  assert.equal(f.panel.hidden, false); assert.equal(toggle.isHidden(), false);
  assert.equal(f.attributes['aria-expanded'], 'true');
  assert.equal(f.button.textContent, m.LABEL_SHOWN);
  assert.equal(typeof f.handlers.click, 'function');
});

test('menu : un clic masque puis réaffiche, avec libellé, aria-expanded et rappel', () => {
  const { menu: m } = scene(); const f = fakeMenu(false); const changes = [];
  const toggle = m.bind(f.button, f.panel, hidden => changes.push(hidden));
  assert.deepEqual(changes, []);
  f.handlers.click();
  assert.equal(f.panel.hidden, true); assert.equal(toggle.isHidden(), true);
  assert.equal(f.attributes['aria-expanded'], 'false'); assert.equal(f.button.textContent, m.LABEL_HIDDEN);
  f.handlers.click();
  assert.equal(f.panel.hidden, false);
  assert.equal(f.attributes['aria-expanded'], 'true'); assert.equal(f.button.textContent, m.LABEL_SHOWN);
  assert.deepEqual(changes, [true, false]);
  toggle.toggle();
  assert.equal(f.panel.hidden, true); assert.deepEqual(changes, [true, false, true]);
  assert.notEqual(m.LABEL_SHOWN, m.LABEL_HIDDEN);
});

test('menu : un panneau déjà masqué au départ est reflété sans rappel', () => {
  const { menu: m } = scene(); const f = fakeMenu(true); const changes = [];
  m.bind(f.button, f.panel, hidden => changes.push(hidden));
  assert.equal(f.attributes['aria-expanded'], 'false'); assert.equal(f.button.textContent, m.LABEL_HIDDEN);
  assert.deepEqual(changes, []);
  f.handlers.click(); assert.equal(f.panel.hidden, false);
});

// ---------------------------------------------------------------------------
// Rayon de fuite réglable et capture de la cible
// ---------------------------------------------------------------------------

test('fuite : le rayon de fuite se règle de 50 à 600 et suit tous les véhicules', () => {
  const { Follower, population: p } = scene();
  const range = p.PARAMETERS.fleeRadius;
  assert.deepEqual([range.min, range.max, range.initial], [50, 600, 300]);
  const settings = p.createSettings();
  assert.equal(settings.fleeRadius, 300);
  const vehicles = [new Follower(0, 0), new Follower(1, 1)];
  p.setParameter(vehicles, settings, 'fleeRadius', 450);
  assert.ok(vehicles.every(v => v.fleeRadius === 450)); assert.equal(settings.fleeRadius, 450);
  for (const bound of [50, 600]) {
    p.setParameter(vehicles, settings, 'fleeRadius', bound);
    assert.ok(vehicles.every(v => v.fleeRadius === bound));
  }
  for (const bad of [49.99, 600.01, NaN, Infinity, '300', null, undefined]) {
    assert.throws(() => p.setParameter(vehicles, settings, 'fleeRadius', bad), { name: 'RangeError' });
    assert.equal(settings.fleeRadius, 600);
  }
  const created = new Follower(5, 5); p.applySettings(created, settings);
  assert.equal(created.fleeRadius, 600);
});

test('fuite : le rayon réglé décide du moment où le véhicule fuit ou freine', () => {
  const { Follower } = scene();
  // le véhicule s'éloigne déjà de la cible, à 300 px : s'il fuit il accélère vers la gauche,
  // s'il freine la force pointe vers la droite
  const makeRunner = fleeRadius => {
    const f = new Follower(400, 300); f.fleeing = true; f.vel.set(-3, 0); f.fleeRadius = fleeRadius;
    f.applyBehaviors(new Vector(700, 300));
    return f;
  };
  assert.ok(makeRunner(400).acc.x < 0);
  assert.ok(makeRunner(200).acc.x > 0);
});

test('capture : step renvoie true quand un véhicule atteint la cible, false sinon', () => {
  const { Follower, PointTarget, population: p } = scene();
  const goal = new Vector(400, 300);
  const far = new Follower(100, 100);
  assert.equal(p.step(far, goal, 800, 600, rng), false);
  const onTarget = new Follower(405, 300); onTarget.vel.set(1, 1);
  assert.equal(p.step(onTarget, goal, 800, 600, rng), true);
  assert.equal(onTarget.vel.mag(), 0);
  const arriving = new Follower(418, 300); arriving.vel.set(-4, 0); arriving.maxForce = 0;
  assert.equal(p.step(arriving, goal, 800, 600, rng), true);
  const fleeing = new Follower(405, 300); fleeing.fleeing = true;
  assert.equal(p.step(fleeing, goal, 800, 600, rng), false);
  // avec une vraie cible, c'est son rayon qui décide
  const t = new PointTarget(400, 300); t.setMotion('cursor'); t.r = 60;
  assert.equal(p.step(new Follower(450, 300), t, 800, 600, rng), true);
  assert.equal(p.step(new Follower(470, 300), t, 800, 600, rng), false);
});

test("capture : sans place pour réapparaître le véhicule reste et n'est pas compté", () => {
  const { Follower, PointTarget, population: p } = scene(100, 100);
  const t = new PointTarget(50, 50); t.setMotion('cursor'); t.r = 100;
  const v = new Follower(50, 50);
  assert.equal(p.step(v, t, 100, 100, rng), false);
});

// ---------------------------------------------------------------------------
// Cible : mouvements et diamètre fixe
// ---------------------------------------------------------------------------

test('cible : setMotion règle le mouvement (seule ou curseur), valeurs invalides rejetées', () => {
  const { PointTarget } = scene();
  const t = new PointTarget(400, 300);
  assert.equal(t.motion, 'wander'); assert.deepEqual(plain(PointTarget.MOTIONS), ['wander', 'cursor']);
  t.setMotion('cursor'); assert.deepEqual([t.autonomous, t.motion], [false, 'cursor']);
  t.setMotion('wander'); assert.deepEqual([t.autonomous, t.motion], [true, 'wander']);
  for (const bad of ['flee', 'saut', '', null, undefined, 3]) {
    assert.throws(() => t.setMotion(bad), { name: 'RangeError' });
    assert.equal(t.motion, 'wander');
  }
});

test('cible : fixedRadius fige le rayon, même en mode curseur, null laisse la Target libre', () => {
  const { PointTarget, intervals } = scene();
  const t = new PointTarget(400, 300);
  assert.equal(t.fixedRadius, null);
  t.fixedRadius = 30;
  for (const motion of ['wander', 'cursor']) {
    t.setMotion(motion);
    intervals[0]();                    // la Target fournie change son rayon au hasard
    assert.ok(t.r >= 20 && t.r <= 50);
    t.update();
    assert.equal(t.r, 30);
  }
  t.fixedRadius = null; t.r = 37; t.setMotion('wander'); t.update();
  assert.equal(t.r, 37);
});

// ---------------------------------------------------------------------------
// Pilotage partagé (steering.js)
// ---------------------------------------------------------------------------

test('pilotage : flee inverse la vitesse désirée puis recalcule la force, limitée à maxForce', () => {
  const { steering: s } = scene();
  const agent = { pos: new Vector(100, 100), vel: new Vector(2, 0), maxSpeed: 4, maxForce: 10 };
  const force = s.flee(agent, new Vector(200, 100));
  assert.ok(close(force.x, -6) && close(force.y, 0));     // (-4, 0) - (2, 0)
  agent.maxForce = 0.5;
  assert.ok(close(s.flee(agent, new Vector(200, 100)).mag(), 0.5));
  const original = [agent.pos.x, agent.pos.y, agent.vel.x, agent.vel.y];
  s.flee(agent, new Vector(150, 150));
  assert.deepEqual([agent.pos.x, agent.pos.y, agent.vel.x, agent.vel.y], original);
});

test('pilotage : wrapDelta ramène un écart dans la demi-période', () => {
  const { steering: s } = scene();
  assert.equal(s.wrapDelta(100, 832), 100);
  assert.equal(s.wrapDelta(416, 832), 416);
  assert.equal(s.wrapDelta(417, 832), 417 - 832);
  assert.equal(s.wrapDelta(-417, 832), -417 + 832);
  assert.equal(s.wrapDelta(-780, 832), 52);
  for (const delta of [-831, -500, -10, 0, 10, 500, 831]) {
    const wrapped = s.wrapDelta(delta, 832);
    assert.ok(Math.abs(wrapped) <= 416);
    assert.ok(close(((wrapped - delta) % 832 + 832) % 832, 0));
  }
});

test('pilotage : Follower et les cibles utilisent le même flee', () => {
  const { Follower, PointTarget, TargetFuyante, steering: s } = scene();
  const f = new Follower(100, 100); f.vel.set(1, 2); f.maxForce = 10;
  const threat = new Vector(130, 160);
  assert.deepEqual(plain(f.flee(threat)), plain(s.flee(f, threat)));
  const t = new PointTarget(100, 100); t.vel.set(1, 2); t.maxForce = 10;
  assert.deepEqual(plain(t.flee(threat)), plain(s.flee(t, threat)));
  assert.equal(TargetFuyante.prototype.flee, PointTarget.prototype.flee);
});

// ---------------------------------------------------------------------------
// TargetFuyante : la cible fuit le vaisseau le plus proche (scénario 2)
// ---------------------------------------------------------------------------

// un prédateur immobile, ou qui suit la cible à distance fixe
const predator = (x, y) => ({ pos: new Vector(x, y) });

function fleeingTarget(state, x = 400, y = 300) {
  const t = new state.TargetFuyante(x, y);
  t.vel.set(0, 0);
  return t;
}

test("cible fuyante : sous-classe de Vehicle, flee() est hérité, réglages de l'énoncé", () => {
  const state = scene();
  const { Vehicle, Target, PointTarget, TargetFuyante } = state;
  const t = fleeingTarget(state);
  assert.ok(t instanceof Vehicle && t instanceof Target && t instanceof PointTarget);
  assert.equal(Object.hasOwn(TargetFuyante.prototype, 'flee'), false);
  assert.equal(typeof t.flee, 'function');
  assert.equal(t.detectionRadius, 200);
  assert.equal(TargetFuyante.ESCAPE_DISTANCE, 300);
  assert.equal(t.maxEndurance, 2.5); assert.equal(t.endurance, 2.5);
  assert.deepEqual([t.fleeing, t.tired, t.threatened, t.reproduces], [false, false, false, false]);
  assert.equal(TargetFuyante.debug, false);
  // le flee hérité inverse la vitesse désirée, ce n'est pas -seek
  t.maxForce = 10; t.vel.set(2, 0);
  const away = new Vector(500, 300);
  const flee = t.flee(away); const seek = t.seek(away);
  assert.ok(close(flee.x, -6) && !close(flee.x, -seek.x));
});

test('cible fuyante : elle fuit seulement quand un vaisseau entre dans son cercle de détection', () => {
  const state = scene();
  for (const [distance, expected] of [[250, false], [200, false], [199, true], [50, true]]) {
    const t = fleeingTarget(state);
    t.threats = [predator(400 - distance, 300)];
    t.update(1 / 60);
    assert.equal(t.fleeing, expected, 'distance ' + distance);
    assert.equal(t.threatened, expected);
  }
  const alone = fleeingTarget(state); alone.threats = [];
  alone.update(1 / 60);
  assert.equal(alone.fleeing, false); assert.equal(alone.nearestThreat(), null);
});

test('cible fuyante : elle fuit le vaisseau le plus proche, dans la direction opposée', () => {
  const state = scene();
  const t = fleeingTarget(state);
  t.threats = [predator(400, 150), predator(300, 300)];   // à 150 px au-dessus, à 100 px à gauche
  assert.equal(t.nearestThreat().vehicle, t.threats[1]);
  for (let i = 0; i < 10; i++) t.update(1 / 60);
  assert.ok(t.pos.x > 400 && t.vel.x > 0);
  assert.ok(Math.abs(t.vel.y) < t.vel.x);
});

test('cible fuyante : le plus proche peut l\'être à travers un bord', () => {
  const state = scene();
  const t = fleeingTarget(state, 10, 300); t.r = 16;
  t.threats = [predator(790, 300)];                        // 52 px à travers le bord gauche
  const threat = t.nearestThreat();
  assert.ok(close(threat.distance, 52));
  t.update(1 / 60);
  assert.equal(t.fleeing, true);
  assert.ok(t.vel.x > 0);
});

test('cible fuyante : pendant la fuite elle accélère et sa vitesse max augmente progressivement', () => {
  const state = scene();
  const t = fleeingTarget(state);
  assert.ok(close(t.maxSpeed, 4) && close(t.maxForce, 0.1));
  t.threats = [predator(300, 300)];
  t.update(0.1);
  assert.equal(t.fleeing, true);
  assert.ok(close(t.maxForce, 0.1 * t.constructor.FORCE_BOOST));
  assert.ok(close(t.maxSpeed, 4 * 1.1));
  for (let i = 0; i < 4; i++) t.update(0.1);
  assert.ok(close(t.maxSpeed, 4 * 1.5));
  for (let i = 0; i < 10; i++) t.update(0.1);
  assert.ok(close(t.maxSpeed, 4 * t.constructor.SPEED_BOOST));
  // sa vitesse réelle dépasse sa vitesse normale
  assert.ok(t.vel.mag() > 4);
  // régler la vitesse pendant la fuite règle la vitesse normale
  t.maxSpeed = 3;
  assert.ok(close(t.baseSpeed, 3) && close(t.maxSpeed, 3 * t.constructor.SPEED_BOOST));
});

test("cible fuyante : elle fuit jusqu'à 300 px du prédateur, puis reprend le comportement de Target", () => {
  const state = scene();
  const { Target } = state;
  let normalUpdates = 0;
  const original = Target.prototype.update;
  Target.prototype.update = function (...args) { normalUpdates++; return original.apply(this, args); };
  const t = fleeingTarget(state);
  t.threats = [predator(300, 300)];
  let stoppedAt = null; let previousDistance = 0;
  for (let frame = 0; frame < 600 && stoppedAt === null; frame++) {
    const wasFleeing = t.fleeing;
    previousDistance = t.nearestThreat().distance;
    t.update(1 / 60);
    if (wasFleeing && !t.fleeing) stoppedAt = t.nearestThreat().distance;
    if (t.fleeing) assert.equal(normalUpdates, 0);
  }
  assert.ok(stoppedAt !== null);
  assert.ok(previousDistance >= 300 || stoppedAt >= 300);
  assert.ok(previousDistance < 300 + 20);
  assert.equal(t.tired, false);
  // hors de portée : comportement normal de Target, la cible ne repart pas en fuite
  const before = normalUpdates;
  t.update(1 / 60); t.update(1 / 60);
  assert.equal(normalUpdates, before + 2);
  assert.equal(t.fleeing, false);
  Target.prototype.update = original;
});

test('cible fuyante : elle ne fuit jamais plus que son endurance, puis se repose avant de repartir', () => {
  const state = scene();
  const t = fleeingTarget(state);
  const chaser = predator(300, 300);
  t.threats = [chaser];
  const dt = 0.1;
  let flightTime = 0; let frame = 0;
  // le prédateur reste collé à 100 px : seule l'endurance peut arrêter la fuite
  while (frame < 200 && !t.tired) {
    t.update(dt);
    chaser.pos.set(t.pos.x - 100, t.pos.y);
    if (t.fleeing) flightTime += dt;
    frame++;
  }
  assert.equal(t.tired, true); assert.equal(t.fleeing, false); assert.equal(t.endurance, 0);
  assert.ok(flightTime <= t.maxEndurance + dt + 1e-9 && flightTime >= t.maxEndurance - dt - 1e-9);
  // épuisée : elle ne fuit plus, même menacée, et récupère à 0,5 s par seconde
  let restFrames = 0;
  while (restFrames < 100 && !t.fleeing) {
    t.update(dt);
    chaser.pos.set(t.pos.x - 100, t.pos.y);
    assert.equal(t.threatened, true);
    restFrames++;
  }
  const rest = restFrames * dt;
  // elle repart à 50 % d'endurance : 1,25 s d'endurance à 0,5 par seconde = 2,5 s de repos
  assert.ok(rest >= 2.5 - 2 * dt && rest <= 2.5 + 2 * dt, 'repos ' + rest);
  assert.equal(t.tired, false);
});

test("cible fuyante : la durée de fuite suit le réglage d'endurance", () => {
  const state = scene();
  for (const endurance of [0.5, 1, 4]) {
    const t = fleeingTarget(state);
    t.configureFlight({ detection: 200, endurance, reproduction: false, splitAfter: 3 });
    t.endurance = endurance;
    const chaser = predator(300, 300); t.threats = [chaser];
    let flightTime = 0;
    for (let frame = 0; frame < 400 && !t.tired; frame++) {
      t.update(0.05);
      chaser.pos.set(t.pos.x - 100, t.pos.y);
      if (t.fleeing) flightTime += 0.05;
    }
    assert.ok(Math.abs(flightTime - endurance) <= 0.05 + 1e-9, 'endurance ' + endurance + ' : ' + flightTime);
  }
});

test('cible fuyante : en mode curseur elle ne fuit pas', () => {
  const state = scene();
  const t = fleeingTarget(state); t.setMotion('cursor');
  t.threats = [predator(350, 300)];
  t.update(1 / 60);
  assert.equal(t.fleeing, false); assert.equal(t.threatened, true);
  assert.deepEqual([t.pos.x, t.pos.y], [400, 300]);
});

test('cible fuyante : les secousses aléatoires de Target sont ignorées pendant la fuite', () => {
  const state = scene();
  const t = fleeingTarget(state);
  t.threats = [predator(300, 300)];
  for (let i = 0; i < 5; i++) t.update(1 / 60);
  const flight = t.vel;
  state.intervals[0]();                // la Target fournie remplace sa vitesse au hasard
  assert.notEqual(t.vel, flight);
  t.update(1 / 60);
  assert.equal(t.vel, flight);
  assert.ok(t.vel.x > 0);
});

test('cible fuyante : configureFlight règle détection, endurance et reproduction', () => {
  const state = scene();
  const t = fleeingTarget(state);
  t.configureFlight({ detection: 120, endurance: 1, reproduction: true, splitAfter: 4 });
  assert.deepEqual([t.detectionRadius, t.maxEndurance, t.endurance, t.reproduces, t.splitAfter], [120, 1, 1, true, 4]);
  t.configureFlight({ detection: 300, endurance: 6, reproduction: false, splitAfter: 2 });
  assert.equal(t.endurance, 1);       // l'endurance courante ne remonte pas d'un coup
  assert.equal(t.escapeDistance(), 300);
  t.configureFlight({ detection: 300, endurance: 6, reproduction: false, splitAfter: 2 });
  t.detectionRadius = 300;
  assert.equal(t.escapeDistance(), 300);
});

test("cible fuyante : barre d'endurance au-dessus de la cible, couleur selon l'état", () => {
  const state = scene();
  const t = fleeingTarget(state, 100, 200); t.r = 30;
  let bar = t.enduranceBar();
  assert.deepEqual(plain(bar), { x: 80, y: 156, width: 40, height: 6, fraction: 1, color: 'limegreen' });
  assert.ok(bar.y + bar.height < t.pos.y - t.r);
  t.endurance = 0.5;
  bar = t.enduranceBar();
  assert.ok(close(bar.fraction, 0.2)); assert.equal(bar.color, 'red');
  t.tired = true;
  assert.equal(t.enduranceBar().color, 'orange');
});

function drawingSpyWithRect(context) {
  const calls = [];
  for (const name of ['push', 'pop', 'noFill', 'fill', 'stroke', 'noStroke', 'strokeWeight', 'circle', 'rect']) {
    context[name] = (...args) => calls.push([name, ...args]);
  }
  context.drawingContext = { setLineDash: pattern => calls.push(['setLineDash', pattern]) };
  return calls;
}

test('cible fuyante : debug, cercle de détection jaune puis rouge, barre toujours dessinée', () => {
  const state = scene();
  const { TargetFuyante, context } = state;
  const calls = drawingSpyWithRect(context);
  const t = fleeingTarget(state, 300, 200); t.r = 30;
  t.show();
  const circles = () => calls.filter(c => c[0] === 'circle').map(c => c[3]);
  assert.ok(!circles().includes(400));
  const rects = calls.filter(c => c[0] === 'rect');
  assert.equal(rects.length, 2);
  assert.deepEqual(rects[1].slice(1), [280, 156, 40, 6]);
  assert.equal(calls.filter(c => c[0] === 'push').length, calls.filter(c => c[0] === 'pop').length);
  for (const [threatened, color] of [[false, 'yellow'], [true, 'red']]) {
    calls.length = 0;
    TargetFuyante.debug = true; t.threatened = threatened;
    t.show();
    const index = calls.findIndex(c => c[0] === 'circle' && c[3] === 400);
    assert.ok(index > 0, 'cercle de détection absent');
    const lastStroke = calls.slice(0, index).reverse().find(c => c[0] === 'stroke');
    assert.equal(lastStroke[1], color);
    assert.equal(t.detectionColor(), color);
  }
  TargetFuyante.debug = false;
});

test('cible fuyante : frameSeconds convertit deltaTime de p5, borné', () => {
  const { TargetFuyante, context } = scene();
  assert.ok(close(TargetFuyante.frameSeconds(), 1 / 60));
  context.deltaTime = 16; assert.ok(close(TargetFuyante.frameSeconds(), 0.016));
  context.deltaTime = 5000; assert.ok(close(TargetFuyante.frameSeconds(), 0.1));
  context.deltaTime = 0; assert.ok(close(TargetFuyante.frameSeconds(), 1 / 60));
});

// ---------------------------------------------------------------------------
// Reproduction : une cible qui a assez fui se divise en deux
// ---------------------------------------------------------------------------

test('reproduction : la cible demande à se diviser après splitAfter secondes de fuite cumulée', () => {
  const state = scene();
  const t = fleeingTarget(state);
  t.threats = [predator(300, 300)];
  for (let i = 0; i < 30; i++) t.update(0.1);
  assert.ok(t.totalFleeTime > 2);
  // elle a assez fui pour se diviser, mais la reproduction est désactivée : rien ne se passe
  t.splitAfter = 1; assert.ok(t.totalFleeTime >= t.splitAfter);
  assert.equal(t.reproduces, false);
  assert.equal(t.wantsToSplit(), false);
  t.reproduces = true; assert.equal(t.wantsToSplit(), true);
  const r = fleeingTarget(state);
  r.configureFlight({ detection: 200, endurance: 2.5, reproduction: true, splitAfter: 1.5 });
  r.threats = [predator(300, 300)];
  let frames = 0;
  while (!r.wantsToSplit() && frames < 100) { r.update(0.1); frames++; }
  assert.ok(r.wantsToSplit());
  assert.ok(r.totalFleeTime >= 1.5 && r.totalFleeTime < 1.5 + 0.1 + 1e-9);
  // sans fuite, le compteur n'avance pas
  const calm = fleeingTarget(state);
  calm.configureFlight({ detection: 200, endurance: 2.5, reproduction: true, splitAfter: 1 });
  calm.threats = [];
  for (let i = 0; i < 50; i++) calm.update(0.1);
  assert.equal(calm.totalFleeTime, 0); assert.equal(calm.wantsToSplit(), false);
  r.postponeSplit();
  assert.equal(r.totalFleeTime, 0); assert.equal(r.wantsToSplit(), false);
});

test("reproduction : splitInto écarte les deux cibles, à ±45°, avec une endurance pleine", () => {
  const state = scene();
  const t = fleeingTarget(state); t.r = 20; t.vel.set(3, 0);
  t.threats = [predator(0, 0)];
  t.fleeing = true; t.endurance = 0.4; t.totalFleeTime = 5;
  const child = fleeingTarget(state, 0, 0);
  t.splitInto(child);
  assert.deepEqual([t.pos.x, t.pos.y, child.pos.x, child.pos.y], [400, 320, 400, 280]);
  const s = 3 / Math.SQRT2;
  assert.ok(close(t.vel.x, s) && close(t.vel.y, s));
  assert.ok(close(child.vel.x, s) && close(child.vel.y, -s));
  for (const target of [t, child]) {
    assert.equal(target.endurance, target.maxEndurance);
    assert.deepEqual([target.fleeing, target.tired, target.totalFleeTime], [false, false, 0]);
  }
  assert.equal(child.threats, t.threats);
  // une cible lancée à pleine vitesse de fuite repart à sa vitesse normale, sans la dépasser
  const fast = fleeingTarget(state); fast.vel.set(8, 0); fast.fleeing = true; fast.fleeTime = 2;
  assert.ok(close(fast.maxSpeed, 8));
  const twin = fleeingTarget(state);
  fast.splitInto(twin);
  for (const target of [fast, twin]) {
    assert.ok(close(target.vel.mag(), 4)); assert.ok(target.vel.mag() <= target.maxSpeed + 1e-9);
  }
  // une cible presque immobile repart quand même à vitesse 1
  const slow = fleeingTarget(state); slow.vel.set(0.1, 0);
  const other = fleeingTarget(state);
  slow.splitInto(other);
  assert.ok(close(slow.vel.mag(), 1) && close(other.vel.mag(), 1));
});

// ---------------------------------------------------------------------------
// Groupe de cibles (TargetGroup)
// ---------------------------------------------------------------------------

function groupState(maxTargets) {
  const state = scene();
  const { PointTarget, TargetFuyante, targetGroup: tg } = state;
  const made = { target: 0, fleeing: 0 }; const configured = [];
  const vehicles = [];
  const group = tg.create({
    make: (kind, x, y) => {
      made[kind]++;
      const t = kind === 'fleeing' ? new TargetFuyante(x, y) : new PointTarget(x, y);
      t.threats = vehicles;
      return t;
    },
    configure: t => configured.push(t),
    maxTargets,
  });
  return { ...state, group, made, configured, vehicles };
}

test('groupe : reset crée une seule cible du type courant, configurée', () => {
  const { group, made, configured, PointTarget } = groupState();
  assert.equal(group.kind, 'target'); assert.equal(group.maxTargets, 12);
  group.reset(100, 50);
  assert.equal(group.targets.length, 1);
  assert.ok(group.primary() instanceof PointTarget);
  assert.deepEqual([group.primary().pos.x, group.primary().pos.y], [100, 50]);
  assert.equal(made.target, 1); assert.deepEqual(configured, [group.primary()]);
  group.reset(10, 20);
  assert.equal(made.target, 1);                      // recyclée, pas recréée
  assert.deepEqual([group.primary().pos.x, group.primary().pos.y], [10, 20]);
});

test('groupe : setKind remplace la cible par une cible fuyante au même endroit', () => {
  const { group, TargetFuyante, PointTarget } = groupState();
  group.reset(300, 200);
  assert.equal(group.setKind('target'), false);
  assert.equal(group.setKind('fleeing'), true);
  assert.equal(group.kind, 'fleeing');
  assert.ok(group.primary() instanceof TargetFuyante);
  assert.deepEqual([group.primary().pos.x, group.primary().pos.y], [300, 200]);
  assert.throws(() => group.setKind('dragon'), { name: 'RangeError' });
  group.setKind('target');
  assert.ok(group.primary() instanceof PointTarget && !(group.primary() instanceof TargetFuyante));
});

test('groupe : chaque véhicule vise la cible la plus proche, à travers les bords', () => {
  const { group, Follower } = groupState();
  group.setKind('fleeing'); group.reset(100, 300);
  group.primary().reproduces = true; group.primary().totalFleeTime = 99;
  group.update(0);
  assert.equal(group.targets.length, 2);
  const [a, b] = group.targets;
  a.pos.set(100, 300); b.pos.set(700, 300);
  assert.equal(group.nearest(new Follower(200, 300)), a);
  assert.equal(group.nearest(new Follower(600, 300)), b);
  assert.equal(group.nearest(new Follower(790, 300)), b);
  assert.equal(group.nearest(new Follower(10, 300)), a);
  a.pos.set(20, 300); b.pos.set(400, 300);
  assert.equal(group.nearest(new Follower(780, 300)), a);   // 72 px à travers le bord
});

test('groupe : une cible capturée disparaît seulement s\'il en reste d\'autres', () => {
  const { group } = groupState();
  group.setKind('fleeing'); group.reset(400, 300);
  const only = group.primary();
  assert.equal(group.capture(only), false);
  assert.equal(group.targets.length, 1);
  only.reproduces = true; only.totalFleeTime = 99;
  group.update(0);
  const [first, second] = group.targets;
  assert.equal(group.capture(second), true);
  assert.equal(group.targets.length, 1); assert.equal(group.targets[0], first);
  assert.equal(group.capture(second), false);
});

test('groupe : les divisions respectent le plafond, au-delà la division est reportée', () => {
  const { group } = groupState(3);
  group.setKind('fleeing'); group.reset(400, 300);
  for (let round = 0; round < 5; round++) {
    for (const t of group.targets) { t.reproduces = true; t.splitAfter = 1; t.totalFleeTime = 2; }
    group.update(0);
    assert.ok(group.targets.length <= 3);
  }
  assert.equal(group.targets.length, 3);
  assert.ok(group.targets.every(t => t.totalFleeTime === 0));
  assert.equal(new Set(group.targets).size, 3);
});

test('groupe : les cibles sont recyclées, jamais plus de maxTargets créées par type', () => {
  const { group, made } = groupState(4);
  group.setKind('fleeing'); group.reset(400, 300);
  for (let cycle = 0; cycle < 60; cycle++) {
    for (const t of group.targets) { t.reproduces = true; t.splitAfter = 1; t.totalFleeTime = 2; }
    group.update(0);
    while (group.targets.length > 1) group.capture(group.targets[group.targets.length - 1]);
  }
  assert.ok(made.fleeing <= 4, 'cibles créées : ' + made.fleeing);
  group.setKind('target'); group.setKind('fleeing'); group.setKind('target');
  assert.equal(made.target, 1);
});

test('groupe : update, edges, show et configureAll agissent sur toutes les cibles', () => {
  const { group, configured } = groupState();
  group.setKind('fleeing'); group.reset(400, 300);
  group.primary().reproduces = true; group.primary().totalFleeTime = 99;
  group.update(0);
  const calls = [];
  for (const t of group.targets) {
    t.edges = () => calls.push(['edges', t]); t.show = () => calls.push(['show', t]);
    t.update = dt => calls.push(['update', t, dt]);
  }
  group.edges(); group.show(); group.update(0.25);
  for (const name of ['edges', 'show', 'update']) {
    assert.equal(calls.filter(c => c[0] === name).length, group.targets.length);
  }
  assert.ok(calls.filter(c => c[0] === 'update').every(c => c[2] === 0.25));
  configured.length = 0; group.configureAll();
  assert.deepEqual(configured, [...group.targets]);
});

// ---------------------------------------------------------------------------
// Réglages des cibles (TargetControls)
// ---------------------------------------------------------------------------

test('réglages de la cible : valeurs initiales, plages et choix', () => {
  const { targetControls: tc } = scene();
  assert.deepEqual(plain(tc.createSettings()), {
    diameter: 100, speed: 4, force: 0.3, detection: 200, endurance: 2.5, splitAfter: 3,
    randomSize: true, reproduction: false, motion: 'wander', kind: 'target' });
  const ranges = Object.fromEntries(Object.entries(tc.PARAMETERS).map(([k, r]) => [k, [r.min, r.max]]));
  assert.deepEqual(plain(ranges), { diameter: [20, 200], speed: [0, 12], force: [0, 5], detection: [50, 300],
    endurance: [0.5, 10], splitAfter: [1, 10] });
  assert.deepEqual(plain(Object.keys(tc.CHOICES.motion)), ['wander', 'cursor']);
  assert.deepEqual(plain(Object.keys(tc.CHOICES.kind)), ['target', 'fleeing']);
});

test('réglages de la cible : bornes incluses, valeurs et noms invalides rejetés sans effet', () => {
  const { targetControls: tc } = scene();
  const s = tc.createSettings();
  for (const [name, range] of Object.entries(tc.PARAMETERS)) {
    tc.setParameter(s, name, range.min); assert.equal(s[name], range.min);
    tc.setParameter(s, name, range.max); assert.equal(s[name], range.max);
    for (const bad of [range.min - 0.01, range.max + 0.01, NaN, Infinity, '50', null, undefined]) {
      assert.throws(() => tc.setParameter(s, name, bad), { name: 'RangeError' });
      assert.equal(s[name], range.max);
    }
  }
  assert.throws(() => tc.setParameter(s, 'inconnu', 1), { name: 'RangeError' });
  for (const name of ['randomSize', 'reproduction']) {
    for (const bad of [1, 'true', null, undefined]) {
      assert.throws(() => tc.setToggle(s, name, bad), { name: 'TypeError' });
    }
  }
  assert.throws(() => tc.setToggle(s, 'debug', true), { name: 'RangeError' });
  tc.setToggle(s, 'reproduction', true); assert.equal(s.reproduction, true);
  for (const [name, bad] of [['motion', 'flee'], ['motion', 'toString'], ['kind', 'dragon'], ['kind', null], ['taille', 'x']]) {
    assert.throws(() => tc.setChoice(s, name, bad), { name: 'RangeError' });
  }
  tc.setChoice(s, 'kind', 'fleeing'); assert.equal(s.kind, 'fleeing');
});

test('réglages de la cible : applyTo transmet tout à une cible normale comme à une cible fuyante', () => {
  const { PointTarget, TargetFuyante, targetControls: tc } = scene();
  const s = tc.createSettings();
  tc.setToggle(s, 'randomSize', false); tc.setParameter(s, 'diameter', 120);
  tc.setParameter(s, 'speed', 7.5); tc.setParameter(s, 'force', 1.25);
  tc.setParameter(s, 'detection', 150); tc.setParameter(s, 'endurance', 4);
  tc.setToggle(s, 'reproduction', true); tc.setParameter(s, 'splitAfter', 6);
  const normal = new PointTarget(0, 0); const fleeing = new TargetFuyante(0, 0);
  for (const motion of ['cursor', 'wander']) {
    tc.setChoice(s, 'motion', motion);
    for (const t of [normal, fleeing]) {
      tc.applyTo(t, s);
      assert.equal(t.motion, motion);
      assert.equal(t.fixedRadius, 60); assert.equal(t.maxSpeed, 7.5); assert.equal(t.maxForce, 1.25);
    }
  }
  assert.deepEqual([fleeing.detectionRadius, fleeing.maxEndurance, fleeing.reproduces, fleeing.splitAfter], [150, 4, true, 6]);
  assert.equal(normal.detectionRadius, undefined);
  tc.setToggle(s, 'randomSize', true); tc.applyTo(fleeing, s);
  assert.equal(fleeing.fixedRadius, null);
});

test('réglages de la cible : le diamètre réglé devient bien le rayon qui décide de la capture', () => {
  const { Follower, PointTarget, TargetFuyante, targetControls: tc, population: p } = scene();
  const s = tc.createSettings();
  tc.setChoice(s, 'motion', 'cursor'); tc.setToggle(s, 'randomSize', false);
  for (const t of [new PointTarget(400, 300), new TargetFuyante(400, 300)]) {
    for (const diameter of [20, 100, 200]) {
      tc.setParameter(s, 'diameter', diameter); tc.applyTo(t, s); t.update(0);
      assert.equal(t.r, diameter / 2);
      assert.equal(p.hasArrived(new Follower(400 + diameter / 2, 300), t), true);
      assert.equal(p.hasArrived(new Follower(400 + diameter / 2 + 1, 300), t), false);
    }
  }
});

test('réglages de la cible : curseurs, cases et listes mettent à jour les réglages et préviennent', () => {
  const { targetControls: tc } = scene();
  const s = tc.createSettings(); const events = {}; let changes = 0;
  const input = { value: '120', addEventListener: (name, fn) => events[name] = fn };
  const output = {};
  tc.bindSlider(input, output, 'diameter', s, () => changes++);
  assert.equal(s.diameter, 120); assert.equal(output.value, '120'); assert.equal(changes, 1);
  input.value = '64'; events.input();
  assert.equal(s.diameter, 64); assert.equal(output.value, '64'); assert.equal(changes, 2);
  const endurance = { value: '1.5', addEventListener: (name, fn) => events['e' + name] = fn };
  tc.bindSlider(endurance, output, 'endurance', s);
  assert.equal(s.endurance, 1.5); assert.equal(output.value, '1.5');
  assert.equal(events.change, undefined);
  const box = { checked: true, addEventListener: (name, fn) => events['box' + name] = fn };
  tc.bindCheckbox(box, 'reproduction', s, () => changes++);
  assert.equal(s.reproduction, true);
  box.checked = false; events.boxchange(); assert.equal(s.reproduction, false);
  assert.equal(changes, 4);
  const options = [];
  const select = { value: '', appendChild: o => options.push(o), addEventListener: (name, fn) => events['sel' + name] = fn };
  tc.bindChoice(select, 'kind', s, () => changes++, (value, label) => ({ value, label }));
  assert.deepEqual(plain(options), [
    { value: 'target', label: 'Normale (Target)' }, { value: 'fleeing', label: 'Fuyante (TargetFuyante)' }]);
  assert.equal(select.value, 'target'); assert.equal(changes, 5);
  select.value = 'fleeing'; events.selchange();
  assert.equal(s.kind, 'fleeing'); assert.equal(changes, 6);
  select.value = 'dragon';
  assert.throws(() => events.selchange(), { name: 'RangeError' });
  assert.equal(s.kind, 'fleeing');
});

// ---------------------------------------------------------------------------
// Scénarios : préréglages du menu déroulant
// ---------------------------------------------------------------------------

test('scénarios : liste complète, scénarios 1 et 2 de l\'énoncé en tête, textes renseignés', () => {
  const { scenarios: sc } = scene();
  const ids = sc.LIST.map(s => s.id);
  assert.deepEqual(plain(ids), ['chase', 'target-flees', 'reproduction', 'flee', 'race', 'mutual', 'cursor',
    'scarecrow', 'giant', 'tiny']);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(sc.LIST[0].label.startsWith('1.') && sc.LIST[1].label.startsWith('2.'));
  for (const s of sc.LIST) {
    assert.ok(typeof s.label === 'string' && s.label.length > 3);
    assert.ok(typeof s.description === 'string' && s.description.length > 20);
    assert.notEqual(s.id, sc.CUSTOM.id);
  }
  assert.equal(new Set(sc.LIST.map(s => s.label)).size, sc.LIST.length);
});

test("scénarios : les réglages d'origine sont ceux des contrôles", () => {
  const { scenarios: sc, targetControls: tc, population: p } = scene();
  const target = tc.createSettings(); const vehicles = p.createSettings();
  assert.deepEqual(plain(sc.BASE), {
    fleeing: vehicles.fleeing, targetKind: target.kind, targetMotion: target.motion,
    randomSize: target.randomSize, diameter: target.diameter, targetSpeed: target.speed,
    targetForce: target.force, detection: target.detection, endurance: target.endurance,
    reproduction: target.reproduction, splitAfter: target.splitAfter, fleeRadius: vehicles.fleeRadius,
    maxSpeed: vehicles.maxSpeed, maxForce: vehicles.maxForce });
  assert.deepEqual(plain(sc.valuesFor('chase')), plain(sc.BASE));
});

test('scénarios : chaque scénario règle tous les contrôles avec des valeurs dans leurs plages', () => {
  const { scenarios: sc, targetControls: tc, population: p } = scene();
  const ranges = {
    diameter: tc.PARAMETERS.diameter, targetSpeed: tc.PARAMETERS.speed, targetForce: tc.PARAMETERS.force,
    detection: tc.PARAMETERS.detection, endurance: tc.PARAMETERS.endurance, splitAfter: tc.PARAMETERS.splitAfter,
    maxSpeed: p.PARAMETERS.maxSpeed, maxForce: p.PARAMETERS.maxForce, fleeRadius: p.PARAMETERS.fleeRadius };
  const seen = new Set();
  for (const s of sc.LIST) {
    const values = sc.valuesFor(s.id);
    assert.deepEqual(plain(Object.keys(values)), plain(Object.keys(sc.BASE)));
    for (const key of ['fleeing', 'randomSize', 'reproduction']) assert.equal(typeof values[key], 'boolean');
    assert.ok(Object.hasOwn(tc.CHOICES.motion, values.targetMotion));
    assert.ok(Object.hasOwn(tc.CHOICES.kind, values.targetKind));
    for (const [key, range] of Object.entries(ranges)) {
      assert.ok(values[key] >= range.min && values[key] <= range.max, s.id + ' : ' + key);
    }
    seen.add(JSON.stringify(values));
  }
  assert.equal(seen.size, sc.LIST.length);
});

test("scénarios : le scénario 2 suit l'énoncé, la reproduction et les autres correspondent à leur titre", () => {
  const { scenarios: sc } = scene();
  const v = id => sc.valuesFor(id);
  assert.deepEqual([v('chase').targetKind, v('chase').fleeing], ['target', false]);
  const two = v('target-flees');
  assert.deepEqual([two.targetKind, two.detection, two.endurance, two.fleeing, two.reproduction],
    ['fleeing', 200, 2.5, false, false]);
  assert.deepEqual([v('reproduction').targetKind, v('reproduction').reproduction], ['fleeing', true]);
  assert.equal(v('flee').fleeing, true); assert.equal(v('flee').targetKind, 'target');
  assert.equal(v('race').targetKind, 'fleeing');
  assert.ok(v('race').endurance > two.endurance && v('race').maxSpeed > two.maxSpeed);
  assert.deepEqual([v('mutual').fleeing, v('mutual').targetKind], [true, 'fleeing']);
  assert.deepEqual([v('cursor').targetMotion, v('cursor').fleeing], ['cursor', false]);
  assert.deepEqual([v('scarecrow').targetMotion, v('scarecrow').fleeing], ['cursor', true]);
  assert.deepEqual([v('giant').diameter, v('giant').randomSize], [200, false]);
  assert.deepEqual([v('tiny').diameter, v('tiny').randomSize], [20, false]);
  for (const id of ['chase', 'flee', 'cursor', 'scarecrow', 'giant', 'tiny']) assert.equal(v(id).reproduction, false);
  assert.throws(() => sc.valuesFor('inconnu'), { name: 'RangeError' });
});

test('scénarios : apply appelle chaque réglage une fois avec la valeur du scénario', () => {
  const { scenarios: sc } = scene();
  for (const s of sc.LIST) {
    const calls = []; const setters = {};
    for (const key of Object.keys(sc.BASE)) setters[key] = value => calls.push([key, value]);
    sc.apply(s.id, setters);
    assert.deepEqual(plain(calls), plain(Object.entries(sc.valuesFor(s.id))));
  }
  assert.throws(() => sc.apply('inconnu', {}), { name: 'RangeError' });
  assert.throws(() => sc.apply('flee', { fleeing: () => {} }), /Aucun réglage pour/);
});

function fakeScenarioMenu(keys) {
  const handlers = { select: {} }; const options = []; const applied = []; const calls = [];
  const select = { value: '', appendChild: o => options.push(o), addEventListener: (name, fn) => { handlers.select[name] = fn; } };
  const description = { textContent: '' };
  const controls = ['a', 'b', 'c'].map(name => ({ name, handlers: {}, addEventListener(event, fn) { this.handlers[event] = fn; } }));
  // les réglages déclenchent l'événement du contrôle, comme dans la page
  const setters = {};
  for (const key of keys) {
    setters[key] = value => { calls.push([key, value]); controls[0].handlers.input(); controls[1].handlers.change(); };
  }
  return { select, description, controls, setters, options, applied, calls, handlers };
}

function bindFakeMenu(sc) {
  const m = fakeScenarioMenu(Object.keys(sc.BASE));
  const bound = sc.bindSelect({ select: m.select, description: m.description, controls: m.controls,
    setters: m.setters, onApply: id => m.applied.push(id), makeOption: (value, label) => ({ value, label }) });
  return { m, bound };
}

test('scénarios : le menu liste « Personnalisé » puis les scénarios et applique le premier', () => {
  const { scenarios: sc } = scene(); const { m, bound } = bindFakeMenu(sc);
  assert.equal(m.options.length, sc.LIST.length + 1);
  assert.deepEqual(plain(m.options[0]), { value: 'custom', label: 'Personnalisé' });
  assert.deepEqual(plain(m.options.slice(1).map(o => o.value)), plain(sc.LIST.map(s => s.id)));
  assert.equal(m.select.value, 'chase');
  assert.equal(m.description.textContent, sc.LIST[0].description);
  assert.deepEqual(m.applied, ['chase']);
  assert.equal(m.calls.length, Object.keys(sc.BASE).length);
  assert.equal(bound.isCustom(), false);
});

test('scénarios : choisir un scénario le règle et le menu reste sur ce scénario', () => {
  const { scenarios: sc } = scene(); const { m, bound } = bindFakeMenu(sc);
  m.calls.length = 0;
  m.select.value = 'reproduction'; m.handlers.select.change();
  assert.deepEqual(plain(m.calls), plain(Object.entries(sc.valuesFor('reproduction'))));
  assert.equal(m.select.value, 'reproduction');
  assert.equal(m.description.textContent, sc.LIST.find(s => s.id === 'reproduction').description);
  assert.deepEqual(m.applied, ['chase', 'reproduction']);
  assert.equal(bound.isCustom(), false);
});

test('scénarios : toucher un réglage à la main passe le menu sur « Personnalisé »', () => {
  const { scenarios: sc } = scene(); const { m, bound } = bindFakeMenu(sc);
  m.controls[2].handlers.input();
  assert.equal(m.select.value, 'custom'); assert.equal(bound.isCustom(), true);
  assert.equal(m.description.textContent, sc.CUSTOM.description);
  const before = m.calls.length;
  m.select.value = 'custom'; m.handlers.select.change();
  assert.equal(m.calls.length, before); assert.deepEqual(m.applied, ['chase']);
  m.select.value = 'flee'; m.handlers.select.change();
  assert.equal(m.select.value, 'flee'); assert.equal(bound.isCustom(), false);
  m.controls[1].handlers.change(); assert.equal(m.select.value, 'custom');
});

// ---------------------------------------------------------------------------
// Scénarios appliqués à de vrais objets (véhicules, groupe de cibles, réglages)
// ---------------------------------------------------------------------------

// reproduit la logique de sketch.js (non exécutable sous Node) avec les vrais modules
function realState(w = 800, h = 600) {
  const s = scene(w, h);
  const { Follower, PointTarget, TargetFuyante, population: p, targetControls: tc, targetGroup: tg } = s;
  const settings = p.createSettings(); const targetSettings = tc.createSettings();
  const vehicles = [];
  const makeTarget = (kind, x, y) => {
    const t = kind === 'fleeing' ? new TargetFuyante(x, y) : new PointTarget(x, y);
    t.threats = vehicles;
    return t;
  };
  const targets = tg.create({ make: makeTarget, configure: t => tc.applyTo(t, targetSettings) });
  targets.reset(w / 2, h / 2);
  const primary = { get pos() { return targets.primary().pos; }, get r() { return targets.primary().r; } };
  const create = (x, y) => { const v = new Follower(x, y); p.applySettings(v, settings); return v; };
  p.resize(vehicles, 20, primary, w, h, create, seededRandom(5));
  const applyTargets = () => { targets.setKind(targetSettings.kind); targets.configureAll(); };
  const via = set => value => { set(value); applyTargets(); };
  const setters = {
    fleeing: value => p.setFleeing(vehicles, settings, value),
    targetKind: via(value => tc.setChoice(targetSettings, 'kind', value)),
    targetMotion: via(value => tc.setChoice(targetSettings, 'motion', value)),
    randomSize: via(value => tc.setToggle(targetSettings, 'randomSize', value)),
    diameter: via(value => tc.setParameter(targetSettings, 'diameter', value)),
    targetSpeed: via(value => tc.setParameter(targetSettings, 'speed', value)),
    targetForce: via(value => tc.setParameter(targetSettings, 'force', value)),
    detection: via(value => tc.setParameter(targetSettings, 'detection', value)),
    endurance: via(value => tc.setParameter(targetSettings, 'endurance', value)),
    reproduction: via(value => tc.setToggle(targetSettings, 'reproduction', value)),
    splitAfter: via(value => tc.setParameter(targetSettings, 'splitAfter', value)),
    fleeRadius: value => p.setParameter(vehicles, settings, 'fleeRadius', value),
    maxSpeed: value => p.setParameter(vehicles, settings, 'maxSpeed', value),
    maxForce: value => p.setParameter(vehicles, settings, 'maxForce', value),
  };
  // comme onApply dans sketch.js : une seule cible au centre
  const applyScenario = id => { s.scenarios.apply(id, setters); targets.reset(w / 2, h / 2); };
  return { ...s, settings, targetSettings, vehicles, targets, setters, create, primary, applyScenario };
}

function runFrames(state, frames, dt = 1 / 60) {
  const { vehicles, targets, population: p } = state;
  let captures = 0; let maxCount = targets.targets.length;
  for (let frame = 0; frame < frames; frame++) {
    targets.update(dt); targets.edges();
    for (const v of vehicles) {
      const target = targets.nearest(v);
      if (p.step(v, target, 800, 600, rng)) { captures++; targets.capture(target); }
      assert.ok(Number.isFinite(v.pos.x) && Number.isFinite(v.pos.y));
      assert.ok(v.pos.x >= -16 && v.pos.x <= 816 && v.pos.y >= -16 && v.pos.y <= 616);
    }
    assert.ok(targets.targets.length >= 1 && targets.targets.length <= targets.maxTargets);
    maxCount = Math.max(maxCount, targets.targets.length);
    for (const t of targets.targets) {
      assert.ok(Number.isFinite(t.pos.x) && Number.isFinite(t.pos.y));
      assert.ok(t.pos.x >= -t.r && t.pos.x <= 800 + t.r && t.pos.y >= -t.r && t.pos.y <= 600 + t.r);
      if (t.autonomous) assert.ok(t.vel.mag() <= t.maxSpeed + 1e-9);
    }
  }
  return { captures, maxCount };
}

test('scénarios : chacun règle réellement véhicules et cibles, sans reste du précédent', () => {
  const state = realState();
  const { scenarios: sc, vehicles, targets, TargetFuyante } = state;
  const check = id => {
    const v = sc.valuesFor(id);
    assert.ok(vehicles.every(f => f.fleeing === v.fleeing), id);
    assert.ok(vehicles.every(f => f.maxSpeed === v.maxSpeed && f.maxForce === v.maxForce && f.fleeRadius === v.fleeRadius), id);
    assert.equal(targets.kind, v.targetKind, id);
    assert.equal(targets.targets.length, 1);
    const t = targets.primary();
    assert.equal(t instanceof TargetFuyante, v.targetKind === 'fleeing', id);
    assert.equal(t.motion, v.targetMotion, id);
    assert.equal(t.fixedRadius, v.randomSize ? null : v.diameter / 2, id);
    assert.equal(t.maxSpeed, v.targetSpeed, id); assert.equal(t.maxForce, v.targetForce, id);
    if (t instanceof TargetFuyante) {
      assert.deepEqual([t.detectionRadius, t.maxEndurance, t.reproduces, t.splitAfter],
        [v.detection, v.endurance, v.reproduction, v.splitAfter], id);
    }
  };
  for (const id of [...sc.LIST.map(s => s.id), 'giant', 'chase', 'race', 'chase', 'reproduction', 'flee']) {
    state.applyScenario(id); check(id);
  }
  state.applyScenario('race'); state.applyScenario('chase');
  assert.equal(targets.primary().fixedRadius, null); assert.equal(targets.kind, 'target');
  assert.ok(vehicles.every(f => !f.fleeing && f.maxSpeed === 4 && f.maxForce === 0.1 && f.fleeRadius === 300));
});

test('scénarios : tous restent stables pendant 300 images, aucune valeur absurde', () => {
  for (const id of ['chase', 'target-flees', 'reproduction', 'flee', 'race', 'mutual', 'cursor', 'scarecrow', 'giant', 'tiny']) {
    const state = realState();
    state.applyScenario(id);
    if (state.targets.primary().motion === 'cursor') state.targets.primary().follow(300, 200, 800, 600);
    runFrames(state, 300);
  }
});

test('scénario 2 : la cible fuit le vaisseau qui entre dans son cercle, puis la meute la rattrape', () => {
  const state = realState();
  const { vehicles, targets } = state;
  state.applyScenario('target-flees');
  const t = targets.primary();
  vehicles.forEach((v, i) => { v.pos.set(40 + i * 5, 40); v.vel.set(0, 0); });
  vehicles[0].pos.set(300, 300);                       // seul vaisseau dans le cercle de détection
  t.pos.set(420, 300); t.vel.set(0, 0);
  targets.update(1 / 60);
  assert.equal(t.fleeing, true);
  assert.equal(t.nearestThreat().vehicle, vehicles[0]);
  const start = t.pos.x;
  for (let i = 0; i < 20; i++) targets.update(1 / 60);
  assert.ok(t.pos.x > start + 5);
  // sur la durée, la cible se fatigue et les vaisseaux la capturent
  const { captures } = runFrames(state, 1200);
  assert.ok(captures > 0);
});

test('scénario reproduction : les cibles se multiplient, jamais au-delà du plafond, et les captures les retirent', () => {
  const state = realState();
  state.applyScenario('reproduction');
  let { captures, maxCount } = runFrames(state, 1800);
  assert.ok(maxCount > 1, 'aucune division');
  assert.ok(maxCount <= state.targets.maxTargets);
  assert.ok(captures > 0);
  // toutes les cibles sont des cibles fuyantes qui se reproduisent
  assert.ok(state.targets.targets.every(t => t instanceof state.TargetFuyante && t.reproduces));
});

test('scénarios : les vaisseaux qui fuient ne capturent jamais, une grosse cible se capture souvent', () => {
  for (const id of ['flee', 'mutual', 'scarecrow']) {
    const state = realState();
    state.applyScenario(id);
    if (state.targets.primary().motion === 'cursor') state.targets.primary().follow(400, 300, 800, 600);
    assert.equal(runFrames(state, 200).captures, 0, id);
  }
  const giant = realState();
  giant.applyScenario('giant');
  assert.ok(runFrames(giant, 300).captures > 0);
});

test("scénarios : fuite mutuelle, la cible et les véhicules s'écartent", () => {
  const state = realState();
  const { vehicles, targets } = state;
  state.applyScenario('mutual');
  const t = targets.primary();
  vehicles.forEach((v, i) => { v.pos.set(380 + (i % 5) * 10, 280 + (i % 4) * 10); v.vel.set(0, 0); });
  t.pos.set(400, 300); t.vel.set(0, 0);
  const meanDistance = () => vehicles.reduce((sum, v) => {
    const dx = Math.abs(v.pos.x - t.pos.x); const dy = Math.abs(v.pos.y - t.pos.y);
    return sum + Math.hypot(Math.min(dx, 832 - dx), Math.min(dy, 632 - dy));
  }, 0) / vehicles.length;
  const start = meanDistance();
  runFrames(state, 120);
  assert.ok(meanDistance() > 2 * start);
});

// ---------------------------------------------------------------------------
// Cohérence entre index.html, les modules et sketch.js (non exécutable sous Node)
// ---------------------------------------------------------------------------

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sketchSource = readFileSync(new URL('../sketch.js', import.meta.url), 'utf8');
const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
function inputAttributes(id) {
  const tag = indexHtml.match(new RegExp('<input id="' + id + '"[^>]*>'));
  assert.ok(tag, 'champ introuvable : ' + id);
  const attribute = name => Number(tag[0].match(new RegExp('\\b' + name + '="([^"]*)"'))[1]);
  return { min: attribute('min'), max: attribute('max'), step: attribute('step'), value: attribute('value') };
}

test('page : chaque identifiant utilisé par sketch.js existe dans index.html', () => {
  const used = new Set([...sketchSource.matchAll(/byId\('([^']+)'\)/g)].map(m => m[1]));
  for (const m of sketchSource.matchAll(/'([a-z]+(?:-[a-z]+)+)'/g)) used.add(m[1]);
  assert.ok(used.size > 20);
  for (const id of used) assert.ok(htmlIds.has(id), 'identifiant absent de index.html : ' + id);
  for (const id of ['scenario', 'scenario-description', 'captures', 'targets-count', 'debug-mode', 'target-kind',
    'target-motion', 'random-size', 'reproduction', 'flee-mode', 'flee-radius', 'menu-toggle', 'controls', 'scene']) {
    assert.ok(htmlIds.has(id), id);
  }
  assert.ok(!htmlIds.has('follow-cursor'));
});

test("page : les curseurs ont les plages et valeurs initiales des modules, chacun avec sa sortie", () => {
  const { population: p, targetControls: tc, gradient: g, fm } = scene();
  const sliders = {
    'vehicle-count': { min: p.MIN_COUNT, max: p.MAX_COUNT, initial: p.INITIAL_COUNT },
    'max-speed': p.PARAMETERS.maxSpeed, 'max-force': p.PARAMETERS.maxForce, 'flee-radius': p.PARAMETERS.fleeRadius,
    'target-diameter': tc.PARAMETERS.diameter, 'target-speed': tc.PARAMETERS.speed, 'target-force': tc.PARAMETERS.force,
    'target-detection': tc.PARAMETERS.detection, 'target-endurance': tc.PARAMETERS.endurance,
    'target-split': tc.PARAMETERS.splitAfter,
    'fm-volume': { min: 0, max: 1, initial: fm.INITIAL_VOLUME },
  };
  for (const [name, range] of Object.entries(g.PARAMETERS)) sliders['gradient-' + name] = range;
  for (const [name, range] of Object.entries(fm.PARAMETERS)) sliders['fm-' + name] = range;
  for (const [id, range] of Object.entries(sliders)) {
    const attributes = inputAttributes(id);
    assert.equal(attributes.min, range.min, id + ' min'); assert.equal(attributes.max, range.max, id + ' max');
    assert.equal(attributes.value, range.initial, id + ' valeur initiale');
    if (range.step !== undefined) assert.equal(attributes.step, range.step, id + ' pas');
    assert.ok(htmlIds.has(id + '-value'), id + ' : sortie absente');
  }
  assert.ok(/<input id="random-size" type="checkbox" checked>/.test(indexHtml));
  assert.ok(/<input id="reproduction" type="checkbox">/.test(indexHtml));
  assert.ok(/<input id="debug-mode" type="checkbox">/.test(indexHtml));
});

test("page : les scripts sont chargés dans l'ordre des dépendances et existent tous", () => {
  const scripts = [...indexHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const position = name => scripts.indexOf(name);
  for (const name of scripts) {
    assert.doesNotThrow(() => readFileSync(new URL('../' + name, import.meta.url)), name);
  }
  const before = (a, b) => assert.ok(position(a) >= 0 && position(a) < position(b), a + ' avant ' + b);
  before('vehicle.js', 'steering.js'); before('steering.js', 'follower.js'); before('vehicle.js', 'target.js');
  before('target.js', 'pointTarget.js'); before('pointTarget.js', 'targetFuyante.js');
  for (const name of ['population.js', 'targetFuyante.js', 'targetGroup.js', 'targetControls.js', 'scenarios.js',
    'menuToggle.js', 'gradientBackground.js', 'fmSynth.js', 'follower.js']) before(name, 'sketch.js');
  assert.equal(scripts[scripts.length - 1], 'sketch.js');
  assert.equal(new Set(scripts).size, scripts.length);
  assert.ok(!scripts.includes('bullseyeTarget.js') && !scripts.includes('mouseTarget.js'));
});
