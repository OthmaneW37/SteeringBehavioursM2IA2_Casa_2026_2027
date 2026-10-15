// Le repère de la souris : un véhicule qui rejoint le pointeur avec arrive(), très vite (grande
// vitesse et grande force), ce qui donne un curseur légèrement amorti. Les serpents visent ce
// véhicule et non directement les coordonnées de la souris.
class MouseTarget extends Vehicle {
  constructor(x, y) {
    super(x, y);
    this.maxSpeed = 80;
    this.maxForce = 10;
    this.rayonZoneDeFreinage = 120;
    this.r = 10;
    this.time = 0;
  }

  follow(pointer) {
    return this.arrive(pointer);
  }

  update(dt = 0) {
    super.update();
    this.time += dt;
  }

  show() {
    const pulse = 1 + 0.12 * Math.sin(this.time * 4);
    push();
    translate(this.pos.x, this.pos.y);
    noFill();
    stroke(255, 255, 255, 170);
    strokeWeight(1.5);
    circle(0, 0, this.r * 2.4 * pulse);
    stroke(255, 255, 255, 60);
    circle(0, 0, this.r * 4 * pulse);
    noStroke();
    fill(255, 255, 255, 220);
    circle(0, 0, 4);
    pop();
  }
}
