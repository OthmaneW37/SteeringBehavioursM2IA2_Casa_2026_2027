// Leurre thermique (« flare ») : sous-classe de Vehicle lâchée par l'avion.
// Il garde la vitesse de l'avion au moment du largage, puis la perd (traînée) et reste donc
// derrière lui. Sa chaleur, que cherche le missile, décroît linéairement jusqu'à la fin de sa
// vie : un leurre frais est plus chaud que l'avion, un leurre qui s'éteint ne trompe plus.
// Les durées sont en secondes ; step(dt) avance d'un pas de simulation.
class Flare extends Vehicle {
  static DRAG = 0.975;          // facteur de vitesse conservé à chaque pas
  static TRAIL_LENGTH = 16;

  constructor(x, y, vx = 0, vy = 0) {
    super(x, y);
    this.r = 4;
    this.vel.set(vx, vy);
    this.maxSpeed = 40;          // la traînée ralentit le leurre, pas la limite de vitesse
    this.life = 3.5;             // secondes avant extinction
    this.baseHeat = 3;           // chaleur à la création (l'avion vaut 1)
    this.age = 0;
    this.trail = [];
  }

  get dead() {
    return this.age >= this.life;
  }

  // part de vie restante, de 1 (neuf) à 0 (éteint)
  fraction() {
    return Math.max(0, 1 - this.age / this.life);
  }

  // signal thermique vu par les missiles
  heat() {
    return this.baseHeat * this.fraction();
  }

  step(dt) {
    this.age += dt;
    this.trail.push({ x: this.pos.x, y: this.pos.y });
    if (this.trail.length > Flare.TRAIL_LENGTH) this.trail.shift();
    this.vel.mult(Flare.DRAG);
    this.update();
  }

  show() {
    const fraction = this.fraction();
    push();
    noStroke();
    // traînée de fumée
    this.trail.forEach((point, i) => {
      const t = (i + 1) / this.trail.length;
      fill(255, 170, 60, 90 * t * fraction);
      circle(point.x, point.y, 2 + 4 * t);
    });
    // halo puis cœur incandescent, qui vacillent et s'éteignent avec la chaleur
    const flicker = 0.8 + 0.2 * Math.sin(this.age * 60);
    fill(255, 140, 30, 70 * fraction);
    circle(this.pos.x, this.pos.y, this.r * 6 * flicker * (0.4 + 0.6 * fraction));
    fill(255, 220, 140, 255 * fraction);
    circle(this.pos.x, this.pos.y, this.r * 2 * flicker);
    fill(255, 255, 255, 255 * fraction);
    circle(this.pos.x, this.pos.y, this.r * 0.9);
    pop();
  }
}
