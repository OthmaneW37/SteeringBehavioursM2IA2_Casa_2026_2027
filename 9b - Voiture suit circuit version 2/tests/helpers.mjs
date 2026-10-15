// Outils communs des tests : charge les vrais fichiers js/ dans un contexte isolé,
// avec un adaptateur vectoriel minimal (à la place de p5) et un aléatoire reproductible.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export class Vector {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy() { return new Vector(this.x, this.y); }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  div(n) { this.x /= n; this.y /= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  magSq() { return this.x * this.x + this.y * this.y; }
  dot(v) { return this.x * v.x + this.y * v.y; }
  normalize() { const m = this.mag(); return m ? this.div(m) : this; }
  setMag(n) { return this.normalize().mult(n); }
  limit(n) { return this.mag() > n ? this.setMag(n) : this; }
  heading() { return Math.atan2(this.y, this.x); }
  static fromAngle(a) { return new Vector(Math.cos(a), Math.sin(a)); }
  static add(a, b) { return new Vector(a.x + b.x, a.y + b.y); }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
  static mult(a, n) { return new Vector(a.x * n, a.y * n); }
  static div(a, n) { return new Vector(a.x / n, a.y / n); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
}

// Générateur congruentiel linéaire : aléatoire reproductible
export function seededRandom(seed = 12345) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

// Normale centrée réduite reproductible (Box-Muller sur un générateur donné)
export function seededGaussian(rng) {
  return () => {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
}

export const FILES = ['globals.js', 'utils.js', 'settings.js', 'NeuralNetwork.js', 'carTypes.js', 'trackGeometry.js',
  'circuits.js', 'Ray.js', 'Car.js', 'Genetic.js', 'termination.js', 'curriculum.js', 'trainer.js', 'race.js',
  'configStore.js', 'networkView.js', 'controls.js'];

// Copie « locale » d'une valeur venue du contexte vm (comparaisons deepEqual strictes)
export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

export function readJs(file) {
  return readFileSync(new URL('../js/' + file, import.meta.url), 'utf8');
}

export function readHtml() {
  return readFileSync(new URL('../index.html', import.meta.url), 'utf8');
}

/**
 * Contexte d'exécution des modules : fonctions p5 utilisées hors dessin, aléatoire fixé.
 * Math.random est aussi remplacé, pour que l'initialisation et la mutation par défaut
 * soient reproductibles.
 */
export function load(seed = 12345, files = FILES) {
  const rng = seededRandom(seed);
  const gaussian = seededGaussian(rng);
  const math = Object.create(Math);
  math.random = rng;
  const context = vm.createContext({
    Math: math,
    createVector: (x = 0, y = 0) => new Vector(x, y),
    p5: { Vector },
    width: 1000, height: 700,
    random: (a, b) => (a === undefined ? rng() : b === undefined ? rng() * a : a + rng() * (b - a)),
    randomGaussian: (mean = 0, sd = 1) => mean + sd * gaussian(),
    map: (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c),
    constrain: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    max: Math.max, min: Math.min, abs: Math.abs, floor: Math.floor,
    console,
  });
  for (const file of files) vm.runInContext(readJs(file), context, { filename: file });
  const get = name => vm.runInContext(name, context);
  return { context, get, rng };
}

/** Faux document : éléments par identifiant, listes déroulantes, cases à cocher. */
export function fakeDocument(html = readHtml()) {
  const elements = {};
  const re = /<(input|select|span|p|div|button|aside|details|ol)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? true : a[2];
    if (!attrs.id) continue;
    const el = {
      id: attrs.id, tag: m[1], attrs, value: attrs.value || '', checked: 'checked' in attrs,
      textContent: '', style: {}, dataset: {}, options: [], innerHTML: '',
      parentElement: { classList: { names: new Set(), toggle(n, on) { on ? this.names.add(n) : this.names.delete(n); } } },
      appendChild(child) { this.options.push(child); if (child.selected || this.options.length === 1) this.value = child.value; },
    };
    if (m[1] === 'select') {
      Object.defineProperty(el, 'innerHTML', { set() { this.options = []; this.value = ''; }, get() { return ''; } });
      Object.defineProperty(el, 'value', {
        get() { const o = this.options.find(o => o.selected) || this.options[0]; return o ? o.value : ''; },
        set(v) { if (this.attrs.multiple) return; for (const o of this.options) o.selected = o.value === v; },
      });
    }
    elements[attrs.id] = el;
    if (m[1] === 'select') {
      // Options écrites en dur dans le HTML
      const body = html.slice(re.lastIndex, html.indexOf('</select>', re.lastIndex));
      for (const o of body.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)) {
        el.options.push({ value: o[1], textContent: o[3], selected: /selected/.test(o[2]) });
      }
    }
  }
  return {
    elements,
    getElementById: id => elements[id] || null,
    createElement: tag => ({ tag, value: '', textContent: '', selected: false }),
  };
}
