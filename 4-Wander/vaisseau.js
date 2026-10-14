class Vaisseau extends Vehicle {
  constructor(x, y, image) {
    super(x, y, image);

    // Poids réglables pour les deux comportements
    this.wanderWeight = 2;
    this.arriveWeight = 0.5;
  }

  // Cumule wander et arrive avec leurs poids respectifs
  applyBehaviors(target) {
    let wanderForce = this.wander();
    wanderForce.mult(this.wanderWeight);

    let arriveForce = this.arrive(target);
    arriveForce.mult(this.arriveWeight);

    this.applyForce(wanderForce);
    this.applyForce(arriveForce);
  }
}
