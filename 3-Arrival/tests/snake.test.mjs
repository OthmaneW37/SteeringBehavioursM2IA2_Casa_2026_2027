import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

// Adaptateur vectoriel minimal pour exercer le vrai vehicle.js sans navigateur.
class Vector {
  constructor(x = 0, y = 0) { this.set(x, y); }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy() { return new Vector(this.x, this.y); }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  setMag(n) { const m = this.mag(); return m ? this.mult(n / m) : this; }
  limit(n) { return this.mag() > n ? this.setMag(n) : this; }
  heading() { return Math.atan2(this.y, this.x); }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
}

// Aléatoire reproductible (générateur congruentiel linéaire)
function seededRandom(seed = 12345) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

const FILES = ['vehicle.js', 'steering.js', 'skins.js', 'snakeRing.js', 'food.js', 'snake.js', 'foodField.js',
  'snakeWander.js', 'mouseTarget.js', 'sparkle.js', 'letterDot.js', 'textMenu.js', 'debugOptions.js', 'snakeControls.js',
  'snakeWorld.js', 'scenarios.js', 'skinPicker.js', 'menuToggle.js'];

function scene() {
  const rand = seededRandom();
  const noop = () => {};
  const context = vm.createContext({
    createVector: (x, y) => new Vector(x, y), p5: { Vector },
    random: (a, b) => (b === undefined ? rand() * a : a + rand() * (b - a)),
    map: (v, a, b, c, d) => c + ((v - a) * (d - c)) / (b - a),
    cos: Math.cos, sin: Math.sin, push: noop, pop: noop,
    Event: class { constructor(type) { this.type = type; } },
  });
  for (const file of FILES) vm.runInContext(read(file), context, { filename: file });
  return Object.assign(vm.runInContext(`({ Vehicle, Steering, Skins, SnakeRing, Food, Snake, FoodField, MouseTarget,
    SnakeWander, Sparkle, LetterDot, TextMenu, DebugOptions, SnakeControls, SnakeWorld, Scenarios, SkinPicker, MenuToggle })`, context),
  { rand });
}

// petit élément factice : écouteurs, valeur, classes
function element(extra = {}) {
  const listeners = {};
  const classes = new Set();
  return Object.assign({
    value: '', checked: false, hidden: false, textContent: '', attributes: {}, children: [],
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    dispatchEvent: event => (listeners[event.type] ?? []).forEach(fn => fn(event)),
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(name, value) { this.attributes[name] = value; },
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), contains: name => classes.has(name) },
    listeners,
  }, extra);
}

// fausse police : boîtes et points réguliers, 4 points par caractère
const fakeFont = {
  textBounds: (label, x, y, size) => ({ x, y: y - size * 0.75, w: label.length * size * 0.5, h: size * 0.75 }),
  textToPoints: (label, x, y, size) => Array.from({ length: label.length * 4 }, (_, i) => ({ x: x + (i + 0.5) * size * 0.125, y: y - size * 0.375 })),
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const EPS = 1e-9;

function newWorld(s, overrides = {}, w = 800, h = 600) {
  const config = { ...s.SnakeControls.createSettings(), foodAuto: false, ...overrides };
  return new s.SnakeWorld({ config, width: w, height: h, rng: seededRandom(7) });
}

// ---------------------------------------------------------------- fichiers et interface

test('vehicle.js est identique à celui de la correction (fichier fourni non modifié)', () => {
  assert.equal(read('vehicle.js'), readFileSync(new URL('../../3-Arrival_correction/vehicle.js', import.meta.url), 'utf8'));
});

test('toute entité visible étend Vehicle', () => {
  const s = scene();
  for (const cls of [s.Snake, s.SnakeWander, s.SnakeRing, s.Food, s.MouseTarget, s.Sparkle, s.LetterDot]) {
    assert.ok(cls.prototype instanceof s.Vehicle, cls.name);
  }
});

test('index.html : curseurs, cases et listes identiques aux modules', () => {
  const s = scene();
  const html = read('index.html');
  for (const [name, p] of Object.entries(s.SnakeControls.PARAMETERS)) {
    const match = new RegExp(`<input id="snake-${name}" type="range" min="([^"]+)" max="([^"]+)" step="([^"]+)" value="([^"]+)">`).exec(html);
    assert.ok(match, `curseur snake-${name}`);
    assert.deepEqual(match.slice(1).map(Number), [p.min, p.max, p.step, p.initial], name);
    const output = new RegExp(`<output id="snake-${name}-value" for="snake-${name}">([^<]*)</output>`).exec(html);
    assert.equal(output?.[1], p.initial.toFixed(p.decimals), `affichage de ${name}`);
  }
  for (const [name, initial] of Object.entries(s.SnakeControls.TOGGLES)) {
    assert.match(html, new RegExp(`<input id="snake-${name}" type="checkbox"${initial ? ' checked' : ''}>`));
  }
  for (const name of Object.keys(s.SnakeControls.CHOICES)) assert.match(html, new RegExp(`<select id="snake-${name}"`));
  for (const name of Object.keys(s.DebugOptions.LAYERS)) assert.match(html, new RegExp(`<input id="debug-${name}" type="checkbox">`));
});

test('sketch.js : identifiants présents dans index.html, scripts chargés dans l’ordre des dépendances', () => {
  const s = scene();
  const html = read('index.html');
  const sketch = read('sketch.js');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  for (const [, id] of sketch.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.has(id), `#${id} manquant`);
  for (const id of ['controls', 'scene', 'menu-toggle']) assert.ok(ids.has(id));
  const names = [...Object.keys(s.SnakeControls.PARAMETERS), ...Object.keys(s.SnakeControls.TOGGLES), ...Object.keys(s.SnakeControls.CHOICES)];
  for (const name of names) assert.ok(ids.has(`snake-${name}`), `snake-${name}`);
  for (const name of Object.keys(s.DebugOptions.LAYERS)) assert.ok(ids.has(`debug-${name}`), `debug-${name}`);

  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(src => !src.startsWith('libraries/'));
  assert.equal(scripts.at(-1), 'sketch.js');
  const local = readdirSync(new URL('..', import.meta.url)).filter(f => f.endsWith('.js'));
  for (const file of local) assert.ok(scripts.includes(file), `${file} n'est pas chargé`);
  // une classe parente est chargée avant ses sous-classes ; Skins avant SnakeControls (utilisé au chargement)
  const definedIn = {};
  for (const file of scripts) for (const [, name] of read(file).matchAll(/^(?:class|const) (\w+)/gm)) definedIn[name] = file;
  for (const file of scripts) {
    for (const [, child, parent] of read(file).matchAll(/class (\w+) extends (\w+)/g)) {
      assert.ok(scripts.indexOf(definedIn[parent]) <= scripts.indexOf(file), `${parent} avant ${child}`);
    }
  }
  assert.ok(scripts.indexOf('skins.js') < scripts.indexOf('snakeControls.js'));
});

test('réglages : validation des plages, curseur lié et formaté', () => {
  const { SnakeControls: c } = scene();
  const settings = c.createSettings();
  for (const [name, p] of Object.entries(c.PARAMETERS)) {
    assert.equal(settings[name], p.initial);
    assert.throws(() => c.setParameter(settings, name, p.max + p.step), { name: 'RangeError' });
    assert.throws(() => c.setParameter(settings, name, p.min - p.step), { name: 'RangeError' });
    assert.throws(() => c.setParameter(settings, name, NaN), { name: 'RangeError' });
  }
  assert.throws(() => c.setParameter(settings, 'inconnu', 1), { name: 'RangeError' });
  assert.throws(() => c.setChoice(settings, 'formation', 'cercle'), { name: 'RangeError' });
  assert.throws(() => c.setToggle(settings, 'foodAuto', 'oui'), { name: 'TypeError' });
  const input = element({ value: '0.5' });
  const output = element();
  let changes = 0;
  c.bindSlider(input, output, 'force', settings, () => changes++);
  assert.equal(output.value, '0.50');
  input.value = '1.25';
  input.dispatchEvent({ type: 'input' });
  assert.equal(settings.force, 1.25);
  assert.equal(changes, 2);
});

test('DebugOptions : un calque n’est visible que si le debug est actif', () => {
  const { DebugOptions: d } = scene();
  const options = d.create();
  assert.equal(d.visible(options, 'braking'), false);
  const master = element();
  const layers = { braking: element(), rings: element() };
  let changes = 0;
  const controls = d.bind(options, master, layers, () => changes++);
  controls.toggle();
  assert.equal(master.checked, true);
  assert.equal(d.visible(options, 'braking'), true);
  assert.equal(d.visible(options, 'rings'), false);
  layers.rings.checked = true;
  layers.rings.dispatchEvent({ type: 'change' });
  assert.equal(d.visible(options, 'rings'), true);
  master.checked = false;
  master.dispatchEvent({ type: 'change' });
  assert.equal(d.visible(options, 'rings'), false);
  assert.equal(changes, 3);
  assert.throws(() => d.setLayer(options, 'inconnu', true), { name: 'RangeError' });
});

test('MenuToggle et SkinPicker : bascule du menu, galerie liée au menu déroulant', () => {
  const s = scene();
  const button = element();
  const panel = element();
  let hiddenSeen = null;
  const toggle = s.MenuToggle.bind(button, panel, hidden => { hiddenSeen = hidden; });
  button.dispatchEvent({ type: 'click' });
  assert.equal(panel.hidden, true);
  assert.equal(hiddenSeen, true);
  assert.equal(button.textContent, s.MenuToggle.LABEL_HIDDEN);
  toggle.toggle();
  assert.equal(panel.hidden, false);

  const container = element();
  const select = element({ value: 'jade' });
  let changes = 0;
  select.addEventListener('change', () => changes++);
  const picker = s.SkinPicker.bind(container, select, () => element());
  assert.equal(container.children.length, s.Skins.LIST.length);
  assert.ok(picker.buttons.get('jade').classList.contains('active'));
  picker.buttons.get('galaxie').dispatchEvent({ type: 'click' });
  assert.equal(select.value, 'galaxie');
  assert.equal(changes, 1);
  assert.ok(picker.buttons.get('galaxie').classList.contains('active'));
  assert.ok(!picker.buttons.get('jade').classList.contains('active'));
});

// ---------------------------------------------------------------- designs SVG

test('Skins : SVG des têtes, icônes et nourritures ; couleurs des anneaux', () => {
  const { Skins } = scene();
  const ids = new Set();
  for (const skin of Skins.LIST) {
    assert.ok(!ids.has(skin.id));
    ids.add(skin.id);
    const svg = Skins.headSvg(skin);
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="100" height="100" viewBox="0 0 100 100">/);
    assert.match(svg, /<\/svg>$/);
    assert.ok(svg.includes(skin.head[0]) && svg.includes(skin.eye));
    assert.equal((svg.match(/<g/g) ?? []).length, (svg.match(/<\/g>/g) ?? []).length);
    if (skin.icon) assert.match(Skins.iconSvg(skin.icon, skin.iconColor), /viewBox="0 0 24 24"/);
  }
  for (const kind of Skins.FOOD_KINDS) assert.match(Skins.foodSvg(kind), /width="64"/);
  assert.throws(() => Skins.iconSvg('licorne', '#ffffff'), { name: 'RangeError' });
  assert.throws(() => Skins.foodSvg('pizza'), { name: 'RangeError' });
  assert.ok(Skins.dataUrl('<svg/>').startsWith('data:image/svg+xml;charset=utf-8,%3Csvg'));

  assert.equal(Skins.mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(Skins.mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(Skins.mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(Skins.mix('#000000', '#ffffff', 7), '#ffffff');
  assert.throws(() => Skins.mix('rouge', '#ffffff', 0.5), { name: 'RangeError' });

  const jade = Skins.find('jade');
  assert.equal(Skins.ringColors(jade, 1, 10).fill, jade.body[0]);
  assert.equal(Skins.ringColors(jade, 10, 10).fill, jade.body[1]);
  const corail = Skins.find('corail');
  assert.equal(Skins.ringColors(corail, 1, 10).fill, corail.bands[0]);
  assert.equal(Skins.ringColors(corail, 5, 10).fill, corail.bands[0]);
  assert.equal(Skins.forIndex('bonbon', 1).id, Skins.LIST[0].id);
  assert.equal(Skins.forIndex('jade', 0).id, 'jade');
  const made = [];
  const images = Skins.buildImages((url, size) => { made.push(url); return { url, size }; });
  assert.equal(images.heads.jade.size, Skins.RASTER.head);
  assert.equal(Object.keys(images.heads).length, Skins.LIST.length + 1, 'les designs + la vipère adverse');
  assert.ok(images.heads.vipere && images.icons.vipere);
  assert.equal(Object.keys(images.icons).length, Skins.LIST.filter(skin => skin.icon).length + 1);
  assert.ok(!Skins.LIST.includes(Skins.ADVERSARY), 'la vipère n’est pas proposée dans la galerie');
  assert.equal(Skins.find('vipere'), Skins.ADVERSARY);
  assert.match(Skins.headSvg(Skins.ADVERSARY), /#ff3b3b/);
  assert.equal(Object.keys(images.food).length, Skins.FOOD_KINDS.length);
  assert.ok(made.every(url => url.startsWith('data:image/svg+xml')));
  assert.equal(Skins.rgba('#ff8000', 0.5), 'rgba(255, 128, 0, 0.5)');
  // pré-rastérisation : rien n'est dessinable avant le chargement, puis c'est le canvas qui l'est
  const drawn = [];
  let fakeImage;
  const factory = Skins.spriteFactory(() => (fakeImage = {}), (w, h) => ({ width: w, height: h,
    getContext: () => ({ drawImage: (img, x, y, dw, dh) => drawn.push([img, dw, dh]) }) }));
  const sprite = factory('data:image/svg+xml,x', 96);
  assert.equal(fakeImage.src, 'data:image/svg+xml,x');
  const ctx = { calls: 0, last: null, drawImage(img) { this.calls++; this.last = img; } };
  assert.equal(Skins.drawCentered(ctx, sprite, 10), false);
  fakeImage.onload();
  assert.deepEqual(drawn.map(([, w, h]) => [w, h]), [[96, 96]]);
  assert.equal(drawn[0][0], fakeImage);
  assert.equal(Skins.drawCentered(ctx, sprite, 10), true);
  assert.equal(ctx.last, sprite.canvas, 'on dessine la copie bitmap, pas le SVG');
  ctx.calls = 0;
  assert.equal(Skins.drawCentered(ctx, { complete: false, naturalWidth: 0 }, 10), false);
  assert.equal(Skins.drawCentered(ctx, { complete: true, naturalWidth: 100 }, 10), true);
  assert.equal(ctx.calls, 1);
});

// ---------------------------------------------------------------- pilotage partagé

test('Steering.flee : s’éloigne, force limitée, rien au-delà du rayon', () => {
  const { Vehicle, Steering } = scene();
  const v = new Vehicle(100, 100);
  const away = Steering.flee(v, new Vector(110, 100), 50);
  assert.ok(away.x < 0);
  assert.ok(away.mag() <= v.maxForce + EPS);
  assert.equal(Steering.flee(v, new Vector(160, 100), 50).mag(), 0);
  assert.ok(Steering.flee(v, new Vector(100, 100), 50).mag() > 0);
  // la vitesse désirée est inversée, pas la force de seek : à pleine vitesse en fuite, plus de force
  v.vel.set(-v.maxSpeed, 0);
  assert.ok(Steering.flee(v, new Vector(110, 100), 50).mag() < EPS);
});

test('Steering.stayInside : force vers l’intérieur près de chaque bord, nulle au centre', () => {
  const { Vehicle, Steering } = scene();
  const at = (x, y) => Steering.stayInside(new Vehicle(x, y), 0, 0, 800, 600, 50);
  assert.equal(at(400, 300).mag(), 0);
  assert.ok(at(10, 300).x > 0);
  assert.ok(at(790, 300).x < 0);
  assert.ok(at(400, 10).y > 0);
  assert.ok(at(400, 590).y < 0);
  const corner = at(10, 10);
  assert.ok(corner.x > 0 && corner.y > 0);
  for (const force of [at(10, 300), corner]) assert.ok(force.mag() <= 0.2 + EPS);
});

test('Steering.separation : s’écarte des voisins dans le rayon seulement', () => {
  const { Vehicle, Steering } = scene();
  const a = new Vehicle(100, 100);
  const near = new Vehicle(110, 100);
  const far = new Vehicle(400, 100);
  const force = Steering.separation(a, [a, near, far], 50);
  assert.ok(force.x < 0 && Math.abs(force.y) < EPS);
  assert.ok(force.mag() <= a.maxForce + EPS);
  assert.equal(Steering.separation(a, [a, far], 50).mag(), 0);
});

// ---------------------------------------------------------------- serpent

test('tête : arrive limitée à maxForce, pleine vitesse au loin puis arrêt sur la cible', () => {
  const { Snake, Skins } = scene();
  const snake = new Snake(100, 300, Skins.LIST[0], { speed: 6, force: 0.35, braking: 120, length: 5 });
  const target = new Vector(600, 300);
  const first = snake.steerTo(target);
  assert.ok(first.x > 0 && Math.abs(first.y) < EPS);
  assert.ok(Math.abs(first.mag() - 0.35) < EPS);
  let maxSeen = 0;
  for (let i = 0; i < 600; i++) {
    snake.applyForce(snake.steerTo(target));
    snake.update(1 / 60);
    maxSeen = Math.max(maxSeen, snake.vel.mag());
  }
  assert.ok(Math.abs(maxSeen - 6) < 1e-6, 'pleine vitesse hors du rayon de freinage');
  assert.ok(dist(snake.pos, target) < 2, 'arrivée sur la cible');
  assert.ok(snake.vel.mag() < 0.2, 'presque arrêtée');
  assert.ok(Math.abs(snake.facing) < 0.05, 'regarde dans le sens du mouvement');
  const mouth = snake.mouth();
  assert.ok(mouth.x > snake.pos.x && Math.abs(mouth.y - snake.pos.y) < 1);
});

test('anneaux : chacun suit le précédent à « espacement » pixels, recule s’il est trop près', () => {
  const { Snake, SnakeRing, Skins } = scene();
  const spacing = 14;
  const snake = new Snake(100, 300, Skins.LIST[0], { spacing, length: 12 });
  const targets = [new Vector(600, 300), new Vector(400, 100), new Vector(300, 450)];
  for (const target of targets) {
    for (let i = 0; i < 300; i++) {
      snake.applyForce(snake.steerTo(target));
      snake.update(1 / 60);
      for (const ring of snake.rings) assert.ok(Number.isFinite(ring.pos.x) && Number.isFinite(ring.pos.y));
    }
  }
  let previous = snake.pos;
  for (const ring of snake.rings) {
    assert.ok(Math.abs(dist(ring.pos, previous) - spacing) < 1.5, `espacement ${dist(ring.pos, previous)}`);
    previous = ring.pos;
  }
  const ring = new SnakeRing(100, 100);
  ring.tune(6, spacing);
  const back = ring.follow(new Vector(105, 100), spacing);
  assert.ok(back.x < 0, 'trop près : la vitesse désirée est négative');
  assert.ok(back.mag() <= ring.maxForce + EPS);
  assert.ok(ring.follow(new Vector(300, 100), spacing).x > 0);
  ring.tune(10, spacing);
  assert.equal(ring.maxSpeed, 18);
});

test('longueur : bornes, anneaux ajoutés à la queue, affinement et bosse d’avalement', () => {
  const { Snake, Skins } = scene();
  const snake = new Snake(300, 300, Skins.LIST[0], { length: 10 });
  assert.equal(snake.length, 10);
  snake.setLength(1000);
  assert.equal(snake.length, Snake.MAX_RINGS);
  snake.setLength(-4);
  assert.equal(snake.length, Snake.MIN_RINGS);
  snake.setLength(10);
  const kept = snake.rings[0];
  snake.grow(3);
  assert.equal(snake.length, 13);
  assert.equal(snake.rings[0], kept);
  assert.ok(dist(snake.rings[12].pos, snake.rings[11].pos) > 0);
  for (let i = 2; i <= snake.length; i++) assert.ok(snake.ringDiameter(i) < snake.ringDiameter(i - 1));
  const plain = snake.ringDiameter(5);
  snake.bulges.push({ at: 5, grow: 0 });
  assert.ok(snake.ringDiameter(5) > plain * 1.5);
  const style = snake.ringStyle(4, { icons: { jade: 'icone' } });
  assert.equal(style.icon, 'icone');
  assert.equal(snake.ringStyle(5, { icons: { jade: 'icone' } }).icon, null);
});

test('manger : la bosse descend puis fait grandir à la queue ; champignon rétrécit ; piment = turbo en secondes', () => {
  const { Snake, Skins } = scene();
  const dt = 0.05;
  const snake = new Snake(300, 300, Skins.LIST[0], { length: 5, speed: 6 });
  assert.throws(() => snake.eat('pizza'), { name: 'RangeError' });
  snake.eat('etoile');
  for (let i = 0; i < 6; i++) snake.update(dt); // bosse à 4.8 anneaux
  assert.equal(snake.length, 5);
  snake.update(dt); // 5.6 > 5 : arrivée à la queue
  assert.equal(snake.length, 8);
  assert.equal(snake.bulges.length, 0);

  snake.eat('champignon');
  for (let i = 0; i < 20; i++) snake.update(dt);
  assert.equal(snake.length, 5);

  snake.eat('piment');
  assert.ok(Math.abs(snake.maxSpeed - 6 * Snake.BOOST_FACTOR) < EPS);
  assert.ok(Math.abs(snake.rings[0].maxSpeed - Math.max(10, 6 * Snake.BOOST_FACTOR * 1.8)) < EPS);
  for (let i = 0; i < 59; i++) snake.update(dt);
  assert.ok(snake.boost > 0);
  for (let i = 0; i < 3; i++) snake.update(dt);
  assert.equal(snake.boost, 0);
  assert.equal(snake.maxSpeed, 6);
});

test('langue : coups de langue périodiques, sortie en continu quand de la nourriture est proche', () => {
  const { Snake, Skins } = scene();
  const snake = new Snake(0, 0, Skins.LIST[0]);
  snake.time = Snake.TONGUE_FLICK / 2;
  assert.ok(Math.abs(snake.tongueOut() - 1) < EPS);
  snake.time = Snake.TONGUE_PERIOD - 0.1;
  assert.equal(snake.tongueOut(), 0);
  snake.hungry = true;
  assert.equal(snake.tongueOut(), 1);
});

// ---------------------------------------------------------------- nourriture

test('nourriture : aspirée vers la bouche, de plus en plus vite, force limitée', () => {
  const { Food } = scene();
  const mouth = new Vector(200, 100);
  const food = new Food(100, 100, 'pomme');
  const weak = food.attractTo(mouth, 0.1);
  const weakSpeed = food.maxSpeed;
  assert.equal(food.state, 'attracted');
  assert.ok(weak.x > 0 && weak.mag() <= food.maxForce + EPS);
  food.attractTo(mouth, 0.9);
  assert.ok(food.maxSpeed > weakSpeed);
  food.attractTo(mouth, 5);
  assert.equal(food.maxSpeed, Food.PULL_SPEED[1]);
  assert.equal(food.maxForce, Food.PULL_FORCE[1]);
  for (let i = 0; i < 90; i++) {
    food.applyForce(food.attractTo(mouth, 1 - dist(food.pos, mouth) / 150));
    food.update(1 / 60);
  }
  assert.ok(dist(food.pos, mouth) < 20);
});

test('nourriture : états idle → attracted → idle (se repose) → swallowed → eaten, durées en secondes', () => {
  const { Food } = scene();
  const food = new Food(100, 100, 'pomme');
  for (let i = 0; i < 20; i++) { food.applyForce(food.settle()); food.update(0.05); }
  assert.equal(food.pos.x, 100);
  assert.equal(food.state, 'idle');
  for (let i = 0; i < 5; i++) { food.applyForce(food.attractTo(new Vector(300, 100), 0.5)); food.update(0.05); }
  const moved = food.pos.x;
  assert.ok(moved > 100);
  food.applyForce(food.settle());
  assert.equal(food.state, 'idle');
  assert.equal(food.home.x, moved);
  for (let i = 0; i < 200; i++) { food.applyForce(food.settle()); food.update(0.05); }
  assert.ok(Math.abs(food.pos.x - moved) < 15, 'freine et reste près de là où elle a été lâchée');
  assert.ok(food.vel.mag() < 0.05);

  food.beginSwallow({});
  assert.equal(food.state, 'swallowed');
  for (let i = 0; i < 3; i++) food.update(0.05);
  assert.equal(food.done, false);
  food.update(0.05);
  assert.equal(food.done, true);
  assert.throws(() => food.reset(0, 0, 'pizza'), { name: 'RangeError' });
});

test('nourriture : apparence (apparition rebondie, flottement, disparition dans la bouche)', () => {
  const { Food } = scene();
  const food = new Food(50, 50, 'etoile');
  assert.ok(Math.abs(food.appearance(0).scale) < EPS);
  food.age = Food.SPAWN_TIME / 2;
  assert.ok(food.appearance(0).scale > 0.5);
  food.age = Food.SPAWN_TIME;
  assert.ok(Math.abs(food.appearance(0).scale - 1) < EPS);
  assert.notEqual(food.appearance(0.4).bob, food.appearance(0.9).bob);
  food.beginSwallow({});
  food.swallowLeft = Food.SWALLOW_TIME / 2;
  assert.ok(Math.abs(food.appearance(0).scale - 0.5) < EPS);
  assert.equal(food.appearance(0).bob, 0);
  food.swallowLeft = -0.01;
  assert.equal(food.appearance(0).size, 0);
});

test('nourriture : tirage pondéré reproductible', () => {
  const { Food } = scene();
  assert.equal(Food.randomKind(() => 0), 'pomme');
  assert.equal(Food.randomKind(() => 0.999999), 'champignon');
  const rng = seededRandom(3);
  const counts = {};
  for (let i = 0; i < 4000; i++) { const k = Food.randomKind(rng); counts[k] = (counts[k] ?? 0) + 1; }
  assert.ok(counts.pomme > counts.champignon && counts.champignon > counts.etoile);
});

test('FoodField : apparitions par seconde, plafond, recyclage et plus proche', () => {
  const { FoodField, Food } = scene();
  const field = new FoodField();
  const rng = seededRandom(11);
  let created = 0;
  for (let i = 0; i < 12; i++) created += field.spawn(0.25, 1, 10, 800, 600, rng);
  assert.equal(created, 3, '1 par seconde pendant 3 secondes');
  for (let i = 0; i < 200; i++) field.spawn(0.1, 5, 10, 800, 600, rng);
  assert.equal(field.count, 10);
  for (const food of field.items) {
    assert.ok(food.pos.x >= FoodField.MARGIN && food.pos.x <= 800 - FoodField.MARGIN);
    assert.ok(food.pos.y >= FoodField.MARGIN && food.pos.y <= 600 - FoodField.MARGIN);
  }
  assert.equal(field.spawn(1, 0, 10, 800, 600, rng), 0);

  field.clear();
  assert.equal(field.count, 0);
  const pooled = field.pool.length;
  const recycled = field.add(10, 10, 'pomme');
  assert.equal(field.pool.length, pooled - 1, 'instance recyclée');
  assert.ok(recycled instanceof Food);
  for (let i = 0; i < FoodField.HARD_CAP + 15; i++) field.add(i, i, 'pomme');
  assert.equal(field.count, FoodField.HARD_CAP);
  assert.notEqual(recycled.pos.x, 10, 'la plus ancienne est recyclée (réutilisée ailleurs) au plafond');
  assert.equal(field.items.length + field.pool.length, FoodField.HARD_CAP, 'aucune instance en trop');

  field.clear();
  const a = field.add(100, 100, 'pomme');
  const b = field.add(300, 100, 'pomme');
  assert.equal(field.nearest(new Vector(120, 100)), a);
  a.beginSwallow({});
  assert.equal(field.nearest(new Vector(120, 100)), b);
  a.state = 'eaten';
  assert.equal(field.collect(), 1);
  assert.equal(field.count, 1);
});

// ---------------------------------------------------------------- monde : sélection de l'action

test('monde : le serpent suit la souris (via le véhicule MouseTarget)', () => {
  const s = scene();
  const world = newWorld(s);
  world.setPointer(150, 120);
  for (let i = 0; i < 400; i++) world.step(1 / 60);
  assert.ok(dist(world.cursor.pos, { x: 150, y: 120 }) < 0.5);
  assert.ok(dist(world.snakes[0].pos, world.cursor.pos) < 3);
  world.setPointer(-50, 9000);
  assert.deepEqual([world.pointer.x, world.pointer.y], [0, 600]);
});

test('monde : formations carrousel, conga et chasse', () => {
  const s = scene();
  const carousel = newWorld(s, { snakeCount: 3 });
  for (let i = 0; i < 3; i++) {
    const plan = carousel.plan(i);
    assert.equal(plan.kind, 'arrive');
    assert.ok(Math.abs(dist(plan.target, carousel.cursor.pos) - s.SnakeWorld.carouselRadius(3, carousel.config.size)) < 1e-6);
  }
  assert.ok(dist(carousel.plan(0).target, carousel.plan(1).target) > 10, 'places distinctes');
  const single = newWorld(s);
  assert.ok(dist(single.plan(0).target, single.cursor.pos) < EPS);

  const conga = newWorld(s, { snakeCount: 3, formation: 'conga' });
  const plan = conga.plan(2);
  assert.ok(dist(plan.target, conga.snakes[1].tail.pos) < EPS);
  assert.equal(plan.offset, conga.config.spacing);
  assert.equal(conga.plan(0).label, 'suit la souris');

  const hunt = newWorld(s, { snakeCount: 2, formation: 'chasse' });
  assert.equal(hunt.plan(1).kind, 'wander');
  const mouth = hunt.snakes[1].mouth();
  const far = hunt.dropFood(mouth.x + 300, mouth.y, 'pomme');
  const near = hunt.dropFood(mouth.x + 200, mouth.y + 10, 'etoile');
  const chase = hunt.plan(1);
  assert.ok(dist(chase.target, near.pos) < EPS && chase.label.includes('étoile'));
  assert.ok(far);
  // la chasse reste dans la scène : simulation courte
  for (let i = 0; i < 600; i++) {
    hunt.step(1 / 30);
    for (const snake of hunt.snakes) {
      assert.ok(Number.isFinite(snake.pos.x) && Number.isFinite(snake.pos.y));
      assert.ok(snake.pos.x > -60 && snake.pos.x < 860 && snake.pos.y > -60 && snake.pos.y < 660);
    }
  }
});

test('monde : la nourriture à portée est aspirée, avalée, comptée ; hors de portée elle ne bouge pas', () => {
  const s = scene();
  const world = newWorld(s, { attraction: 120 });
  const snake = world.snakes[0];
  const mouth = snake.mouth();
  const lengthBefore = snake.length;
  const close = world.dropFood(mouth.x + 80, mouth.y, 'etoile');
  const far = world.dropFood(mouth.x + 400, mouth.y, 'pomme');
  world.feed(1 / 60);
  assert.equal(close.state, 'attracted');
  assert.equal(far.state, 'idle');
  assert.equal(snake.hungry, true);
  for (let i = 0; i < 120 && world.stats.eaten === 0; i++) world.feed(1 / 60);
  assert.equal(world.stats.eaten, 1);
  assert.equal(world.stats.score, s.Food.KINDS.etoile.score);
  assert.ok(world.sparkles.length > 0);
  for (let i = 0; i < 30; i++) world.feed(1 / 60);
  assert.ok(!world.food.items.includes(close), 'retirée après l’avalement');
  assert.equal(far.pos.x, mouth.x + 400);
  // la croissance arrive avec la bosse, en bout de queue
  for (let i = 0; i < 90; i++) snake.update(1 / 60);
  assert.equal(snake.length, lengthBefore + 3);

  // casser la règle « bouche la plus proche » : deux serpents, la nourriture va au plus proche
  const two = newWorld(s, { snakeCount: 2 });
  const [a, b] = two.snakes;
  const m = b.mouth();
  const food = two.dropFood(m.x + 30, m.y, 'pomme');
  assert.equal(two.nearestMouth(food.pos).snake, b);
  assert.ok(a);
});

test('monde : réglages appliqués aux serpents, longueur conservée tant que son réglage ne change pas', () => {
  const s = scene();
  const world = newWorld(s, { snakeCount: 2 });
  const first = world.snakes[0];
  world.config.snakeCount = 4;
  world.config.speed = 9;
  world.applyConfig();
  assert.equal(world.snakes.length, 4);
  assert.equal(world.snakes[0], first, 'les serpents existants sont conservés');
  assert.ok(world.snakes.every(snake => snake.tuning.speed === 9));
  assert.deepEqual(world.snakes.map(snake => snake.skin.id), s.Skins.LIST.slice(0, 4).map(skin => skin.id));
  first.grow(5);
  world.applyConfig();
  assert.equal(first.length, world.config.length + 5);
  world.config.length = 30;
  world.applyConfig();
  assert.ok(world.snakes.every(snake => snake.length === 30));
  world.config.snakeCount = 1;
  world.applyConfig();
  assert.equal(world.snakes.length, 1);
});

test('étincelles et curseur : frottement, durée de vie en secondes, plafond', () => {
  const s = scene();
  const sparkle = new s.Sparkle(0, 0).reset(0, 0, 4, 0, '#ffffff', 0.5, null);
  sparkle.update(0.1);
  const v1 = sparkle.vel.mag();
  sparkle.update(0.1);
  assert.ok(sparkle.vel.mag() < v1);
  for (let i = 0; i < 4; i++) sparkle.update(0.1);
  assert.equal(sparkle.alive, false);
  const label = new s.Sparkle(0, 0).reset(0, 0, 0, 0, '#ffffff', 1, '+1');
  for (let i = 0; i < 5; i++) label.update(0.1);
  assert.ok(label.pos.y < 0, 'le texte monte');

  const world = newWorld(s);
  for (let i = 0; i < 50; i++) world.burst(10, 10, '#ffffff', '+1');
  assert.equal(world.sparkles.length, s.SnakeWorld.MAX_SPARKLES);
  for (let i = 0; i < 60; i++) world.step(1 / 30);
  assert.equal(world.sparkles.length, 0);
  assert.ok(world.sparklePool.length >= s.SnakeWorld.MAX_SPARKLES);
});

// ---------------------------------------------------------------- menu textToPoints

function newMenu(s, selected = []) {
  const menu = new s.TextMenu({
    font: fakeFont, rng: seededRandom(5),
    title: { label: 'SERPENTS', colors: ['#000000', '#ffffff'] },
    items: [{ id: 'play', label: 'JOUER', color: '#ffd27a' }, { id: 'debug', label: 'DEBUG', color: '#b6f36b' }],
    onSelect: id => selected.push(id),
  });
  menu.layout(800, 600);
  return menu;
}

test('menu : textToPoints donne un véhicule par point, mots centrés, zones cliquables', () => {
  const s = scene();
  const selected = [];
  const menu = newMenu(s, selected);
  assert.equal(menu.dots.length, ('SERPENTS'.length + 'JOUER'.length + 'DEBUG'.length) * 4);
  assert.ok(menu.dots.every(dot => dot instanceof s.Vehicle));
  for (const line of menu.lines) assert.ok(Math.abs(line.bounds.x + line.bounds.w / 2 - 400) < EPS);
  const play = menu.lines[1].bounds;
  const cx = play.x + play.w / 2;
  const cy = play.y + play.h / 2;
  assert.equal(menu.itemAt(cx, cy), 'play');
  assert.equal(menu.itemAt(cx, menu.lines[0].bounds.y + 5), null, 'le titre n’est pas cliquable');
  assert.equal(menu.itemAt(5, 5), null);
  assert.equal(menu.click(cx, cy), true);
  assert.equal(menu.click(5, 5), false);
  assert.deepEqual(selected, ['play']);
  assert.equal(menu.hover(cx, cy), 'play');
  assert.equal(menu.dotColor(menu.dots.find(dot => dot.line === 1)), s.Skins.mix('#ffd27a', '#ffffff', 0.45));

  const dots = [...menu.dots];
  menu.layout(1000, 700);
  assert.ok(dots.every((dot, i) => menu.dots[i] === dot), 'les points sont réutilisés au redimensionnement');
});

test('menu : les lettres se forment (arrive), sont bousculées par un serpent puis se reforment', () => {
  const s = scene();
  const menu = newMenu(s);
  const meanError = () => menu.dots.reduce((sum, dot) => sum + dist(dot.pos, dot.home), 0) / menu.dots.length;
  const start = meanError();
  for (let i = 0; i < 400; i++) menu.step(1 / 60, null, []);
  assert.ok(meanError() < 1 && meanError() < start / 50, `erreur ${meanError()}`);
  assert.equal(menu.alpha, 1);

  const dot = menu.dots.find(d => d.line === 1);
  const threat = { pos: new Vector(dot.home.x + 5, dot.home.y), radius: 40 };
  for (let i = 0; i < 20; i++) menu.step(1 / 60, null, [threat]);
  assert.ok(dot.pos.x < dot.home.x - 5, 'la lettre fuit la tête du serpent');
  assert.ok(dist(dot.pos, threat.pos) > 20, 'la lettre est sortie de la tête');
  for (let i = 0; i < 400; i++) menu.step(1 / 60, null, []);
  assert.ok(dist(dot.pos, dot.home) < 1, 'et revient à sa place');
});

test('menu : les points au repos ne sont pas recalculés, mais réagissent dès qu’on approche', () => {
  const s = scene();
  const menu = newMenu(s);
  for (let i = 0; i < 600; i++) menu.step(1 / 60, null, []);
  assert.ok(menu.dots.every(dot => dot.resting));
  let calls = 0;
  for (const dot of menu.dots) {
    const original = dot.homeForce.bind(dot);
    dot.homeForce = wave => { calls++; return original(wave); };
  }
  menu.step(1 / 60, null, []);
  assert.equal(calls, 0, 'aucune force calculée au repos');
  const dot = menu.dots.find(d => d.line === 2);
  menu.step(1 / 60, new Vector(dot.pos.x + 3, dot.pos.y), []);
  assert.ok(calls > 0 && calls < menu.dots.length / 4, 'seuls les points proches de la souris sont recalculés');
  assert.ok(!dot.resting, 'le point proche de la souris bouge');
  const play = menu.lines[1].bounds;
  menu.hover(play.x + 2, play.y + 2);
  calls = 0;
  menu.step(1 / 60, null, []);
  assert.equal(calls >= menu.byLine[1].length, true, 'le mot survolé ondule');
});

test('menu : fermeture (éparpillement en secondes), plus de clic, réouverture', () => {
  const s = scene();
  const selected = [];
  const menu = newMenu(s, selected);
  for (let i = 0; i < 300; i++) menu.step(1 / 60, null, []);
  const play = menu.lines[1].bounds;
  menu.close();
  assert.equal(menu.state, 'closing');
  assert.equal(menu.click(play.x + 2, play.y + 2), false);
  const before = menu.dots.reduce((sum, dot) => sum + dist(dot.pos, { x: 400, y: 300 }), 0);
  menu.step(0.1, null, []);
  menu.step(0.1, null, []);
  const after = menu.dots.reduce((sum, dot) => sum + dist(dot.pos, { x: 400, y: 300 }), 0);
  assert.ok(after > before, 'les lettres s’éloignent du centre');
  assert.ok(menu.alpha < 1 && menu.alpha > 0, 'les lettres s’effacent');
  for (let i = 0; i < 6; i++) menu.step(0.1, null, []);
  assert.equal(menu.state, 'closed');
  assert.equal(menu.visible, false);
  assert.equal(menu.alpha, 0);
  assert.equal(menu.samplePoints(3).length, 3);
  menu.toggle();
  assert.equal(menu.isOpen, true);
  for (let i = 0; i < 500; i++) menu.step(1 / 60, null, []);
  assert.ok(menu.dots.every(dot => dist(dot.pos, dot.home) < 2));
  assert.equal(menu.click(play.x + 2, play.y + 2), true);
});

// ---------------------------------------------------------------- scénarios

test('scénarios : valeurs dans les plages, BASE = valeurs initiales, application à de vrais objets', () => {
  const s = scene();
  const c = s.SnakeControls;
  const initial = c.createSettings();
  assert.deepEqual(JSON.parse(JSON.stringify(s.Scenarios.BASE)), JSON.parse(JSON.stringify(initial)));
  assert.equal(s.Scenarios.LIST[0].id, 'reference');
  assert.equal(Object.keys(s.Scenarios.LIST[0].values).length, 0);
  for (const scenario of s.Scenarios.LIST) {
    assert.ok(scenario.label && scenario.description, scenario.id);
    const settings = c.createSettings();
    const setters = {};
    for (const name of Object.keys(c.PARAMETERS)) setters[name] = v => c.setParameter(settings, name, v);
    for (const name of Object.keys(c.TOGGLES)) setters[name] = v => c.setToggle(settings, name, v);
    for (const name of Object.keys(c.CHOICES)) setters[name] = v => c.setChoice(settings, name, v);
    s.Scenarios.apply(scenario.id, setters);
    const world = new s.SnakeWorld({ config: settings, width: 900, height: 600, rng: seededRandom(1) });
    assert.equal(world.snakes.length, settings.snakeCount);
    for (let i = 0; i < 240; i++) {
      world.setPointer(450 + Math.cos(i / 20) * 300, 300 + Math.sin(i / 15) * 200);
      if (i % 30 === 0) world.dropFood(100 + i, 300, settings.clickFood);
      world.step(1 / 60);
    }
    for (const snake of world.snakes) {
      assert.ok(snake.length >= s.Snake.MIN_RINGS && snake.length <= s.Snake.MAX_RINGS);
      for (const v of [snake, ...snake.rings]) assert.ok(Number.isFinite(v.pos.x) && Number.isFinite(v.pos.y), scenario.id);
    }
    assert.ok(world.food.count <= s.FoodField.HARD_CAP);
    if (settings.foodAuto) assert.ok(world.food.count <= Math.max(settings.foodMax, 8) + 8);
  }
  assert.throws(() => s.Scenarios.valuesFor('inconnu'), { name: 'RangeError' });
  assert.equal(s.Scenarios.next('reference'), s.Scenarios.LIST[1].id);
  assert.equal(s.Scenarios.next(s.Scenarios.LIST.at(-1).id), 'reference');
  assert.equal(s.Scenarios.next('custom'), 'reference');
});

test('scénarios : le menu déroulant règle les contrôles, une modification manuelle passe sur Personnalisé', () => {
  const s = scene();
  const select = element();
  const description = element();
  const control = element();
  const applied = [];
  const values = {};
  const setters = {};
  for (const key of Object.keys(s.Scenarios.BASE)) setters[key] = v => { values[key] = v; control.dispatchEvent({ type: 'input' }); };
  const bound = s.Scenarios.bindSelect({
    select, description, controls: [control], setters, onApply: id => applied.push(id), makeOption: (value, label) => ({ value, label }),
  });
  assert.equal(select.children.length, s.Scenarios.LIST.length + 1);
  assert.equal(select.value, 'reference');
  assert.equal(values.snakeCount, 1);
  select.value = 'conga';
  select.dispatchEvent({ type: 'change' });
  assert.equal(values.formation, 'conga');
  assert.equal(select.value, 'conga');
  control.dispatchEvent({ type: 'input' });
  assert.equal(bound.isCustom(), true);
  assert.equal(description.textContent, s.Scenarios.CUSTOM.description);
  bound.next();
  assert.equal(select.value, 'reference');
  assert.deepEqual(applied, ['reference', 'conga', 'reference']);
});

// ---------------------------------------------------------------- adversaire wander

function newRival(s, options = {}) {
  const rival = new s.SnakeWander(400, 300, s.Skins.ADVERSARY,
    { length: 8, speed: 4, force: 0.35, wanderRadius: 50, wanderDistance: 150, wanderJitter: 0.3, ...options });
  rival.vel.set(2, 0);
  return rival;
}

test('wander : réutilise vehicle.js, force de norme maxForce vers le point du cercle', () => {
  const s = scene();
  assert.ok(s.SnakeWander.prototype instanceof s.Snake);
  assert.ok(!Object.hasOwn(s.SnakeWander.prototype, 'wander'), 'wander() n’est pas recopié');
  const rival = newRival(s);
  assert.deepEqual([rival.wanderRadius, rival.distanceCercle, rival.displaceRange], [50, 150, 0.3]);
  rival.wanderTheta = 0;
  const { center, point } = rival.wanderGeometry();
  assert.ok(Math.abs(center.x - 550) < EPS && Math.abs(center.y - 300) < EPS, 'centre à distanceCercle devant');
  assert.ok(Math.abs(dist(point, center) - 50) < EPS, 'point sur le cercle');
  const force = rival.wanderForce();
  assert.ok(Math.abs(force.mag() - rival.maxForce) < EPS);
  const toPoint = { x: point.x - rival.pos.x, y: point.y - rival.pos.y };
  assert.ok(Math.abs(Math.atan2(force.y, force.x) - Math.atan2(toPoint.y, toPoint.x)) < 1e-9, 'vers le point vert');
  assert.equal(rival.target, null);
});

test('wander : l’angle varie de façon continue (au plus « variation » par image)', () => {
  const s = scene();
  const rival = newRival(s, { wanderJitter: 0.1 });
  let previous = rival.wanderTheta;
  let total = 0;
  for (let i = 0; i < 300; i++) {
    rival.applyForce(rival.wanderForce());
    rival.update(1 / 60);
    const step = Math.abs(rival.wanderTheta - previous);
    assert.ok(step <= 0.1 + EPS, `pas de ${step}`);
    total += step;
    previous = rival.wanderTheta;
  }
  assert.ok(total > 1, 'l’angle change bien');
  rival.configureWander({ wanderRadius: 20 });
  assert.deepEqual([rival.wanderRadius, rival.distanceCercle], [20, 150]);
});

test('wander : l’adversaire erre partout sans sortir de la scène, ses anneaux suivent', () => {
  const s = scene();
  const rival = newRival(s);
  const visited = new Set();
  for (let i = 0; i < 3000; i++) {
    rival.steerAlone(800, 600);
    rival.update(1 / 60);
    assert.ok(rival.pos.x > -40 && rival.pos.x < 840 && rival.pos.y > -40 && rival.pos.y < 640, `sortie : ${rival.pos.x}, ${rival.pos.y}`);
    assert.ok(rival.vel.mag() <= rival.maxSpeed + EPS);
    visited.add(`${Math.floor(rival.pos.x / 200)},${Math.floor(rival.pos.y / 200)}`);
  }
  assert.ok(visited.size >= 5, `zones visitées : ${visited.size}`);
  assert.equal(rival.label, 'adversaire · erre');
  let previous = rival.pos;
  for (const ring of rival.rings) {
    assert.ok(dist(ring.pos, previous) < 14 * 3, 'les anneaux restent attachés');
    previous = ring.pos;
  }
});

test('monde : adversaires créés, réglés et conservés selon le réglage', () => {
  const s = scene();
  const world = newWorld(s, { rivals: 2, rivalSpeed: 7, wanderRadius: 30 });
  assert.equal(world.rivals.length, 2);
  assert.ok(world.rivals.every(rival => rival instanceof s.SnakeWander && rival.skin === s.Skins.ADVERSARY));
  assert.ok(world.rivals.every(rival => rival.maxSpeed === 7 && rival.wanderRadius === 30));
  assert.ok(world.rivals.every(rival => rival.vel.mag() > 0), 'un cap de départ');
  const first = world.rivals[0];
  world.config.rivals = 3;
  world.config.wanderDistance = 80;
  world.applyConfig();
  assert.equal(world.rivals.length, 3);
  assert.equal(world.rivals[0], first);
  assert.ok(world.rivals.every(rival => rival.distanceCercle === 80));
  assert.equal(world.allSnakes().length, 4);
  assert.equal(world.threats().length, 4, 'les adversaires bousculent aussi le menu');
  world.config.rivals = 0;
  world.applyConfig();
  assert.equal(world.rivals.length, 0);
  assert.equal(world.allSnakes(), world.snakes);
});

test('monde : un adversaire vole la nourriture la plus proche de sa bouche', () => {
  const s = scene();
  const world = newWorld(s, { rivals: 1 });
  const rival = world.rivals[0];
  const mouth = rival.mouth();
  const food = world.dropFood(mouth.x + 40, mouth.y, 'pomme');
  assert.equal(world.nearestMouth(food.pos).snake, rival);
  for (let i = 0; i < 120 && world.stats.stolen === 0; i++) world.feed(1 / 60);
  assert.equal(world.stats.stolen, 1);
  assert.equal(world.stats.eaten, 0, 'pas compté pour le joueur');
  assert.equal(world.stats.score, 0);
});

// ---------------------------------------------------------------- partie : vie, victoire, game over

// place la tête de « head » sur l'anneau i du serpent « body »
const onRing = (head, body, i) => head.pos.set(body.rings[i].pos.x, body.rings[i].pos.y);
// éloigne les têtes du joueur des adversaires (pour isoler une règle)
const apart = world => world.snakes.forEach((snake, i) => snake.pos.set(-500 - i * 100, -500));

test('adversaire : barre de vie (calcul pur), coups avec invulnérabilité en secondes', () => {
  const s = scene();
  const rival = newRival(s, { health: 4 });
  let bar = rival.healthBar();
  assert.deepEqual([bar.ratio, bar.color, bar.fill === bar.w, bar.flash], [1, '#5ee37a', true, false]);
  assert.ok(bar.y < rival.pos.y - rival.r && Math.abs(bar.x + bar.w / 2 - rival.pos.x) < EPS, 'centrée au-dessus de la tête');
  assert.equal(rival.takeHit(1), true);
  assert.equal(rival.takeHit(1), false, 'invulnérable juste après un coup');
  bar = rival.healthBar();
  assert.deepEqual([bar.ratio, bar.color, bar.flash], [0.75, '#5ee37a', true]);
  assert.ok(Math.abs(bar.fill - bar.w * 0.75) < EPS);
  for (let i = 0; i < 11; i++) rival.update(0.05); // 0.55 s < HIT_COOLDOWN
  assert.equal(rival.takeHit(1), false);
  rival.update(0.06);
  assert.equal(rival.takeHit(1), true);
  assert.equal(rival.healthBar().color, '#ffd84d');
  rival.hitCooldown = 0;
  rival.takeHit(1);
  assert.equal(rival.healthBar().color, '#ff4d4d');
  rival.hitCooldown = 0;
  rival.takeHit(5);
  assert.equal(rival.health, 0);
  assert.equal(rival.defeated, true);
  assert.equal(rival.healthBar().fill, 0);
  const other = newRival(s, { health: 4 });
  other.takeHit(1);
  other.setMaxHealth(8);
  assert.deepEqual([other.health, other.maxHealth], [6, 8], 'même proportion');
});

test('adversaire : erre, fuit la tête du joueur quand il est blessé, puis reprend l’errance', () => {
  const s = scene();
  const rival = newRival(s, { health: 3 });
  const threat = new Vector(rival.pos.x + 60, rival.pos.y);
  rival.steerAlone(800, 600, threat);
  assert.equal(rival.state, 'wander', 'en pleine forme il ignore le joueur');
  rival.health = 1;
  rival.vel.set(0, 0);
  rival.acc.set(0, 0);
  rival.steerAlone(800, 600, threat);
  assert.equal(rival.state, 'flee');
  assert.equal(rival.label, 'adversaire · fuit');
  assert.ok(rival.acc.x < 0, 'force opposée à la menace');
  let farthest = 0;
  for (let i = 0; i < 400; i++) {
    rival.steerAlone(800, 600, threat);
    rival.update(1 / 60);
    farthest = Math.max(farthest, dist(rival.pos, threat));
  }
  assert.ok(farthest >= s.SnakeWander.FLEE_RADIUS - 10, `il s’éloigne jusqu’au rayon de fuite (${farthest})`);
  rival.steerAlone(800, 600, new Vector(rival.pos.x + 400, rival.pos.y));
  assert.equal(rival.state, 'wander', 'menace hors du rayon : fin de la fuite');
  rival.steerAlone(800, 600, null);
  assert.equal(rival.state, 'wander');
});

test('partie : la tête du joueur mord le corps de l’adversaire ; vaincu, il se change en fruits ; victoire', () => {
  const s = scene();
  const world = newWorld(s, { rivals: 1, rivalHealth: 2, length: 20 });
  assert.equal(world.game.state, 'playing');
  const [player, rival] = [world.snakes[0], world.rivals[0]];
  onRing(player, rival, 8);
  world.checkBites(0.05);
  assert.equal(rival.health, 1);
  assert.equal(player.length, 20, 'mordre ne coûte rien au joueur');
  world.checkBites(0.05);
  assert.equal(rival.health, 1, 'invulnérabilité');
  rival.hitCooldown = 0;
  onRing(player, rival, 8);
  world.checkBites(0.05);
  assert.equal(world.rivals.length, 0);
  assert.equal(world.defeated, 1);
  assert.ok(world.food.count >= 4, 'le corps se change en fruits');
  assert.equal(world.updateGame(), 'won');
  assert.equal(world.over, true);
  // partie gagnée : la scène est figée
  const frozen = [player.pos.x, player.pos.y, world.game.time];
  world.setPointer(10, 10);
  for (let i = 0; i < 30; i++) world.step(1 / 60);
  assert.deepEqual([player.pos.x, player.pos.y, world.game.time], frozen);
  // l'adversaire vaincu n'est pas recréé par un réglage
  world.config.speed = 8;
  world.applyConfig();
  assert.equal(world.rivals.length, 0);
  assert.equal(world.summary().defeated, 1);
  world.reset();
  assert.deepEqual([world.rivals.length, world.defeated, world.game.state], [1, 0, 'playing']);
});

test('partie : la tête de l’adversaire mord le corps du joueur, répit, puis game over', () => {
  const s = scene();
  const world = newWorld(s, { rivals: 1, length: 7 });
  const [player, rival] = [world.snakes[0], world.rivals[0]];
  // anneaux collés à la tête du joueur : pas de morsure
  onRing(rival, player, 0);
  if (s.SnakeWorld.contact(player, rival) === null) {
    world.checkBites(0.05);
    assert.equal(world.stats.bites, 0);
  }
  rival.hitCooldown = 99; // isole la règle : le joueur ne peut pas blesser l'adversaire ici
  onRing(rival, player, 5);
  world.checkBites(0.05);
  assert.equal(world.stats.bites, 1);
  assert.equal(player.length, 7 - s.SnakeWorld.BITE_LOSS);
  assert.ok(world.sparkles.some(sparkle => sparkle.label && sparkle.label.startsWith('Aïe')));
  for (let i = 0; i < 20; i++) { onRing(rival, player, 4); world.checkBites(0.05); } // 1 s < répit
  assert.equal(world.stats.bites, 1, 'pas de morsure pendant le répit');
  for (let i = 0; i < 5 && world.stats.bites < 2; i++) { onRing(rival, player, 4); world.checkBites(0.05); }
  assert.equal(world.stats.bites, 2, 'nouvelle morsure après le répit');
  assert.equal(player.length, s.Snake.MIN_RINGS);
  assert.equal(world.updateGame(), 'playing', 'encore vivant au minimum');
  player.biteCooldown = 0;
  onRing(rival, player, s.Snake.MIN_RINGS - 1);
  world.checkBites(0.05);
  assert.equal(world.snakes.length, 0, 'mordu sans anneau de réserve : dévoré');
  assert.equal(world.updateGame(), 'lost');
  world.config.length = 12;
  world.applyConfig();
  assert.equal(world.snakes.length, 0, 'un serpent mort ne revient pas avant de rejouer');
  world.reset();
  assert.deepEqual([world.snakes.length, world.game.state], [1, 'playing']);
});

test('partie : jeu libre sans adversaire, lancée en ajoutant un adversaire, plusieurs serpents', () => {
  const s = scene();
  const world = newWorld(s, { snakeCount: 2 });
  assert.equal(world.game.state, 'free');
  for (let i = 0; i < 30; i++) world.step(1 / 60);
  assert.equal(world.game.time, 0, 'pas de chronomètre en jeu libre');
  world.config.rivals = 1;
  world.applyConfig();
  assert.equal(world.game.state, 'playing');
  apart(world);
  world.killSnake(world.snakes[0]);
  assert.equal(world.updateGame(), 'playing', 'il reste un serpent');
  world.killSnake(world.snakes[0]);
  assert.equal(world.updateGame(), 'lost');
  world.reset();
  world.config.rivals = 0;
  world.applyConfig();
  assert.equal(world.game.state, 'free');
});

test('partie : simulation courte, invariants et chronomètre en secondes', () => {
  const s = scene();
  const world = newWorld(s, { rivals: 3, rivalHealth: 2, foodAuto: true, foodMax: 10, foodRate: 3 });
  for (let i = 0; i < 1200 && !world.over; i++) {
    world.setPointer(400 + Math.cos(i / 25) * 300, 300 + Math.sin(i / 18) * 220);
    world.step(1 / 60);
    for (const snake of world.allSnakes()) {
      assert.ok(Number.isFinite(snake.pos.x) && Number.isFinite(snake.pos.y));
      assert.ok(snake.length >= s.Snake.MIN_RINGS);
    }
    for (const rival of world.rivals) assert.ok(rival.health > 0 && rival.health <= rival.maxHealth);
    assert.ok(world.food.count <= s.FoodField.HARD_CAP);
  }
  assert.ok(world.game.time > 0);
  assert.ok(world.defeated + world.rivals.length === 3);
});

test('écrans de fin : TextMenu fermé au départ, texte d’aide calculé', () => {
  const s = scene();
  let n = 0;
  const end = new s.TextMenu({ font: fakeFont, open: false, hint: () => `essai ${++n}`,
    title: { label: 'GAME OVER', colors: ['#ff4d4d', '#ff9ecf'] }, items: [{ id: 'replay', label: 'REJOUER', color: '#ffd27a' }] });
  end.layout(800, 600);
  assert.equal(end.visible, false);
  const b = end.lines[1].bounds;
  assert.equal(end.click(b.x + 2, b.y + 2), false, 'fermé : pas cliquable');
  end.open();
  assert.equal(end.itemAt(b.x + 2, b.y + 2), 'replay');
  assert.equal(end.hint(), 'essai 1');
  assert.equal(new s.TextMenu({ font: fakeFont, title: { label: 'A', colors: ['#000000', '#ffffff'] }, items: [] }).hint, s.TextMenu.HINT);
});
