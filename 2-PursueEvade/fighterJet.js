// Avion de chasse : sous-classe de Vehicle qui poursuit l'avion rapide.
// Actions :
// - Poursuite : il vise le point d'interception de l'avion (Steering.interceptPoint) avec le
//   seek() hérité de Vehicle, limité par maxForce.
// - Post-combustion : quand l'avion est à plus de afterburnerDistance, il pousse sa vitesse max
//   jusqu'à afterburnerFactor fois. Le carburant (fuel, en secondes) se vide pendant la poussée
//   et se recharge ensuite ; à sec, la post-combustion ne revient qu'à 40 % de carburant.
// - Verrouillage et tir : l'avion doit rester dans le cône du nez (lockAngle) et à portée
//   (lockRange) pendant lockTime secondes. lockProgress monte de 0 à 1 ; à 1, le chasseur
//   demande un tir (wantsToFire). AirBattle crée le missile puis appelle registerShot().
// - Séparation : les chasseurs s'écartent les uns des autres (Reynolds) au lieu de se superposer.
// Le canvas est un tore : les distances et directions suivent le plus court chemin.
// Les durées sont en secondes ; think(..., dt, ...) avance d'un pas de simulation.
class FighterJet extends Vehicle {
  static FUEL_MAX = 4;                  // secondes de post-combustion
  static REFUEL_RATE = 0.5;             // secondes de carburant regagnées par seconde
  static RESUME_FRACTION = 0.4;         // carburant nécessaire pour relancer après être à sec
  static BOOST_SMOOTHING = 0.08;        // lissage de la montée en poussée
  static SEPARATION_WEIGHT = 1.5;

  constructor(x, y) {
    super(x, y);
    this.r = 18;
    this.baseSpeed = 6.5;
    this.baseForce = 0.35;
    this.maxSpeed = this.baseSpeed;
    this.maxForce = this.baseForce;
    this.separationRadius = 90;

    this.afterburnerEnabled = true;
    this.afterburnerFactor = 1.6;
    this.afterburnerDistance = 300;
    this.fuel = FighterJet.FUEL_MAX;
    this.fuelEmpty = false;              // vrai après être resté à sec
    this.afterburning = false;
    this.boost = 0;                      // poussée lissée de 0 à 1

    this.missilesEnabled = true;
    this.maxAmmo = 4;
    this.ammo = 4;
    this.missileCooldown = 3;            // secondes entre deux tirs
    this.cooldown = 0;
    this.lockRange = 380;
    this.lockAngle = (25 * Math.PI) / 180;
    this.lockTime = 0.8;
    this.lockProgress = 0;               // de 0 à 1
    this.locked = false;
    this.wantsToFire = false;
  }

  // réglages du menu ; les munitions suivent le maximum (on en ajoute ou on en retire)
  configure({ speed, afterburner, missiles, ammo, lockRange, lockTime }) {
    this.baseSpeed = speed;
    this.afterburnerEnabled = afterburner;
    this.missilesEnabled = missiles;
    this.ammo = Math.min(Math.max(0, this.ammo + ammo - this.maxAmmo), ammo);
    this.maxAmmo = ammo;
    this.lockRange = lockRange;
    this.lockTime = lockTime;
  }

  heading() {
    return Math.atan2(this.vel.y, this.vel.x);
  }

  // Carburant et poussée : la post-combustion s'allume quand l'avion est loin.
  updateAfterburner(distance, dt) {
    const wanted = this.afterburnerEnabled && distance > this.afterburnerDistance;
    if (this.fuelEmpty && this.fuel >= FighterJet.FUEL_MAX * FighterJet.RESUME_FRACTION) this.fuelEmpty = false;
    this.afterburning = wanted && this.fuel > 0 && !this.fuelEmpty;
    if (this.afterburning) {
      this.fuel = Math.max(0, this.fuel - dt);
      if (this.fuel === 0) {
        this.fuelEmpty = true;
        this.afterburning = false;
      }
    } else {
      this.fuel = Math.min(FighterJet.FUEL_MAX, this.fuel + dt * FighterJet.REFUEL_RATE);
    }
    this.boost += ((this.afterburning ? 1 : 0) - this.boost) * FighterJet.BOOST_SMOOTHING;
  }

  // Verrouillage : l'avion doit rester dans le cône du nez, à portée, pendant lockTime.
  updateLock(delta, distance, dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.wantsToFire = false;
    const inCone = delta !== null && distance <= this.lockRange &&
      Steering.angleBetween(this.vel, delta) <= this.lockAngle;
    const canShoot = this.missilesEnabled && this.ammo > 0 && this.cooldown <= 0;
    if (inCone && canShoot) {
      this.lockProgress = Math.min(1, this.lockProgress + dt / this.lockTime);
    } else {
      this.lockProgress = Math.max(0, this.lockProgress - dt * 2);
    }
    this.locked = this.lockProgress >= 1;
    this.wantsToFire = this.locked && canShoot;
  }

  // appelé par AirBattle une fois le missile créé
  registerShot() {
    this.ammo -= 1;
    this.cooldown = this.missileCooldown;
    this.lockProgress = 0;
    this.locked = false;
    this.wantsToFire = false;
  }

  // Force de séparation : s'écarter des chasseurs trop proches (pondérée par 1 / d²).
  separation(fighters, w, h) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const other of fighters) {
      if (other === this) continue;
      const delta = Steering.shortestDelta(other.pos, this.pos, w, h, this.r);
      const distance = Math.hypot(delta.x, delta.y);
      if (distance === 0 || distance >= this.separationRadius) continue;
      sumX += delta.x / (distance * distance);
      sumY += delta.y / (distance * distance);
      count++;
    }
    if (count === 0) return createVector(0, 0);
    const desired = createVector(sumX, sumY);
    desired.setMag(this.maxSpeed);
    const force = p5.Vector.sub(desired, this.vel);
    force.limit(this.maxForce);
    return force;
  }

  // plane : l'avion rapide (ou null) ; fighters : tous les chasseurs ; dt en secondes
  think(plane, fighters, dt, w, h) {
    const target = plane && plane.alive ? plane : null;
    const delta = target ? Steering.shortestDelta(this.pos, target.pos, w, h, this.r) : null;
    const distance = delta ? Math.hypot(delta.x, delta.y) : Infinity;
    this.updateAfterburner(distance, dt);
    this.maxSpeed = this.baseSpeed * (1 + (this.afterburnerFactor - 1) * this.boost);
    this.maxForce = this.baseForce * (1 + 0.5 * this.boost);
    this.updateLock(delta, distance, dt);
    if (target) {
      this.applyForce(this.seek(Steering.interceptPoint(this, target, w, h)));
    } else {
      // sans cible, le chasseur patrouille droit devant lui à sa vitesse de croisière
      const length = Math.hypot(this.vel.x, this.vel.y) || 1;
      this.applyForce(this.seek(createVector(
        this.pos.x + (this.vel.x / length) * 100, this.pos.y + (this.vel.y / length) * 100)));
    }
    this.applyForce(this.separation(fighters, w, h).mult(FighterJet.SEPARATION_WEIGHT));
  }

  show({ debug = false } = {}) {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.heading());
    // flamme de post-combustion, plus longue avec la poussée
    if (this.boost > 0.05) {
      noStroke();
      const length = (14 + Math.random() * 6) * this.boost + 4;
      fill(255, 120, 30, 200);
      triangle(-this.r * 0.8, -3.5, -this.r * 0.8 - length, 0, -this.r * 0.8, 3.5);
      fill(255, 240, 180, 230);
      triangle(-this.r * 0.8, -1.8, -this.r * 0.8 - length * 0.55, 0, -this.r * 0.8, 1.8);
    }
    // silhouette d'avion de chasse à ailes delta
    stroke(20);
    strokeWeight(1.5);
    fill(this.locked ? color(120, 150, 190) : color(95, 120, 160));
    beginShape();
    vertex(this.r * 1.3, 0);
    vertex(this.r * 0.2, -this.r * 0.25);
    vertex(-this.r * 0.9, -this.r * 0.95);
    vertex(-this.r * 0.8, -this.r * 0.2);
    vertex(-this.r * 1.0, 0);
    vertex(-this.r * 0.8, this.r * 0.2);
    vertex(-this.r * 0.9, this.r * 0.95);
    vertex(this.r * 0.2, this.r * 0.25);
    endShape(CLOSE);
    fill(170, 220, 255);
    noStroke();
    ellipse(this.r * 0.35, 0, this.r * 0.7, this.r * 0.28);
    pop();
    this.showStatus();
    if (debug) this.showDebug();
  }

  // barre de carburant de post-combustion (sous le chasseur) et munitions (points au-dessus)
  showStatus() {
    push();
    noStroke();
    const width = 30;
    const x = this.pos.x - width / 2;
    const y = this.pos.y + this.r + 8;
    fill(0, 150);
    rect(x - 1, y - 1, width + 2, 6);
    fill(this.fuelEmpty ? color(255, 160, 40) : color(90, 200, 255));
    rect(x, y, width * (this.fuel / FighterJet.FUEL_MAX), 4);
    for (let i = 0; i < this.maxAmmo; i++) {
      fill(i < this.ammo ? color(255, 90, 70) : color(70, 70, 80));
      circle(this.pos.x - (this.maxAmmo - 1) * 3.5 + i * 7, this.pos.y - this.r - 8, 4.5);
    }
    pop();
  }

  // mode debug : cône et portée de verrouillage, jaune puis rouge une fois verrouillé
  showDebug() {
    push();
    noFill();
    strokeWeight(1);
    stroke(this.locked ? color(255, 60, 60) : color(255, 255, 0, 150));
    const heading = this.heading();
    arc(this.pos.x, this.pos.y, this.lockRange * 2, this.lockRange * 2,
      heading - this.lockAngle, heading + this.lockAngle, PIE);
    pop();
  }
}
