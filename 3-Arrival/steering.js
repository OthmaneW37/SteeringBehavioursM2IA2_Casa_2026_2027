// Comportements de pilotage partagés par les entités de l'exemple (vehicle.js reste intact).
// Chaque fonction retourne une force : steering = vitesseDésirée - vitesse, limitée à maxForce.
// - flee : fuite de Reynolds. On inverse la vitesse DÉSIRÉE (et non la force finale de seek).
//   Un rayon optionnel limite la fuite : au-delà, aucune force (pas de fuite infinie).
// - stayInside : rester dans un rectangle. Près d'un bord, la vitesse désirée est « réfléchie »
//   vers l'intérieur. Le boundaries() fourni retourne la vitesse désirée au lieu d'une force.
// - separation : s'écarter des voisins proches, pondéré par l'inverse de la distance.
const Steering = (() => {
  const zero = () => createVector(0, 0);

  function steer(agent, desired) {
    desired.setMag(agent.maxSpeed);
    const force = p5.Vector.sub(desired, agent.vel);
    force.limit(agent.maxForce);
    return force;
  }

  function flee(agent, threat, radius = Infinity) {
    const away = p5.Vector.sub(agent.pos, threat);
    const distance = away.mag();
    if (distance >= radius) return zero();
    // exactement sur la menace : on s'enfuit dans une direction fixe plutôt que nulle part
    if (distance === 0) away.set(1, 0);
    return steer(agent, away);
  }

  function stayInside(agent, x, y, w, h, margin) {
    let desired = null;
    if (agent.pos.x < x + margin) desired = createVector(agent.maxSpeed, agent.vel.y);
    else if (agent.pos.x > x + w - margin) desired = createVector(-agent.maxSpeed, agent.vel.y);
    if (agent.pos.y < y + margin) desired = createVector(desired ? desired.x : agent.vel.x, agent.maxSpeed);
    else if (agent.pos.y > y + h - margin) desired = createVector(desired ? desired.x : agent.vel.x, -agent.maxSpeed);
    return desired ? steer(agent, desired) : zero();
  }

  function separation(agent, others, radius) {
    const sum = zero();
    let count = 0;
    for (const other of others) {
      if (other === agent) continue;
      const away = p5.Vector.sub(agent.pos, other.pos);
      const distance = away.mag();
      if (distance > 0 && distance < radius) {
        away.setMag(1 / distance);
        sum.add(away);
        count++;
      }
    }
    return count ? steer(agent, sum) : zero();
  }

  return { flee, stayInside, separation };
})();
