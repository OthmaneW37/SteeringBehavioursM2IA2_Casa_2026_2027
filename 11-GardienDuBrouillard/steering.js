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
// - avoidZones : évitement des nappes de brume (obstacle avoidance) ; distanceToSegment : outil géométrique.
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

  /**
   * Évitement des nappes de brume (Reynolds, « obstacle avoidance », comme dans 6-ObstacleAvoidance) :
   * on regarde un point `lookAhead` px devant l'agent. Si ce point ou l'agent est dans une nappe
   * (agrandie d'une marge), la vitesse désirée part du centre de la nappe la plus proche vers ce point ;
   * force = désirée − vitesse, limitée à maxForce. Nulle si rien n'est sur le chemin.
   */
  function avoidZones(agent, zones, lookAhead = 70, margin = 12) {
    if (!zones || zones.length === 0) return createVector(0, 0);
    const dir = agent.vel.mag() > 0.05 ? agent.vel.copy().normalize() : createVector(0, 0);
    const ahead = p5.Vector.add(agent.pos, dir.mult(lookAhead));
    let closest = null, best = Infinity;
    for (const z of zones) {
      const r = z.radius + agent.r + margin;
      const dAhead = Math.hypot(ahead.x - z.pos.x, ahead.y - z.pos.y);
      const dHere = Math.hypot(agent.pos.x - z.pos.x, agent.pos.y - z.pos.y);
      const d = Math.min(dAhead, dHere);
      if (d < r && d < best) { best = d; closest = z; }
    }
    if (!closest) return createVector(0, 0);
    const desired = p5.Vector.sub(ahead, closest.pos);
    if (desired.mag() === 0) desired.x = 1;
    desired.setMag(agent.maxSpeed);
    const force = p5.Vector.sub(desired, agent.vel);
    force.limit(agent.maxForce);
    return force;
  }

  /** Distance du point p au segment [a, b] (ligne de charge du boss). */
  function distanceToSegment(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0;
    return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
  }

  return { flee, predict, evade, stayInside, keepDistancePoint, avoidZones, distanceToSegment };
})();
