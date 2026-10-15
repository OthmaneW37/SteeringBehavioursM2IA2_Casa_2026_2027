// Un anneau du corps du serpent. C'est un véhicule : il suit l'anneau (ou la tête) qui le précède
// avec Steering.arrive (comme les anneaux de 3-Arrival_correction) et s'écarte des autres
// véhicules avec le separate() fourni par vehicle.js.
// Réglage d'arrive : un anneau qui suit un leader en mouvement s'arrête à offset + un retard égal à
// (rayon de freinage - offset) × vitesse du leader / vitesse max de l'anneau. Avec offset = ½
// espacement, rayon = 2 espacements et un anneau 3 fois plus rapide que la tête, le retard vaut ½
// espacement à pleine vitesse : l'anneau reste donc à environ un espacement derrière son leader.
// Il est plus rapide et plus nerveux que la tête pour ne jamais se laisser distancer.
// (Vehicle.follow(path) existe déjà : la méthode de suivi de l'anneau précédent s'appelle chase.)
class SnakeRing extends Vehicle {
  static SPEED_FACTOR = 3;
  static OFFSET_RATIO = 0.5;
  static BRAKING_RATIO = 2;
  static MIN_SPEED = 3;
  static MAX_FORCE = 1;

  constructor(x, y, radius) {
    super(x, y, SnakeRing.MIN_SPEED, SnakeRing.MAX_FORCE);
    this.r = radius;
    this.vel.set(0, 0);
    // pas de traînée mémorisée derrière chaque anneau
    this.pathMaxLength = 0;
  }

  // vitesse maximale en fonction de celle de la tête
  tune(headSpeed) {
    this.maxSpeed = Math.max(SnakeRing.MIN_SPEED, headSpeed * SnakeRing.SPEED_FACTOR);
  }

  // force pour suivre le leader à environ `spacing` pixels derrière lui
  chase(leader, spacing) {
    return Steering.arrive(this, leader.pos, spacing * SnakeRing.OFFSET_RATIO, spacing * SnakeRing.BRAKING_RATIO);
  }
}
