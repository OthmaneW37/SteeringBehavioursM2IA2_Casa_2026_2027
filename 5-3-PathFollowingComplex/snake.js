// Le serpent, adapté de Snake de 3-Arrival_correction : sa TÊTE est le véhicule (this.pos,
// this.vel), suivie d'anneaux SnakeRing qui sont eux aussi des véhicules.
//  - la tête suit le chemin avec le follow(path) fourni par vehicle.js ;
//  - la tête ET chaque anneau s'écartent des autres véhicules avec le separate() fourni ;
//  - chaque anneau suit celui qui le précède avec Steering.arrive.
// La tête peut aussi errer avec le wander() fourni. Trois poids règlent le serpent :
// followPathWeight (suivi du chemin), separateWeight (séparation, tête et anneaux) et wanderWeight
// (errance, 0 par défaut). Ce sont les propriétés déjà prévues par Vehicle. Une force de
// Steering.stayInside garde la tête dans le canvas quand le wander l'éloigne de la route.
// Chaque image : forces de la tête (somme pondérée) → locomotion héritée (Vehicle.update) →
// chaque anneau applique ses forces et se déplace à son tour.
class Snake extends Vehicle {
  static MIN_RINGS = 3;
  static MAX_RINGS = 60;
  static BOUNDS_MARGIN = 40;
  static BOUNDS_WEIGHT = 1.5;
  static AVOID_WEIGHT = 3; // valeur de applyBehaviors dans 6-ObstacleAvoidance
  static TONGUE_PERIOD = 2.4; // secondes
  static TONGUE_FLICK = 0.35;

  // options : length (anneaux), size (rayon de la tête), maxSpeed, maxForce, skin, followWeight,
  // separateWeight, wanderWeight, wanderRadius
  constructor(x, y, options = {}) {
    const { length = 14, size = 14, maxSpeed = 2.5, maxForce = 0.3, skin = SnakeSkins.BASE } = options;
    super(x, y, maxSpeed, maxForce);
    this.r = size;
    this.skin = skin;
    this.facing = 0;
    this.pathMaxLength = 0;
    if (options.followWeight !== undefined) this.followPathWeight = options.followWeight;
    if (options.separateWeight !== undefined) this.separateWeight = options.separateWeight;
    if (options.wanderWeight !== undefined) this.wanderWeight = options.wanderWeight;
    if (options.wanderRadius !== undefined) this.wanderRadius = options.wanderRadius;
    this.avoidWeight = options.avoidWeight ?? Snake.AVOID_WEIGHT;
    this.avoidConfig = options.avoidConfig ?? { mode: 'classique', rays: 5, fan: 0.7 };
    // variation d'angle du wander : toujours symétrique (Vehicle tire un signe au hasard)
    this.displaceRange = 0.3;
    this.rings = [];
    this.setLength(length);
  }

  get name() {
    return this.skin.name;
  }

  // distance entre deux anneaux consécutifs
  get spacing() {
    return this.r * 1.3;
  }

  // rayon de l'anneau i (1 = derrière la tête) : le corps s'affine vers la queue
  ringRadius(i) {
    const n = this.rings.length;
    const t = n > 1 ? (i - 1) / (n - 1) : 0;
    return this.r * (0.95 - 0.45 * t);
  }

  // change la taille de la tête, la longueur et/ou la vitesse d'un serpent déjà créé
  configure({ size, length, maxSpeed } = {}) {
    if (size !== undefined) this.r = size;
    if (maxSpeed !== undefined) this.maxSpeed = maxSpeed;
    this.setLength(length !== undefined ? length : this.rings.length);
    for (const ring of this.rings) ring.tune(this.maxSpeed);
  }

  // ajoute ou retire des anneaux à la queue, entre MIN_RINGS et MAX_RINGS
  setLength(n) {
    const target = Math.round(Math.min(Snake.MAX_RINGS, Math.max(Snake.MIN_RINGS, n)));
    while (this.rings.length < target) {
      const tail = this.rings.length ? this.rings[this.rings.length - 1] : this;
      const ring = new SnakeRing(tail.pos.x - this.spacing, tail.pos.y, this.r);
      ring.tune(this.maxSpeed);
      this.rings.push(ring);
    }
    this.rings.length = target;
    this.rings.forEach((ring, i) => { ring.r = this.ringRadius(i + 1); });
  }

  // la tête puis les anneaux : tout ce qui doit éviter les autres véhicules
  parts() {
    return [this, ...this.rings];
  }

  // forces de la tête, déjà pondérées : { follow, separate, wander, bounds }. others : les autres
  // véhicules (sans les parties de ce serpent) ; bounds : { w, h } du canvas, ou null.
  // Le wander n'est calculé que si son poids n'est pas nul.
  // path peut être null (mode arène, sans circuit) : pas de force de suivi. obstacles : cercles
  // { pos, r } à contourner avec Steering.avoid (l'algorithme de 6-ObstacleAvoidance).
  headForces(others, path, bounds = null, obstacles = []) {
    return {
      follow: path ? this.follow(path).mult(this.followPathWeight) : createVector(0, 0),
      avoid: Steering.avoidWith(this, obstacles, this.avoidConfig).mult(this.avoidWeight),
      separate: this.separate(others).mult(this.separateWeight),
      wander: this.wanderWeight > 0 ? this.wander().mult(this.wanderWeight) : createVector(0, 0),
      bounds: bounds
        ? Steering.stayInside(this, 0, 0, bounds.w, bounds.h, Snake.BOUNDS_MARGIN).mult(Snake.BOUNDS_WEIGHT)
        : createVector(0, 0),
    };
  }

  // une image : forces de la tête, locomotion, puis chaque anneau
  step(others, path, bounds = null, obstacles = []) {
    const forces = this.headForces(others, path, bounds, obstacles);
    this.applyForce(forces.follow);
    this.applyForce(forces.avoid);
    this.applyForce(forces.separate);
    this.applyForce(forces.wander);
    this.applyForce(forces.bounds);
    this.update();
    if (this.vel.mag() > 0.1) this.facing = this.vel.heading();
    const spacing = this.spacing;
    this.rings.forEach((ring, i) => {
      const leader = i === 0 ? this : this.rings[i - 1];
      ring.tune(this.maxSpeed);
      ring.applyForce(ring.chase(leader, spacing));
      ring.applyForce(ring.separate(others).mult(this.separateWeight));
      ring.applyForce(Steering.avoidWith(ring, obstacles, this.avoidConfig).mult(this.avoidWeight));
      ring.update();
    });
  }

  // sortie de la langue entre 0 et 1 : un petit coup de langue à chaque période (time en secondes)
  tongueOut(time) {
    const phase = ((time % Snake.TONGUE_PERIOD) + Snake.TONGUE_PERIOD) % Snake.TONGUE_PERIOD;
    return phase < Snake.TONGUE_FLICK ? Math.sin((phase / Snake.TONGUE_FLICK) * Math.PI) : 0;
  }

  // ---- dessin direct sur le contexte 2D ----

  show(ctx, time = 0) {
    ctx.save();
    const n = this.rings.length;
    // ombre portée du corps, sous tous les anneaux
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    for (const ring of this.rings) {
      ctx.beginPath();
      ctx.arc(ring.pos.x + 3, ring.pos.y + 4, ring.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = n; i >= 1; i--) {
      const ring = this.rings[i - 1];
      const leader = i === 1 ? this : this.rings[i - 2];
      const angle = Math.atan2(leader.pos.y - ring.pos.y, leader.pos.x - ring.pos.x);
      const style = SnakeSkins.ringStyle(this.skin, i, n);
      // anneau ovale, allongé dans le sens du corps
      ctx.beginPath();
      ctx.ellipse(ring.pos.x, ring.pos.y, ring.r * 1.18, ring.r, angle, 0, Math.PI * 2);
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.lineWidth = Math.max(1, ring.r * 0.16);
      ctx.strokeStyle = style.stroke;
      ctx.stroke();
      // écaille : un arc clair sur le dos de l'anneau
      ctx.beginPath();
      ctx.arc(ring.pos.x, ring.pos.y, ring.r * 0.62, angle + Math.PI - 0.9, angle + Math.PI + 0.9);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = Math.max(1, ring.r * 0.1);
      ctx.stroke();
      if (style.accent) {
        ctx.beginPath();
        ctx.arc(ring.pos.x, ring.pos.y, ring.r * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = style.accent;
        ctx.fill();
      }
    }
    this.showHead(ctx, time);
    ctx.restore();
  }

  showHead(ctx, time) {
    const r = this.r;
    const style = SnakeSkins.headStyle(this.skin);
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.facing);
    // langue fourchue
    const tongue = this.tongueOut(time);
    if (tongue > 0) {
      const base = r * 0.9;
      const tip = base + r * 0.9 * tongue;
      ctx.beginPath();
      ctx.moveTo(base, 0);
      ctx.lineTo(tip, 0);
      ctx.moveTo(tip, 0);
      ctx.lineTo(tip + r * 0.3, -r * 0.22);
      ctx.moveTo(tip, 0);
      ctx.lineTo(tip + r * 0.3, r * 0.22);
      ctx.strokeStyle = '#ff3d6e';
      ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.stroke();
    }
    ctx.fillStyle = style.accent;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = Math.max(1, r * 0.14);
    this.showOrnament(ctx, r);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.stroke();
    this.showEyes(ctx, r);
    ctx.restore();
  }

  // ornement derrière la tête, dans le repère de la tête (+x = museau)
  showOrnament(ctx, r) {
    switch (this.skin.head) {
      case 'horns':
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(r * 0.05, side * r * 0.6);
          ctx.lineTo(-r * 0.55, side * r * 1.55);
          ctx.lineTo(r * 0.5, side * r * 0.85);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        break;
      case 'crest':
        for (const angle of [-0.55, 0, 0.55]) {
          ctx.beginPath();
          const a = Math.PI + angle;
          ctx.moveTo(Math.cos(a - 0.3) * r * 0.8, Math.sin(a - 0.3) * r * 0.8);
          ctx.lineTo(Math.cos(a) * r * 1.7, Math.sin(a) * r * 1.7);
          ctx.lineTo(Math.cos(a + 0.3) * r * 0.8, Math.sin(a + 0.3) * r * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        break;
      case 'ears':
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(-r * 0.15, side * r * 0.9, r * 0.38, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        break;
      default:
        break;
    }
  }

  showEyes(ctx, r) {
    for (const side of [-1, 1]) {
      const x = r * 0.38;
      const y = side * r * 0.45;
      ctx.beginPath();
      if (this.skin.eye === 'slit') {
        ctx.ellipse(x, y, r * 0.3, r * 0.26, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd23f';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + r * 0.04, y, r * 0.07, r * 0.22, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#101018';
        ctx.fill();
      } else {
        ctx.arc(x, y, r * 0.27, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + r * 0.08, y, r * 0.13, 0, Math.PI * 2);
        ctx.fillStyle = '#101018';
        ctx.fill();
      }
    }
  }

  // debug : cercle de séparation (rayon r × 2) autour de la tête et de chaque anneau, jaune par
  // défaut, rouge quand un autre véhicule est à l'intérieur. N'utilise que des distances déjà
  // définies par separate() ; aucune force n'est recalculée.
  showDebug(ctx, others, obstacles = []) {
    ctx.save();
    if (this.avoidConfig.mode === 'rayons') {
      // les rayons de prédiction : verts s'ils sont libres, rouges jusqu'à leur point d'impact
      for (const ray of Steering.castRays(this, obstacles, this.avoidConfig)) {
        ctx.strokeStyle = ray.hit ? '#e5352b' : '#2fb34a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.pos.x, this.pos.y);
        ctx.lineTo(ray.end.x, ray.end.y);
        ctx.stroke();
        if (ray.hit) {
          ctx.fillStyle = '#e5352b';
          ctx.beginPath();
          ctx.arc(ray.end.x, ray.end.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // vecteurs ahead (jaune) et ahead2 (violet) de l'évitement, comme dans 6-ObstacleAvoidance
      for (const [ratio, color] of [[Steering.AHEAD, '#e6b800'], [Steering.AHEAD * Steering.AHEAD2_RATIO, '#8a3ffc']]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.pos.x, this.pos.y);
        ctx.lineTo(this.pos.x + this.vel.x * ratio, this.pos.y + this.vel.y * ratio);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1.5;
    for (const part of this.parts()) {
      const radius = part.r * 2;
      const inside = others.some(other => p5.Vector.dist(part.pos, other.pos) < radius);
      ctx.strokeStyle = inside ? '#e5352b' : '#d9a400';
      ctx.beginPath();
      ctx.arc(part.pos.x, part.pos.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
