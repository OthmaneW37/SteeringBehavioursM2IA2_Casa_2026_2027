// Gestionnaire de la nourriture : apparition automatique (en nombre par seconde), dépôt au clic,
// plafond et recyclage des instances retirées (pas de création sans fin). Les entités Food ne
// se créent ni ne se suppriment elles-mêmes : tout passe par ce gestionnaire.
class FoodField {
  // plafond absolu, y compris pour les dépôts au clic
  static HARD_CAP = 40;
  static MARGIN = 40;

  constructor() {
    this.items = [];
    this.pool = [];
    this.accumulator = 0;
  }

  get count() {
    return this.items.length;
  }

  // crée (ou recycle) une nourriture ; au plafond, la plus ancienne posée est recyclée
  add(x, y, kind) {
    if (this.items.length >= FoodField.HARD_CAP) {
      const oldest = this.items.find(food => food.state === 'idle');
      if (!oldest) return null;
      this.remove(oldest);
    }
    const food = this.pool.length ? this.pool.pop().reset(x, y, kind) : new Food(x, y, kind);
    this.items.push(food);
    return food;
  }

  remove(food) {
    const index = this.items.indexOf(food);
    if (index < 0) return;
    this.items.splice(index, 1);
    this.pool.push(food);
  }

  // apparitions automatiques : rate par seconde tant que le nombre reste sous max
  spawn(dt, rate, max, w, h, rng) {
    if (rate <= 0 || this.items.length >= max) {
      this.accumulator = 0;
      return 0;
    }
    this.accumulator += rate * dt;
    let created = 0;
    while (this.accumulator >= 1 && this.items.length < max) {
      this.accumulator -= 1;
      const m = Math.min(FoodField.MARGIN, w / 2, h / 2);
      this.add(m + rng() * (w - 2 * m), m + rng() * (h - 2 * m), Food.randomKind(rng));
      created++;
    }
    if (this.items.length >= max) this.accumulator = 0;
    return created;
  }

  // retire les nourritures avalées ; retourne leur nombre
  collect() {
    const eaten = this.items.filter(food => food.done);
    for (const food of eaten) this.remove(food);
    return eaten.length;
  }

  // nourriture posée ou aspirée la plus proche d'un point (null s'il n'y en a pas)
  nearest(point) {
    let best = null;
    let bestDistance = Infinity;
    for (const food of this.items) {
      if (food.state === 'swallowed' || food.state === 'eaten') continue;
      const d = Math.hypot(food.pos.x - point.x, food.pos.y - point.y);
      if (d < bestDistance) {
        best = food;
        bestDistance = d;
      }
    }
    return best;
  }

  clear() {
    while (this.items.length) this.remove(this.items[this.items.length - 1]);
    this.accumulator = 0;
  }
}
