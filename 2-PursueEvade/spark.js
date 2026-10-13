// Étincelle ou débris d'une explosion : sous-classe de Vehicle qui part dans une direction,
// ralentit (traînée), rétrécit et s'estompe jusqu'à la fin de sa vie. Elle ne réapparaît pas
// de l'autre côté du canvas : un débris qui sort de l'écran disparaît.
class Spark extends Vehicle {
  // options : life (s), size (px), drag (facteur de vitesse conservé par pas), color [r, g, b]
  constructor(x, y, vx, vy, options = {}) {
    super(x, y);
    this.r = 2;
    this.vel.set(vx, vy);
    this.maxSpeed = 60;
    this.life = options.life ?? 0.8;
    this.size = options.size ?? 4;
    this.drag = options.drag ?? 0.93;
    this.color = options.color ?? [255, 180, 60];
    this.age = 0;
    this.trail = [];
  }

  get dead() {
    return this.age >= this.life;
  }

  // part de vie restante, de 1 à 0
  fraction() {
    return Math.max(0, 1 - this.age / this.life);
  }

  step(dt) {
    this.age += dt;
    this.trail.push({ x: this.pos.x, y: this.pos.y });
    if (this.trail.length > 6) this.trail.shift();
    this.vel.mult(this.drag);
    this.update();
  }

  show() {
    const fraction = this.fraction();
    const [red, green, blue] = this.color;
    push();
    noStroke();
    this.trail.forEach((point, i) => {
      const t = (i + 1) / this.trail.length;
      fill(red, green, blue, 110 * t * fraction);
      circle(point.x, point.y, this.size * t * fraction);
    });
    fill(red, green, blue, 255 * fraction);
    circle(this.pos.x, this.pos.y, this.size * (0.4 + 0.6 * fraction));
    pop();
  }
}
