// Comportements de pilotage partagés par le joueur et le boss (vehicle.js reste intact).
//
// - flee : fuite de Reynolds. On inverse la vitesse DÉSIRÉE (et non la force finale), puis on
//   recalcule la force : steering = désirée − vitesse, limitée à maxForce. Ce n'est pas −seek() :
//   inverser la force finale ajouterait 2 × vitesse (c'est ce que fait vehicle.js, qu'on ne modifie pas).
// - evade : fuite de la position FUTURE de la cible (position + vitesse × temps de prédiction).
// - stayInside : confinement dans l'arène (Reynolds, « containment ») : près d'un mur, la vitesse
//   désirée pointe vers l'intérieur ; force = désirée − vitesse, limitée à maxForce. Nulle ailleurs.
// - keepDistancePoint : point situé à `distance` de la cible, du côté de l'agent ; le boss y fait
//   `arrive` pour garder sa distance d'attaque.
//
// Toutes ces fonctions retournent une force ; aucune ne déplace l'entité.
const Steering = (() => {
  function flee(agent, threat) {
    const desired = p5.Vector.sub(agent.pos, threat);
    if (desired.mag() === 0) desired.x = 1; // menace exactement sur l'agent : direction arbitraire
    desired.setMag(agent.maxSpeed);
    const force = p5.Vector.sub(desired, agent.vel);
    force.limit(agent.maxForce);
    return force;
  }

  // Position prédite de la cible dans `seconds` secondes (la simulation avance à 60 pas par seconde)
  function predict(target, seconds) {
    const future = target.vel.copy();
    future.mult(seconds * 60);
    return p5.Vector.add(target.pos, future);
  }

  function evade(agent, target, seconds = 0.25) {
    return flee(agent, predict(target, seconds));
  }

  function stayInside(agent, arena, margin) {
    const b = arena.inner(agent.r);
    let dx = 0, dy = 0;
    if (agent.pos.x < b.left + margin) dx = 1;
    else if (agent.pos.x > b.right - margin) dx = -1;
    if (agent.pos.y < b.top + margin) dy = 1;
    else if (agent.pos.y > b.bottom - margin) dy = -1;
    if (dx === 0 && dy === 0) return createVector(0, 0);
    // On garde la composante de vitesse parallèle au mur, on pousse vers l'intérieur
    const desired = createVector(dx !== 0 ? dx * agent.maxSpeed : agent.vel.x, dy !== 0 ? dy * agent.maxSpeed : agent.vel.y);
    desired.setMag(agent.maxSpeed);
    const force = p5.Vector.sub(desired, agent.vel);
    force.limit(agent.maxForce);
    return force;
  }

  function keepDistancePoint(agent, target, distance) {
    const away = p5.Vector.sub(agent.pos, target);
    if (away.mag() === 0) away.x = 1;
    away.setMag(distance);
    return p5.Vector.add(target, away);
  }

  return { flee, predict, evade, stayInside, keepDistancePoint };
})();
