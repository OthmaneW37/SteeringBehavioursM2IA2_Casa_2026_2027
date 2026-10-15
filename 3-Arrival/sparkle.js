// Étincelle lancée quand un serpent avale quelque chose. C'est un véhicule : il part avec une
// impulsion (force initiale), puis une force de frottement (opposée à la vitesse) le freine.
// Optionnellement, un texte (« +1 », « TURBO ! ») qui monte doucement. Durée de vie en secondes.
class Sparkle extends Vehicle {
  static DRAG = 0.08;
  static RISE = 0.06;

  constructor(x, y) {
    super(x, y);
    this.reset(x, y, 0, 0, '#ffffff', 0.6, null);
  }

  // (vx, vy) : impulsion de départ ; label : texte à afficher, ou null pour une étincelle
  reset(x, y, vx, vy, color, life, label) {
    this.pos.set(x, y);
    this.vel.set(0, 0);
    this.acc.set(0, 0);
    this.maxSpeed = 12;
    this.maxForce = 12;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.label = label;
    this.r = label ? 0 : 3;
    this.applyForce(createVector(vx, vy));
    return this;
  }

  get alive() {
    return this.life > 0;
  }

  // frottement, et légère montée pour les textes
  drag() {
    const force = this.vel.copy().mult(-Sparkle.DRAG);
    if (this.label) force.add(createVector(0, -Sparkle.RISE));
    return force;
  }

  update(dt) {
    this.applyForce(this.drag());
    super.update();
    this.life -= dt;
  }

  // dessin direct sur le contexte 2D : jusqu'à MAX_SPARKLES par image
  show(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    if (this.label) {
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.strokeText(this.label, this.pos.x, this.pos.y);
      ctx.fillText(this.label, this.pos.x, this.pos.y);
    } else {
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.r * (0.4 + alpha), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
