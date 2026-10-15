// Un anneau du corps du serpent. C'est un véhicule : il suit l'anneau (ou la tête) qui le
// précède avec le comportement arrive() fourni, en s'arrêtant à `spacing` pixels de lui
// (vehicle.js : vitesse désirée = map(distance, spacing, rayonZoneDeFreinage, 0, maxSpeed) ;
// plus près que spacing, la vitesse désirée devient négative et l'anneau recule).
// Il est plus rapide et plus nerveux que la tête pour ne jamais se laisser distancer.
class SnakeRing extends Vehicle {
  static SPEED_FACTOR = 1.8;
  static MIN_SPEED = 10;
  static MAX_FORCE = 2;

  constructor(x, y) {
    super(x, y);
    this.maxForce = SnakeRing.MAX_FORCE;
    this.maxSpeed = SnakeRing.MIN_SPEED;
  }

  // réglages hérités de la tête : vitesse, espacement (le freinage commence à 3 espacements)
  tune(headSpeed, spacing) {
    this.maxSpeed = Math.max(SnakeRing.MIN_SPEED, headSpeed * SnakeRing.SPEED_FACTOR);
    this.rayonZoneDeFreinage = Math.max(spacing * 3, spacing + 20);
  }

  // force pour suivre le point leader en restant à spacing pixels (arrive fourni)
  follow(leader, spacing) {
    return this.arrive(leader, spacing);
  }

  // Dessin direct sur le contexte 2D (déjà mis à l'échelle par p5) : un anneau est dessiné des
  // centaines de fois par image, les appels p5 (analyse des couleurs, push/pop) coûtent trop cher.
  // style : { diameter, fill, stroke, icon (image ou null) }
  show(style, ctx, angle) {
    const { x, y } = this.pos;
    const d = style.diameter;
    ctx.beginPath();
    ctx.arc(x, y, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, d * 0.07);
    ctx.strokeStyle = style.stroke;
    ctx.stroke();
    // reflet : donne du volume à l'anneau (lumière venant d'en haut à gauche)
    ctx.beginPath();
    ctx.arc(x - d * 0.12, y - d * 0.18, d * 0.21, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fill();
    if (style.icon) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      Skins.drawCentered(ctx, style.icon, d * 0.62);
      ctx.restore();
    }
  }
}
