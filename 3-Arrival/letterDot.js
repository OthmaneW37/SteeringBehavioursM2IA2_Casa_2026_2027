// Un point d'une lettre du menu (issu de font.textToPoints). C'est un véhicule : il rejoint sa
// place avec arrive(), fuit la souris et les têtes de serpent qui passent tout près (Steering.flee
// avec un rayon), puis revient se ranger. À la fermeture du menu, il s'éparpille en fuyant le
// centre de l'écran et s'efface. Un point immobile à sa place et que rien ne dérange « dort » :
// on ne recalcule pas ses forces (elles seraient nulles), ce qui allège beaucoup le menu.
class LetterDot extends Vehicle {
  constructor(x, y) {
    super(x, y);
    this.home = createVector(x, y);
    this.line = 0;
    this.maxSpeed = 9;
    this.maxForce = 0.8;
    this.rayonZoneDeFreinage = 80;
    this.r = 3;
  }

  // à sa place et immobile : aucune force à calculer tant que rien ne s'approche
  get resting() {
    return Math.abs(this.pos.x - this.home.x) < 0.05 && Math.abs(this.pos.y - this.home.y) < 0.05
      && Math.abs(this.vel.x) < 0.01 && Math.abs(this.vel.y) < 0.01;
  }

  // retour à sa place ; wave : décalage vertical (le mot survolé ondule)
  homeForce(wave = 0) {
    return this.arrive(createVector(this.home.x, this.home.y + wave));
  }

  fleeFrom(point, radius) {
    return Steering.flee(this, point, radius);
  }

  // ajoute le point au tracé en cours ; le menu remplit tous les points d'un mot d'un coup
  trace(ctx, size) {
    ctx.moveTo(this.pos.x + size / 2, this.pos.y);
    ctx.arc(this.pos.x, this.pos.y, size / 2, 0, Math.PI * 2);
  }
}
