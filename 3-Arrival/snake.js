// Le serpent : sa TÊTE est le véhicule (this.pos, this.vel), suivie d'anneaux SnakeRing qui
// sont eux aussi des véhicules. Chaque image :
//   1. le monde choisit une cible pour la tête (sélection de l'action) et lui applique la force
//      retournée par arrive() / wander() / … (steering) ;
//   2. update(dt) déplace la tête avec la locomotion fournie (Vehicle.update), puis chaque anneau
//      suit celui qui le précède avec arrive(précédent, espacement).
// Manger crée une « bosse » qui descend le long du corps (avalement) ; arrivée à la queue, elle
// fait grandir (ou rétrécir) le serpent. Un piment donne un turbo de quelques secondes.
// Les durées sont en secondes.
class Snake extends Vehicle {
  static MIN_RINGS = 3;
  static MAX_RINGS = 120;
  static BULGE_SPEED = 16; // anneaux parcourus par seconde
  static BOOST_FACTOR = 1.6;
  static TONGUE_PERIOD = 2.2;
  static TONGUE_FLICK = 0.35;

  constructor(x, y, skin, options = {}) {
    super(x, y);
    this.skin = skin;
    this.rings = [];
    this.bulges = [];
    this.boost = 0;
    this.time = 0;
    this.facing = 0;
    this.hungry = false;
    this.target = null;
    this.label = '';
    this.biteCooldown = 0;
    this.tuning = { speed: 6, force: 0.35, braking: 120, spacing: 14, size: 14 };
    this.configure(options);
    this.setLength(options.length ?? 18);
  }

  // réglages : speed (vitesse max de la tête), force (force max), braking (rayon de freinage
  // d'arrive), spacing (distance entre anneaux), size (rayon de la tête)
  configure(options) {
    for (const key of Object.keys(this.tuning)) {
      if (options[key] !== undefined) this.tuning[key] = options[key];
    }
    this.r = this.tuning.size;
    this.maxForce = this.tuning.force;
    this.rayonZoneDeFreinage = this.tuning.braking;
    this.applySpeed();
  }

  applySpeed() {
    this.maxSpeed = this.tuning.speed * (this.boost > 0 ? Snake.BOOST_FACTOR : 1);
    for (const ring of this.rings) ring.tune(this.maxSpeed, this.tuning.spacing);
  }

  get length() {
    return this.rings.length;
  }

  get tail() {
    return this.rings.length ? this.rings[this.rings.length - 1] : this;
  }

  // ajoute ou retire des anneaux à la queue, entre MIN_RINGS et MAX_RINGS
  setLength(n) {
    const target = Math.round(Math.min(Snake.MAX_RINGS, Math.max(Snake.MIN_RINGS, n)));
    while (this.rings.length < target) {
      const tail = this.tail;
      const before = this.rings.length >= 2 ? this.rings[this.rings.length - 2] : this;
      const dir = tail === this ? createVector(-Math.cos(this.facing), -Math.sin(this.facing)) : p5.Vector.sub(tail.pos, before.pos);
      if (dir.mag() === 0) dir.set(-Math.cos(this.facing), -Math.sin(this.facing));
      dir.setMag(this.tuning.spacing);
      const ring = new SnakeRing(tail.pos.x + dir.x, tail.pos.y + dir.y);
      ring.tune(this.maxSpeed, this.tuning.spacing);
      this.rings.push(ring);
    }
    this.rings.length = target;
  }

  grow(delta) {
    this.setLength(this.rings.length + delta);
  }

  // point où la nourriture est avalée : au bout du museau, dans la direction du regard
  mouth() {
    const reach = this.r * 1.35;
    return createVector(this.pos.x + Math.cos(this.facing) * reach, this.pos.y + Math.sin(this.facing) * reach);
  }

  get mouthRadius() {
    return this.r * 0.9 + 6;
  }

  // la tête arrive sur la cible (offset : distance d'arrêt avant la cible, cf. arrive fourni)
  steerTo(target, offset = 0) {
    this.target = target.copy();
    return this.arrive(target, offset);
  }

  // effets d'une nourriture avalée ; la croissance se fait quand la bosse atteint la queue
  eat(kind) {
    const info = Food.KINDS[kind];
    if (!info) throw new RangeError(`Nourriture inconnue : ${kind}.`);
    this.bulges.push({ at: 0, grow: info.grow });
    if (info.boost) {
      this.boost = Math.max(this.boost, info.boost);
      this.applySpeed();
    }
    return info;
  }

  update(dt) {
    super.update();
    if (this.vel.mag() > 0.3) {
      const diff = Math.atan2(Math.sin(this.vel.heading() - this.facing), Math.cos(this.vel.heading() - this.facing));
      this.facing += diff * 0.35;
    }
    const spacing = this.tuning.spacing;
    this.rings.forEach((ring, i) => {
      const leader = i === 0 ? this.pos : this.rings[i - 1].pos;
      ring.applyForce(ring.follow(leader, spacing));
      ring.update();
    });

    this.time += dt;
    if (this.boost > 0) {
      this.boost = Math.max(0, this.boost - dt);
      if (this.boost === 0) this.applySpeed();
    }
    for (const bulge of this.bulges) bulge.at += Snake.BULGE_SPEED * dt;
    const arrived = this.bulges.filter(bulge => bulge.at > this.rings.length);
    if (arrived.length) {
      this.bulges = this.bulges.filter(bulge => bulge.at <= this.rings.length);
      for (const bulge of arrived) this.grow(bulge.grow);
    }
  }

  // ---- apparence (calculs purs) ----

  // diamètre de l'anneau i (1 = derrière la tête) : le corps s'affine vers la queue et gonfle
  // au passage d'une bosse
  ringDiameter(i) {
    const n = this.rings.length;
    const t = n > 1 ? (i - 1) / (n - 1) : 0;
    const base = 2 * this.r * (0.95 - 0.5 * t ** 1.4);
    let swell = 1;
    for (const bulge of this.bulges) swell += 0.6 * Math.exp(-((i - bulge.at) ** 2) / 2.5);
    return base * swell;
  }

  ringStyle(i, images) {
    const colors = Skins.ringColors(this.skin, i, this.rings.length);
    return {
      diameter: this.ringDiameter(i),
      fill: colors.fill,
      stroke: colors.stroke,
      icon: Skins.hasIcon(this.skin, i) && images ? images.icons[this.skin.id] ?? null : null,
    };
  }

  // sortie de la langue entre 0 et 1 : sortie en continu si de la nourriture est à portée,
  // sinon un petit coup de langue à chaque période
  tongueOut() {
    if (this.hungry) return 1;
    const phase = this.time % Snake.TONGUE_PERIOD;
    return phase < Snake.TONGUE_FLICK ? Math.sin((phase / Snake.TONGUE_FLICK) * Math.PI) : 0;
  }

  show(images, ctx) {
    // clignote pendant le répit qui suit une morsure
    if (this.biteCooldown > 0 && Math.floor(this.biteCooldown * 10) % 2 === 0) ctx.globalAlpha = 0.45;
    if (this.skin.glow) this.showGlow(ctx);
    for (let i = this.rings.length; i >= 1; i--) {
      const ring = this.rings[i - 1];
      const leader = i === 1 ? this.pos : this.rings[i - 2].pos;
      ring.show(this.ringStyle(i, images), ctx, Math.atan2(leader.y - ring.pos.y, leader.x - ring.pos.x));
    }
    const size = this.r * 3.2;
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.facing);
    // langue fourchue
    const tongue = this.tongueOut();
    if (tongue > 0) {
      const base = this.r * 1.3;
      const tip = base + this.r * 1.1 * tongue;
      stroke('#ff3d6e');
      strokeWeight(Math.max(1.5, this.r * 0.14));
      noFill();
      line(base, 0, tip, 0);
      line(tip, 0, tip + this.r * 0.35, -this.r * 0.25);
      line(tip, 0, tip + this.r * 0.35, this.r * 0.25);
    }
    // aura du turbo
    if (this.boost > 0) {
      noStroke();
      fill(255, 140, 40, 60 + 40 * Math.sin(this.time * 18));
      circle(0, 0, size * 1.15);
    }
    if (!Skins.drawCentered(ctx, images.heads[this.skin.id], size)) {
      noStroke();
      fill(this.skin.head[0]);
      circle(0, 0, this.r * 2);
    }
    pop();
    ctx.globalAlpha = 1;
  }

  // Lueur des designs lumineux : deux traits larges et translucides le long du corps (un seul
  // tracé par serpent). Bien moins coûteux que ctx.shadowBlur ou qu'un sprite par anneau.
  showGlow(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.pos.x, this.pos.y);
    for (const ring of this.rings) ctx.lineTo(ring.pos.x, ring.pos.y);
    const width = 2 * this.r;
    ctx.strokeStyle = Skins.rgba(this.skin.glow, 0.1);
    ctx.lineWidth = width * 2;
    ctx.stroke();
    ctx.strokeStyle = Skins.rgba(this.skin.glow, 0.16);
    ctx.lineWidth = width * 1.45;
    ctx.stroke();
    ctx.restore();
  }

  // debug : flags { braking, vectors, perception, rings, labels }, attraction : rayon,
  // foodInside : vrai si une nourriture est dans le rayon d'attraction
  showDebug(flags, attraction, foodInside, ctx) {
    push();
    if (flags.rings) {
      stroke(255, 255, 255, 110);
      strokeWeight(1);
      let previous = this.pos;
      this.rings.forEach((ring, i) => {
        line(previous.x, previous.y, ring.pos.x, ring.pos.y);
        noStroke();
        fill(255, 255, 255, 160);
        circle(ring.pos.x, ring.pos.y, 4);
        if ((i + 1) % 5 === 0) text(i + 1, ring.pos.x + 5, ring.pos.y - 5);
        stroke(255, 255, 255, 110);
        previous = ring.pos;
      });
    }
    if (flags.braking && this.target) {
      noFill();
      stroke(255, 255, 255, 140);
      ctx.setLineDash([6, 6]);
      circle(this.target.x, this.target.y, this.rayonZoneDeFreinage * 2);
      line(this.pos.x, this.pos.y, this.target.x, this.target.y);
      ctx.setLineDash([]);
      stroke('#ff5c7a');
      line(this.target.x - 7, this.target.y, this.target.x + 7, this.target.y);
      line(this.target.x, this.target.y - 7, this.target.x, this.target.y + 7);
    }
    if (flags.perception) {
      const mouth = this.mouth();
      noFill();
      strokeWeight(1.5);
      stroke(foodInside ? '#ff4d4d' : '#ffd84d');
      circle(mouth.x, mouth.y, attraction * 2);
      stroke(255, 255, 255, 150);
      circle(mouth.x, mouth.y, this.mouthRadius * 2);
    }
    if (flags.vectors) {
      stroke('#7CFFB2');
      strokeWeight(2);
      line(this.pos.x, this.pos.y, this.pos.x + this.vel.x * 8, this.pos.y + this.vel.y * 8);
    }
    if (flags.labels && this.label) {
      noStroke();
      fill(0, 0, 0, 150);
      const w = textWidth(this.label) + 12;
      rect(this.pos.x - w / 2, this.pos.y - this.r * 2.6 - 16, w, 18, 6);
      fill(255);
      textAlign(CENTER, CENTER);
      text(this.label, this.pos.x, this.pos.y - this.r * 2.6 - 7);
    }
    pop();
  }
}
