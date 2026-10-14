// Nom de fichier et de classe demandé pour le scénario 2.
// Target hérite de Vehicle : cette cible réutilise la locomotion et flee().
class TargetFutante extends Target {
  constructor(x, y) {
    super(x, y);
    this.detectionRadius = 200;
    this.exitDistance = 300;
    this.maxFleeDuration = 2.5;
    this.state = 'normal';
    this.elapsedFleeMs = 0;
    this.endurance = 1;
    this.threat = null;
    this.detected = false;
    this.normalLimits = null;
  }

  setFleeSettings({ detectionRadius = this.detectionRadius,
    exitDistance = this.exitDistance, maxFleeDuration = this.maxFleeDuration } = {}) {
    const clamp = (value, fallback, min, max) => Number.isFinite(Number(value))
      ? Math.min(max, Math.max(min, Number(value))) : fallback;
    this.detectionRadius = clamp(detectionRadius, this.detectionRadius, 50, 500);
    this.exitDistance = Math.max(this.detectionRadius + 1,
      clamp(exitDistance, this.exitDistance, 100, 800));
    this.maxFleeDuration = clamp(maxFleeDuration, this.maxFleeDuration, 0.5, 10);
  }

  findNearest(vehicles) {
    let nearest = null;
    for (const vehicle of vehicles) {
      const distance = p5.Vector.dist(this.pos, vehicle.pos);
      if (!nearest || distance < nearest.distance) nearest = { vehicle, distance };
    }
    return nearest;
  }

  beginFlee(threat) {
    this.normalLimits = { speed: this.maxSpeed, force: this.maxForce };
    this.maxSpeed *= 2;
    this.maxForce *= 4;
    this.state = 'fleeing';
    this.elapsedFleeMs = 0;
    this.endurance = 1;
    this.threat = threat;
  }

  finishFlee(state) {
    if (this.normalLimits) {
      this.maxSpeed = this.normalLimits.speed;
      this.maxForce = this.normalLimits.force;
      this.vel.limit(this.maxSpeed);
    }
    this.normalLimits = null;
    this.threat = null;
    this.state = state;
    this.endurance = state === 'exhausted' ? 0 : 1;
  }

  resetFlee() {
    this.finishFlee('normal');
    this.elapsedFleeMs = 0;
    this.detected = false;
    this.acc.set(0, 0);
  }

  update(vehicles = [], deltaMilliseconds = 1000 / 60) {
    deltaMilliseconds = Number.isFinite(Number(deltaMilliseconds))
      ? Math.max(0, Number(deltaMilliseconds)) : 0;
    const nearest = this.findNearest(vehicles);
    const distance = nearest ? nearest.distance : Infinity;
    // Tolérance numérique pour les seuils inclusifs après intégration flottante.
    const safelyAway = distance + 1e-9 >= this.exitDistance;
    this.detected = distance <= this.detectionRadius + 1e-9;
    if (this.state === 'exhausted' && safelyAway) this.resetFlee();
    if (this.state === 'normal' && this.detected) this.beginFlee(nearest.vehicle);
    if (this.state === 'fleeing') {
      if (safelyAway) {
        this.finishFlee('normal');
      } else {
        this.threat = nearest.vehicle;
        this.elapsedFleeMs += Math.max(0, Number(deltaMilliseconds) || 0);
        this.endurance = Math.max(0, 1 - this.elapsedFleeMs / (this.maxFleeDuration * 1000));
        if (this.endurance <= 0) this.finishFlee('exhausted');
      }
    }
    if (this.state === 'fleeing') {
      this.advanceAppearance(deltaMilliseconds);
      // Réutiliser exactement le comportement fourni, sans toucher vehicle.js.
      this.applyForce(super.flee(this.threat.pos));
      this.integrate();
    } else {
      super.update(deltaMilliseconds);
    }
  }

  show(debug = false) {
    super.show();
    push();
    if (debug) {
      noFill();
      stroke(this.detected ? 'red' : 'yellow');
      strokeWeight(2);
      circle(this.pos.x, this.pos.y, this.detectionRadius * 2);
    }
    const barWidth = 64;
    const x = this.pos.x - barWidth / 2;
    const y = this.pos.y - this.r - 15;
    noStroke();
    fill('#20242c'); rect(x, y, barWidth, 7);
    fill(this.state === 'exhausted' ? '#ff5555' : '#5ce095');
    rect(x, y, barWidth * this.endurance, 7);
    pop();
  }
}
