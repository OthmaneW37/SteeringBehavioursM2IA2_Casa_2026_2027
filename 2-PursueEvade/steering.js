// Pilotage partagé par les entités de l'exemple (vehicle.js reste intact).
// - flee : fuite de Reynolds. On inverse la vitesse DÉSIRÉE (et non la force finale), puis on
//   recalcule la force : steering = desired - vel, limitée à maxForce. Le flee de vehicle.js
//   inverse la force finale de seek, ce qui ajoute 2 * vel.
// - Le canvas est un tore : Vehicle.edges() téléporte une entité de -r à largeur + r. La
//   période est donc largeur + 2 * r ; le plus court chemin entre deux points peut traverser
//   un bord (shortestDelta).
// - interceptPoint : point visé pour intercepter une cible mobile. Contrairement à
//   Vehicle.pursue, qui dessine pendant le calcul et prédit toujours 20 images, la prédiction
//   dure distance / vitesse du poursuivant, bornée par maxLookahead.
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

  // vecteur le plus court de from vers to ; r est le rayon de l'entité qui se déplace
  function shortestDelta(from, to, w, h, r) {
    return {
      x: wrapDelta(to.x - from.x, w + 2 * r),
      y: wrapDelta(to.y - from.y, h + 2 * r),
    };
  }

  // distance sur le tore
  function distance(from, to, w, h, r) {
    const delta = shortestDelta(from, to, w, h, r);
    return Math.hypot(delta.x, delta.y);
  }

  // angle (radians, dans [0, PI]) entre la direction de vel et le vecteur delta
  function angleBetween(vel, delta) {
    const a = Math.hypot(vel.x, vel.y);
    const b = Math.hypot(delta.x, delta.y);
    if (a === 0 || b === 0) return 0;
    const cos = (vel.x * delta.x + vel.y * delta.y) / (a * b);
    return Math.acos(Math.min(1, Math.max(-1, cos)));
  }

  // Image de `point` la plus proche de l'agent, prolongée par la vitesse de la cible pendant le
  // temps d'interception : position à viser avec seek. target = { pos, vel }.
  function interceptPoint(agent, target, w, h, maxLookahead = 60) {
    const delta = shortestDelta(agent.pos, target.pos, w, h, agent.r);
    const distanceToTarget = Math.hypot(delta.x, delta.y);
    const speed = Math.max(agent.maxSpeed, 0.001);
    const lookahead = Math.min(distanceToTarget / speed, maxLookahead);
    return createVector(
      agent.pos.x + delta.x + target.vel.x * lookahead,
      agent.pos.y + delta.y + target.vel.y * lookahead);
  }

  return { flee, wrapDelta, shortestDelta, distance, angleBetween, interceptPoint };
})();
