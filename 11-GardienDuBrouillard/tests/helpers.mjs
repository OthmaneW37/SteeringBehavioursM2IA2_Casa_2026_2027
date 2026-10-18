// Outils des tests : chargent les vrais fichiers du jeu dans un contexte isolé (node:vm), avec un
// adaptateur vectoriel minimal et des fonctions de dessin p5 vides. L'aléatoire est fixé.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export class Vector {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy() { return new Vector(this.x, this.y); }
  add(v, y) { if (typeof v === 'number') { this.x += v; this.y += y; } else { this.x += v.x; this.y += v.y; } return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  mult(n) { this.x *= n; this.y *= n; return this; }
  div(n) { this.x /= n; this.y /= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  dot(v) { return this.x * v.x + this.y * v.y; }
  normalize() { const m = this.mag(); return m ? this.div(m) : this; }
  setMag(n) { return this.normalize().mult(n); }
  limit(n) { return this.mag() > n ? this.setMag(n) : this; }
  heading() { return Math.atan2(this.y, this.x); }
  static add(a, b) { return new Vector(a.x + b.x, a.y + b.y); }
  static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
  static mult(a, n) { return new Vector(a.x * n, a.y * n); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  static fromAngle(a) { return new Vector(Math.cos(a), Math.sin(a)); }
}

export function lcg(seed = 12345) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Ordre de chargement = ordre des scripts de index.html (sketch.js exclu : il n'est pas exécutable sous Node)
export const FILES = ['vehicle.js', 'steering.js', 'combat.js', 'arena.js', 'NeuralNetwork.js', 'campfire.js',
  'mistPatch.js', 'pillar.js', 'bloodstain.js', 'player.js', 'boss.js', 'bossBrain.js', 'handBoss.js', 'scriptedPlayer.js', 'humanController.js', 'fight.js',
  'fitness.js', 'genetic.js', 'training.js', 'trainingStore.js', 'comparison.js', 'demo.js', 'settings.js', 'scenarios.js', 'trials.js', 'doctrines.js', 'pretrainedBoss.js', 'pretrainedPantheon.js', 'pantheon.js', 'tournament.js',
  'fitnessChart.js', 'debugPanel.js', 'hud.js', 'camera.js', 'menuToggle.js', 'screens.js', 'titleMenu.js', 'tutorial.js', 'hudLayout.js', 'banners.js', 'quality.js', 'gameFeel.js',
  'particles.js', 'lighting.js', 'fog.js', 'flocking.js', 'creux.js', 'packBrain.js', 'handPack.js', 'packPlayer.js', 'packFight.js',
  'packFitness.js', 'packSettings.js', 'packTraining.js', 'packComparison.js', 'pretrainedPack.js', 'campaign.js', 'interpolation.js', 'gamepad.js', 'audio.js', 'networkView.js', 'presentation.js', 'recorder.js', 'showcasePlayer.js'];

export function read(file) {
  return readFileSync(new URL('../' + file, import.meta.url), 'utf8');
}

export function load(seed = 12345, files = FILES, options = {}) {
  let rng = lcg(seed);
  const noop = () => {};
  const math = Object.create(Math);
  math.random = () => rng();
  const context = vm.createContext({
    ...(options.realMath ? {} : { Math: math }), console,
    createVector: (x = 0, y = 0) => new Vector(x, y),
    p5: { Vector },
    random: (a, b) => (a === undefined ? rng() : b === undefined ? rng() * a : a + rng() * (b - a)),
    randomSeed: s => { rng = lcg(s); },
    randomGaussian: (m = 0, sd = 1) => { let u = 0; while (u === 0) u = rng(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); },
    map: (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c),
    constrain: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    cos: Math.cos, sin: Math.sin, PI: Math.PI, TWO_PI: Math.PI * 2, HALF_PI: Math.PI / 2, PIE: 'pie',
    frameCount: 0, width: 1000, height: 700,
    push: noop, pop: noop, fill: noop, noFill: noop, stroke: noop, noStroke: noop, strokeWeight: noop,
    circle: noop, line: noop, rect: noop, arc: noop, ellipse: noop, triangle: noop, translate: noop, rotate: noop,
    text: noop, textSize: noop, textAlign: noop, image: noop, imageMode: noop, scale: noop,
    beginShape: noop, vertex: noop, endShape: noop, red: c => c[0], green: c => c[1], blue: c => c[2],
    color: (...c) => c, lerpColor: (a) => a,
    blendMode: noop, textFont: noop, textStyle: noop, textWidth: () => 10, ADD: 'add', BLEND: 'blend', BOLD: 'bold', NORMAL: 'normal', CLOSE: 'close',
    CENTER: 'center', LEFT: 'left', RIGHT: 'right', TOP: 'top', BOTTOM: 'bottom',
    // Contexte 2D factice : de quoi dessiner sans navigateur (dégradés, arcs, rectangles)
    drawingContext: {
      setLineDash: noop, save: noop, restore: noop, beginPath: noop, rect: noop, clip: noop, fillRect: noop,
      arc: noop, fill: noop, moveTo: noop, closePath: noop,
      createRadialGradient: () => ({ addColorStop: noop }), createLinearGradient: () => ({ addColorStop: noop })
    },
  });
  if (options.thisContext) {
    // Chargement dans le contexte principal de Node : bien plus rapide qu'un contexte vm isolé
    // (utilisé par l'outil de pré-entraînement ; les tests gardent des contextes isolés).
    for (const [k, v] of Object.entries(context)) if (k !== 'Math') globalThis[k] = v;
    for (const file of files) vm.runInThisContext(read(file), { filename: file });
    const get = name => vm.runInThisContext(name);
    return { context: globalThis, get, setRng: s => { rng = lcg(s); } };
  }
  for (const file of files) vm.runInContext(read(file), context, { filename: file });
  const get = name => vm.runInContext(name, context);
  return { context, get, setRng: s => { rng = lcg(s); } };
}

export function plain(v) {
  return JSON.parse(JSON.stringify(v));
}
