// La « foule » que chaque véhicule doit éviter avec separate() : les véhicules ordinaires plus la
// tête et les anneaux de tous les serpents. Un serpent ne s'évite pas lui-même (ses anneaux sont
// retenus par arrive à distance fixe de leur voisin) : ses propres parties sont exclues de sa foule.
const Crowd = (() => {
  // tête et anneaux de tous les serpents, sauf ceux de `except`
  function snakeParts(snakes, except = null) {
    const parts = [];
    for (const snake of snakes) {
      if (snake === except) continue;
      parts.push(snake, ...snake.rings);
    }
    return parts;
  }

  // foule d'un serpent : véhicules + parties des autres serpents
  function forSnake(snake, vehicles, snakes) {
    return [...vehicles, ...snakeParts(snakes, snake)];
  }

  // foule des véhicules ordinaires : eux-mêmes + toutes les parties de serpents
  function forVehicles(vehicles, snakes) {
    return [...vehicles, ...snakeParts(snakes)];
  }

  return { snakeParts, forSnake, forVehicles };
})();
