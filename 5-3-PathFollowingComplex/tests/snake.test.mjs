import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

// Adaptateur vectoriel minimal pour exercer les vrais fichiers sans navigateur.
class Vector {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy() { return new Vector(this.x, this.y); }
  // comme p5 : add(vecteur) ou add(x, y)
  add(a, b) { if (typeof a === 'number') { this.x += a; this.y += b; } else { this.x += a.x; this.y += a.y; } return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  div(n) { this.x /= n; this.y /= n; return this; }
  dot(v) { return this.x * v.x + this.y * v.y; }
  mag() { return Math.hypot(this.x, this.y); }
  normalize() { const m = this.mag(); return m ? this.div(m) : this; }
  setMag(n) { const m = this.mag(); return m ? this.mult(n / m) : this; }
  limit(n) { return this.mag() > n ? this.setMag(n) : this; }
  heading() { return Math.atan2(this.y, this.x); }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
  static add(a, b) { return new Vector(a.x + b.x, a.y + b.y); }
  dist(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
}

// Aléatoire reproductible (générateur congruentiel linéaire)
function seededRandom(seed = 12345) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

const FILES = ['path.js', 'vehicle.js', 'steering.js', 'circuit.js', 'trackScenery.js', 'snakeSkins.js', 'snakeRing.js',
  'snake.js', 'insect.js', 'obstacle.js', 'crowd.js', 'snakeGroup.js', 'insectColony.js', 'obstacleField.js', 'swarms.js', 'snakeSettings.js', 'menuToggle.js'];

function scene() {
  const rand = seededRandom();
  const context = vm.createContext({
    createVector: (x, y) => new Vector(x, y), p5: { Vector }, PI: Math.PI, min: Math.min, max: Math.max,
    cos: Math.cos, sin: Math.sin,
    random: (a, b) => (b === undefined ? rand() * a : a + rand() * (b - a)), debug: false,
  });
  for (const file of FILES) vm.runInContext(read(file), context, { filename: file });
  return Object.assign(vm.runInContext(`({ Vehicle, Path, Steering, Circuit, TrackScenery, SnakeSkins, SnakeRing, Snake,
    Insect, Obstacle, Crowd, SnakeGroup, InsectColony, ObstacleField, Swarms, SnakeSettings, MenuToggle })`, context), { rand });
}

// petit élément factice : écouteurs, valeur
function element(extra = {}) {
  const listeners = {};
  return Object.assign({
    value: '', checked: false, hidden: false, textContent: '', attributes: {},
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    dispatchEvent: event => (listeners[event.type] ?? []).forEach(fn => fn(event)),
    setAttribute(name, value) { this.attributes[name] = value; },
  }, extra);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const EPS = 1e-9;

// circuit fermé : un grand carré de 600 px de côté, route de demi-largeur 20
function squarePath(s) {
  const path = new s.Path();
  for (const [x, y] of [[100, 100], [700, 100], [700, 700], [100, 700]]) path.addPoint(x, y);
  return path;
}

function newVehicle(s, x, y, ms = 2, mf = 0.3) {
  const v = new s.Vehicle(x, y, ms, mf);
  v.vel.set(0, 0);
  return v;
}

// ---------------------------------------------------------------- fichiers et interface

test('vehicle.js fourni : fichier inchangé', () => {
  const hash = createHash('sha256').update(readFileSync(new URL('../vehicle.js', import.meta.url))).digest('hex');
  assert.equal(hash, 'a13b9ef7092ef2e15839f253a18c79a41b0530ac53d46bb4a6669a29d0ca9b4b');
});

test('toute entité visible étend Vehicle ; le snake ne recopie ni follow ni separate', () => {
  const s = scene();
  for (const cls of [s.Snake, s.SnakeRing, s.Insect]) assert.ok(cls.prototype instanceof s.Vehicle, cls.name);
  for (const name of ['follow', 'separate', 'wander', 'seek', 'applyForce']) {
    assert.ok(!Object.hasOwn(s.Snake.prototype, name), `Snake.${name} recopié`);
    assert.ok(!Object.hasOwn(s.SnakeRing.prototype, name), `SnakeRing.${name} recopié`);
  }
});

test('index.html : curseurs identiques aux modules, scripts chargés dans l’ordre des dépendances', () => {
  const s = scene();
  const html = read('index.html');
  for (const [name, p] of Object.entries(s.SnakeSettings.PARAMETERS)) {
    const match = new RegExp(`<input id="snake-${name}" type="range" min="([^"]+)" max="([^"]+)" step="([^"]+)" value="([^"]+)">`).exec(html);
    assert.ok(match, `curseur snake-${name}`);
    assert.deepEqual(match.slice(1).map(Number), [p.min, p.max, p.step, p.initial], name);
    const output = new RegExp(`<output id="snake-${name}-value" for="snake-${name}">([^<]*)</output>`).exec(html);
    assert.equal(output?.[1], p.initial.toFixed(p.decimals));
  }
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(src => !src.startsWith('libraries/'));
  assert.equal(scripts.at(-1), 'sketch.js');
  for (const file of readdirSync(new URL('..', import.meta.url)).filter(f => f.endsWith('.js'))) {
    assert.ok(scripts.includes(file), `${file} n'est pas chargé`);
  }
  const definedIn = {};
  for (const file of scripts) for (const [, name] of read(file).matchAll(/^(?:class|const) (\w+)/gm)) definedIn[name] = file;
  for (const file of scripts) {
    for (const [, child, parent] of read(file).matchAll(/class (\w+) extends (\w+)/g)) {
      assert.ok(scripts.indexOf(definedIn[parent]) < scripts.indexOf(file), `${parent} avant ${child}`);
    }
  }
  // chaque module est chargé avant ce qui l'utilise
  const order = (a, b) => assert.ok(scripts.indexOf(a) < scripts.indexOf(b), `${a} avant ${b}`);
  order('steering.js', 'snakeRing.js');
  order('snakeSkins.js', 'snake.js');
  order('snake.js', 'snakeGroup.js');
  order('crowd.js', 'snakeGroup.js');
  order('snakeGroup.js', 'sketch.js');
});

test('sketch.js : identifiants présents dans index.html, touche t, plafond et menu masquable', () => {
  const html = read('index.html');
  const sketch = read('sketch.js');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  for (const [, id] of sketch.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.has(id), `#${id} manquant`);
  for (const [, id] of sketch.matchAll(/byId\(`([^`$]+)\$\{name\}([^`]*)`\)/g)) assert.ok(id.length > 0);
  assert.match(sketch, /key == "t"/);
  assert.match(sketch, /snakes\.add\(/);
  assert.match(sketch, /MenuToggle\.bind\(/);
  assert.ok(ids.has('menu-toggle') && ids.has('controls'));
});

test('réglages : validation des plages, curseur lié, affichage formaté', () => {
  const { SnakeSettings: c } = scene();
  const settings = c.createSettings();
  assert.deepEqual([settings.followWeight, settings.separateWeight], [2, 1.2]);
  for (const [name, p] of Object.entries(c.PARAMETERS)) {
    assert.throws(() => c.setParameter(settings, name, p.max + p.step), { name: 'RangeError' });
    assert.throws(() => c.setParameter(settings, name, p.min - p.step), { name: 'RangeError' });
    assert.throws(() => c.setParameter(settings, name, NaN), { name: 'RangeError' });
    assert.throws(() => c.setParameter(settings, name, '2'), { name: 'RangeError' });
    c.setParameter(settings, name, p.min);
    c.setParameter(settings, name, p.max);
  }
  assert.throws(() => c.setParameter(settings, 'inconnu', 1), { name: 'RangeError' });
  const input = element({ value: '3.5' });
  const output = element();
  let changes = 0;
  c.bindSlider(input, output, 'separateWeight', settings, () => changes++);
  assert.equal(output.value, '3.5');
  input.value = '0';
  input.dispatchEvent({ type: 'input' });
  assert.equal(settings.separateWeight, 0);
  assert.equal(output.value, '0.0');
  assert.equal(changes, 2);
});

test('MenuToggle : le menu se masque et se rouvre', () => {
  const { MenuToggle } = scene();
  const button = element();
  const panel = element();
  let seen = null;
  MenuToggle.bind(button, panel, hidden => { seen = hidden; });
  button.dispatchEvent({ type: 'click' });
  assert.equal(panel.hidden, true);
  assert.equal(seen, true);
  assert.equal(button.attributes['aria-expanded'], 'false');
  button.dispatchEvent({ type: 'click' });
  assert.equal(panel.hidden, false);
});

// ---------------------------------------------------------------- arrive (anneaux)

test('Steering.arrive : pleine vitesse au loin, freinage dans le rayon, recule si trop près, force limitée', () => {
  const { Steering, Vehicle } = scene();
  const v = new Vehicle(0, 0, 4, 0.5);
  v.vel.set(0, 0);
  const far = Steering.arrive(v, new Vector(500, 0), 20, 60);
  assert.ok(far.x > 0 && far.mag() <= v.maxForce + EPS);
  // à pleine vitesse hors du rayon : vitesse désirée = maxSpeed, donc plus de force
  v.vel.set(4, 0);
  assert.ok(Steering.arrive(v, new Vector(500, 0), 20, 60).mag() < EPS);
  // juste dans le rayon : vitesse désirée réduite, donc la force freine
  const brake = Steering.arrive(v, new Vector(50, 0), 20, 60);
  assert.ok(brake.x < 0);
  // à l'offset : vitesse désirée nulle, force = -vitesse (limitée)
  v.vel.set(0.3, 0);
  const stop = Steering.arrive(v, new Vector(20, 0), 20, 60);
  assert.ok(Math.abs(stop.x + 0.3) < EPS);
  // plus près que l'offset : la vitesse désirée est négative (recul)
  v.vel.set(0, 0);
  const back = Steering.arrive(v, new Vector(5, 0), 20, 60);
  assert.ok(back.x < 0 && back.mag() <= v.maxForce + EPS);
  // cible exactement sur l'agent : pas de NaN
  const same = Steering.arrive(v, new Vector(0, 0), 0, 60);
  assert.ok(Number.isFinite(same.x) && Number.isFinite(same.y));
});

// ---------------------------------------------------------------- serpent

test('serpent : tête et anneaux créés, longueur bornée, corps qui s’affine', () => {
  const s = scene();
  const snake = new s.Snake(400, 300, { length: 10, size: 12 });
  assert.equal(snake.rings.length, 10);
  assert.ok(snake.rings.every(ring => ring instanceof s.SnakeRing));
  assert.deepEqual([snake.followPathWeight, snake.separateWeight], [2, 1.2], 'poids par défaut de Vehicle');
  for (let i = 2; i <= 10; i++) assert.ok(snake.ringRadius(i) < snake.ringRadius(i - 1));
  snake.setLength(1000);
  assert.equal(snake.rings.length, s.Snake.MAX_RINGS);
  snake.setLength(-5);
  assert.equal(snake.rings.length, s.Snake.MIN_RINGS);
  snake.setLength(10);
  const first = snake.rings[0];
  snake.setLength(14);
  assert.equal(snake.rings[0], first, 'les anneaux existants sont conservés');
  assert.equal(snake.parts().length, 15);
  assert.equal(snake.parts()[0], snake);
  const weighted = new s.Snake(0, 0, { followWeight: 3.5, separateWeight: 0.5 });
  assert.deepEqual([weighted.followPathWeight, weighted.separateWeight], [3.5, 0.5]);
});

test('follow : la tête est ramenée vers le chemin, force limitée à maxForce × poids', () => {
  const s = scene();
  const path = squarePath(s);
  const snake = new s.Snake(400, 400, { length: 5, maxSpeed: 2.5, maxForce: 0.3 });
  snake.vel.set(2.5, 0);
  const forces = snake.headForces([], path);
  assert.ok(forces.follow.mag() > 0, 'loin de la route : force de suivi');
  assert.ok(forces.follow.mag() <= 0.3 * snake.followPathWeight + EPS);
  assert.equal(forces.separate.mag(), 0, 'personne autour');
  // le même calcul que Vehicle.follow, pondéré
  const raw = snake.follow(path);
  assert.ok(Math.abs(forces.follow.x - raw.x * snake.followPathWeight) < EPS);
  // sur la route : follow ne force rien
  const onRoad = new s.Snake(400, 100, { length: 5 });
  onRoad.vel.set(2.5, 0);
  assert.equal(onRoad.headForces([], path).follow.mag(), 0);
});

test('poids du suivi : zéro = aucune force, croissant = force proportionnelle', () => {
  const s = scene();
  const path = squarePath(s);
  const mag = weight => {
    const snake = new s.Snake(400, 400, { length: 4, followWeight: weight });
    snake.vel.set(2.5, 0);
    return snake.headForces([], path).follow.mag();
  };
  assert.equal(mag(0), 0);
  const base = mag(1);
  assert.ok(base > 0);
  assert.ok(Math.abs(mag(3) - 3 * base) < 1e-9);
});

test('poids de la séparation : zéro = aucune force ; proportionnel ; pas d’effet loin des véhicules', () => {
  const s = scene();
  const other = newVehicle(s, 410, 400);
  const mags = weight => {
    const snake = new s.Snake(400, 400, { length: 4, separateWeight: weight });
    return snake.headForces([other], squarePath(s)).separate;
  };
  assert.equal(mags(0).mag(), 0);
  const base = mags(1);
  assert.ok(base.x < 0, 'repoussé à l’opposé du véhicule');
  assert.ok(Math.abs(mags(2.5).x - 2.5 * base.x) < 1e-9);
  const far = new s.Snake(400, 400, { length: 4 });
  assert.equal(far.headForces([newVehicle(s, 600, 400)], squarePath(s)).separate.mag(), 0);
});

test('séparation des anneaux : chaque anneau s’écarte d’un véhicule proche selon le poids', () => {
  const s = scene();
  const snake = new s.Snake(400, 400, { length: 6, separateWeight: 1.2 });
  const ring = snake.rings[2];
  const other = newVehicle(s, ring.pos.x + 3, ring.pos.y);
  const force = ring.separate([other]);
  assert.ok(force.x < 0 && force.mag() <= ring.maxForce + EPS);
  // dans step : avec poids zéro, l'anneau ne bouge que par arrive
  const run = weight => {
    const sn = new s.Snake(400, 400, { length: 6, separateWeight: weight, followWeight: 0 });
    const r = sn.rings[2];
    const o = newVehicle(s, r.pos.x + 3, r.pos.y);
    for (let i = 0; i < 40; i++) sn.step([o], squarePath(s));
    return r.pos.x;
  };
  assert.ok(Math.abs(run(0) - run(0)) < EPS);
  assert.notEqual(run(0), run(3));
});

test('anneaux : suivent la tête à « espacement » pixels, sans NaN, vitesse limitée', () => {
  const s = scene();
  const path = squarePath(s);
  const snake = new s.Snake(100, 100, { length: 14, size: 12, maxSpeed: 2.5 });
  for (let i = 0; i < 900; i++) {
    snake.step([], path);
    for (const part of snake.parts()) {
      assert.ok(Number.isFinite(part.pos.x) && Number.isFinite(part.pos.y));
      assert.ok(part.vel.mag() <= part.maxSpeed + EPS);
    }
  }
  let previous = snake.pos;
  for (const ring of snake.rings) {
    // arrive laisse un petit retard proportionnel à la vitesse du leader : on vérifie l'ordre de grandeur
    assert.ok(Math.abs(dist(ring.pos, previous) - snake.spacing) < 0.4 * snake.spacing, `espacement ${dist(ring.pos, previous)}`);
    previous = ring.pos;
  }
  assert.equal(snake.rings[0].pathMaxLength, 0);
  assert.equal(snake.rings[0].chase(snake, snake.spacing).mag() <= snake.rings[0].maxForce + EPS, true);
});

test('simulation : le serpent reste près du circuit pendant plusieurs tours', () => {
  const s = scene();
  const path = squarePath(s);
  const snake = new s.Snake(400, 400, { length: 12, size: 12, maxSpeed: 2.5 });
  // distance d'un point au carré (le circuit)
  const distToPath = p => {
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = path.points[i];
      const b = path.points[(i + 1) % 4];
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)));
      best = Math.min(best, Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))));
    }
    return best;
  };
  for (let i = 0; i < 600; i++) snake.step([], path); // rejoint la route
  let worst = 0;
  for (let i = 0; i < 2400; i++) {
    snake.step([], path);
    worst = Math.max(worst, distToPath(snake.pos));
    assert.ok(Number.isFinite(snake.pos.x));
  }
  assert.ok(worst < 60, `écart maximal au circuit : ${worst}`);
});

test('séparation : la tête et les anneaux évitent un véhicule posé sur le circuit', () => {
  const s = scene();
  const path = squarePath(s);
  const run = separateWeight => {
    const snake = new s.Snake(150, 100, { length: 10, size: 12, maxSpeed: 2.5, separateWeight });
    snake.vel.set(2.5, 0);
    const obstacle = newVehicle(s, 400, 100, 0.01, 0.01); // quasi immobile, au milieu de la route
    obstacle.followPathWeight = 0;
    obstacle.separateWeight = 0;
    let closest = Infinity;
    for (let i = 0; i < 400; i++) {
      snake.step([obstacle], path);
      for (const part of snake.parts()) closest = Math.min(closest, dist(part.pos, obstacle.pos) - part.r);
    }
    return closest;
  };
  const without = run(0);
  const withSep = run(3);
  assert.ok(withSep > without + 4, `avec séparation ${withSep} > sans ${without}`);
});

test('crowd : un serpent exclut ses propres parties ; les véhicules voient toutes les parties', () => {
  const s = scene();
  const a = new s.Snake(100, 100, { length: 5 });
  const b = new s.Snake(300, 300, { length: 7 });
  const v1 = newVehicle(s, 0, 0);
  const crowdA = s.Crowd.forSnake(a, [v1], [a, b]);
  assert.equal(crowdA.length, 1 + 8, 'véhicule + tête et 7 anneaux de b');
  assert.ok(!crowdA.some(part => a.parts().includes(part)));
  assert.ok(crowdA.includes(b) && b.rings.every(ring => crowdA.includes(ring)));
  const crowdV = s.Crowd.forVehicles([v1], [a, b]);
  assert.equal(crowdV.length, 1 + 6 + 8);
  assert.equal(s.Crowd.snakeParts([a, b]).length, 14);
  assert.equal(s.Crowd.snakeParts([], null).length, 0);
});

test('deux serpents ne se superposent pas : leurs parties se repoussent', () => {
  const s = scene();
  const path = squarePath(s);
  const group = new s.SnakeGroup(seededRandom(3));
  const settings = { followWeight: 2, separateWeight: 3 };
  const a = group.add(150, 100, settings);
  const b = group.add(150, 106, settings);
  for (const snake of [a, b]) { snake.setLength(8); snake.vel.set(2, 0); }
  const gap = () => Math.min(...a.parts().flatMap(p => b.parts().map(q => dist(p.pos, q.pos))));
  const before = gap();
  for (let i = 0; i < 120; i++) group.step([], path);
  assert.ok(gap() > before, `écart ${gap()} > ${before}`);
});

// ---------------------------------------------------------------- designs et touche t

test('designs : couleurs valides pour chaque motif, anneaux et tête', () => {
  const { SnakeSkins: sk } = scene();
  const css = /^(hsl\(\d{1,3}, \d{1,3}%, \d{1,3}%\)|#[0-9a-f]{6})$/;
  for (const pattern of sk.PATTERNS) {
    const skin = { ...sk.BASE, pattern, hue: 350 };
    for (let i = 1; i <= 12; i++) {
      const style = sk.ringStyle(skin, i, 12);
      assert.match(style.fill, css);
      assert.match(style.stroke, css);
      if (style.accent) assert.match(style.accent, css);
    }
    const head = sk.headStyle(skin);
    for (const color of [head.fill, head.stroke, head.accent]) assert.match(color, css);
  }
  assert.ok(sk.ringStyle({ ...sk.BASE, pattern: 'dots' }, 3, 9).accent, 'un point tous les 3 anneaux');
  assert.equal(sk.ringStyle({ ...sk.BASE, pattern: 'dots' }, 2, 9).accent, null);
  assert.notEqual(sk.ringStyle({ ...sk.BASE, pattern: 'bands' }, 1, 9).fill, sk.ringStyle({ ...sk.BASE, pattern: 'bands' }, 2, 9).fill);
  assert.notEqual(sk.ringStyle({ ...sk.BASE, pattern: 'gradient' }, 1, 9).fill, sk.ringStyle({ ...sk.BASE, pattern: 'gradient' }, 9, 9).fill);
  assert.equal(sk.hsl(-10, 50, 50), 'hsl(350, 50%, 50%)');
  assert.throws(() => sk.ringStyle({ ...sk.BASE, pattern: 'inconnu' }, 1, 5), { name: 'RangeError' });
});

test('touche t : designs originaux, toujours dans les limites, reproductibles', () => {
  const s = scene();
  const rng = seededRandom(99);
  const seen = new Set();
  const names = new Set();
  for (let i = 0; i < 200; i++) {
    const options = s.SnakeSkins.randomOptions(rng);
    const { length, size, speed } = s.SnakeSkins.RANGES;
    assert.ok(options.length >= length[0] && options.length <= length[1] && Number.isInteger(options.length));
    assert.ok(options.size >= size[0] && options.size <= size[1] && Number.isInteger(options.size));
    assert.ok(options.maxSpeed >= speed[0] && options.maxSpeed <= speed[1]);
    assert.ok(s.SnakeSkins.PATTERNS.includes(options.skin.pattern));
    assert.ok(s.SnakeSkins.HEADS.includes(options.skin.head));
    assert.ok(s.SnakeSkins.EYES.includes(options.skin.eye));
    assert.ok(options.skin.hue >= 0 && options.skin.hue < 360);
    seen.add(`${options.skin.pattern}|${options.skin.head}|${options.skin.eye}`);
    names.add(options.skin.name);
  }
  assert.ok(seen.size >= 30, `combinaisons de design : ${seen.size}`);
  assert.ok(names.size >= 20);
  assert.deepEqual(s.SnakeSkins.randomOptions(seededRandom(5)), s.SnakeSkins.randomOptions(seededRandom(5)));
  // valeurs extrêmes du générateur
  for (const value of [0, 0.999999]) {
    const options = s.SnakeSkins.randomOptions(() => value);
    assert.ok(options.length >= s.SnakeSkins.RANGES.length[0] && options.length <= s.SnakeSkins.RANGES.length[1]);
    assert.ok(s.SnakeSkins.PATTERNS.includes(options.skin.pattern));
  }
});

test('SnakeGroup : ajout avec les poids courants, plafond, poids communs, simulation', () => {
  const s = scene();
  const path = squarePath(s);
  const group = new s.SnakeGroup(seededRandom(8));
  const settings = { ...s.SnakeSettings.createSettings(), followWeight: 4, separateWeight: 0.6 };
  const first = group.add(100, 100, settings);
  assert.deepEqual([first.followPathWeight, first.separateWeight], [4, 0.6]);
  for (let i = 0; i < 20; i++) group.add(300 + i, 300, settings);
  assert.equal(group.snakes.length, s.SnakeGroup.MAX_SNAKES);
  assert.ok(!group.snakes.includes(first), 'le plus ancien est retiré au plafond');
  group.applySettings({ ...settings, followWeight: 0.5, separateWeight: 5 });
  assert.ok(group.snakes.every(snake => snake.followPathWeight === 0.5 && snake.separateWeight === 5));
  // simulation courte avec des véhicules : valeurs finies
  const vehicles = [newVehicle(s, 200, 200), newVehicle(s, 500, 400)];
  for (let i = 0; i < 300; i++) {
    const crowd = s.Crowd.forVehicles(vehicles, group.snakes);
    for (const v of vehicles) { v.applyBehaviors(crowd, path); v.update(); }
    group.step(vehicles, path);
    for (const snake of group.snakes) {
      for (const part of snake.parts()) assert.ok(Number.isFinite(part.pos.x) && Number.isFinite(part.pos.y));
    }
  }
});

test('langue : petit coup de langue périodique (temps en secondes)', () => {
  const s = scene();
  const snake = new s.Snake(0, 0, {});
  assert.ok(Math.abs(snake.tongueOut(s.Snake.TONGUE_FLICK / 2) - 1) < EPS);
  assert.equal(snake.tongueOut(s.Snake.TONGUE_PERIOD - 0.1), 0);
  assert.equal(snake.tongueOut(0), 0);
});

// ================================================================ circuit, décor, insectes, wander

// contexte 2D factice : enregistre les appels et les affectations
function recordingContext() {
  const calls = [];
  const gradient = { addColorStop() {} };
  return new Proxy({ calls }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
      return (...args) => { calls.push([prop, ...args]); };
    },
    set(target, prop, value) { calls.push([`set:${String(prop)}`, value]); return true; },
  });
}

const with_ = (s, overrides = {}) => ({ ...s.SnakeSettings.createSettings(), ...overrides });

test('limites : les valeurs aléatoires de la touche t restent dans des bornes fixes', () => {
  const s = scene();
  // bornes écrites en dur : si quelqu'un les élargit, ce test le signale
  assert.deepEqual(JSON.parse(JSON.stringify(s.SnakeSkins.RANGES)), { length: [8, 28], size: [9, 20], speed: [1.2, 3.2] });
  const P = s.SnakeSettings.PARAMETERS;
  assert.ok(P.snakeLength.min <= 8 && P.snakeLength.max >= 28);
  assert.ok(P.snakeSize.min <= 9 && P.snakeSize.max >= 20);
  assert.ok(P.snakeSpeed.min <= 1.2 && P.snakeSpeed.max >= 3.2);
  assert.ok(P.snakeLength.max <= s.Snake.MAX_RINGS);
});

test('réglages : choix, interrupteur et groupes cohérents', () => {
  const s = scene();
  const c = s.SnakeSettings;
  const settings = c.createSettings();
  assert.deepEqual([settings.shape, settings.theme, settings.snakePattern, settings.randomSizes], ['cercle', 'prairie', 'hasard', true]);
  for (const [name, labels] of Object.entries(c.CHOICES)) {
    for (const value of Object.keys(labels)) { c.setChoice(settings, name, value); assert.equal(settings[name], value); }
    assert.throws(() => c.setChoice(settings, name, 'inconnu'), { name: 'RangeError' });
  }
  assert.throws(() => c.setChoice(settings, 'inconnu', 'x'), { name: 'RangeError' });
  assert.throws(() => c.setToggle(settings, 'randomSizes', 'oui'), { name: 'TypeError' });
  assert.throws(() => c.setToggle(settings, 'inconnu', true), { name: 'RangeError' });
  // chaque curseur est transmis à exactement un module ; shape et theme au circuit
  const routed = Object.values(c.GROUPS).flat();
  for (const name of Object.keys(c.PARAMETERS)) assert.equal(routed.filter(n => n === name).length, 1, name);
  assert.ok(c.GROUPS.circuit.includes('shape') && c.GROUPS.circuit.includes('theme'));
  assert.equal(Object.keys(c.CHOICES.shape).sort().join(), Object.keys(s.Circuit.SHAPES).sort().join());
  assert.equal(Object.keys(c.CHOICES.theme).sort().join(), Object.keys(s.TrackScenery.THEMES).sort().join());
  // liaison d'une liste et de l'interrupteur
  const select = element({ children: [], appendChild(o) { this.children.push(o); } });
  let seen = null;
  c.bindChoice(select, 'theme', settings, name => { seen = name; }, (value, label) => ({ value, label }));
  assert.equal(select.children.length, Object.keys(c.CHOICES.theme).length);
  select.value = 'nuit';
  select.dispatchEvent({ type: 'change' });
  assert.equal(settings.theme, 'nuit');
  assert.equal(seen, 'theme');
  const box = element({ checked: false });
  c.bindToggle(box, 'randomSizes', settings);
  assert.equal(settings.randomSizes, false);
  box.checked = true;
  box.dispatchEvent({ type: 'change' });
  assert.equal(settings.randomSizes, true);
});

test('index.html : listes, interrupteur, bouton et sections du menu', () => {
  const s = scene();
  const html = read('index.html');
  for (const name of Object.keys(s.SnakeSettings.CHOICES)) assert.match(html, new RegExp(`<select id="snake-${name}"></select>`));
  assert.match(html, /<input id="snake-randomSizes" type="checkbox" checked>/);
  for (const id of ['new-circuit', 'debug-mode', 'menu-toggle', 'controls']) assert.match(html, new RegExp(`id="${id}"`));
  assert.ok((html.match(/<details class="section"/g) ?? []).length >= 5, 'sections repliables');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  for (const [, id] of read('sketch.js').matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.has(id), `#${id} manquant`);
});

// ---------------------------------------------------------------- circuit

test('circuit : un point par segment, dans la zone libre du canvas, à gauche du menu exclu', () => {
  const s = scene();
  for (const shape of Object.keys(s.Circuit.SHAPES)) {
    for (const roadWidth of [10, 45]) {
      const settings = with_(s, { shape, roadWidth, circuitSize: 100, circuitSegments: 40, circuitIrregularity: 1 });
      const built = s.Circuit.build(settings, 1200, 800);
      assert.equal(built.points.length, 40);
      assert.equal(built.radius, roadWidth);
      for (const p of built.points) {
        assert.ok(p.x >= s.Circuit.MENU_CLEARANCE + roadWidth - 1e-6 && p.x <= 1200 - s.Circuit.MENU_CLEARANCE - roadWidth + 1e-6, `${shape} x=${p.x}`);
        assert.ok(p.y >= s.Circuit.MARGIN + roadWidth - 1e-6 && p.y <= 800 - s.Circuit.MARGIN - roadWidth + 1e-6, `${shape} y=${p.y}`);
      }
    }
  }
  assert.throws(() => s.Circuit.build(with_(s, { shape: 'carre' }), 1200, 800), { name: 'RangeError' });
});

test('circuit : la boucle ne se croise jamais (toutes formes, graines, irrégularités, segments)', () => {
  const s = scene();
  const crossings = points => {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // segments voisins
        if (s.Circuit.segmentsCross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
      }
    }
    return false;
  };
  for (const shape of Object.keys(s.Circuit.SHAPES)) {
    for (const circuitSegments of [12, 30, 60]) {
      for (const circuitSeed of [0, 7, 123, 999]) {
        const built = s.Circuit.build(with_(s, { shape, circuitSegments, circuitSeed, circuitIrregularity: 1 }), 1200, 800);
        assert.equal(crossings(built.points), false, `${shape} ${circuitSegments} graine ${circuitSeed}`);
      }
    }
  }
  assert.equal(s.Circuit.segmentsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }), true);
  assert.equal(s.Circuit.segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }), false);
});

test('circuit : même graine = même circuit, graines différentes = circuits différents, taille proportionnelle', () => {
  const s = scene();
  const build = overrides => s.Circuit.build(with_(s, overrides), 1200, 800).points;
  const radiiOf = points => points.map(p => Math.hypot(p.x - 600, p.y - 400));
  assert.equal(JSON.stringify(build({ circuitSeed: 5 })), JSON.stringify(build({ circuitSeed: 5 })));
  assert.notEqual(JSON.stringify(build({ circuitSeed: 5 })), JSON.stringify(build({ circuitSeed: 6 })));
  // irrégularité zéro : un cercle parfait, quelle que soit la graine
  const round = radiiOf(build({ circuitIrregularity: 0, circuitSeed: 3 }));
  assert.ok(Math.max(...round) - Math.min(...round) < 1e-9);
  // taille : 50 % = la moitié de 100 %
  const big = radiiOf(build({ circuitIrregularity: 0, circuitSize: 100 }));
  const half = radiiOf(build({ circuitIrregularity: 0, circuitSize: 50 }));
  assert.ok(Math.abs(half[0] / big[0] - 0.5) < 1e-9);
  // l'irrégularité écarte vraiment les rayons
  const rough = radiiOf(build({ circuitIrregularity: 1, circuitSeed: 3 }));
  assert.ok(Math.max(...rough) - Math.min(...rough) > 10);
  // l'ovale est plus large que haut ; la forme choisie change le circuit
  const oval = build({ shape: 'ovale', circuitIrregularity: 0 });
  const span = key => Math.max(...oval.map(p => p[key])) - Math.min(...oval.map(p => p[key]));
  assert.ok(span('x') > 1.4 * span('y'));
  assert.notEqual(JSON.stringify(build({ shape: 'fleur' })), JSON.stringify(build({ shape: 'trefle' })));
  const rng = s.Circuit.seededRandom(9);
  assert.ok(Array.from({ length: 500 }, rng).every(v => v >= 0 && v < 1));
});

test('circuit : distance d’un point à la boucle', () => {
  const s = scene();
  const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  assert.equal(s.Circuit.distanceToPath(square, { x: 50, y: 0 }), 0);
  assert.equal(s.Circuit.distanceToPath(square, { x: 50, y: -7 }), 7);
  assert.equal(s.Circuit.distanceToPath(square, { x: 50, y: 40 }), 40);
  assert.ok(Math.abs(s.Circuit.distanceToPath(square, { x: 103, y: -4 }) - 5) < 1e-9, 'au-delà d’un sommet');
  assert.equal(s.Circuit.distanceToPath([{ x: 5, y: 5 }], { x: 8, y: 9 }), 5, 'un seul point');
});

// ---------------------------------------------------------------- décor

test('décor : jamais sur la route, dans le canvas, quantité selon la densité, reproductible', () => {
  const s = scene();
  const built = s.Circuit.build(with_(s, { shape: 'trefle', roadWidth: 30 }), 1200, 800);
  const ask = (density, seed = 4, theme = 'prairie') => s.TrackScenery.decorations({
    points: built.points, roadRadius: 30, width: 1200, height: 800, density,
    kinds: s.TrackScenery.THEMES[theme].decor, rng: s.Circuit.seededRandom(seed),
  });
  assert.equal(ask(0).length, 0);
  const some = ask(100);
  assert.ok(some.length > s.TrackScenery.MAX_DECOR * 0.6 && some.length <= s.TrackScenery.MAX_DECOR, `décors : ${some.length}`);
  assert.ok(ask(30).length < some.length);
  for (const d of some) {
    assert.ok(s.Circuit.distanceToPath(built.points, d) >= 30 + s.TrackScenery.CURB + d.size, 'pas sur la route ni la bordure');
    assert.ok(d.x >= d.size && d.x <= 1200 - d.size && d.y >= d.size && d.y <= 800 - d.size, 'dans le canvas');
    assert.ok(s.TrackScenery.THEMES.prairie.decor.includes(d.kind));
  }
  assert.equal(JSON.stringify(ask(60)), JSON.stringify(ask(60)));
  assert.notEqual(JSON.stringify(ask(60, 4)), JSON.stringify(ask(60, 5)));
  // route immense : le décor se raréfie au lieu de la recouvrir
  const wide = s.TrackScenery.decorations({ points: built.points, roadRadius: 600, width: 1200, height: 800, density: 100,
    kinds: ['rock'], rng: s.Circuit.seededRandom(1) });
  assert.equal(wide.length, 0);
});

test('décor : chaque thème se dessine (route, bordure, ligne, damier) ; thème inconnu refusé', () => {
  const s = scene();
  const built = s.Circuit.build(with_(s), 1200, 800);
  for (const theme of Object.keys(s.TrackScenery.THEMES)) {
    const ctx = recordingContext();
    s.TrackScenery.render(ctx, { width: 1200, height: 800, points: built.points, roadRadius: 20, theme, seed: 7, density: 100 });
    const widths = ctx.calls.filter(c => c[0] === 'set:lineWidth').map(c => c[1]);
    assert.ok(widths.includes(40), `${theme} : asphalte de largeur 2 × rayon`);
    assert.ok(widths.includes(40 + 2 * s.TrackScenery.CURB), `${theme} : bordure`);
    assert.ok(ctx.calls.filter(c => c[0] === 'fillRect').length > 300, `${theme} : grain du sol et damier`);
    assert.ok(ctx.calls.some(c => c[0] === 'stroke'));
  }
  assert.throws(() => s.TrackScenery.render(recordingContext(), { width: 10, height: 10, points: built.points, roadRadius: 5, theme: 'lune', seed: 1, density: 0 }), { name: 'RangeError' });
  const ctx = recordingContext();
  s.TrackScenery.drawCenterLine(ctx, built.points);
  assert.equal(ctx.calls.filter(c => c[0] === 'lineTo').length, built.points.length - 1);
});

// ---------------------------------------------------------------- insectes

test('insecte : espèces, marche au rythme de la distance parcourue, orientation', () => {
  const s = scene();
  assert.equal([...s.Insect.NAMES].sort().join(), 'abeille,coccinelle,fourmi,sauterelle,scarabee');
  assert.throws(() => new s.Insect(0, 0, 2, 0.3, 'licorne'), { name: 'RangeError' });
  const bug = new s.Insect(100, 100, 2, 0.3, 'fourmi');
  assert.equal(bug.label, 'Fourmi');
  bug.vel.set(0, 2);
  bug.update();
  assert.ok(Math.abs(bug.stride - 2 * s.Insect.STRIDE_PER_PIXEL) < EPS);
  assert.ok(Math.abs(bug.facing - Math.PI / 2) < EPS, 'regarde dans le sens du mouvement');
  assert.equal(bug.pos.y, 102, 'la locomotion est celle de Vehicle');
  bug.vel.set(0, 0);
  const stride = bug.stride;
  bug.update();
  assert.equal(bug.stride, stride, 'arrêté : les pattes ne bougent plus');
  assert.ok(Math.abs(bug.facing - Math.PI / 2) < EPS, 'garde son cap à l’arrêt');
  bug.stride = 1;
  assert.ok(Math.abs(bug.legSwing(0) + bug.legSwing(1)) < 1e-9, 'pattes de côtés opposés en opposition');
  assert.ok(Math.abs(bug.legSwing(0) - bug.legSwing(2)) > 0.01, 'les paires de pattes sont décalées');
  assert.equal(s.Insect.randomSpecies(() => 0), 'coccinelle');
  assert.equal(s.Insect.randomSpecies(() => 0.999999), 'sauterelle');
  assert.equal(bug.pathMaxLength, 0);
});

test('insecte : chaque espèce se dessine sans erreur, avec ombre et corps', () => {
  const s = scene();
  for (const species of s.Insect.NAMES) {
    for (const moving of [false, true]) {
      const bug = new s.Insect(50, 60, 2, 0.3, species);
      if (moving) { bug.vel.set(1, 1); bug.update(); }
      const ctx = recordingContext();
      bug.draw(ctx);
      const names = ctx.calls.map(c => c[0]);
      assert.ok(names.includes('ellipse') || names.includes('arc'), species);
      assert.ok(names.includes('translate') && names.includes('rotate') && names.includes('restore'));
      assert.equal(names.filter(n => n === 'save').length, names.filter(n => n === 'restore').length, `${species} : save/restore équilibrés`);
    }
  }
});

test('colonie : plafond, recyclage du plus ancien, curseur d’effectif et de taille', () => {
  const s = scene();
  const colony = new s.InsectColony(seededRandom(2));
  colony.resize(6, 1200, 800, 12);
  assert.equal(colony.insects.length, 6);
  assert.ok(colony.insects.every(i => i.regular && i.r === 12));
  const kept = colony.insects[0];
  colony.resize(9, 1200, 800, 12);
  assert.equal(colony.insects[0], kept, 'les insectes existants sont conservés');
  const special = colony.add(10, 10, { species: 'abeille', maxSpeed: 5 });
  assert.equal(special.regular, false);
  colony.resize(2, 1200, 800, 12);
  assert.equal(colony.regular.length, 2);
  assert.ok(colony.insects.includes(special), 'le curseur ne retire pas les insectes ajoutés à la main');
  colony.applySize(20);
  assert.ok(colony.regular.every(i => i.r === 20) && special.r === 12);
  colony.resize(0, 1200, 800, 12);
  assert.equal(colony.regular.length, 0);
  for (let i = 0; i < 100; i++) colony.add(i, i);
  assert.equal(colony.insects.length, s.InsectColony.MAX_INSECTS);
  colony.resize(1000, 1200, 800, 12);
  assert.ok(colony.insects.length <= s.InsectColony.MAX_INSECTS);
  // les vitesses restent dans la fourchette de l'espèce
  const fresh = new s.InsectColony(seededRandom(11));
  for (let i = 0; i < 200; i++) {
    const bug = fresh.add(0, 0);
    const [low, high] = s.Insect.SPECIES[bug.species].speed;
    assert.ok(bug.maxSpeed >= low && bug.maxSpeed <= high);
  }
});

test('insectes : suivent le chemin, évitent les serpents, simulation finie', () => {
  const s = scene();
  const path = squarePath(s);
  const colony = new s.InsectColony(seededRandom(5));
  colony.resize(8, 800, 800, 12);
  const group = new s.SnakeGroup(seededRandom(6), { w: 800, h: 800 });
  for (let i = 0; i < 3; i++) group.add(150 + i * 40, 100, with_(s));
  for (let i = 0; i < 600; i++) {
    const crowd = s.Crowd.forVehicles(colony.insects, group.snakes);
    for (const bug of colony.insects) { bug.applyBehaviors(crowd, path); bug.update(); }
    group.step(colony.insects, path);
    for (const bug of colony.insects) assert.ok(Number.isFinite(bug.pos.x) && Number.isFinite(bug.pos.y));
  }
  assert.ok(colony.insects.every(bug => bug.stride > 0));
});

// ---------------------------------------------------------------- wander et bornes

test('Steering.stayInside : poussée vers l’intérieur près de chaque bord, nulle au centre, limitée', () => {
  const { Steering, Vehicle } = scene();
  const at = (x, y, vx = 0, vy = 0) => {
    const v = new Vehicle(x, y, 3, 0.3);
    v.vel.set(vx, vy);
    return Steering.stayInside(v, 0, 0, 800, 600, 40);
  };
  assert.equal(at(400, 300).mag(), 0);
  // un véhicule qui fonce vers le bord est freiné puis renvoyé vers l'intérieur
  assert.ok(at(10, 300, -3, 0).x > 0 && at(790, 300, 3, 0).x < 0);
  assert.ok(at(400, 10, 0, -3).y > 0 && at(400, 590, 0, 3).y < 0);
  // déjà en train de repartir vers l'intérieur à pleine vitesse : rien à corriger
  assert.equal(at(10, 300, 3, 0).mag(), 0);
  assert.ok(at(10, 300).x > 0);
  assert.ok(at(790, 300).x < 0);
  assert.ok(at(400, 10).y > 0);
  assert.ok(at(400, 590).y < 0);
  const corner = at(10, 10);
  assert.ok(corner.x > 0 && corner.y > 0);
  for (const force of [at(10, 300), at(790, 590), corner]) assert.ok(force.mag() <= 0.3 + EPS);
});

test('wander : poids nul = aucune force ; sinon force de norme maxForce × poids vers le cercle', () => {
  const s = scene();
  const path = squarePath(s);
  const snake = new s.Snake(400, 400, { length: 4, maxForce: 0.3 });
  snake.vel.set(2.5, 0);
  assert.equal(snake.wanderWeight, 0, 'par défaut : pas d’errance');
  assert.equal(snake.headForces([], path).wander.mag(), 0);
  let calls = 0;
  const original = snake.wander.bind(snake);
  snake.wander = () => { calls++; return original(); };
  snake.headForces([], path);
  assert.equal(calls, 0, 'wander n’est pas calculé quand son poids est nul');
  for (const weight of [0.5, 1, 2.5]) {
    snake.wanderWeight = weight;
    const force = snake.headForces([], path).wander;
    assert.ok(Math.abs(force.mag() - 0.3 * weight) < 1e-9, `poids ${weight}`);
  }
  assert.ok(calls > 0);
  // le rayon et le poids viennent des options
  const custom = new s.Snake(0, 0, { wanderWeight: 1.5, wanderRadius: 80 });
  assert.equal([custom.wanderWeight, custom.wanderRadius, custom.displaceRange].join(), '1.5,80,0.3');
});

test('wander : la tête dévie du chemin droit, et reste dans le canvas grâce à stayInside', () => {
  const s = scene();
  const path = squarePath(s);
  const bounds = { w: 800, h: 800 };
  const options = { length: 10, size: 12, maxSpeed: 2.5, followWeight: 0, wanderWeight: 1.5, separateWeight: 1 };
  const snake = new s.Snake(400, 400, options);
  snake.vel.set(2.5, 0);
  const cells = new Set();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 6000; i++) {
    snake.step([], path, bounds);
    const { x, y } = snake.pos;
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    cells.add(`${Math.floor(x / 200)},${Math.floor(y / 200)}`);
  }
  assert.ok(minX > -60 && maxX < 860 && minY > -60 && maxY < 860, `sorti du canvas : ${minX} ${maxX} ${minY} ${maxY}`);
  assert.ok(cells.size >= 4, `zones visitées : ${cells.size}`);
  // sans garde-fou, le même serpent s'échappe
  const free = new s.Snake(400, 400, options);
  free.vel.set(2.5, 0);
  let farthest = 0;
  for (let i = 0; i < 6000; i++) {
    free.step([], path, null);
    farthest = Math.max(farthest, Math.abs(free.pos.x - 400), Math.abs(free.pos.y - 400));
  }
  assert.ok(farthest > 400, `sans bornes il part loin : ${farthest}`);
});

test('composition : follow + separate + wander s’additionnent avec leurs poids', () => {
  const s = scene();
  const path = squarePath(s);
  const other = newVehicle(s, 410, 400);
  const make = (f, sep, w) => {
    const snake = new s.Snake(400, 400, { length: 4, followWeight: f, separateWeight: sep, wanderWeight: w, maxForce: 0.3 });
    snake.vel.set(2.5, 0);
    snake.wanderTheta = 1;
    return snake;
  };
  const full = make(2, 1.2, 1).headForces([other], path);
  const total = full.follow.copy().add(full.separate).add(full.wander);
  const only = (name, weights) => make(...weights).headForces([other], path)[name];
  const expected = only('follow', [2, 0, 0]).add(only('separate', [0, 1.2, 0])).add(only('wander', [0, 0, 1]));
  assert.ok(Math.abs(total.x - expected.x) < 1e-9 && Math.abs(total.y - expected.y) < 1e-9);
  assert.ok(full.follow.mag() > 0 && full.separate.mag() > 0 && full.wander.mag() > 0, 'les trois forces agissent');
});

// ---------------------------------------------------------------- réglages des serpents

test('serpent : taille, longueur et vitesse réglables après coup', () => {
  const s = scene();
  const snake = new s.Snake(300, 300, { length: 10, size: 12, maxSpeed: 2 });
  const first = snake.rings[0];
  snake.configure({ size: 20 });
  assert.equal(snake.r, 20);
  assert.ok(Math.abs(snake.ringRadius(1) - 20 * 0.95) < EPS);
  assert.equal(snake.rings.length, 10, 'la longueur ne change pas');
  assert.ok(Math.abs(snake.rings[0].r - snake.ringRadius(1)) < EPS);
  snake.configure({ length: 25, maxSpeed: 3.5 });
  assert.equal(snake.rings.length, 25);
  assert.equal(snake.maxSpeed, 3.5);
  assert.equal(snake.rings[0], first);
  assert.ok(snake.rings.every(ring => ring.maxSpeed === Math.max(3, 3.5 * s.SnakeRing.SPEED_FACTOR)));
  snake.configure({ length: 500 });
  assert.equal(snake.rings.length, s.Snake.MAX_RINGS);
  snake.configure({});
  assert.equal(snake.rings.length, s.Snake.MAX_RINGS);
  const spacing = snake.spacing;
  snake.configure({ size: 10 });
  assert.ok(snake.spacing < spacing);
});

test('SnakeGroup : dimensions, motif imposé, interrupteur des tailles aléatoires, wander', () => {
  const s = scene();
  const group = new s.SnakeGroup(seededRandom(21), { w: 1200, h: 800 });
  const base = with_(s, { randomSizes: false, snakeSize: 18, snakeLength: 30, snakeSpeed: 3.3, snakePattern: 'bands', wanderWeight: 1.2, wanderRadius: 70 });
  const fixed = group.add(300, 300, base);
  assert.equal([fixed.r, fixed.rings.length, fixed.maxSpeed, fixed.skin.pattern].join(), '18,30,3.3,bands');
  assert.equal([fixed.wanderWeight, fixed.wanderRadius].join(), '1.2,70');
  for (let i = 0; i < 60; i++) {
    const random = group.add(300, 300, with_(s));
    const { length, size, speed } = s.SnakeSkins.RANGES;
    assert.ok(random.rings.length >= length[0] && random.rings.length <= length[1]);
    assert.ok(random.r >= size[0] && random.r <= size[1]);
    assert.ok(random.maxSpeed >= speed[0] && random.maxSpeed <= speed[1]);
  }
  assert.equal(group.snakes.length, s.SnakeGroup.MAX_SNAKES);
  // motifs : « hasard » varie, un motif choisi est toujours respecté
  const patterns = new Set();
  for (let i = 0; i < 40; i++) patterns.add(group.add(0, 0, with_(s, { snakePattern: 'hasard' })).skin.pattern);
  assert.ok(patterns.size >= 3);
  for (const pattern of s.SnakeSkins.PATTERNS) assert.equal(group.add(0, 0, with_(s, { snakePattern: pattern })).skin.pattern, pattern);
  // les curseurs règlent tous les serpents
  group.applyDimensions(with_(s, { snakeSize: 8, snakeLength: 12, snakeSpeed: 1.5 }));
  assert.ok(group.snakes.every(sn => sn.r === 8 && sn.rings.length === 12 && sn.maxSpeed === 1.5));
  group.applySettings(with_(s, { wanderWeight: 2, wanderRadius: 25, followWeight: 0.4, separateWeight: 3 }));
  assert.ok(group.snakes.every(sn => sn.wanderWeight === 2 && sn.wanderRadius === 25 && sn.followPathWeight === 0.4 && sn.separateWeight === 3));
  assert.equal(group.bounds.w, 1200);
  assert.equal(group.bounds.h, 800);
});

test('serpents : le corps se dessine (ombre, anneaux ovales, écailles, tête) pour chaque motif', () => {
  const s = scene();
  for (const pattern of s.SnakeSkins.PATTERNS) {
    for (const head of s.SnakeSkins.HEADS) {
      const snake = new s.Snake(100, 100, { length: 8, skin: { ...s.SnakeSkins.BASE, pattern, head, eye: head === 'horns' ? 'slit' : 'round' } });
      const ctx = recordingContext();
      snake.show(ctx, 0.1);
      const names = ctx.calls.map(c => c[0]);
      assert.ok(names.filter(n => n === 'ellipse').length >= 8, `${pattern}/${head} : un anneau ovale par anneau`);
      assert.equal(names.filter(n => n === 'save').length, names.filter(n => n === 'restore').length);
    }
  }
});

// ================================================================ obstacles, évitement, arène

// véhicule de test : cap et vitesse donnés, rayon 12 (zone d'évitement = r / 2 = 6)
function mover(s, x, y, vx, vy, maxSpeed = 3, maxForce = 0.3) {
  const v = new s.Vehicle(x, y, maxSpeed, maxForce);
  v.vel.set(vx, vy);
  return v;
}
const circle = (x, y, r) => ({ pos: new Vector(x, y), r });

// ---------------------------------------------------------------- évitement classique (6-ObstacleAvoidance)

test('avoid classique : rien sans obstacle ; force opposée à l’obstacle, limitée à maxForce', () => {
  const s = scene();
  const v = mover(s, 0, 0, 3, 0);
  assert.equal(s.Steering.avoid(v, []).mag(), 0);
  // obstacle devant, légèrement en dessous (y croît vers le bas) : on est poussé vers le haut et freiné
  const force = s.Steering.avoid(v, [circle(60, 5, 20)]);
  assert.ok(force.y < 0, `poussé à l’opposé de l’obstacle : ${force.y}`);
  assert.ok(force.x < 0, 'freiné');
  assert.ok(force.mag() <= 0.3 + EPS);
  // obstacle au-dessus : poussé vers le bas
  assert.ok(s.Steering.avoid(v, [circle(60, -5, 20)]).y > 0);
  // constantes de 6-ObstacleAvoidance
  assert.equal(s.Steering.AHEAD, 30);
  assert.equal(s.Steering.AHEAD2_RATIO, 0.5);
});

test('avoid classique : seuil de collision = r obstacle + zone + r véhicule (strict), les deux bouts de vecteur comptent', () => {
  const s = scene();
  const v = mover(s, 0, 0, 3, 0); // ahead = (90, 0), ahead2 = (45, 0) ; seuil = 20 + 6 + 12 = 38
  assert.ok(s.Steering.avoid(v, [circle(45, 37.5, 20)]).mag() > 0, 'juste dedans');
  assert.equal(s.Steering.avoid(v, [circle(45, 38.5, 20)]).mag(), 0, 'juste dehors');
  assert.equal(s.Steering.avoid(v, [circle(45, 38, 20)]).mag(), 0, 'seuil strict');
  // le bout le plus éloigné (ahead) suffit aussi
  assert.ok(s.Steering.avoid(v, [circle(90, 30, 20)]).mag() > 0);
  // la zone d'évitement peut être élargie
  assert.ok(s.Steering.avoid(v, [circle(45, 45, 20)], 20).mag() > 0);
  // véhicule immobile : les deux bouts sont sur lui ; il sort s'il est dans le cercle
  const still = mover(s, 100, 100, 0, 0);
  assert.equal(s.Steering.avoid(still, [circle(100, 160, 20)]).mag(), 0);
  assert.ok(s.Steering.avoid(still, [circle(110, 100, 20)]).x < 0);
});

test('avoid classique : l’obstacle le plus proche par le centre est celui qui compte', () => {
  const s = scene();
  const near = circle(80, 0, 5);
  const far = circle(30, 400, 5);
  assert.equal(s.Steering.nearestObstacle(new Vector(0, 0), [far, near]), near);
  assert.equal(s.Steering.nearestObstacle(new Vector(0, 0), []), undefined);
  // un grand obstacle plus loin (centre) n'est pas vu quand un petit est plus proche : limite de l'algorithme fourni
  const v = mover(s, 0, 0, 3, 0);
  assert.ok(s.Steering.avoid(v, [circle(250, 250, 300)]).mag() > 0, 'seul, le grand obstacle serait évité');
  assert.equal(s.Steering.avoid(v, [circle(45, 300, 5), circle(250, 250, 300)]).mag(), 0);
});

// ---------------------------------------------------------------- évitement multi-rayons

test('multi-rayons : éventail symétrique, rayons latéraux plus courts, longueur minimale', () => {
  const s = scene();
  const v = mover(s, 100, 100, 2, 0);
  const rays = s.Steering.castRays(v, [], { rays: 5, fan: 0.8 });
  assert.equal(rays.length, 5);
  assert.equal(JSON.stringify(rays.map(r => r.k)), '[-1,-0.5,0,0.5,1]');
  assert.ok(Math.abs(rays[0].offset + 0.8) < EPS && Math.abs(rays[4].offset - 0.8) < EPS);
  assert.ok(rays[2].length > rays[1].length && rays[1].length > rays[0].length);
  assert.ok(Math.abs(rays[2].length - 2 * s.Steering.AHEAD) < EPS, 'rayon central = vitesse × AHEAD');
  assert.ok(Math.abs(rays[0].length - rays[4].length) < EPS);
  assert.ok(rays.every(r => r.hit === null));
  assert.ok(Math.abs(Math.hypot(rays[2].end.x - 100, rays[2].end.y - 100) - rays[2].length) < 1e-9);
  // à l'arrêt : longueur minimale de 4 rayons du véhicule ; un seul rayon : tout droit
  const still = mover(s, 0, 0, 0, 0);
  assert.equal(s.Steering.castRays(still, [], { rays: 1 })[0].length, 4 * still.r);
  assert.equal(s.Steering.castRays(still, [], { rays: 1 }).length, 1);
  assert.equal(s.Steering.castRays(still, [], { rays: 0 }).length, 1, 'au moins un rayon');
});

test('multi-rayons : prédiction de la distance d’impact, rayon agrandi comme avoid', () => {
  const s = scene();
  const o = circle(200, 100, 10); // rayon agrandi : 10 + 6 + 12 = 28
  const slow = mover(s, 100, 100, 2, 0); // central : 60 px < 100 - 28 = 72
  assert.equal(s.Steering.castRays(slow, [o], { rays: 1 })[0].hit, null);
  const fast = mover(s, 100, 100, 4, 0, 4); // central : 120 px
  const hit = s.Steering.castRays(fast, [o], { rays: 1 })[0].hit;
  assert.ok(hit && Math.abs(hit.t - 72) < 1e-9, `t = ${hit && hit.t}`);
  assert.equal(hit.obstacle, o);
  assert.ok(Math.abs(hit.point.x - 172) < 1e-9 && Math.abs(hit.point.y - 100) < 1e-9);
  // obstacle derrière : jamais touché ; déjà dedans : t = 0 ; obstacle le plus proche gagne
  assert.equal(s.Steering.castRays(fast, [circle(0, 100, 10)], { rays: 1 })[0].hit, null);
  assert.equal(s.Steering.castRays(fast, [circle(105, 100, 10)], { rays: 1 })[0].hit.t, 0);
  const two = s.Steering.castRays(fast, [circle(220, 100, 10), o], { rays: 1 })[0].hit;
  assert.equal(two.obstacle, o);
  // un obstacle décalé n'est vu que par les rayons de l'éventail qui le croisent
  const side = s.Steering.castRays(fast, [circle(190, 150, 10)], { rays: 5, fan: 0.8 });
  assert.equal(side[2].hit, null);
  assert.ok(side.some(r => r.k > 0 && r.hit), 'les rayons du côté de l’obstacle le voient');
  assert.ok(side.filter(r => r.k < 0).every(r => r.hit === null));
});

test('multi-rayons : repousse à l’opposé de l’obstacle, pas de côté vers le côté dégagé, force limitée', () => {
  const s = scene();
  const config = { rays: 5, fan: 0.8 };
  const v = () => mover(s, 100, 100, 4, 0, 4, 0.5);
  assert.equal(s.Steering.avoidRays(v(), [], config).mag(), 0);
  assert.equal(s.Steering.avoidRays(v(), [circle(600, 100, 10)], config).mag(), 0, 'trop loin pour être prédit');
  // obstacle en dessous de l'axe : on est poussé vers le haut ; au-dessus : vers le bas
  const below = s.Steering.avoidRays(v(), [circle(190, 135, 10)], config);
  const above = s.Steering.avoidRays(v(), [circle(190, 65, 10)], config);
  assert.ok(below.y < 0 && above.y > 0, `${below.y} / ${above.y}`);
  assert.ok(below.mag() <= 0.5 + EPS && above.mag() <= 0.5 + EPS);
  // de face, pile sur l'axe : on ne fait pas que freiner, on se décale (le côté dégagé)
  const head = s.Steering.avoidRays(v(), [circle(200, 100, 10)], config);
  assert.ok(Math.abs(head.y) > 0.05, `pas de côté : ${head.y}`);
  // un petit obstacle sur le rayon extérieur d'un côté : l'autre côté est plus dégagé, on se décale vers lui
  const top = s.Steering.avoidRays(v(), [circle(200, 100, 10), circle(141.8, 57, 2)], config);
  const bottom = s.Steering.avoidRays(v(), [circle(200, 100, 10), circle(141.8, 143, 2)], config);
  assert.ok(top.y > 0, `obstacle en haut : on passe par le bas (${top.y})`);
  assert.ok(bottom.y < 0, `obstacle en bas : on passe par le haut (${bottom.y})`);
});

test('évitement choisi : configuration des réglages, aiguillage classique / rayons', () => {
  const s = scene();
  const settings = with_(s, { avoidMode: 'rayons', avoidRays: 7, avoidFan: 60 });
  const config = s.Steering.avoidConfig(settings);
  assert.equal(config.mode, 'rayons');
  assert.equal(config.rays, 7);
  assert.ok(Math.abs(config.fan - Math.PI / 3) < EPS);
  const v = mover(s, 100, 100, 4, 0, 4, 0.5);
  const o = [circle(190, 65, 10)];
  const classic = s.Steering.avoidWith(v, o, { mode: 'classique' });
  const same = s.Steering.avoid(v, o);
  assert.ok(Math.abs(classic.x - same.x) < EPS && Math.abs(classic.y - same.y) < EPS);
  assert.ok(Math.abs(s.Steering.avoidWith(v, o, null).y - same.y) < EPS, 'sans configuration : classique');
  const rays = s.Steering.avoidWith(v, o, config);
  const direct = s.Steering.avoidRays(v, o, config);
  assert.ok(Math.abs(rays.x - direct.x) < EPS && Math.abs(rays.y - direct.y) < EPS);
});

test('simulation : les deux algorithmes contournent un obstacle sans y entrer ; les rayons le dépassent', () => {
  const s = scene();
  const run = mode => {
    const v = mover(s, 100, 300, 2.5, 0, 2.5, 0.3);
    const obstacle = circle(400, 300, 40);
    const config = { mode, rays: 5, fan: 0.7 };
    let closest = Infinity;
    for (let i = 0; i < 900; i++) {
      v.applyForce(s.Steering.avoidWith(v, [obstacle], config));
      v.update();
      closest = Math.min(closest, Math.hypot(v.pos.x - 400, v.pos.y - 300));
      assert.ok(Number.isFinite(v.pos.x) && Number.isFinite(v.pos.y));
    }
    return { closest, x: v.pos.x };
  };
  const classic = run('classique');
  const rays = run('rayons');
  assert.ok(classic.closest > 40, `classique : ${classic.closest}`);
  assert.ok(rays.closest > 40, `rayons : ${rays.closest}`);
  assert.ok(rays.x > 450, `les rayons contournent et dépassent : x = ${rays.x}`);
});

// ---------------------------------------------------------------- obstacles

test('obstacle : types, cercles de collision, géométrie et rotation', () => {
  const s = scene();
  assert.ok(s.Obstacle.prototype instanceof s.Vehicle);
  assert.equal([...s.Obstacle.NAMES].sort().join(), 'buisson,etang,mur,rocher');
  assert.throws(() => new s.Obstacle(0, 0, 'volcan'), { name: 'RangeError' });
  const rock = new s.Obstacle(100, 50, 'rocher', 30);
  assert.equal(rock.colliders().length, 1);
  assert.equal(rock.colliders()[0].r, 30);
  assert.equal(rock.colliders()[0].pos.x, 100);
  assert.equal(new s.Obstacle(0, 0, 'etang', 20).colliders()[0].r, 30);
  assert.equal(new s.Obstacle(0, 0, 'buisson', 20).colliders().length, 3);
  // mur : une rangée de cercles alignés, espacés régulièrement, orientée par l'angle
  const wall = new s.Obstacle(200, 200, 'mur', 20, 0);
  const flat = wall.colliders();
  assert.equal(flat.length, s.Obstacle.WALL_CIRCLES);
  assert.ok(flat.every(c => Math.abs(c.pos.y - 200) < 1e-9 && c.r === 9));
  assert.ok(Math.abs(flat[1].pos.x - flat[0].pos.x - 17) < 1e-9);
  assert.ok(Math.abs((flat[0].pos.x + flat[4].pos.x) / 2 - 200) < 1e-9, 'centré');
  wall.angle = Math.PI / 2;
  const upright = wall.colliders();
  assert.ok(upright.every(c => Math.abs(c.pos.x - 200) < 1e-9));
  assert.ok(Math.abs(Math.abs(upright[4].pos.y - upright[0].pos.y) - 68) < 1e-9);
  // les cercles suivent la position et la taille
  wall.pos.set(10, 10);
  wall.size = 40;
  assert.ok(wall.colliders().every(c => c.r === 18 && Math.abs(c.pos.x - 10) < 1e-9));
  // l'étendue contient tous les cercles
  for (const type of s.Obstacle.NAMES) {
    const o = new s.Obstacle(0, 0, type, 25, 0.7);
    assert.ok(o.colliders().every(c => Math.hypot(c.pos.x, c.pos.y) + c.r <= o.extent + 1e-9), type);
  }
  assert.equal(s.Obstacle.randomType(() => 0), 'rocher');
  assert.equal(s.Obstacle.randomType(() => 0.999), 'mur');
  assert.equal(rock.vel.mag(), 0);
});

test('obstacle : chaque type se dessine (corps et debug) avec save/restore équilibrés', () => {
  const s = scene();
  for (const type of s.Obstacle.NAMES) {
    const o = new s.Obstacle(300, 200, type, 30, 0.4);
    const ctx = recordingContext();
    o.show(ctx, 1.3);
    o.showDebug(ctx);
    const names = ctx.calls.map(c => c[0]);
    assert.ok(names.includes('fill') && names.includes('translate') && names.includes('rotate'), type);
    assert.equal(names.filter(n => n === 'save').length, names.filter(n => n === 'restore').length, type);
    assert.equal(names.filter(n => n === 'arc').length >= o.colliders().length, true, `${type} : un cercle de debug par collider`);
  }
});

test('obstacles : plafond, effectif réglé, placement dégagé, taille, retrait au clic', () => {
  const s = scene();
  const field = new s.ObstacleField(seededRandom(4));
  field.resize(6, 1200, 800, 28, 'rocher', 100);
  assert.equal(field.obstacles.length, 6);
  assert.ok(field.obstacles.every(o => o.regular && o.type === 'rocher'));
  for (const o of field.obstacles) {
    assert.ok(o.pos.x >= 100 && o.pos.x <= 1100 && o.pos.y >= 100 && o.pos.y <= 700, 'à l’écart du bord');
  }
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      assert.ok(dist(field.obstacles[i].pos, field.obstacles[j].pos) > field.obstacles[i].extent + field.obstacles[j].extent, 'pas de chevauchement');
    }
  }
  const kept = field.obstacles[0];
  field.resize(9, 1200, 800, 28, 'hasard', 100);
  assert.equal(field.obstacles[0], kept, 'les obstacles existants sont conservés');
  const manual = field.add(50, 50, 'mur', 20);
  assert.equal(manual.regular, false);
  field.resize(2, 1200, 800, 28);
  assert.equal(field.regular.length, 2);
  assert.ok(field.obstacles.includes(manual), 'le curseur ne retire pas les obstacles posés à la main');
  field.applySize(40);
  assert.ok(field.regular.every(o => o.size === 40) && manual.size === 20);
  assert.equal(field.colliders().length, field.obstacles.reduce((n, o) => n + o.colliders().length, 0));
  // retrait : un clic dans un cercle retire l'obstacle ; ailleurs, rien
  assert.equal(field.removeAt(5000, 5000), false);
  // un clic dans un cercle mais pas au centre retire l'obstacle ; juste à côté, non (mur de taille 20 : cercles de rayon 9)
  const probe = new s.ObstacleField(seededRandom(1));
  const wall = probe.add(300, 300, 'mur', 20);
  wall.angle = 0;
  assert.equal(probe.removeAt(300, 300 + 12), false, 'hors de tous les cercles');
  assert.equal(probe.removeAt(300 + 5, 300 + 4), true, 'dans le cercle central, hors centre');
  assert.equal(probe.obstacles.length, 0);
  const before = field.obstacles.length;
  assert.equal(field.removeAt(manual.pos.x, manual.pos.y), true);
  assert.equal(field.obstacles.length, before - 1);
  assert.ok(!field.obstacles.includes(manual));
  // plafond : le plus ancien est retiré
  field.clear();
  assert.equal(field.obstacles.length, 0);
  for (let i = 0; i < 50; i++) field.add(i, i, 'hasard', 10);
  assert.equal(field.obstacles.length, s.ObstacleField.MAX_OBSTACLES);
  field.resize(1000, 1200, 800, 10);
  assert.ok(field.obstacles.length <= s.ObstacleField.MAX_OBSTACLES);
  field.resize(0, 1200, 800, 10);
  assert.equal(field.regular.length, 0);
});

// ---------------------------------------------------------------- intégration : serpents, insectes, arène

test('serpent : l’évitement est une force pondérée ; sans circuit, pas de force de suivi', () => {
  const s = scene();
  const snake = new s.Snake(100, 300, { length: 4, maxSpeed: 3, maxForce: 0.3, avoidWeight: 2 });
  snake.vel.set(3, 0);
  const wall = [circle(160, 305, 20)];
  const forces = snake.headForces([], null, { w: 1200, h: 800 }, wall);
  assert.equal(forces.follow.mag(), 0, 'path null : pas de suivi');
  assert.ok(forces.avoid.mag() > 0 && forces.avoid.mag() <= 0.3 * 2 + EPS);
  assert.ok(Math.abs(forces.avoid.mag() - 2 * s.Steering.avoid(snake, wall).mag()) < EPS);
  snake.avoidWeight = 0;
  assert.equal(snake.headForces([], null, null, wall).avoid.mag(), 0);
  assert.equal(snake.headForces([], null, null, []).avoid.mag(), 0);
  // l'algorithme choisi est celui de la configuration
  snake.avoidWeight = 1;
  snake.avoidConfig = { mode: 'rayons', rays: 5, fan: 0.7 };
  const rays = snake.headForces([], null, null, wall).avoid;
  const direct = s.Steering.avoidRays(snake, wall, snake.avoidConfig);
  assert.ok(Math.abs(rays.x - direct.x) < EPS && Math.abs(rays.y - direct.y) < EPS);
  assert.equal(s.Snake.AVOID_WEIGHT, 3, 'poids de 6-ObstacleAvoidance');
});

test('arène : serpents et insectes errent partout, restent dans le canvas et contournent les obstacles', () => {
  const s = scene();
  for (const mode of ['classique', 'rayons']) {
    const bounds = { w: 1200, h: 800 };
    const field = new s.ObstacleField(seededRandom(9));
    field.resize(6, 1200, 800, 28, 'hasard', 100);
    const config = { mode, rays: 5, fan: 0.7 };
    const group = new s.SnakeGroup(seededRandom(12), bounds);
    const settings = with_(s, { wanderWeight: 1, avoidMode: mode });
    for (let i = 0; i < 3; i++) group.add(200 + i * 300, 400, settings);
    const colony = new s.InsectColony(seededRandom(13));
    colony.resize(8, 1200, 800, 12);
    const cells = new Set();
    let deepest = 0;
    for (let i = 0; i < 2500; i++) {
      const circles = field.colliders();
      const crowd = s.Crowd.forVehicles(colony.insects, group.snakes);
      for (const bug of colony.insects) { bug.applyFree(crowd, circles, bounds, config); bug.update(); }
      group.step(colony.insects, null, circles);
      for (const sn of group.snakes) {
        const { x, y } = sn.pos;
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
        assert.ok(x > -40 && x < 1240 && y > -40 && y < 840, `${mode} : sorti de l’arène (${x}, ${y})`);
        cells.add(`${Math.floor(x / 300)},${Math.floor(y / 300)}`);
        for (const c of circles) deepest = Math.max(deepest, 1 - Math.hypot(x - c.pos.x, y - c.pos.y) / c.r);
      }
      for (const bug of colony.insects) assert.ok(Number.isFinite(bug.pos.x) && bug.pos.x > -40 && bug.pos.x < 1240 && bug.pos.y > -40 && bug.pos.y < 840);
    }
    assert.ok(cells.size >= 4, `${mode} : zones visitées ${cells.size}`);
    assert.ok(deepest < 0.6, `${mode} : une tête a pénétré un obstacle de ${Math.round(deepest * 100)} %`);
  }
});

test('insecte en arène : errance, évitement et bords (applyFree)', () => {
  const s = scene();
  const bug = new s.Insect(600, 400, 2, 0.3, 'fourmi');
  bug.vel.set(2, 0);
  bug.applyFree([], [], { w: 1200, h: 800 });
  assert.ok(bug.acc.mag() > 0, 'il erre même sans rien autour (FREE_WANDER)');
  const edge = new s.Insect(10, 400, 3, 0.3, 'fourmi');
  edge.vel.set(-3, 0);
  edge.applyFree([], [], { w: 1200, h: 800 });
  assert.ok(edge.acc.x > 0, 'repoussé vers l’intérieur près du bord gauche');
  const blocked = new s.Insect(100, 300, 3, 0.3, 'scarabee');
  blocked.vel.set(3, 0);
  const force = blocked.avoidForce([circle(150, 310, 20)]);
  assert.ok(force.mag() > 0 && force.mag() <= 0.3 * s.Insect.AVOID_WEIGHT + EPS);
  assert.equal(blocked.avoidForce([]).mag(), 0);
  assert.equal(s.Insect.AVOID_WEIGHT, 3);
  // le garde-fou est une force à part, utilisée aussi en mode circuit : nulle au centre, rentrante près des bords
  const mid = new s.Insect(600, 400, 3, 0.3, 'fourmi');
  assert.equal(mid.boundsForce({ w: 1200, h: 800 }).mag(), 0);
  const right = new s.Insect(1190, 400, 3, 0.3, 'fourmi');
  right.vel.set(3, 0);
  assert.ok(right.boundsForce({ w: 1200, h: 800 }).x < 0);
  assert.ok(right.boundsForce({ w: 1200, h: 800 }).mag() <= 0.3 * s.Insect.BOUNDS_WEIGHT + EPS);
  assert.ok(read('sketch.js').includes('v.boundsForce(bounds)'));
});

test('serpent : la tête et chaque anneau contournent les obstacles (même algorithme)', () => {
  const s = scene();
  for (const mode of ['classique', 'rayons']) {
    const snake = new s.Snake(300, 300, { length: 6, avoidConfig: { mode, rays: 5, fan: 0.7 } });
    const seen = [];
    const original = s.Steering.avoidWith;
    s.Steering.avoidWith = (agent, list, config) => { seen.push([agent, config.mode]); return original(agent, list, config); };
    try {
      snake.step([], null, null, [circle(900, 900, 10)]);
    } finally {
      s.Steering.avoidWith = original;
    }
    assert.equal(seen.length, 1 + 6, `${mode} : la tête et les 6 anneaux`);
    assert.ok(snake.parts().every(part => seen.some(([agent]) => agent === part)));
    assert.ok(seen.every(([, used]) => used === mode));
  }
});

test('arène : bordure et décor, sans route ; décor à l’écart de la bordure', () => {
  const s = scene();
  for (const theme of Object.keys(s.TrackScenery.THEMES)) {
    const ctx = recordingContext();
    s.TrackScenery.renderArena(ctx, { width: 1200, height: 800, theme, seed: 3, density: 100, inset: 24 });
    const widths = ctx.calls.filter(c => c[0] === 'set:lineWidth').map(c => c[1]);
    assert.ok(widths.includes(12), `${theme} : bordure`);
    assert.ok(!widths.includes(40), `${theme} : pas de route`);
    assert.ok(ctx.calls.filter(c => c[0] === 'fillRect').length > 300);
  }
  assert.throws(() => s.TrackScenery.renderArena(recordingContext(), { width: 10, height: 10, theme: 'lune', seed: 1, density: 0, inset: 5 }), { name: 'RangeError' });
  const outline = [{ x: 24, y: 24 }, { x: 1176, y: 24 }, { x: 1176, y: 776 }, { x: 24, y: 776 }];
  const decor = s.TrackScenery.decorations({ points: outline, roadRadius: 4, width: 1200, height: 800, density: 100,
    kinds: s.TrackScenery.THEMES.prairie.decor, rng: s.Circuit.seededRandom(2) });
  assert.ok(decor.length > 50);
  assert.ok(decor.every(d => s.Circuit.distanceToPath(outline, d) >= 4 + s.TrackScenery.CURB + d.size));
});

test('réglages : mode, obstacles, évitement et préréglages cohérents', () => {
  const s = scene();
  const c = s.SnakeSettings;
  const settings = c.createSettings();
  assert.equal([settings.mode, settings.avoidMode, settings.obstacleType, settings.clickObstacle].join(), 'circuit,classique,hasard,false');
  assert.equal(c.PARAMETERS.avoidWeight.initial, 3, 'comme dans 6-ObstacleAvoidance');
  // nombre de rayons : impair (un rayon central), de 3 à 9 par pas de 2
  const rays = c.PARAMETERS.avoidRays;
  assert.equal([rays.min, rays.max, rays.step].join(), '3,9,2');
  for (const value of [3, 5, 7, 9]) c.setParameter(settings, 'avoidRays', value);
  assert.throws(() => c.setParameter(settings, 'avoidRays', 11), { name: 'RangeError' });
  assert.equal(Object.keys(c.CHOICES.mode).join(), 'circuit,arene');
  assert.equal(Object.keys(c.CHOICES.avoidMode).join(), 'classique,rayons');
  assert.equal(Object.keys(c.CHOICES.obstacleType).sort().join(), ['hasard', ...s.Obstacle.NAMES].sort().join());
  // les préréglages de mode ne touchent que des curseurs existants, dans leurs plages
  for (const [mode, preset] of Object.entries(c.MODE_PRESETS)) {
    assert.ok(mode in c.CHOICES.mode);
    for (const [name, value] of Object.entries(preset)) c.setParameter({ ...settings }, name, value);
  }
  assert.equal(c.MODE_PRESETS.arene.wanderWeight > 0, true, 'en arène on erre');
  assert.equal(c.MODE_PRESETS.circuit.wanderWeight, 0);
  // chaque curseur est transmis à exactement un module
  const routed = Object.values(c.GROUPS).flat();
  for (const name of Object.keys(c.PARAMETERS)) assert.equal(routed.filter(n => n === name).length, 1, name);
  assert.equal(JSON.stringify(c.GROUPS.mode), '["mode"]');
  // groupe de comportements : les curseurs d'évitement agissent sur les serpents
  const group = new s.SnakeGroup(seededRandom(1), { w: 1200, h: 800 });
  group.add(300, 300, settings);
  group.applySettings({ ...settings, avoidMode: 'rayons', avoidRays: 7, avoidFan: 60, avoidWeight: 1.5 });
  const snake = group.snakes[0];
  assert.equal([snake.avoidWeight, snake.avoidConfig.mode, snake.avoidConfig.rays].join(), '1.5,rayons,7');
});

test('sketch.js : pose et retrait d’obstacles à la souris, touche o, bouton, arène', () => {
  const sketch = read('sketch.js');
  const html = read('index.html');
  assert.match(sketch, /function mousePressed\(event\)/);
  assert.match(sketch, /settings\.clickObstacle/);
  assert.match(sketch, /obstacles\.removeAt\(mouseX, mouseY\)/);
  assert.match(sketch, /key == "o"/);
  assert.match(sketch, /Steering\.avoidConfig\(settings\)/);
  assert.match(sketch, /applyFree\(/);
  assert.match(sketch, /renderArena\(/);
  // en mode « clic = obstacle », glisser ne crée pas d'insectes
  assert.match(sketch, /function mouseDragged\(event\) \{[^}]*settings\.clickObstacle\) return;/s);
  for (const id of ['clear-obstacles', 'snake-clickObstacle', 'snake-mode', 'snake-avoidMode', 'snake-obstacleType']) assert.match(html, new RegExp(`id="${id}"`));
  // les obstacles sont chargés avant les réglages qui les mentionnent
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  for (const [a, b] of [['obstacle.js', 'obstacleField.js'], ['obstacle.js', 'snakeSettings.js'], ['steering.js', 'snake.js'], ['obstacleField.js', 'sketch.js']]) {
    assert.ok(scripts.indexOf(a) >= 0 && scripts.indexOf(a) < scripts.indexOf(b), `${a} avant ${b}`);
  }
});

// ================================================================ boids (7-Boids) et essaims

// un voisin à une position donnée, avec une vitesse
const mate = (s, x, y, vx = 0, vy = 0, species = 'abeille') => {
  const insect = new s.Insect(x, y, 3, 0.3, species);
  insect.vel.set(vx, vy);
  return insect;
};

test('boids : alignement = vers la vitesse moyenne des voisins proches ; limité à maxForce ; rayon strict', () => {
  const s = scene();
  const me = mate(s, 100, 100, 0, 0);
  const near = [mate(s, 110, 100, 3, 0), mate(s, 100, 110, 3, 0)];
  const force = s.Steering.flockAlign(me, near, 25);
  assert.ok(force.x > 0 && Math.abs(force.y) < EPS, 'on s’aligne sur la direction du groupe');
  assert.ok(Math.abs(force.mag() - 0.3) < EPS, 'limité à maxForce');
  assert.equal(s.Steering.flockAlign(me, [], 25).mag(), 0, 'seul : rien');
  assert.equal(s.Steering.flockAlign(me, [me], 25).mag(), 0, 'on ne s’aligne pas sur soi-même');
  // seul un voisin à moins du rayon compte (strict)
  assert.equal(s.Steering.flockAlign(me, [mate(s, 125, 100, 3, 0)], 25).mag(), 0, 'exactement au rayon : hors perception');
  assert.ok(s.Steering.flockAlign(me, [mate(s, 124.9, 100, 3, 0)], 25).mag() > 0);
  // déjà à la vitesse du groupe : plus de force
  const aligned = mate(s, 100, 100, 3, 0);
  assert.ok(s.Steering.flockAlign(aligned, near, 25).mag() < EPS);
});

test('boids : cohésion vers le centre du groupe, sur un rayon DOUBLE comme dans 7-Boids', () => {
  const s = scene();
  const me = mate(s, 100, 100, 0, 0);
  const group = [mate(s, 140, 80), mate(s, 140, 120)];
  const force = s.Steering.flockCohesion(me, group, 25);
  assert.ok(force.x > 0 && Math.abs(force.y) < 1e-9, 'vers le centre du groupe');
  assert.ok(Math.abs(force.mag() - 0.3) < EPS);
  // à 40 px : hors du rayon 25 mais dans 2 × 25 pour la cohésion ; la séparation et l'alignement ne le voient pas
  assert.ok(s.Steering.flockCohesion(me, [mate(s, 140, 100)], 25).mag() > 0);
  assert.equal(s.Steering.flockAlign(me, [mate(s, 140, 100, 3, 0)], 25).mag(), 0);
  assert.equal(s.Steering.flockSeparation(me, [mate(s, 140, 100)], 25).mag(), 0);
  assert.equal(s.Steering.flockCohesion(me, [mate(s, 151, 100)], 25).mag(), 0, 'au-delà de 2 × rayon');
  assert.equal(s.Steering.flockCohesion(me, [], 25).mag(), 0);
});

test('boids : séparation = fuite pondérée par 1 / d² ; ignore une position identique', () => {
  const s = scene();
  const me = mate(s, 100, 100, 0, 0);
  const force = s.Steering.flockSeparation(me, [mate(s, 110, 100)], 25);
  assert.ok(force.x < 0 && Math.abs(force.y) < EPS, 'à l’opposé du voisin');
  assert.ok(Math.abs(force.mag() - 0.3) < EPS);
  // plusieurs voisins : on s'écarte de leur ensemble, le plus proche pèse plus
  const two = s.Steering.flockSeparation(me, [mate(s, 105, 100), mate(s, 100, 120)], 25);
  assert.ok(two.x < 0 && two.y < 0, 'repoussé à gauche (voisin de droite) et vers le haut (voisin du dessous)');
  assert.ok(Math.abs(two.x) > Math.abs(two.y));
  assert.equal(s.Steering.flockSeparation(me, [mate(s, 100, 100)], 25).mag(), 0, 'pas de division par zéro');
  assert.ok(Number.isFinite(s.Steering.flockSeparation(me, [mate(s, 100, 100), mate(s, 105, 100)], 25).x));
  assert.equal(s.Steering.flockSeparation(me, [mate(s, 130, 100)], 25).mag(), 0, 'hors du rayon');
});

test('insecte : l’essaim ne contient que des insectes de la même espèce, forces pondérées', () => {
  const s = scene();
  const me = mate(s, 100, 100, 1, 0, 'abeille');
  const bees = [mate(s, 112, 100, 3, 0, 'abeille'), mate(s, 100, 112, 3, 0, 'abeille')];
  const ants = [mate(s, 104, 100, -3, 0, 'fourmi')];
  const config = { alignWeight: 2, cohesionWeight: 1, separationWeight: 3, radius: 30 };
  const withAnts = me.flockForces([me, ...bees, ...ants], config);
  const withoutAnts = me.flockForces([me, ...bees], config);
  for (const name of ['align', 'cohesion', 'separation']) {
    assert.ok(Math.abs(withAnts[name].x - withoutAnts[name].x) < EPS && Math.abs(withAnts[name].y - withoutAnts[name].y) < EPS, `${name} ignore les fourmis`);
  }
  // les poids multiplient les forces
  const base = me.flockForces([me, ...bees], { ...config, alignWeight: 1 });
  assert.ok(Math.abs(withoutAnts.align.mag() - 2 * base.align.mag()) < 1e-9);
  const off = me.flockForces([me, ...bees], { alignWeight: 0, cohesionWeight: 0, separationWeight: 0, radius: 30 });
  assert.equal(off.align.mag() + off.cohesion.mag() + off.separation.mag(), 0);
  // applyFlock additionne les trois forces dans l'accélération
  me.applyFlock([me, ...bees], config);
  const sum = withoutAnts.align.copy().add(withoutAnts.cohesion).add(withoutAnts.separation);
  assert.ok(Math.abs(me.acc.x - sum.x) < 1e-9 && Math.abs(me.acc.y - sum.y) < 1e-9);
  // une espèce seule dans l'essaim : aucune force
  const lonely = mate(s, 100, 100, 1, 0, 'scarabee');
  assert.equal(lonely.flockForces([lonely, ...bees], config).cohesion.mag(), 0);
  assert.equal(s.Steering.flockConfig(with_(s, { flockAlign: 0.5, flockCohesion: 1.5, flockSeparation: 7, flockRadius: 33 })).radius, 33);
});

test('fuite : s’éloigne de la menace, force limitée, aucune force au-delà du rayon', () => {
  const s = scene();
  const me = mate(s, 100, 100, 0, 0);
  const away = s.Steering.flee(me, new Vector(110, 100), 80);
  assert.ok(away.x < 0 && Math.abs(away.y) < EPS && away.mag() <= 0.3 + EPS);
  assert.equal(s.Steering.flee(me, new Vector(180, 100), 80).mag(), 0, 'exactement au rayon : plus de fuite');
  assert.ok(s.Steering.flee(me, new Vector(179, 100), 80).mag() > 0);
  assert.ok(s.Steering.flee(me, new Vector(100, 100), 80).mag() > 0, 'sur la menace : direction de secours');
  // la vitesse désirée est inversée, pas la force de seek : déjà à pleine vitesse en fuite, plus de force
  me.vel.set(-3, 0);
  assert.ok(s.Steering.flee(me, new Vector(110, 100), 80).mag() < EPS);
});

test('peur : l’insecte fuit la tête de serpent la plus proche, seulement dans le rayon', () => {
  const s = scene();
  const bug = mate(s, 100, 100, 0, 0);
  const snakes = [new s.Snake(190, 100, {}), new s.Snake(100, 150, {})];
  const force = bug.scareForce(snakes, 90);
  assert.ok(force.y < 0 && Math.abs(force.y) > Math.abs(force.x), 'fuit le serpent du dessous, le plus proche');
  assert.ok(force.mag() <= 0.3 * s.Insect.SCARE_WEIGHT + EPS);
  assert.equal(bug.scareForce(snakes, 40).mag(), 0, 'trop loin pour avoir peur');
  assert.equal(bug.scareForce([], 90).mag(), 0, 'aucun serpent');
  assert.equal(bug.scareForce(snakes, 0).mag(), 0, 'rayon nul : pas de peur');
});

test('essaims : groupes de 3 insectes ou plus de même espèce, reliés de proche en proche', () => {
  const s = scene();
  const bee = (x, y) => mate(s, x, y, 0, 0, 'abeille');
  const chain = [bee(0, 0), bee(30, 0), bee(60, 0)]; // A-B et B-C reliés, A-C non
  const found = s.Swarms.detect(chain, 40);
  assert.equal(found.length, 1);
  assert.equal(found[0].members.length, 3);
  assert.equal(found[0].species, 'abeille');
  assert.ok(Math.abs(found[0].center.x - 30) < EPS);
  assert.ok(found[0].radius >= 30 + chain[0].r - EPS, 'le rayon contient tous les membres');
  assert.equal(s.Swarms.detect(chain, 25).length, 0, 'trop espacés : pas de lien');
  assert.equal(s.Swarms.detect([bee(0, 0), bee(10, 0)], 40).length, 0, 'deux insectes ne font pas un essaim');
  assert.equal(s.Swarms.MIN_SIZE, 3);
  // espèces séparées : trois abeilles et trois fourmis mélangées sur place font deux essaims
  const mixed = [bee(0, 0), bee(10, 0), bee(0, 10), mate(s, 5, 5, 0, 0, 'fourmi'), mate(s, 10, 10, 0, 0, 'fourmi'), mate(s, 0, 5, 0, 0, 'fourmi')];
  const two = s.Swarms.detect(mixed, 40);
  assert.equal(two.length, 2);
  assert.ok(two.every(sw => sw.members.every(m => m.species === sw.species)));
  // tri : le plus gros d'abord ; deux essaims distants de même espèce restent séparés
  const apart = [bee(0, 0), bee(10, 0), bee(0, 10), bee(500, 500), bee(510, 500), bee(500, 510), bee(505, 505)];
  const sorted = s.Swarms.detect(apart, 40);
  assert.deepEqual([sorted[0].members.length, sorted[1].members.length], [4, 3]);
  assert.equal(JSON.stringify(s.Swarms.stats(sorted)), JSON.stringify({ count: 2, largest: 4 }));
  assert.equal(JSON.stringify(s.Swarms.stats([])), JSON.stringify({ count: 0, largest: 0 }));
  assert.equal(s.Swarms.detect([], 40).length, 0);
});

test('essaims : halo et debug se dessinent, une couleur par espèce', () => {
  const s = scene();
  const group = [0, 12, 24].map(x => mate(s, 100 + x, 100, 0, 0, 'abeille'));
  const swarms = s.Swarms.detect(group, 40);
  for (const species of s.Insect.NAMES) assert.ok(s.Swarms.COLORS[species], species);
  const ctx = recordingContext();
  s.Swarms.draw(ctx, swarms);
  s.Swarms.drawDebug(ctx, swarms, 40);
  const names = ctx.calls.map(c => c[0]);
  assert.ok(names.includes('fill') && names.includes('stroke') && names.includes('fillText'));
  assert.equal(names.filter(n => n === 'save').length, names.filter(n => n === 'restore').length);
  const empty = recordingContext();
  s.Swarms.draw(empty, []);
  assert.equal(empty.calls.filter(c => c[0] === 'fill').length, 0);
});

test('simulation : les règles de boids rassemblent et alignent une espèce, la peur la disperse', () => {
  const s = scene();
  const run = ({ weights, scare = false, frames = 700 }) => {
    const rng = seededRandom(31);
    const bugs = Array.from({ length: 16 }, () => {
      const bug = new s.Insect(300 + rng() * 500, 200 + rng() * 400, 2.5, 0.3, 'abeille');
      const a = rng() * Math.PI * 2;
      bug.vel.set(Math.cos(a) * 2, Math.sin(a) * 2);
      return bug;
    });
    const config = { alignWeight: weights, cohesionWeight: weights, separationWeight: weights ? 3 : 0, radius: 60 };
    const snake = new s.Snake(550, 400, { length: 5 });
    for (let i = 0; i < frames; i++) {
      for (const bug of bugs) {
        bug.applyFlock(bugs, config);
        bug.applyForce(Steering_stayInside(s, bug));
        if (scare) bug.applyForce(bug.scareForce([snake], 120));
        bug.update();
        assert.ok(Number.isFinite(bug.pos.x) && Number.isFinite(bug.pos.y));
      }
    }
    const cx = bugs.reduce((n, b) => n + b.pos.x, 0) / bugs.length;
    const cy = bugs.reduce((n, b) => n + b.pos.y, 0) / bugs.length;
    const spread = bugs.reduce((n, b) => n + Math.hypot(b.pos.x - cx, b.pos.y - cy), 0) / bugs.length;
    const hx = bugs.reduce((n, b) => n + Math.cos(b.vel.heading()), 0) / bugs.length;
    const hy = bugs.reduce((n, b) => n + Math.sin(b.vel.heading()), 0) / bugs.length;
    return { spread, order: Math.hypot(hx, hy), swarms: s.Swarms.detect(bugs, 60).length, bugs };
  };
  const free = run({ weights: 0 });
  const flock = run({ weights: 1.5 });
  assert.ok(flock.spread < free.spread * 0.8, `cohésion : ${flock.spread} < ${free.spread}`);
  assert.ok(flock.order > free.order + 0.15, `alignement : ordre ${flock.order} > ${free.order}`);
  assert.ok(flock.swarms >= 1, 'au moins un essaim se forme');
  // la séparation empêche l'entassement : pas deux insectes au même endroit
  let closest = Infinity;
  for (let i = 0; i < flock.bugs.length; i++) {
    for (let j = i + 1; j < flock.bugs.length; j++) closest = Math.min(closest, dist(flock.bugs[i].pos, flock.bugs[j].pos));
  }
  assert.ok(closest > 2, `distance minimale entre insectes : ${closest}`);
});

// garde-fou de bords utilisé par la simulation ci-dessus
function Steering_stayInside(s, bug) {
  return s.Steering.stayInside(bug, 0, 0, 1200, 800, 40);
}

test('réglages : essaims, groupes et page cohérents', () => {
  const s = scene();
  const c = s.SnakeSettings;
  const settings = c.createSettings();
  assert.equal([settings.swarm, settings.flockAlign, settings.flockCohesion, settings.flockSeparation].join(), 'true,1.5,1,3');
  assert.equal(c.PARAMETERS.insectCount.initial, 20, 'assez d’insectes pour former des essaims');
  assert.equal(c.PARAMETERS.flockSeparation.max, 15, 'plages de 7-Boids');
  assert.ok('swarm' in c.TOGGLES);
  c.setToggle(settings, 'swarm', false);
  assert.equal(settings.swarm, false);
  assert.equal(c.GROUPS.flock.length, 5);
  const html = read('index.html');
  for (const id of ['snake-swarm', 'swarm-count', 'swarm-largest']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<input id="snake-swarm" type="checkbox" checked>/);
  const sketch = read('sketch.js');
  assert.ok(sketch.includes('Swarms.detect(colony.insects, 2 * settings.flockRadius)'), 'essaims liés à la portée de la cohésion');
  assert.match(sketch, /v\.applyFlock\(/);
  assert.match(sketch, /v\.scareForce\(/);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(scripts.indexOf('swarms.js') >= 0 && scripts.indexOf('swarms.js') < scripts.indexOf('sketch.js'));
});

// ================================================================ insectes calmes, plein écran

// virage moyen par image (radians) et vitesse, sur une simulation d'arène avec tout activé
function insectMotion(s, maxForce, frames = 900) {
  const bounds = { w: 1200, h: 800 };
  const field = new s.ObstacleField(seededRandom(9));
  field.resize(5, 1200, 800, 28, 'hasard', 100);
  const circles = field.colliders();
  const colony = new s.InsectColony(seededRandom(41));
  colony.resize(20, 1200, 800, 12);
  for (const bug of colony.insects) bug.maxForce = maxForce;
  const group = new s.SnakeGroup(seededRandom(7), bounds);
  group.add(600, 400, with_(s, { wanderWeight: 1 }));
  const config = { alignWeight: 1.5, cohesionWeight: 1, separationWeight: 3, radius: 40 };
  const avoid = { mode: 'classique', rays: 5, fan: 0.7 };
  let turn = 0, samples = 0, deepest = 0;
  const heading = new Map(colony.insects.map(b => [b, b.vel.heading()]));
  for (let i = 0; i < frames; i++) {
    const crowd = s.Crowd.forVehicles(colony.insects, group.snakes);
    for (const bug of colony.insects) {
      bug.applyFree(crowd, circles, bounds, avoid);
      bug.applyFlock(colony.insects, config);
      bug.applyForce(bug.scareForce(group.snakes, 90));
      bug.update();
      if (i > 100) {
        const next = bug.vel.heading();
        let d = Math.abs(next - heading.get(bug));
        if (d > Math.PI) d = 2 * Math.PI - d;
        turn += d;
        samples++;
        for (const c of circles) deepest = Math.max(deepest, 1 - Math.hypot(bug.pos.x - c.pos.x, bug.pos.y - c.pos.y) / (c.r + bug.r));
      }
      heading.set(bug, bug.vel.heading());
      assert.ok(Number.isFinite(bug.pos.x) && Number.isFinite(bug.pos.y));
      assert.ok(bug.pos.x > -60 && bug.pos.x < 1260 && bug.pos.y > -60 && bug.pos.y < 860, `sorti : ${bug.pos.x}, ${bug.pos.y}`);
    }
    group.step(colony.insects, null, circles);
  }
  return { turn: turn / samples, deepest };
}

test('insectes : force max basse et errance par petits pas symétriques', () => {
  const s = scene();
  assert.equal(s.InsectColony.MAX_FORCE, 0.1);
  assert.equal(s.Insect.WANDER_STEP, 0.1);
  const colony = new s.InsectColony(seededRandom(3));
  const bug = colony.add(10, 10);
  assert.equal(bug.maxForce, 0.1);
  assert.equal(bug.displaceRange, 0.1, 'toujours positif : le pas d’angle du wander est symétrique');
  for (let i = 0; i < 50; i++) assert.ok(new s.Insect(0, 0, 2, 0.1).displaceRange > 0);
  // l'évitement (pondéré) reste plus fort que l'errance : il peut encore dominer
  const wander = s.Insect.FREE_WANDER * s.InsectColony.MAX_FORCE;
  assert.ok(s.Insect.AVOID_WEIGHT * s.InsectColony.MAX_FORCE >= 5 * wander);
  assert.ok(s.Insect.SCARE_WEIGHT * s.InsectColony.MAX_FORCE > s.InsectColony.MAX_FORCE, 'la peur domine la cohésion');
});

test('insectes : trajectoires bien plus lisses qu’avec l’ancienne force (0.3), sans entrer dans les obstacles', () => {
  const s = scene();
  const calm = insectMotion(s, s.InsectColony.MAX_FORCE);
  const old = insectMotion(s, 0.3);
  assert.ok(calm.turn < old.turn * 0.55, `virage moyen par image : ${calm.turn.toFixed(3)} < ${(old.turn * 0.55).toFixed(3)} (ancien : ${old.turn.toFixed(3)})`);
  assert.ok(calm.turn < 0.06, `mouvement simple : ${calm.turn.toFixed(3)} rad par image`);
  assert.ok(calm.deepest < 0.6, `un insecte a pénétré un obstacle de ${Math.round(calm.deepest * 100)} %`);
});

// ---------------------------------------------------------------- plein écran

test('plein écran : canvas à la taille de la fenêtre, redessiné au redimensionnement, fond sans blanc', () => {
  const sketch = read('sketch.js');
  const css = read('style.css');
  assert.ok(sketch.includes('createCanvas(windowWidth, windowHeight)'));
  assert.ok(!/createCanvas\(\s*\d+\s*,\s*\d+\s*\)/.test(sketch), 'plus de taille fixe');
  assert.match(sketch, /function windowResized\(\) \{\s*resizeCanvas\(windowWidth, windowHeight\);/);
  assert.ok(sketch.includes('snakes.bounds = { w: width, h: height };'));
  assert.ok(/windowResized[\s\S]*?rebuildScenery\(\);/.test(sketch));
  assert.ok(sketch.includes('pixelDensity(Math.min(pixelDensity(), 2))'), 'densité de pixels plafonnée');
  // pas de bande blanche : la page prend la teinte du sol, sans barres de défilement
  const body = /html, body \{[^}]*\}/.exec(css)[0];
  assert.match(body, /overflow:\s*hidden/);
  assert.match(body, /height:\s*100%/);
  assert.match(body, /background:\s*#[0-9a-f]{6}/i);
});

test('plein écran : circuit centré et décor proportionnel à la surface', () => {
  const s = scene();
  for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440], [900, 700]]) {
    for (const shape of Object.keys(s.Circuit.SHAPES)) {
      const { points } = s.Circuit.build(with_(s, { shape, circuitSize: 100, roadWidth: 30, circuitIrregularity: 1 }), w, h);
      for (const p of points) {
        assert.ok(p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h, `${shape} ${w}x${h} : point hors écran (${p.x}, ${p.y})`);
      }
      const xs = points.map(p => p.x);
      assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - w / 2) < w * 0.15, `${shape} ${w}x${h} : circuit centré`);
    }
  }
  // le décor suit la surface : un grand écran n'est pas vide
  assert.equal(s.TrackScenery.areaScale(1200, 800), 1);
  assert.equal(s.TrackScenery.areaScale(2400, 1600), 4);
  assert.equal(s.TrackScenery.areaScale(100, 100), 0.5);
  assert.equal(s.TrackScenery.areaScale(9000, 9000), 4, 'plafonné');
  const decor = (w, h) => {
    const outline = [{ x: 24, y: 24 }, { x: w - 24, y: 24 }, { x: w - 24, y: h - 24 }, { x: 24, y: h - 24 }];
    return s.TrackScenery.decorations({ points: outline, roadRadius: 4, width: w, height: h, density: 100,
      kinds: s.TrackScenery.THEMES.prairie.decor, rng: s.Circuit.seededRandom(3) }).length;
  };
  assert.ok(decor(1920, 1080) > decor(1200, 800) * 1.4, 'plus de décor sur un écran plus grand');
  // le fond recouvre tout le canvas, quelle que soit sa taille
  const ctx = recordingContext();
  s.TrackScenery.renderArena(ctx, { width: 2560, height: 1440, theme: 'prairie', seed: 1, density: 60, inset: 24 });
  const fill = ctx.calls.find(c => c[0] === 'fillRect');
  assert.equal([fill[1], fill[2], fill[3], fill[4]].join(), '0,0,2560,1440');
});
