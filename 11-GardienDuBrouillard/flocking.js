// Comportements de groupe de Reynolds (boids) : séparation, alignement, cohésion. Trois règles distinctes,
// chacune calcule une force (désirée − vitesse, limitée à maxForce) à partir des voisins seulement :
// la perception est limitée au voisinage (`radius`), jamais à toute la meute.
//
// - neighbours  : voisins vivants à moins de `radius` px (l'agent lui-même exclu) ;
// - separation  : s'écarter des voisins trop proches, d'autant plus qu'ils sont près (poids 1 / distance) ;
// - alignment   : prendre la vitesse moyenne des voisins ;
// - cohesion    : `seek` du centre des voisins.
// Aucune de ces fonctions ne déplace l'agent : la combinaison (somme pondérée) est faite par l'entité.
const Flocking = (() => {
  function neighbours(agent, others, radius) {
    const out = [];
    for (const o of others) {
      if (o === agent || o.alive === false) continue;
      if (Math.hypot(o.pos.x - agent.pos.x, o.pos.y - agent.pos.y) <= radius) out.push(o);
    }
    return out;
  }

  function steer(agent, desired) {
    desired.setMag(agent.maxSpeed);
    const force = p5.Vector.sub(desired, agent.vel);
    force.limit(agent.maxForce);
    return force;
  }

  function separation(agent, near, radius) {
    const sum = createVector(0, 0);
    let count = 0;
    for (const o of near) {
      const away = p5.Vector.sub(agent.pos, o.pos);
      const d = away.mag();
      if (d >= radius) continue;
      if (d < 1e-9) away.set(1, 0);
      else away.div(d * d);   // direction × 1 / distance : les plus proches comptent le plus
      sum.add(away);
      count++;
    }
    if (count === 0 || sum.mag() === 0) return createVector(0, 0);
    return steer(agent, sum);
  }

  function alignment(agent, near) {
    if (near.length === 0) return createVector(0, 0);
    const sum = createVector(0, 0);
    for (const o of near) sum.add(o.vel);
    if (sum.mag() < 1e-9) return createVector(0, 0);
    return steer(agent, sum);
  }

  function cohesion(agent, near) {
    if (near.length === 0) return createVector(0, 0);
    const center = createVector(0, 0);
    for (const o of near) center.add(o.pos);
    center.div(near.length);
    if (Math.hypot(center.x - agent.pos.x, center.y - agent.pos.y) < 1e-9) return createVector(0, 0);
    return agent.seek(center);
  }

  return { neighbours, separation, alignment, cohesion };
})();
