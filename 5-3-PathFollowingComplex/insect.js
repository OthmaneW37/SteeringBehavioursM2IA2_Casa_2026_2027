// Un insecte : il remplace la boule du Vehicle fourni. C'est une sous-classe de Vehicle : il garde
// follow(), separate(), wander() et la locomotion de vehicle.js, et ne change que le dessin
// (render). Cinq espèces dessinées en vue de dessus, museau vers +x : coccinelle, scarabée, fourmi,
// abeille (ailes qui battent) et sauterelle. Les pattes marchent au rythme de la distance
// parcourue (stride), donc un insecte arrêté ne bouge plus les pattes.
class Insect extends Vehicle {
  static SPECIES = {
    coccinelle: { label: 'Coccinelle', speed: [1, 2.2] },
    scarabee: { label: 'Scarabée', speed: [1, 2] },
    fourmi: { label: 'Fourmi', speed: [1.4, 3] },
    abeille: { label: 'Abeille', speed: [1.8, 3] },
    sauterelle: { label: 'Sauterelle', speed: [1.2, 2.6] },
  };
  static NAMES = Object.keys(Insect.SPECIES);
  static STRIDE_PER_PIXEL = 0.35;
  static AVOID_WEIGHT = 3;
  static BOUNDS_WEIGHT = 1.5;
  static BOUNDS_MARGIN = 40;
  static SCARE_WEIGHT = 3;
  static WANDER_STEP = 0.1;
  static FREE_WANDER = 0.4; // errance minimale quand il n'y a pas de circuit (assez douce pour laisser les essaims se former)

  // rng() retourne un nombre dans [0, 1[
  static randomSpecies(rng) {
    return Insect.NAMES[Math.min(Insect.NAMES.length - 1, Math.floor(rng() * Insect.NAMES.length))];
  }

  constructor(x, y, maxSpeed, maxForce, species = 'coccinelle') {
    super(x, y, maxSpeed, maxForce);
    if (!Insect.SPECIES[species]) throw new RangeError(`Espèce inconnue : ${species}.`);
    this.species = species;
    this.stride = 0;
    this.facing = 0;
    this.pathMaxLength = 0;
    // errance par petits pas d'angle (7-Boids : 0.1) et toujours symétriques : l'insecte change de cap
    // doucement au lieu de zigzaguer (Vehicle tire sinon un pas de -0.3 à 0.3, de signe imprévisible)
    this.displaceRange = Insect.WANDER_STEP;
  }

  get label() {
    return Insect.SPECIES[this.species].label;
  }

  // la locomotion est celle de Vehicle ; on y ajoute la marche et l'orientation
  update() {
    super.update();
    this.stride += this.vel.mag() * Insect.STRIDE_PER_PIXEL;
    if (this.vel.mag() > 0.05) this.facing = this.vel.heading();
  }

  // force d'évitement des obstacles (l'algorithme de 6-ObstacleAvoidance), pondérée
  avoidForce(obstacles, config = null) {
    return Steering.avoidWith(this, obstacles, config).mult(Insect.AVOID_WEIGHT);
  }

  // comportement des boids de 7-Boids, mais seulement avec les insectes de la MÊME espèce : les
  // abeilles volent avec les abeilles, les fourmis avec les fourmis. Forces déjà pondérées.
  flockForces(insects, config) {
    const mates = insects.filter(o => o !== this && o.species === this.species);
    return {
      align: Steering.flockAlign(this, mates, config.radius).mult(config.alignWeight),
      cohesion: Steering.flockCohesion(this, mates, config.radius).mult(config.cohesionWeight),
      separation: Steering.flockSeparation(this, mates, config.radius).mult(config.separationWeight),
    };
  }

  applyFlock(insects, config) {
    const forces = this.flockForces(insects, config);
    this.applyForce(forces.align);
    this.applyForce(forces.cohesion);
    this.applyForce(forces.separation);
  }

  // peur : fuit la tête de serpent la plus proche si elle est à moins de radius (sinon aucune force)
  scareForce(snakes, radius) {
    let nearest = null;
    let best = Infinity;
    for (const snake of snakes) {
      const d = Math.hypot(this.pos.x - snake.pos.x, this.pos.y - snake.pos.y);
      if (d < best) {
        best = d;
        nearest = snake;
      }
    }
    if (!nearest) return createVector(0, 0);
    return Steering.flee(this, nearest.pos, radius).mult(Insect.SCARE_WEIGHT);
  }

  // garde-fou : l'insecte reste dans le canvas (bounds : { w, h }), avec ou sans circuit
  boundsForce(bounds) {
    return Steering.stayInside(this, 0, 0, bounds.w, bounds.h, Insect.BOUNDS_MARGIN).mult(Insect.BOUNDS_WEIGHT);
  }

  // mode arène, sans circuit : l'insecte erre (wander), s'écarte des autres (separate), contourne
  // les obstacles et reste dans le canvas. bounds : { w, h }
  applyFree(crowd, obstacles, bounds, config = null) {
    this.applyForce(this.wander().mult(Math.max(this.wanderWeight, Insect.FREE_WANDER)));
    this.applyForce(this.separate(crowd).mult(this.separateWeight));
    this.applyForce(this.avoidForce(obstacles, config));
    this.applyForce(this.boundsForce(bounds));
  }

  // angle de balancement de la patte k (0..5) : les pattes de côtés opposés sont en opposition
  legSwing(k) {
    return Math.sin(this.stride + (k % 2 === 0 ? 0 : Math.PI) + Math.floor(k / 2) * 2.1) * 0.5;
  }

  render() {
    this.draw(drawingContext);
  }

  // dessin sur un contexte 2D (injectable)
  draw(ctx) {
    const s = this.r;
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.facing);
    // ombre portée
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    ctx.ellipse(s * 0.15, s * 0.35, s * 1.15, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (this.species !== 'abeille') this.drawLegs(ctx, s);
    Insect.BODIES[this.species](ctx, s, this);
    ctx.restore();
  }

  drawLegs(ctx, s) {
    const jump = this.species === 'sauterelle';
    ctx.strokeStyle = jump ? '#2f6a2a' : '#1c1c22';
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const x = s * (0.45 - Math.floor(k / 2) * 0.45);
      const swing = this.legSwing(k);
      const reach = s * (jump && k >= 4 ? 1.3 : 0.95);
      ctx.moveTo(x, side * s * 0.25);
      ctx.lineTo(x + Math.sin(swing) * s * 0.7, side * reach);
    }
    ctx.stroke();
  }
}

// dessin du corps de chaque espèce (s = rayon de l'insecte)
Insect.BODIES = {
  coccinelle(ctx, s) {
    ctx.fillStyle = '#16161c';
    ctx.beginPath();
    ctx.arc(s * 0.85, 0, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e5352b';
    ctx.strokeStyle = '#16161c';
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.95, s * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.7, 0);
    ctx.lineTo(-s * 0.95, 0);
    ctx.stroke();
    ctx.fillStyle = '#16161c';
    for (const [x, y] of [[0.3, -0.4], [0.3, 0.4], [-0.25, -0.5], [-0.25, 0.5], [-0.6, -0.2], [-0.6, 0.2]]) {
      ctx.beginPath();
      ctx.arc(x * s, y * s, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  scarabee(ctx, s) {
    ctx.fillStyle = '#1b2a2f';
    ctx.beginPath();
    ctx.ellipse(s * 0.95, 0, s * 0.4, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1b2a2f';
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(s * 1.2, -s * 0.2);
    ctx.lineTo(s * 1.7, -s * 0.45);
    ctx.moveTo(s * 1.2, s * 0.2);
    ctx.lineTo(s * 1.7, s * 0.45);
    ctx.stroke();
    const shell = ctx.createLinearGradient(0, -s, 0, s);
    shell.addColorStop(0, '#2ad1a3');
    shell.addColorStop(1, '#1d4fa8');
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.ellipse(-s * 0.1, 0, s * 1.1, s * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.beginPath();
    ctx.moveTo(s * 0.8, 0);
    ctx.lineTo(-s * 1.2, 0);
    ctx.stroke();
  },
  fourmi(ctx, s) {
    ctx.fillStyle = '#4a2a1a';
    for (const [x, rx, ry] of [[-0.95, 0.75, 0.55], [0.1, 0.5, 0.38], [0.8, 0.42, 0.4]]) {
      ctx.beginPath();
      ctx.ellipse(x * s, 0, rx * s, ry * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#4a2a1a';
    ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.beginPath();
    ctx.moveTo(s * 1.1, -s * 0.15);
    ctx.lineTo(s * 1.6, -s * 0.5);
    ctx.moveTo(s * 1.1, s * 0.15);
    ctx.lineTo(s * 1.6, s * 0.5);
    ctx.stroke();
  },
  abeille(ctx, s, insect) {
    const flap = 0.55 + 0.35 * Math.sin(insect.stride * 2.5 + 1);
    ctx.fillStyle = 'rgba(210, 235, 255, 0.55)';
    ctx.strokeStyle = 'rgba(120, 150, 190, 0.7)';
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-s * 0.05, side * s * 0.95, s * 0.8, s * 0.5 * flap, side * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#16161c';
    ctx.beginPath();
    ctx.arc(s * 0.95, 0, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-s * 0.1, 0, s * 1.05, s * 0.7, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#ffcf33';
    ctx.fillRect(-s * 1.3, -s, s * 2.6, s * 2);
    ctx.fillStyle = '#16161c';
    for (const x of [-0.7, -0.15, 0.4]) ctx.fillRect(x * s, -s, s * 0.28, s * 2);
    ctx.restore();
    ctx.fillStyle = '#16161c';
    ctx.beginPath();
    ctx.moveTo(-s * 1.1, 0);
    ctx.lineTo(-s * 1.4, -s * 0.12);
    ctx.lineTo(-s * 1.4, s * 0.12);
    ctx.closePath();
    ctx.fill();
  },
  sauterelle(ctx, s) {
    ctx.fillStyle = '#7fd04a';
    ctx.strokeStyle = '#2f6a2a';
    ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.beginPath();
    ctx.ellipse(-s * 0.2, 0, s * 1.5, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(s * 1.25, 0, s * 0.45, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#101018';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 1.45, side * s * 0.25, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#2f6a2a';
    ctx.beginPath();
    ctx.moveTo(s * 1.55, -s * 0.15);
    ctx.lineTo(s * 2.3, -s * 0.7);
    ctx.moveTo(s * 1.55, s * 0.15);
    ctx.lineTo(s * 2.3, s * 0.7);
    ctx.stroke();
  },
};
