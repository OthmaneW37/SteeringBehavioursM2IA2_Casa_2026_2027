class Target extends Vehicle {
  constructor(x, y) {
    super(x, y);
    this.vel = p5.Vector.random2D();
    this.vel.mult(3 );

    // propriété de la target
    this.rayonDetection = 100;
  }

  show() {

    push();

    // On dessine un cercle de detection
    push();
    noFill();
    stroke("white");
    circle(this.pos.x, this.pos.y, this.rayonDetection * 2);
    pop();

    // on dessine la target
    stroke("white");
    strokeWeight(2);
    fill("pink");
    translate(this.pos.x, this.pos.y);
    circle(0, 0, this.r * 2);

    pop();
  }
}