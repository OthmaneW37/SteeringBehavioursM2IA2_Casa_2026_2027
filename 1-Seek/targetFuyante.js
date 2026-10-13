// Cible fuyante : sous-classe de Vehicle (par Target puis PointTarget) qui fuit le véhicule
// le plus proche quand il entre dans son cercle de détection.
// - Détection : un véhicule à moins de detectionRadius (200 px par défaut, réglable)
//   déclenche la fuite. En mode debug (touche « d »), le cercle de détection est dessiné :
//   jaune, ou rouge quand un véhicule est à l'intérieur.
// - Fuite : la cible utilise la méthode héritée flee() contre le véhicule le plus proche.
//   Pendant la fuite elle accélère (force max multipliée) et sa vitesse max augmente
//   progressivement. Elle fuit jusqu'à être à ESCAPE_DISTANCE (300 px) du prédateur, puis
//   reprend son comportement normal : celui de Target par défaut.
// - Endurance : elle ne peut pas fuir plus de maxEndurance secondes (2,5 s par défaut,
//   réglable). Épuisée, elle se repose et ne repart qu'avec la moitié de son endurance.
//   Une barre d'endurance est dessinée au-dessus de la cible.
// - Reproduction (optionnelle) : après splitAfter secondes de fuite cumulées, la cible
//   demande à se diviser en deux (wantsToSplit) ; TargetGroup crée la seconde cible.
// Le canvas est un tore : le véhicule le plus proche peut l'être à travers un bord.
// Les durées sont en secondes : update(dt) reçoit le temps écoulé depuis l'image précédente.
class TargetFuyante extends PointTarget {
  static ESCAPE_DISTANCE = 300;      // distance à atteindre pour cesser de fuir
  static SPEED_BOOST = 2;            // vitesse max multipliée par 2 au bout de RAMP_SECONDS
  static FORCE_BOOST = 4;            // force max (accélération) multipliée pendant la fuite
  static RAMP_SECONDS = 1;
  static RECOVERY_RATE = 0.5;        // secondes d'endurance regagnées par seconde de repos
  static RESUME_FRACTION = 0.5;      // une cible épuisée repart à 50 % d'endurance
  static BAR_WIDTH = 40;
  static BAR_HEIGHT = 6;
  static debug = false;              // affiche le cercle de détection

  constructor(x, y) {
    super(x, y);
    this.detectionRadius = 200;
    this.maxEndurance = 2.5;
    this.endurance = this.maxEndurance;
    this.reproduces = false;
    this.splitAfter = 3;
    this.threats = [];               // véhicules à fuir (tableau partagé avec le sketch)
    this.resetFlight();
    // maxSpeed et maxForce restent les valeurs « normales » quand on les règle ; pendant la
    // fuite, Vehicle.update() et flee() lisent les valeurs augmentées
    this.baseSpeed = this.maxSpeed;
    this.baseForce = this.maxForce;
    Object.defineProperty(this, 'maxSpeed', {
      get: () => this.baseSpeed * this.speedFactor(),
      set: value => { this.baseSpeed = value; },
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(this, 'maxForce', {
      get: () => this.baseForce * (this.fleeing ? TargetFuyante.FORCE_BOOST : 1),
      set: value => { this.baseForce = value; },
      enumerable: true,
      configurable: true,
    });
  }

  resetFlight() {
    this.endurance = this.maxEndurance;
    this.fleeing = false;
    this.tired = false;
    this.threatened = false;
    this.fleeTime = 0;           // durée de la fuite en cours
    this.totalFleeTime = 0;      // fuite cumulée depuis la dernière division
    this.flightVelocity = null;  // vitesse de fuite, protégée des secousses de Target
  }

  // détection, endurance et reproduction réglées depuis le menu
  configureFlight({ detection, endurance, reproduction, splitAfter }) {
    this.detectionRadius = detection;
    this.maxEndurance = endurance;
    this.endurance = Math.min(this.endurance, endurance);
    this.reproduces = reproduction;
    this.splitAfter = splitAfter;
  }

  // vitesse max qui augmente progressivement pendant la fuite
  speedFactor() {
    if (!this.fleeing) return 1;
    const ramp = Math.min(1, this.fleeTime / TargetFuyante.RAMP_SECONDS);
    return 1 + (TargetFuyante.SPEED_BOOST - 1) * ramp;
  }

  // la cible cesse de fuir à 300 px, ou plus loin si le cercle de détection est plus grand
  escapeDistance() {
    return Math.max(TargetFuyante.ESCAPE_DISTANCE, this.detectionRadius);
  }

  // Véhicule le plus proche, à travers les bords si c'est plus court : distance et position
  // de son image la plus proche (c'est elle que la cible fuit). null sans véhicule.
  nearestThreat() {
    const periodX = width + 2 * this.r;
    const periodY = height + 2 * this.r;
    let nearest = null;
    for (const vehicle of this.threats) {
      const dx = Steering.wrapDelta(this.pos.x - vehicle.pos.x, periodX);
      const dy = Steering.wrapDelta(this.pos.y - vehicle.pos.y, periodY);
      const distance = Math.hypot(dx, dy);
      if (!nearest || distance < nearest.distance) {
        nearest = { vehicle, distance, image: createVector(this.pos.x - dx, this.pos.y - dy) };
      }
    }
    return nearest;
  }

  // Décide de fuir ou non, et gère l'endurance.
  updateFlightState(threat, dt) {
    this.threatened = threat !== null && threat.distance < this.detectionRadius;
    if (this.fleeing) {
      this.endurance = Math.max(0, this.endurance - dt);
      const safe = threat === null || threat.distance >= this.escapeDistance();
      if (this.endurance <= 0) this.tired = true;
      if (safe || this.tired || !this.autonomous) this.fleeing = false;
    } else {
      this.endurance = Math.min(this.maxEndurance, this.endurance + dt * TargetFuyante.RECOVERY_RATE);
      if (this.tired && this.endurance >= this.maxEndurance * TargetFuyante.RESUME_FRACTION) this.tired = false;
      if (this.threatened && this.autonomous && !this.tired && this.endurance > 0) this.fleeing = true;
    }
  }

  // dt : secondes écoulées depuis l'image précédente (deltaTime de p5 dans le navigateur)
  update(dt = TargetFuyante.frameSeconds()) {
    if (this.fixedRadius !== null) this.r = this.fixedRadius;
    const threat = this.nearestThreat();
    this.updateFlightState(threat, dt);
    if (!this.fleeing) {
      this.fleeTime = 0;
      this.flightVelocity = null;
      super.update();   // comportement normal : celui de Target par défaut (ou le curseur)
      return;
    }
    this.fleeTime += dt;
    this.totalFleeTime += dt;
    // Pilotage pur : on ignore les secousses aléatoires de Target. Son setInterval remplace
    // la vitesse et l'accélération toutes les secondes ; pendant la fuite on garde la nôtre.
    if (this.flightVelocity && this.vel !== this.flightVelocity) this.vel = this.flightVelocity;
    this.acc.set(0, 0);
    this.applyForce(this.flee(threat.image));
    Vehicle.prototype.update.call(this);
    this.flightVelocity = this.vel;
  }

  // temps de l'image en secondes, borné pour qu'un onglet en arrière-plan ne crée pas de saut
  static frameSeconds() {
    const ms = typeof deltaTime === 'number' && deltaTime > 0 ? deltaTime : 1000 / 60;
    return Math.min(ms, 100) / 1000;
  }

  wantsToSplit() {
    return this.reproduces && this.totalFleeTime >= this.splitAfter;
  }

  // division refusée (trop de cibles) : on recompte une nouvelle période de fuite
  postponeSplit() {
    this.totalFleeTime = 0;
  }

  // Se divise : child devient la seconde moitié. Les deux s'écartent de part et d'autre de la
  // direction de fuite, partent à ±45° et repartent avec une endurance pleine. Elles ne sont
  // plus en fuite : leur vitesse ne dépasse pas leur vitesse normale.
  splitInto(child) {
    const heading = Math.atan2(this.vel.y, this.vel.x);
    const speed = Math.min(Math.max(1, this.vel.mag()), this.baseSpeed);
    const offsetX = -Math.sin(heading) * this.r;
    const offsetY = Math.cos(heading) * this.r;
    child.pos.set(this.pos.x - offsetX, this.pos.y - offsetY);
    this.pos.set(this.pos.x + offsetX, this.pos.y + offsetY);
    this.vel.set(Math.cos(heading + Math.PI / 4) * speed, Math.sin(heading + Math.PI / 4) * speed);
    child.vel.set(Math.cos(heading - Math.PI / 4) * speed, Math.sin(heading - Math.PI / 4) * speed);
    child.threats = this.threats;
    this.resetFlight();
    child.resetFlight();
  }

  // Barre d'endurance au-dessus de la cible (géométrie et couleur, testables sans p5).
  enduranceBar() {
    const fraction = this.maxEndurance > 0 ? this.endurance / this.maxEndurance : 0;
    let color = 'limegreen';
    if (this.tired) color = 'orange';
    else if (fraction < 0.3) color = 'red';
    return {
      x: this.pos.x - TargetFuyante.BAR_WIDTH / 2,
      y: this.pos.y - this.r - 14,
      width: TargetFuyante.BAR_WIDTH,
      height: TargetFuyante.BAR_HEIGHT,
      fraction,
      color,
    };
  }

  // couleur du cercle de détection en mode debug
  detectionColor() {
    return this.threatened ? 'red' : 'yellow';
  }

  show() {
    super.show();
    push();
    if (TargetFuyante.debug) {
      noFill();
      stroke(this.detectionColor());
      strokeWeight(2);
      circle(this.pos.x, this.pos.y, this.detectionRadius * 2);
    }
    const bar = this.enduranceBar();
    noStroke();
    fill(0, 170);
    rect(bar.x - 1, bar.y - 1, bar.width + 2, bar.height + 2);
    fill(bar.color);
    rect(bar.x, bar.y, bar.width * bar.fraction, bar.height);
    pop();
  }
}
