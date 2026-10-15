// Gestionnaire des serpents : création (touche « t »), plafond, poids communs, avance et dessin.
// Les serpents ne se créent pas eux-mêmes. Au-delà de MAX_SNAKES, le plus ancien est retiré :
// le nombre de serpents (et donc de véhicules à tester pour la séparation) reste borné.
class SnakeGroup {
  static MAX_SNAKES = 12;

  // rng : retourne un nombre dans [0, 1[ (injecté pour les tests) ; bounds : { w, h } du canvas
  constructor(rng = Math.random, bounds = null) {
    this.rng = rng;
    this.bounds = bounds;
    this.snakes = [];
  }

  // nouveau serpent au design original. Par défaut taille, longueur et vitesse sont tirées dans
  // les limites de SnakeSkins.RANGES ; si settings.randomSizes est faux, ce sont les valeurs des
  // curseurs. settings.snakePattern impose le motif (« hasard » : tiré au hasard).
  add(x, y, settings) {
    const options = SnakeSkins.randomOptions(this.rng);
    if (settings.snakePattern && settings.snakePattern !== 'hasard') {
      options.skin = { ...options.skin, pattern: settings.snakePattern };
    }
    if (settings.randomSizes === false) {
      options.length = settings.snakeLength;
      options.size = settings.snakeSize;
      options.maxSpeed = settings.snakeSpeed;
    }
    const snake = new Snake(x, y, {
      ...options,
      followWeight: settings.followWeight,
      separateWeight: settings.separateWeight,
      wanderWeight: settings.wanderWeight,
      wanderRadius: settings.wanderRadius,
      avoidWeight: settings.avoidWeight,
      avoidConfig: Steering.avoidConfig(settings),
    });
    this.snakes.push(snake);
    if (this.snakes.length > SnakeGroup.MAX_SNAKES) this.snakes.shift();
    return snake;
  }

  // les curseurs de comportement règlent les poids de tous les serpents
  applySettings(settings) {
    for (const snake of this.snakes) {
      snake.followPathWeight = settings.followWeight;
      snake.separateWeight = settings.separateWeight;
      snake.wanderWeight = settings.wanderWeight;
      snake.wanderRadius = settings.wanderRadius;
      snake.avoidWeight = settings.avoidWeight;
      snake.avoidConfig = Steering.avoidConfig(settings);
    }
  }

  // les curseurs de taille, de longueur et de vitesse règlent tous les serpents
  applyDimensions(settings) {
    for (const snake of this.snakes) {
      snake.configure({ size: settings.snakeSize, length: settings.snakeLength, maxSpeed: settings.snakeSpeed });
    }
  }

  // path : le circuit, ou null en mode arène ; obstacles : cercles { pos, r } à contourner
  step(vehicles, path, obstacles = []) {
    for (const snake of this.snakes) snake.step(Crowd.forSnake(snake, vehicles, this.snakes), path, this.bounds, obstacles);
  }

  show(ctx, time) {
    for (const snake of this.snakes) snake.show(ctx, time);
  }

  showDebug(ctx, vehicles, obstacles = []) {
    for (const snake of this.snakes) snake.showDebug(ctx, Crowd.forSnake(snake, vehicles, this.snakes), obstacles);
  }
}
