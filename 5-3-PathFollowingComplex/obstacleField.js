// Gestionnaire des obstacles : création, plafond (le plus ancien est retiré), nombre réglé par le
// curseur, taille commune, et la liste plate de cercles que l'évitement doit contourner. Les
// obstacles ne se créent pas eux-mêmes. Ceux posés à la main (touche o) sont comptés dans le
// plafond mais le curseur d'effectif ne les retire pas.
class ObstacleField {
  static MAX_OBSTACLES = 30;
  static PLACEMENT_TRIES = 30;

  // rng : retourne un nombre dans [0, 1[ (injecté pour les tests)
  constructor(rng = Math.random) {
    this.rng = rng;
    this.obstacles = [];
  }

  // type : un nom d'Obstacle.TYPES ou « hasard » ; angle au hasard pour le mur
  add(x, y, type = 'hasard', size = 28, regular = false) {
    const kind = type === 'hasard' ? Obstacle.randomType(this.rng) : type;
    const obstacle = new Obstacle(x, y, kind, size, this.rng() * Math.PI);
    obstacle.regular = regular;
    this.obstacles.push(obstacle);
    if (this.obstacles.length > ObstacleField.MAX_OBSTACLES) this.obstacles.shift();
    return obstacle;
  }

  get regular() {
    return this.obstacles.filter(o => o.regular);
  }

  // cercles { pos, r } de tous les obstacles
  colliders() {
    return this.obstacles.flatMap(o => o.colliders());
  }

  // ajuste le nombre d'obstacles réglés par le curseur : placés au hasard dans le canvas, à l'écart
  // du bord et, si possible, des autres obstacles ; les derniers sont retirés si besoin
  resize(n, width, height, size, type = 'hasard', margin = 80) {
    const target = Math.min(n, ObstacleField.MAX_OBSTACLES);
    let regular = this.regular;
    while (regular.length < target) {
      let best = null;
      for (let i = 0; i < ObstacleField.PLACEMENT_TRIES; i++) {
        const x = margin + this.rng() * Math.max(1, width - 2 * margin);
        const y = margin + this.rng() * Math.max(1, height - 2 * margin);
        const candidate = new Obstacle(x, y, type === 'hasard' ? Obstacle.randomType(this.rng) : type, size, this.rng() * Math.PI);
        const free = this.obstacles.every(o => Math.hypot(o.pos.x - x, o.pos.y - y) > o.extent + candidate.extent);
        if (!best) best = candidate;
        if (free) { best = candidate; break; }
      }
      best.regular = true;
      this.obstacles.push(best);
      if (this.obstacles.length > ObstacleField.MAX_OBSTACLES) this.obstacles.shift();
      regular = this.regular;
    }
    for (let i = regular.length - 1; i >= target; i--) this.obstacles.splice(this.obstacles.indexOf(regular[i]), 1);
  }

  // taille commune des obstacles réglés par le curseur
  applySize(size) {
    for (const o of this.regular) o.size = size;
  }

  // retire l'obstacle (le plus récent) dont un cercle contient le point ; vrai si un obstacle a été retiré
  removeAt(x, y) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      if (this.obstacles[i].colliders().some(c => Math.hypot(c.pos.x - x, c.pos.y - y) <= c.r)) {
        this.obstacles.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  clear() {
    this.obstacles.length = 0;
  }

  show(ctx, time) {
    for (const o of this.obstacles) o.show(ctx, time);
  }

  showDebug(ctx) {
    for (const o of this.obstacles) o.showDebug(ctx);
  }
}
