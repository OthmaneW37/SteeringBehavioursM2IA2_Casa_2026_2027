// Missile à tête chercheuse infrarouge : sous-classe de Vehicle tirée par un chasseur.
// - Chercheur : il ne voit que les sources de chaleur (l'avion, les leurres) dans un cône devant
//   lui (seekerAngle de chaque côté de sa direction) et à moins de seekerRange. Il vise la
//   source dont le signal est le plus fort : signal = chaleur / distance² (distance en unités de
//   100 px). Un leurre frais, plus chaud que l'avion, peut donc le tromper.
// - Hystérésis : il ne quitte sa source actuelle que si une autre a un signal 25 % plus fort,
//   pour ne pas hésiter d'une image à l'autre.
// - Guidage : il vise le point d'interception de sa source (Steering.interceptPoint) avec seek()
//   hérité, limité par maxForce (l'agilité). Sans source dans le cône il file droit.
// - Moteur : il part à 60 % de sa vitesse max et accélère. Sans carburant il s'autodétruit.
// Une source de chaleur est un objet { pos, vel, r, heat() }. Durées en secondes.
class Missile extends Vehicle {
  static HYSTERESIS = 1.25;
  static LAUNCH_SPEED_FRACTION = 0.6;
  static TRAIL_LENGTH = 22;

  constructor(x, y, heading, owner = null) {
    super(x, y);
    this.r = 6;
    this.owner = owner;
    this.maxSpeed = 13;
    this.maxForce = 0.9;           // agilité
    this.fuel = 5;                 // secondes de moteur
    this.age = 0;
    this.seekerAngle = (70 * Math.PI) / 180;
    this.seekerRange = 450;
    this.proximity = 22;           // distance de déclenchement de la charge
    this.lock = null;              // source de chaleur poursuivie
    this.trail = [];
    this.vel.set(Math.cos(heading), Math.sin(heading));
    this.vel.setMag(this.maxSpeed * Missile.LAUNCH_SPEED_FRACTION);
  }

  // réglages du menu : vitesse, agilité, autonomie (s), angle du cône (degrés)
  configure({ speed, agility, fuel, seekerAngleDegrees }) {
    this.maxSpeed = speed;
    this.maxForce = agility;
    this.fuel = fuel;
    this.seekerAngle = (seekerAngleDegrees * Math.PI) / 180;
  }

  get expired() {
    return this.fuel <= 0;
  }

  heading() {
    return Math.atan2(this.vel.y, this.vel.x);
  }

  // la source est-elle dans le cône du chercheur et à portée ?
  sees(source, w, h) {
    const delta = Steering.shortestDelta(this.pos, source.pos, w, h, this.r);
    const distance = Math.hypot(delta.x, delta.y);
    return distance <= this.seekerRange && Steering.angleBetween(this.vel, delta) <= this.seekerAngle;
  }

  // signal thermique reçu : plus fort pour une source chaude et proche
  signal(source, w, h) {
    const distance = Math.max(20, Steering.distance(this.pos, source.pos, w, h, this.r));
    return source.heat() / ((distance / 100) * (distance / 100));
  }

  // choisit la source à poursuivre parmi celles qu'il voit, avec hystérésis
  acquire(sources, w, h) {
    let best = null;
    let bestSignal = 0;
    for (const source of sources) {
      if (source.heat() <= 0 || !this.sees(source, w, h)) continue;
      const signal = this.signal(source, w, h);
      if (signal > bestSignal) {
        best = source;
        bestSignal = signal;
      }
    }
    const current = this.lock;
    const currentVisible = current !== null && sources.includes(current) && current.heat() > 0 && this.sees(current, w, h);
    if (currentVisible && (best === null || best === current || bestSignal < this.signal(current, w, h) * Missile.HYSTERESIS)) {
      return current;
    }
    return best;
  }

  // dt : secondes écoulées ; sources : sources de chaleur du ciel (avion et leurres)
  think(dt, sources, w, h) {
    this.age += dt;
    this.fuel -= dt;
    this.lock = this.acquire(sources, w, h);
    if (this.lock) {
      this.applyForce(this.seek(Steering.interceptPoint(this, this.lock, w, h)));
    } else {
      // pas de source dans le cône : le moteur pousse tout droit
      const length = Math.hypot(this.vel.x, this.vel.y) || 1;
      this.applyForce(this.seek(createVector(
        this.pos.x + (this.vel.x / length) * 100, this.pos.y + (this.vel.y / length) * 100)));
    }
    this.trail.push({ x: this.pos.x, y: this.pos.y });
    if (this.trail.length > Missile.TRAIL_LENGTH) this.trail.shift();
  }

  // la charge se déclenche à moins de proximity (+ demi-rayon de la source)
  contacts(source, w, h) {
    return Steering.distance(this.pos, source.pos, w, h, this.r) <= this.proximity + source.r * 0.5;
  }

  show({ debug = false } = {}) {
    push();
    // traînée de fumée
    noStroke();
    this.trail.forEach((point, i) => {
      const t = (i + 1) / this.trail.length;
      fill(200, 200, 210, 120 * t);
      circle(point.x, point.y, 2 + 5 * t);
    });
    // corps et flamme
    translate(this.pos.x, this.pos.y);
    rotate(this.heading());
    fill(255, 150, 40, 200);
    triangle(-this.r - 10 - Math.random() * 4, 0, -this.r, -2.5, -this.r, 2.5);
    stroke(30);
    strokeWeight(1);
    fill(235, 235, 240);
    rect(-this.r, -2, this.r * 2.2, 4, 2);
    noStroke();
    fill(220, 50, 40);
    triangle(this.r * 1.2, 0, this.r * 0.6, -2, this.r * 0.6, 2);
    pop();
    if (debug) this.showSeeker();
  }

  // mode debug : cône du chercheur et ligne vers la source poursuivie
  showSeeker() {
    push();
    noFill();
    stroke(255, 255, 0, 140);
    strokeWeight(1);
    const heading = this.heading();
    arc(this.pos.x, this.pos.y, this.seekerRange * 2, this.seekerRange * 2,
      heading - this.seekerAngle, heading + this.seekerAngle, PIE);
    if (this.lock) {
      stroke(255, 60, 60, 220);
      line(this.pos.x, this.pos.y, this.lock.pos.x, this.lock.pos.y);
    }
    pop();
  }
}
