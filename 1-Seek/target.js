class Target extends Vehicle {
  constructor(x, y) {
    super(x, y);
    this.r = 100;
    this.color = 'red';
    this.vel = p5.Vector.random2D().setMag(random(1, 6));
    this.normalHeading = this.vel.heading();
    this.appearanceElapsedMs = 0;
  }

  advanceAppearance(deltaMilliseconds) {
    const elapsed = Number(deltaMilliseconds);
    this.appearanceElapsedMs += Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    if (this.appearanceElapsedMs >= 1000) {
      this.appearanceElapsedMs %= 1000;
      this.normalHeading = random(-Math.PI, Math.PI);
      this.r = random(20, 50);
      this.color = color(random(255), random(255), random(255));
    }
  }

  applyNormalSteering() {
    this.normalHeading += random(-0.2, 0.2);
    const destination = this.pos.copy().add(createVector(
      Math.cos(this.normalHeading) * 100, Math.sin(this.normalHeading) * 100
    ));
    this.applyForce(super.seek(destination));
  }

  integrate() { super.update(); }

  update(deltaMilliseconds = 1000 / 60) {
    this.advanceAppearance(deltaMilliseconds);
    this.applyNormalSteering();
    this.integrate();
  }

  show() {
    push();
    fill(this.color);
    noStroke();
    circle(this.pos.x, this.pos.y, this.r * 2);
    pop();
  }
}
