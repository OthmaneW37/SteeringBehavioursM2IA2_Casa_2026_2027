// Avion rapide : sous-classe de la Target fournie (target.js), poursuivi par les chasseurs.
// États :
// - 'cruise' : vol de croisière à cruiseSpeed, avec de légers virages aléatoires (des forces).
// - 'evading' : un chasseur est entré dans le rayon de détection (rayonDetection de Target) ;
//   l'avion le fuit avec prédiction (Steering.flee depuis son point d'interception) et pousse sa
//   vitesse max de 40 %.
// - 'breaking' : un missile verrouillé sur l'avion est à moins de flareTrigger. L'avion fait un
//   dégagement : il tourne à angle droit de la ligne de visée du missile pendant jinkDuration
//   secondes avec une force triplée, puis change de côté s'il est encore menacé (zigzag). Il
//   largue un leurre (flare) toutes les flareCooldown secondes tant que son stock n'est pas vide.
// - 'piloted' : l'avion suit la position pilotAt (la souris) ; les leurres se larguent à la main.
// Touché, l'avion explose (die) puis réapparaît (respawn) après respawnDelay secondes, protégé
// par un bouclier quelques secondes. Il signale ce qu'il veut faire (wantsToDropFlare) ;
// AirBattle crée le leurre puis appelle registerFlare(). Durées en secondes.
class AvionRapide extends Target {
  static EVADE_BOOST = 0.4;          // vitesse max en plus pendant l'évasion
  static JINK_FORCE_FACTOR = 3;
  static SHIELD_SECONDS = 1.5;
  static BOOST_SMOOTHING = 0.1;

  constructor(x, y) {
    super(x, y);
    this.r = 20;
    this.cruiseSpeed = 7;
    this.baseForce = 0.4;
    this.maxSpeed = this.cruiseSpeed;
    this.maxForce = this.baseForce;
    this.rayonDetection = 240;
    this.rng = Math.random;

    this.alive = true;
    this.respawnDelay = 2.5;
    this.respawnTimer = 0;
    this.shield = 0;

    this.state = 'cruise';
    this.boost = 0;
    this.pilotAt = null;              // { x, y } quand l'avion est piloté à la souris

    this.flaresEnabled = true;
    this.flareMax = 6;
    this.flareStock = 6;
    this.flareCooldown = 0.5;
    this.flareTimer = 0;
    this.flareTrigger = 260;
    this.wantsToDropFlare = false;
    this.manualFlare = false;         // largage demandé par le pilote

    this.jink = 0;                    // secondes restantes du dégagement en cours
    this.jinkDuration = 0.9;
    this.jinkSide = 1;
    this.threatened = false;          // un chasseur est dans le rayon de détection
  }

  // signal thermique vu par les missiles : l'avion vaut 1, un avion détruit 0
  heat() {
    return this.alive ? 1 : 0;
  }

  // réglages du menu ; le stock suit le maximum (on en ajoute ou on en retire)
  configure({ speed, detection, flares, flareStock, flareTrigger }) {
    this.cruiseSpeed = speed;
    this.rayonDetection = detection;
    this.flaresEnabled = flares;
    this.flareStock = Math.min(Math.max(0, this.flareStock + flareStock - this.flareMax), flareStock);
    this.flareMax = flareStock;
    this.flareTrigger = flareTrigger;
  }

  heading() {
    return Math.atan2(this.vel.y, this.vel.x);
  }

  // chasseur le plus proche (distance sur le tore), ou null
  nearestFighter(fighters, w, h) {
    let nearest = null;
    for (const fighter of fighters) {
      const distance = Steering.distance(this.pos, fighter.pos, w, h, this.r);
      if (!nearest || distance < nearest.distance) nearest = { fighter, distance };
    }
    return nearest;
  }

  // missile verrouillé sur l'avion et à moins de flareTrigger, le plus proche d'abord ; ou null
  incomingMissile(missiles, w, h) {
    let incoming = null;
    for (const missile of missiles) {
      if (missile.lock !== this) continue;
      const distance = Steering.distance(this.pos, missile.pos, w, h, this.r);
      if (distance <= this.flareTrigger && (!incoming || distance < incoming.distance)) {
        incoming = { missile, distance };
      }
    }
    return incoming;
  }

  // appelé par AirBattle une fois le leurre créé
  registerFlare() {
    this.flareStock -= 1;
    this.flareTimer = this.flareCooldown;
    this.wantsToDropFlare = false;
    this.manualFlare = false;
  }

  // le pilote demande un leurre (clic ou espace) ; pris en compte au prochain pas
  requestFlare() {
    this.manualFlare = true;
  }

  die() {
    this.alive = false;
    this.respawnTimer = this.respawnDelay;
    this.vel.set(0, 0);
    this.acc.set(0, 0);
    this.wantsToDropFlare = false;
    this.manualFlare = false;
    this.jink = 0;
  }

  // l'avion revient en vol dans la direction heading, avec tous ses leurres et un bouclier
  respawn(x, y, heading) {
    this.alive = true;
    this.pos.set(x, y);
    this.vel.set(Math.cos(heading) * this.cruiseSpeed, Math.sin(heading) * this.cruiseSpeed);
    this.acc.set(0, 0);
    this.flareStock = this.flareMax;
    this.flareTimer = 0;
    this.shield = AvionRapide.SHIELD_SECONDS;
    this.jink = 0;
    this.boost = 0;
    this.state = 'cruise';
  }

  // Dégagement : vitesse désirée perpendiculaire à la ligne de visée du missile.
  breakForce(missile, w, h) {
    const los = Steering.shortestDelta(this.pos, missile.pos, w, h, this.r);
    const length = Math.hypot(los.x, los.y) || 1;
    const desired = createVector((-los.y / length) * this.jinkSide, (los.x / length) * this.jinkSide);
    desired.setMag(this.maxSpeed);
    const force = p5.Vector.sub(desired, this.vel);
    force.limit(this.maxForce);
    return force;
  }

  // Croisière : retient la vitesse de croisière et ajoute un léger virage aléatoire.
  cruiseForce() {
    const length = Math.hypot(this.vel.x, this.vel.y) || 1;
    const desired = createVector(this.vel.x / length, this.vel.y / length);
    desired.setMag(this.cruiseSpeed);
    const force = p5.Vector.sub(desired, this.vel);
    const side = (this.rng() - 0.5) * 2 * this.maxForce * 0.4;
    force.add(createVector((-this.vel.y / length) * side, (this.vel.x / length) * side));
    force.limit(this.maxForce);
    return force;
  }

  // fighters : les chasseurs ; missiles : les missiles en vol ; dt en secondes
  think(fighters, missiles, dt, w, h) {
    if (!this.alive) {
      this.state = 'destroyed';
      return;
    }
    this.shield = Math.max(0, this.shield - dt);
    this.flareTimer = Math.max(0, this.flareTimer - dt);
    this.jink = Math.max(0, this.jink - dt);
    const nearest = this.nearestFighter(fighters, w, h);
    this.threatened = nearest !== null && nearest.distance < this.rayonDetection;
    const incoming = this.pilotAt ? null : this.incomingMissile(missiles, w, h);

    // leurres : automatiquement quand un missile approche, à la main quand l'avion est piloté
    // une demande du pilote attend la fin du délai entre deux leurres, mais tombe si le stock
    // est vide ou les leurres désactivés
    if (!this.flaresEnabled || this.flareStock <= 0) this.manualFlare = false;
    const canDrop = this.flaresEnabled && this.flareStock > 0 && this.flareTimer <= 0;
    this.wantsToDropFlare = canDrop && (incoming !== null || this.manualFlare);

    if (this.pilotAt) this.state = 'piloted';
    else if (incoming) this.state = 'breaking';
    else if (this.threatened) this.state = 'evading';
    else this.state = 'cruise';

    // dégagement : on tourne à angle droit du missile, puis on change de côté (zigzag)
    if (incoming && this.jink === 0) {
      this.jink = this.jinkDuration;
      this.jinkSide = -this.jinkSide;
    }

    const boosting = this.state === 'evading' || this.state === 'breaking';
    this.boost += ((boosting ? 1 : 0) - this.boost) * AvionRapide.BOOST_SMOOTHING;
    this.maxSpeed = this.cruiseSpeed * (1 + AvionRapide.EVADE_BOOST * this.boost);
    this.maxForce = this.baseForce * (1 + this.boost) * (this.jink > 0 ? AvionRapide.JINK_FORCE_FACTOR : 1);

    if (this.state === 'piloted') {
      const aim = Steering.interceptPoint(this, { pos: createVector(this.pilotAt.x, this.pilotAt.y), vel: createVector(0, 0) }, w, h);
      this.applyForce(this.seek(aim));
    } else if (this.state === 'breaking') {
      this.applyForce(this.breakForce(incoming.missile, w, h));
    } else if (this.state === 'evading') {
      // fuite avec prédiction : on fuit le point où le chasseur sera
      const ahead = Steering.interceptPoint(this, nearest.fighter, w, h);
      this.applyForce(Steering.flee(this, ahead));
    } else {
      this.applyForce(this.cruiseForce());
    }
  }

  show({ debug = false } = {}) {
    if (!this.alive) return;
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.heading());
    // flamme des réacteurs pendant l'évasion
    if (this.boost > 0.05) {
      noStroke();
      fill(120, 200, 255, 190);
      const length = (10 + Math.random() * 5) * this.boost + 3;
      triangle(-this.r * 1.1, -4, -this.r * 1.1 - length, 0, -this.r * 1.1, 4);
    }
    // silhouette d'avion de ligne rapide : fuselage, ailes en flèche, dérive
    stroke(20);
    strokeWeight(1.5);
    fill(this.state === 'breaking' ? color(255, 230, 190) : color(240, 244, 250));
    beginShape();
    vertex(this.r * 1.5, 0);
    vertex(this.r * 0.8, -this.r * 0.18);
    vertex(-this.r * 0.2, -this.r * 0.2);
    vertex(-this.r * 0.9, -this.r * 1.1);
    vertex(-this.r * 1.1, -this.r * 1.1);
    vertex(-this.r * 0.8, -this.r * 0.2);
    vertex(-this.r * 1.3, -this.r * 0.15);
    vertex(-this.r * 1.5, -this.r * 0.55);
    vertex(-this.r * 1.6, -this.r * 0.55);
    vertex(-this.r * 1.5, 0);
    vertex(-this.r * 1.6, this.r * 0.55);
    vertex(-this.r * 1.5, this.r * 0.55);
    vertex(-this.r * 1.3, this.r * 0.15);
    vertex(-this.r * 0.8, this.r * 0.2);
    vertex(-this.r * 1.1, this.r * 1.1);
    vertex(-this.r * 0.9, this.r * 1.1);
    vertex(-this.r * 0.2, this.r * 0.2);
    vertex(this.r * 0.8, this.r * 0.18);
    endShape(CLOSE);
    pop();
    // bouclier de réapparition : cercle qui clignote
    if (this.shield > 0 && Math.floor(this.shield * 8) % 2 === 0) {
      push();
      noFill();
      stroke(120, 220, 255, 200);
      strokeWeight(2);
      circle(this.pos.x, this.pos.y, this.r * 3.4);
      pop();
    }
    this.showFlareStock();
    if (debug) this.showDebug();
  }

  // leurres restants : points orange au-dessus de l'avion
  showFlareStock() {
    if (!this.flaresEnabled) return;
    push();
    noStroke();
    for (let i = 0; i < this.flareMax; i++) {
      fill(i < this.flareStock ? color(255, 170, 50) : color(70, 70, 80));
      circle(this.pos.x - (this.flareMax - 1) * 3.5 + i * 7, this.pos.y - this.r - 12, 4.5);
    }
    pop();
  }

  // mode debug : cercle de détection (jaune, rouge si un chasseur est dedans) et seuil des leurres
  showDebug() {
    push();
    noFill();
    strokeWeight(2);
    stroke(this.threatened ? color(255, 60, 60) : color(255, 255, 0));
    circle(this.pos.x, this.pos.y, this.rayonDetection * 2);
    if (this.flaresEnabled) {
      strokeWeight(1);
      stroke(255, 160, 40, 170);
      drawingContext.setLineDash([6, 6]);
      circle(this.pos.x, this.pos.y, this.flareTrigger * 2);
      drawingContext.setLineDash([]);
    }
    pop();
  }
}
