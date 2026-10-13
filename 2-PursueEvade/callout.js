// Texte flottant qui explique ce qui vient de se passer (« ABATTU », « MISSILE LEURRÉ »…) :
// sous-classe de Vehicle qui monte doucement et s'estompe.
class Callout extends Vehicle {
  constructor(x, y, text, color = [255, 255, 255], life = 1.8) {
    super(x, y);
    this.r = 1;
    this.vel.set(0, -0.6);
    this.text = text;
    this.color = color;
    this.life = life;
    this.age = 0;
  }

  get dead() {
    return this.age >= this.life;
  }

  // opacité de 255 à 0 : le texte reste lisible les deux premiers tiers de sa vie
  alpha() {
    const t = this.age / this.life;
    return 255 * Math.min(1, Math.max(0, (1 - t) * 3));
  }

  step(dt) {
    this.age += dt;
    this.update();
  }

  show() {
    const [red, green, blue] = this.color;
    push();
    textAlign(CENTER, CENTER);
    textSize(14);
    textStyle(BOLD);
    noStroke();
    fill(0, this.alpha() * 0.6);
    text(this.text, this.pos.x + 1, this.pos.y + 1);
    fill(red, green, blue, this.alpha());
    text(this.text, this.pos.x, this.pos.y);
    pop();
  }
}
