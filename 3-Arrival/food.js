// Nourriture : un véhicule qui reste posé (arrive vers sa place) jusqu'à ce qu'une bouche de
// serpent entre dans le rayon d'attraction. Elle est alors aspirée : seek() vers la bouche, avec
// une vitesse et une force maximales qui grandissent à mesure qu'elle s'approche (effet aimant).
// L'aspiration utilise arrive() (rayon PULL_BRAKING) : la nourriture ralentit sur la bouche au
// lieu de la dépasser, sinon à pleine vitesse elle pourrait sauter par-dessus.
// Au contact de la bouche, elle est avalée : elle rapetisse en suivant la bouche, puis disparaît.
// États : idle (posée) → attracted (aspirée) → swallowed (avalée) → eaten (à recycler).
// Si la bouche s'éloigne avant, attracted → idle : elle se repose là où elle se trouve.
// Les durées sont en secondes. Le choix de la bouche la plus proche est fait par le monde.
class Food extends Vehicle {
  // grow : anneaux gagnés (négatif = perdus), score, boost : secondes de turbo, weight : fréquence
  static KINDS = {
    pomme: { label: 'Pomme', grow: 1, score: 1, weight: 0.55, color: '#ff4b55' },
    piment: { label: 'Piment', grow: 1, score: 2, boost: 3, weight: 0.15, color: '#ff7a2f' },
    etoile: { label: 'Étoile', grow: 3, score: 5, weight: 0.12, color: '#ffd23f' },
    champignon: { label: 'Champignon', grow: -3, score: 1, weight: 0.18, color: '#b07cff' },
  };
  static SPAWN_TIME = 0.35;
  static SWALLOW_TIME = 0.18;
  static IDLE_SPEED = 2;
  static IDLE_FORCE = 0.3;
  // aspiration : bornes de vitesse et de force entre le bord du rayon (0) et la bouche (1)
  static PULL_SPEED = [3, 18];
  static PULL_FORCE = [0.5, 3];
  static PULL_BRAKING = 50;
  static IDLE_BRAKING = 100;

  // tirage pondéré d'une sorte de nourriture ; rng() renvoie un nombre dans [0, 1[
  static randomKind(rng) {
    const kinds = Object.entries(Food.KINDS);
    const total = kinds.reduce((sum, [, kind]) => sum + kind.weight, 0);
    let pick = rng() * total;
    for (const [name, kind] of kinds) {
      pick -= kind.weight;
      if (pick < 0) return name;
    }
    return kinds[kinds.length - 1][0];
  }

  constructor(x, y, kind = 'pomme') {
    super(x, y);
    this.reset(x, y, kind);
  }

  // remise à neuf, pour recycler l'instance au lieu d'en créer une nouvelle
  reset(x, y, kind) {
    if (!Food.KINDS[kind]) throw new RangeError(`Nourriture inconnue : ${kind}.`);
    this.kind = kind;
    this.pos.set(x, y);
    this.vel.set(0, 0);
    this.acc.set(0, 0);
    this.home = createVector(x, y);
    this.state = 'idle';
    this.age = 0;
    this.swallowLeft = 0;
    this.eater = null;
    this.r = 14;
    this.phase = (x * 0.013 + y * 0.007) % (Math.PI * 2);
    this.maxSpeed = Food.IDLE_SPEED;
    this.maxForce = Food.IDLE_FORCE;
    return this;
  }

  get info() {
    return Food.KINDS[this.kind];
  }

  get done() {
    return this.state === 'eaten';
  }

  // aspiration vers la bouche ; closeness = 0 au bord du rayon, 1 contre la bouche
  attractTo(mouth, closeness) {
    const c = Math.min(1, Math.max(0, closeness));
    this.state = 'attracted';
    this.maxSpeed = Food.PULL_SPEED[0] + (Food.PULL_SPEED[1] - Food.PULL_SPEED[0]) * c;
    this.maxForce = Food.PULL_FORCE[0] + (Food.PULL_FORCE[1] - Food.PULL_FORCE[0]) * c;
    this.rayonZoneDeFreinage = Food.PULL_BRAKING;
    return this.arrive(mouth);
  }

  // hors de portée : reste (ou se repose) à sa place avec arrive
  settle() {
    if (this.state === 'attracted') {
      this.state = 'idle';
      this.home = this.pos.copy();
    }
    this.maxSpeed = Food.IDLE_SPEED;
    this.maxForce = Food.IDLE_FORCE;
    this.rayonZoneDeFreinage = Food.IDLE_BRAKING;
    return this.arrive(this.home);
  }

  beginSwallow(eater) {
    this.state = 'swallowed';
    this.eater = eater;
    this.swallowLeft = Food.SWALLOW_TIME;
    this.maxSpeed = 40;
    this.maxForce = 40;
  }

  // pendant l'avalement, la nourriture reste collée à la bouche (seek très fort)
  followMouth(mouth) {
    return this.seek(mouth);
  }

  update(dt) {
    super.update();
    this.age += dt;
    if (this.state === 'swallowed') {
      this.swallowLeft -= dt;
      if (this.swallowLeft <= 0) this.state = 'eaten';
    }
  }

  // apparence (calcul pur) : échelle d'apparition « rebondie », rétrécissement dans la bouche,
  // petit flottement quand elle est posée
  appearance(time) {
    const t = Math.min(1, this.age / Food.SPAWN_TIME);
    const c1 = 1.70158;
    let scale = 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2;
    if (this.state === 'swallowed') scale *= Math.max(0, this.swallowLeft / Food.SWALLOW_TIME);
    if (this.state === 'attracted') scale *= 1.12;
    const bob = this.state === 'idle' ? Math.sin(time * 3 + this.phase) * 3 : 0;
    return { scale, bob, size: this.r * 2.6 * scale };
  }

  show(images, ctx, time) {
    const look = this.appearance(time);
    if (look.size <= 0.5) return;
    push();
    translate(this.pos.x, this.pos.y);
    // ombre douce au sol
    noStroke();
    fill(0, 0, 0, 70);
    ellipse(0, this.r * 1.1, look.size * 0.7, look.size * 0.22);
    translate(0, look.bob);
    if (this.state === 'attracted') rotate(Math.sin(time * 30) * 0.25);
    if (!Skins.drawCentered(ctx, images.food[this.kind], look.size)) {
      fill(this.info.color);
      circle(0, 0, look.size * 0.8);
    }
    pop();
  }

  showDebug() {
    push();
    stroke(255, 255, 255, 90);
    noFill();
    circle(this.home.x, this.home.y, 6);
    if (this.state === 'attracted' || this.state === 'swallowed') {
      stroke('#7CFFB2');
      strokeWeight(2);
      line(this.pos.x, this.pos.y, this.pos.x + this.vel.x * 4, this.pos.y + this.vel.y * 4);
    }
    pop();
  }
}
