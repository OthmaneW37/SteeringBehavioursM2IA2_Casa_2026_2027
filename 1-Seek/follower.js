// Véhicule suiveur : poursuit la cible avec seek, ou la fuit avec flee en mode fuite.
// vehicle.js reste intact : flee est redéfini ici.
// Le canvas se comporte comme un tore : Vehicle.edges() fait réapparaître un véhicule de
// l'autre côté, donc le plus court chemin vers une cible (ou pour la fuir) peut traverser
// un bord. Le pilotage vise l'image la plus proche de la cible (nearestImage).
class Follower extends Vehicle {
  // distance de fuite par défaut ; PointTarget l'affiche en mode fuite
  static FLEE_RADIUS = 300;

  constructor(x, y) {
    super(x, y);
    // true : le véhicule fuit la cible au lieu de la suivre
    this.fleeing = false;
    // en fuite, au-delà de cette distance la menace est jugée loin et le véhicule freine
    // (sinon il courrait contre un bord, réapparaîtrait de l'autre côté et repartirait
    // indéfiniment vers le même bord)
    this.fleeRadius = Follower.FLEE_RADIUS;
  }

  // flee de Reynolds (vitesse désirée inversée, voir steering.js), à la place de celui de
  // vehicle.js qui inverse la force finale
  flee(target) {
    return Steering.flee(this, target);
  }

  // Image de la cible la plus proche de ce véhicule : edges() téléporte un véhicule de -r à
  // width + r, donc la période du tore est width + 2 * r (idem en hauteur).
  nearestImage(target) {
    return createVector(
      this.pos.x + Steering.wrapDelta(target.x - this.pos.x, width + 2 * this.r),
      this.pos.y + Steering.wrapDelta(target.y - this.pos.y, height + 2 * this.r));
  }

  // force qui ramène la vitesse vers zéro, limitée à maxForce
  brake() {
    const force = createVector(-this.vel.x, -this.vel.y);
    force.limit(this.maxForce);
    return force;
  }

  applyBehaviors(target) {
    const aim = this.nearestImage(target);
    if (!this.fleeing) {
      this.applyForce(this.seek(aim));
    } else if (Math.hypot(aim.x - this.pos.x, aim.y - this.pos.y) > this.fleeRadius) {
      this.applyForce(this.brake());
    } else {
      this.applyForce(this.flee(aim));
    }
  }
}
