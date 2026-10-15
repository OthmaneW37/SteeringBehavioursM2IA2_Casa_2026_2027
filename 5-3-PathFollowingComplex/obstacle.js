// Un obstacle. C'est un véhicule immobile (maxSpeed 0) : il ne se déplace pas, mais il est visible,
// donc il étend Vehicle. L'évitement de 6-ObstacleAvoidance ne connaît que des cercles
// ({ pos, r }) : un obstacle non circulaire est donc fait de plusieurs cercles « colliders ».
//   rocher  : un cercle ;            étang  : un grand cercle ;
//   buisson : trois cercles groupés ; mur   : une rangée de cercles, orientée par `angle`.
// size est le rayon de base ; changer size ou angle recalcule les colliders.
class Obstacle extends Vehicle {
  static TYPES = {
    rocher: { label: 'Rocher' },
    etang: { label: 'Étang' },
    buisson: { label: 'Buisson' },
    mur: { label: 'Mur' },
  };
  static NAMES = Object.keys(Obstacle.TYPES);
  static WALL_CIRCLES = 5;

  static randomType(rng) {
    return Obstacle.NAMES[Math.min(Obstacle.NAMES.length - 1, Math.floor(rng() * Obstacle.NAMES.length))];
  }

  constructor(x, y, type = 'rocher', size = 28, angle = 0) {
    super(x, y, 0, 0);
    if (!Obstacle.TYPES[type]) throw new RangeError(`Type d'obstacle inconnu : ${type}.`);
    this.type = type;
    this.size = size;
    this.angle = angle;
    this.vel.set(0, 0);
    this.pathMaxLength = 0;
    this.regular = false;
  }

  get label() {
    return Obstacle.TYPES[this.type].label;
  }

  // cercles { dx, dy, r } autour du centre, avant rotation
  layout() {
    const s = this.size;
    switch (this.type) {
      case 'etang': return [{ dx: 0, dy: 0, r: s * 1.5 }];
      case 'buisson': return [{ dx: 0, dy: 0, r: s * 0.7 }, { dx: s * 0.8, dy: s * 0.15, r: s * 0.55 }, { dx: -s * 0.65, dy: -s * 0.35, r: s * 0.55 }];
      case 'mur': {
        const n = Obstacle.WALL_CIRCLES;
        return Array.from({ length: n }, (_, i) => ({ dx: (i - (n - 1) / 2) * s * 0.85, dy: 0, r: s * 0.45 }));
      }
      default: return [{ dx: 0, dy: 0, r: s }];
    }
  }

  // les cercles que l'évitement doit contourner : { pos, r }
  colliders() {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return this.layout().map(c => ({
      pos: createVector(this.pos.x + c.dx * cos - c.dy * sin, this.pos.y + c.dx * sin + c.dy * cos),
      r: c.r,
    }));
  }

  // rayon d'un cercle qui contient tout l'obstacle (pour le placer sans chevauchement)
  get extent() {
    return Math.max(...this.layout().map(c => Math.hypot(c.dx, c.dy) + c.r));
  }

  show(ctx, time = 0) {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);
    Obstacle.DRAW[this.type](ctx, this, time);
    ctx.restore();
  }

  // debug : les cercles réellement utilisés par l'évitement
  showDebug(ctx) {
    ctx.save();
    ctx.strokeStyle = '#e5352b';
    ctx.lineWidth = 1.5;
    for (const c of this.colliders()) {
      ctx.beginPath();
      ctx.arc(c.pos.x, c.pos.y, c.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

Obstacle.DRAW = {
  rocher(ctx, o) {
    const s = o.size;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(s * 0.12, s * 0.2, s, s * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8b9099';
    ctx.strokeStyle = '#4d525b';
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = s * (0.86 + 0.14 * Math.sin(i * 2.7 + o.size));
      i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, -s * 0.3, s * 0.35, s * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  },
  etang(ctx, o, time) {
    const r = o.size * 1.5;
    ctx.fillStyle = '#c9b48a';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.08, 0, Math.PI * 2);
    ctx.fill();
    const water = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    water.addColorStop(0, '#6fd0ff');
    water.addColorStop(1, '#2b7fd0');
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const phase = (time * 0.5 + k / 3) % 1;
      ctx.globalAlpha = 1 - phase;
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.2 + 0.7 * phase), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#3f9a4a';
    ctx.beginPath();
    ctx.ellipse(r * 0.45, -r * 0.3, r * 0.2, r * 0.13, 0.5, 0, Math.PI * 2);
    ctx.fill();
  },
  buisson(ctx, o) {
    for (const c of o.layout()) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.beginPath();
      ctx.arc(c.dx + 3, c.dy + 4, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of o.layout()) {
      ctx.fillStyle = '#2f8a3f';
      ctx.strokeStyle = '#1f5f2c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.dx, c.dy, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e5352b';
      for (const [a, k] of [[0.6, 0.5], [2.4, 0.6], [4.2, 0.45]]) {
        ctx.beginPath();
        ctx.arc(c.dx + Math.cos(a) * c.r * k, c.dy + Math.sin(a) * c.r * k, c.r * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  mur(ctx, o) {
    const s = o.size;
    const half = ((Obstacle.WALL_CIRCLES - 1) / 2) * s * 0.85;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.roundRect(-half - s * 0.45 + 3, -s * 0.45 + 4, half * 2 + s * 0.9, s * 0.9, s * 0.3);
    ctx.fill();
    ctx.fillStyle = '#8a5a34';
    ctx.strokeStyle = '#4e3119';
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.beginPath();
    ctx.roundRect(-half - s * 0.45, -s * 0.45, half * 2 + s * 0.9, s * 0.9, s * 0.3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    for (let i = 1; i < Obstacle.WALL_CIRCLES; i++) {
      const x = (i - (Obstacle.WALL_CIRCLES - 1) / 2 - 0.5) * s * 0.85;
      ctx.moveTo(x, -s * 0.45);
      ctx.lineTo(x, s * 0.45);
    }
    ctx.stroke();
  },
};
