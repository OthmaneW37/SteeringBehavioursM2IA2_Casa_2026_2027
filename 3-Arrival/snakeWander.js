// Serpent adverse qui erre (comme SnakeWander de 3-Arrival_correction) : sa tête n'a pas de
// cible, elle utilise le wander() fourni par vehicle.js (pas de copie). Un point glisse sur un
// cercle placé devant la tête (distanceCercle, wanderRadius) ; à chaque image son angle ne bouge
// que d'un petit pas aléatoire (displaceRange), donc la direction varie de façon continue.
// La force de wander est combinée (somme pondérée) avec Steering.stayInside pour rester dans la
// scène : le boundaries() fourni retourne une vitesse désirée, pas une force limitée.
// Les anneaux suivent la tête avec arrive(), exactement comme pour Snake.
// Vie : chaque morsure du joueur retire 1 point (avec HIT_COOLDOWN secondes d'invulnérabilité).
// États : « erre » tant que sa vie dépasse FLEE_RATIO ; en dessous, « fuit » la tête du joueur
// la plus proche si elle est à moins de FLEE_RADIUS (fuite à rayon : elle s'arrête au-delà),
// sinon elle reprend l'errance. À 0 point de vie, elle est vaincue (le monde la retire).
class SnakeWander extends Snake {
  static WEIGHTS = { wander: 1, bounds: 1.5, flee: 1.4 };
  static MARGIN = 80;
  static HIT_COOLDOWN = 0.6;
  static FLEE_RATIO = 0.34;
  static FLEE_RADIUS = 220;

  // options : celles de Snake + wanderRadius, wanderDistance, wanderJitter
  constructor(x, y, skin, options = {}) {
    super(x, y, skin, options);
    this.wanderDebug = null;
    this.configureWander(options);
    this.maxHealth = options.health ?? 4;
    this.health = this.maxHealth;
    this.hitCooldown = 0;
    this.state = 'wander';
  }

  // nouveau maximum : la vie garde la même proportion
  setMaxHealth(max) {
    if (max === this.maxHealth) return;
    this.health = Math.max(1, Math.round((this.health / this.maxHealth) * max));
    this.maxHealth = max;
  }

  get healthRatio() {
    return this.health / this.maxHealth;
  }

  get defeated() {
    return this.health <= 0;
  }

  // morsure du joueur : retourne vrai si le coup a porté (hors invulnérabilité)
  takeHit(damage = 1) {
    if (this.hitCooldown > 0 || this.defeated) return false;
    this.health = Math.max(0, this.health - damage);
    this.hitCooldown = SnakeWander.HIT_COOLDOWN;
    return true;
  }

  update(dt) {
    super.update(dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
  }

  // barre de vie au-dessus de la tête (calcul pur) : géométrie, part remplie et couleur
  healthBar() {
    const w = this.r * 3.2;
    const ratio = Math.max(0, Math.min(1, this.healthRatio));
    let color = '#5ee37a';
    if (ratio <= 0.34) color = '#ff4d4d';
    else if (ratio <= 0.67) color = '#ffd84d';
    return { x: this.pos.x - w / 2, y: this.pos.y - this.r * 2.4 - 6, w, h: 6, fill: w * ratio, ratio, color,
      flash: this.hitCooldown > 0 };
  }

  // les noms des propriétés sont ceux de vehicle.js, que wander() utilise
  configureWander({ wanderRadius, wanderDistance, wanderJitter }) {
    if (wanderRadius !== undefined) this.wanderRadius = wanderRadius;
    if (wanderDistance !== undefined) this.distanceCercle = wanderDistance;
    if (wanderJitter !== undefined) this.displaceRange = wanderJitter;
  }

  // géométrie du wander à cette image (pour le debug), calculée comme dans vehicle.js
  // avant l'appel : centre du cercle devant la tête et point vert sur le cercle
  wanderGeometry() {
    const center = this.vel.copy().setMag(this.distanceCercle).add(this.pos);
    const theta = this.wanderTheta + this.vel.heading();
    const point = createVector(center.x + this.wanderRadius * Math.cos(theta), center.y + this.wanderRadius * Math.sin(theta));
    return { center, point };
  }

  // force de wander héritée de Vehicle (norme maxForce, vers le point sur le cercle)
  wanderForce() {
    this.wanderDebug = this.wanderGeometry();
    this.target = null;
    return this.wander();
  }

  // sélection de l'action propre à l'adversaire : errer, ou fuir s'il est blessé et menacé,
  // sans sortir de la scène (w × h). threat : position de la tête du joueur la plus proche, ou null
  steerAlone(w, h, threat = null) {
    const weights = SnakeWander.WEIGHTS;
    const scared = threat && this.healthRatio <= SnakeWander.FLEE_RATIO
      && Math.hypot(threat.x - this.pos.x, threat.y - this.pos.y) < SnakeWander.FLEE_RADIUS;
    this.state = scared ? 'flee' : 'wander';
    if (scared) {
      this.wanderDebug = null;
      this.target = null;
      this.applyForce(Steering.flee(this, threat, SnakeWander.FLEE_RADIUS).mult(weights.flee));
    } else {
      this.applyForce(this.wanderForce().mult(weights.wander));
    }
    this.applyForce(Steering.stayInside(this, 0, 0, w, h, SnakeWander.MARGIN).mult(weights.bounds));
    const label = scared ? 'adversaire · fuit' : 'adversaire · erre';
    this.label = this.boost > 0 ? `${label} · turbo` : label;
  }

  show(images, ctx) {
    // flash blanc au moment d'une morsure
    if (this.hitCooldown > SnakeWander.HIT_COOLDOWN * 0.6) ctx.globalAlpha = 0.5;
    super.show(images, ctx);
    ctx.globalAlpha = 1;
    const bar = this.healthBar();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(bar.x - 1, bar.y - 1, bar.w + 2, bar.h + 2);
    ctx.fillStyle = bar.flash ? '#ffffff' : bar.color;
    ctx.fillRect(bar.x, bar.y, bar.fill, bar.h);
    // une graduation par point de vie
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    for (let i = 1; i < this.maxHealth; i++) ctx.fillRect(bar.x + (bar.w * i) / this.maxHealth - 0.5, bar.y, 1, bar.h);
  }

  showDebug(flags, attraction, foodInside, ctx) {
    super.showDebug(flags, attraction, foodInside, ctx);
    if (!flags.wander || !this.wanderDebug) return;
    const { center, point } = this.wanderDebug;
    push();
    // mêmes codes couleur que l'exemple 4-Wander
    stroke(255, 255, 255, 80);
    strokeWeight(2);
    ctx.setLineDash([5, 15]);
    line(this.pos.x, this.pos.y, center.x, center.y);
    ctx.setLineDash([]);
    noFill();
    stroke(255);
    strokeWeight(1);
    circle(center.x, center.y, this.wanderRadius * 2);
    noStroke();
    fill('red');
    circle(center.x, center.y, 8);
    fill('green');
    circle(point.x, point.y, 16);
    stroke('yellow');
    line(this.pos.x, this.pos.y, point.x, point.y);
    pop();
  }
}
