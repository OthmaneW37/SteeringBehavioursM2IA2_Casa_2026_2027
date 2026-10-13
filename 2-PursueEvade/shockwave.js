// Onde de choc d'une explosion : sous-classe de Vehicle immobile dont l'anneau grandit et
// s'estompe, avec un éclair blanc au centre qui disparaît plus vite que l'anneau.
class Shockwave extends Vehicle {
  constructor(x, y, maxRadius = 60, life = 0.6) {
    super(x, y);
    this.r = 1;
    this.maxRadius = maxRadius;
    this.life = life;
    this.age = 0;
  }

  get dead() {
    return this.age >= this.life;
  }

  // avancement de 0 à 1
  progress() {
    return Math.min(1, this.age / this.life);
  }

  // rayon de l'anneau : l'onde freine en s'étendant (sortie douce)
  radius() {
    const t = this.progress();
    return this.maxRadius * (1 - (1 - t) * (1 - t));
  }

  step(dt) {
    this.age += dt;
  }

  show() {
    const t = this.progress();
    push();
    // éclair central
    noStroke();
    fill(255, 240, 200, 230 * Math.max(0, 1 - t * 2.5));
    circle(this.pos.x, this.pos.y, this.maxRadius * 0.9 * (1 - t));
    // anneau
    noFill();
    stroke(255, 200, 120, 220 * (1 - t));
    strokeWeight(1 + 5 * (1 - t));
    circle(this.pos.x, this.pos.y, this.radius() * 2);
    pop();
  }
}
