// Cible : un point avec un cercle autour. C'est une Target (target.js, code fourni et
// inchangé) : elle hérite de son déplacement aléatoire et de son rayon qui change
// régulièrement. Elle redéfinit l'affichage et ajoute deux mouvements (setMotion) :
// - 'wander' : la cible se déplace seule, comme la Target fournie ; Vehicle.edges() (appelé
//   après update()) la fait réapparaître du côté opposé du canvas ;
// - 'cursor' : elle ne bouge plus d'elle-même, follow() la place sous le curseur.
// Le cercle a le rayon de la Target, qui décide de l'arrivée d'un véhicule. fixedRadius le
// fige (diamètre réglable) ; null laisse la Target fournie changer son rayon au hasard.
// zoneRadius > 0 ajoute un cercle pointillé : la distance de fuite des véhicules.
class PointTarget extends Target {
  static DOT_DIAMETER = 10;
  static MOTIONS = ['wander', 'cursor'];

  constructor(x, y) {
    super(x, y);
    this.autonomous = true;
    this.fixedRadius = null;
    this.zoneRadius = 0;
  }

  get motion() {
    return this.autonomous ? 'wander' : 'cursor';
  }

  setMotion(motion) {
    if (!PointTarget.MOTIONS.includes(motion)) {
      throw new RangeError(`Mouvement inconnu : ${motion}.`);
    }
    this.autonomous = motion === 'wander';
  }

  // flee de Reynolds (vitesse désirée inversée, voir steering.js) à la place de celui de
  // vehicle.js qui inverse la force finale ; les sous-classes (TargetFuyante) en héritent
  flee(threat) {
    return Steering.flee(this, threat);
  }

  update() {
    if (this.fixedRadius !== null) this.r = this.fixedRadius;
    if (this.autonomous) super.update();
  }

  // Place la cible sous le curseur, seulement en mode curseur et si le point est dans le canvas.
  follow(x, y, w, h) {
    if (this.autonomous || x < 0 || x > w || y < 0 || y > h) return false;
    this.pos.set(x, y);
    return true;
  }

  show() {
    push();
    noFill();
    if (this.zoneRadius > 0) {
      drawingContext.setLineDash([8, 8]);
      stroke(255, 160);
      strokeWeight(1.5);
      circle(this.pos.x, this.pos.y, this.zoneRadius * 2);
      drawingContext.setLineDash([]);
    }
    // cercle autour du point, avec un contour sombre pour rester lisible sur le dégradé
    stroke(0, 150);
    strokeWeight(4);
    circle(this.pos.x, this.pos.y, this.r * 2);
    stroke(255);
    strokeWeight(2);
    circle(this.pos.x, this.pos.y, this.r * 2);
    // point au centre
    stroke(0);
    strokeWeight(2);
    fill(255);
    circle(this.pos.x, this.pos.y, PointTarget.DOT_DIAMETER);
    pop();
  }
}
