// Comportements de pilotage partagés par les entités de l'exemple (vehicle.js reste intact).
// - flee : fuite de Reynolds. On inverse la vitesse DÉSIRÉE (et non la force finale), puis on
//   recalcule la force : steering = desired - vel, limitée à maxForce. Ce n'est pas -seek() :
//   inverser la force finale ajouterait 2 * vel.
// - wrapDelta : écart le plus court sur un tore. Vehicle.edges() fait réapparaître une entité
//   de l'autre côté du canvas, donc deux points proches à travers un bord sont voisins.
const Steering = (() => {
  function flee(agent, threat) {
    const desired = p5.Vector.sub(agent.pos, threat);
    desired.setMag(agent.maxSpeed);
    const force = p5.Vector.sub(desired, agent.vel);
    force.limit(agent.maxForce);
    return force;
  }

  // ramène delta dans [-période / 2, période / 2]
  function wrapDelta(delta, period) {
    if (delta > period / 2) return delta - period;
    if (delta < -period / 2) return delta + period;
    return delta;
  }

  return { flee, wrapDelta };
})();
