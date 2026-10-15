// Comportements de pilotage indépendants (vehicle.js reste intact).
// vehicle.js fournit déjà follow(path) et separate(vehicles) ; il n'a pas de arrive(), que les
// anneaux du serpent de 3-Arrival_correction utilisent pour suivre l'anneau précédent.
// - arrive : même loi que l'arrive() de 3-Arrival_correction. Dans le rayon de freinage, la
//   vitesse désirée décroît linéairement de maxSpeed (au bord) à 0 (à `offset` pixels de la
//   cible) ; plus près que `offset`, elle devient négative et l'agent recule. Puis
//   steering = vitesseDésirée - vitesse, limitée à maxForce.
// - avoid : l'évitement d'obstacles de 6-ObstacleAvoidance (avoidCorrige), repris tel quel. Le
//   véhicule regarde devant lui : ahead = vitesse × AHEAD et ahead2 = ahead × AHEAD2_RATIO. Il
//   prend l'obstacle (cercle { pos, r }) dont le centre est le plus proche, mesure la distance de
//   ce centre aux deux bouts de vecteur, et s'il y a collision possible (distance < r de
//   l'obstacle + largeur de zone + rayon du véhicule), la vitesse désirée va du centre de
//   l'obstacle vers le bout le plus proche, à maxSpeed ; steering = désirée - vitesse, limitée.
//   Le vehicule.js de cet exemple n'a pas avoid() (et reste protégé) : l'algorithme est ici.
// - avoidRays : évitement amélioré, au choix. Au lieu de deux points devant lui, le véhicule lance
//   plusieurs RAYONS en éventail autour de son cap (castRays). Chaque rayon est testé contre le
//   cercle de chaque obstacle (agrandi de la zone et du rayon du véhicule, comme dans avoid) : le
//   point d'impact et la distance t prédisent la collision. Chaque rayon touché repousse, du centre
//   de l'obstacle vers son point d'impact, avec une urgence 1 - t / longueur (plus l'impact est
//   proche, plus la poussée est forte). Si le rayon central est touché, un pas de côté vers le
//   côté le plus dégagé évite de simplement freiner face à l'obstacle. Même fin que avoid :
//   steering = vitesse désirée - vitesse, limitée à maxForce.
// - flockAlign / flockCohesion / flockSeparation : les trois règles de boids de 7-Boids, reprises
//   telles quelles. Chaque règle ne regarde que les voisins à moins du rayon de perception : align
//   = moyenne de leurs vitesses ; cohésion = vers le centre de leurs positions (rayon DOUBLE, comme
//   dans 7-Boids) ; séparation = fuite pondérée par 1 / distance². Puis steering = vitesse désirée
//   (maxSpeed) - vitesse, limité à maxForce. On passe en paramètre la liste des voisins possibles
//   (« mates »). Seule différence : un voisin exactement à la même position (distance nulle) est
//   ignoré par la séparation, pour ne pas diviser par zéro.
// - flee : fuite de Reynolds (vitesse désirée inversée) avec un rayon : au-delà, aucune force.
const Steering = (() => {
  const AHEAD = 30;
  const AHEAD2_RATIO = 0.5;
  const RAY_MIN_LENGTH_FACTOR = 4; // longueur minimale d'un rayon : 4 rayons du véhicule
  const RAY_SIDE_SHORTEN = 0.4; // les rayons latéraux sont jusqu'à 40 % plus courts

  function arrive(agent, target, offset = 0, brakingRadius = 100) {
    const toTarget = p5.Vector.sub(target, agent.pos);
    const distance = toTarget.mag();
    const radius = Math.max(brakingRadius, offset + 1);
    let speed = agent.maxSpeed;
    if (distance < radius) speed = (agent.maxSpeed * (distance - offset)) / (radius - offset);
    const desired = toTarget.setMag(speed);
    const force = p5.Vector.sub(desired, agent.vel);
    force.limit(agent.maxForce);
    return force;
  }

  // stayInside : près d'un bord du rectangle, la vitesse désirée est « réfléchie » vers l'intérieur
  // (comme au billard) puis steering = désirée - vitesse, limitée à maxForce. Force nulle ailleurs.
  function stayInside(agent, x, y, w, h, margin) {
    let desired = null;
    if (agent.pos.x < x + margin) desired = createVector(agent.maxSpeed, agent.vel.y);
    else if (agent.pos.x > x + w - margin) desired = createVector(-agent.maxSpeed, agent.vel.y);
    if (agent.pos.y < y + margin) desired = createVector(desired ? desired.x : agent.vel.x, agent.maxSpeed);
    else if (agent.pos.y > y + h - margin) desired = createVector(desired ? desired.x : agent.vel.x, -agent.maxSpeed);
    if (!desired) return createVector(0, 0);
    desired.setMag(agent.maxSpeed);
    const force = p5.Vector.sub(desired, agent.vel);
    force.limit(agent.maxForce);
    return force;
  }

  function nearestObstacle(pos, obstacles) {
    let nearest;
    let smallest = 100000000;
    for (const o of obstacles) {
      const distance = p5.Vector.dist(pos, o.pos);
      if (distance < smallest) {
        smallest = distance;
        nearest = o;
      }
    }
    return nearest;
  }

  // zoneWidth : largeur de la zone d'évitement devant le véhicule (6 : r / 2)
  function avoid(agent, obstacles, zoneWidth = agent.r / 2) {
    const ahead = agent.vel.copy().mult(AHEAD);
    const ahead2 = ahead.copy().mult(AHEAD2_RATIO);
    const tip = agent.pos.copy().add(ahead);
    const tip2 = agent.pos.copy().add(ahead2);
    const obstacle = nearestObstacle(agent.pos, obstacles);
    if (obstacle === undefined) return createVector(0, 0);
    const distance1 = p5.Vector.dist(tip, obstacle.pos);
    const distance2 = p5.Vector.dist(tip2, obstacle.pos);
    const distance = Math.min(distance1, distance2);
    if (distance < obstacle.r + zoneWidth + agent.r) {
      const force = p5.Vector.sub(distance1 < distance2 ? tip : tip2, obstacle.pos);
      force.setMag(agent.maxSpeed);
      force.sub(agent.vel);
      force.limit(agent.maxForce);
      return force;
    }
    return createVector(0, 0);
  }

  // distance t le long du rayon (origine, direction unitaire, longueur) jusqu'au cercle, ou null
  function rayHit(origin, dir, length, center, radius) {
    const ox = center.x - origin.x;
    const oy = center.y - origin.y;
    const proj = ox * dir.x + oy * dir.y;
    const closestSq = ox * ox + oy * oy - proj * proj;
    const radiusSq = radius * radius;
    if (closestSq > radiusSq) return null;
    const half = Math.sqrt(radiusSq - closestSq);
    if (proj + half < 0) return null; // le cercle est derrière
    const t = Math.max(0, proj - half); // t = 0 : le véhicule est déjà dans le cercle agrandi
    return t <= length ? t : null;
  }

  // rayons : fan est le demi-angle de l'éventail en radians ; chaque rayon :
  // { offset, k (de -1 à 1), dir, length, hit: { t, obstacle, point } ou null, end }
  function castRays(agent, obstacles, { rays = 5, fan = 0.7, zoneWidth = agent.r / 2 } = {}) {
    const heading = agent.vel.mag() > 0 ? agent.vel.heading() : 0;
    const baseLength = Math.max(agent.vel.mag() * AHEAD, agent.r * RAY_MIN_LENGTH_FACTOR);
    const n = Math.max(1, Math.round(rays));
    const result = [];
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      const angle = heading + fan * k;
      const dir = createVector(Math.cos(angle), Math.sin(angle));
      const length = baseLength * (1 - RAY_SIDE_SHORTEN * Math.abs(k));
      let best = null;
      for (const o of obstacles) {
        const t = rayHit(agent.pos, dir, length, o.pos, o.r + zoneWidth + agent.r);
        if (t !== null && (best === null || t < best.t)) best = { t, obstacle: o };
      }
      const end = agent.pos.copy().add(dir.copy().mult(best ? best.t : length));
      result.push({ offset: fan * k, k, dir, length, end, hit: best ? { t: best.t, obstacle: best.obstacle, point: end } : null });
    }
    return result;
  }

  function avoidRays(agent, obstacles, config = {}) {
    const rays = castRays(agent, obstacles, config);
    if (!rays.some(ray => ray.hit)) return createVector(0, 0);
    const steer = createVector(0, 0);
    for (const ray of rays) {
      if (!ray.hit) continue;
      const away = p5.Vector.sub(ray.hit.point, ray.hit.obstacle.pos);
      if (away.mag() === 0) away.set(-ray.dir.x, -ray.dir.y);
      away.setMag(1 - ray.hit.t / ray.length);
      steer.add(away);
    }
    // rayon central touché : pas de côté vers le côté le plus dégagé
    const centre = rays.find(ray => Math.abs(ray.k) < 1e-9);
    if (centre && centre.hit) {
      const room = side => rays.filter(ray => ray.k * side > 0).reduce((sum, ray) => sum + (ray.hit ? ray.hit.t : ray.length), 0);
      const side = room(1) >= room(-1) ? 1 : -1;
      const lateral = createVector(-centre.dir.y, centre.dir.x).mult(side);
      lateral.setMag(1 - centre.hit.t / centre.length);
      steer.add(lateral);
    }
    steer.setMag(agent.maxSpeed);
    const force = p5.Vector.sub(steer, agent.vel);
    force.limit(agent.maxForce);
    return force;
  }

  // réglages (cases du menu) -> configuration d'évitement : { mode, rays, fan (radians) }
  function avoidConfig(settings) {
    return { mode: settings.avoidMode, rays: settings.avoidRays, fan: (settings.avoidFan * Math.PI) / 180 };
  }

  // l'évitement choisi : « rayons » (multi-rayons) ou, par défaut, l'algorithme de 6-ObstacleAvoidance
  function avoidWith(agent, obstacles, config = null) {
    return config && config.mode === 'rayons' ? avoidRays(agent, obstacles, config) : avoid(agent, obstacles);
  }

  function neighbours(agent, mates, radius) {
    return mates.filter(o => o !== agent && Math.hypot(agent.pos.x - o.pos.x, agent.pos.y - o.pos.y) < radius);
  }

  function finishFlock(agent, steering, total) {
    if (total > 0) {
      steering.div(total);
      steering.setMag(agent.maxSpeed);
      steering.sub(agent.vel);
      steering.limit(agent.maxForce);
    }
    return steering;
  }

  function flockAlign(agent, mates, radius) {
    const steering = createVector(0, 0);
    const near = neighbours(agent, mates, radius);
    for (const o of near) steering.add(o.vel);
    return finishFlock(agent, steering, near.length);
  }

  function flockCohesion(agent, mates, radius) {
    const steering = createVector(0, 0);
    const near = neighbours(agent, mates, 2 * radius);
    for (const o of near) steering.add(o.pos);
    if (near.length > 0) {
      steering.div(near.length);
      steering.sub(agent.pos);
      steering.setMag(agent.maxSpeed);
      steering.sub(agent.vel);
      steering.limit(agent.maxForce);
    }
    return steering;
  }

  function flockSeparation(agent, mates, radius) {
    const steering = createVector(0, 0);
    let total = 0;
    for (const o of neighbours(agent, mates, radius)) {
      const d = Math.hypot(agent.pos.x - o.pos.x, agent.pos.y - o.pos.y);
      if (d === 0) continue;
      const diff = p5.Vector.sub(agent.pos, o.pos);
      diff.div(d * d);
      steering.add(diff);
      total++;
    }
    return finishFlock(agent, steering, total);
  }

  // fuite : on inverse la vitesse DÉSIRÉE (pas la force de seek), puis steering = désirée - vitesse
  function flee(agent, threat, radius = Infinity) {
    const away = p5.Vector.sub(agent.pos, threat);
    const distance = away.mag();
    if (distance >= radius) return createVector(0, 0);
    if (distance === 0) away.set(1, 0);
    away.setMag(agent.maxSpeed);
    const force = p5.Vector.sub(away, agent.vel);
    force.limit(agent.maxForce);
    return force;
  }

  // réglages (curseurs du menu) -> configuration des boids
  function flockConfig(settings) {
    return { alignWeight: settings.flockAlign, cohesionWeight: settings.flockCohesion,
      separationWeight: settings.flockSeparation, radius: settings.flockRadius };
  }

  return { AHEAD, AHEAD2_RATIO, flockAlign, flockCohesion, flockSeparation, flee, flockConfig, arrive, stayInside, nearestObstacle, avoid, castRays, avoidRays, avoidConfig, avoidWith };
})();
